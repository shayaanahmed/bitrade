"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import {
  ACTIVE_STRATEGY_STORAGE_KEY,
  DEFAULT_INDICATORS,
  DEFAULT_STRATEGIES,
  INDICATOR_CATALOG,
  INDICATOR_STORAGE_KEY,
  STRATEGY_CATALOG,
  STRATEGY_STORAGE_KEY,
  type IndicatorKey,
  type StrategyKey,
} from "@/lib/analysisCatalog";
import { DEFAULT_SIGNAL_CONFIG, appendSignalDelivery, readSignalConfig, type SignalConfig, type SignalSide, type SignalTimeframe } from "@/lib/signalConfig";

type Coin = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  volume: string;
  icon: string;
  color: string;
};

type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: string;
};

type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";

type AccountAsset = {
  symbol: string;
  amount: number;
  free: number;
  locked: number;
  value: number;
  averageBuyPrice?: number | null;
  lastBuyPrice?: number | null;
  lastBuyTime?: number | null;
};

type StrategyContext = {
  entryPrice?: number | null;
  entryTime?: number | null;
  minProfitPercent?: number;
  trailingPullbackPercent?: number;
};

type Order = {
  id: number;
  side: "Buy" | "Sell";
  pair: string;
  amount: number;
  price: number;
  time: string;
};

type BinanceTradeHistory = {
  id: string;
  tradeId: number;
  orderId: number;
  pair: string;
  symbol: string;
  side: "Buy" | "Sell";
  amount: number;
  price: number;
  quoteAmount: number;
  commission: number;
  commissionAsset: string;
  time: number;
  maker: boolean;
};

const COINS: Coin[] = [
  { symbol: "BTC", name: "Bitcoin", price: 67241.8, change: 2.42, volume: "$32.8B", icon: "₿", color: "#f7931a" },
  { symbol: "ETH", name: "Ethereum", price: 3468.24, change: 1.18, volume: "$14.2B", icon: "◆", color: "#627eea" },
  { symbol: "SOL", name: "Solana", price: 178.42, change: 5.76, volume: "$4.9B", icon: "S", color: "#936cf7" },
  { symbol: "BNB", name: "BNB", price: 594.83, change: -0.62, volume: "$1.8B", icon: "B", color: "#f3ba2f" },
  { symbol: "XRP", name: "XRP", price: 0.5264, change: 0.84, volume: "$1.1B", icon: "X", color: "#d7e0e6" },
  { symbol: "DOGE", name: "Dogecoin", price: 0.1428, change: -1.34, volume: "$892M", icon: "Ð", color: "#c2a633" },
  { symbol: "AVAX", name: "Avalanche", price: 37.16, change: 3.09, volume: "$473M", icon: "A", color: "#e84142" },
  { symbol: "LINK", name: "Chainlink", price: 14.92, change: 2.01, volume: "$428M", icon: "L", color: "#2a5ada" },
];
const TRADE_HISTORY_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX", "LINK", "ADA", "DOT", "NEAR", "LTC"];

const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D"];
const BINANCE_INTERVAL: Record<string, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };

const BASE_SERIES = [
  -0.3, 0.2, 0.5, -0.18, 0.72, 0.3, -0.45, 0.15, 0.64, 0.18, -0.32, -0.58,
  0.2, -0.18, 0.42, 0.67, -0.24, 0.88, 0.37, -0.42, 0.25, 0.55, 0.73, -0.2,
  0.34, -0.68, -0.22, 0.14, -0.52, -0.4, 0.33, 0.15, -0.12, 0.44, 0.62, 0.28,
  -0.35, 0.16, 0.5, 0.32, -0.18, 0.41, 0.58, -0.16, 0.26, -0.38, 0.18, 0.43,
  0.24, -0.3, 0.57, 0.48, -0.12, 0.31, -0.44, 0.67, 0.18, -0.26, 0.39, 0.51,
];

function formatPrice(value: number) {
  if (value < 1) return value.toFixed(4);
  if (value < 1000) return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function generateCandles(base: number, symbol: string, timeframe: string): Candle[] {
  const symbolBias = symbol.charCodeAt(0) % 7;
  const frameScale = { "1m": 0.0014, "5m": 0.0022, "15m": 0.0034, "1H": 0.0047, "4H": 0.006, "1D": 0.009 }[timeframe] ?? 0.0047;
  let current = base * 0.965;
  return BASE_SERIES.map((delta, index) => {
    const open = current;
    const drift = delta * frameScale + Math.sin((index + symbolBias) * 0.55) * frameScale * 0.34 + frameScale * 0.08;
    const close = open * (1 + drift);
    const spread = base * frameScale * (0.3 + ((index * 7 + symbolBias) % 8) / 11);
    const high = Math.max(open, close) + spread;
    const low = Math.min(open, close) - spread * 0.83;
    current = close;
    const hour = (index + 8) % 24;
    return { openTime: index, open, high, low, close, volume: 30 + ((index * 31 + symbolBias * 13) % 100), time: `${String(hour).padStart(2, "0")}:00` };
  });
}

function useBinanceCandles(symbol: string, fallbackPrice: number, timeframe: string) {
  const [candles, setCandles] = useState<Candle[]>(() => generateCandles(fallbackPrice, symbol, timeframe));
  const [status, setStatus] = useState<ConnectionState>("connecting");

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    const interval = BINANCE_INTERVAL[timeframe] ?? "1h";
    const pair = `${symbol}USDT`;

    const formatCandleTime = (timestamp: number) => {
      const date = new Date(timestamp);
      return timeframe === "1D"
        ? date.toLocaleDateString([], { month: "short", day: "numeric" })
        : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    };

    async function loadHistory() {
      setStatus("connecting");
      try {
        const response = await fetch(`/api/binance/klines?symbol=${pair}&interval=${interval}&limit=240`, { cache: "no-store" });
        if (!response.ok) throw new Error("Market history unavailable");
        const payload = await response.json() as { candles: Array<Omit<Candle, "time">> };
        if (!disposed && payload.candles?.length) {
          setCandles(payload.candles.map((candle) => ({ ...candle, time: formatCandleTime(candle.openTime) })));
        }
      } catch {
        if (!disposed) setCandles(generateCandles(fallbackPrice, symbol, timeframe));
      }
    }

    function connect() {
      if (disposed) return;
      const wsBase = (process.env.NEXT_PUBLIC_BINANCE_WS_URL || "wss://stream.binance.com:9443/ws").replace(/\/$/, "");
      socket = new WebSocket(`${wsBase}/${pair.toLowerCase()}@kline_${interval}`);
      socket.onopen = () => !disposed && setStatus("live");
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as { k?: { t: number; o: string; h: string; l: string; c: string; v: string } };
        if (!message.k || disposed) return;
        const next: Candle = {
          openTime: message.k.t,
          open: Number(message.k.o),
          high: Number(message.k.h),
          low: Number(message.k.l),
          close: Number(message.k.c),
          volume: Number(message.k.v),
          time: formatCandleTime(message.k.t),
        };
        setCandles((current) => {
          const last = current[current.length - 1];
          if (last?.openTime === next.openTime) return [...current.slice(0, -1), next];
          return [...current, next].slice(-240);
        });
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (disposed) return;
        setStatus("reconnecting");
        reconnectTimer = window.setTimeout(connect, 2500);
      };
    }

    setCandles(generateCandles(fallbackPrice, symbol, timeframe));
    void loadHistory();
    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [symbol, fallbackPrice, timeframe]);

  return { candles, status, livePrice: candles[candles.length - 1]?.close ?? fallbackPrice };
}

function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  return values.reduce<number[]>((out, value, index) => {
    out.push(index === 0 ? value : value * k + out[index - 1] * (1 - k));
    return out;
  }, []);
}

function sma(values: number[], period: number) {
  return values.map<number | null>((_, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    return window.reduce((sum, value) => sum + value, 0) / period;
  });
}

