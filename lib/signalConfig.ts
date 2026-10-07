import type { StrategyKey } from "./analysisCatalog";

export const SIGNAL_CONFIG_STORAGE_KEY = "tradepilot-signal-config";
export const SIGNAL_DELIVERY_LOG_KEY = "tradepilot-signal-delivery-log";

export const SIGNAL_TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D"] as const;
export type SignalTimeframe = typeof SIGNAL_TIMEFRAMES[number];
export type SignalSide = "BUY" | "SELL";

export type SignalConfig = {
  enabled: boolean;
  destination: "telegram";
  chatId: string;
  strategy: StrategyKey;
  timeframes: SignalTimeframe[];
  markets: string[];
  sides: SignalSide[];
  minProfitPercent: number;
  trailingPullbackPercent: number;
};

export type SignalDelivery = {
  id: string;
  sentAt: string;
  symbol: string;
  timeframe: string;
  side: SignalSide;
  price: number;
  strategy: string;
  status: "sent" | "failed";
  detail?: string;
};

export const DEFAULT_SIGNAL_CONFIG: SignalConfig = {
  enabled: false,
  destination: "telegram",
  chatId: "",
  strategy: "ema-cross",
  timeframes: ["1H", "4H"],
  markets: ["BTC", "ETH", "SOL"],
  sides: ["BUY", "SELL"],
  minProfitPercent: 2,
  trailingPullbackPercent: 1.5,
};

export function readSignalConfig(): SignalConfig {
  try {
    const stored = localStorage.getItem(SIGNAL_CONFIG_STORAGE_KEY);
    if (!stored) return DEFAULT_SIGNAL_CONFIG;
    const parsed = JSON.parse(stored) as Partial<SignalConfig>;
    const strategy = parsed.strategy ?? DEFAULT_SIGNAL_CONFIG.strategy;
    return {
      ...DEFAULT_SIGNAL_CONFIG,
      ...parsed,
      strategy,
      destination: "telegram",
      timeframes: SIGNAL_TIMEFRAMES.filter((item) => parsed.timeframes?.includes(item)),
      markets: Array.isArray(parsed.markets) ? parsed.markets.filter((item): item is string => typeof item === "string") : DEFAULT_SIGNAL_CONFIG.markets,
      sides: strategy === "profit-guard" ? ["SELL"] : (["BUY", "SELL"] as SignalSide[]).filter((item) => parsed.sides?.includes(item)),
      minProfitPercent: Number.isFinite(parsed.minProfitPercent) ? Math.max(0.1, Math.min(100, Number(parsed.minProfitPercent))) : DEFAULT_SIGNAL_CONFIG.minProfitPercent,
      trailingPullbackPercent: Number.isFinite(parsed.trailingPullbackPercent) ? Math.max(0.1, Math.min(50, Number(parsed.trailingPullbackPercent))) : DEFAULT_SIGNAL_CONFIG.trailingPullbackPercent,
    };
  } catch {
    return DEFAULT_SIGNAL_CONFIG;
  }
}

export function appendSignalDelivery(delivery: SignalDelivery) {
  try {
    const current = JSON.parse(localStorage.getItem(SIGNAL_DELIVERY_LOG_KEY) || "[]") as SignalDelivery[];
    localStorage.setItem(SIGNAL_DELIVERY_LOG_KEY, JSON.stringify([delivery, ...current].slice(0, 20)));
  } catch {
    localStorage.setItem(SIGNAL_DELIVERY_LOG_KEY, JSON.stringify([delivery]));
  }
}
