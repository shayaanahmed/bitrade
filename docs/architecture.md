# TradePilot Research Architecture

TradePilot Research is an additive modular monolith. The original dashboard, alert scanner, strategies, wallet, and market views remain intact. The research surface is linked from the existing header and uses the same Vinext application and deployment.

## Boundaries

- `lib/platform/contracts.ts` is the compatibility-1.0 SDK.
- `data.ts` owns provider normalization, coverage, quality, and manifests.
- `indicators.ts` and `strategies.ts` are deterministic plugins with no I/O.
- `backtest.ts` owns portfolio accounting and next-bar simulation.
- `ensemble.ts` owns chronological splitting, walk-forward evaluation, estimators, and portable bundles.
- `paper.ts` owns the restart-safe paper state machine.
- `store.ts` is the only operational D1/R2 adapter.
- `app/api/platform/*` validates HTTP input and orchestrates core modules.

Provider and strategy branches live only inside their plugins. Prediction emits venue-independent expected return, profitability, direction, and target exposure. Risk policy converts prediction to allowed exposure. Simulated execution converts allowed exposure to orders and fills. Real-money execution is absent and the legacy endpoint returns HTTP 410.

## Data layers

1. Raw: immutable provider response or imported CSV/Parquet bytes in R2, keyed by provider, market, symbol, timeframe, and snapshot.
2. Normalized: canonical UTC candle schema with provider symbol retained in the manifest.
3. Features: indicator and strategy outputs identified by implementation and configuration versions.
4. Labels: matured future outcomes generated after the configured horizon and never accepted as features.
5. Operational: D1 tables for datasets, jobs, experiments, models, transitions, paper sessions/events, and audit events.

Snapshot IDs derive from deterministic checksums. Derived artifacts are never overwritten. D1 migration `drizzle/0000_uneven_naoko.sql` creates all operational tables and indexes.

## Execution model

Signals calculated at bar `t` may first execute at bar `t+1`. Incomplete bars are rejected. Fills include half-spread, size-dependent slippage, percentage fees, a 10% volume-participation cap, exposure bounds, spot short prevention, leverage validation, and a drawdown circuit breaker. Monetary state is rounded to eight decimal places after cash and position mutations.

The reusable execution plugin supports market, limit, stop, and stop-limit orders, tick/lot/minimum-notional rules, rejection, IOC/GTC behavior, and liquidity-driven partial fills. Futures runs apply signed funding rates to open positions and include them in net metrics.

## Model lifecycle

Samples are sorted and required to have unique increasing timestamps. Train, validation, and test are contiguous. Purging removes observations from split ends; embargo leaves a gap before the next split. Walk-forward folds only expand forward. Test data is evaluated after fitting and is never optimized against.

New models enter as challengers. Promotion archives the current champion in one controlled workflow and records the actor, reason, old status, and new status. Rejected artifacts cannot be promoted. Rollback archives a champion without deleting it.

Retraining reads immutable paper events, waits until the configured horizon has matured, combines those labeled observations with explicitly supplied approved history, hashes a new dataset version, evaluates a challenger, and promotes only when automatic promotion was explicitly enabled and configured accuracy/Brier rules pass.
