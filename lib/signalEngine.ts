import type { StrategyKey } from "./analysisCatalog";

export type SignalCandle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time?: string;
};

export type StrategyContext = {
  entryPrice?: number | null;
  entryTime?: number | null;
  minProfitPercent?: number;
  trailingPullbackPercent?: number;
};

export function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  return values.reduce<number[]>((out, value, index) => {
    out.push(index === 0 ? value : value * k + out[index - 1] * (1 - k));
    return out;
  }, []);
}

export function sma(values: number[], period: number) {
  return values.map<number | null>((_, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    return window.reduce((sum, value) => sum + value, 0) / period;
  });
}

export function bollinger(values: number[], period = 20, deviations = 2) {
  const middle = sma(values, period);
  const upper = middle.map((average, index) => {
    if (average === null) return null;
    const window = values.slice(index - period + 1, index + 1);
    const variance = window.reduce((sum, value) => sum + (value - average) ** 2, 0) / period;
    return average + Math.sqrt(variance) * deviations;
  });
  const lower = middle.map((average, index) => {
    if (average === null || upper[index] === null) return null;
    return average - ((upper[index] as number) - average);
  });
  return { upper, middle, lower };
}

export function rsi(values: number[], period = 14) {
  const result: Array<number | null> = values.map(() => null);
  if (values.length <= period) return result;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  result[period] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return result;
}

export function vwap(candles: SignalCandle[]) {
  let cumulativeVolume = 0;
  let cumulativeValue = 0;
  return candles.map((candle) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeVolume += candle.volume;
    cumulativeValue += typicalPrice * candle.volume;
    return cumulativeVolume ? cumulativeValue / cumulativeVolume : typicalPrice;
  });
}

export function macd(values: number[]) {
  const fastLine = ema(values, 12);
  const slowLine = ema(values, 26);
  const line = values.map((_, index) => fastLine[index] - slowLine[index]);
  const signal = ema(line, 9);
  return { line, signal, histogram: line.map((value, index) => value - signal[index]) };
}

export function stochastic(candles: SignalCandle[], period = 14) {
  const k = candles.map<number | null>((candle, index) => {
    if (index < period - 1) return null;
    const window = candles.slice(index - period + 1, index + 1);
    const high = Math.max(...window.map((item) => item.high));
    const low = Math.min(...window.map((item) => item.low));
    return high === low ? 50 : (candle.close - low) / (high - low) * 100;
  });
  const numeric = k.map((value) => value ?? 50);
  return { k, d: sma(numeric, 3).map((value, index) => index < period + 1 ? null : value) };
}

export function atr(candles: SignalCandle[], period = 14) {
  const trueRanges = candles.map((candle, index) => index === 0
    ? candle.high - candle.low
    : Math.max(candle.high - candle.low, Math.abs(candle.high - candles[index - 1].close), Math.abs(candle.low - candles[index - 1].close))
  );
  return sma(trueRanges, period);
}

