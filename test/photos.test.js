import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { indexedAlbumPhotos } from "../worker/index.js";

function d1() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["0000_initial.sql", "0001_photo_seen.sql", "0002_photo_hidden.sql"]) sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...next) => statement(sql, next),
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    run: async () => sqlite.prepare(sql).run(...args),
  });
  return {
    sqlite,
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try {
        const out = [];
        for (const s of statements) out.push({ results: /^\s*SELECT/i.test(s.sql) ? sqlite.prepare(s.sql).all(...s.args) : (sqlite.prepare(s.sql).run(...s.args), []) });
        sqlite.exec("COMMIT");
        return out;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-18T12:00:00Z");

function seed(db, { old = 0, recentTaken = 0, recentAdded = 0 }) {
  const photo = db.sqlite.prepare("INSERT INTO album_photo (album, gen, id, src, date, o) VALUES ('main', 1, ?, ?, ?, 'l')");
  const seen = db.sqlite.prepare("INSERT INTO photo_seen (album, id, added) VALUES ('main', ?, ?)");
  let n = 0;
  const add = (kind, date, added) => { const id = `${kind}${n++}`; photo.run(id, `https://p/${id}`, date); seen.run(id, added); };
  for (let i = 0; i < old; i++) add("old", `20${10 + (i % 14)}-06-01`, 0);
  for (let i = 0; i < recentTaken; i++) add("taken", "2026-10-01", 0);
  for (let i = 0; i < recentAdded; i++) add("added", "2019-03-03", NOW - 2 * DAY);
  db.sqlite.prepare("INSERT INTO album_scan (album, live_gen, count) VALUES ('main', 1, ?)").run(n);
}


test("batch mixes new photos with older ones", async () => {
  const db = d1();
  seed(db, { old: 2000, recentTaken: 150, recentAdded: 150 });
  const { indexedAlbumPhotos } = await import("../worker/index.js");
  const body = await indexedAlbumPhotos(db, "main", NOW);
  const ids = body.photos.map((p) => p.src.split("/").pop());
  assert.equal(ids.length, 300);
  assert.equal(new Set(ids).size, 300);
  const fresh = ids.filter((id) => !id.startsWith("old")).length;
  assert.equal(body.fresh, 100);
  assert.equal(fresh, 100);
  assert.ok(ids.some((id) => id.startsWith("taken")) && ids.some((id) => id.startsWith("added")));
});

test("older photos not shown in the last day are preferred", async () => {
  const db = d1();
  seed(db, { old: 800 });
  const { indexedAlbumPhotos } = await import("../worker/index.js");
  const seen = new Set();
  for (let i = 0; i < 2; i++) {
    const body = await indexedAlbumPhotos(db, "main", NOW + i * 60 * 60 * 1000);
    for (const p of body.photos) { assert.ok(!seen.has(p.src), "repeat within a day"); seen.add(p.src); }
  }
  assert.equal(seen.size, 600);
});

test("small album with few new photos still fills the batch", async () => {
  const db = d1();
  seed(db, { old: 40, recentAdded: 5 });
  const { indexedAlbumPhotos } = await import("../worker/index.js");
  const body = await indexedAlbumPhotos(db, "main", NOW);
  assert.equal(body.photos.length, 45);
  assert.equal(body.fresh, 5);
});

test("falls back to plain random when photo_seen is missing", async () => {
  const db = d1();
  seed(db, { old: 10 });
  db.sqlite.exec("DROP TABLE photo_seen");
  const { indexedAlbumPhotos } = await import("../worker/index.js");
  const body = await indexedAlbumPhotos(db, "main", NOW);
  assert.equal(body.photos.length, 10);
  assert.equal(body.fresh, undefined);
});

test("hidden photos are never served", async () => {
  const db = d1();
  seed(db, { old: 40, recentTaken: 10 });
  db.sqlite.prepare("INSERT INTO photo_hidden (album, id, src, hidden) SELECT album, id, src, 1 FROM album_photo WHERE id IN ('old0', 'old1', 'taken40')").run();
  const { indexedAlbumPhotos } = await import("../worker/index.js");
  const ids = (await indexedAlbumPhotos(db, "main", NOW)).photos.map((p) => p.src.split("/").pop());
  assert.equal(ids.length, 47);
  for (const id of ["old0", "old1", "taken40"]) assert.ok(!ids.includes(id));
});

test("hide and unhide through the API", async () => {
  const db = d1();
  const id = "https://lh3.googleusercontent.com/pw/AP1abc_DEF-9";
  db.sqlite.prepare("INSERT INTO album_photo (album, gen, id, src, date, o, mk) VALUES ('main', 1, ?, ?, '2020-01-01', 'l', 'AF1QipXYZ')").run(id, `${id}=w1280-h800`);
  db.sqlite.prepare("INSERT INTO album_scan (album, live_gen, count) VALUES ('main', 1, 1)").run();
  const { hidePhoto } = await import("../worker/index.js");
  const call = (hide, src) => hidePhoto(new Request("https://x/", { method: "POST", body: JSON.stringify({ album: "main", src }) }), { DB: db }, hide, async () => false);
  {
    assert.equal((await call(true, "https://evil.example/x")).status, 400);
    const r = await call(true, `${id}=w1280-h800`);
    assert.equal(r.status, 200);
    assert.deepEqual({ ...db.sqlite.prepare("SELECT id, mk, date FROM photo_hidden").get() }, { id, mk: "AF1QipXYZ", date: "2020-01-01" });
    assert.equal((await call(false, `${id}=w600-h400`)).status, 200);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) c FROM photo_hidden").get().c, 0);
  }
});

test("mixed mode defaults remain 100 of 300 recent and the share is adjustable", async () => {
  const db = d1();
  seed(db, { old: 600, recentTaken: 400 });
  assert.equal((await indexedAlbumPhotos(db, "main", NOW, "America/Toronto", { mode: "mixed" })).fresh, 100);
  for (const [percent, fresh] of [[0, 0], [25, 75], [50, 150], [100, 300]]) {
    const result = await indexedAlbumPhotos(db, "main", NOW, "America/Toronto", { mode: "mixed", recentPercent: percent });
    assert.equal(result.photos.length, 300);
    assert.equal(result.fresh, fresh);
  }
});

test("recent mode orders by date taken and includes newly added older pictures", async () => {
  const db = d1();
  seed(db, { old: 400, recentTaken: 400, recentAdded: 20 });
  const result = await indexedAlbumPhotos(db, "main", NOW, "America/Toronto", { mode: "recent" });
  assert.equal(result.photos.length, 300);
  assert.equal(result.photos.filter((p) => p.src.includes("/added")).length, 20);
  const dates = result.photos.map((p) => p.date);
  assert.deepEqual(dates, dates.slice().sort().reverse());
  db.sqlite.exec("DROP TABLE photo_seen");
  assert.equal((await indexedAlbumPhotos(db, "main", NOW, "America/Toronto", { mode: "recent" })).photos.length, 300);
});

test("random mode has no recent cap and excludes hidden and other-household rows", async () => {
  const db = d1();
  seed(db, { recentTaken: 500 });
  db.sqlite.prepare("INSERT INTO photo_hidden (album,id,src,hidden) VALUES ('main','taken0','hidden',1)").run();
  db.sqlite.prepare("INSERT INTO album_photo (album,gen,id,src) VALUES ('h2:main',1,'friend','friend-photo')").run();
  const result = await indexedAlbumPhotos(db, "main", NOW, "America/Toronto", { mode: "random" });
  assert.equal(result.photos.length, 300);
  assert.equal(new Set(result.photos.map((p) => p.src)).size, 300);
  assert.ok(result.photos.every((p) => p.src !== "friend-photo" && !p.src.endsWith("/taken0")));
});

test("memories prioritize week, month and yearly anniversaries then fill a unique mixed batch", async () => {
  const db = d1();
  seed(db, { old: 500, recentTaken: 200 });
  for (const [id, date] of [["week","2026-10-11"],["month","2026-09-18"],["year","2025-10-18"],["two-years","2024-10-18"],["hidden","2023-10-18"]]) {
    db.sqlite.prepare("INSERT INTO album_photo (album,gen,id,src,date,o) VALUES ('main',1,?,?,?,'l')").run(id, "https://p/" + id, date);
  }
  db.sqlite.prepare("INSERT INTO photo_hidden (album,id,src,hidden) VALUES ('main','hidden','hidden',1)").run();
  const result = await indexedAlbumPhotos(db, "main", NOW, "America/Toronto", { mode: "onthisday" });
  assert.equal(result.photos.length, 300);
  assert.deepEqual(result.photos.slice(0,4).map((p) => p.src), ["https://p/week","https://p/month","https://p/year","https://p/two-years"]);
  assert.equal(new Set(result.photos.map((p) => p.src)).size, 300);
  assert.ok(!result.photos.some((p) => p.src.endsWith("/hidden")));
});

test("all photo modes handle empty albums and memories fill albums with no anniversary matches", async () => {
  const db = d1();
  seed(db, {});
  for (const mode of ["mixed","recent","random","onthisday"]) assert.equal((await indexedAlbumPhotos(db, "main", NOW, "America/Toronto", { mode })).photos.length, 0);
  db.sqlite.exec("DELETE FROM album_scan");
  seed(db, { recentTaken: 400 });
  const result = await indexedAlbumPhotos(db, "main", NOW, "America/Toronto", { mode: "onthisday" });
  assert.equal(result.photos.length, 300);
});
