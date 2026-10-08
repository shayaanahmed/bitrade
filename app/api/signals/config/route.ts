const SIGNAL_SERVICE_URL = (process.env.SIGNAL_SERVICE_URL?.trim() || "http://127.0.0.1:3001").replace(/\/$/, "");

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function proxy(path: string, init?: RequestInit) {
  try {
    const response = await fetch(`${SIGNAL_SERVICE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "The background signal scanner is unavailable" }, { status: 503 });
  }
}

export async function GET() {
  return proxy("/state");
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin configuration changes are not allowed" }, { status: 403 });
  return proxy("/config", { method: "PUT", body: await request.text() });
}
