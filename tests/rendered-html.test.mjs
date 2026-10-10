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
  assert.match(html, /<title>TradePilot — Trading &amp; research platform<\/title>/i);
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

test("preserves the original dashboard while rendering the additive research workspaces", async () => {
  const experimentResponse = await render("/experiments");
  assert.equal(experimentResponse.status, 200);
  const experimentHtml = await experimentResponse.text();
  assert.match(experimentHtml, /Experiment builder/i);
  assert.match(experimentHtml, /Resolve data &amp; backtest/i);

  const pluginResponse = await render("/plugins");
  assert.equal(pluginResponse.status, 200);
  const pluginHtml = await pluginResponse.text();
  assert.match(pluginHtml, /Plugin catalog/i);
  assert.match(pluginHtml, /Simple Moving Average/i);
});

test("exposes research APIs while preserving the guarded quick-order endpoint", async () => {
  const health = await render("/api/health");
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.researchExecution, "paper-only");
  assert.equal(healthBody.existingQuickOrderEnabled, false);
  assert.ok(healthBody.plugins >= 40);

  const catalog = await render("/api/platform/catalog");
  assert.equal(catalog.status, 200);
  const catalogBody = await catalog.json();
  assert.equal(catalogBody.compatibilityVersion, "1.0");
  assert.equal(catalogBody.counts.indicator, 18);
  assert.equal(catalogBody.counts.strategy, 11);

  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("order-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const order = await worker.fetch(new Request("http://localhost/api/binance/order", { method: "POST" }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(order.status, 503);
  assert.match((await order.json()).error, /credentials are not configured/i);
});
