# Acceptance Report — 2026-10-10

## Outcome

The original TradePilot dashboard, strategy library, Telegram signals, market universe, wallet, scanner, and guarded quick-order endpoint remain available. The research system is additive under **Research** and uses paper-only execution; it does not call or alter the separately opt-in quick-order workflow.

## Delivered and verified

- Versioned compatibility-1.0 SDK and discovery for every required plugin kind.
- Binance Spot, Binance USD-M Futures, Alpha Vantage commodity, CSV, and Apache Parquet data sources.
- Completed-bar normalization, gap/duplicate/OHLC/boundary/outlier checks, manifests, checksums, and missing-coverage calculation.
- 18 deterministic indicators and 11 normalized-signal strategies with prefix-stability leakage tests.
- Multi-symbol portfolio simulator with next-bar timing, long/short market rules, leverage/exposure/drawdown validation, fees, spread, volume impact, partial fills, futures funding, and independent-strategy comparison.
- Reusable market, limit, stop, and stop-limit execution with tick, lot, minimum quantity/notional, liquidity, rejection, and IOC/GTC handling.
- Risk-adjusted metrics, monthly/annual returns, reproducible datasets/configuration/code/seed records.
- Fixed/optimized weights, logistic regression, random forest, and gradient-boosted tree contracts; chronological splits, purge, embargo, walk-forward folds, calibration metric, baseline, and deterministic seeds.
- Immutable D1/R2-backed experiment, job, model, transition, paper-event, dataset, and audit storage with checked-in migration.
- Bundle manifest, safe JSON native model, ordered feature schema, checksums, model card, sample vectors, and import parity rejection.
- Recoverable paper session state, exact bundled features, live completed-candle scan, duplicate/out-of-order protection, costs, risk controls, and emergency stop.
- Matured paper-observation retraining, immutable combined dataset version, challenger comparison, explicit automatic-promotion eligibility, and rollback history.
- Data, Plugin, Experiment, Job, Result, Training, Model, Paper, and Settings interfaces plus health/Prometheus endpoints.
- Compose persistence, user/operator/security/backup documentation, provider configuration, and paper-only enforcement.

## Commands executed

| Command | Result |
| --- | --- |
| `npm run db:generate` | Pass; migration generated for 8 tables and indexes |
| `npm run typecheck` | Pass; zero errors |
| `npm run lint` | Pass; zero errors (5 preserved legacy warnings) |
| `npm test` | Pass; production build plus 16 tests |
| `node --test tests/rendered-html.test.mjs` | 4/4 pass |
| `npm run test:signals` | 3/3 pass |
| `npm run test:platform` | 9/9 pass |
| `npm audit --omit=dev` | Pass; zero production vulnerabilities |

Tests cover preserved UI rendering, additive research rendering, API safety, plugin contracts, indicator/strategy determinism, future-prefix leakage, CSV quality, coverage/manifests, next-bar accounting, costs, all order types, partial/rejected fills, futures funding, chronological purge/embargo, walk-forward splits, bundle parity/corruption, and paper restart/deduplication.

## External acceptance requiring operator credentials/time

Provider end-to-end downloads require network availability; Alpha Vantage requires `ALPHA_VANTAGE_API_KEY`. Long-running paper observation maturity and automatic scheduled retraining require elapsed live-market time. These paths reject unavailable inputs and never fabricate data or success.
