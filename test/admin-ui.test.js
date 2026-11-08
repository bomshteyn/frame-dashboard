import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/assets/admin/admin.js", import.meta.url), "utf8");
const flush = () => new Promise(resolve => setImmediate(resolve));
async function fixture(rows = [], status = 200, copyFails = false) {
  const handlers = {}, copied = [];
  const root = { innerHTML: "", addEventListener: (name, handler) => { handlers[name] = handler; },
    querySelector: () => ({ select() {} }) };
  const document = { getElementById: () => root, createElement: () => ({
    textContent: "", get innerHTML() { return this.textContent.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
  }) };
  const fetch = async () => new Response(JSON.stringify(status === 200 ? rows : { error: "Admin not configured" }), { status });
  const navigator = { clipboard: { writeText: async value => {
    if (copyFails) throw Error("Denied");
    copied.push(value);
  } } };
  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
  await new AsyncFunction("document", "fetch", "navigator", "location", source)(document, fetch, navigator, { origin: "https://frame.test" });
  const click = async (action, id) => {
    const button = { dataset: { action, id: String(id) }, textContent: "" };
    handlers.click({ target: { closest: () => button } });
    await flush();
    return button;
  };
  return { root, click, copied };
}

test("admin cards mask by default, toggle PIN and setup text, and copy the saved PIN without revealing it", async () => {
  const f = await fixture([{ id: 2, name: "<Family>", pin: "87654321" }]);
  assert.ok(!f.root.innerHTML.includes("87654321"));
  assert.match(f.root.innerHTML, /••••••••/);
  assert.match(f.root.innerHTML, /&lt;Family&gt;/);
  assert.equal((await f.click("copy-pin", 2)).textContent, "Copied");
  assert.deepEqual(f.copied, ["87654321"]);
  assert.ok(!f.root.innerHTML.includes("87654321"));
  await f.click("show", 2);
  assert.match(f.root.innerHTML, /87654321/);
  assert.match(f.root.innerHTML, />Hide<\/button>/);
  assert.match(f.root.innerHTML, /enter PIN 87654321.*https:\/\/frame.test\/m/);
  await f.click("copy-setup", 2);
  assert.match(f.copied[1], /enter PIN 87654321/);
  await f.click("show", 2);
  assert.ok(!f.root.innerHTML.includes("87654321"));
});

test("legacy and empty admin lists never offer a null PIN to copy", async () => {
  const legacy = await fixture([{ id: 2, name: "Legacy family", pin: null }]);
  assert.match(legacy.root.innerHTML, /Reset PIN to view/);
  assert.ok(!legacy.root.innerHTML.includes('data-action="show"'));
  assert.ok(!legacy.root.innerHTML.includes('data-action="copy-pin"'));
  assert.ok(!legacy.root.innerHTML.includes('data-action="copy-setup"'));
  assert.match((await fixture()).root.innerHTML, /No families yet/);
});

test("admin PIN controls handle clipboard denial and failed listing safely", async () => {
  const denied = await fixture([{ id: 2, name: "Local family", pin: "87654321" }], 200, true);
  await denied.click("copy-setup", 2);
  assert.match(denied.root.innerHTML, /Copy unavailable/);
  assert.match(denied.root.innerHTML, /Setup instructions/);
  const failed = await fixture([], 503);
  assert.match(failed.root.innerHTML, /Admin not configured/);
  assert.ok(!failed.root.innerHTML.includes('data-action="copy-pin"'));
});
