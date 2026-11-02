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
  assert.match(html, /src="\/assets\/phone\/app\.js\?v=2"/);
  assert.match(html, /href="\/assets\/phone\/phone\.css"/);
  assert.doesNotMatch(html, /mobile-[\w-]+\.(?:js|css)/);
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
