import { binanceError, getBinanceConfig, signedBinanceRequest } from "@/lib/binance";

type BinanceBalance = { asset: string; free: string; locked: string };
type Ticker = { symbol: string; price: string };
type BinanceTrade = {
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
};

type CostBasis = {
  averageBuyPrice: number | null;
  lastBuyPrice: number | null;
  costBasisCoverage: number;
  costBasisSource: "trade-history" | "partial-history" | "unavailable";
};

const STABLECOINS = new Set(["USDT", "USDC", "FDUSD", "TUSD"]);
const COST_BASIS_CACHE_MS = 5 * 60 * 1000;
const costBasisCache = new Map<string, { expiresAt: number; value: CostBasis }>();

async function loadCostBasis(asset: string, currentAmount: number): Promise<CostBasis> {
  const cached = costBasisCache.get(asset);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let result: CostBasis = { averageBuyPrice: null, lastBuyPrice: null, costBasisCoverage: 0, costBasisSource: "unavailable" };
  try {
    const response = await signedBinanceRequest("/api/v3/myTrades", { symbol: `${asset}USDT`, limit: 1000 });
    if (!response.ok) return result;
    const trades = await response.json() as BinanceTrade[];
    let heldQuantity = 0;
    let heldCost = 0;
    let lastBuyPrice: number | null = null;

    for (const trade of [...trades].sort((a, b) => a.time - b.time)) {
      const quantity = Number(trade.qty);
      const quoteQuantity = Number(trade.quoteQty) || Number(trade.price) * quantity;
      const commission = Number(trade.commission) || 0;
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      if (trade.isBuyer) {
        const acquired = Math.max(0, quantity - (trade.commissionAsset === asset ? commission : 0));
        const cost = quoteQuantity + (trade.commissionAsset === "USDT" ? commission : 0);
        heldQuantity += acquired;
        heldCost += cost;
        const executionPrice = Number(trade.price);
        if (Number.isFinite(executionPrice) && executionPrice > 0) lastBuyPrice = executionPrice;
      } else if (heldQuantity > 0) {
        const disposed = quantity + (trade.commissionAsset === asset ? commission : 0);
        const removed = Math.min(disposed, heldQuantity);
        heldCost -= heldCost / heldQuantity * removed;
        heldQuantity -= removed;
      }
    }

    if (heldQuantity > 0 && heldCost > 0) {
      const coverage = currentAmount > 0 ? Math.min(1, heldQuantity / currentAmount) : 0;
      result = {
        averageBuyPrice: heldCost / heldQuantity,
        lastBuyPrice,
        costBasisCoverage: coverage,
        costBasisSource: trades.length === 1000 || coverage < 0.95 ? "partial-history" : "trade-history",
      };
    }
  } catch {
    // Some wallet assets do not have a direct USDT market or accessible trade history.
  }

  costBasisCache.set(asset, { expiresAt: Date.now() + COST_BASIS_CACHE_MS, value: result });
  return result;
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const includeInsights = searchParams.get("includeInsights") === "true";
  const insightSymbol = (searchParams.get("symbol") || "").toUpperCase();
  const config = getBinanceConfig();
  if (!config.apiKey || !config.apiSecret) {
    return Response.json({ configured: false, tradingEnabled: false, error: "Add BINANCE_API_KEY and BINANCE_API_SECRET to .env, then restart the container." }, { status: 503 });
  }

  try {
    const [accountResponse, tickerResponse] = await Promise.all([
      signedBinanceRequest("/api/v3/account", {}),
      fetch(`${config.baseUrl}/api/v3/ticker/price`, { cache: "no-store" }),
    ]);
    if (!accountResponse.ok) return Response.json({ configured: true, tradingEnabled: false, error: await binanceError(accountResponse) }, { status: accountResponse.status });

    const account = await accountResponse.json() as { balances?: BinanceBalance[] };
    const tickers = tickerResponse.ok ? await tickerResponse.json() as Ticker[] : [];
    const prices = new Map(tickers.map((ticker) => [ticker.symbol, Number(ticker.price)]));
    const assets = (account.balances ?? [])
      .map((balance) => {
        const free = Number(balance.free);
        const locked = Number(balance.locked);
        const amount = free + locked;
        const price = STABLECOINS.has(balance.asset) ? 1 : prices.get(`${balance.asset}USDT`) ?? 0;
        return { symbol: balance.asset, amount, free, locked, price, value: amount * price };
      })
      .filter((asset) => asset.amount > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 30);

    if (!includeInsights) {
      return Response.json({ configured: true, tradingEnabled: config.tradingEnabled, assets }, { headers: { "Cache-Control": "no-store" } });
    }

    const insightCandidates = assets.filter((asset) => !STABLECOINS.has(asset.symbol) && asset.price > 0);
    const prioritized = insightCandidates.find((asset) => asset.symbol === insightSymbol);
    const insightTargets = (prioritized ? [prioritized, ...insightCandidates.filter((asset) => asset.symbol !== insightSymbol)] : insightCandidates).slice(0, 12);
    const basisEntries = await Promise.all(insightTargets.map(async (asset) => [asset.symbol, await loadCostBasis(asset.symbol, asset.amount)] as const));
    const basisBySymbol = new Map(basisEntries);
    const enrichedAssets = assets.map((asset) => {
      if (STABLECOINS.has(asset.symbol)) {
        return { ...asset, averageBuyPrice: 1, lastBuyPrice: 1, returnPercent: 0, unrealizedPnl: 0, costBasisCoverage: 1, costBasisSource: "stablecoin" };
      }
      const basis = basisBySymbol.get(asset.symbol);
      const averageBuyPrice = basis?.averageBuyPrice ?? null;
      const coveredAmount = asset.amount * (basis?.costBasisCoverage ?? 0);
      return {
        ...asset,
        averageBuyPrice,
        lastBuyPrice: basis?.lastBuyPrice ?? null,
        returnPercent: averageBuyPrice ? (asset.price - averageBuyPrice) / averageBuyPrice * 100 : null,
        unrealizedPnl: averageBuyPrice ? (asset.price - averageBuyPrice) * coveredAmount : null,
        costBasisCoverage: basis?.costBasisCoverage ?? 0,
        costBasisSource: basis?.costBasisSource ?? "unavailable",
      };
    });

    return Response.json({ configured: true, tradingEnabled: config.tradingEnabled, assets: enrichedAssets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ configured: true, tradingEnabled: false, error: error instanceof Error ? error.message : "Unable to load Binance account" }, { status: 502 });
  }
}
