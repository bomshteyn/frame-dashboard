import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("public/assets/state-poll.js", "utf8");
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

function harness(fetcher = async () => ({ ok: true, json: async () => ({ music: 123, shofar: 456 }) })) {
  let now = 0;
  let id = 0;
  const timers = new Map();
  const events = new Map();
  const requests = [];
  const document = {
    hidden: false,
    addEventListener: (name, listener) => events.set(name, listener),
  };
  const context = {
    document,
    AbortController,
    Date: { now: () => now },
    setTimeout: (fn, delay) => { timers.set(++id, { fn, at: now + delay }); return id; },
    clearTimeout: key => timers.delete(key),
    fetch: (...args) => { requests.push({ at: now, url: args[0] }); return fetcher(...args); },
  };
  vm.runInNewContext(source.replaceAll("export function", "function") + "\nglobalThis.api = { readStateVersions, subscribeStateVersions };", context);
  return {
    ...context.api,
    context,
    requests,
    async advance(ms) {
      const until = now + ms;
      for (let i = 0; i < 100000; i++) {
        await flush();
        const [key, next] = Array.from(timers).sort((a, b) => a[1].at - b[1].at)[0] || [];
        if (!next || next.at > until) break;
        timers.delete(key);
        now = next.at;
        next.fn();
      }
      now = until;
      await flush();
    },
    async visibility(hidden) {
      document.hidden = hidden;
      events.get("visibilitychange")();
      await flush();
    },
  };
}

test("base sync, music and shofar share one request every ten seconds", async () => {
  const h = harness();
  const received = [[], [], []];
  received.forEach(values => h.subscribeStateVersions(value => values.push(value)));
  await h.advance(0);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(received.map(values => values.length), [1, 1, 1]);
  await h.advance(9999);
  assert.equal(h.requests.length, 1);
  await h.advance(1);
  assert.equal(h.requests.length, 2);
  assert.deepEqual(received.map(values => values.length), [2, 2, 2]);
  await h.advance(20000);
  assert.deepEqual(h.requests.map(request => request.at), [0, 10000, 20000, 30000]);
});

test("manual reads and later subscribers reuse the shared response", async () => {
  const h = harness();
  h.subscribeStateVersions(() => {});
  await h.advance(0);
  await h.advance(5000);
  const a = h.readStateVersions();
  const b = h.readStateVersions();
  const received = [];
  h.subscribeStateVersions(value => received.push(value));
  assert.equal(await a, await b);
  await flush();
  assert.equal(received.length, 1);
  assert.equal(h.requests.length, 1);
  await h.advance(5000);
  assert.equal(h.requests.length, 2);
});

test("slow network requests and slow subscribers never overlap", async () => {
  let respond;
  let finishListener;
  const h = harness(() => new Promise(resolve => { respond = resolve; }));
  let calls = 0;
  h.subscribeStateVersions(() => { calls++; return new Promise(resolve => { finishListener = resolve; }); });
  await h.advance(0);
  const first = h.readStateVersions();
  assert.equal(h.readStateVersions(), first);
  await h.advance(11000);
  assert.equal(h.requests.length, 1);
  respond({ ok: true, json: async () => ({ tasks: 1 }) });
  await first;
  await flush();
  assert.equal(calls, 1);
  await h.advance(9999);
  assert.equal(h.requests.length, 1);
  await h.advance(1);
  assert.equal(h.requests.length, 2);
  respond({ ok: true, json: async () => ({ tasks: 2 }) });
  await flush();
  assert.equal(calls, 1);
  finishListener();
  await flush();
  await h.advance(10000);
  respond({ ok: true, json: async () => ({ tasks: 3 }) });
  await flush();
  assert.equal(calls, 2);
});

test("phone polling stops while hidden and resumes when visible", async () => {
  const h = harness();
  let calls = 0;
  h.subscribeStateVersions(() => { calls++; }, { pauseWhenHidden: true });
  await h.advance(0);
  await h.visibility(true);
  await h.advance(60000);
  assert.equal(h.requests.length, 1);
  await h.visibility(false);
  await h.advance(0);
  assert.equal(h.requests.length, 2);
  assert.equal(calls, 2);
});

test("frame polling continues while hidden and does not multiply on visibility changes", async () => {
  const h = harness();
  let phoneCalls = 0;
  h.subscribeStateVersions(() => {});
  h.subscribeStateVersions(() => { phoneCalls++; }, { pauseWhenHidden: true });
  await h.advance(0);
  await h.visibility(true);
  await h.advance(30000);
  assert.equal(h.requests.length, 4);
  assert.equal(phoneCalls, 1);
  await h.visibility(false);
  await h.advance(0);
  assert.equal(h.requests.length, 4);
  assert.equal(phoneCalls, 2);
});

test("failed requests back off to sixty seconds and recover to ten seconds", async () => {
  let ok = false;
  const h = harness(async () => ({ ok, json: async () => ({ keys: { music: 42 } }) }));
  const received = [];
  h.subscribeStateVersions(value => received.push(value));
  await h.advance(0);
  await assert.rejects(h.readStateVersions());
  await h.advance(19999);
  assert.equal(h.requests.length, 1);
  await h.advance(1);
  await h.advance(40000);
  assert.deepEqual(h.requests.map(request => request.at), [0, 20000, 60000]);
  ok = true;
  await h.advance(60000);
  assert.equal(received[0].music, 42);
  await h.advance(10000);
  assert.equal(h.requests.length, 5);
});

test("hung requests time out without leaving polling stuck", async () => {
  let attempts = 0;
  const h = harness((url, options) => {
    if (++attempts > 1) return Promise.resolve({ ok: true, json: async () => ({ remote: 9 }) });
    return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  });
  const received = [];
  h.subscribeStateVersions(value => received.push(value));
  await h.advance(0);
  await h.advance(15000);
  assert.equal(h.requests.length, 1);
  await h.advance(5000);
  assert.equal(h.requests.length, 2);
  assert.equal(received[0].remote, 9);
});

test("unsubscribing stops the timer and a failing listener cannot stop other features", async () => {
  const h = harness();
  let calls = 0;
  const a = h.subscribeStateVersions(() => { throw new Error("broken feature"); });
  const b = h.subscribeStateVersions(() => { calls++; });
  await h.advance(0);
  assert.equal(calls, 1);
  a();
  b();
  await h.advance(60000);
  assert.equal(h.requests.length, 1);
});

test("a full day of idle polling stays within 8640 requests per frame", async () => {
  const h = harness();
  for (let i = 0; i < 3; i++) h.subscribeStateVersions(() => {});
  await h.advance(86400000 - 1);
  assert.equal(h.requests.length, 8640);
});

test("only the shared poller fetches state versions and all features subscribe", () => {
  const shared = readdirSync("public/assets").find(name => /^auto-update-.*\.js$/.test(name));
  for (const path of [`public/assets/${shared}`, "public/assets/music.js", "public/assets/shofar.js", "public/assets/phone/app.js"]) {
    const feature = readFileSync(path, "utf8");
    assert.doesNotMatch(feature, /fetch\([`"]\/api\/state\/version/);
    assert.match(feature, /subscribeStateVersions/);
  }
  const player = readFileSync("public/assets/music.js", "utf8");
  assert.doesNotMatch(player, /schedulePoll|queuedOrPlaying \? 2000/);
  assert.match(player, /Date\.now\(\) - lastNowReport >= 30000/);
});
