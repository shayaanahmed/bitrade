import type { Candle, IndicatorPlugin, Parameters } from "./contracts";
import { clamp, exponentialMovingAverage, rollingExtrema, simpleMovingAverage } from "./math";

const base = (id: string, name: string, description: string, outputs: string[], requiredColumns: Array<keyof Candle>, calculate: IndicatorPlugin["calculate"], parameters: IndicatorPlugin["parameters"] = {}, warmup?: IndicatorPlugin["warmup"]): IndicatorPlugin => ({
  id, name, description, kind: "indicator", version: "1.0.0", interfaceVersion: "1.0", deterministic: true,
  requiredColumns, parameters, outputColumns: outputs, missingValuePolicy: "null-until-warmup", calculate,
  warmup: warmup ?? ((params) => Number(params.period ?? Object.values(parameters)[0]?.default ?? 1)),
});

const periodParameter = (value: number, description = "Lookback period") => ({
  period: { type: "integer" as const, default: value, minimum: 2, maximum: 500, description },
});

function period(parameters: Parameters | undefined, fallback: number) {
  return Math.max(2, Math.floor(Number(parameters?.period ?? fallback)));
}

function trueRange(candles: readonly Candle[]) {
  return candles.map((candle, index) => index === 0 ? candle.high - candle.low : Math.max(candle.high - candle.low, Math.abs(candle.high - candles[index - 1].close), Math.abs(candle.low - candles[index - 1].close)));
}

