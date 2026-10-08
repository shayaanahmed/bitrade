# TradePilot

Crypto trading dashboard with live Binance candlesticks, strategy signals, Telegram delivery, held-position buy levels, a configurable coin universe, account balances, and an optional quick-order flow.

## Run with Docker

1. Copy `.env.example` to `.env`.
2. Add your Binance API key and secret to `.env`.
3. Run `docker compose up --build`.
4. Open `http://localhost:3030`.

The chart uses public Binance data and works without credentials. Account balances need an API key with **Enable Reading** permission.

Keep `BINANCE_ENABLE_TRADING=false` until you intentionally want real Spot orders. If enabled, the UI requires a separate confirmation click before sending an order. Never enable withdrawals on the API key, and use Binance IP restrictions when available.

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
| `BINANCE_ENABLE_TRADING` | Explicit switch for real order submission |
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

The **Profit Guard** strategy is alert-only. It uses the held asset's Binance cost basis, arms after the configured minimum profit (2% by default), and emits a SELL signal after either a confirmed 1.5% pullback from the post-entry peak or an EMA 9/21 bearish crossover. Its thresholds can be changed on `/signals`; it never submits an order. Telegram delivery can send each selected strategy independently or wait until a configurable number of strategies agree.

After upgrading this version or changing the token, run `docker compose up -d --build --force-recreate` so Compose creates both the web service and the background scanner with the current environment. `docker compose restart` alone keeps the containers' previous environment.

The Docker setup publishes TradePilot on host port `3030` by default. Set `TRADEPILOT_PORT` and update `SITE_URL` if you prefer another port. The application continues to listen on port `3000` inside Docker; only the host-facing port changes.
