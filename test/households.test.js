import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { zmanimData } from "../worker/index.js";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  for (const f of ["0000_initial", "0001_photo_seen", "0002_photo_hidden", "0003_music", "0004_households"]) {
    sqlite.exec(readFileSync(new URL(`../migrations/${f}.sql`, import.meta.url), "utf8"));
  }
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...values) => stmt(sql, values),
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    run: async () => sqlite.prepare(sql).run(...args)
  });
  const DB = { prepare: stmt, batch: async (statements) => {
    sqlite.exec("BEGIN");
    try {
      const result = statements.map((s) => ({ results: sqlite.prepare(s.sql).all(...s.args) }));
      sqlite.exec("COMMIT");
      return result;
    } catch (e) { sqlite.exec("ROLLBACK"); throw e; }
  } };
  const env = { DB, SESSION_SECRET: "a".repeat(64), FAMILY_PIN: "1234" };
  const api = (path, cookie, method = "GET", body) => worker.fetch(new Request("https://frame.test" + path, {
    method, headers: { cookie: cookie || "", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  }), env);
  const login = async (pin) => {
    const r = await api("/api/login", "", "POST", { pin });
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie").split(";")[0];
  };
  return { sqlite, env, api, login };
}

async function pair() {
  const ctx = setup();
  const owner = await ctx.login("1234");
  const r = await ctx.api("/api/admin/households", owner, "POST", { name: "Friend" });
  assert.equal(r.status, 201);
  const created = await r.json();
  assert.match(created.pin, /^\d{8}$/);
  assert.equal(created.id, 2);
  return { ...ctx, owner, friend: await ctx.login(created.pin) };
}

test("legacy cookies still identify household 1; new PIN login and admin isolation", async () => {
  const { api, env, owner, friend } = await pair();
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const key = await crypto.subtle.importKey("raw", Buffer.from(env.SESSION_SECRET, "hex"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(expires)))).toString("hex");
  const legacy = await api("/api/household", `fd_s=${expires}.${sig}`);
  assert.equal((await legacy.json()).id, 1);
  assert.match(owner, /^fd_s=h1\./);
  assert.match(friend, /^fd_s=h2\./);
  assert.equal((await (await api("/api/household", friend)).json()).admin, false);
  for (const [path, method, body] of [
    ["/api/admin/households", "GET"],
    ["/api/admin/households", "POST", { name: "Other" }],
    ["/api/admin/households/2/pin", "POST", {}],
    ["/api/admin/households/2", "PATCH", { name: "Other" }],
    ["/api/admin/households/2", "DELETE"]
  ]) assert.equal((await api(path, friend, method, body)).status, 403);
  assert.equal((await api("/api/household", friend.replace("h2.", "h1."))).status, 401);
  assert.equal((await api("/api/music/status")).status, 403);
});

test("state, album photos and hidden photos are isolated, with unprefixed API keys", async () => {
  const { api, sqlite, owner, friend } = await pair();
  for (const [key, value] of [["tasks", "owner"], ["h2:tasks", "friend"]]) sqlite.prepare("INSERT INTO state VALUES (?, ?, 1)").run(key, JSON.stringify(value));
  for (const [cookie, value] of [[owner, "owner"], [friend, "friend"]]) {
    assert.equal((await (await api("/api/state/tasks", cookie)).json()).json, value);
    assert.deepEqual(await (await api("/api/state/version", cookie)).json(), { tasks: 1 });
  }
  assert.deepEqual(await (await api("/api/photos?album=main", friend)).json(), { photos: [], total: 0 });
  for (const [album, suffix] of [["main", "owner"], ["h2:main", "friend"]]) {
    sqlite.prepare("INSERT INTO album_scan (album, live_gen, count) VALUES (?, 1, 1)").run(album);
    sqlite.prepare("INSERT INTO album_photo (album, gen, id, src, o, date) VALUES (?, 1, ?, ?, 'l', '2020-01-01')").run(album, suffix, "https://p/" + suffix);
    sqlite.prepare("INSERT INTO photo_hidden (album,id,src,hidden) VALUES (?, 'hidden', ?, 1)").run(album, "https://p/" + suffix);
  }
  for (const [cookie, suffix] of [[owner, "owner"], [friend, "friend"]]) {
    const photos = await (await api("/api/photos?album=main", cookie)).json();
    assert.equal(photos.photos[0].src, "https://p/" + suffix);
    assert.equal(photos.photos[0].tag, "main");
    const hidden = await (await api("/api/photos/hidden", cookie)).json();
    assert.equal(hidden.photos.length, 1);
    assert.equal(hidden.photos[0].album, "main");
    assert.equal(hidden.photos[0].src, "https://p/" + suffix);
  }
});

