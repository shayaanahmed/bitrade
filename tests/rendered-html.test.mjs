import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the TradePilot dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>TradePilot — Crypto trading assistant<\/title>/i);
  assert.match(html, /class="app-shell"/);
  assert.match(html, /href="\/signals"/);
  assert.match(html, /BTC/);
  assert.doesNotMatch(html, /Your site is taking shape|starter loading skeleton/i);
});

test("server-renders the signal configuration page", async () => {
  const response = await render("/signals");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Signal delivery/i);
  assert.match(html, /Enable signal delivery/i);
  assert.match(html, /Server scanner/i);
});
