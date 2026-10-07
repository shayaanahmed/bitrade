type BinanceParams = Record<string, string | number>;

export function getBinanceConfig() {
  return {
    apiKey: process.env.BINANCE_API_KEY?.trim() ?? "",
    apiSecret: process.env.BINANCE_API_SECRET?.trim() ?? "",
    baseUrl: (process.env.BINANCE_BASE_URL?.trim() || "https://api.binance.com").replace(/\/$/, ""),
    tradingEnabled: process.env.BINANCE_ENABLE_TRADING === "true",
  };
}

async function hmacSha256(value: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signedBinanceRequest(path: string, params: BinanceParams, method: "GET" | "POST" = "GET") {
  const config = getBinanceConfig();
  if (!config.apiKey || !config.apiSecret) throw new Error("Binance credentials are not configured");

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, recvWindow: 5000, timestamp: Date.now() })) query.set(key, String(value));
  const signature = await hmacSha256(query.toString(), config.apiSecret);
  query.set("signature", signature);

  return fetch(`${config.baseUrl}${path}?${query.toString()}`, {
    method,
    headers: { "X-MBX-APIKEY": config.apiKey },
    cache: "no-store",
  });
}

export async function binanceError(response: Response) {
  try {
    const payload = await response.json() as { msg?: string; code?: number };
    return payload.msg || `Binance request failed (${payload.code ?? response.status})`;
  } catch {
    return `Binance request failed (${response.status})`;
  }
}