test("settings validate full replacements and reload only their own frames", async () => {
  const { api, owner, friend } = await pair();
  const settings = await (await api("/api/settings", friend)).json();
  for (const change of [
    { location: { ...settings.location, tz: "Invalid/Zone" } },
    { photos: { main: "http://example.com", shabbat: "" } },
    { zmanim: { ...settings.zmanim, shabbosEnds: 30 } },
    { calendars: [{ person: "A", url: "javascript:alert(1)" }] },
    { minyanimUrl: "ftp://example.com" }
  ]) assert.equal((await api("/api/settings", friend, "PUT", { ...settings, ...change })).status, 400);
  assert.equal((await api("/api/settings", friend, "PUT", {})).status, 400);
  settings.location = { geonameid: 281184, name: "Jerusalem", lat: 31.78, lon: 35.22, tz: "Asia/Jerusalem", israel: true };
  settings.zmanim = { candles: 40, havdalah: [42, "8.5deg"], shabbosEnds: 50, shema: "gra", dafYomi: false };
  assert.equal((await api("/api/settings", friend, "PUT", settings)).status, 200);
  assert.equal((await (await api("/api/state/remote", friend)).json()).json.seq, 1);
  assert.equal((await (await api("/api/state/remote", owner)).json()).json, null);
  assert.deepEqual(await (await api("/api/settings", friend)).json(), settings);
  assert.deepEqual(await (await api("/api/geo/search?q=", friend)).json(), []);
  const urls = [];
  const data = await zmanimData(async (url) => {
    urls.push(new URL(url));
    return new Response(JSON.stringify(String(url).includes("/zmanim?") ? { times: { sunset: "2026-06-06T18:00:00Z", tzeit85deg: "2026-06-06T18:40:00Z", sofZmanShma: "2026-06-06T06:00:00Z", sofZmanShmaMGA: "2026-06-06T05:00:00Z" } } : { items: [
      { category: "candles", date: "2026-06-05T15:00:00Z" },
      { category: "havdalah", date: "2026-06-06T18:50:00Z" }
    ] }));
  }, settings);
  const holiday = urls.find((u) => u.pathname === "/hebcal");
  assert.equal(holiday.searchParams.get("geonameid"), "281184");
  assert.equal(holiday.searchParams.get("b"), "40");
  assert.equal(holiday.searchParams.get("m"), "50");
  assert.equal(holiday.searchParams.get("i"), "on");
  assert.equal(urls.some((u) => u.searchParams.has("F")), false);
  assert.deepEqual(data.today.map((z) => z.key), ["sofZmanShma", "sunset", "tzeit7083deg"]);
  assert.equal(data.windows[0].end, "2026-06-06T18:50:00.000Z");
  assert.equal(data.windows[0].havdalahTimes[0].time, "2026-06-06T18:42:00.000Z");
  settings.zmanim.shabbosEnds = "8.5deg";
  urls.length = 0;
  await zmanimData(async (url) => { urls.push(new URL(url)); return new Response('{"items":[],"times":{}}'); }, settings);
  assert.equal(urls.find((u) => u.pathname === "/hebcal").searchParams.get("M"), "on");
});

test("migration preserves old music credentials and is idempotent; deletion removes household data", async () => {
  const { api, sqlite, owner, friend } = await pair();
  const migration = readFileSync(new URL("../migrations/0004_households.sql", import.meta.url), "utf8");
  sqlite.prepare("INSERT INTO music_auth VALUES (1, 'old-token', 'old-device', NULL, 'old@example.test', 1)").run();
  sqlite.exec(migration);
  sqlite.exec(migration);
  assert.equal((await (await api("/api/music/status", owner)).json()).connected, true);
  assert.equal((await (await api("/api/music/status", friend)).json()).connected, false);
  sqlite.prepare("INSERT INTO state VALUES ('h2:tasks', '[]', 1)").run();
  assert.equal((await api("/api/admin/households/2", owner, "DELETE")).status, 200);
  assert.equal((await api("/api/household", friend)).status, 401);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM state WHERE key = 'h2:tasks'").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM household_music_auth WHERE hid = 2").get().n, 0);
  assert.equal((await api("/api/admin/households/1", owner, "DELETE")).status, 400);
});

