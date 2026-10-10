import type { Candle, DataQualityReport, DatasetManifest, MarketType, Timeframe } from "./contracts";
import { stableHash } from "./math";
import { parquetReadObjects } from "hyparquet";

export const TIMEFRAME_MILLISECONDS: Record<Timeframe, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };
const BINANCE_INTERVAL: Record<Timeframe, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d" };

export interface ProviderRequest {
  symbol: string;
  timeframe: Timeframe;
  start: number;
  end: number;
  marketType: MarketType;
}

export interface DataProviderPlugin {
  id: string;
  name: string;
  version: string;
  interfaceVersion: "1.0";
  description: string;
  markets: MarketType[];
  credentialEnvironmentVariables: string[];
  canonicalizeSymbol(symbol: string): { canonical: string; provider: string };
  fetch(request: ProviderRequest): Promise<Candle[]>;
}

function binanceProvider(id: string, name: string, baseUrl: string, marketType: "spot" | "futures"): DataProviderPlugin {
  return {
    id, name, version: "1.0.0", interfaceVersion: "1.0", description: `Public completed-candle ingestion from ${name}.`, markets: [marketType], credentialEnvironmentVariables: [],
    canonicalizeSymbol(symbol) { const normalized = symbol.toUpperCase().replace(/[-/_]/g, ""); const quote = ["USDT", "USDC", "BTC", "ETH"].find((item) => normalized.endsWith(item)); if (!quote) throw new Error(`Unsupported Binance symbol: ${symbol}`); return { canonical: `${normalized.slice(0, -quote.length)}/${quote}`, provider: normalized }; },
    async fetch(request) {
      const { canonical, provider } = this.canonicalizeSymbol(request.symbol); const output: Candle[] = []; let cursor = request.start; const interval = TIMEFRAME_MILLISECONDS[request.timeframe];
      while (cursor <= request.end) {
        const query = new URLSearchParams({ symbol: provider, interval: BINANCE_INTERVAL[request.timeframe], startTime: String(cursor), endTime: String(request.end), limit: "1000" });
        const response = await fetch(`${baseUrl}?${query}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
        const rows = await response.json() as Array<[number, string, string, string, string, string, number, ...unknown[]]>;
        if (!Array.isArray(rows)) throw new Error(`${name} returned an invalid candle response`);
        for (const row of rows) output.push({ timestamp: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]), symbol: canonical, timeframe: request.timeframe, complete: Number(row[6]) < Date.now() });
        if (rows.length < 1000) break;
        const next = Number(rows.at(-1)?.[0] ?? cursor) + interval; if (next <= cursor) break; cursor = next;
      }
      return normalizeCandles(output).filter((candle) => candle.complete && candle.timestamp >= request.start && candle.timestamp <= request.end);
    },
  };
}

export const BINANCE_SPOT_PROVIDER = binanceProvider("binance-spot", "Binance Spot", "https://api.binance.com/api/v3/klines", "spot");
export const BINANCE_USDM_PROVIDER = binanceProvider("binance-usdm", "Binance USD-M Futures", "https://fapi.binance.com/fapi/v1/klines", "futures");

export const ALPHA_VANTAGE_COMMODITY_PROVIDER: DataProviderPlugin = {
  id: "alpha-vantage-commodities", name: "Alpha Vantage Commodities", version: "1.0.0", interfaceVersion: "1.0", description: "Documented Alpha Vantage commodity time-series API (API key required).", markets: ["commodity"], credentialEnvironmentVariables: ["ALPHA_VANTAGE_API_KEY"],
  canonicalizeSymbol(symbol) { const provider = symbol.trim().toUpperCase().replace(/[^A-Z_]/g, ""); if (!provider) throw new Error("Commodity function is required"); return { canonical: `COMMODITY/${provider}`, provider }; },
  async fetch(request) {
    if (request.timeframe !== "1d") throw new Error("Alpha Vantage commodity history supports the 1d timeframe");
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY?.trim(); if (!apiKey) throw new Error("ALPHA_VANTAGE_API_KEY is not configured"); const { canonical, provider } = this.canonicalizeSymbol(request.symbol);
    const query = new URLSearchParams({ function: provider, interval: "daily", apikey: apiKey }); const response = await fetch(`https://www.alphavantage.co/query?${query}`, { signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`Alpha Vantage returned HTTP ${response.status}`);
    const payload = await response.json() as { data?: Array<{ date: string; value: string }>; Note?: string; Information?: string; "Error Message"?: string }; if (!payload.data) throw new Error(payload["Error Message"] || payload.Note || payload.Information || "Alpha Vantage returned no commodity data");
    return normalizeCandles(payload.data.flatMap((row) => { const timestamp = Date.parse(`${row.date}T00:00:00Z`); const close = Number(row.value); if (!Number.isFinite(timestamp) || !Number.isFinite(close) || timestamp < request.start || timestamp > request.end) return []; return [{ timestamp, open: close, high: close, low: close, close, volume: 0, symbol: canonical, timeframe: "1d" as const, complete: timestamp + TIMEFRAME_MILLISECONDS["1d"] < Date.now() }]; }));
  },
};

export function parseCsvCandles(csv: string, metadata: { symbol: string; timeframe: Timeframe }): Candle[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim()); if (lines.length < 2) throw new Error("CSV requires a header and at least one data row");
  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase()); const required = ["timestamp", "open", "high", "low", "close", "volume"]; for (const column of required) if (!headers.includes(column)) throw new Error(`CSV is missing required column: ${column}`);
  return normalizeCandles(lines.slice(1).map((line, rowIndex) => { const fields = line.split(",").map((value) => value.trim()); const read = (column: string) => fields[headers.indexOf(column)]; const rawTimestamp = read("timestamp"); const timestamp = /^\d+$/.test(rawTimestamp) ? Number(rawTimestamp) : Date.parse(rawTimestamp); const values = ["open", "high", "low", "close", "volume"].map((column) => Number(read(column))); if (!Number.isFinite(timestamp) || values.some((value) => !Number.isFinite(value))) throw new Error(`CSV row ${rowIndex + 2} contains invalid numeric data`); return { timestamp, open: values[0], high: values[1], low: values[2], close: values[3], volume: values[4], symbol: metadata.symbol, timeframe: metadata.timeframe, complete: true }; }));
}

export async function parseParquetCandles(buffer: ArrayBuffer, metadata: { symbol: string; timeframe: Timeframe }): Promise<Candle[]> {
  const bytes = new Uint8Array(buffer); if (bytes.length < 8 || new TextDecoder().decode(bytes.slice(0, 4)) !== "PAR1" || new TextDecoder().decode(bytes.slice(-4)) !== "PAR1") throw new Error("Invalid Apache Parquet magic bytes");
  const rows = await parquetReadObjects({ file: buffer }) as Record<string, unknown>[]; if (!rows.length) throw new Error("Parquet file contains no rows");
  return normalizeCandles(rows.map((row, index) => { const rawTimestamp = row.timestamp; const timestamp = rawTimestamp instanceof Date ? rawTimestamp.getTime() : typeof rawTimestamp === "bigint" ? Number(rawTimestamp) : typeof rawTimestamp === "string" && !/^\d+$/.test(rawTimestamp) ? Date.parse(rawTimestamp) : Number(rawTimestamp); const read = (column: string) => Number(row[column]); const open = read("open"); const high = read("high"); const low = read("low"); const close = read("close"); const volume = read("volume"); if (![timestamp, open, high, low, close, volume].every(Number.isFinite)) throw new Error(`Parquet row ${index + 1} does not match the canonical timestamp/OHLCV schema`); return { timestamp, open, high, low, close, volume, symbol: metadata.symbol, timeframe: metadata.timeframe, complete: row.complete === undefined ? true : Boolean(row.complete) }; }));
}

export const IMPORT_PROVIDER_DESCRIPTORS = [
  { id: "generic-csv", name: "Generic CSV Import", version: "1.0.0", interfaceVersion: "1.0", description: "Strict UTF-8 CSV import with canonical timestamp, OHLCV, gap, duplicate, and boundary validation.", markets: ["spot", "futures", "commodity"] },
  { id: "generic-parquet", name: "Generic Parquet Import", version: "1.0.0", interfaceVersion: "1.0", description: "Apache Parquet import through the platform artifact ingestion endpoint with the canonical candle schema.", markets: ["spot", "futures", "commodity"] },
] as const;

export const DATA_PROVIDER_PLUGINS = [BINANCE_SPOT_PROVIDER, BINANCE_USDM_PROVIDER, ALPHA_VANTAGE_COMMODITY_PROVIDER];
export const dataProviderRegistry = new Map(DATA_PROVIDER_PLUGINS.map((plugin) => [plugin.id, plugin]));

export function normalizeCandles(candles: readonly Candle[]) {
  return [...candles].map((candle) => ({ ...candle, timestamp: Math.trunc(candle.timestamp), symbol: candle.symbol.toUpperCase(), open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close), volume: Number(candle.volume) })).sort((a, b) => a.timestamp - b.timestamp);
}

