import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

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

test("photo slideshow preserves server ordering for recent and memories, retaining legacy mixed favorites", () => {
  const main = asset("main-");
  const source = main.slice(main.indexOf("s.refill=") + 9, main.indexOf(",s.take=", main.indexOf("s.refill=")));
  const photos = [{ src: "first", fav: true }, { src: "second" }];
  for (const mode of ["recent", "onthisday", "random", "mixed"]) {
    const refill = new Function("window", "r", "n", "App", "return (" + source + ")")(
      { DATA: { photoMode: mode } }, () => photos, (rows) => rows.reverse(), { photoMeta: () => ({}) });
    const slideshow = {};
    refill.call(slideshow);
    assert.equal(slideshow.queue.length, mode === "mixed" ? 3 : 2);
    if (mode === "recent" || mode === "onthisday") assert.deepEqual(slideshow.queue, photos);
    if (mode === "random") assert.deepEqual(slideshow.queue, photos.slice().reverse());
  }
  assert.ok(main.includes('n.photoMode===`recent`||n.photoMode===`onthisday`?0:n.photos.length-1'));
});

test("new household bootstrap excludes demo groceries while owner defaults remain unchanged", () => {
  const shared = asset("auto-update-");
  const source = shared.slice(shared.indexOf("window.CONFIG="), shared.indexOf("function f(e){return e&&typeof"));
  const bootstrap = (hid) => {
    const window = { FD: { hid } };
    vm.runInNewContext(source, { window, fetch: async () => ({ ok: true, json: async () => [] }) });
    return window.DATA;
  };
  const owner = bootstrap(1), friend = bootstrap(2);
  assert.equal(owner.groceries.filter((g) => !g.done).length, 21);
  assert.equal(friend.groceries.length, 0);
  assert.equal(friend.tasks.length, 0);
  assert.equal(friend.products.length, 0);
  assert.equal(friend.catalog.length, 0);
  assert.equal(friend.usuals.length, 0);
  assert.equal(friend.stores[0].name, "Shopping");
  assert.equal(friend.people[0].name, "Parent 1");
});

test("completed chore tasks remain visible through the household day including DST fallback", () => {
  const shared = asset("auto-update-");
  const source = shared.slice(shared.indexOf("function w(e,t)"), shared.indexOf("var T=/"));
  const filter = new Function("window", "b", "return (" + source + ")")({ FD: { tz: "America/Toronto" } }, 86400000);
  const chore = { choreId: "weekly", occurrence: "2026-11-01", done: true, doneAt: "2026-11-01T04:01:00Z" };
  assert.equal(filter([chore], new Date("2026-11-02T04:30:00Z")).length, 1);
  assert.equal(filter([chore], new Date("2026-11-02T05:01:00Z")).length, 0);
  assert.equal(filter([{ done: true, doneAt: chore.doneAt }], new Date("2026-11-02T04:30:00Z")).length, 0);
});

