import { binanceError, getBinanceConfig, signedBinanceRequest } from "@/lib/binance";

type BinanceTrade = {
  symbol: string;
  id: number;
  orderId: number;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
};

const DEFAULT_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX", "LINK", "ADA", "DOT", "NEAR", "LTC"];

export async function GET(request: Request) {
  const config = getBinanceConfig();
  if (!config.apiKey || !config.apiSecret) {
    return Response.json({ configured: false, error: "Binance credentials are not configured" }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const requested = (params.get("symbols") || DEFAULT_SYMBOLS.join(","))
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase().replace(/USDT$/, ""))
    .filter((symbol, index, values) => /^[A-Z0-9]{2,10}$/.test(symbol) && symbol !== "USDT" && values.indexOf(symbol) === index)
    .slice(0, 20);
  const limit = Math.min(Math.max(Number(params.get("limit")) || 1000, 1), 1000);
  if (!requested.length) return Response.json({ error: "No valid trade symbols supplied" }, { status: 400 });

  try {
    let firstError = "";
    const batches = await Promise.all(requested.map(async (asset) => {
      const response = await signedBinanceRequest("/api/v3/myTrades", { symbol: `${asset}USDT`, limit });
      if (!response.ok) {
        firstError ||= await binanceError(response);
        return [];
      }
      const rows = await response.json() as BinanceTrade[];
      return rows.map((trade) => ({
        id: `${trade.symbol}-${trade.id}`,
        tradeId: trade.id,
        orderId: trade.orderId,
        pair: `${trade.symbol.slice(0, -4)}/USDT`,
        symbol: trade.symbol.slice(0, -4),
        side: trade.isBuyer ? "Buy" as const : "Sell" as const,
        amount: Number(trade.qty),
        price: Number(trade.price),
        quoteAmount: Number(trade.quoteQty),
        commission: Number(trade.commission),
        commissionAsset: trade.commissionAsset,
        time: trade.time,
        maker: trade.isMaker,
      }));
    }));

    const trades = batches.flat().sort((a, b) => b.time - a.time);
    if (!trades.length && firstError) return Response.json({ configured: true, error: firstError }, { status: 502 });
    return Response.json({ configured: true, trades, symbols: requested, partialError: firstError || null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ configured: true, error: error instanceof Error ? error.message : "Unable to load Binance trade history" }, { status: 502 });
  }
}