function rsiValues(values: readonly number[], length: number) {
  const output: Array<number | null> = values.map(() => null);
  if (values.length <= length) return output;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= length; index += 1) {
    gains += Math.max(values[index] - values[index - 1], 0);
    losses += Math.max(values[index - 1] - values[index], 0);
  }
  let averageGain = gains / length;
  let averageLoss = losses / length;
  output[length] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  for (let index = length + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = (averageGain * (length - 1) + Math.max(change, 0)) / length;
    averageLoss = (averageLoss * (length - 1) + Math.max(-change, 0)) / length;
    output[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return output;
}

export const INDICATOR_PLUGINS: IndicatorPlugin[] = [
  base("sma", "Simple Moving Average", "Equal-weighted rolling price average.", ["sma"], ["close"], (candles, params) => ({ sma: simpleMovingAverage(candles.map((c) => c.close), period(params, 20)) }), periodParameter(20)),
  base("ema", "Exponential Moving Average", "Recency-weighted price average.", ["ema"], ["close"], (candles, params) => ({ ema: exponentialMovingAverage(candles.map((c) => c.close), period(params, 20)).map((value, index) => index < period(params, 20) - 1 ? null : value) }), periodParameter(20)),
  base("wma", "Weighted Moving Average", "Linearly weighted rolling price average.", ["wma"], ["close"], (candles, params) => {
    const length = period(params, 20); const denominator = length * (length + 1) / 2;
    return { wma: candles.map((_, index) => index < length - 1 ? null : candles.slice(index - length + 1, index + 1).reduce((sum, candle, offset) => sum + candle.close * (offset + 1), 0) / denominator) };
  }, periodParameter(20)),
  base("rsi", "Relative Strength Index", "Wilder momentum oscillator bounded between zero and one hundred.", ["rsi"], ["close"], (candles, params) => ({ rsi: rsiValues(candles.map((c) => c.close), period(params, 14)) }), periodParameter(14)),
  base("macd", "MACD", "Fast and slow EMA momentum difference with signal line.", ["macd", "signal", "histogram"], ["close"], (candles, params) => {
    const fast = Math.max(2, Number(params?.fast ?? 12)); const slow = Math.max(fast + 1, Number(params?.slow ?? 26)); const signalLength = Math.max(2, Number(params?.signal ?? 9));
    const fastValues = exponentialMovingAverage(candles.map((c) => c.close), fast); const slowValues = exponentialMovingAverage(candles.map((c) => c.close), slow);
    const line = fastValues.map((value, index) => value - slowValues[index]); const signal = exponentialMovingAverage(line, signalLength);
    return { macd: line.map((value, index) => index < slow - 1 ? null : value), signal: signal.map((value, index) => index < slow + signalLength - 2 ? null : value), histogram: line.map((value, index) => index < slow + signalLength - 2 ? null : value - signal[index]) };
  }, { fast: { type: "integer", default: 12, minimum: 2, maximum: 100, description: "Fast EMA" }, slow: { type: "integer", default: 26, minimum: 3, maximum: 200, description: "Slow EMA" }, signal: { type: "integer", default: 9, minimum: 2, maximum: 100, description: "Signal EMA" } }, () => 34),
  base("bollinger", "Bollinger Bands", "Moving average with standard-deviation volatility envelope.", ["middle", "upper", "lower"], ["close"], (candles, params) => {
    const length = period(params, 20); const deviations = clamp(Number(params?.deviations ?? 2), 0.1, 10); const closes = candles.map((c) => c.close); const middle = simpleMovingAverage(closes, length);
    const width = middle.map((average, index) => average === null ? null : Math.sqrt(closes.slice(index - length + 1, index + 1).reduce((sum, value) => sum + (value - average) ** 2, 0) / length) * deviations);
    return { middle, upper: middle.map((value, index) => value === null || width[index] === null ? null : value + (width[index] as number)), lower: middle.map((value, index) => value === null || width[index] === null ? null : value - (width[index] as number)) };
  }, { ...periodParameter(20), deviations: { type: "number", default: 2, minimum: 0.1, maximum: 10, description: "Band standard deviations" } }),
  base("atr", "Average True Range", "Wilder-smoothed realized range.", ["atr"], ["high", "low", "close"], (candles, params) => ({ atr: exponentialMovingAverage(trueRange(candles), period(params, 14) * 2 - 1).map((value, index) => index < period(params, 14) - 1 ? null : value) }), periodParameter(14)),
  base("adx", "Average Directional Index", "Trend-strength measure derived from directional movement.", ["adx", "plusDi", "minusDi"], ["high", "low", "close"], (candles, params) => {
    const length = period(params, 14); const tr = exponentialMovingAverage(trueRange(candles), length * 2 - 1);
    const plus = candles.map((c, i) => i === 0 ? 0 : c.high - candles[i - 1].high > candles[i - 1].low - c.low ? Math.max(c.high - candles[i - 1].high, 0) : 0);
    const minus = candles.map((c, i) => i === 0 ? 0 : candles[i - 1].low - c.low > c.high - candles[i - 1].high ? Math.max(candles[i - 1].low - c.low, 0) : 0);
    const plusDi = exponentialMovingAverage(plus, length * 2 - 1).map((v, i) => tr[i] ? 100 * v / tr[i] : 0); const minusDi = exponentialMovingAverage(minus, length * 2 - 1).map((v, i) => tr[i] ? 100 * v / tr[i] : 0);
    const dx = plusDi.map((v, i) => v + minusDi[i] ? 100 * Math.abs(v - minusDi[i]) / (v + minusDi[i]) : 0); const adx = exponentialMovingAverage(dx, length * 2 - 1);
    return { adx: adx.map((v, i) => i < length * 2 - 1 ? null : v), plusDi: plusDi.map((v, i) => i < length ? null : v), minusDi: minusDi.map((v, i) => i < length ? null : v) };
  }, periodParameter(14), (params) => period(params, 14) * 2),
  base("stochastic", "Stochastic Oscillator", "Close position inside the recent high-low range.", ["k", "d"], ["high", "low", "close"], (candles, params) => {
    const length = period(params, 14); const highs = rollingExtrema(candles.map((c) => c.high), length, "max"); const lows = rollingExtrema(candles.map((c) => c.low), length, "min");
    const k = candles.map((c, i) => highs[i] === null || lows[i] === null ? null : highs[i] === lows[i] ? 50 : 100 * (c.close - (lows[i] as number)) / ((highs[i] as number) - (lows[i] as number)));
    return { k, d: simpleMovingAverage(k.map((v) => v ?? 0), 3).map((v, i) => i < length + 1 ? null : v) };
  }, periodParameter(14), (params) => period(params, 14) + 2),
  base("roc", "Rate of Change", "Percentage price change over a fixed lookback.", ["roc"], ["close"], (candles, params) => { const length = period(params, 12); return { roc: candles.map((c, i) => i < length ? null : 100 * (c.close / candles[i - length].close - 1)) }; }, periodParameter(12)),
  base("realized-volatility", "Realized Volatility", "Annualized rolling standard deviation of logarithmic returns.", ["volatility"], ["close"], (candles, params) => { const length = period(params, 20); const returns = candles.map((c, i) => i === 0 ? 0 : Math.log(c.close / candles[i - 1].close)); return { volatility: returns.map((_, i) => { if (i < length) return null; const window = returns.slice(i - length + 1, i + 1); const average = window.reduce((sum, value) => sum + value, 0) / window.length; return Math.sqrt(window.reduce((sum, value) => sum + (value - average) ** 2, 0) / window.length) * Math.sqrt(365 * 24); }) }; }, periodParameter(20)),
  base("cci", "Commodity Channel Index", "Typical-price deviation from its moving average.", ["cci"], ["high", "low", "close"], (candles, params) => {
    const length = period(params, 20); const typical = candles.map((c) => (c.high + c.low + c.close) / 3); const average = simpleMovingAverage(typical, length);
    return { cci: typical.map((value, index) => { if (average[index] === null) return null; const deviation = candles.slice(index - length + 1, index + 1).reduce((sum, _, offset) => sum + Math.abs(typical[index - length + 1 + offset] - (average[index] as number)), 0) / length; return deviation ? (value - (average[index] as number)) / (0.015 * deviation) : 0; }) };
  }, periodParameter(20)),
  base("obv", "On-Balance Volume", "Cumulative signed volume based on closing direction.", ["obv"], ["close", "volume"], (candles) => { let value = 0; return { obv: candles.map((c, i) => value += i === 0 || c.close === candles[i - 1].close ? 0 : c.close > candles[i - 1].close ? c.volume : -c.volume) }; }, {}, () => 1),
  base("vwap", "Volume-Weighted Average Price", "Cumulative session typical price weighted by volume.", ["vwap"], ["high", "low", "close", "volume"], (candles) => { let volume = 0; let value = 0; return { vwap: candles.map((c) => { volume += c.volume; value += ((c.high + c.low + c.close) / 3) * c.volume; return volume ? value / volume : c.close; }) }; }, {}, () => 1),
  base("donchian", "Donchian Channels", "Highest high and lowest low over the lookback.", ["upper", "middle", "lower"], ["high", "low"], (candles, params) => { const length = period(params, 20); const upper = rollingExtrema(candles.map((c) => c.high), length, "max"); const lower = rollingExtrema(candles.map((c) => c.low), length, "min"); return { upper, lower, middle: upper.map((v, i) => v === null || lower[i] === null ? null : (v + (lower[i] as number)) / 2) }; }, periodParameter(20)),
  base("ichimoku", "Ichimoku Cloud", "Conversion, base, and cloud equilibrium levels without future-filled values.", ["conversion", "base", "spanA", "spanB"], ["high", "low"], (candles) => {
    const midpoint = (length: number) => { const high = rollingExtrema(candles.map((c) => c.high), length, "max"); const low = rollingExtrema(candles.map((c) => c.low), length, "min"); return high.map((v, i) => v === null || low[i] === null ? null : (v + (low[i] as number)) / 2); };
    const conversion = midpoint(9); const baseLine = midpoint(26); const spanB = midpoint(52); return { conversion, base: baseLine, spanA: conversion.map((v, i) => v === null || baseLine[i] === null ? null : (v + (baseLine[i] as number)) / 2), spanB };
  }, {}, () => 52),
  base("parabolic-sar", "Parabolic SAR", "Trailing stop-and-reverse level using extreme-point acceleration.", ["sar"], ["high", "low"], (candles, params) => {
    const step = clamp(Number(params?.step ?? 0.02), 0.001, 0.2); const maximum = clamp(Number(params?.maximum ?? 0.2), step, 1); if (!candles.length) return { sar: [] };
    let rising = true; let sar = candles[0].low; let extreme = candles[0].high; let acceleration = step; const output = [sar];
    for (let i = 1; i < candles.length; i += 1) { sar += acceleration * (extreme - sar); if (rising) { sar = Math.min(sar, candles[i - 1].low, i > 1 ? candles[i - 2].low : candles[i - 1].low); if (candles[i].low < sar) { rising = false; sar = extreme; extreme = candles[i].low; acceleration = step; } else if (candles[i].high > extreme) { extreme = candles[i].high; acceleration = Math.min(maximum, acceleration + step); } } else { sar = Math.max(sar, candles[i - 1].high, i > 1 ? candles[i - 2].high : candles[i - 1].high); if (candles[i].high > sar) { rising = true; sar = extreme; extreme = candles[i].high; acceleration = step; } else if (candles[i].low < extreme) { extreme = candles[i].low; acceleration = Math.min(maximum, acceleration + step); } } output.push(sar); }
    return { sar: output };
  }, { step: { type: "number", default: 0.02, minimum: 0.001, maximum: 0.2, description: "Acceleration step" }, maximum: { type: "number", default: 0.2, minimum: 0.01, maximum: 1, description: "Maximum acceleration" } }, () => 2),
  base("supertrend", "Supertrend", "ATR volatility bands with persistent trend direction.", ["supertrend", "direction"], ["high", "low", "close"], (candles, params) => {
    const length = period(params, 10); const multiplier = clamp(Number(params?.multiplier ?? 3), 0.1, 20); const atr = exponentialMovingAverage(trueRange(candles), length * 2 - 1); const line: Array<number | null> = candles.map(() => null); const direction: Array<number | null> = candles.map(() => null); let trend = 1; let upper = 0; let lower = 0;
    candles.forEach((c, i) => { if (i < length - 1) return; const middle = (c.high + c.low) / 2; const nextUpper = middle + multiplier * atr[i]; const nextLower = middle - multiplier * atr[i]; if (i === length - 1) { upper = nextUpper; lower = nextLower; } else { upper = nextUpper < upper || candles[i - 1].close > upper ? nextUpper : upper; lower = nextLower > lower || candles[i - 1].close < lower ? nextLower : lower; if (trend === 1 && c.close < lower) trend = -1; else if (trend === -1 && c.close > upper) trend = 1; } line[i] = trend === 1 ? lower : upper; direction[i] = trend; }); return { supertrend: line, direction };
  }, { ...periodParameter(10), multiplier: { type: "number", default: 3, minimum: 0.1, maximum: 20, description: "ATR multiplier" } }),
];

export const indicatorRegistry = new Map(INDICATOR_PLUGINS.map((plugin) => [plugin.id, plugin]));

export function requireIndicator(id: string) {
  const plugin = indicatorRegistry.get(id);
  if (!plugin) throw new Error(`Unknown indicator plugin: ${id}`);
  return plugin;
}
