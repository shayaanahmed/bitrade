export const PLATFORM_COMPATIBILITY_VERSION = "1.0";

export type MarketType = "spot" | "futures" | "commodity";
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
export type PluginKind = "venue" | "data-provider" | "indicator" | "strategy" | "risk" | "execution" | "fee" | "slippage" | "ai-model" | "metric";

export interface PluginDescriptor {
  id: string;
  name: string;
  kind: PluginKind;
  version: string;
  interfaceVersion: typeof PLATFORM_COMPATIBILITY_VERSION;
  description: string;
  deterministic: boolean;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
  timeframe: Timeframe;
  complete: boolean;
  fundingRate?: number;
  openInterest?: number;
}

export interface DataDependency {
  requiredFields: Array<keyof Candle>;
  marketTypes: MarketType[];
  timeframes: Timeframe[] | "any";
  warmupBars: number;
  sources: Array<"candles" | "trades" | "funding" | "open-interest" | "order-book">;
  indicators: string[];
}

export interface ParameterDefinition {
  type: "number" | "integer" | "boolean" | "string" | "enum";
  default: number | boolean | string;
  minimum?: number;
  maximum?: number;
  options?: string[];
  description: string;
}

export type Parameters = Record<string, number | boolean | string>;

export interface IndicatorPlugin extends PluginDescriptor {
  kind: "indicator";
  requiredColumns: Array<keyof Candle>;
  parameters: Record<string, ParameterDefinition>;
  warmup: (parameters: Parameters) => number;
  outputColumns: string[];
  missingValuePolicy: "null-until-warmup" | "carry-forward" | "zero";
  calculate(candles: readonly Candle[], parameters?: Parameters): Record<string, Array<number | null>>;
}

export interface StrategySignal {
  timestamp: number;
  direction: -1 | 0 | 1;
  confidence: number;
  desiredExposure: number;
  stop?: number;
  target?: number;
  metadata?: Record<string, string | number | boolean>;
  strategyId: string;
  strategyVersion: string;
  configurationVersion: string;
}

export interface StrategyPlugin extends PluginDescriptor {
  kind: "strategy";
  dependencies: DataDependency;
  parameters: Record<string, ParameterDefinition>;
  generate(candles: readonly Candle[], parameters?: Parameters): StrategySignal[];
}

export interface DatasetManifest {
  id: string;
  provider: string;
  marketType: MarketType;
  canonicalSymbol: string;
  providerSymbol: string;
  timeframe: Timeframe;
  start: number;
  end: number;
  rows: number;
  retrievedAt: string;
  normalizationVersion: string;
  schemaVersion: string;
  checksum: string;
  quality: DataQualityReport;
}

export interface DataQualityReport {
  valid: boolean;
  gaps: Array<{ after: number; before: number; missingBars: number }>;
  duplicates: number[];
  invalidOhlc: number[];
  incomplete: number[];
  outliers: Array<{ timestamp: number; returnPercent: number }>;
}

export interface ExperimentConfiguration {
  id?: string;
  provider: string;
  marketType: MarketType;
  symbols: string[];
  timeframe: Timeframe;
  start: number;
  end: number;
  strategies: Array<{ id: string; parameters?: Parameters }>;
  initialCash: number;
  leverage: number;
  feeBps: number;
  spreadBps: number;
  slippageBps: number;
  maxExposure: number;
  maxDrawdown: number;
  executionTiming: "next-open" | "next-close";
  seed: number;
}

export interface Trade {
  id: string;
  strategyId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  requestedPrice: number;
  fillPrice: number;
  timestamp: number;
  fee: number;
  slippage: number;
  realizedPnl: number;
}

export interface PerformanceMetrics {
  grossReturn: number;
  netReturn: number;
  annualizedReturn: number;
  buyAndHoldReturn: number;
  maximumDrawdown: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  profitFactor: number;
  winRate: number;
  expectancy: number;
  averageWin: number;
  averageLoss: number;
  trades: number;
  exposureTime: number;
  turnover: number;
  fees: number;
  funding: number;
  slippage: number;
  valueAtRisk95: number;
}

export interface BacktestResult {
  id: string;
  configuration: ExperimentConfiguration;
  datasetIds: string[];
  codeVersion: string;
  createdAt: string;
  signals: StrategySignal[];
  trades: Trade[];
  equity: Array<{ timestamp: number; equity: number; cash: number; exposure: number }>;
  metrics: PerformanceMetrics;
  monthlyReturns: Record<string, number>;
  annualReturns: Record<string, number>;
  fundingPayments?: Array<{ timestamp: number; symbol: string; amount: number }>;
  strategyResults?: Array<{ strategyId: string; metrics: PerformanceMetrics; equity: BacktestResult["equity"] }>;
}

export interface ModelPrediction {
  timestamp: number;
  expectedReturn: number;
  probabilityProfitable: number;
  direction: -1 | 0 | 1;
  targetExposure: number;
}

export interface SerializableModel {
  id: string;
  type: "fixed-weight" | "optimized-weight" | "logistic-regression" | "random-forest" | "gradient-boosted-tree" | "neural-network";
  version: string;
  featureNames: string[];
  parameters: Record<string, unknown>;
  predict(features: number[][], timestamps?: number[]): ModelPrediction[];
  serialize(): Record<string, unknown>;
}
