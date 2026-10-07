# TradePilot

Crypto trading dashboard with live Binance candlesticks, strategy signals, Telegram delivery, held-position buy levels, a configurable coin universe, account balances, and an optional quick-order flow.

## Run with Docker

1. Copy `.env.example` to `.env`.
2. Add your Binance API key and secret to `.env`.
3. Run `docker compose up --build`.
4. Open `http://localhost:3000`.

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
| `TRADEPILOT_PORT` | Host port published by Docker; defaults to `3030` |
| `SITE_URL` | Absolute public URL used by metadata |

Secrets are consumed only by server routes and are never returned to the browser.

## Telegram signals

Create a bot with Telegram's `@BotFather`, add the bot to the target chat or channel, and set `TELEGRAM_BOT_TOKEN` in `.env`. Open `/signals` to choose the destination, strategy, timeframes, markets, and BUY/SELL directions, then send a test alert. Confirmed alerts are emitted while the trading dashboard is open and receiving live Binance candles.

After adding or changing the token in a Docker setup, run `docker compose up -d --force-recreate` so Compose reloads the environment value. `docker compose restart` alone keeps the container's previous environment.

The Docker setup publishes TradePilot on host port `3030` by default. Set `TRADEPILOT_PORT` and update `SITE_URL` if you prefer another port. The application continues to listen on port `3000` inside Docker; only the host-facing port changes.
