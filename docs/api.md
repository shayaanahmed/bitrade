# Platform API

Read endpoints return JSON with `Cache-Control` appropriate to the resource. Mutations require same-origin requests and either the Sites authenticated-user header or local development mode.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Service version, health, plugin count, safety boundary |
| GET | `/api/metrics` | Prometheus-compatible service gauges |
| GET | `/api/platform/catalog` | Versioned plugins and providers |
| POST | `/api/platform/imports` | Validate and persist CSV/Parquet raw data (25 MB limit) |
| GET/POST | `/api/platform/backtests` | List persisted runs / resolve data and run experiment |
| GET | `/api/platform/jobs` | List durable idempotent jobs |
| POST | `/api/platform/training` | Train and register a chronological challenger |
| POST | `/api/platform/retraining` | Combine matured paper events with approved history and evaluate a challenger |
| GET/PATCH | `/api/platform/models` | List models / audited status transition |
| POST | `/api/platform/bundles` | Validate checksum, schema, compatibility, and test vectors |
| GET/POST | `/api/platform/paper` | List, create, control, and feed recoverable paper sessions |

Errors use `{ "error": "safe message" }`; credential values are never serialized. Input bodies are bounded and validated. Backtest configuration includes provider, market, symbols, timeframe, UTC range, strategies, cash, leverage, costs, exposure, drawdown, execution timing, and seed.
