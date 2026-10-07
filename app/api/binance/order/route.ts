import { binanceError, getBinanceConfig, signedBinanceRequest } from "@/lib/binance";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return Response.json({ error: "Cross-origin orders are not allowed" }, { status: 403 });

  const config = getBinanceConfig();
  if (!config.apiKey || !config.apiSecret) return Response.json({ error: "Binance credentials are not configured" }, { status: 503 });
  if (!config.tradingEnabled) return Response.json({ error: "Live trading is disabled. Set BINANCE_ENABLE_TRADING=true and restart." }, { status: 403 });

  try {
    const body = await request.json() as { symbol?: string; side?: string; type?: string; quantity?: number; quoteOrderQty?: number; price?: number };
    const symbol = body.symbol?.toUpperCase() ?? "";
    const side = body.side?.toUpperCase() ?? "";
    const type = body.type?.toUpperCase() ?? "";
    const quantity = Number(body.quantity);
    const quoteOrderQty = Number(body.quoteOrderQty);
    const price = Number(body.price);
    const marketBuyWithQuoteAmount = side === "BUY" && type === "MARKET" && Number.isFinite(quoteOrderQty) && quoteOrderQty > 0;
    const hasValidQuantity = Number.isFinite(quantity) && quantity > 0;
    if (!/^[A-Z0-9]{5,16}$/.test(symbol) || !["BUY", "SELL"].includes(side) || !["MARKET", "LIMIT"].includes(type) || (!marketBuyWithQuoteAmount && !hasValidQuantity)) {
      return Response.json({ error: "Invalid order parameters" }, { status: 400 });
    }
    if (type === "LIMIT" && (!Number.isFinite(price) || price <= 0)) return Response.json({ error: "A valid limit price is required" }, { status: 400 });

    const params: Record<string, string | number> = { symbol, side, type };
    if (marketBuyWithQuoteAmount) params.quoteOrderQty = quoteOrderQty;
    else params.quantity = quantity;
    if (type === "LIMIT") Object.assign(params, { price, timeInForce: "GTC" });
    const response = await signedBinanceRequest("/api/v3/order", params, "POST");
    if (!response.ok) return Response.json({ error: await binanceError(response) }, { status: response.status });
    const order = await response.json() as { orderId?: number; status?: string; executedQty?: string };
    return Response.json({ orderId: order.orderId, status: order.status, executedQty: order.executedQty });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to place order" }, { status: 502 });
  }
}
