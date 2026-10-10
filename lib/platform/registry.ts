import type { PluginDescriptor } from "./contracts";
import { DATA_PROVIDER_PLUGINS, IMPORT_PROVIDER_DESCRIPTORS } from "./data";
import { INDICATOR_PLUGINS } from "./indicators";
import { STRATEGY_PLUGINS } from "./strategies";

const descriptor = (id: string, name: string, kind: PluginDescriptor["kind"], description: string, version = "1.0.0"): PluginDescriptor => ({ id, name, kind, description, version, interfaceVersion: "1.0", deterministic: true });

export const SUPPORT_PLUGINS: PluginDescriptor[] = [
  descriptor("binance", "Binance Venue", "venue", "Venue metadata, symbol rules, and paper-only execution boundary for Binance Spot and USD-M Futures."),
  descriptor("generic-market", "Generic Market Venue", "venue", "Venue-independent imported datasets for spot, futures, and commodities."),
  descriptor("max-exposure-drawdown", "Exposure & Drawdown Risk", "risk", "Portfolio and strategy exposure caps with drawdown circuit breaker."),
  descriptor("next-bar", "Next-Bar Execution", "execution", "Deterministic next-open or next-close execution with incomplete-bar protection."),
  descriptor("volume-participation", "Volume Participation", "execution", "Liquidity-aware partial fills capped by candle volume participation."),
  descriptor("basis-points-fee", "Basis-Points Fee", "fee", "Configurable maker/taker-style proportional fees."),
  descriptor("fixed-spread", "Fixed Spread", "slippage", "Configurable half-spread applied to simulated fills."),
  descriptor("volume-impact", "Volume Impact", "slippage", "Order-size impact scaled by available simulated liquidity."),
  descriptor("fixed-weight", "Fixed Weighted Ensemble", "ai-model", "User-defined normalized strategy weights."),
  descriptor("optimized-weight", "Optimized Weighted Ensemble", "ai-model", "Seeded validation-loss optimization of strategy weights."),
  descriptor("logistic-regression", "Logistic Regression Meta-Model", "ai-model", "Regularized probability model trained chronologically."),
  descriptor("random-forest", "Random Forest Meta-Model", "ai-model", "Seeded bagged decision-stump ensemble."),
  descriptor("gradient-boosted-tree", "Gradient-Boosted Tree Meta-Model", "ai-model", "Sequential residual-fitting decision-stump ensemble."),
  descriptor("neural-network", "Neural Network Meta-Model", "ai-model", "Optional portable neural model contract; native runtime activation is deployment-specific."),
  ...["net-return", "annualized-return", "maximum-drawdown", "sharpe", "sortino", "calmar", "profit-factor", "win-rate", "expectancy", "turnover", "value-at-risk"].map((id) => descriptor(id, id.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "), "metric", `Deterministic ${id.replaceAll("-", " ")} performance metric.`)),
];

export function pluginCatalog() {
  const providerDescriptors: PluginDescriptor[] = DATA_PROVIDER_PLUGINS.map((plugin) => ({ id: plugin.id, name: plugin.name, kind: "data-provider", version: plugin.version, interfaceVersion: "1.0", description: plugin.description, deterministic: true }));
  providerDescriptors.push(...IMPORT_PROVIDER_DESCRIPTORS.map((plugin) => ({ ...plugin, kind: "data-provider" as const, deterministic: true })));
  return [...providerDescriptors, ...INDICATOR_PLUGINS, ...STRATEGY_PLUGINS, ...SUPPORT_PLUGINS].map((plugin) => {
    const required = ["id", "name", "kind", "version", "interfaceVersion", "description", "deterministic"] as const; for (const field of required) if (!(field in plugin)) throw new Error(`Invalid plugin descriptor missing ${field}`); if (plugin.interfaceVersion !== "1.0") throw new Error(`Plugin ${plugin.id} uses an unsupported interface version`); return plugin;
  });
}

export function catalogByKind() {
  return Object.groupBy(pluginCatalog(), (plugin) => plugin.kind);
}
