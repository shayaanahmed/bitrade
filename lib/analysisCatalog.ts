export type IndicatorKey = "ema9" | "ema21" | "sma20" | "bollinger" | "volume" | "rsi" | "vwap" | "macd" | "stochastic" | "atr";
export type StrategyKey = "ema-cross" | "macd-trend" | "rsi-reversal" | "bollinger-breakout" | "vwap-pullback" | "triple-ma" | "profit-guard";

export type IndicatorDefinition = {
  key: IndicatorKey;
  name: string;
  shortName: string;
  description: string;
  category: "Trend" | "Momentum" | "Volatility" | "Volume";
  placement: "Price chart" | "Lower panel";
  settings: string;
  bestFor: string;
};

export type StrategyDefinition = {
  key: StrategyKey;
  name: string;
  version: string;
  description: string;
  category: "Trend" | "Momentum" | "Breakout" | "Mean reversion";
  indicators: string[];
  bestFor: string;
  risk: "Low" | "Medium" | "High";
};

export const INDICATOR_STORAGE_KEY = "tradepilot-chart-indicators";
export const STRATEGY_STORAGE_KEY = "tradepilot-chart-strategies";
export const ACTIVE_STRATEGY_STORAGE_KEY = "tradepilot-active-strategy";

export const DEFAULT_INDICATORS: IndicatorKey[] = ["ema9", "ema21", "volume"];
export const DEFAULT_STRATEGIES: StrategyKey[] = ["ema-cross", "profit-guard"];

export const INDICATOR_CATALOG: IndicatorDefinition[] = [
  { key: "ema9", name: "Exponential Moving Average 9", shortName: "EMA 9", description: "A fast moving average that reacts quickly to recent price changes.", category: "Trend", placement: "Price chart", settings: "Length 9 · Close", bestFor: "Short-term momentum" },
  { key: "ema21", name: "Exponential Moving Average 21", shortName: "EMA 21", description: "A smoother trend line used to confirm momentum and dynamic support.", category: "Trend", placement: "Price chart", settings: "Length 21 · Close", bestFor: "Trend confirmation" },
  { key: "sma20", name: "Simple Moving Average 20", shortName: "SMA 20", description: "The equal-weighted average closing price over the last twenty candles.", category: "Trend", placement: "Price chart", settings: "Length 20 · Close", bestFor: "Baseline trend" },
  { key: "bollinger", name: "Bollinger Bands", shortName: "BB 20", description: "A volatility envelope two standard deviations around the 20-period average.", category: "Volatility", placement: "Price chart", settings: "Length 20 · Deviation 2", bestFor: "Breakouts and compression" },
  { key: "volume", name: "Trading Volume", shortName: "Volume", description: "Shows the traded quantity for every candle and confirms participation.", category: "Volume", placement: "Lower panel", settings: "Exchange volume", bestFor: "Signal confirmation" },
  { key: "rsi", name: "Relative Strength Index", shortName: "RSI 14", description: "Momentum oscillator with traditional 70 overbought and 30 oversold zones.", category: "Momentum", placement: "Lower panel", settings: "Length 14 · 70/30", bestFor: "Momentum extremes" },
  { key: "vwap", name: "Volume Weighted Average Price", shortName: "VWAP", description: "Cumulative average price weighted by volume for the loaded chart session.", category: "Volume", placement: "Price chart", settings: "Typical price · Session", bestFor: "Intraday fair value" },
  { key: "macd", name: "Moving Average Convergence Divergence", shortName: "MACD", description: "The difference between 12 and 26 EMAs with a 9-period signal line.", category: "Momentum", placement: "Lower panel", settings: "12 · 26 · 9", bestFor: "Trend and momentum shifts" },
  { key: "stochastic", name: "Stochastic Oscillator", shortName: "Stoch 14", description: "Compares the close with its recent high-low range to reveal momentum turns.", category: "Momentum", placement: "Lower panel", settings: "14 · Smooth 3", bestFor: "Range reversals" },
  { key: "atr", name: "Average True Range", shortName: "ATR 14", description: "Measures realized price range and helps size stops for current volatility.", category: "Volatility", placement: "Lower panel", settings: "Length 14", bestFor: "Stops and position sizing" },
];

export const STRATEGY_CATALOG: StrategyDefinition[] = [
  { key: "profit-guard", name: "Profit Guard", version: "v1.0", description: "Arms after a held asset reaches the minimum profit, then signals SELL when price pulls back from its peak or EMA 9 crosses below EMA 21.", category: "Trend", indicators: ["Position cost basis", "Peak trailing stop", "EMA 9", "EMA 21"], bestFor: "Protecting gains on an existing spot position", risk: "Low" },
  { key: "ema-cross", name: "Momentum Cross", version: "v1.2", description: "Signals when EMA 9 crosses EMA 21 to identify a change in short-term trend.", category: "Trend", indicators: ["EMA 9", "EMA 21"], bestFor: "Liquid markets with directional movement", risk: "Medium" },
  { key: "macd-trend", name: "MACD Trend Shift", version: "v1.0", description: "Uses MACD and its signal line to identify momentum moving with the broader trend.", category: "Momentum", indicators: ["MACD 12/26/9"], bestFor: "1H and 4H trend changes", risk: "Medium" },
  { key: "rsi-reversal", name: "RSI Reversal", version: "v1.0", description: "Looks for RSI leaving oversold or overbought territory before marking a reversal.", category: "Mean reversion", indicators: ["RSI 14"], bestFor: "Sideways and range-bound markets", risk: "High" },
  { key: "bollinger-breakout", name: "Bollinger Breakout", version: "v1.1", description: "Flags closes outside the volatility bands after compression and expansion.", category: "Breakout", indicators: ["Bollinger Bands", "Volume"], bestFor: "Volatility expansion", risk: "High" },
  { key: "vwap-pullback", name: "VWAP Pullback", version: "v1.0", description: "Tracks price reclaiming or losing session VWAP after a pullback.", category: "Mean reversion", indicators: ["VWAP", "Volume"], bestFor: "Intraday trading", risk: "Medium" },
  { key: "triple-ma", name: "Triple Average Trend", version: "v1.0", description: "Requires price, EMA 9, EMA 21, and SMA 20 to align before producing a signal.", category: "Trend", indicators: ["EMA 9", "EMA 21", "SMA 20"], bestFor: "Strong established trends", risk: "Low" },
];
