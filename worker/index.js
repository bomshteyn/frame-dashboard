import ICALmodule from "ical.js";

var TORONTO = "America/Toronto";
var ZMANIM = [
  ["alotHaShachar", "Alos"],
  ["sunrise", "Netz"],
  ["sofZmanShmaMGA", "Sof Zman Shema (MGA)"],
  ["sofZmanShma", "Sof Zman Shema (Gra)"],
  ["sofZmanTfilla", "Sof Zman Tefilla"],
  ["chatzot", "Chatzos"],
  ["minchaGedola", "Mincha Gedola"],
  ["plagHaMincha", "Plag HaMincha"],
  ["sunset", "Shkia"],
  ["tzeit7083deg", "Tzeis"]
];
var STATE_KEYS = new Set(["tasks", "groceries", "photos-favs", "stores", "products", "people", "remote", "heartbeat"]);
var SESSION_SECONDS = 365 * 24 * 60 * 60;
var LOGIN_WINDOW_MS = 15 * 60 * 1e3;
var LOGIN_MAX_FAILURES = 5;
var enc = new TextEncoder();
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function dateParts(date, timeZone = TORONTO) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = {};
  parts.forEach((part) => {
    values[part.type] = part.value;
  });
  return { year: +values.year, month: +values.month, day: +values.day };
}
function dateString(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
function addDate(value, amount) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return dateString({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() });
}
function asISO(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function localDateTimeToEpoch(value, endOfDay = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(value).getTime();
  const [year, month, day] = match.slice(1).map(Number);
  const hour = endOfDay ? 0 : 0;
  let epoch = Date.UTC(year, month - 1, day, hour);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TORONTO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(epoch));
    const values = {};
    parts.forEach((part) => {
      values[part.type] = +part.value;
    });
    const represented = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
    const desired = Date.UTC(year, month - 1, day, hour);
    epoch += desired - represented;
  }
  return epoch;
}
async function cachedJson(url, ttlSeconds, fetcher = fetch) {
  const key = new Request(url);
  const cache = globalThis.caches?.default;
  const hit = cache ? await cache.match(key) : null;
  if (hit) return hit.json();
  const response = await fetcher(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Upstream request failed");
  const body = await response.text();
  const value = JSON.parse(body);
  if (cache) await cache.put(key, new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${ttlSeconds}`
    }
  }));
  return value;
}
async function cachedText(url, ttlSeconds) {
  const key = new Request(url);
  const cache = globalThis.caches?.default;
  const hit = cache ? await cache.match(key) : null;
  if (hit) return hit.text();
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 (compatible; FrameDashboard/1.0)"
    }
  });
  if (!response.ok) throw new Error("Album request failed");
  const body = await response.text();
  if (cache) await cache.put(key, new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": `public, max-age=${ttlSeconds}` }
  }));
  return body;
}
function iconFor(code, isDay) {
  if (code === 0) return isDay ? "sun" : "moon";
  if (code === 1 || code === 2) return "partly";
  if (code === 3 || code === 45 || code === 48) return "cloud";
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "cloud";
  if (code >= 80 && code <= 82) return "rain";
  if (code === 85 || code === 86) return "cloud";
  if (code >= 95) return "rain";
  return "cloud";
}
function weatherUrl() {
  const params = new URLSearchParams({
    latitude: "43.70643",
    longitude: "-79.39864",
    current: "temperature_2m,weather_code,is_day,relative_humidity_2m,apparent_temperature,wind_speed_10m",
    hourly: "temperature_2m,weather_code,precipitation_probability,is_day",
    daily: "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
    timezone: TORONTO,
    forecast_days: "7"
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}
async function weather(request) {
  const value = await cachedJson(weatherUrl(), 900);
  const today = dateString(dateParts(new Date()));
  const hours = new Map();
  (value.hourly?.time || []).forEach((time, index) => {
    hours.set(time.slice(0, 13), index);
  });
  const toHour = (key, index) => {
    const code = Number(value.hourly.weather_code[index]);
    return {
      h: Number(key.slice(11, 13)),
      t: Math.round(Number(value.hourly.temperature_2m[index])),
      c: iconFor(code, Number(value.hourly.is_day[index]) === 1),
      p: Math.round(Number(value.hourly.precipitation_probability[index]) || 0)
    };
  };
  const dailyIndex = (value.daily?.time || []).indexOf(today);
  const current = value.current || {};
  const nowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO,
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const localHour = +(nowParts.find((part) => part.type === "hour")?.value || 0);
  const nowKey = `${today}T${String(localHour).padStart(2, "0")}`;
  const todayHours = Array.from({ length: 24 }, (_, hour) => {
    const key = `${today}T${String(hour).padStart(2, "0")}`;
    const index = hours.get(key);
    if (index == null) return { h: hour, t: 0, c: "cloud", p: 0 };
    return toHour(key, index);
  });
  const next24 = [];
  for (let i = 0; i < 24; i++) {
    const time = new Date(localDateTimeToEpoch(today) + (localHour + i) * 36e5);
    const parts = dateParts(time);
    const hourParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TORONTO,
      hour: "2-digit",
      hourCycle: "h23"
    }).formatToParts(time);
    const hour = +(hourParts.find((part) => part.type === "hour")?.value || 0);
    const key = `${dateString(parts)}T${String(hour).padStart(2, "0")}`;
    const index = hours.get(key);
    if (index != null) next24.push(toHour(key, index));
  }
  return json({
    hi: Math.round(Number(value.daily?.temperature_2m_max?.[dailyIndex] ?? current.temperature_2m)),
    lo: Math.round(Number(value.daily?.temperature_2m_min?.[dailyIndex] ?? current.temperature_2m)),
    feels: Math.round(Number(current.apparent_temperature ?? current.temperature_2m)),
    humidity: Math.round(Number(current.relative_humidity_2m) || 0),
    wind: Math.round(Number(current.wind_speed_10m) || 0),
    t: todayHours.map((hour) => hour.t),
    c: todayHours.map((hour) => hour.c),
    p: todayHours.map((hour) => hour.p),
    now: { t: Math.round(Number(current.temperature_2m)), c: iconFor(Number(current.weather_code), Number(current.is_day) === 1) },
    next24,
    days: (value.daily?.time || []).slice(Math.max(dailyIndex, 0), Math.max(dailyIndex, 0) + 7).map((date, offset) => {
      const index = Math.max(dailyIndex, 0) + offset;
      return {
        d: date,
        hi: Math.round(Number(value.daily.temperature_2m_max?.[index])),
        lo: Math.round(Number(value.daily.temperature_2m_min?.[index])),
        c: iconFor(Number(value.daily.weather_code?.[index]), true),
        p: Math.round(Number(value.daily.precipitation_probability_max?.[index]) || 0),
        hrs: Array.from({ length: 24 }, (_, hour) => {
          const key = `${date}T${String(hour).padStart(2, "0")}`;
          const at = hours.get(key);
          return at == null ? null : toHour(key, at);
        }).filter(Boolean)
      };
    })
  });
}
function buildKodeshWindows(items) {
  const sorted = items.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const windows = [];
  let open = null;
  sorted.forEach((item) => {
    const time = asISO(item.date);
    if (!time) return;
    if (item.category === "candles" && !open) {
      open = { start: time, startDay: String(item.date).slice(0, 10), items: [] };
      open.items.push(item);
      return;
    }
    if (!open) return;
    open.items.push(item);
    if (item.category !== "havdalah") return;
    const endDay = String(item.date).slice(0, 10);
    const holidays = [];
    let yomKippur = false;
    let parashat = "";
    open.items.forEach((entry) => {
      const itemDate = String(entry.date).slice(0, 10);
      if (itemDate < open.startDay || itemDate > endDay) return;
      if (entry.category === "holiday" && entry.yomtov) {
        if (!holidays.includes(entry.title)) holidays.push(entry.title);
        if (entry.title === "Yom Kippur") yomKippur = true;
      }
      if (entry.category === "parashat" && !parashat) parashat = entry.title;
    });
    const end = new Date(time);
    const havdalah60 = new Date(end.getTime() - 12 * 6e4).toISOString();
    const title = holidays.length ? holidays.join(" \xB7 ") : ["Shabbat", parashat].filter(Boolean).join(" \xB7 ");
    windows.push({ start: open.start, end: time, havdalah60, havdalah72: time, title, yomtov: holidays.length > 0, yomKippur });
    open = null;
  });
  return windows;
}
function upcomingWindow(windows, now = Date.now()) {
  const next = windows.find((window) => new Date(window.end).getTime() > now);
  if (!next) return { candles: null, havdalah: null, havdalah60: null, havdalah72: null, title: "", yomtov: false, yomKippur: false };
  return {
    candles: next.start,
    havdalah: next.end,
    havdalah60: next.havdalah60,
    havdalah72: next.havdalah72,
    title: next.title,
    yomtov: next.yomtov,
    yomKippur: next.yomKippur
  };
}
function zmanimUrl(date) {
  return `https://www.hebcal.com/zmanim?cfg=json&geonameid=6167865&date=${date}`;
}
function hebcalUrl(start, end) {
  const params = new URLSearchParams({
    v: "1",
    cfg: "json",
    maj: "on",
    min: "off",
    mod: "off",
    nx: "off",
    ss: "off",
    mf: "off",
    s: "on",
    c: "on",
    b: "18",
    m: "72",
    geonameid: "6167865",
    start,
    end
  });
  return `https://www.hebcal.com/hebcal?${params}`;
}
function dafYomiUrl(start, end) {
  const params = new URLSearchParams({
    v: "1",
    cfg: "json",
    F: "on",
    maj: "off",
    min: "off",
    nx: "off",
    mf: "off",
    ss: "off",
    mod: "off",
    s: "off",
    c: "off",
    start,
    end
  });
  return `https://www.hebcal.com/hebcal?${params}`;
}
function zmanimList(times) {
  return ZMANIM.map(([key, label]) => {
    const value = key === "tzeit7083deg" ? times.tzeit7083deg || times.tzeit85deg : times[key];
    const time = asISO(value);
    return time ? { key, label, time } : null;
  }).filter(Boolean);
}
async function zmanimData(fetcher = fetch) {
  const today = dateString(dateParts(new Date()));
  const tomorrow = addDate(today, 1);
  const calendarStart = addDate(today, -3);
  const calendarEnd = addDate(today, 45);
  const getJson = (url) => cachedJson(url, 21600, fetcher);
  const [todayData, tomorrowData, holidays, dafYomi] = await Promise.all([
    getJson(zmanimUrl(today)),
    getJson(zmanimUrl(tomorrow)),
    getJson(hebcalUrl(calendarStart, calendarEnd)),
    getJson(dafYomiUrl(today, tomorrow)).catch(() => ({ items: [] }))
  ]);
  const windows = buildKodeshWindows(holidays.items || []);
  const daf = {};
  (Array.isArray(dafYomi.items) ? dafYomi.items : []).forEach((item) => {
    if (item.category === "dafyomi" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && typeof item.title === "string") {
      daf[item.date] = item.title;
    }
  });
  return {
    today: zmanimList(todayData.times || {}),
    tomorrow: zmanimList(tomorrowData.times || {}),
    windows,
    upcoming: upcomingWindow(windows),
    daf
  };
}
async function zmanim() {
  return json(await zmanimData());
}
function validDateRange(url) {
  const today = dateString(dateParts(new Date()));
  const from = url.searchParams.get("from") || addDate(today, -1);
  const to = url.searchParams.get("to") || addDate(today, 35);
  const start = localDateTimeToEpoch(from);
  const end = localDateTimeToEpoch(/^\d{4}-\d{2}-\d{2}$/.test(to) ? addDate(to, 1) : to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null;
  return { start, end };
}
function timeISO(time, allDay) {
  if (allDay) {
    return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}T00:00:00`;
  }
  return time.toJSDate().toISOString();
}
function expandCalendar(ics, person, range) {
  const root = new ICALmodule.Component(ICALmodule.parse(ics));
  const components = root.getAllSubcomponents("vevent");
  const events = [];
  const rangeStart = range.start;
  const rangeEnd = range.end;
  components.forEach((component) => {
    if (component.hasProperty("recurrence-id")) return;
    const event = new ICALmodule.Event(component);
    const addOccurrence = (start, end, item) => {
      if (!start || !end) return;
      const allDay = start.isDate;
      const startsAt = timeISO(start, allDay);
      const endsAt = timeISO(end, allDay);
      const startMs = allDay ? localDateTimeToEpoch(startsAt.slice(0, 10)) : new Date(startsAt).getTime();
      const endMs = allDay ? localDateTimeToEpoch(endsAt.slice(0, 10)) : new Date(endsAt).getTime();
      if (startMs >= rangeEnd || endMs <= rangeStart) return;
      const status = item.component.getFirstPropertyValue("status");
      if (String(status || "").toUpperCase() === "CANCELLED") return;
      events.push({
        id: `${event.uid || "event"}:${startsAt}`,
        title: item.summary || event.summary || "Untitled event",
        start: startsAt,
        end: endsAt,
        allDay,
        people: [person],
        loc: item.location || ""
      });
    };
    if (!event.isRecurring()) {
      addOccurrence(event.startDate, event.endDate, event);
      return;
    }
    const iterator = event.iterator();
    let occurrence;
    let count = 0;
    while ((occurrence = iterator.next()) && count++ < 1e4) {
      const occurrenceEpoch = occurrence.toJSDate().getTime();
      if (occurrenceEpoch >= rangeEnd) break;
      const details = event.getOccurrenceDetails(occurrence);
      addOccurrence(details.startDate, details.endDate, details.item || event);
    }
  });
  return events;
}
function mergeEvents(events) {
  const merged = new Map();
  events.forEach((event) => {
    const key = [event.title, event.start, event.end].join("\0");
    const existing = merged.get(key);
    if (existing) {
      if (!existing.people.includes(event.people[0])) existing.people.push(event.people[0]);
      return;
    }
    merged.set(key, { ...event, people: event.people.slice() });
  });
  return Array.from(merged.values()).sort((a, b) => a.start.localeCompare(b.start));
}
async function calendar(request, env) {
  const range = validDateRange(new URL(request.url));
  if (!range) return json({ error: "Invalid date range" }, 400);
  let calendars;
  try {
    calendars = JSON.parse(env.CALENDARS || "[]");
  } catch (_) {
    return json({ error: "Invalid calendar configuration" }, 500);
  }
  if (!Array.isArray(calendars)) return json({ error: "Invalid calendar configuration" }, 500);
  const events = [];
  await Promise.all(calendars.map(async (entry) => {
    if (!entry || typeof entry.person !== "string" || typeof entry.url !== "string") return;
    try {
      const url = new URL(entry.url.replace(/^webcal:/i, "https:"));
      if (url.protocol !== "https:") return;
      const ics = await cachedText(url.toString(), 600);
      events.push(...expandCalendar(ics, entry.person, range));
    } catch (_) {
      return;
    }
  }));
  return json(mergeEvents(events));
}
function torontoDateKey(timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(timestamp)).reduce((values, part) => {
    values[part.type] = part.value;
    return values;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
var VIDEO_METADATA_FIELD = "76647426";
function sharedPageData(html) {
  const script = html.match(/<script\b(?=[^>]*\bclass=["']ds:1["'])[^>]*>([\s\S]*?)<\/script>/i);
  if (!script) return null;
  const marker = /\bdata\s*:\s*/.exec(script[1]);
  if (!marker) return null;
  const source = script[1], start = marker.index + marker[0].length;
  let depth = 0, quote = "", escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") {
      if (--depth === 0) {
        try {
          const data = JSON.parse(source.slice(start, i + 1));
          return Array.isArray(data) ? data : null;
        } catch (_) {
          return null;
        }
      }
    }
  }
  return null;
}
function sharedMediaRecords(html) {
  const data = sharedPageData(html);
  return data && Array.isArray(data[1]) ? data[1] : [];
}
function parseSharedAlbumPage(html, finalUrl) {
  const data = sharedPageData(html);
  let url, pathMatch;
  try {
    url = new URL(finalUrl);
    pathMatch = /\/share\/([^/]+)/.exec(url.pathname);
  } catch (_) {
    return null;
  }
  const sid = /"FdrFJe"\s*:\s*"([^"]+)"/.exec(html);
  const bl = /"cfb2h"\s*:\s*"([^"]+)"/.exec(html);
  const aid = pathMatch && decodeURIComponent(pathMatch[1]);
  if (!data || !Array.isArray(data[1]) || !(typeof data[2] === "string" || data[2] === null) || !Array.isArray(data[3]) || data[3][0] !== aid || !url.searchParams.get("key") || !sid || !bl) return null;
  return {
    records: data[1],
    token: typeof data[2] === "string" && data[2] ? data[2] : null,
    aid,
    akey: url.searchParams.get("key"),
    sid: sid[1],
    bl: bl[1]
  };
}
function parseBatchExecutePage(body) {
  const line = String(body).split(/\r?\n/).find((part) => part.startsWith('[["wrb.fr"'));
  if (!line) return null;
  try {
    const response = JSON.parse(line);
    const data = response[0] && JSON.parse(response[0][2]);
    if (!data || !Array.isArray(data[1]) || !(typeof data[2] === "string" || data[2] === null)) return null;
    return { records: data[1], token: typeof data[2] === "string" && data[2] ? data[2] : null };
  } catch (_) {
    return null;
  }
}
function sharedAlbumPhotos(records, album) {
  const photos2 = [];
  const seen = new Set();
  (Array.isArray(records) ? records : []).forEach((item) => {
    const videoMetadata = item && item[9] && item[9][VIDEO_METADATA_FIELD];
    if (videoMetadata) return;
    const media = item && item[1];
    const base = media && media[0];
    if (typeof base !== "string" || !/^https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+$/.test(base) || seen.has(base)) return;
    seen.add(base);
    const width = media[1], height = media[2];
    const orientation = Number.isFinite(width) && Number.isFinite(height) && height > width ? "p" : "l";
    const photo = { src: `${base}=w1280-h800`, o: orientation, from: "family", tag: album };
    if (typeof item[0] === "string" && /^AF1Qip[A-Za-z0-9_-]+$/.test(item[0])) photo.mk = item[0];
    if (typeof item[2] === "number" && Number.isFinite(item[2])) photo.date = torontoDateKey(item[2]);
    photos2.push(photo);
  });
  return photos2;
}
var ALBUM_SCAN_MAX_AGE = 12 * 60 * 60 * 1e3;
var ALBUM_PAGE_HEADERS = {
  accept: "text/html,application/xhtml+xml",
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36"
};
async function fetchFirstAlbumPage(shareUrl, fetcher) {
  const response = await fetcher(shareUrl, { redirect: "follow", headers: ALBUM_PAGE_HEADERS });
  if (!response.ok) throw new Error("Album request failed");
  const page = parseSharedAlbumPage(await response.text(), response.url);
  if (!page) throw new Error("Unexpected album page");
  return page;
}
async function fetchNextAlbumPage(scan, fetcher) {
  const url = new URL("https://photos.google.com/_/PhotosUi/data/batchexecute");
  url.searchParams.set("rpcids", "snAcKc");
  url.searchParams.set("source-path", `/share/${scan.aid}`);
  url.searchParams.set("f.sid", scan.sid);
  url.searchParams.set("bl", scan.bl);
  url.searchParams.set("hl", "en");
  url.searchParams.set("rt", "c");
  const rpcArgs = JSON.stringify([scan.aid, scan.token, null, scan.akey]);
  const form = new URLSearchParams({ "f.req": JSON.stringify([[["snAcKc", rpcArgs, null, "generic"]]]) });
  const response = await fetcher(url.toString(), {
    method: "POST",
    headers: {
      ...ALBUM_PAGE_HEADERS,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body: form.toString()
  });
  if (!response.ok) throw new Error("Album page request failed");
  const page = parseBatchExecutePage(await response.text());
  if (!page) throw new Error("Unexpected album page");
  return page;
}
function albumPhotoInsertStatements(db, album, gen, photos2) {
  return photos2.map((photo) => db.prepare(
    "INSERT OR IGNORE INTO album_photo (album, gen, id, src, date, o, mk) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(album, gen, photo.src.slice(0, -"=w1280-h800".length), photo.src, photo.date || null, photo.o === "p" ? "p" : "l", photo.mk || null));
}
async function abandonAlbumScan(db, album, gen) {
  await db.batch([
    db.prepare("UPDATE album_scan SET scan_gen = NULL, token = NULL, sid = NULL, bl = NULL, aid = NULL, akey = NULL, started = NULL WHERE album = ?").bind(album),
    db.prepare("DELETE FROM album_photo WHERE album = ? AND gen = ?").bind(album, gen)
  ]);
}
async function finishAlbumScan(db, album, scan, now) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM album_photo WHERE album = ? AND gen = ?").bind(album, scan.scan_gen).first();
  const known = await db.prepare("SELECT COUNT(*) AS count FROM photo_seen WHERE album = ?").bind(album).first().catch(() => null);
  const seenStatements = known ? [
    db.prepare("INSERT OR IGNORE INTO photo_seen (album, id, added) SELECT album, id, ? FROM album_photo WHERE album = ? AND gen = ?").bind(known.count ? now : 0, album, scan.scan_gen),
    db.prepare("DELETE FROM photo_seen WHERE album = ? AND id NOT IN (SELECT id FROM album_photo WHERE album = ? AND gen = ?)").bind(album, album, scan.scan_gen)
  ] : [];
  await db.batch([
    db.prepare("UPDATE album_scan SET live_gen = ?, scan_gen = NULL, token = NULL, sid = NULL, bl = NULL, aid = NULL, akey = NULL, started = NULL, finished = ?, count = ? WHERE album = ?").bind(scan.scan_gen, now, row ? row.count : 0, album),
    db.prepare("DELETE FROM album_photo WHERE album = ? AND gen != ?").bind(album, scan.scan_gen),
    ...seenStatements
  ]);
}
async function scanAlbum(db, album, shareUrl, fetcher = fetch, now = Date.now()) {
  if (!db || !shareUrl) return;
  let scan;
  try {
    scan = await db.prepare("SELECT * FROM album_scan WHERE album = ?").bind(album).first();
  } catch (_) {
    return;
  }
  if (scan && scan.scan_gen != null) {
    if (scan.token == null) {
      try {
        await finishAlbumScan(db, album, scan, now);
      } catch (_) {
        try {
          await abandonAlbumScan(db, album, scan.scan_gen);
        } catch (_2) {
        }
      }
      return;
    }
    try {
      if (typeof scan.token !== "string" || !scan.sid || !scan.bl || !scan.aid || !scan.akey) throw new Error("Invalid scan state");
      const page = await fetchNextAlbumPage(scan, fetcher);
      const photos2 = sharedAlbumPhotos(page.records, album);
      await db.batch([
        ...albumPhotoInsertStatements(db, album, scan.scan_gen, photos2),
        db.prepare("UPDATE album_scan SET token = ?, count = (SELECT COUNT(*) FROM album_photo WHERE album = ? AND gen = ?) WHERE album = ?").bind(page.token, album, scan.scan_gen, album)
      ]);
    } catch (_) {
      try {
        await abandonAlbumScan(db, album, scan.scan_gen);
      } catch (_2) {
      }
    }
    return;
  }
  if (scan && scan.live_gen != null && Number.isFinite(scan.finished) && now - scan.finished <= ALBUM_SCAN_MAX_AGE) return;
  try {
    const page = await fetchFirstAlbumPage(shareUrl, fetcher);
    const gen = (Number(scan && scan.live_gen) || 0) + 1;
    await db.batch([
      db.prepare("INSERT INTO album_scan (album, live_gen, scan_gen, token, sid, bl, aid, akey, started, finished, count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?) ON CONFLICT(album) DO UPDATE SET scan_gen = excluded.scan_gen, token = excluded.token, sid = excluded.sid, bl = excluded.bl, aid = excluded.aid, akey = excluded.akey, started = excluded.started, finished = NULL, count = excluded.count").bind(album, scan ? scan.live_gen : null, gen, page.token, page.sid, page.bl, page.aid, page.akey, now, 0),
      ...albumPhotoInsertStatements(db, album, gen, sharedAlbumPhotos(page.records, album)),
      db.prepare("UPDATE album_scan SET count = (SELECT COUNT(*) FROM album_photo WHERE album = ? AND gen = ?) WHERE album = ?").bind(album, gen, album)
    ]);
  } catch (_) {
  }
}
var PHOTO_BATCH_SIZE = 300;
var PHOTO_BATCH_NEW_MAX = 100;
var PHOTO_NEW_ADDED_MS = 30 * 24 * 60 * 60 * 1e3;
var PHOTO_NEW_TAKEN_MS = 90 * 24 * 60 * 60 * 1e3;
var PHOTO_RECENTLY_SHOWN_MS = 24 * 60 * 60 * 1e3;
function albumPhotoRow(row, album) {
  const photo = { src: row.src, o: row.o === "p" ? "p" : "l", from: "family", tag: album };
  if (row.date) photo.date = row.date;
  return photo;
}
var NOT_HIDDEN = "NOT EXISTS (SELECT 1 FROM photo_hidden h WHERE h.album = p.album AND h.id = p.id)";
async function randomAlbumRows(db, album, gen) {
  const sql = "SELECT p.src, p.date, p.o FROM album_photo p WHERE p.album = ? AND p.gen = ? ";
  const result = await db.prepare(sql + "AND " + NOT_HIDDEN + " ORDER BY RANDOM() LIMIT ?").bind(album, gen, PHOTO_BATCH_SIZE).all()
    .catch(() => db.prepare(sql + "ORDER BY RANDOM() LIMIT ?").bind(album, gen, PHOTO_BATCH_SIZE).all());
  return result.results || [];
}
// Every batch: up to PHOTO_BATCH_NEW_MAX new photos (recently added to the album or recently taken),
// filled up with random older photos, preferring ones not shown in the last day.
async function mixedAlbumRows(db, album, gen, now) {
  const isNew = "(COALESCE(s.added, 0) >= ? OR p.date >= ?)";
  const base = "SELECT p.id, p.src, p.date, p.o FROM album_photo p LEFT JOIN photo_seen s ON s.album = p.album AND s.id = p.id WHERE p.album = ? AND p.gen = ? AND " + NOT_HIDDEN + " AND ";
  const addedSince = now - PHOTO_NEW_ADDED_MS;
  const takenSince = torontoDateKey(now - PHOTO_NEW_TAKEN_MS);
  const [fresh, older] = await db.batch([
    db.prepare(base + isNew + " ORDER BY RANDOM() LIMIT ?").bind(album, gen, addedSince, takenSince, PHOTO_BATCH_NEW_MAX),
    db.prepare(base + "NOT " + isNew + " ORDER BY COALESCE(s.served, 0) >= ?, RANDOM() LIMIT ?").bind(album, gen, addedSince, takenSince, now - PHOTO_RECENTLY_SHOWN_MS, PHOTO_BATCH_SIZE)
  ]);
  const newRows = fresh.results || [];
  const rows = newRows.concat((older.results || []).slice(0, PHOTO_BATCH_SIZE - newRows.length));
  if (rows.length) {
    await db.prepare("UPDATE photo_seen SET served = ? WHERE album = ? AND id IN (SELECT value FROM json_each(?))").bind(now, album, JSON.stringify(rows.map((row) => row.id))).run().catch(() => {});
  }
  return { rows, fresh: newRows.length };
}
async function indexedAlbumPhotos(db, album, now = Date.now()) {
  if (!db) return null;
  const scan = await db.prepare("SELECT live_gen, count FROM album_scan WHERE album = ?").bind(album).first();
  if (!scan || scan.live_gen == null) return null;
  let rows, fresh;
  if (album === "main") {
    try {
      ({ rows, fresh } = await mixedAlbumRows(db, album, scan.live_gen, now));
    } catch (_) {
    }
  }
  if (!rows) rows = await randomAlbumRows(db, album, scan.live_gen);
  const photos2 = rows.map((row) => albumPhotoRow(row, album));
  const body = { photos: photos2, total: Number.isFinite(scan.count) ? scan.count : photos2.length };
  if (fresh != null) body.fresh = fresh;
  return body;
}
async function photos(request, env) {
  const url = new URL(request.url);
  const album = url.searchParams.get("album");
  if (album !== "main" && album !== "shabbat") return json({ error: "Unknown album" }, 400);
  try {
    const indexed = await indexedAlbumPhotos(env.DB, album);
    if (indexed) return json(indexed);
  } catch (_) {
  }
  const shareUrl = albumShareUrl(env, album);
  if (shareUrl) {
    try {
      const html = await cachedText(new URL(shareUrl).toString(), 3600);
      const records = sharedMediaRecords(html);
      const hidden = await hiddenPhotoIds(env.DB, album);
      const photos2 = sharedAlbumPhotos(records, album).filter((photo) => !hidden.has(photoId(photo.src)));
      if (photos2.length) {
        return json({ photos: photos2, total: photos2.length });
      }
    } catch (_) {
      return localPhotoManifest(request, env);
    }
  }
  return localPhotoManifest(request, env);
}
var PHOTO_SRC_RE = /^(https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+)(=[A-Za-z0-9-]*)?$/;
function photoId(src) {
  const match = PHOTO_SRC_RE.exec(String(src || ""));
  return match ? match[1] : null;
}
async function hiddenPhotoIds(db, album) {
  if (!db) return new Set();
  const result = await db.prepare("SELECT id FROM photo_hidden WHERE album = ?").bind(album).all().catch(() => null);
  return new Set(((result && result.results) || []).map((row) => row.id));
}
var shareLinkCache = new Map();
async function albumShareLink(shareUrl) {
  if (!shareUrl) return null;
  if (shareLinkCache.has(shareUrl)) return shareLinkCache.get(shareUrl);
  let link = null;
  try {
    let url = new URL(shareUrl);
    if (url.hostname !== "photos.google.com") {
      const response = await fetch(url.toString(), { redirect: "manual" });
      const location = response.headers.get("location");
      if (location) url = new URL(location, url);
    }
    const match = /\/share\/([^/]+)/.exec(url.pathname);
    if (url.hostname === "photos.google.com" && match && url.searchParams.get("key")) {
      link = { aid: match[1], key: url.searchParams.get("key") };
    }
  } catch (_) {
  }
  shareLinkCache.set(shareUrl, link);
  return link;
}
function googlePhotoLink(share, shareUrl, mk) {
  if (share && mk) return `https://photos.google.com/share/${share.aid}/photo/${mk}?key=${encodeURIComponent(share.key)}`;
  if (share) return `https://photos.google.com/share/${share.aid}?key=${encodeURIComponent(share.key)}`;
  return shareUrl || null;
}
function albumShareUrl(env, album) {
  return album === "main" ? env.PHOTOS_ALBUM_URL : env.SHABBAT_ALBUM_URL || env.PHOTOS_ALBUM_URL;
}
async function hiddenPhotos(request, env) {
  const result = await env.DB.prepare("SELECT album, id, src, date, mk, hidden FROM photo_hidden ORDER BY hidden DESC LIMIT 500").all();
  const shares = {};
  const list = [];
  for (const row of result.results || []) {
    const shareUrl = albumShareUrl(env, row.album);
    if (!(row.album in shares)) shares[row.album] = await albumShareLink(shareUrl);
    list.push({ album: row.album, id: row.id, src: row.src, date: row.date, hidden: row.hidden, link: googlePhotoLink(shares[row.album], shareUrl, row.mk) });
  }
  return json({ photos: list });
}
async function hidePhoto(request, env, hide, editingLocked = async () => isKodeshWindowActive((await zmanimData()).windows)) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: "Invalid JSON" }, 400);
  }
  const album = body && body.album;
  const id = photoId(body && body.src);
  if ((album !== "main" && album !== "shabbat") || !id) return json({ error: "Expected { album, src }" }, 400);
  if (await editingLocked()) return json({ error: "Editing is disabled during Shabbat/Yom Tov" }, 423);
  if (!hide) {
    await env.DB.prepare("DELETE FROM photo_hidden WHERE album = ? AND id = ?").bind(album, id).run();
    return json({ ok: true });
  }
  const row = await env.DB.prepare(
    "SELECT p.src, p.date, p.mk FROM album_photo p JOIN album_scan s ON s.album = p.album AND s.live_gen = p.gen WHERE p.album = ? AND p.id = ?"
  ).bind(album, id).first().catch(() => null);
  await env.DB.prepare(
    "INSERT INTO photo_hidden (album, id, src, date, mk, hidden) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(album, id) DO UPDATE SET hidden = excluded.hidden"
  ).bind(album, id, row ? row.src : `${id}=w1280-h800`, row ? row.date : null, row ? row.mk : null, Date.now()).run();
  return json({ ok: true });
}
async function localPhotoManifest(request, env) {
  try {
    const manifest = await env.ASSETS.fetch(new Request(new URL("/photos/manifest.json", request.url)));
    if (!manifest.ok) return json({ photos: [], total: 0 });
    const photos2 = await manifest.json();
    const list = Array.isArray(photos2) ? photos2 : [];
    return json({ photos: list, total: list.length });
  } catch (_) {
    return json({ photos: [], total: 0 });
  }
}
function constantTimeEqual(left, right) {
  const a = enc.encode(String(left));
  const b = enc.encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) difference |= (a[i] || 0) ^ (b[i] || 0);
  return difference === 0;
}
function sessionSecretBytes(secret) {
  if (typeof secret !== "string" || !/^[a-f\d]{64}$/i.test(secret)) return null;
  return Uint8Array.from(secret.match(/.{2}/g), (byte) => parseInt(byte, 16));
}
async function sessionSignature(secret, expires) {
  const bytes = sessionSecretBytes(secret);
  if (!bytes) return null;
  const key = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(String(expires)));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function cookieValue(request, name) {
  const pair = (request.headers.get("cookie") || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : "";
}
async function hasSession(request, env) {
  const value = cookieValue(request, "fd_s");
  const match = /^(\d+)\.([a-f\d]{64})$/i.exec(value);
  if (!match || !sessionSecretBytes(env.SESSION_SECRET)) return false;
  const expires = Number(match[1]);
  const now = Math.floor(Date.now() / 1e3);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + SESSION_SECONDS + 60) return false;
  const expected = await sessionSignature(env.SESSION_SECRET, expires);
  return !!expected && constantTimeEqual(expected, match[2]);
}
async function login(request, env) {
  if (!env.FAMILY_PIN || !sessionSecretBytes(env.SESSION_SECRET)) return json({ error: "Login is not configured" }, 503);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const cutoff = now - LOGIN_WINDOW_MS;
  await env.DB.prepare("DELETE FROM login_fail WHERE ts <= ?").bind(cutoff).run();
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM login_fail WHERE ip = ? AND ts > ?").bind(ip, cutoff).first();
  if (Number(row?.count || 0) >= LOGIN_MAX_FAILURES) return json({ error: "Too many attempts" }, 429);
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body || typeof body.pin !== "string") return json({ error: "Invalid PIN" }, 400);
  if (!constantTimeEqual(body.pin, env.FAMILY_PIN)) {
    await env.DB.prepare("INSERT INTO login_fail (ip, ts) VALUES (?, ?)").bind(ip, now).run();
    const failures = Number(row?.count || 0) + 1;
    return json({ error: failures >= LOGIN_MAX_FAILURES ? "Too many attempts" : "Incorrect PIN" }, failures >= LOGIN_MAX_FAILURES ? 429 : 401);
  }
  await env.DB.prepare("DELETE FROM login_fail WHERE ip = ?").bind(ip).run();
  const expires = Math.floor(now / 1e3) + SESSION_SECONDS;
  const signature = await sessionSignature(env.SESSION_SECRET, expires);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": `fd_s=${expires}.${signature}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`
    }
  });
}
function isKodeshWindowActive(windows, now = Date.now()) {
  return (windows || []).some((window) => new Date(window.start).getTime() <= now && new Date(window.end).getTime() > now);
}
async function stateVersions(env) {
  const result = await env.DB.prepare("SELECT key, updated FROM state").all();
  const keys = {};
  (result.results || []).forEach((row) => {
    keys[row.key] = row.updated;
  });
  return json(keys);
}
async function state(request, env, key) {
  if (!STATE_KEYS.has(key)) return json({ error: "Unknown state key" }, 404);
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT json, updated FROM state WHERE key = ?").bind(key).first();
    return row ? json({ json: JSON.parse(row.json), updated: row.updated }) : json({ json: null, updated: 0 });
  }
  if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  if (isKodeshWindowActive((await zmanimData()).windows)) {
    return json({ error: "Editing is disabled during Shabbat/Yom Tov" }, 423);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 204800) return json({ error: "State value exceeds 200 KB" }, 413);
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 204800) return json({ error: "State value exceeds 200 KB" }, 413);
  let payload;
  try {
    payload = JSON.parse(body);
  } catch (_) {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, "json") || !Number.isSafeInteger(payload.base) || payload.base < 0) {
    return json({ error: "Expected { json, base }" }, 400);
  }
  const current = await env.DB.prepare("SELECT json, updated FROM state WHERE key = ?").bind(key).first();
  const currentUpdated = Number(current?.updated || 0);
  if (Number(payload.base) !== currentUpdated) {
    return json({ json: current ? JSON.parse(current.json) : null, updated: currentUpdated }, 409);
  }
  const updated = Math.max(Date.now(), currentUpdated + 1);
  await env.DB.prepare(
    "INSERT INTO state (key, json, updated) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated = excluded.updated"
  ).bind(key, JSON.stringify(payload.json), updated).run();
  return json({ json: payload.json, updated });
}
var index_default = {
  async scheduled(event, env) {
    await Promise.all([
      scanAlbum(env.DB, "main", env.PHOTOS_ALBUM_URL),
      scanAlbum(env.DB, "shabbat", env.SHABBAT_ALBUM_URL)
    ]);
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" && env.ASSETS) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    }
    if ((url.pathname === "/m" || url.pathname === "/m/") && env.ASSETS) {
      return env.ASSETS.fetch(new Request(new URL("/m.html", request.url), request));
    }
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/login" && request.method === "POST") {
        try {
          return await login(request, env);
        } catch (_) {
          return json({ error: "Login unavailable" }, 502);
        }
      }
      if (!await hasSession(request, env)) return json({ error: "Authentication required" }, 401);
      if (url.pathname === "/api/logout" && request.method === "POST") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "set-cookie": "fd_s=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
          }
        });
      }
    }
    if (url.pathname === "/api/weather" && request.method === "GET") {
      try {
        return await weather(request);
      } catch (_) {
        return json({ error: "Weather unavailable" }, 502);
      }
    }
    if (url.pathname === "/api/zmanim" && request.method === "GET") {
      try {
        return await zmanim();
      } catch (_) {
        return json({ error: "Zmanim unavailable" }, 502);
      }
    }
    if (url.pathname === "/api/calendar" && request.method === "GET") {
      try {
        return await calendar(request, env);
      } catch (_) {
        return json({ error: "Calendar unavailable" }, 502);
      }
    }
    if (url.pathname === "/api/photos" && request.method === "GET") return photos(request, env);
    if (url.pathname === "/api/photos/hidden" && request.method === "GET") return hiddenPhotos(request, env);
    if ((url.pathname === "/api/photos/hide" || url.pathname === "/api/photos/unhide") && request.method === "POST") {
      try {
        return await hidePhoto(request, env, url.pathname === "/api/photos/hide");
      } catch (_) {
        return json({ error: "Could not update hidden photos" }, 502);
      }
    }
    if (url.pathname === "/api/state/version" && request.method === "GET") {
      try {
        return await stateVersions(env);
      } catch (_) {
        return json({ error: "State unavailable" }, 502);
      }
    }
    const stateMatch = /^\/api\/state\/([^/]+)$/.exec(url.pathname);
    if (stateMatch) {
      let key;
      try {
        key = decodeURIComponent(stateMatch[1]);
      } catch (_) {
        return json({ error: "Invalid state key" }, 400);
      }
      try {
        return await state(request, env, key);
      } catch (_) {
        return json({ error: "State unavailable" }, 502);
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: "Not found" }, 404);
  }
};
export {
  buildKodeshWindows,
  constantTimeEqual,
  index_default as default,
  expandCalendar,
  hidePhoto,
  indexedAlbumPhotos,
  isKodeshWindowActive,
  mergeEvents,
  parseBatchExecutePage,
  parseSharedAlbumPage,
  scanAlbum,
  sharedAlbumPhotos,
  upcomingWindow,
  zmanimData
};
