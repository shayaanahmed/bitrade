# TradePilot

Crypto trading dashboard with live Binance candlesticks, strategy signals, Telegram delivery, held-position buy levels, a configurable coin universe, and account balances—plus an additive algorithmic-research platform for reproducible data ingestion, backtesting, ensemble training, model governance, and paper trading.

The original TradePilot dashboard and workflows remain available. Open **Research** in the main navigation for the new data catalog, plugin catalog, experiment builder, job center, results, training center, model registry, and paper-trading control room.

The pre-existing quick-order flow is preserved behind its original `BINANCE_ENABLE_TRADING` safety switch. The new research subsystem never routes to that endpoint: its backtests and paper sessions use isolated, simulated execution.

## Run with Docker

1. Copy `.env.example` to `.env`.
2. Add your Binance API key and secret to `.env`.
3. Run `docker compose up --build`.
4. Open `http://localhost:3030`.

The chart uses public Binance data and works without credentials. Account balances need an API key with **Enable Reading** permission.

Keep `BINANCE_ENABLE_TRADING=false` until you intentionally want the existing real Spot quick-order flow. If enabled, the UI still requires its separate confirmation click. Never enable withdrawals, and use Binance IP restrictions when available.

## Local development

Requires Node.js 22 or newer.

```bash
cp .env.example .env
npm ci
npm run dev
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `BINANCE_API_KEY` | Server-only Binance API key |
| `BINANCE_API_SECRET` | Server-only Binance secret |
| `BINANCE_BASE_URL` | REST endpoint; defaults to live Binance |
| `NEXT_PUBLIC_BINANCE_WS_URL` | Public WebSocket market-data endpoint |
| `BINANCE_ENABLE_TRADING` | Existing explicit switch for real quick-order submission |
| `ALPHA_VANTAGE_API_KEY` | Free API key for documented commodity history |
| `TELEGRAM_BOT_TOKEN` | Server-only bot token for external signal alerts |
| `SIGNAL_SCAN_INTERVAL_MS` | Background signal scan interval; defaults to 30 seconds |
| `SIGNAL_RETRY_INTERVAL_MS` | Retry delay after a failed Telegram delivery; defaults to 5 minutes |
| `TRADEPILOT_PORT` | Host port published by Docker; defaults to `3030` |
| `SITE_URL` | Absolute public URL used by metadata |

Secrets are consumed only by server routes and are never returned to the browser.

## Telegram signals

Create a bot with Telegram's `@BotFather`, add the bot to the target chat or channel, and set `TELEGRAM_BOT_TOKEN` in `.env`. Open `/signals` to choose the destination, strategy, timeframes, markets, and BUY/SELL directions, then send a test alert. The Docker deployment runs a dedicated background scanner, so confirmed alerts continue when every browser is closed.

Signal configuration, delivery history, and deduplication state are stored in the `signal-state` Docker volume. The first visit to `/signals` after upgrading automatically migrates a configuration previously saved in that browser. Save the configuration once to confirm that the server scanner reports **Alerts armed**.

The chart can apply multiple assigned strategies at once. Every marker includes a short strategy label, and the strategy panel shows the combined BUY/SELL/HOLD consensus. Profit Guard adds a `PG ARMED` marker when protection activates and a `PG SELL` marker when its exit condition is confirmed.

## Research platform

The research engine uses versioned TypeScript contracts that fit the existing Cloudflare/Vinext architecture. D1 stores operational metadata, R2 stores immutable imported artifacts and bundles, and deterministic pure modules implement indicators, strategies, backtesting, chronological validation, bundle export/import, and paper accounting.

```bash
npm run typecheck
npm run test:platform
npm test
```

See [Architecture](docs/architecture.md), [Plugin SDK](docs/plugin-sdk.md), [API](docs/api.md), [User guide](docs/user-guide.md), [Operations](docs/operations.md), and [Model bundles](docs/model-bundles.md).

The **Profit Guard** strategy is alert-only. It uses the held asset's Binance cost basis, arms after the configured minimum profit (2% by default), and emits a SELL signal after either a confirmed 1.5% pullback from the post-entry peak or an EMA 9/21 bearish crossover. Its thresholds can be changed on `/signals`; it never submits an order. Telegram delivery can send each selected strategy independently or wait until a configurable number of strategies agree.

After upgrading this version or changing the token, run `docker compose up -d --build --force-recreate` so Compose creates both the web service and the background scanner with the current environment. `docker compose restart` alone keeps the containers' previous environment.

The Docker setup publishes TradePilot on host port `3030` by default. Set `TRADEPILOT_PORT` and update `SITE_URL` if you prefer another port. The application continues to listen on port `3000` inside Docker; only the host-facing port changes.
