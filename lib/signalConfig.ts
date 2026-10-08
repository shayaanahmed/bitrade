import { STRATEGY_CATALOG, type StrategyKey } from "./analysisCatalog";

export const SIGNAL_CONFIG_STORAGE_KEY = "tradepilot-signal-config";

export const SIGNAL_TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D"] as const;
export const SIGNAL_MARKETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX", "LINK"] as const;
export type SignalTimeframe = typeof SIGNAL_TIMEFRAMES[number];
export type SignalSide = "BUY" | "SELL";
export type SignalStrategyMode = "individual" | "consensus";

export type SignalConfig = {
  enabled: boolean;
  destination: "telegram";
  chatId: string;
  strategy: StrategyKey;
  strategies: StrategyKey[];
  strategyMode: SignalStrategyMode;
  consensusMinimum: number;
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
  strategies: ["ema-cross"],
  strategyMode: "individual",
  consensusMinimum: 2,
  timeframes: ["1H", "4H"],
  markets: ["BTC", "ETH", "SOL"],
  sides: ["BUY", "SELL"],
  minProfitPercent: 2,
  trailingPullbackPercent: 1.5,
};

export function normalizeSignalConfig(value: unknown): SignalConfig {
  const parsed = value && typeof value === "object" ? value as Partial<SignalConfig> : {};
  const allowedStrategies = new Set(STRATEGY_CATALOG.map((item) => item.key));
  const legacyStrategy = parsed.strategy && allowedStrategies.has(parsed.strategy) ? parsed.strategy : DEFAULT_SIGNAL_CONFIG.strategy;
  const strategies = Array.isArray(parsed.strategies)
    ? parsed.strategies.filter((item): item is StrategyKey => allowedStrategies.has(item as StrategyKey))
    : [legacyStrategy];
  const selectedStrategies = strategies.length ? [...new Set(strategies)] : [legacyStrategy];
  const strategy = selectedStrategies[0];
  const onlyProfitGuard = selectedStrategies.every((item) => item === "profit-guard");
  const timeframes = Array.isArray(parsed.timeframes)
    ? SIGNAL_TIMEFRAMES.filter((item) => parsed.timeframes?.includes(item))
    : DEFAULT_SIGNAL_CONFIG.timeframes;
  const allowedMarkets = new Set<string>(SIGNAL_MARKETS);
  const markets = Array.isArray(parsed.markets)
    ? [...new Set(parsed.markets.filter((item): item is string => typeof item === "string" && allowedMarkets.has(item)))]
    : DEFAULT_SIGNAL_CONFIG.markets;
  const sides = Array.isArray(parsed.sides)
    ? (["BUY", "SELL"] as SignalSide[]).filter((item) => parsed.sides?.includes(item))
    : DEFAULT_SIGNAL_CONFIG.sides;
  return {
    ...DEFAULT_SIGNAL_CONFIG,
    enabled: parsed.enabled === true,
    chatId: typeof parsed.chatId === "string" ? parsed.chatId.trim() : "",
    strategy,
    strategies: selectedStrategies,
    strategyMode: parsed.strategyMode === "consensus" ? "consensus" : "individual",
    consensusMinimum: Math.max(1, Math.min(selectedStrategies.length, Number(parsed.consensusMinimum) || Math.min(2, selectedStrategies.length))),
    destination: "telegram",
    timeframes,
    markets,
    sides: onlyProfitGuard ? ["SELL"] : sides,
    minProfitPercent: Number.isFinite(parsed.minProfitPercent) ? Math.max(0.1, Math.min(100, Number(parsed.minProfitPercent))) : DEFAULT_SIGNAL_CONFIG.minProfitPercent,
    trailingPullbackPercent: Number.isFinite(parsed.trailingPullbackPercent) ? Math.max(0.1, Math.min(50, Number(parsed.trailingPullbackPercent))) : DEFAULT_SIGNAL_CONFIG.trailingPullbackPercent,
  };
}

export function readSignalConfig(): SignalConfig {
  try {
    const stored = localStorage.getItem(SIGNAL_CONFIG_STORAGE_KEY);
    if (!stored) return DEFAULT_SIGNAL_CONFIG;
    return normalizeSignalConfig(JSON.parse(stored));
  } catch {
    return DEFAULT_SIGNAL_CONFIG;
  }
}