export function validateCandles(candles: readonly Candle[], timeframe: Timeframe): DataQualityReport {
  const interval = TIMEFRAME_MILLISECONDS[timeframe]; const gaps: DataQualityReport["gaps"] = []; const duplicates: number[] = []; const invalidOhlc: number[] = []; const incomplete: number[] = []; const outliers: DataQualityReport["outliers"] = []; const seen = new Set<number>();
  candles.forEach((candle, index) => { if (seen.has(candle.timestamp)) duplicates.push(candle.timestamp); seen.add(candle.timestamp); if (candle.timestamp % interval !== 0 || ![candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite) || candle.low > Math.min(candle.open, candle.close) || candle.high < Math.max(candle.open, candle.close) || candle.low < 0 || candle.volume < 0) invalidOhlc.push(candle.timestamp); if (!candle.complete) incomplete.push(candle.timestamp); if (index > 0) { const delta = candle.timestamp - candles[index - 1].timestamp; if (delta > interval) gaps.push({ after: candles[index - 1].timestamp, before: candle.timestamp, missingBars: Math.round(delta / interval) - 1 }); const change = Math.abs(candle.close / candles[index - 1].close - 1) * 100; if (change > 40) outliers.push({ timestamp: candle.timestamp, returnPercent: change }); } });
  return { valid: duplicates.length === 0 && invalidOhlc.length === 0 && incomplete.length === 0 && gaps.length === 0, gaps, duplicates, invalidOhlc, incomplete, outliers };
}