export function strategySignals(strategy: StrategyKey, candles: SignalCandle[], context: StrategyContext = {}) {
  const closes = candles.map((candle) => candle.close);
  const fast = ema(closes, 9);
  const slow = ema(closes, 21);
  const simple = sma(closes, 20);
  const momentum = macd(closes);
  const strength = rsi(closes);
  const bands = bollinger(closes);
  const fairValue = vwap(candles);
  let buy = -1;
  let sell = -1;

  if (strategy === "profit-guard") {
    const entryPrice = context.entryPrice && context.entryPrice > 0 ? context.entryPrice : null;
    const minProfitPercent = Math.max(0.1, context.minProfitPercent ?? 2);
    const trailingPullbackPercent = Math.max(0.1, Math.min(50, context.trailingPullbackPercent ?? 1.5));
    const activationPrice = entryPrice ? entryPrice * (1 + minProfitPercent / 100) : null;
    let peakPrice = entryPrice;
    let trailingStop: number | null = null;
    let activated = false;
    let activationIndex = -1;
    let reason = entryPrice ? `Waiting for +${minProfitPercent}% profit` : "No held position with a known cost basis";

    if (entryPrice && activationPrice) {
      for (let index = 0; index < candles.length; index += 1) {
        const candle = candles[index];
        if (context.entryTime && candle.openTime < context.entryTime) continue;
        peakPrice = Math.max(peakPrice ?? entryPrice, candle.high);

        if (!activated && peakPrice >= activationPrice) {
          activated = true;
          activationIndex = index;
          trailingStop = peakPrice * (1 - trailingPullbackPercent / 100);
          reason = "Armed and following the post-entry peak";
          continue;
        }
        if (!activated) continue;

        trailingStop = (peakPrice ?? entryPrice) * (1 - trailingPullbackPercent / 100);
        const confirmedPullback = candle.close <= trailingStop;
        const bearishCross = index > 0 && fast[index] < slow[index] && fast[index - 1] >= slow[index - 1];
        if (index > activationIndex && (confirmedPullback || bearishCross)) {
          sell = index;
          reason = confirmedPullback ? `Closed ${trailingPullbackPercent}% below the peak` : "EMA 9 crossed below EMA 21";
          break;
        }
      }
    }

    return {
      buy,
      sell,
      signal: sell >= 0 ? "SELL" as const : "HOLD" as const,
      activated,
      activationIndex,
      entryPrice,
      activationPrice,
      peakPrice,
      trailingStop,
      reason,
    };
  }

  for (let index = 1; index < candles.length; index += 1) {
    if (strategy === "ema-cross") {
      if (fast[index] > slow[index] && fast[index - 1] <= slow[index - 1]) buy = index;
      if (fast[index] < slow[index] && fast[index - 1] >= slow[index - 1]) sell = index;
    } else if (strategy === "macd-trend") {
      if (momentum.line[index] > momentum.signal[index] && momentum.line[index - 1] <= momentum.signal[index - 1]) buy = index;
      if (momentum.line[index] < momentum.signal[index] && momentum.line[index - 1] >= momentum.signal[index - 1]) sell = index;
    } else if (strategy === "rsi-reversal") {
      if ((strength[index] ?? 50) > 30 && (strength[index - 1] ?? 50) <= 30) buy = index;
      if ((strength[index] ?? 50) < 70 && (strength[index - 1] ?? 50) >= 70) sell = index;
    } else if (strategy === "bollinger-breakout") {
      if (bands.upper[index] !== null && bands.upper[index - 1] !== null && closes[index] > (bands.upper[index] as number) && closes[index - 1] <= (bands.upper[index - 1] as number)) buy = index;
      if (bands.lower[index] !== null && bands.lower[index - 1] !== null && closes[index] < (bands.lower[index] as number) && closes[index - 1] >= (bands.lower[index - 1] as number)) sell = index;
    } else if (strategy === "vwap-pullback") {
      if (closes[index] > fairValue[index] && closes[index - 1] <= fairValue[index - 1]) buy = index;
      if (closes[index] < fairValue[index] && closes[index - 1] >= fairValue[index - 1]) sell = index;
    } else if (strategy === "triple-ma") {
      const alignedUp = simple[index] !== null && closes[index] > fast[index] && fast[index] > slow[index] && slow[index] > (simple[index] as number);
      const priorUp = simple[index - 1] !== null && closes[index - 1] > fast[index - 1] && fast[index - 1] > slow[index - 1] && slow[index - 1] > (simple[index - 1] as number);
      const alignedDown = simple[index] !== null && closes[index] < fast[index] && fast[index] < slow[index] && slow[index] < (simple[index] as number);
      const priorDown = simple[index - 1] !== null && closes[index - 1] < fast[index - 1] && fast[index - 1] < slow[index - 1] && slow[index - 1] < (simple[index - 1] as number);
      if (alignedUp && !priorUp) buy = index;
      if (alignedDown && !priorDown) sell = index;
    }
  }
  return { buy, sell, signal: buy < 0 && sell < 0 ? "HOLD" as const : buy >= sell ? "BUY" as const : "SELL" as const, activated: false, activationIndex: -1, entryPrice: null, activationPrice: null, peakPrice: null, trailingStop: null, reason: "" };
}

export type StrategyEvaluation = { strategy: StrategyKey; result: ReturnType<typeof strategySignals> };

export function strategyConsensus(evaluations: StrategyEvaluation[], minimum = Math.min(2, evaluations.length)) {
  const buyVotes = evaluations.filter((item) => item.result.signal === "BUY");
  const sellVotes = evaluations.filter((item) => item.result.signal === "SELL");
  const required = Math.max(1, Math.min(evaluations.length, minimum || 1));
  const signal = buyVotes.length >= required && buyVotes.length > sellVotes.length
    ? "BUY" as const
    : sellVotes.length >= required && sellVotes.length > buyVotes.length
      ? "SELL" as const
      : "HOLD" as const;
  const voters = signal === "BUY" ? buyVotes : signal === "SELL" ? sellVotes : [];
  const eventIndex = voters.length ? Math.max(...voters.map((item) => signal === "BUY" ? item.result.buy : item.result.sell)) : -1;
  return { signal, required, buyVotes: buyVotes.length, sellVotes: sellVotes.length, voters, eventIndex };
}
