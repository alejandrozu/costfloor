import assert from "node:assert/strict";
import test from "node:test";

const previewMeta = /<meta(?=[^>]*name=["']codex-preview["'])[^>]*>/i;

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the complete CostFloor experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>CostFloor/);
  assert.match(html, /What remains/);
  assert.match(html, /RUN RECURSIVE TRACE/);
  assert.match(html, /AUTOMATION-ADJUSTED RESOURCE FLOOR/i);
  assert.match(html, /RECURSIVE TRACE/);
  assert.match(html, /TRANSFORMATION LEDGER/);
  assert.match(html, /SOURCES \/ PROVENANCE/);
  assert.doesNotMatch(html, previewMeta);
  assert.doesNotMatch(html, /react-loading-skeleton|Your site is taking shape/);
});

test("publishes branded social metadata", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /property="og:title" content="CostFloor"/i);
  assert.match(
    html,
    /property="og:image" content="https:\/\/costfloor-agi-house\.alezarzu\.chatgpt\.site\/og\.png"/i,
  );
  assert.match(html, /name="twitter:card" content="summary_large_image"/i);
});