test("household surfaces use injected location and dynamic havdalah without changing default markup", () => {
  const main = asset("main-");
  assert.match(main, /window\.FD\?\.tz\|\|`America\/Toronto`/);
  assert.match(main, /window\.FD\?\.city/);
  assert.match(main, /window\.FD\?\.minyanimUrl/);
  assert.match(main, /t\.style\.display=e\?\`\`:\`none\`/);
  assert.match(main, /n\.havdalahTimes\|\|\[\{label:\`60 min\`/);
  assert.match(main, /\.join\(\` \`\)/);
  const phone = readFileSync("public/assets/phone/app.js", "utf8");
  for (const path of ["/api/settings", "/api/household", "/api/geo/search?q="]) assert.ok(phone.includes(path));
  assert.ok(!phone.includes("/api/admin/"));
  assert.ok(!phone.includes("renderFamilies"));
  for (const copy of ["Secret address in iCal format", "anyone with the link can view", "12 hours", "Save settings", "End Shabbos mode at"]) assert.ok(phone.includes(copy));
  const auth = asset("auto-update-");
  assert.ok(auth.includes("![6,8].includes(t.length)"));
  assert.ok(auth.includes("t.length<8"));
});

test("Shabbat havdalah rendering preserves legacy rows and supports custom opinions", () => {
  const main = asset("main-");
  const source = main.slice(main.indexOf("function x(n)"), main.indexOf("function S(e)", main.indexOf("function x(n)")));
  const data = { zmanim: { today: [], tomorrow: [] }, weatherLoaded: false };
  const app = {
    now: () => new Date("2026-01-01T12:00:00Z"), weatherNow: () => ({}), esc: (v) => v,
    dayOfMonth: () => 1, hebDate: () => "", fmt: { time: (v) => v.toISOString(), ampm: () => "", day: () => "", month: () => "" }
  };
  const render = new Function("e", "t", "return (" + source + ")")(data, app);
  const window = { end: "2026-01-03T23:00:00Z", havdalah60: "2026-01-03T22:48:00Z", havdalah72: "2026-01-03T23:00:00Z" };
  const rows = (w) => render(w).match(/<div class="kodesh-havdalah">([\s\S]*?)<\/div>/)[1];
  const legacy = '<span>Havdalah 60 min <b>2026-01-03T22:48:00.000Z</b></span> <span>72 min <b>2026-01-03T23:00:00.000Z</b></span>';
  assert.equal(rows(window), legacy);
  assert.equal(rows({ ...window, havdalahTimes: [{ label: "60 min", time: window.havdalah60 }, { label: "72 min", time: window.havdalah72 }] }), legacy);
  assert.equal(rows({ ...window, havdalahTimes: [{ label: "8.5°", time: window.end }] }), '<span>Havdalah 8.5° <b>2026-01-03T23:00:00.000Z</b></span>');
  assert.equal(rows({ ...window, havdalahTimes: [] }), "");
});

test("phone page loads its readable source assets", () => {
  const html = readFileSync("public/m.html", "utf8");
  assert.match(html, /src="\/assets\/phone\/app\.js\?v=6"/);
  assert.match(html, /href="\/assets\/phone\/phone\.css\?v=4"/);
  assert.doesNotMatch(html, /mobile-[\w-]+\.(?:js|css)/);
});

test("standalone admin and frame repeat controls use separate readable assets", () => {
  const admin = readFileSync(new URL("../public/admin.html", import.meta.url), "utf8");
  assert.match(admin, /assets\/admin\/admin.js\?v=1/);
  const main = asset("main-");
  assert.ok(main.includes("data-repeat-list"));
  assert.ok(main.includes("data-repeat-add"));
  assert.ok(main.includes("data-edit-repeat"));
  assert.ok(main.includes('await i.load(`tasks`)'));
  const portal = readFileSync(new URL("../public/assets/admin/admin.js", import.meta.url), "utf8");
  assert.ok(portal.includes("No families yet"));
  assert.ok(portal.includes("On the frame's login screen enter PIN "));
  assert.ok(!portal.includes("localStorage"));
});

test("weather detail renders the household city safely and defaults to Toronto", () => {
  const main = asset("main-");
  const start = main.indexOf("function d(){var i=e.weather");
  const source = main.slice(start, main.indexOf("function f(e)", start));
  const app = { esc: (v) => v.replaceAll("<", "&lt;"), icon: () => "", weatherNow: () => ({ hi: 20, lo: 10, temp: 16 }) };
  const render = new Function("App", "window", "e", "t", "n", "l", "r", "return (" + source + ")()");
  const weather = (window) => render(app, window, { weather: {} }, { sel: 0, hover: null, hours: [] }, {}, () => null, () => "");
  assert.match(weather({ FD: { city: "Jerusalem, Israel" } }), /Jerusalem, Israel · H 20°/);
  assert.match(weather({ FD: { city: "<city>" } }), /&lt;city>/);
  assert.match(weather({}), /Toronto · H 20°/);
  assert.match(weather({ FD: { city: "" } }), /Toronto · H 20°/);
});

test("frame loads the lazy local music player", () => {
  const html = readFileSync("public/index.html", "utf8");
  const player = readFileSync("public/assets/music.js", "utf8");
  assert.match(html, /src="\/assets\/music\.js\?v=7"/);
  assert.match(html, /href="\/assets\/music\.css\?v=5"/);
  assert.match(html, /href="\/assets\/music-view\.css\?v=2"/);
  assert.doesNotMatch(html, /hls\.light\.min\.js/);
  assert.match(player, /script\.src = "\/assets\/hls\.light\.min\.js"/);
});

test("music icons use the 24six mark in app navigation and placeholders", () => {
  const html = readFileSync("public/index.html", "utf8");
  const phone = readFileSync("public/assets/phone/app.js", "utf8");
  const player = readFileSync("public/assets/music.js", "utf8");
  const currentColorMark = /<path d="([^"]+)" fill="currentColor" stroke="none" transform="translate\(3\.2 1\.9\) scale\(0\.84\)"\/>/;
  const railMark = html.slice(html.indexOf('data-go="music"')).match(currentColorMark)?.[1];
  const phoneMark = phone.slice(phone.indexOf("var musicMark")).match(currentColorMark)?.[1];
  const frameMark = player.slice(player.indexOf("note:")).match(/<path d="([^"]+)" fill="#FFB84A" stroke="none" transform="translate\(3\.2 1\.9\) scale\(0\.84\)"\/>/)?.[1];
  assert.ok(railMark);
  assert.equal(phoneMark, railMark);
  assert.equal(frameMark, railMark);
  assert.match(phone, /music: musicMark,/);
  assert.match(phone, /item\[2\] === `music` \? musicMark : window\.ICONS\[item\[2\]\]/);
});

test("frame music uses a frame-local playback queue and index", () => {
  const player = readFileSync("public/assets/music.js", "utf8");
  assert.match(player, /let playQueue = \[\];/);
  assert.match(player, /function queue\(\) \{\s*return playQueue;\s*\}/);
  assert.match(player, /const firstLoad = musicVersion === null;/);
  assert.match(player, /if \(targetMatches && sequence > lastSequence\) \{\s*playQueue = Array\.isArray\(musicState\.queue\) \? musicState\.queue\.slice\(\) : \[\];/);
  assert.match(player, /const tracks = queue\(\);\s*const index = activeIndex;\s*const track = activeTrack \|\| tracks\[index\] \|\| \{\};/);
  assert.doesNotMatch(player, /activeIndex = Number\(musicState\.index\)/);
});

test("phone music follows the selected frame and polls its playback states", () => {
  const phone = readFileSync("public/assets/phone/app.js", "utf8");
  assert.match(phone, /function currentMusicNowPlaying\(\) \{\s*var command = mobileData\.music \|\| \{\},\s*target = viewState\.musicTarget \|\| command\.target/);
  assert.match(phone, /if \(target === `small`\) return small;\s*if \(target === `large`\) return large;/);
  assert.match(phone, /function pollMusicState\(versions\)/);
  assert.match(phone, /\[`music`, `music_now_small`, `music_now_large`\]/);
  assert.match(phone, /subscribeStateVersions\(pollMusicState, \{ pauseWhenHidden: !0 \}\)/);
  assert.match(phone, /current = state\.id != null \? state : queue\[Number\(command\.index\) \|\| 0\] \|\| \{\}/);
  assert.match(phone, /typeof state\.playing === `boolean` \? state\.playing : !!command\.playing/);
  assert.match(phone, /String\(queue\[nowIndex\]\.id\) === String\(nowState\.id\)/);
});

test("phone music commands write state directly with one conflict retry", () => {
  const phone = readFileSync("public/assets/phone/app.js", "utf8");
  assert.match(phone, /async function writeMusicState\(next, isCommand\)/);
  assert.match(phone, /fetch\(`\/api\/state\/music`, \{ cache: `no-store` \}\)/);
  assert.match(phone, /method: `PUT`[\s\S]*?body: JSON\.stringify\(\{ json: next, base: Number\(current\.updated\) \|\| 0 \}\)/);
  assert.match(phone, /if \(response\.status === 409 && attempt === 0\)[\s\S]*?next\.seq = \(Number\(result\.json && result\.json\.seq\) \|\| 0\) \+ 1/);
  assert.match(phone, /mobileData\.music = next;\s*musicStateVersions\.music = Number\(result\.updated\)/);
  assert.match(phone, /writeMusicState\(next, !0\)/);
  assert.doesNotMatch(phone, /persistState\(`music`\)/);
});

test("phone and frame shuffle helpers keep the selected track first and return a permutation", () => {
  const phone = readFileSync("public/assets/phone/app.js", "utf8");
  const player = readFileSync("public/assets/music.js", "utf8");
  const tracks = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  for (const source of [phone, player]) {
    const helper = source.match(/function shuffledQueue\(tracks, keepIndex\) \{[\s\S]*?\n  \}/);
    assert.ok(helper, "shuffledQueue helper exists");
    const shuffledQueue = new Function(`${helper[0]}; return shuffledQueue;`)();
    const selectedFirst = shuffledQueue(tracks, 2);
    assert.equal(selectedFirst[0], tracks[2]);
    assert.deepEqual(selectedFirst.map((track) => track.id).sort(), tracks.map((track) => track.id).sort());
    const fullShuffle = shuffledQueue(tracks, null);
    assert.deepEqual(fullShuffle.map((track) => track.id).sort(), tracks.map((track) => track.id).sort());
    assert.notEqual(fullShuffle, tracks);
  }
});

test("shuffle toggles use the shared command shape and preserve shuffle queues", () => {
  const phone = readFileSync("public/assets/phone/app.js", "utf8");
  const player = readFileSync("public/assets/music.js", "utf8");
  assert.match(phone, /cmd: `shuffle`,\s*arg: enabled,\s*shuffle: enabled/);
  assert.match(phone, /var enabled = !current\.shuffle/);
  assert.match(phone, /var originalQueue = nextQueue\.slice\(\),\s*keepIndex = extra == null \? null : Number\(index\)/);
  assert.match(phone, /if \(command === `play` && current\.shuffle && nextQueue !== currentQueue\)/);
  assert.match(phone, /unshuffled: originalQueue/);
  assert.match(phone, /if \(enabled\) next\.unshuffled = unshuffled;\s*else delete next\.unshuffled;/);
  assert.match(phone, /data-music-action="shuffle"[\s\S]*?aria-pressed="/);
  assert.match(player, /if \(command === "shuffle"\) \{[\s\S]*?shuffle = true;[\s\S]*?nextArgument = !!argument;/);
  assert.match(player, /const isCurrentQueue = commandQueue === playQueue;/);
  assert.match(player, /command === "play" && shuffle && !isCurrentQueue/);
  assert.match(player, /argument == null \? null : Number\(index\)/);
  assert.match(player, /cmd: command,\s*arg: nextArgument/);
  assert.match(player, /if \(shuffle && Array\.isArray\(unshuffled\)\) next\.unshuffled = unshuffled;/);
  assert.match(player, /case "shuffle":\s*activeIndex = Number\(command\.index\) \|\| 0;\s*activeTrack = playQueue\[activeIndex\];\s*renderChip\(\);\s*reportNowPlaying\(\);/);
  assert.match(player, /data-player-action="shuffle" aria-label="Shuffle" aria-pressed=/);
});