export function missingCoverage(candles: readonly Candle[], start: number, end: number, timeframe: Timeframe) {
  const interval = TIMEFRAME_MILLISECONDS[timeframe]; const present = new Set(candles.map((candle) => candle.timestamp)); const ranges: Array<{ start: number; end: number }> = []; let rangeStart: number | null = null;
  for (let timestamp = start; timestamp <= end; timestamp += interval) { if (!present.has(timestamp) && rangeStart === null) rangeStart = timestamp; if (present.has(timestamp) && rangeStart !== null) { ranges.push({ start: rangeStart, end: timestamp - interval }); rangeStart = null; } } if (rangeStart !== null) ranges.push({ start: rangeStart, end }); return ranges;
}

export function createDatasetManifest(provider: string, request: ProviderRequest, providerSymbol: string, candles: readonly Candle[]): DatasetManifest {
  const quality = validateCandles(candles, request.timeframe); const checksum = stableHash(JSON.stringify(candles.map((c) => [c.timestamp, c.open, c.high, c.low, c.close, c.volume]))); const canonicalSymbol = candles[0]?.symbol ?? request.symbol;
  return { id: `ds_${checksum}`, provider, marketType: request.marketType, canonicalSymbol, providerSymbol, timeframe: request.timeframe, start: candles[0]?.timestamp ?? request.start, end: candles.at(-1)?.timestamp ?? request.end, rows: candles.length, retrievedAt: new Date().toISOString(), normalizationVersion: "1.0.0", schemaVersion: "candle-1.0", checksum, quality };
}

export async function resolveData(request: ProviderRequest & { provider: string }) {
  const provider = dataProviderRegistry.get(request.provider); if (!provider) throw new Error(`Unknown data provider: ${request.provider}`); if (!provider.markets.includes(request.marketType)) throw new Error(`${provider.name} does not support ${request.marketType}`);
  const symbols = provider.canonicalizeSymbol(request.symbol); const candles = await provider.fetch(request); const manifest = createDatasetManifest(provider.id, request, symbols.provider, candles); if (manifest.quality.duplicates.length || manifest.quality.invalidOhlc.length) throw new Error("Downloaded data failed duplicate or OHLC validation"); return { candles, manifest };
}
