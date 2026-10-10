export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin"); const host = request.headers.get("host"); if (!origin || !host) return true; try { return new URL(origin).host === host; } catch { return false; }
}

export function authenticatedEmail(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase(); if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return email;
  const url = new URL(request.url); const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname); if (local && process.env.NODE_ENV !== "production") return "local@tradepilot.invalid"; return null;
}

export function protectMutation(request: Request) {
  if (!sameOrigin(request)) return { response: Response.json({ error: "Cross-origin mutations are not allowed" }, { status: 403 }), email: null };
  const email = authenticatedEmail(request); if (!email) return { response: Response.json({ error: "Authentication is required" }, { status: 401 }), email: null }; return { response: null, email };
}

export async function readJson<T>(request: Request, maximumBytes = 1_000_000): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0); if (length > maximumBytes) throw new Error("Request body is too large"); const text = await request.text(); if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error("Request body is too large"); return JSON.parse(text) as T;
}

export function apiError(error: unknown, fallback = "Request failed") {
  const message = error instanceof Error ? error.message : fallback; const status = /required|invalid|unknown|missing|must|cannot|unsupported|empty/i.test(message) ? 400 : 500; return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
