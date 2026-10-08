import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { STRATEGY_CATALOG, type StrategyKey } from "../lib/analysisCatalog";
import { strategyConsensus, strategySignals, type SignalCandle } from "../lib/signalEngine";
import { DEFAULT_SIGNAL_CONFIG, normalizeSignalConfig, type SignalConfig, type SignalDelivery, type SignalSide, type SignalTimeframe } from "../lib/signalConfig";

const PORT = Math.max(1, Number(process.env.SIGNAL_SERVICE_PORT) || 3001);
const SCAN_INTERVAL_MS = Math.max(10_000, Number(process.env.SIGNAL_SCAN_INTERVAL_MS) || 30_000);
const RETRY_INTERVAL_MS = Math.max(30_000, Number(process.env.SIGNAL_RETRY_INTERVAL_MS) || 300_000);
const STATE_FILE = process.env.SIGNAL_STATE_FILE || ".data/signals.json";
const APP_URL = (process.env.TRADEPILOT_INTERNAL_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
const CHAT_ID_PATTERN = /^(?:-?\d+|@[A-Za-z][A-Za-z0-9_]{4,31})$/;
const BINANCE_INTERVAL: Record<SignalTimeframe, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };
const STRATEGY_SHORT: Record<StrategyKey, string> = {
  "profit-guard": "PG",
  "ema-cross": "EMA",
  "macd-trend": "MACD",
  "rsi-reversal": "RSI",
  "bollinger-breakout": "BB",
  "vwap-pullback": "VWAP",
  "triple-ma": "3MA",
};

type AccountAsset = {
  symbol: string;
  amount: number;
  averageBuyPrice?: number | null;
  lastBuyPrice?: number | null;
  lastBuyTime?: number | null;
};

type StoredState = {
  version: 1;
  initialized: boolean;
  config: SignalConfig;
  deliveries: SignalDelivery[];
  seenSignals: Record<string, string>;
  deliveredSignals: Record<string, string>;
  retryAfter: Record<string, number>;
  updatedAt: string | null;
};

const emptyState = (): StoredState => ({
  version: 1,
  initialized: false,
  config: DEFAULT_SIGNAL_CONFIG,
  deliveries: [],
  seenSignals: {},
  deliveredSignals: {},
  retryAfter: {},
  updatedAt: null,
});

let state = emptyState();
let scanning = false;
let lastScanAt: string | null = null;
let lastScanError: string | null = null;
let persistQueue = Promise.resolve();

function publicState() {
  return {
    configured: Boolean(TELEGRAM_TOKEN),
    initialized: state.initialized,
    config: state.config,
    deliveries: state.deliveries,
    scanner: {
      active: state.config.enabled && Boolean(TELEGRAM_TOKEN),
      scanning,
      intervalSeconds: SCAN_INTERVAL_MS / 1000,
      lastScanAt,
      lastError: lastScanError,
    },
    updatedAt: state.updatedAt,
  };
}

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(STATE_FILE, "utf8")) as Partial<StoredState>;
    const seenSignals = parsed.seenSignals && typeof parsed.seenSignals === "object" ? parsed.seenSignals : {};
    state = {
      version: 1,
      initialized: parsed.initialized === true,
      config: normalizeSignalConfig(parsed.config),
      deliveries: Array.isArray(parsed.deliveries) ? parsed.deliveries.slice(0, 100) : [],
      seenSignals,
      deliveredSignals: parsed.deliveredSignals && typeof parsed.deliveredSignals === "object" ? parsed.deliveredSignals : { ...seenSignals },
      retryAfter: parsed.retryAfter && typeof parsed.retryAfter === "object" ? parsed.retryAfter : {},
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Unable to load signal state", error);
  }
}