function bollinger(values: number[], period = 20, deviations = 2) {
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

function rsi(values: number[], period = 14) {
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

function vwap(candles: Candle[]) {
  let cumulativeVolume = 0;
  let cumulativeValue = 0;
  return candles.map((candle) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeVolume += candle.volume;
    cumulativeValue += typicalPrice * candle.volume;
    return cumulativeVolume ? cumulativeValue / cumulativeVolume : typicalPrice;
  });
}

function macd(values: number[]) {
  const fastLine = ema(values, 12);
  const slowLine = ema(values, 26);
  const line = values.map((_, index) => fastLine[index] - slowLine[index]);
  const signal = ema(line, 9);
  return { line, signal, histogram: line.map((value, index) => value - signal[index]) };
}

function stochastic(candles: Candle[], period = 14) {
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

function atr(candles: Candle[], period = 14) {
  const trueRanges = candles.map((candle, index) => index === 0
    ? candle.high - candle.low
    : Math.max(candle.high - candle.low, Math.abs(candle.high - candles[index - 1].close), Math.abs(candle.low - candles[index - 1].close))
  );
  return sma(trueRanges, period);
}

function strategySignals(strategy: StrategyKey, candles: Candle[], context: StrategyContext = {}) {
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
  return { buy, sell, signal: buy >= sell ? "BUY" as const : "SELL" as const, activated: false, entryPrice: null, activationPrice: null, peakPrice: null, trailingStop: null, reason: "" };
}

function MiniSparkline({ positive = true }: { positive?: boolean }) {
  const points = positive ? "0,17 8,15 16,18 24,10 32,12 40,5 48,8 56,2" : "0,4 8,8 16,5 24,13 32,10 40,17 48,14 56,19";
  return (
    <svg viewBox="0 0 56 22" aria-hidden="true" className="sparkline">
      <polyline points={points} fill="none" stroke={positive ? "#18c997" : "#f45b69"} strokeWidth="2" />
    </svg>
  );
}

function MarketChart({ coin, candles, status, timeframe, activeStrategy, assignedStrategies, onStrategyChange, lastBuyPrice, positionAmount, positionEntryPrice, positionEntryTime, minProfitPercent, trailingPullbackPercent }: { coin: Coin; candles: Candle[]; status: ConnectionState; timeframe: string; activeStrategy: StrategyKey; assignedStrategies: StrategyKey[]; onStrategyChange: (strategy: StrategyKey) => void; lastBuyPrice: number | null; positionAmount: number; positionEntryPrice: number | null; positionEntryTime: number | null; minProfitPercent: number; trailingPullbackPercent: number }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showStrategy, setShowStrategy] = useState(true);
  const [visibleCount, setVisibleCount] = useState(120);
  const [viewEnd, setViewEnd] = useState<number | null>(null);
  const [indicatorMenuOpen, setIndicatorMenuOpen] = useState(false);
  const [strategyMenuOpen, setStrategyMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [indicators, setIndicators] = useState<Record<IndicatorKey, boolean>>(() => Object.fromEntries(INDICATOR_CATALOG.map((indicator) => [indicator.key, DEFAULT_INDICATORS.includes(indicator.key)])) as Record<IndicatorKey, boolean>);
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ x: number; end: number } | null>(null);

  const closes = candles.map((candle) => candle.close);
  const fast = ema(closes, 9);
  const slow = ema(closes, 21);
  const simple = sma(closes, 20);
  const bands = bollinger(closes);
  const rsiValues = rsi(closes);
  const vwapValues = vwap(candles);
  const macdValues = macd(closes);
  const stochasticValues = stochastic(candles);
  const atrValues = atr(candles);
  const count = Math.max(1, Math.min(visibleCount, candles.length));
  const end = Math.max(count, Math.min(viewEnd ?? candles.length, candles.length));
  const start = Math.max(0, end - count);
  const visibleCandles = candles.slice(start, end);
  const visibleFast = fast.slice(start, end);
  const visibleSlow = slow.slice(start, end);
  const visibleSimple = simple.slice(start, end);
  const visibleUpper = bands.upper.slice(start, end);
  const visibleMiddle = bands.middle.slice(start, end);
  const visibleLower = bands.lower.slice(start, end);
  const visibleRsi = rsiValues.slice(start, end);
  const visibleVwap = vwapValues.slice(start, end);
  const visibleMacd = macdValues.line.slice(start, end);
  const visibleMacdSignal = macdValues.signal.slice(start, end);
  const visibleMacdHistogram = macdValues.histogram.slice(start, end);
  const visibleStochasticK = stochasticValues.k.slice(start, end);
  const visibleStochasticD = stochasticValues.d.slice(start, end);
  const visibleAtr = atrValues.slice(start, end);

  const width = 900;
  const left = 18;
  const right = 72;
  const top = 22;
  const lowerStudies = (["rsi", "macd", "stochastic", "atr"] as IndicatorKey[]).filter((key) => indicators[key]);
  const paneHeight = 62;
  const lowerStart = 410;
  const axisY = lowerStart + lowerStudies.length * paneHeight + 18;
  const height = axisY + 14;
  const volumeBottom = 399;
  const volumeTop = indicators.volume ? volumeBottom - 36 : volumeBottom;
  const graphBottom = indicators.volume ? volumeTop - 10 : 390;
  const graphW = width - left - right;
  const graphH = Math.max(120, graphBottom - top);
  const overlayPrices = [
    ...(indicators.bollinger ? [...visibleUpper, ...visibleLower].filter((value): value is number => value !== null) : []),
    ...(indicators.vwap ? visibleVwap : []),
  ];
  const priceValues = [...visibleCandles.flatMap((candle) => [candle.high, candle.low]), ...overlayPrices];
  const rawMax = Math.max(...priceValues);
  const rawMin = Math.min(...priceValues);
  const padding = Math.max((rawMax - rawMin) * 0.04, rawMax * 0.001);
  const max = rawMax + padding;
  const min = rawMin - padding;
  const x = (index: number) => left + (index + 0.5) * (graphW / visibleCandles.length);
  const y = (value: number) => top + ((max - value) / Math.max(max - min, 1e-9)) * graphH;
  const candleWidth = Math.max(1.5, Math.min(13, graphW / visibleCandles.length - 1.6));
  const tickIndices = Array.from({ length: 7 }, (_, index) => Math.min(visibleCandles.length - 1, Math.round(index * (visibleCandles.length - 1) / 6)));
  const current = hoverIndex === null ? visibleCandles[visibleCandles.length - 1] : visibleCandles[hoverIndex];
  const hoveredX = hoverIndex === null ? null : x(hoverIndex);
  const activeSignals = strategySignals(activeStrategy, candles, { entryPrice: positionEntryPrice, entryTime: positionEntryTime, minProfitPercent, trailingPullbackPercent });
  const buySignal = activeSignals.buy;
  const sellSignal = activeSignals.sell;
  const localBuySignal = buySignal >= start && buySignal < end ? buySignal - start : -1;
  const localSellSignal = sellSignal >= start && sellSignal < end ? sellSignal - start : -1;
  const maxVolume = Math.max(...visibleCandles.map((candle) => candle.volume), 1);
  const activeIndicators = Object.values(indicators).filter(Boolean).length;
  const isLiveView = viewEnd === null;

  const paneBounds = (key: IndicatorKey) => {
    const index = lowerStudies.indexOf(key);
    const paneTop = lowerStart + Math.max(index, 0) * paneHeight;
    return { top: paneTop, bottom: paneTop + paneHeight - 8 };
  };
  const oscillatorY = (key: IndicatorKey, value: number, valueMin: number, valueMax: number) => {
    const pane = paneBounds(key);
    return pane.top + 8 + (valueMax - value) / Math.max(valueMax - valueMin, 1e-9) * (pane.bottom - pane.top - 13);
  };
  const macdRange = Math.max(...visibleMacd.map(Math.abs), ...visibleMacdSignal.map(Math.abs), ...visibleMacdHistogram.map(Math.abs), 1e-9);
  const atrMax = Math.max(...visibleAtr.filter((value): value is number => value !== null), 1e-9);

  function pathFor(values: Array<number | null>, mapper: (value: number) => number = y) {
    let drawing = false;
    return values.map((value, index) => {
      if (value === null || !Number.isFinite(value)) {
        drawing = false;
        return "";
      }
      const command = drawing ? "L" : "M";
      drawing = true;
      return `${command}${x(index).toFixed(1)},${mapper(value).toFixed(1)}`;
    }).join(" ");
  }

  function zoom(nextCount: number) {
    const next = Math.max(24, Math.min(candles.length, Math.round(nextCount)));
    setVisibleCount(next);
    if (viewEnd !== null && viewEnd < next) setViewEnd(next);
    setHoverIndex(null);
  }

  function resetView() {
    setVisibleCount(120);
    setViewEnd(null);
    setHoverIndex(null);
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    zoom(visibleCount * (event.deltaY > 0 ? 1.18 : 0.82));
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, end };
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (dragRef.current) {
      const movedCandles = Math.round((event.clientX - dragRef.current.x) / bounds.width * visibleCandles.length);
      const nextEnd = Math.max(count, Math.min(candles.length, dragRef.current.end - movedCandles));
      setViewEnd(nextEnd >= candles.length ? null : nextEnd);
      setHoverIndex(null);
      return;
    }
    const local = ((event.clientX - bounds.left) / bounds.width) * width;
    const index = Math.max(0, Math.min(visibleCandles.length - 1, Math.floor(((local - left) / graphW) * visibleCandles.length)));
    setHoverIndex(index);
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function toggleIndicator(key: IndicatorKey) {
    setIndicators((currentIndicators) => {
      const next = { ...currentIndicators, [key]: !currentIndicators[key] };
      localStorage.setItem(INDICATOR_STORAGE_KEY, JSON.stringify(INDICATOR_CATALOG.filter((indicator) => next[indicator.key]).map((indicator) => indicator.key)));
      return next;
    });
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) await panelRef.current?.requestFullscreen();
    else await document.exitFullscreen();
  }

  useEffect(() => resetView(), [coin.symbol, timeframe]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(INDICATOR_STORAGE_KEY);
      if (stored === null) return;
      const assigned = JSON.parse(stored) as IndicatorKey[];
      setIndicators(Object.fromEntries(INDICATOR_CATALOG.map((indicator) => [indicator.key, assigned.includes(indicator.key)])) as Record<IndicatorKey, boolean>);
    } catch { /* keep chart defaults */ }
  }, []);
  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  return (
    <section className="chart-panel panel advanced-chart" ref={panelRef}>
      <div className="chart-tools">
        <div className="ohlc" aria-live="polite">
          <span className={`feed-state ${status}`}><i />{status === "live" ? "BINANCE LIVE" : status.toUpperCase()}</span>
          <span>{visibleCandles.length}/{candles.length} candles</span>
          <span>O <b>{formatPrice(current.open)}</b></span>
          <span>H <b>{formatPrice(current.high)}</b></span>
          <span>L <b>{formatPrice(current.low)}</b></span>
          <span>C <b className={current.close >= current.open ? "up" : "down"}>{formatPrice(current.close)}</b></span>
          <span>V <b>{current.volume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></span>
          {lastBuyPrice !== null && <span className="position-price-summary"><i /><b>{positionAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {coin.symbol} held</b><em>Last buy ${formatPrice(lastBuyPrice)}</em></span>}
        </div>
        <div className="indicator-toggles">
          <div className="indicator-menu-wrap strategy-selector-wrap">
            <button className={`tool strategy-selector ${showStrategy ? "active" : ""}`} onClick={() => setStrategyMenuOpen(!strategyMenuOpen)} aria-expanded={strategyMenuOpen}>✦ {STRATEGY_CATALOG.find((strategy) => strategy.key === activeStrategy)?.name ?? "Strategy"}</button>
            {strategyMenuOpen && <div className="indicator-menu strategy-menu">
              <div><b>Assigned strategies</b><button onClick={() => setStrategyMenuOpen(false)} aria-label="Close strategy menu">×</button></div>
              {assignedStrategies.map((key) => {
                const strategy = STRATEGY_CATALOG.find((item) => item.key === key);
                if (!strategy) return null;
                return <button key={key} className={activeStrategy === key ? "active" : ""} onClick={() => { onStrategyChange(key); setShowStrategy(true); setStrategyMenuOpen(false); }}><span><b>{strategy.name}</b><small>{strategy.category} · {strategy.version}</small></span><i>{activeStrategy === key ? "✓" : ""}</i></button>;
              })}
              <a href="/analysis">Manage strategy library →</a>
            </div>}
          </div>
          <button className={showStrategy ? "tool active signal-toggle" : "tool signal-toggle"} onClick={() => setShowStrategy(!showStrategy)}>{showStrategy ? "Signals on" : "Signals off"}</button>
          <div className="indicator-menu-wrap">
            <button className={`tool indicators-button ${indicatorMenuOpen ? "active" : ""}`} onClick={() => setIndicatorMenuOpen(!indicatorMenuOpen)} aria-expanded={indicatorMenuOpen}>Indicators <b>{activeIndicators}</b></button>
            {indicatorMenuOpen && <div className="indicator-menu">
              <div><b>Chart indicators</b><button onClick={() => setIndicatorMenuOpen(false)} aria-label="Close indicator menu">×</button></div>
              {INDICATOR_CATALOG.map((option) => <label key={option.key}><input type="checkbox" checked={indicators[option.key]} onChange={() => toggleIndicator(option.key)} /><span><b>{option.shortName}</b><small>{option.description}</small></span></label>)}
              <a className="manage-studies" href="/analysis">Explore indicator library →</a>
            </div>}
          </div>
          <div className="chart-nav" aria-label="Chart navigation">
            <button onClick={() => zoom(visibleCount * 1.25)} title="Zoom out">−</button>
            <button onClick={() => zoom(visibleCount * .8)} title="Zoom in">+</button>
            <button onClick={() => zoom(candles.length)} title="Fit all candles">Fit</button>
            <button className={isLiveView ? "live active" : "live"} onClick={() => setViewEnd(null)} title="Return to latest candle">Live</button>
          </div>
          <button className="icon-tool" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Exit fullscreen chart" : "Open fullscreen chart"}>{isFullscreen ? "×" : "↗"}</button>
        </div>
      </div>

      <div className="chart-body">
        <div className="draw-tools" aria-label="Chart navigation help">
          <button title="Crosshair" className="active">＋</button>
          <button title="Drag chart left or right">↔</button>
          <button title="Use the mouse wheel to zoom">⌁</button>
          <button title="Double-click to reset the chart" onClick={resetView}>↺</button>
        </div>
        <svg
          className="market-chart interactive"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${coin.symbol} interactive candlestick chart. Scroll to zoom and drag to pan.`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => { if (!dragRef.current) setHoverIndex(null); }}
          onDoubleClick={resetView}
        >
          <defs>
            <linearGradient id="emaGlow" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#b277ff" /><stop offset="1" stopColor="#8f5cff" /></linearGradient>
            <clipPath id="priceClip"><rect x={left} y={top} width={graphW} height={graphH} /></clipPath>
          </defs>
          {[0, 1, 2, 3, 4].map((index) => {
            const gridY = top + graphH / 4 * index;
            const value = max - (max - min) / 4 * index;
            return <g key={index}><line x1={left} y1={gridY} x2={width - right} y2={gridY} className="grid-line" /><text x={width - right + 10} y={gridY + 4} className="axis-label">{formatPrice(value)}</text></g>;
          })}
          {tickIndices.map((index) => <g key={index}><line x1={x(index)} y1={top} x2={x(index)} y2={axisY - 8} className="grid-line vertical" /><text x={x(index)} y={axisY} textAnchor="middle" className="axis-label">{visibleCandles[index].time}</text></g>)}

          <g clipPath="url(#priceClip)">
            {indicators.bollinger && <><path d={pathFor(visibleUpper)} className="indicator-line bollinger" /><path d={pathFor(visibleMiddle)} className="indicator-line bollinger-middle" /><path d={pathFor(visibleLower)} className="indicator-line bollinger" /></>}
            {visibleCandles.map((candle, index) => {
              const rising = candle.close >= candle.open;
              const color = rising ? "#18c997" : "#f45b69";
              const bodyTop = y(Math.max(candle.open, candle.close));
              const bodyHeight = Math.max(2, Math.abs(y(candle.open) - y(candle.close)));
              return <g key={candle.openTime}><line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.2" /><rect x={x(index) - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} rx="1" fill={color} opacity={hoverIndex === index ? 1 : .9} /></g>;
            })}
            {indicators.ema9 && <path d={pathFor(visibleFast)} className="ema-line fast" />}
            {indicators.ema21 && <path d={pathFor(visibleSlow)} className="ema-line slow" />}
            {indicators.sma20 && <path d={pathFor(visibleSimple)} className="indicator-line sma" />}
            {indicators.vwap && <path d={pathFor(visibleVwap)} className="indicator-line vwap" />}

            {showStrategy && <>
              {localBuySignal >= 0 && <g transform={`translate(${x(localBuySignal)},${y(visibleCandles[localBuySignal].low) + 14})`} className="signal-marker buy"><path d="M0 0 L-7 9 H7 Z" /><rect x="-22" y="10" width="44" height="19" rx="5" /><text x="0" y="24" textAnchor="middle">BUY</text></g>}
              {localSellSignal >= 0 && <g transform={`translate(${x(localSellSignal)},${y(visibleCandles[localSellSignal].high) - 14})`} className="signal-marker sell"><path d="M0 0 L-7 -9 H7 Z" /><rect x="-23" y="-29" width="46" height="19" rx="5" /><text x="0" y="-15" textAnchor="middle">SELL</text></g>}
            </>}
          </g>

          {indicators.volume && <g className="volume-pane">
            <text x={left + 4} y={volumeTop + 9}>VOLUME</text>
            {visibleCandles.map((candle, index) => {
              const barHeight = candle.volume / maxVolume * 30;
              return <rect key={`v${candle.openTime}`} x={x(index) - candleWidth / 2} y={volumeBottom - barHeight} width={candleWidth} height={barHeight} fill={candle.close >= candle.open ? "#18c997" : "#f45b69"} opacity=".28" />;
            })}
          </g>}

          {indicators.rsi && (() => {
            const pane = paneBounds("rsi");
            const map = (value: number) => oscillatorY("rsi", value, 0, 100);
            return <g className="study-pane rsi-pane">
              <rect x={left} y={map(70)} width={graphW} height={map(30) - map(70)} />
              {[70, 50, 30].map((value) => <g key={value}><line x1={left} y1={map(value)} x2={width - right} y2={map(value)} /><text x={width - right + 10} y={map(value) + 3}>{value}</text></g>)}
              <text x={left + 4} y={pane.top + 10} className="study-title">RSI 14</text>
              <path d={pathFor(visibleRsi, map)} className="study-line rsi-line" />
            </g>;
          })()}

          {indicators.macd && (() => {
            const pane = paneBounds("macd");
            const map = (value: number) => oscillatorY("macd", value, -macdRange, macdRange);
            const zero = map(0);
            return <g className="study-pane macd-pane">
              <line x1={left} y1={zero} x2={width - right} y2={zero} />
              <text x={left + 4} y={pane.top + 10} className="study-title">MACD 12 · 26 · 9</text>
              {visibleMacdHistogram.map((value, index) => <rect key={index} x={x(index) - Math.max(1, candleWidth * .35)} y={value >= 0 ? map(value) : zero} width={Math.max(2, candleWidth * .7)} height={Math.max(1, Math.abs(map(value) - zero))} className={value >= 0 ? "macd-up" : "macd-down"} />)}
              <path d={pathFor(visibleMacd, map)} className="study-line macd-line" /><path d={pathFor(visibleMacdSignal, map)} className="study-line macd-signal" />
            </g>;
          })()}

          {indicators.stochastic && (() => {
            const pane = paneBounds("stochastic");
            const map = (value: number) => oscillatorY("stochastic", value, 0, 100);
            return <g className="study-pane stochastic-pane">
              {[80, 20].map((value) => <line key={value} x1={left} y1={map(value)} x2={width - right} y2={map(value)} />)}
              <text x={left + 4} y={pane.top + 10} className="study-title">STOCHASTIC 14 · 3</text>
              <path d={pathFor(visibleStochasticK, map)} className="study-line stochastic-k" /><path d={pathFor(visibleStochasticD, map)} className="study-line stochastic-d" />
            </g>;
          })()}

          {indicators.atr && (() => {
            const pane = paneBounds("atr");
            const map = (value: number) => oscillatorY("atr", value, 0, atrMax);
            return <g className="study-pane atr-pane">
              <text x={left + 4} y={pane.top + 10} className="study-title">ATR 14</text>
              <path d={pathFor(visibleAtr, map)} className="study-line atr-line" />
              <text x={width - right + 10} y={map(atrMax) + 4}>{formatPrice(atrMax)}</text>
            </g>;
          })()}

          {hoveredX !== null && <g className="crosshair"><line x1={hoveredX} y1={top} x2={hoveredX} y2={axisY - 8} /><line x1={left} y1={y(current.close)} x2={width - right} y2={y(current.close)} /><rect x={width - right} y={y(current.close) - 11} width="68" height="22" rx="4" /><text x={width - right + 34} y={y(current.close) + 4} textAnchor="middle">{formatPrice(current.close)}</text><rect x={Math.max(left, Math.min(hoveredX - 38, width - right - 76))} y={axisY - 11} width="76" height="18" rx="4" /><text x={Math.max(left + 38, Math.min(hoveredX, width - right - 38))} y={axisY + 2} textAnchor="middle">{current.time}</text></g>}
        </svg>
        <div className="legend">
          {indicators.ema9 && <span><i className="legend-fast" /> EMA 9</span>}
          {indicators.ema21 && <span><i className="legend-slow" /> EMA 21</span>}
          {indicators.sma20 && <span><i className="legend-sma" /> SMA 20</span>}
          {indicators.bollinger && <span><i className="legend-bollinger" /> BB 20</span>}
          {indicators.vwap && <span><i className="legend-vwap" /> VWAP</span>}
        </div>
        <div className="chart-hint">Scroll to zoom · Drag to pan · Double-click to reset</div>
      </div>
    </section>
  );
}

function CoinUniverse({ selected, setSelected, active, setActive }: { selected: string[]; setSelected: (coins: string[]) => void; active: string; setActive: (symbol: string) => void }) {
  const [filter, setFilter] = useState<"All" | "Selected">("All");
  const [search, setSearch] = useState("");
  const visible = COINS.filter((coin) => (filter === "All" || selected.includes(coin.symbol)) && `${coin.symbol} ${coin.name}`.toLowerCase().includes(search.toLowerCase()));

  function toggle(symbol: string) {
    if (selected.includes(symbol)) {
      if (selected.length === 1) return;
      const next = selected.filter((item) => item !== symbol);
      setSelected(next);
      if (active === symbol) setActive(next[0]);
    } else setSelected([...selected, symbol]);
  }

  return (
    <aside className="universe panel">
      <div className="section-heading">
        <div><p className="eyebrow">Market scope</p><h2>Coin universe</h2></div>
        <span className="count-badge">{selected.length}</span>
      </div>
      <label className="search-box"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets" aria-label="Search coins" /></label>
      <div className="segmented small"><button onClick={() => setFilter("All")} className={filter === "All" ? "active" : ""}>All assets</button><button onClick={() => setFilter("Selected")} className={filter === "Selected" ? "active" : ""}>My universe</button></div>
      <div className="coin-list">
        {visible.map((coin) => {
          const isSelected = selected.includes(coin.symbol);
          return (
            <div className={`coin-row ${active === coin.symbol ? "current" : ""}`} key={coin.symbol}>
              <button className={`coin-main ${active === coin.symbol ? "current" : ""}`} onClick={() => setActive(coin.symbol)}>
                <span className="coin-icon" style={{ background: `${coin.color}1c`, color: coin.color }}>{coin.icon}</span>
                <span className="coin-copy"><b>{coin.symbol}<small>/USDT</small></b><span>{coin.name}</span></span>
                <MiniSparkline positive={coin.change >= 0} />
                <span className="coin-price"><b>{formatPrice(coin.price)}</b><em className={coin.change >= 0 ? "up" : "down"}>{coin.change >= 0 ? "+" : ""}{coin.change.toFixed(2)}%</em></span>
              </button>
              <button className={`watch-toggle ${isSelected ? "selected" : ""}`} onClick={() => toggle(coin.symbol)} aria-label={`${isSelected ? "Remove" : "Add"} ${coin.name} ${isSelected ? "from" : "to"} universe`}>{isSelected ? "✓" : "+"}</button>
            </div>
          );
        })}
      </div>
      <div className="universe-foot"><span className="status-dot" />Strategy scans selected coins only</div>
    </aside>
  );
}

function trimAmount(value: number, decimals = 8) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

function OrderPanel({ coin, onOrder, liveTrading, quickRequest, assets, accountConnected, accountLoading }: { coin: Coin; onOrder: (order: Order, isLive: boolean) => void; liveTrading: boolean; quickRequest: { side: "Buy" | "Sell"; request: number }; assets: AccountAsset[]; accountConnected: boolean; accountLoading: boolean }) {
  const [side, setSide] = useState<"Buy" | "Sell">("Buy");
  const [type, setType] = useState<"Market" | "Limit">("Market");
  const [amount, setAmount] = useState("");
  const [limit, setLimit] = useState(String(coin.price));
  const [percent, setPercent] = useState(100);
  const [balanceSizing, setBalanceSizing] = useState(true);
  const [armed, setArmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState("");

  const availableUsdt = assets.find((asset) => asset.symbol === "USDT")?.free ?? 0;
  const availableCoin = assets.find((asset) => asset.symbol === coin.symbol)?.free ?? 0;
  const available = side === "Buy" ? availableUsdt : availableCoin;

  useEffect(() => { setLimit(String(coin.price)); setArmed(false); }, [coin.symbol]);
  useEffect(() => {
    if (!balanceSizing) return;
    const sized = available * percent / 100;
    setAmount(trimAmount(sized, side === "Buy" ? 8 : 8));
  }, [available, balanceSizing, percent, side]);
  useEffect(() => {
    if (!quickRequest.request) return;
    setSide(quickRequest.side);
    setPercent(100);
    setBalanceSizing(true);
    setArmed(false);
    window.setTimeout(() => document.getElementById("order-amount")?.focus(), 50);
  }, [quickRequest]);
  const amountValue = Number(amount) || 0;
  const priceValue = type === "Market" ? coin.price : Number(limit) || coin.price;
  const orderQuantity = side === "Buy" ? amountValue / priceValue : amountValue;
  const total = side === "Buy" ? amountValue : amountValue * priceValue;

  function chooseSide(nextSide: "Buy" | "Sell") {
    setSide(nextSide);
    setPercent(100);
    setBalanceSizing(true);
    setArmed(false);
    setOrderError("");
  }

  function sizeByPercent(nextPercent: number) {
    setPercent(nextPercent);
    setBalanceSizing(true);
    setArmed(false);
  }

  async function submit() {
    if (!amountValue || !orderQuantity) return;
    const displayOrder = { id: Date.now(), side, pair: `${coin.symbol}/USDT`, amount: orderQuantity, price: priceValue, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    if (!liveTrading) {
      onOrder(displayOrder, false);
      return;
    }
    if (!armed) {
      setArmed(true);
      return;
    }
    setSubmitting(true);
    setOrderError("");
    try {
      const response = await fetch("/api/binance/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: `${coin.symbol}USDT`,
          side: side.toUpperCase(),
          type: type.toUpperCase(),
          quantity: side === "Buy" ? orderQuantity : amountValue,
          quoteOrderQty: side === "Buy" && type === "Market" ? amountValue : undefined,
          price: type === "Limit" ? priceValue : undefined,
        }),
      });
      const payload = await response.json() as { error?: string; orderId?: number };
      if (!response.ok) throw new Error(payload.error || "Binance rejected the order");
      onOrder({ ...displayOrder, id: payload.orderId ?? displayOrder.id }, true);
      setArmed(false);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className="order-panel panel">
      <div className="section-heading"><div><p className="eyebrow">{liveTrading ? "Binance spot" : "Paper trading"}</p><h2>Quick order</h2></div><span className={`paper-badge ${liveTrading ? "live" : ""}`}>{liveTrading ? "LIVE" : "DEMO"}</span></div>
      <div className="side-tabs"><button className={side === "Buy" ? "buy active" : ""} onClick={() => chooseSide("Buy")}>Buy</button><button className={side === "Sell" ? "sell active" : ""} onClick={() => chooseSide("Sell")}>Sell</button></div>
      <div className="order-type"><button className={type === "Market" ? "active" : ""} onClick={() => { setType("Market"); setArmed(false); }}>Market</button><button className={type === "Limit" ? "active" : ""} onClick={() => { setType("Limit"); setArmed(false); }}>Limit</button></div>
      <div className="balance-row"><span>{accountConnected ? "Available balance" : "Binance balance"}</span><b>{accountLoading ? "Syncing…" : accountConnected ? `${available.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${side === "Buy" ? "USDT" : coin.symbol}` : "Unavailable"}</b></div>
      {type === "Limit" && <label className="field"><span>Limit price</span><div><input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" /><b>USDT</b></div></label>}
      <label className="field"><span>{side === "Buy" ? "Spend" : "Amount"}</span><div><input id="order-amount" value={amount} onChange={(e) => { setAmount(e.target.value); setBalanceSizing(false); setArmed(false); }} inputMode="decimal" placeholder="0" /><b>{side === "Buy" ? "USDT" : coin.symbol}</b></div></label>
      <div className="range-wrap">
        <input type="range" min="0" max="100" step="25" value={balanceSizing ? percent : 0} onChange={(e) => sizeByPercent(Number(e.target.value))} aria-label="Percentage of available balance" style={{ "--progress": `${balanceSizing ? percent : 0}%` } as React.CSSProperties} />
        <div className="range-labels">{[0, 25, 50, 75, 100].map((n) => <button key={n} className={balanceSizing && percent === n ? "active" : ""} onClick={() => sizeByPercent(n)}>{n}%</button>)}</div>
      </div>
      <div className="order-summary"><span>{side === "Buy" ? "Est. quantity" : "Est. total"}</span><strong>{side === "Buy" ? trimAmount(orderQuantity) : formatPrice(total)} <small>{side === "Buy" ? coin.symbol : "USDT"}</small></strong></div>
      <button className={`place-order ${side.toLowerCase()} ${armed ? "armed" : ""}`} onClick={submit} disabled={submitting || !amountValue}>{submitting ? "Sending…" : !amountValue ? "No balance available" : armed ? `Confirm live ${side}` : `${side} ${coin.symbol}`} <span>→</span></button>
      {orderError && <p className="order-error">{orderError}</p>}
      <div className="fee-note"><span>Est. fee · 0.10%</span><b>{formatPrice(total * 0.001)} USDT</b></div>
      <div className={`risk-note ${liveTrading ? "live" : ""}`}><span>◆</span><p><b>{liveTrading ? "Live trading enabled" : "Simulation only"}</b>{liveTrading ? "A second click is required before an order is sent." : "Set BINANCE_ENABLE_TRADING=true to enable real orders."}</p></div>
    </aside>
  );
}

function AccountAssets({ onTradingMode }: { onTradingMode: (enabled: boolean) => void }) {
  const [hideSmall, setHideSmall] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState("Just now");
  const [connected, setConnected] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [message, setMessage] = useState("Add Binance credentials to load your wallet.");
  const demoAssets: AccountAsset[] = [
    { symbol: "USDT", amount: 12480, free: 11280, locked: 1200, value: 12480 },
    { symbol: "BTC", amount: 0.248, free: 0.23, locked: 0.018, value: 16676.0 },
    { symbol: "ETH", amount: 2.64, free: 2.64, locked: 0, value: 9156.15 },
    { symbol: "SOL", amount: 18.5, free: 16, locked: 2.5, value: 3300.77 },
    { symbol: "BNB", amount: 0.013, free: 0.013, locked: 0, value: 7.73 },
  ];
  const [assets, setAssets] = useState<AccountAsset[]>(demoAssets);
  const shown = hideSmall ? assets.filter((asset) => asset.value > 10) : assets;
  const total = assets.reduce((sum, asset) => sum + asset.value, 0);
  const palette: Record<string, { name: string; icon: string; color: string }> = {
    USDT: { name: "Tether", icon: "₮", color: "#26a17b" },
    USDC: { name: "USD Coin", icon: "$", color: "#2775ca" },
    BTC: { name: "Bitcoin", icon: "₿", color: "#f7931a" },
    ETH: { name: "Ethereum", icon: "◆", color: "#627eea" },
    SOL: { name: "Solana", icon: "S", color: "#936cf7" },
    BNB: { name: "BNB", icon: "B", color: "#f3ba2f" },
  };
  const allocation = assets.filter((asset) => asset.value > 0).slice(0, 4).map((asset, index) => ({ ...asset, percent: total ? asset.value / total * 100 : 0, color: palette[asset.symbol]?.color ?? ["#8d73d8", "#4d91ac", "#d07688", "#7f8c8d"][index] }));

  async function sync() {
    setSyncing(true);
    try {
      const response = await fetch("/api/binance/account", { cache: "no-store" });
      const payload = await response.json() as { configured?: boolean; tradingEnabled?: boolean; assets?: AccountAsset[]; error?: string };
      setConfigured(Boolean(payload.configured));
      onTradingMode(Boolean(payload.tradingEnabled));
      if (!response.ok || !payload.assets) throw new Error(payload.error || "Unable to load Binance account");
      setAssets(payload.assets);
      setConnected(true);
      setMessage(payload.tradingEnabled ? "Live balances and order execution are enabled." : "Live balances loaded with trading disabled.");
      setLastSync(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (error) {
      setConnected(false);
      setMessage(error instanceof Error ? error.message : "Unable to load Binance account");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => { void sync(); }, []);

  return (
    <section className="portfolio panel" id="portfolio">
      <div className="portfolio-summary">
        <div className="portfolio-title"><div><p className="eyebrow">{connected ? "Binance account" : "Demo account"}</p><h2>Available assets</h2></div><button className={syncing ? "syncing" : ""} onClick={sync} aria-label="Refresh account balances">↻ <span>{syncing ? "Syncing" : `Synced ${lastSync}`}</span></button></div>
        <p className="balance-label">Estimated balance</p>
        <strong className="total-balance">${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        <div className="portfolio-change"><span className={connected ? "" : "demo-value"}>{connected ? "● Connected" : "● Demo values"}</span><small>valued in USDT</small></div>
        <div className="allocation-bar" aria-label="Portfolio allocation">{allocation.map((asset) => <i key={asset.symbol} style={{ width: `${asset.percent}%`, background: asset.color }} />)}</div>
        <div className="allocation-key">{allocation.map((asset) => <span key={asset.symbol}><i style={{ background: asset.color }} />{asset.symbol} {asset.percent.toFixed(1)}%</span>)}</div>
        <div className={`account-mode ${connected ? "connected" : ""}`}><span>⌁</span><p><b>{connected ? "Server-side connection active" : configured === false ? "Credentials not configured" : "Account connection"}</b>{message}</p></div>
      </div>
      <div className="asset-list">
        <div className="asset-head"><div><h3>Spot wallet</h3><span>{shown.length} assets</span></div><label><input type="checkbox" checked={hideSmall} onChange={(e) => setHideSmall(e.target.checked)} /> Hide small balances</label></div>
        <div className="asset-row labels"><span>Asset</span><span>Total balance</span><span>Available</span><span>In orders</span><span>Value</span></div>
        {shown.map((asset) => {
          const meta = palette[asset.symbol] ?? { name: asset.symbol, icon: asset.symbol[0], color: "#82909a" };
          return <div className="asset-row" key={asset.symbol}>
          <span className="asset-name"><i className="coin-icon" style={{ color: meta.color, background: `${meta.color}18` }}>{meta.icon}</i><b>{asset.symbol}<small>{meta.name}</small></b></span>
          <span><b>{asset.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</b></span>
          <span>{asset.free.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
          <span>{asset.locked.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
          <span><b>${asset.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></span>
        </div>})}
      </div>
    </section>
  );
}

export default function Home() {
  const [activeSymbol, setActiveSymbol] = useState("BTC");
  const [timeframe, setTimeframe] = useState("1H");
  const [orders, setOrders] = useState<Order[]>([]);
  const [tradeHistory, setTradeHistory] = useState<BinanceTradeHistory[]>([]);
  const [tradeHistoryLoading, setTradeHistoryLoading] = useState(true);
  const [tradeHistoryError, setTradeHistoryError] = useState("");
  const [tradeHistoryRefresh, setTradeHistoryRefresh] = useState(0);
  const [toast, setToast] = useState("");
  const [liveTrading, setLiveTrading] = useState(false);
  const [accountAssets, setAccountAssets] = useState<AccountAsset[]>([]);
  const [accountConnected, setAccountConnected] = useState(false);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountRefresh, setAccountRefresh] = useState(0);
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>("ema-cross");
  const [assignedStrategies, setAssignedStrategies] = useState<StrategyKey[]>(DEFAULT_STRATEGIES);
  const [signalConfig, setSignalConfig] = useState<SignalConfig | null>(null);
  const [quickRequest, setQuickRequest] = useState<{ side: "Buy" | "Sell"; request: number }>({ side: "Buy", request: 0 });
  const baseCoin = COINS.find((item) => item.symbol === activeSymbol) ?? COINS[0];
  const { candles, status: marketStatus, livePrice } = useBinanceCandles(baseCoin.symbol, baseCoin.price, timeframe);
  const coin = useMemo(() => ({ ...baseCoin, price: livePrice }), [baseCoin, livePrice]);
  const activeStrategyMeta = STRATEGY_CATALOG.find((strategy) => strategy.key === activeStrategy) ?? STRATEGY_CATALOG[0];
  const heldPosition = accountAssets.find((asset) => asset.symbol === coin.symbol && asset.amount > 0);
  const heldLastBuyPrice = heldPosition?.lastBuyPrice && heldPosition.lastBuyPrice > 0 ? heldPosition.lastBuyPrice : null;
  const positionEntryPrice = heldPosition?.averageBuyPrice && heldPosition.averageBuyPrice > 0 ? heldPosition.averageBuyPrice : heldLastBuyPrice;
  const positionEntryTime = heldPosition?.lastBuyTime ?? null;
  const minProfitPercent = signalConfig?.minProfitPercent ?? DEFAULT_SIGNAL_CONFIG.minProfitPercent;
  const trailingPullbackPercent = signalConfig?.trailingPullbackPercent ?? DEFAULT_SIGNAL_CONFIG.trailingPullbackPercent;
  const activeSignal = useMemo(() => strategySignals(activeStrategy, candles, { entryPrice: positionEntryPrice, entryTime: positionEntryTime, minProfitPercent, trailingPullbackPercent }), [activeStrategy, candles, positionEntryPrice, positionEntryTime, minProfitPercent, trailingPullbackPercent]);
  const signal = activeSignal.signal;
  const tradeSymbols = useMemo(() => Array.from(new Set([
    ...TRADE_HISTORY_SYMBOLS,
    ...accountAssets.filter((asset) => !["USDT", "USDC", "FDUSD", "TUSD"].includes(asset.symbol)).map((asset) => asset.symbol),
  ])).slice(0, 20).join(","), [accountAssets]);

  useEffect(() => {
    const signalConfigTimer = window.setTimeout(() => setSignalConfig(readSignalConfig()), 0);
    const refreshSignalConfig = () => setSignalConfig(readSignalConfig());
    window.addEventListener("storage", refreshSignalConfig);
    const saved = localStorage.getItem("tradepilot-universe");
    if (saved) {
      try {
        const symbols = JSON.parse(saved) as string[];
        if (symbols[0] && COINS.some((coin) => coin.symbol === symbols[0])) setActiveSymbol(symbols[0]);
      } catch { /* use defaults */ }
    }
    const preferred = localStorage.getItem("tradepilot-active-symbol");
    if (preferred && COINS.some((coin) => coin.symbol === preferred)) setActiveSymbol(preferred);
    try {
      const storedStrategies = localStorage.getItem(STRATEGY_STORAGE_KEY);
      const assigned = storedStrategies === null ? DEFAULT_STRATEGIES : JSON.parse(storedStrategies) as StrategyKey[];
      const valid = assigned.filter((key) => STRATEGY_CATALOG.some((strategy) => strategy.key === key));
      if (!valid.includes("profit-guard")) {
        valid.push("profit-guard");
        localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(valid));
      }
      if (valid.length) setAssignedStrategies(valid);
      const storedActive = localStorage.getItem(ACTIVE_STRATEGY_STORAGE_KEY) as StrategyKey | null;
      if (storedActive && STRATEGY_CATALOG.some((strategy) => strategy.key === storedActive)) setActiveStrategy(storedActive);
    } catch { /* use default strategy */ }
    return () => { window.clearTimeout(signalConfigTimer); window.removeEventListener("storage", refreshSignalConfig); };
  }, []);

  useEffect(() => {
    if (!signalConfig?.enabled || !signalConfig.chatId || !signalConfig.markets.length || !signalConfig.timeframes.length || !signalConfig.sides.length) return;
    let disposed = false;
    const seenSignals = new Map<string, string>();
    const controller = new AbortController();
    const strategyName = STRATEGY_CATALOG.find((item) => item.key === signalConfig.strategy)?.name ?? signalConfig.strategy;

    async function inspectMarket(symbol: string, frame: SignalTimeframe, position?: AccountAsset) {
      try {
        const response = await fetch(`/api/binance/klines?symbol=${symbol}USDT&interval=${BINANCE_INTERVAL[frame]}&limit=120`, { cache: "no-store", signal: controller.signal });
        if (!response.ok || disposed) return;
        const payload = await response.json() as { candles?: Array<Omit<Candle, "time">> };
        if (!payload.candles || payload.candles.length < 3 || disposed) return;
        const confirmedCandles = payload.candles.slice(0, -1).map((candle) => ({ ...candle, time: "" }));
        const entryPrice = position?.averageBuyPrice && position.averageBuyPrice > 0 ? position.averageBuyPrice : position?.lastBuyPrice;
        const result = strategySignals(signalConfig.strategy, confirmedCandles, {
          entryPrice,
          entryTime: position?.lastBuyTime,
          minProfitPercent: signalConfig.minProfitPercent,
          trailingPullbackPercent: signalConfig.trailingPullbackPercent,
        });
        const scope = `${symbol}:${frame}:${signalConfig.strategy}`;
        const index = Math.max(result.buy, result.sell);
        if (index < 0) {
          if (!seenSignals.has(scope)) seenSignals.set(scope, "NONE");
          return;
        }
        const side: SignalSide = result.buy >= result.sell ? "BUY" : "SELL";
        const candle = confirmedCandles[index];
        const eventId = `${side}:${candle.openTime}`;
        const previous = seenSignals.get(scope);
        seenSignals.set(scope, eventId);
        if (previous === undefined || previous === eventId || !signalConfig.sides.includes(side) || disposed) return;

        const deliveryId = `${scope}:${eventId}:${Date.now()}`;
        const deliveryResponse = await fetch("/api/signals/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: signalConfig.chatId, symbol, timeframe: frame, side, price: candle.close, strategy: strategyName, candleTime: candle.openTime, reason: result.reason }),
          signal: controller.signal,
        });
        const deliveryPayload = await deliveryResponse.json() as { delivered?: boolean; error?: string };
        if (disposed) return;
        const deliveryStatus = deliveryResponse.ok && deliveryPayload.delivered ? "sent" as const : "failed" as const;
        appendSignalDelivery({ id: deliveryId, sentAt: new Date().toISOString(), symbol, timeframe: frame, side, price: candle.close, strategy: strategyName, status: deliveryStatus, detail: deliveryPayload.error });
        setToast(deliveryStatus === "sent" ? `${side} ${symbol} signal delivered to Telegram` : deliveryPayload.error || "Telegram signal delivery failed");
        window.setTimeout(() => setToast(""), 3200);
      } catch (error) {
        if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) setToast("Signal scanner could not refresh market data");
      }
    }

    let scanning = false;
    async function scanConfiguredMarkets() {
      if (scanning || disposed) return;
      scanning = true;
      try {
        let positions = new Map<string, AccountAsset>();
        if (signalConfig.strategy === "profit-guard") {
          const requestedSymbols = encodeURIComponent(signalConfig.markets.join(","));
          const response = await fetch(`/api/binance/account?includeInsights=true&symbols=${requestedSymbols}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok || disposed) return;
          const payload = await response.json() as { assets?: AccountAsset[] };
          positions = new Map((payload.assets ?? []).filter((asset) => asset.amount > 0).map((asset) => [asset.symbol, asset]));
        }
        await Promise.all(signalConfig.markets.flatMap((symbol) => signalConfig.timeframes.map((frame) => inspectMarket(symbol, frame, positions.get(symbol)))));
      } catch (error) {
        if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) setToast("Signal scanner could not load held positions");
      } finally {
        scanning = false;
      }
    }

    void scanConfiguredMarkets();
    const scanInterval = window.setInterval(() => void scanConfiguredMarkets(), 30000);
    return () => { disposed = true; controller.abort(); window.clearInterval(scanInterval); };
  }, [signalConfig]);

  function changeStrategy(strategy: StrategyKey) {
    setActiveStrategy(strategy);
    localStorage.setItem(ACTIVE_STRATEGY_STORAGE_KEY, strategy);
  }

  useEffect(() => {
    let disposed = false;
    async function refreshAccount() {
      try {
        const refreshParam = accountRefresh ? "&refresh=true" : "";
        const response = await fetch(`/api/binance/account?includeInsights=true&symbol=${activeSymbol}${refreshParam}`, { cache: "no-store" });
        const payload = await response.json() as { tradingEnabled?: boolean; assets?: AccountAsset[] };
        if (!response.ok || !payload.assets) throw new Error("Account balance unavailable");
        if (disposed) return;
        setAccountAssets(payload.assets);
        setAccountConnected(true);
        setLiveTrading(Boolean(payload.tradingEnabled));
        if (accountRefresh) setAccountRefresh(0);
      } catch {
        if (!disposed) {
          setAccountConnected(false);
          setLiveTrading(false);
        }
      } finally {
        if (!disposed) setAccountLoading(false);
      }
    }
    void refreshAccount();
    const interval = window.setInterval(refreshAccount, 30000);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [accountRefresh, activeSymbol]);

  useEffect(() => {
    let disposed = false;
    async function refreshTradeHistory() {
      setTradeHistoryLoading(true);
      try {
        const response = await fetch(`/api/binance/trades?symbols=${encodeURIComponent(tradeSymbols)}&limit=1000`, { cache: "no-store" });
        const payload = await response.json() as { trades?: BinanceTradeHistory[]; error?: string; partialError?: string | null };
        if (!response.ok || !payload.trades) throw new Error(payload.error || "Unable to load Binance trade history");
        if (disposed) return;
        setTradeHistory(payload.trades);
        setTradeHistoryError(payload.partialError || "");
      } catch (error) {
        if (!disposed) setTradeHistoryError(error instanceof Error ? error.message : "Unable to load Binance trade history");
      } finally {
        if (!disposed) setTradeHistoryLoading(false);
      }
    }
    void refreshTradeHistory();
    const interval = window.setInterval(refreshTradeHistory, 60000);
    return () => { disposed = true; window.clearInterval(interval); };
  }, [tradeHistoryRefresh, tradeSymbols]);

  function addOrder(order: Order, isLive: boolean) {
    setOrders((current) => [order, ...current].slice(0, 3));
    setToast(`${isLive ? "Live" : "Simulated"} ${order.side.toLowerCase()} order for ${order.amount} ${coin.symbol}`);
    if (isLive) window.setTimeout(() => { setAccountRefresh(Date.now()); setTradeHistoryRefresh(Date.now()); }, 1500);
    window.setTimeout(() => setToast(""), 3200);
  }

  return (
    <main className="app-shell">
      <AppHeader active="dashboard" />

      <div className="market-strip">
        <span><i className="market-icon">{coin.icon}</i><b>{coin.symbol}</b> ${formatPrice(livePrice)} <em className={coin.change >= 0 ? "up" : "down"}>{coin.change >= 0 ? "+" : ""}{coin.change.toFixed(2)}%</em></span>
        <span><b>24h high</b> $68,422.10</span><span><b>24h low</b> $64,118.40</span><span><b>24h volume</b> 32.8B USDT</span>
        <span className="fear"><b>Market mood</b><i>72</i> Greed</span>
      </div>

      <div className="workspace dashboard-grid" id="trade">
        <div className="center-column">
          <section className="instrument-head panel">
            <div className="pair-title"><span className="coin-icon large" style={{ background: `${coin.color}1c`, color: coin.color }}>{coin.icon}</span><div><h1>{coin.symbol}<small>/USDT</small></h1><p>{coin.name} · Spot</p></div></div>
            <div className="live-price"><strong>${formatPrice(coin.price)}</strong><span className={coin.change >= 0 ? "up" : "down"}>{coin.change >= 0 ? "↗" : "↘"} {Math.abs(coin.change).toFixed(2)}%</span></div>
            <a className="change-market" href="/markets">Change market</a>
            <div className="timeframes">{TIMEFRAMES.map((item) => <button key={item} className={timeframe === item ? "active" : ""} onClick={() => setTimeframe(item)}>{item}</button>)}</div>
          </section>
          <MarketChart coin={coin} candles={candles} status={marketStatus} timeframe={timeframe} activeStrategy={activeStrategy} assignedStrategies={assignedStrategies} onStrategyChange={changeStrategy} lastBuyPrice={heldLastBuyPrice} positionAmount={heldPosition?.amount ?? 0} positionEntryPrice={positionEntryPrice} positionEntryTime={positionEntryTime} minProfitPercent={minProfitPercent} trailingPullbackPercent={trailingPullbackPercent} />
          <section className="strategy-card panel" id="strategy">
            <div className="strategy-accent"><span>✦</span></div>
            <div className="strategy-main">
              <div className="strategy-title"><div><p className="eyebrow">Active strategy</p><h2>{activeStrategyMeta.name} <span>{activeStrategyMeta.version}</span></h2></div><span className="running"><i />RUNNING</span></div>
              <p className="strategy-copy">{activeStrategyMeta.description} Signals are calculated from live candles and wait for a confirmed crossover or threshold event.</p>
              <div className="strategy-metrics"><span><small>Current signal</small><b className={signal === "BUY" ? "buy-text" : signal === "SELL" ? "sell-text" : "hold-text"}>{signal} · Live</b></span><span><small>Market feed</small><b>{marketStatus === "live" ? "Connected" : "Waiting"}</b></span><span><small>{activeStrategy === "profit-guard" ? "Guard state" : "Risk / reward"}</small><b>{activeStrategy === "profit-guard" ? activeSignal.activated ? "Armed" : "Waiting" : "1 : 2.0"}</b></span><span><small>Timeframe</small><b>{timeframe}</b></span></div>
            </div>
            {activeStrategy === "profit-guard" ? <div className="strategy-levels"><div><span>Cost basis</span><b>{activeSignal.entryPrice ? `$${formatPrice(activeSignal.entryPrice)}` : "Not available"}</b></div><div><span>Arms at +{minProfitPercent}%</span><b className="up">{activeSignal.activationPrice ? `$${formatPrice(activeSignal.activationPrice)}` : "—"}</b></div><div><span>Trailing floor</span><b className={activeSignal.trailingStop ? "down" : ""}>{activeSignal.trailingStop ? `$${formatPrice(activeSignal.trailingStop)}` : `${trailingPullbackPercent}% below peak`}</b></div><div className="strategy-reason"><span>Status</span><b>{activeSignal.reason}</b></div></div> : <div className="strategy-levels"><div><span>Entry zone</span><b>${formatPrice(livePrice * .997)} – ${formatPrice(livePrice * 1.003)}</b></div><div><span>Stop loss</span><b className="down">${formatPrice(livePrice * (signal === "BUY" ? .98 : 1.02))}</b></div><div><span>Take profit</span><b className="up">${formatPrice(livePrice * (signal === "BUY" ? 1.04 : .96))}</b></div></div>}
          </section>
        </div>
        <div className="trade-column">
          <section className="quick-trade panel">
            <div><p className="eyebrow">Quick trade</p><h2>Choose direction</h2><span>Prefills the full order ticket below.</span></div>
            <div className="quick-trade-buttons">
              <button className="quick-buy" onClick={() => setQuickRequest({ side: "Buy", request: Date.now() })}>Buy</button>
              <button className="quick-sell" onClick={() => setQuickRequest({ side: "Sell", request: Date.now() })}>Sell</button>
            </div>
          </section>
          <OrderPanel coin={coin} onOrder={addOrder} liveTrading={liveTrading} quickRequest={quickRequest} assets={accountAssets} accountConnected={accountConnected} accountLoading={accountLoading} />
        </div>
      </div>

      <section className="activity panel" id="orders">
        <div className="activity-head"><div><p className="eyebrow">Binance spot account</p><h2>Trade history <span>{tradeHistory.length} fills</span></h2></div><button onClick={() => setTradeHistoryRefresh(Date.now())} disabled={tradeHistoryLoading}>{tradeHistoryLoading ? "Refreshing…" : "Refresh trades ↻"}</button></div>
        {tradeHistoryError && <div className="activity-error">{tradeHistoryError}</div>}
        <div className="activity-table activity-table-scroll">
          <div className="table-row trade-history-row table-head"><span>Pair</span><span>Side</span><span>Amount</span><span>Price</span><span>Total</span><span>Fee</span><span>Date & time</span></div>
          {tradeHistory.map((trade) => <div className="table-row trade-history-row" key={trade.id}><span><b>{trade.symbol}</b> /USDT</span><span className={trade.side === "Buy" ? "buy-text" : "sell-text"}>{trade.side}</span><span>{trade.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })}</span><span>${formatPrice(trade.price)}</span><span>${trade.quoteAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><span>{trade.commission.toLocaleString(undefined, { maximumFractionDigits: 8 })} {trade.commissionAsset}</span><span>{new Date(trade.time).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>)}
          {!tradeHistoryLoading && !tradeHistory.length && orders.map((order) => <div className="table-row trade-history-row" key={`session-${order.id}`}><span><b>{order.pair.split("/")[0]}</b> /USDT</span><span className={order.side === "Buy" ? "buy-text" : "sell-text"}>{order.side}</span><span>{order.amount}</span><span>${formatPrice(order.price)}</span><span>${(order.amount * order.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><span>—</span><span>{order.time} · This session</span></div>)}
          {!tradeHistoryLoading && !tradeHistory.length && !orders.length && <div className="activity-empty"><span>↗</span><b>No matching Binance fills found</b><p>Trades from the configured coin universe and current wallet assets will appear here.</p></div>}
        </div>
      </section>

      <footer><p>TradePilot is a decision-support prototype, not financial advice. Test strategies before risking capital.</p><span>Strategy engine <i /> Operational</span></footer>
      {toast && <div className="toast"><span>✓</span><div><b>{toast.includes("Telegram") ? "Signal notification" : toast.startsWith("Live") ? "Order accepted" : "Order simulated"}</b><p>{toast}</p></div></div>}
    </main>
  );
}
