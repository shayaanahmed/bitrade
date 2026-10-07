const CHAT_ID_PATTERN = /^(?:-?\d+|@[A-Za-z][A-Za-z0-9_]{4,31})$/;

function telegramConfig() {
  return {
    token: process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
  };
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  return !origin || !host || new URL(origin).host === host;
}

export async function GET() {
  return Response.json({ configured: Boolean(telegramConfig().token) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin signal delivery is not allowed" }, { status: 403 });

  const { token } = telegramConfig();
  if (!token) return Response.json({ error: "Add TELEGRAM_BOT_TOKEN to the server environment first" }, { status: 503 });

  try {
    const body = await request.json() as {
      chatId?: string;
      test?: boolean;
      symbol?: string;
      timeframe?: string;
      side?: string;
      price?: number;
      strategy?: string;
      candleTime?: number;
    };
    const chatId = body.chatId?.trim() ?? "";
    if (!CHAT_ID_PATTERN.test(chatId)) return Response.json({ error: "Enter a valid Telegram chat ID or @channel username" }, { status: 400 });

    let text = "✅ <b>TradePilot Telegram connected</b>\nTest alert delivered successfully.";
    if (!body.test) {
      const symbol = body.symbol?.toUpperCase() ?? "";
      const timeframe = body.timeframe ?? "";
      const side = body.side?.toUpperCase() ?? "";
      const price = Number(body.price);
      const strategy = body.strategy?.trim() ?? "";
      const candleTime = Number(body.candleTime);
      if (!/^[A-Z0-9]{2,12}$/.test(symbol) || !["BUY", "SELL"].includes(side) || !["1m", "5m", "15m", "1H", "4H", "1D"].includes(timeframe) || !Number.isFinite(price) || price <= 0 || !strategy) {
        return Response.json({ error: "Invalid signal payload" }, { status: 400 });
      }
      const icon = side === "BUY" ? "🟢" : "🔴";
      const formattedPrice = price < 1 ? price.toFixed(6) : price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const confirmedAt = Number.isFinite(candleTime) ? new Date(candleTime).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "Just now";
      text = `${icon} <b>${side} ${symbol}/USDT</b>\n\nPrice: <code>$${formattedPrice}</code>\nTimeframe: <b>${timeframe}</b>\nStrategy: ${escapeHtml(strategy)}\nConfirmed: ${confirmedAt}\n\n<i>Decision support only — not financial advice.</i>`;
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      cache: "no-store",
    });
    const payload = await response.json() as { ok?: boolean; description?: string; result?: { message_id?: number } };
    if (!response.ok || !payload.ok) return Response.json({ error: payload.description || "Telegram rejected the message" }, { status: 502 });
    return Response.json({ delivered: true, messageId: payload.result?.message_id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to deliver Telegram signal" }, { status: 502 });
  }
}
