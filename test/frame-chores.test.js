import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/assets/frame-chores.js", import.meta.url), "utf8");
function fixture(chores = [], failure = 0) {
  const calls = [], notices = [], handlers = {}, error = { textContent: "" }, fieldset = {};
  let html = "", reloaded = 0, closed = 0;
  const values = new Map([["title", "Set the table"], ["who", "adult"], ["days", ["5"]], ["erevShabbos", "on"]]);
  const sheet = {
    values,
    addEventListener: (name, handler) => { handlers[name] = handler; },
    querySelector: selector => selector === "form" ? { values } : selector === "fieldset" ? fieldset : selector === '[role="alert"]' ? error :
      selector === "[data-delete-repeat]" && chores.length ? { addEventListener: (_, handler) => { handlers.delete = handler; } } : null,
  };
  const window = { CONFIG: { people: [{ id: "adult", name: "Adult" }] }, App: {
    kodeshActive: false,
    esc: value => String(value).replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
    person: () => ({ name: "Adult" }),
    toast: value => notices.push(value),
    sheet: (value, options) => { html = value; options.onMount(sheet); },
    closeSheet: () => { closed++; },
    reloadTasks: async () => { reloaded++; }
  } };
  const fetch = async (url, options) => {
    calls.push({ url, ...options });
    return new Response(JSON.stringify(options.method === "PUT" && failure ? { error: "Conflict" } :
      options.method === "PUT" ? { json: [], updated: 11 } : { json: chores, updated: 10 }),
      { status: options.method === "PUT" && failure ? failure : 200 });
  };
  class FormData {
    constructor(form) { this.values = form.values; }
    get(name) { return this.values.get(name) ?? null; }
    getAll(name) { return this.values.get(name) || []; }
    has(name) { return this.values.has(name); }
  }
  new Function("window", "fetch", "crypto", "FormData", "confirm", source)(window, fetch, crypto, FormData, () => true);
  return { window, calls, notices, handlers, error, values, fieldset, html: () => html,
    reloaded: () => reloaded, closed: () => closed };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("frame creates the shared chore definition with a CAS base and reloads tasks immediately", async () => {
  const f = fixture();
  await f.window.FrameChores.edit({ title: "Set the table", who: "adult" });
  assert.match(f.html(), /Repeat a task/);
  assert.match(f.html(), /Erev Shabbos/);
  assert.match(f.html(), /Erev Yom Tov/);
  f.handlers.submit({ preventDefault() {} });
  await flush();
  const put = f.calls.find(c => c.method === "PUT");
  const payload = JSON.parse(put.body);
  assert.equal(put.url, "/api/state/chores");
  assert.equal(payload.base, 10);
  assert.deepEqual({ ...payload.json[0], id: "id" }, { id: "id", title: "Set the table", who: "adult",
    days: [5], erevShabbos: true, erevYomTov: false });
  assert.equal(f.reloaded(), 1);
  assert.equal(f.closed(), 1);
});

test("frame repeat manager supports empty lists, safe titles, editing and deletion", async () => {
  const empty = fixture();
  await empty.window.FrameChores.list();
  assert.match(empty.html(), /No repeating chores yet/);
  const chore = { id: "chore", title: "<img>", who: "adult", days: [5], erevShabbos: false, erevYomTov: true };
  const f = fixture([chore]);
  await f.window.FrameChores.list();
  assert.ok(!f.html().includes("<img>"));
  assert.match(f.html(), /Fri · Erev Yom Tov/);
  await f.window.FrameChores.edit({ id: "chore" });
  assert.match(f.html(), /Edit repeat/);
  assert.match(f.html(), /value="5" checked/);
  f.handlers.submit({ preventDefault() {} });
  await flush();
  assert.equal(JSON.parse(f.calls.find(c => c.method === "PUT").body).json[0].id, "chore");
  const deletion = fixture([chore]);
  await deletion.window.FrameChores.edit({ id: "chore" });
  deletion.handlers.delete();
  await flush();
  assert.deepEqual(JSON.parse(deletion.calls.find(c => c.method === "PUT").body).json, []);
});

test("frame repeats validate empty fields, surface conflicts and block kodesh writes", async () => {
  const invalid = fixture();
  await invalid.window.FrameChores.edit();
  invalid.values.set("days", []); invalid.values.delete("erevShabbos");
  invalid.handlers.submit({ preventDefault() {} });
  await flush();
  assert.match(invalid.error.textContent, /choose at least one/);
  assert.equal(invalid.calls.length, 1);
  invalid.values.set("days", ["1"]); invalid.values.set("title", " ");
  invalid.handlers.submit({ preventDefault() {} });
  await flush();
  assert.equal(invalid.calls.length, 1);
  const conflict = fixture([], 409);
  await conflict.window.FrameChores.edit();
  conflict.handlers.submit({ preventDefault() {} });
  await flush();
  assert.match(conflict.error.textContent, /changed on another device/);
  assert.equal(conflict.reloaded(), 0);
  assert.equal(conflict.closed(), 0);
  const locked = fixture();
  locked.window.App.kodeshActive = true;
  await locked.window.FrameChores.list();
  await locked.window.FrameChores.edit();
  assert.equal(locked.calls.length, 0);
  locked.window.App.kodeshActive = false;
  await locked.window.FrameChores.edit();
  locked.window.App.kodeshActive = true;
  locked.handlers.submit({ preventDefault() {} });
  await flush();
  assert.equal(locked.calls.length, 1);
});
