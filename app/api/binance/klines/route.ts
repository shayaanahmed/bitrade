import { getBinanceConfig } from "@/lib/binance";

const ALLOWED_INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const interval = url.searchParams.get("interval") || "1h";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 240, 20), 500);

  if (!/^[A-Z0-9]{5,16}$/.test(symbol) || !ALLOWED_INTERVALS.has(interval)) {
    return Response.json({ error: "Invalid market or interval" }, { status: 400 });
  }

  try {
    const { baseUrl } = getBinanceConfig();
    const response = await fetch(`${baseUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, { cache: "no-store" });
    if (!response.ok) return Response.json({ error: "Binance market data is unavailable" }, { status: response.status });
    const rows = await response.json() as Array<Array<number | string>>;
    const candles = rows.map((row) => ({
      openTime: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }));
    return Response.json({ candles, source: "binance" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to reach Binance market data" }, { status: 502 });
  }
}