function persistState() {
  const snapshot = JSON.stringify(state, null, 2);
  persistQueue = persistQueue.then(async () => {
    await mkdir(dirname(STATE_FILE), { recursive: true });
    const temporary = `${STATE_FILE}.tmp`;
    await writeFile(temporary, snapshot, { mode: 0o600 });
    await rename(temporary, STATE_FILE);
  }).catch((error) => console.error("Unable to persist signal state", error));
  return persistQueue;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function sendTelegram(symbol: string, timeframe: SignalTimeframe, side: SignalSide, candle: SignalCandle, strategy: string, reason: string) {
  if (!TELEGRAM_TOKEN) throw new Error("Telegram bot token is not configured");
  const icon = side === "BUY" ? "🟢" : "🔴";
  const price = candle.close < 1 ? candle.close.toFixed(6) : candle.close.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const confirmedAt = new Date(candle.openTime).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const text = `${icon} <b>${side} ${symbol}/USDT</b>\n\nPrice: <code>$${price}</code>\nTimeframe: <b>${timeframe}</b>\nStrategy: ${escapeHtml(strategy)}${reason ? `\nTrigger: ${escapeHtml(reason.slice(0, 160))}` : ""}\nConfirmed: ${confirmedAt}\n\n<i>Decision support only — not financial advice.</i>`;
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: state.config.chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json() as { ok?: boolean; description?: string; result?: { message_id?: number } };
  if (!response.ok || !payload.ok) throw new Error(payload.description || "Telegram rejected the message");
  return payload.result?.message_id;
}

function addDelivery(delivery: SignalDelivery) {
  state.deliveries = [delivery, ...state.deliveries].slice(0, 100);
}

async function handleEvent(scope: string, eventId: string, symbol: string, timeframe: SignalTimeframe, side: SignalSide, candle: SignalCandle, strategy: string, reason: string, isLatestConfirmed: boolean) {
  const previous = state.seenSignals[scope];
  if (previous === undefined) {
    state.seenSignals[scope] = eventId;
    state.deliveredSignals[scope] = eventId;
    return;
  }

  const isNew = previous !== eventId;
  if (isNew) state.seenSignals[scope] = eventId;
  if ((!isNew && state.deliveredSignals[scope] === eventId) || !state.config.sides.includes(side)) return;
  if (isNew && !isLatestConfirmed) {
    state.deliveredSignals[scope] = eventId;
    return;
  }
  if ((state.retryAfter[scope] ?? 0) > Date.now()) return;

  const deliveryId = `${scope}:${eventId}:${Date.now()}`;
  try {
    const messageId = await sendTelegram(symbol, timeframe, side, candle, strategy, reason);
    state.deliveredSignals[scope] = eventId;
    delete state.retryAfter[scope];
    addDelivery({ id: deliveryId, sentAt: new Date().toISOString(), symbol, timeframe, side, price: candle.close, strategy, status: "sent", detail: messageId ? `Telegram message ${messageId}` : undefined });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Telegram delivery failed";
    state.retryAfter[scope] = Date.now() + RETRY_INTERVAL_MS;
    addDelivery({ id: deliveryId, sentAt: new Date().toISOString(), symbol, timeframe, side, price: candle.close, strategy, status: "failed", detail });
  }
}

async function fetchJson<T>(path: string) {
  const response = await fetch(`${APP_URL}${path}`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `TradePilot returned ${response.status}`);
  return payload;
}

async function inspectMarket(symbol: string, timeframe: SignalTimeframe, position?: AccountAsset) {
  const payload = await fetchJson<{ candles?: SignalCandle[] }>(`/api/binance/klines?symbol=${symbol}USDT&interval=${BINANCE_INTERVAL[timeframe]}&limit=240`);
  if (!payload.candles || payload.candles.length < 3) return;
  const confirmedCandles = payload.candles.slice(0, -1);
  const latestIndex = confirmedCandles.length - 1;
  const context = {
    entryPrice: position?.averageBuyPrice && position.averageBuyPrice > 0 ? position.averageBuyPrice : position?.lastBuyPrice,
    entryTime: position?.lastBuyTime,
    minProfitPercent: state.config.minProfitPercent,
    trailingPullbackPercent: state.config.trailingPullbackPercent,
  };
  const evaluations = state.config.strategies.map((strategy) => ({ strategy, result: strategySignals(strategy, confirmedCandles, context) }));

  if (state.config.strategyMode === "consensus") {
    const consensus = strategyConsensus(evaluations, state.config.consensusMinimum);
    const scope = `${symbol}:${timeframe}:consensus:${state.config.strategies.join(",")}`;
    if (consensus.signal === "HOLD" || consensus.eventIndex < 0) {
      if (!(scope in state.seenSignals)) state.seenSignals[scope] = "NONE";
      return;
    }
    const side: SignalSide = consensus.signal;
    const candle = confirmedCandles[consensus.eventIndex];
    const voterSignature = consensus.voters.map((item) => {
      const index = side === "BUY" ? item.result.buy : item.result.sell;
      return `${item.strategy}:${confirmedCandles[index]?.openTime ?? 0}`;
    }).sort().join("|");
    const labels = consensus.voters.map((item) => STRATEGY_SHORT[item.strategy]).join(" + ");
    await handleEvent(scope, `${side}:${voterSignature}`, symbol, timeframe, side, candle, `Consensus ${consensus.voters.length}/${evaluations.length}: ${labels}`, `${consensus.voters.length} of ${evaluations.length} selected strategies agree`, consensus.eventIndex === latestIndex);
    return;
  }

  await Promise.all(evaluations.map(async ({ strategy, result }) => {
    const scope = `${symbol}:${timeframe}:${strategy}`;
    const index = Math.max(result.buy, result.sell);
    if (index < 0 || result.signal === "HOLD") {
      if (!(scope in state.seenSignals)) state.seenSignals[scope] = "NONE";
      return;
    }
    const side: SignalSide = result.signal;
    const candle = confirmedCandles[index];
    const strategyName = STRATEGY_CATALOG.find((item) => item.key === strategy)?.name ?? strategy;
    await handleEvent(scope, `${side}:${candle.openTime}`, symbol, timeframe, side, candle, strategyName, result.reason, index === latestIndex);
  }));
}

async function scan() {
  if (scanning || !state.initialized || !state.config.enabled || !TELEGRAM_TOKEN || !state.config.chatId) return;
  scanning = true;
  lastScanError = null;
  try {
    let positions = new Map<string, AccountAsset>();
    if (state.config.strategies.includes("profit-guard")) {
      try {
        const symbols = encodeURIComponent(state.config.markets.join(","));
        const account = await fetchJson<{ assets?: AccountAsset[] }>(`/api/binance/account?includeInsights=true&symbols=${symbols}`);
        positions = new Map((account.assets ?? []).filter((asset) => asset.amount > 0).map((asset) => [asset.symbol, asset]));
      } catch (error) {
        lastScanError = `Profit Guard positions unavailable: ${error instanceof Error ? error.message : "unknown error"}`;
      }
    }
    const results = await Promise.allSettled(state.config.markets.flatMap((symbol) => state.config.timeframes.map((timeframe) => inspectMarket(symbol, timeframe, positions.get(symbol)))));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) lastScanError = `${failures.length} market scan${failures.length === 1 ? "" : "s"} failed: ${failures[0].reason instanceof Error ? failures[0].reason.message : String(failures[0].reason)}`;
  } catch (error) {
    lastScanError = error instanceof Error ? error.message : "Signal scan failed";
  } finally {
    lastScanAt = new Date().toISOString();
    state.updatedAt = lastScanAt;
    scanning = false;
    await persistState();
  }
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.reduce((total, chunk) => total + chunk.length, 0) > 64 * 1024) throw new Error("Request body is too large");
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/state")) {
      json(response, 200, publicState());
      return;
    }
    if (request.method === "PUT" && url.pathname === "/config") {
      const config = normalizeSignalConfig(await readBody(request));
      if (config.enabled && !CHAT_ID_PATTERN.test(config.chatId)) {
        json(response, 400, { error: "Enter a valid Telegram chat ID or @channel username before enabling alerts" });
        return;
      }
      if (config.enabled && (!config.strategies.length || !config.markets.length || !config.timeframes.length || !config.sides.length)) {
        json(response, 400, { error: "Select at least one strategy, market, timeframe, and direction" });
        return;
      }
      state.config = config;
      state.initialized = true;
      state.updatedAt = new Date().toISOString();
      await persistState();
      json(response, 200, publicState());
      setTimeout(() => void scan(), 0);
      return;
    }
    json(response, 404, { error: "Not found" });
  } catch (error) {
    json(response, 400, { error: error instanceof Error ? error.message : "Invalid request" });
  }
});

await loadState();
server.listen(PORT, "0.0.0.0", () => {
  console.log(`TradePilot signal scanner listening on ${PORT}; state: ${STATE_FILE}`);
  void scan();
});
setInterval(() => void scan(), SCAN_INTERVAL_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
