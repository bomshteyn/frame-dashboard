import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const asset = (prefix) => {
  const name = readdirSync("public/assets").find((f) => f.startsWith(prefix) && f.endsWith(".js"));
  return readFileSync(`public/assets/${name}`, "utf8");
};

test("new grocery and task ids are unique across reloads", () => {
  const src = asset("auto-update-");
  assert.doesNotMatch(src, /_gid:function\(\)\{return`g`\+ \+\+n\}/);
  assert.doesNotMatch(src, /_eid:function\(\)\{return`e`\+ \+\+r\}/);
  assert.match(src, /_gid:function\(\)\{return`g`\+Date\.now\(\)/);
});

test("weather day click handler is bound once per view", () => {
  assert.match(asset("main-"), /e\._wxDays\|\|\(e\._wxDays=!0,e\.addEventListener\(`click`/);
});

test("phone page loads its readable source assets", () => {
  const html = readFileSync("public/m.html", "utf8");
  assert.match(html, /src="\/assets\/phone\/app\.js"/);
  assert.match(html, /href="\/assets\/phone\/phone\.css"/);
  assert.doesNotMatch(html, /mobile-[\w-]+\.(?:js|css)/);
});
