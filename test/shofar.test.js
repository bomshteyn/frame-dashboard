import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("public/assets/shofar.js", "utf8");
const context = {
  window: {},
  document: { getElementById: () => null },
};
vm.runInNewContext(source.replace(/^import[^\n]+\n/, ""), context, { filename: "public/assets/shofar.js" });
const due = context.window.HQShofar.due;

const start = "2026-10-02T22:00:00.000Z";
const warnAt = Date.parse(start) - 15 * 60 * 1000;
const windows = [{ start, end: "2026-10-03T23:00:00.000Z" }];

test("warn is due for the 90-second window after its scheduled time", () => {
  assert.equal(due(windows, warnAt - 1000, []), null);
  assert.equal(due(windows, warnAt, []).kind, "warn");
  assert.equal(due(windows, warnAt + 89 * 1000, []).kind, "warn");
  assert.equal(due(windows, warnAt + 90 * 1000, []), null);
});

test("start event is due at candle lighting", () => {
  assert.equal(due(windows, Date.parse(start), []).kind, "start");
});

test("an already-played event is ignored", () => {
  assert.equal(due(windows, Date.parse(start), [start + "|start"]), null);
});

test("an event inside another active Kodesh window is ignored", () => {
  const overlapping = [
    { start: "2026-10-02T22:00:00.000Z", end: "2026-10-04T23:30:00.000Z" },
    { start: "2026-10-03T22:00:00.000Z", end: "2026-10-04T23:30:00.000Z" },
  ];
  assert.equal(due(overlapping, Date.parse(overlapping[1].start), []), null);
  assert.equal(due(overlapping, Date.parse(overlapping[1].start) - 15 * 60 * 1000, []), null);
});

test("a merged Yom Tov and Shabbat window only fires at its own start", () => {
  const merged = [{ start: "2026-10-02T22:00:00.000Z", end: "2026-10-04T23:30:00.000Z" }];
  assert.equal(due(merged, Date.parse(merged[0].start) - 15 * 60 * 1000, []).kind, "warn");
  assert.equal(due(merged, Date.parse(merged[0].start), []).kind, "start");
  assert.equal(due(merged, Date.parse("2026-10-03T22:00:00.000Z"), []), null);
});