test("writes and editing locks use household state, photos and location", async () => {
  const { api, sqlite, owner, friend } = await pair();
  const original = globalThis.fetch;
  let locked = false;
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes("/zmanim?") ? { times: {} } : { items: locked ? [
    { category: "candles", date: new Date(Date.now() - 3600000).toISOString() },
    { category: "havdalah", date: new Date(Date.now() + 3600000).toISOString() }
  ] : [] }));
  try {
    const put = await api("/api/state/tasks", friend, "PUT", { json: ["friend task"], base: 0 });
    assert.equal(put.status, 200);
    assert.deepEqual((await (await api("/api/state/tasks", friend)).json()).json, ["friend task"]);
    assert.equal((await (await api("/api/state/tasks", owner)).json()).json, null);
    assert.equal((await api("/api/state/tasks", friend, "PUT", { json: [], base: 0 })).status, 409);
    const photo = { album: "main", src: "https://lh3.googleusercontent.com/pw/example=w1280-h800" };
    assert.equal((await api("/api/photos/hide", friend, "POST", photo)).status, 200);
    assert.equal(sqlite.prepare("SELECT album FROM photo_hidden").get().album, "h2:main");
    assert.equal((await (await api("/api/photos/hidden", owner)).json()).photos.length, 0);
    assert.equal((await api("/api/photos/unhide", friend, "POST", photo)).status, 200);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM photo_hidden").get().n, 0);
    locked = true;
    assert.equal((await api("/api/state/groceries", friend, "PUT", { json: [], base: 0 })).status, 423);
    assert.equal((await api("/api/photos/hide", friend, "POST", photo)).status, 423);
  } finally { globalThis.fetch = original; }
});

test("geo search enriches cities from Hebcal and reports upstream failures", async () => {
  const { api, login } = setup();
  const cookie = await login("1234");
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes("complete.php") ?
    [{ id: 281184, value: "Jerusalem, Israel", geo: "geoname" }, { id: "12345", geo: "zip" }] :
    { location: { latitude: 31.78, longitude: 35.22, tzid: "Asia/Jerusalem", cc: "IL" } }));
  try {
    assert.deepEqual(await (await api("/api/geo/search?q=Jerusalem", cookie)).json(), [
      { geonameid: 281184, name: "Jerusalem, Israel", lat: 31.78, lon: 35.22, tz: "Asia/Jerusalem", israel: true }
    ]);
    globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
    assert.equal((await api("/api/geo/search?q=Toronto", cookie)).status, 502);
  } finally { globalThis.fetch = original; }
});

test("admin listing, rename and PIN rotation never expose stored hashes", async () => {
  const { api, owner, friend, login } = await pair();
  assert.equal((await api("/api/admin/households", owner, "POST", { name: "" })).status, 400);
  assert.equal((await api("/api/admin/households/999", owner, "PATCH", { name: "Missing" })).status, 404);
  assert.equal((await api("/api/admin/households/2", owner, "PATCH", { name: "New name" })).status, 200);
  const list = await (await api("/api/admin/households", owner)).json();
  assert.equal(list[1].name, "New name");
  assert.deepEqual(Object.keys(list[1]).sort(), ["created", "id", "name"]);
  const rotated = await (await api("/api/admin/households/2/pin", owner, "POST", {})).json();
  assert.match(rotated.pin, /^\d{8}$/);
  assert.match(await login(rotated.pin), /^fd_s=h2\./);
  assert.equal((await (await api("/api/household", friend)).json()).name, "New name");
});

test("HTML bootstrap uses the household or anonymous defaults and escapes script markup", async () => {
  const { env, api, owner, friend } = await pair();
  const settings = await (await api("/api/settings", friend)).json();
  settings.location.name = "</script><script>bad()</script>";
  settings.location.tz = "Asia/Jerusalem";
  assert.equal((await api("/api/settings", friend, "PUT", settings)).status, 200);
  env.ASSETS = { fetch: async () => new Response("<html><head></head></html>") };
  const original = globalThis.HTMLRewriter;
  globalThis.HTMLRewriter = class {
    on(selector, handler) { assert.equal(selector, "head"); this.handler = handler; return this; }
    transform(response) {
      let appended;
      this.handler.element({ append(value) { appended = value; } });
      return new Response("<html><head>" + appended + "</head></html>", { headers: response.headers });
    }
  };
  try {
    for (const [cookie, tz, admin] of [[owner, "America/Toronto", true], [friend, "Asia/Jerusalem", false], ["", "America/Toronto", false]]) {
      for (const path of ["/", "/m"]) {
        const r = await worker.fetch(new Request("https://frame.test" + path, { headers: { cookie } }), env);
        const text = await r.text();
        assert.ok(text.includes(`"tz":"${tz}"`));
        assert.ok(text.includes(`"admin":${admin}`));
        assert.equal(text.includes("</script><script>bad()"), false);
        assert.equal(r.headers.get("cache-control"), "private, no-store");
      }
    }
  } finally { globalThis.HTMLRewriter = original; }
});
