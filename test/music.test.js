import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { musicTiles, musicToken } from "../worker/index.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["0000_initial.sql", "0001_photo_seen.sql", "0002_photo_hidden.sql", "0003_music.sql"]) {
    sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  const statement = (sql, args = []) => ({
    sql,
    args,
    bind: (...values) => statement(sql, values),
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    run: async () => sqlite.prepare(sql).run(...args)
  });
  return {
    sqlite,
    prepare: (sql) => statement(sql)
  };
}

async function authenticated() {
  const DB = database();
  const env = { DB, SESSION_SECRET: "a".repeat(64), FAMILY_PIN: "1234" };
  const response = await worker.fetch(new Request("https://frame.test/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin: "1234" })
  }), env);
  assert.equal(response.status, 200);
  return { DB, env, cookie: response.headers.get("set-cookie").split(";")[0] };
}

function apiRequest(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return new Request(`https://frame.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function upstreamResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function withFetch(stub, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await callback();
  } finally {
    globalThis.fetch = original;
  }
}

test("profile listing uses form encoding and the frame device headers", async () => {
  const { env, cookie } = await authenticated();
  let request;
  const response = await withFetch(async (url, init) => {
    request = { url: String(url), init };
    return upstreamResponse({ profiles: [{ id: 1, name: "Maya" }], max_profiles: 4 });
  }, () => worker.fetch(apiRequest("/api/music/profiles", {
    method: "POST",
    body: { email: "family@example.test", password: "password-not-persisted" },
    cookie
  }), env));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { profiles: [{ id: 1, name: "Maya" }], max_profiles: 4 });
  assert.equal(request.url, "https://24six.app/api/v3/profile-list");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.get("content-type"), "application/x-www-form-urlencoded");
  assert.equal(request.init.headers.get("X-PLATFORM-DEVICE"), "Home HQ frame");
  assert.equal(request.init.headers.get("os-version"), "29");
  assert.equal(request.init.headers.get("User-Agent"), "okhttp/4.12.0");
  const form = new URLSearchParams(request.init.body);
  assert.equal(form.get("email"), "family@example.test");
  assert.equal(form.get("password"), "password-not-persisted");
  assert.equal(request.init.headers.get("X-DEVICE-ID"), env.DB.sqlite.prepare("SELECT device_id FROM music_auth WHERE id = 1").get().device_id);
  assert.equal(request.init.headers.get("authorization"), null);
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) count FROM music_auth").get().count, 1);
});

test("login stores the token and profile but never the password", async () => {
  const { DB, env, cookie } = await authenticated();
  const password = "dont-store-this-password";
  let firstDeviceId;
  await worker.fetch(apiRequest("/api/music/status", { cookie }), env);
  firstDeviceId = DB.sqlite.prepare("SELECT device_id FROM music_auth WHERE id = 1").get().device_id;
  const response = await withFetch(async (url, init) => {
    assert.equal(String(url), "https://24six.app/api/v3/login");
    assert.equal(new URLSearchParams(init.body).get("password"), password);
    return upstreamResponse({
      access_token: "profile-token-value-long-enough-to-stay-private",
      profile: { id: 27, name: "Maya", img: "https://images.test/maya.jpg" }
    });
  }, () => worker.fetch(apiRequest("/api/music/login", {
    method: "POST",
    body: { email: "family@example.test", password, profile_id: 27, pin: "1234" },
    cookie
  }), env));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    profile: { id: 27, name: "Maya", img: "https://images.test/maya.jpg" }
  });
  const saved = DB.sqlite.prepare("SELECT token, device_id, profile_json, email FROM music_auth WHERE id = 1").get();
  assert.equal(saved.token, "profile-token-value-long-enough-to-stay-private");
  assert.equal(saved.device_id, firstDeviceId);
  assert.deepEqual(JSON.parse(saved.profile_json), { id: 27, name: "Maya", img: "https://images.test/maya.jpg" });
  assert.equal(saved.email, "family@example.test");
  assert.equal(Object.hasOwn(saved, "password"), false);
  assert.equal(DB.sqlite.prepare("PRAGMA table_info(music_auth)").all().some((column) => column.name === "password"), false);
});

test("token extraction prioritizes known keys then uses a long-string fallback", () => {
  assert.equal(musicToken({ access_token: "access", data: { token: "preferred-token" } }), "preferred-token");
  assert.equal(musicToken({ response: { value: "long-fallback-token-value-that-is-at-least-thirty-characters" } }), "long-fallback-token-value-that-is-at-least-thirty-characters");
  assert.equal(musicToken({ token: "short", value: "too-short" }), "short");
});

test("an upstream 401 becomes 403 relogin and clears the saved token", async () => {
  const { DB, env, cookie } = await authenticated();
  DB.sqlite.prepare("INSERT INTO music_auth (id, token, device_id, profile_json, email, updated) VALUES (1, ?, ?, ?, ?, ?)")
    .run("expired-token", "00000000-0000-4000-8000-000000000001", JSON.stringify({ id: 1, name: "Maya", img: null }), "family@example.test", Date.now());
  const response = await withFetch(async (_url, init) => {
    assert.equal(init.headers.get("authorization"), "Bearer expired-token");
    return upstreamResponse({ message: "expired" }, 401);
  }, () => worker.fetch(apiRequest("/api/music/home", { cookie }), env));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "24six login expired", relogin: true });
  assert.equal(DB.sqlite.prepare("SELECT token FROM music_auth WHERE id = 1").get().token, null);
});

test("logout uses the exact 24six logout URL", async () => {
  const { DB, env, cookie } = await authenticated();
  DB.sqlite.prepare("INSERT INTO music_auth (id, token, device_id, updated) VALUES (1, ?, ?, ?)")
    .run("valid-token", "00000000-0000-4000-8000-000000000005", Date.now());
  const response = await withFetch(async (url) => {
    assert.equal(String(url), "https://24six.app/api/v3/logout");
    return upstreamResponse({ ok: true });
  }, () => worker.fetch(apiRequest("/api/music/logout", { method: "POST", body: {}, cookie }), env));
  assert.equal(response.status, 200);
  assert.equal(DB.sqlite.prepare("SELECT token FROM music_auth WHERE id = 1").get().token, null);
});

test("stream URL is deep-searched and debug returns the upstream JSON", async () => {
  const { DB, env, cookie } = await authenticated();
  DB.sqlite.prepare("INSERT INTO music_auth (id, token, device_id, updated) VALUES (1, ?, ?, ?)")
    .run("valid-token", "00000000-0000-4000-8000-000000000002", Date.now());
  const raw = {
    metadata: { id: 42, title: "Deep Song", artist: { name: "The Artist" }, img: "https://images.test/cover.jpg", duration: 190 },
    nested: [{ source: { manifest: "https://stream.test/live/index.m3u8?signature=abc" } }]
  };
  let request;
  const response = await withFetch(async (url, init) => {
    request = { url: String(url), init };
    return upstreamResponse(raw);
  }, () => worker.fetch(apiRequest("/api/music/stream/42?debug=1", { cookie }), env));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 42,
    url: "https://stream.test/live/index.m3u8?signature=abc",
    title: "Deep Song",
    artist: "The Artist",
    img: "https://images.test/cover.jpg",
    length: 190,
    raw
  });
  assert.equal(request.url, "https://24six.app/api/v3/music/content/42");
  assert.equal(request.init.method, "POST");
});

test("musicTiles normalizes nested tracks", () => {
  assert.deepEqual(musicTiles({
    data: [
      { id: 7, entity_type: "content", title: "Song", artist: { name: "Artist" }, artwork: { url: "https://images.test/song.jpg" }, length: 205 },
      { id: "8", type: "playlist", name: "Not numeric" }
    ]
  }), [{
    id: 7,
    kind: "track",
    title: "Song",
    subtitle: "Artist",
    img: "https://images.test/song.jpg",
    length: 205
  }]);
});

test("music commands and now-playing states are available through state sync", async () => {
  const { env, cookie } = await authenticated();
  for (const key of ["music", "music_now_small", "music_now_large"]) {
    const response = await worker.fetch(apiRequest(`/api/state/${key}`, { cookie }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { json: null, updated: 0 });
  }
});

test("home groups section arrays and search serializes type arrays", async () => {
  const { DB, env, cookie } = await authenticated();
  DB.sqlite.prepare("INSERT INTO music_auth (id, token, device_id, updated) VALUES (1, ?, ?, ?)")
    .run("valid-token", "00000000-0000-4000-8000-000000000003", Date.now());
  const home = { sections: [{ title: "Daily Mix", items: [{ id: 11, title: "One", type: "music" }] }, { title: "For you", items: [{ id: 12, title: "Two", type: "content" }] }] };
  const homeResponse = await withFetch(async () => upstreamResponse(home), () => worker.fetch(apiRequest("/api/music/home?debug=1", { cookie }), env));
  assert.deepEqual(await homeResponse.json(), {
    sections: [
      { title: "Daily Mix", tiles: [{ id: 11, kind: "track", title: "One", subtitle: "", img: "", length: null }] },
      { title: "For you", tiles: [{ id: 12, kind: "track", title: "Two", subtitle: "", img: "", length: null }] }
    ],
    raw: home
  });

  let formBody;
  const searchResponse = await withFetch(async (url, init) => {
    assert.equal(String(url), "https://24six.app/api/v3/music/search");
    formBody = new URLSearchParams(init.body);
    return upstreamResponse({ results: [] });
  }, () => worker.fetch(apiRequest("/api/music/search", {
    method: "POST",
    body: { q: "artist" },
    cookie
  }), env));
  assert.equal(searchResponse.status, 200);
  assert.equal(formBody.get("q"), "artist");
  assert.deepEqual(formBody.getAll("type[]"), ["music"]);
  assert.equal(formBody.get("limit"), "50");
});

test("music upstream errors preserve the message and status", async () => {
  const { DB, env, cookie } = await authenticated();
  DB.sqlite.prepare("INSERT INTO music_auth (id, token, device_id, updated) VALUES (1, ?, ?, ?)")
    .run("valid-token", "00000000-0000-4000-8000-000000000004", Date.now());
  const response = await withFetch(async (url) => {
    assert.equal(String(url), "https://24six.app/api/v3/profile/swap");
    return upstreamResponse({ message: "Wrong PIN" }, 422);
  }, () => worker.fetch(apiRequest("/api/music/profile", {
    method: "POST",
    body: { profile_id: 10, pin: "0000" },
    cookie
  }), env));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Wrong PIN", upstreamStatus: 422 });
});

test("no /api/music route responds with 401 when unauthenticated", async () => {
  const env = { DB: database() };
  const routes = [
    ["GET", "/api/music/status"],
    ["POST", "/api/music/profiles"],
    ["POST", "/api/music/login"],
    ["POST", "/api/music/profile"],
    ["POST", "/api/music/logout"],
    ["GET", "/api/music/home"],
    ["POST", "/api/music/search"],
    ["GET", "/api/music/library"],
    ["GET", "/api/music/list/playlist/1"],
    ["GET", "/api/music/list/collection/1"],
    ["GET", "/api/music/list/artist/1"],
    ["GET", "/api/music/recent"],
    ["GET", "/api/music/stream/1"],
    ["POST", "/api/music/log"]
  ];
  for (const [method, path] of routes) {
    const response = await worker.fetch(apiRequest(path, { method }), env);
    assert.notEqual(response.status, 401, `${method} ${path} must not return 401`);
  }
});
