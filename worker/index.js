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
var STATE_KEYS = new Set(["tasks", "chores", "groceries", "photos-favs", "stores", "products", "people", "remote", "heartbeat", "shofar", "music", "music_now_small", "music_now_large"]);
var SESSION_SECONDS = 365 * 24 * 60 * 60;
var LOGIN_WINDOW_MS = 15 * 60 * 1e3;
var LOGIN_MAX_FAILURES = 5;
var enc = new TextEncoder();
function ns(hid, name) {
  return hid === 1 ? name : `h${hid}:${name}`;
}
function householdSettings(value = {}, env = {}, hid = 1) {
  return {
    location: { geonameid: 6167865, name: "Toronto", lat: 43.70643, lon: -79.39864, tz: TORONTO, israel: false, ...value.location },
    photos: {
      main: value.photos?.main || (hid === 1 ? env.PHOTOS_ALBUM_URL || "" : ""),
      shabbat: value.photos?.shabbat || (hid === 1 ? env.SHABBAT_ALBUM_URL || "" : ""),
      mode: value.photos?.mode ?? "mixed",
      recentPercent: value.photos?.recentPercent ?? 100 / 3
    },
    calendars: value.calendars?.length ? value.calendars : hid === 1 ? JSON.parse(env.CALENDARS || "[]") : [],
    zmanim: { candles: 18, havdalah: [60, 72], shabbosEnds: 72, shema: "both", dafYomi: true, ...value.zmanim },
    minyanimUrl: value.minyanimUrl ?? (hid === 1 ? "https://torontominyanim.com/" : "")
  };
}
function validSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const https = (s) => {
    if (typeof s !== "string") return false;
    if (!s) return true;
    try { return new URL(s).protocol === "https:"; } catch (_) { return false; }
  };
  const loc = value.location;
  const z = value.zmanim;
  const opinion = (v) => [42, 50, 60, 72, "8.5deg"].includes(v);
  if (!loc || !Number.isSafeInteger(loc.geonameid) || loc.geonameid <= 0 || typeof loc.name !== "string" || !loc.name.trim() ||
      !Number.isFinite(loc.lat) || Math.abs(loc.lat) > 90 || !Number.isFinite(loc.lon) || Math.abs(loc.lon) > 180 ||
      typeof loc.israel !== "boolean" || typeof loc.tz !== "string") return false;
  try { new Intl.DateTimeFormat("en", { timeZone: loc.tz }); } catch (_) { return false; }
  return !!value.photos && https(value.photos.main) && https(value.photos.shabbat) &&
    (value.photos.mode === undefined || ["mixed", "recent", "random", "onthisday"].includes(value.photos.mode)) &&
    (value.photos.recentPercent === undefined || Number.isFinite(value.photos.recentPercent) && value.photos.recentPercent >= 0 && value.photos.recentPercent <= 100) && https(value.minyanimUrl) &&
    Array.isArray(value.calendars) && value.calendars.every((c) => c && typeof c.person === "string" && !!c.url && https(c.url)) &&
    !!z && Number.isInteger(z.candles) && z.candles >= 0 && z.candles <= 120 &&
    Array.isArray(z.havdalah) && z.havdalah.length > 0 && z.havdalah.length <= 5 && z.havdalah.every(opinion) &&
    new Set(z.havdalah).size === z.havdalah.length && opinion(z.shabbosEnds) &&
    ["both", "mga", "gra"].includes(z.shema) && typeof z.dafYomi === "boolean";
}
async function loadHousehold(env, id) {
  const row = await env.DB.prepare("SELECT id, name, settings FROM household WHERE id = ?").bind(id).first();
  return row ? { ...row, legacyPhotoMode: JSON.parse(row.settings).photos?.mode === undefined, settings: householdSettings(JSON.parse(row.settings), env, id) } : null;
}
async function householdRoute(request, env, url) {
  const h = env.household;
  if (url.pathname === "/api/household" && request.method === "GET") return json({ id: h.id, name: h.name, admin: h.id === 1, tz: h.settings.location.tz, city: h.settings.location.name, minyanimUrl: h.settings.minyanimUrl });
  if (url.pathname === "/api/settings") {
    if (request.method === "GET") return json(h.settings);
    if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
    const value = await request.json().catch(() => null);
    if (!validSettings(value)) return json({ error: "Invalid settings" }, 400);
    const key = ns(h.id, "remote");
    const now = Date.now();
    const row = await env.DB.prepare("SELECT json, updated FROM state WHERE key = ?").bind(key).first();
    const remote = { seq: (Number(row ? JSON.parse(row.json)?.seq : 0) || 0) + 1, cmd: "reload", arg: "", at: now };
    await env.DB.batch([
      env.DB.prepare("UPDATE household SET settings = ? WHERE id = ?").bind(JSON.stringify(value), h.id),
      env.DB.prepare("INSERT INTO state (key, json, updated) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated = excluded.updated").bind(key, JSON.stringify(remote), Math.max(now, (row?.updated || 0) + 1))
    ]);
    return json(value);
  }
  if (url.pathname === "/api/geo/search" && request.method === "GET") {
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
    if (!q) return json([]);
    const cities = await cachedJson(`https://www.hebcal.com/complete.php?q=${encodeURIComponent(q)}`, 86400);
    return json(await Promise.all(cities.filter((c) => c.geo === "geoname").slice(0, 8).map(async (c) => {
      const data = await cachedJson(`https://www.hebcal.com/zmanim?cfg=json&geonameid=${c.id}`, 86400);
      const l = data.location;
      return { geonameid: Number(c.id), name: c.value, lat: l.latitude, lon: l.longitude, tz: l.tzid, israel: l.cc === "IL" };
    })));
  }
  return null;
}
async function adminRoute(request, env, url) {
  if (!env.ADMIN_PASSWORD || !sessionSecretBytes(env.SESSION_SECRET)) return json({ error: "Admin not configured" }, 503);
  if (url.pathname === "/api/admin/login" && request.method === "POST") return login(request, env, true);
  if (!await adminSession(request, env)) return json({ error: "Authentication required" }, 401);
  if (url.pathname === "/api/admin/logout" && request.method === "POST") {
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "cache-control": "no-store",
      "set-cookie": "fd_a=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" } });
  }
  const match = /^\/api\/admin\/households(?:\/(\d+)(\/pin)?)?$/.exec(url.pathname);
  if (!match) return json({ error: "Not found" }, 404);
  const id = Number(match[1]);
  if (!id && request.method === "GET") return json((await env.DB.prepare("SELECT h.id, h.name, h.created, s.updated AS heartbeat FROM household h LEFT JOIN state s ON s.key = CASE WHEN h.id = 1 THEN 'heartbeat' ELSE 'h' || h.id || ':heartbeat' END ORDER BY h.id").all()).results);
  const body = ["POST", "PATCH"].includes(request.method) ? await request.json().catch(() => null) : null;
  if ((!id && request.method === "POST") || (id && !match[2] && request.method === "PATCH")) {
    if (typeof body?.name !== "string" || !body.name.trim() || body.name.length > 100) return json({ error: "Name required" }, 400);
  }
  if (id && !await env.DB.prepare("SELECT id FROM household WHERE id = ?").bind(id).first()) return json({ error: "Not found" }, 404);
  if (request.method === "POST" && (!id || match[2])) {
    if (id === 1) return json({ error: "Household 1 uses FAMILY_PIN" }, 400);
    let pin, hash;
    do {
      hash = null;
      const n = crypto.getRandomValues(new Uint32Array(1))[0];
      if (n >= 4230000000) continue;
      pin = String(10000000 + n % 90000000);
      hash = await sessionSignature(env.SESSION_SECRET, "pin:" + pin);
    } while (!hash || pin === env.FAMILY_PIN || await env.DB.prepare("SELECT id FROM household WHERE pin_hash = ?").bind(hash).first());
    if (id) await env.DB.prepare("UPDATE household SET pin_hash = ? WHERE id = ?").bind(hash, id).run();
    else {
      const row = await env.DB.prepare("INSERT INTO household (name, pin_hash, created) VALUES (?, ?, ?) RETURNING id").bind(body.name.trim(), hash, Date.now()).first();
      return json({ id: row.id, pin }, 201);
    }
    return json({ id, pin });
  }
  if (id && !match[2] && request.method === "PATCH") {
    await env.DB.prepare("UPDATE household SET name = ? WHERE id = ?").bind(body.name.trim(), id).run();
    return json({ ok: true });
  }
  if (id && !match[2] && request.method === "DELETE") {
    if (id === 1) return json({ error: "Cannot delete household 1" }, 400);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM state WHERE key LIKE ?").bind(`h${id}:%`),
      ...["album_photo", "album_scan", "photo_seen", "photo_hidden"].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE album LIKE ?`).bind(`h${id}:%`)),
      env.DB.prepare("DELETE FROM household_music_auth WHERE hid = ?").bind(id),
      env.DB.prepare("DELETE FROM household WHERE id = ?").bind(id)
    ]);
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
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
function localDateTimeToEpoch(value, endOfDay = false, tz = TORONTO) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(value).getTime();
  const [year, month, day] = match.slice(1).map(Number);
  const hour = endOfDay ? 0 : 0;
  let epoch = Date.UTC(year, month - 1, day, hour);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
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
function weatherUrl(settings = householdSettings()) {
  const params = new URLSearchParams({
    latitude: String(settings.location.lat),
    longitude: String(settings.location.lon),
    current: "temperature_2m,weather_code,is_day,relative_humidity_2m,apparent_temperature,wind_speed_10m",
    hourly: "temperature_2m,weather_code,precipitation_probability,is_day",
    daily: "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
    timezone: settings.location.tz,
    forecast_days: "7"
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}
async function weather(request, settings) {
  const value = await cachedJson(weatherUrl(settings), 900);
  const today = dateString(dateParts(new Date(), settings.location.tz));
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
    timeZone: settings.location.tz,
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
    const time = new Date(localDateTimeToEpoch(today, false, settings.location.tz) + (localHour + i) * 36e5);
    const parts = dateParts(time, settings.location.tz);
    const hourParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: settings.location.tz,
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
function buildKodeshWindows(items, endMinutes = 72) {
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
    const sunset = end.getTime() - endMinutes * 6e4;
    const havdalah60 = new Date(sunset + 60 * 6e4).toISOString();
    const havdalah72 = new Date(sunset + 72 * 6e4).toISOString();
    const title = holidays.length ? holidays.join(" \xB7 ") : ["Shabbat", parashat].filter(Boolean).join(" \xB7 ");
    windows.push({ start: open.start, end: time, havdalah60, havdalah72, title, yomtov: holidays.length > 0, yomKippur });
    open = null;
  });
  return windows;
}
function upcomingWindow(windows, now = Date.now()) {
  const next = windows.find((window) => new Date(window.end).getTime() > now);
  if (!next) return { candles: null, havdalah: null, havdalah60: null, havdalah72: null, havdalahTimes: [], title: "", yomtov: false, yomKippur: false };
  return {
    candles: next.start,
    havdalah: next.end,
    havdalah60: next.havdalah60,
    havdalah72: next.havdalah72,
    havdalahTimes: next.havdalahTimes || [],
    title: next.title,
    yomtov: next.yomtov,
    yomKippur: next.yomKippur
  };
}
function zmanimUrl(date, settings) {
  return `https://www.hebcal.com/zmanim?cfg=json&geonameid=${settings.location.geonameid}&date=${date}`;
}
function hebcalUrl(start, end, settings) {
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
    b: String(settings.zmanim.candles),
    geonameid: String(settings.location.geonameid),
    start,
    end
  });
  if (settings.location.israel) params.set("i", "on");
  params.set(settings.zmanim.shabbosEnds === "8.5deg" ? "M" : "m", settings.zmanim.shabbosEnds === "8.5deg" ? "on" : String(settings.zmanim.shabbosEnds));
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
function zmanimList(times, settings) {
  return ZMANIM.filter(([key]) => !(key === "sofZmanShmaMGA" && settings.zmanim.shema === "gra") && !(key === "sofZmanShma" && settings.zmanim.shema === "mga")).map(([key, label]) => {
    const value = key === "tzeit7083deg" ? times.tzeit7083deg || times.tzeit85deg : times[key];
    const time = asISO(value);
    return time ? { key, label, time } : null;
  }).filter(Boolean);
}
async function zmanimData(fetcher = fetch, settings = householdSettings()) {
  const today = dateString(dateParts(new Date(), settings.location.tz));
  const tomorrow = addDate(today, 1);
  const calendarStart = addDate(today, -3);
  const calendarEnd = addDate(today, 45);
  const getJson = (url) => cachedJson(url, 21600, fetcher);
  const [todayData, tomorrowData, holidays, dafYomi] = await Promise.all([
    getJson(zmanimUrl(today, settings)),
    getJson(zmanimUrl(tomorrow, settings)),
    getJson(hebcalUrl(calendarStart, calendarEnd, settings)),
    settings.zmanim.dafYomi ? getJson(dafYomiUrl(today, tomorrow)).catch(() => ({ items: [] })) : Promise.resolve({ items: [] })
  ]);
  const ends = settings.zmanim.shabbosEnds;
  const windows = buildKodeshWindows(holidays.items || [], typeof ends === "number" ? ends : 72);
  await Promise.all(windows.map(async (window) => {
    let sunset = new Date(window.havdalah72).getTime() - 72 * 6e4;
    let degrees;
    if (ends === "8.5deg" || settings.zmanim.havdalah.includes("8.5deg")) {
      const day = dateString(dateParts(new Date(window.end), settings.location.tz));
      const data = await getJson(zmanimUrl(day, settings));
      sunset = new Date(data.times.sunset).getTime();
      degrees = asISO(data.times.tzeit85deg);
      if (!Number.isFinite(sunset) || !degrees) throw new Error("Havdalah unavailable");
    }
    const at = (m) => m === "8.5deg" ? degrees : new Date(sunset + m * 6e4).toISOString();
    window.havdalah60 = at(60);
    window.havdalah72 = at(72);
    window.havdalahTimes = settings.zmanim.havdalah.map((m) => ({ label: m === "8.5deg" ? "8.5°" : `${m} min`, minutes: m === "8.5deg" ? null : m, time: at(m) }));
  }));
  const daf = {};
  (Array.isArray(dafYomi.items) ? dafYomi.items : []).forEach((item) => {
    if (item.category === "dafyomi" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && typeof item.title === "string") {
      daf[item.date] = item.title;
    }
  });
  return {
    today: zmanimList(todayData.times || {}, settings),
    tomorrow: zmanimList(tomorrowData.times || {}, settings),
    windows,
    upcoming: upcomingWindow(windows),
    daf
  };
}
async function zmanim(settings) {
  return json(await zmanimData(fetch, settings));
}
function validDateRange(url, settings) {
  const today = dateString(dateParts(new Date(), settings.location.tz));
  const from = url.searchParams.get("from") || addDate(today, -1);
  const to = url.searchParams.get("to") || addDate(today, 35);
  const start = localDateTimeToEpoch(from, false, settings.location.tz);
  const end = localDateTimeToEpoch(/^\d{4}-\d{2}-\d{2}$/.test(to) ? addDate(to, 1) : to, false, settings.location.tz);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null;
  return { start, end };
}
function timeISO(time, allDay) {
  if (allDay) {
    return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}T00:00:00`;
  }
  return time.toJSDate().toISOString();
}
function expandCalendar(ics, person, range, tz = TORONTO) {
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
      const startMs = allDay ? localDateTimeToEpoch(startsAt.slice(0, 10), false, tz) : new Date(startsAt).getTime();
      const endMs = allDay ? localDateTimeToEpoch(endsAt.slice(0, 10), false, tz) : new Date(endsAt).getTime();
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
  const range = validDateRange(new URL(request.url), env.household.settings);
  if (!range) return json({ error: "Invalid date range" }, 400);
  let calendars;
  try {
    calendars = env.household.settings.calendars;
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
      events.push(...expandCalendar(ics, entry.person, range, env.household.settings.location.tz));
    } catch (_) {
      return;
    }
  }));
  return json(mergeEvents(events));
}
function torontoDateKey(timestamp, tz = TORONTO) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
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
function sharedAlbumPhotos(records, album, tz = TORONTO) {
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
    const photo = { src: `${base}=w1280-h800`, o: orientation, from: "family", tag: album.replace(/^h\d+:/, "") };
    if (typeof item[0] === "string" && /^AF1Qip[A-Za-z0-9_-]+$/.test(item[0])) photo.mk = item[0];
    if (typeof item[2] === "number" && Number.isFinite(item[2])) photo.date = torontoDateKey(item[2], tz);
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
async function scanAlbum(db, album, shareUrl, fetcher = fetch, now = Date.now(), tz = TORONTO) {
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
      const photos2 = sharedAlbumPhotos(page.records, album, tz);
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
      ...albumPhotoInsertStatements(db, album, gen, sharedAlbumPhotos(page.records, album, tz)),
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
  const photo = { src: row.src, o: row.o === "p" ? "p" : "l", from: "family", tag: album.replace(/^h\d+:/, "") };
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
async function mixedAlbumRows(db, album, gen, now, tz, recentPercent = 100 / 3) {
  const isNew = "(COALESCE(s.added, 0) >= ? OR p.date >= ?)";
  const base = "SELECT p.id, p.src, p.date, p.o FROM album_photo p LEFT JOIN photo_seen s ON s.album = p.album AND s.id = p.id WHERE p.album = ? AND p.gen = ? AND " + NOT_HIDDEN + " AND ";
  const addedSince = now - PHOTO_NEW_ADDED_MS;
  const takenSince = torontoDateKey(now - PHOTO_NEW_TAKEN_MS, tz);
  const [fresh, older] = await db.batch([
    db.prepare(base + isNew + " ORDER BY RANDOM() LIMIT ?").bind(album, gen, addedSince, takenSince, Math.round(PHOTO_BATCH_SIZE * recentPercent / 100)),
    db.prepare(base + "NOT " + isNew + " ORDER BY COALESCE(s.served, 0) >= ?, RANDOM() LIMIT ?").bind(album, gen, addedSince, takenSince, now - PHOTO_RECENTLY_SHOWN_MS, PHOTO_BATCH_SIZE)
  ]);
  const newRows = fresh.results || [];
  const rows = newRows.concat((older.results || []).slice(0, PHOTO_BATCH_SIZE - newRows.length));
  if (rows.length) {
    await db.prepare("UPDATE photo_seen SET served = ? WHERE album = ? AND id IN (SELECT value FROM json_each(?))").bind(now, album, JSON.stringify(rows.map((row) => row.id))).run().catch(() => {});
  }
  return { rows, fresh: newRows.length };
}
async function selectedAlbumRows(db, album, gen, now, tz, mode, recentPercent) {
  const base = "SELECT p.id, p.src, p.date, p.o FROM album_photo p WHERE p.album = ? AND p.gen = ? AND " + NOT_HIDDEN;
  if (mode === "recent") {
    const added = await db.prepare(base + " AND p.id IN (SELECT id FROM photo_seen WHERE album = ? AND added >= ?) ORDER BY (SELECT added FROM photo_seen s WHERE s.album = p.album AND s.id = p.id) DESC, p.id LIMIT ?")
      .bind(album, gen, album, now - PHOTO_NEW_ADDED_MS, PHOTO_BATCH_NEW_MAX).all().catch(() => ({ results: [] }));
    const newest = await db.prepare(base + " ORDER BY p.date DESC, p.id LIMIT ?").bind(album, gen, PHOTO_BATCH_SIZE).all();
    const rows = added.results || [], seen = new Set(rows.map((r) => r.id));
    for (const row of newest.results || []) {
      if (rows.length >= PHOTO_BATCH_SIZE) break;
      if (!seen.has(row.id)) { rows.push(row); seen.add(row.id); }
    }
    rows.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.id.localeCompare(b.id));
    return { rows };
  }
  if (mode === "random") return { rows: await randomAlbumRows(db, album, gen) };
  const mixed = await mixedAlbumRows(db, album, gen, now, tz, recentPercent);
  if (mode !== "onthisday") return mixed;
  const today = torontoDateKey(now, tz);
  const targets = [];
  for (let offset = -2; offset <= 2; offset++) {
    targets.push(addDate(today, -7 + offset));
    const date = new Date(today + "T12:00:00Z");
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - 1);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
    targets.push(addDate(date.toISOString().slice(0, 10), offset));
  }
  const matches = await db.prepare(base + " AND (p.date IN (SELECT value FROM json_each(?)) OR (substr(p.date, 6) = ? AND p.date < ?)) ORDER BY p.date DESC, p.id LIMIT ?")
    .bind(album, gen, JSON.stringify(targets), today.slice(5), today, PHOTO_BATCH_SIZE).all();
  const rows = matches.results || [], seen = new Set(rows.map((r) => r.id));
  const remaining = await db.prepare(base + " ORDER BY RANDOM() LIMIT ?").bind(album, gen, PHOTO_BATCH_SIZE * 2).all();
  for (const row of mixed.rows.concat(remaining.results || [])) {
    if (rows.length >= PHOTO_BATCH_SIZE) break;
    if (!seen.has(row.id)) { rows.push(row); seen.add(row.id); }
  }
  return { rows };
}
async function indexedAlbumPhotos(db, album, now = Date.now(), tz = TORONTO, options = {}) {
  if (!db) return null;
  const scan = await db.prepare("SELECT live_gen, count FROM album_scan WHERE album = ?").bind(album).first();
  if (!scan || scan.live_gen == null) return null;
  let rows, fresh;
  const mode = options.mode || "mixed";
  if (album.replace(/^h\d+:/, "") === "main" || mode !== "mixed" || options.mode && !options.legacyShabbat) {
    try {
      ({ rows, fresh } = await selectedAlbumRows(db, album, scan.live_gen, now, tz, mode, options.recentPercent ?? 100 / 3));
    } catch (_) {
    }
  }
  if (!rows) rows = await randomAlbumRows(db, album, scan.live_gen);
  const photos2 = rows.map((row) => albumPhotoRow(row, album));
  const body = { photos: photos2, total: Number.isFinite(scan.count) ? scan.count : photos2.length, mode };
  if (fresh != null) body.fresh = fresh;
  return body;
}
async function photos(request, env) {
  const url = new URL(request.url);
  const album = url.searchParams.get("album");
  if (album !== "main" && album !== "shabbat") return json({ error: "Unknown album" }, 400);
  try {
    const indexed = await indexedAlbumPhotos(env.DB, ns(env.household.id, album), Date.now(), env.household.settings.location.tz, { ...env.household.settings.photos, legacyShabbat: env.household.id === 1 && env.household.legacyPhotoMode });
    if (indexed) return json(indexed);
  } catch (_) {
  }
  const shareUrl = albumShareUrl(env, album);
  if (shareUrl) {
    try {
      const html = await cachedText(new URL(shareUrl).toString(), 3600);
      const records = sharedMediaRecords(html);
      const hidden = await hiddenPhotoIds(env.DB, ns(env.household.id, album));
      const photos2 = sharedAlbumPhotos(records, album, env.household.settings.location.tz).filter((photo) => !hidden.has(photoId(photo.src)));
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
function albumShareUrl(env, album) {
  const photos = env.household.settings.photos;
  return album === "main" ? photos.main : photos.shabbat || photos.main;
}
async function hiddenPhotos(request, env) {
  const result = await env.DB.prepare("SELECT album, id, src, date, hidden FROM photo_hidden WHERE album IN (?, ?) ORDER BY hidden DESC LIMIT 500").bind(ns(env.household?.id || 1, "main"), ns(env.household?.id || 1, "shabbat")).all();
  return json({ photos: (result.results || []).map((p) => ({ ...p, album: p.album.replace(/^h\d+:/, "") })) });
}
async function hidePhoto(request, env, hide, editingLocked = async () => isKodeshWindowActive((await zmanimData(fetch, env.household?.settings)).windows)) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: "Invalid JSON" }, 400);
  }
  let album = body && body.album;
  const id = photoId(body && body.src);
  if ((album !== "main" && album !== "shabbat") || !id) return json({ error: "Expected { album, src }" }, 400);
  if (await editingLocked()) return json({ error: "Editing is disabled during Shabbat/Yom Tov" }, 423);
  album = ns(env.household?.id || 1, album);
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
  if (env.household && env.household.id !== 1) return json({ photos: [], total: 0 });
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
async function sessionHousehold(request, env) {
  const value = cookieValue(request, "fd_s");
  const match = /^(?:h([1-9]\d*)\.)?(\d+)\.([a-f\d]{64})$/i.exec(value);
  if (!match || !sessionSecretBytes(env.SESSION_SECRET)) return null;
  const hid = Number(match[1] || 1);
  if (!Number.isSafeInteger(hid)) return null;
  const expires = Number(match[2]);
  const now = Math.floor(Date.now() / 1e3);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + SESSION_SECONDS + 60) return null;
  const expected = await sessionSignature(env.SESSION_SECRET, match[1] ? `${hid}.${expires}` : expires);
  return expected && constantTimeEqual(expected, match[3]) ? hid : null;
}
async function adminSession(request, env) {
  const match = /^(\d+)\.([a-f\d]{64})$/i.exec(cookieValue(request, "fd_a"));
  if (!match) return false;
  const expires = Number(match[1]), now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + 30 * 86400 + 60) return false;
  const signature = await sessionSignature(env.SESSION_SECRET, "admin." + expires);
  return signature && constantTimeEqual(signature, match[2]);
}
async function login(request, env, admin = false) {
  if (!(admin ? env.ADMIN_PASSWORD : env.FAMILY_PIN) || !sessionSecretBytes(env.SESSION_SECRET)) return json({ error: admin ? "Admin not configured" : "Login is not configured" }, 503);
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
  if (!body || typeof body[admin ? "password" : "pin"] !== "string") return json({ error: admin ? "Invalid password" : "Invalid PIN" }, 400);
  const hid = admin ? constantTimeEqual(await sessionSignature(env.SESSION_SECRET, "admin-password:" + body.password), await sessionSignature(env.SESSION_SECRET, "admin-password:" + env.ADMIN_PASSWORD)) :
    constantTimeEqual(body.pin, env.FAMILY_PIN) ? 1 : (await env.DB.prepare("SELECT id FROM household WHERE pin_hash = ?").bind(await sessionSignature(env.SESSION_SECRET, "pin:" + body.pin)).first())?.id;
  if (!hid) {
    await env.DB.prepare("INSERT INTO login_fail (ip, ts) VALUES (?, ?)").bind(ip, now).run();
    const failures = Number(row?.count || 0) + 1;
    return json({ error: failures >= LOGIN_MAX_FAILURES ? "Too many attempts" : admin ? "Incorrect password" : "Incorrect PIN" }, failures >= LOGIN_MAX_FAILURES ? 429 : 401);
  }
  await env.DB.prepare("DELETE FROM login_fail WHERE ip = ?").bind(ip).run();
  const seconds = admin ? 30 * 86400 : SESSION_SECONDS;
  const expires = Math.floor(now / 1e3) + seconds;
  const signature = await sessionSignature(env.SESSION_SECRET, admin ? "admin." + expires : `${hid}.${expires}`);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": admin ? `fd_a=${expires}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${seconds}` :
        `fd_s=h${hid}.${expires}.${signature}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${seconds}`
    }
  });
}
function isKodeshWindowActive(windows, now = Date.now()) {
  return (windows || []).some((window) => new Date(window.start).getTime() <= now && new Date(window.end).getTime() > now);
}
async function stateVersions(env) {
  const result = await env.DB.prepare("SELECT key, updated FROM state WHERE key IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(Array.from(STATE_KEYS, (key) => ns(env.household.id, key)))).all();
  const keys = {};
  (result.results || []).forEach((row) => {
    const prefix = env.household.id === 1 ? "" : `h${env.household.id}:`;
    const key = row.key.slice(prefix.length);
    if (row.key.startsWith(prefix) && STATE_KEYS.has(key)) keys[key] = row.updated;
  });
  return json(keys);
}
async function musicAuth(env) {
  let row = await env.DB.prepare("SELECT token, device_id, profile_json, email FROM household_music_auth WHERE hid = ?").bind(env.household.id).first();
  if (!row) {
    await env.DB.prepare("INSERT INTO household_music_auth (hid, token, device_id, profile_json, email, updated) VALUES (?, NULL, ?, NULL, NULL, ?) ON CONFLICT(hid) DO NOTHING")
      .bind(env.household.id, crypto.randomUUID(), Date.now())
      .run();
    row = await env.DB.prepare("SELECT token, device_id, profile_json, email FROM household_music_auth WHERE hid = ?").bind(env.household.id).first();
  }
  return row;
}
function musicProfile(value) {
  if (!value || typeof value !== "object") return null;
  if (!Array.isArray(value)) {
    for (const key of ["profile", "fh3", "selected_profile"]) {
      const nested = musicProfile(value[key]);
      if (nested) return nested;
    }
    if (value.id != null && typeof value.name === "string") {
      return {
        id: value.id,
        name: value.name,
        img: value.img ?? value.image ?? value.artwork ?? null
      };
    }
    for (const item of Object.values(value)) {
      const nested = musicProfile(item);
      if (nested) return nested;
    }
  } else {
    for (const item of value) {
      const nested = musicProfile(item);
      if (nested) return nested;
    }
  }
  return null;
}
function musicToken(value) {
  const find = (node, key) => {
    if (!node || typeof node !== "object") return null;
    if (!Array.isArray(node) && typeof node[key] === "string" && node[key]) return node[key];
    for (const child of Array.isArray(node) ? node : Object.values(node)) {
      const token = find(child, key);
      if (token) return token;
    }
    return null;
  };
  for (const key of ["token", "access_token", "api_token", "bearer"]) {
    const token = find(value, key);
    if (token) return token;
  }
  const findLongString = (node) => {
    if (typeof node === "string") return node.length >= 30 ? node : null;
    if (!node || typeof node !== "object") return null;
    for (const child of Array.isArray(node) ? node : Object.values(node)) {
      const token = findLongString(child);
      if (token) return token;
    }
    return null;
  };
  return findLongString(value);
}
function musicTile(item) {
  if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.id !== "number" || !(item.title || item.name)) {
    return null;
  }
  const rawKind = item.entity_type ?? item.type ?? item.content_type ?? "track";
  const kind = String(rawKind).toLowerCase();
  const artist = item.artist?.name ?? item.artists?.[0]?.name ?? item.subtitle ?? item.by;
  const image = item.img ?? item.artwork ?? item.image;
  return {
    id: item.id,
    kind: kind === "content" || kind === "music" ? "track" : kind,
    title: String(item.title || item.name),
    subtitle: typeof artist === "string" ? artist : artist?.name ?? "",
    img: typeof image === "string" ? image : image?.url ?? image?.src ?? "",
    length: item.length ?? item.duration ?? item.duration_seconds ?? null
  };
}
function musicTiles(value) {
  const tiles = [];
  const visit = (item) => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    const tile = musicTile(item);
    if (tile) tiles.push(tile);
    Object.values(item).forEach(visit);
  };
  visit(value);
  return tiles;
}
function musicSearchTiles(payload) {
  return ["artists", "collections", "content", "playlists"].flatMap((key) =>
    Array.isArray(payload?.[key]) ? payload[key].map(musicTile).filter(Boolean) : []
  );
}
function musicHomeSections(value) {
  const sections = [];
  const titleKeys = /^(title|name|label|heading|section)$/i;
  const containsTrack = (items) => items.some((item) => item && typeof item === "object" && !Array.isArray(item) && typeof item.id === "number" && (item.title || item.name));
  const displayTitle = (value) => String(value || "Music").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const visit = (item, fallbackTitle = "Music", preserveFallback = false) => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      if (containsTrack(item)) sections.push({ title: preserveFallback ? fallbackTitle : displayTitle(fallbackTitle), tiles: musicTiles(item) });
      else item.forEach((child) => visit(child, fallbackTitle));
      return;
    }
    const title = Object.entries(item).find(([key, child]) => titleKeys.test(key) && typeof child === "string")?.[1];
    for (const [key, child] of Object.entries(item)) {
      if (Array.isArray(child)) {
        if (containsTrack(child)) sections.push({ title: title || displayTitle(key), tiles: musicTiles(child) });
        else child.forEach((nested) => visit(nested, title || displayTitle(key), !!title));
      } else {
        visit(child, title || fallbackTitle, !!title || preserveFallback);
      }
    }
  };
  visit(value);
  if (!sections.length) {
    const tiles = musicTiles(value);
    if (tiles.length) sections.push({ title: "Music", tiles });
  }
  return sections;
}
function musicForm(data = {}) {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      for (const item of value) values.append(key.endsWith("[]") ? key : `${key}[]`, String(item));
    } else if (value != null) {
      values.append(key, String(value));
    }
  }
  return values.toString();
}
async function clearMusicToken(env) {
  await env.DB.prepare("UPDATE household_music_auth SET token = NULL, profile_json = NULL, updated = ? WHERE hid = ?").bind(Date.now(), env.household.id).run();
}
async function musicUpstream(env, auth, path, method = "GET", body = null, includeToken = true, options = {}) {
  let response;
  try {
    const headers = new Headers({
      accept: "application/json",
      os: "Android",
      "os-version": "29",
      "app-version": "342",
      "X-API-MINOR-VERSION": "17",
      "X-PLATFORM-DEVICE": "Home HQ frame",
      "X-DEVICE-SERIAL": "",
      "X-PLATFORM-KEY": "production-android-44fd2f70",
      "X-DEVICE-ID": auth.device_id,
      "User-Agent": "okhttp/4.12.0"
    });
    if (body != null) headers.set("content-type", "application/x-www-form-urlencoded");
    if (includeToken && auth.token) headers.set("authorization", `Bearer ${auth.token}`);
    response = await fetch(`https://24six.app/api/v3/${path}`, {
      method,
      headers,
      body: body == null ? undefined : musicForm(body),
      ...options
    });
  } catch (_) {
    return { error: json({ error: "24six unavailable", upstreamStatus: 0 }, 502) };
  }
  if (response.status === 401 || response.status === 403) {
    await clearMusicToken(env);
    return { error: json({ error: "24six login expired", relogin: true }, 403) };
  }
  if (response.status >= 300 && response.status < 400) {
    return { location: response.headers.get("location") };
  }
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_) {
    payload = { message: text };
  }
  if (!response.ok) {
    return {
      error: json({
        error: typeof payload?.message === "string" ? payload.message : "24six request failed",
        upstreamStatus: response.status
      }, 502)
    };
  }
  return { payload };
}
function musicDebug(url, payload, data) {
  return url.searchParams.get("debug") === "1" ? { ...data, raw: payload } : data;
}
function findMusicString(value, predicate) {
  if (typeof value === "string") return predicate(value) ? value : null;
  if (!value || typeof value !== "object") return null;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findMusicString(child, predicate);
    if (found) return found;
  }
  return null;
}
function musicMetadata(value, key) {
  if (!value || typeof value !== "object") return null;
  if (!Array.isArray(value) && value[key] != null) {
    const candidate = value[key];
    if (typeof candidate === "string" || typeof candidate === "number") return candidate;
    if (candidate && typeof candidate === "object") {
      const nested = candidate.name ?? candidate.title ?? candidate.url ?? candidate.src;
      if (nested != null) return nested;
    }
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = musicMetadata(child, key);
    if (found != null) return found;
  }
  return null;
}
async function musicRoute(request, env, url) {
  const pathname = url.pathname;
  const method = request.method;
  const auth = await musicAuth(env);
  if (pathname === "/api/music/status" && method === "GET") {
    let profile = null;
    try {
      profile = auth.profile_json ? JSON.parse(auth.profile_json) : null;
    } catch (_) {}
    return json({ connected: !!auth.token, email: auth.email, profile });
  }
  if (pathname === "/api/music/profiles" && method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.email !== "string" || typeof body.password !== "string") return json({ error: "Email and password are required" }, 400);
    const result = await musicUpstream(env, auth, "profile-list", "POST", { email: body.email, password: body.password }, false);
    return result.error || json(result.payload);
  }
  if (pathname === "/api/music/login" && method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.email !== "string" || typeof body.password !== "string") return json({ error: "Email and password are required" }, 400);
    const result = await musicUpstream(env, auth, "login", "POST", {
      email: body.email,
      password: body.password,
      profile_id: body.profile_id,
      pin: body.pin,
      device_name: "Home HQ frame"
    }, false);
    if (result.error) return result.error;
    const payload = result.payload;
    console.log(Object.keys(payload && typeof payload === "object" ? payload : {}));
    const token = musicToken(payload);
    if (!token) return json({ error: "24six login response did not contain a token" }, 502);
    const profile = musicProfile(payload);
    await env.DB.prepare("UPDATE household_music_auth SET token = ?, profile_json = ?, email = ?, updated = ? WHERE hid = ?")
      .bind(token, profile ? JSON.stringify(profile) : null, body.email, Date.now(), env.household.id)
      .run();
    return json({ ok: true, profile });
  }
  if (pathname === "/api/music/profile" && method === "POST") {
    if (!auth.token) return json({ error: "24six login expired", relogin: true }, 403);
    const body = await request.json().catch(() => null);
    if (!body || body.profile_id == null || typeof body.pin !== "string") return json({ error: "Profile and PIN are required" }, 400);
    const result = await musicUpstream(env, auth, "profile/swap", "POST", {
      profile_id: body.profile_id,
      pin: body.pin,
      device_name: "Home HQ frame"
    });
    if (result.error) return result.error;
    console.log(Object.keys(result.payload && typeof result.payload === "object" ? result.payload : {}));
    const token = musicToken(result.payload);
    if (!token) return json({ error: "24six profile response did not contain a token" }, 502);
    const profile = musicProfile(result.payload);
    await env.DB.prepare("UPDATE household_music_auth SET token = ?, profile_json = COALESCE(?, profile_json), updated = ? WHERE hid = ?")
      .bind(token, profile ? JSON.stringify(profile) : null, Date.now(), env.household.id)
      .run();
    return json({ ok: true, profile });
  }
  if (pathname === "/api/music/logout" && method === "POST") {
    if (!auth.token) {
      await clearMusicToken(env);
      return json({ ok: true });
    }
    const result = await musicUpstream(env, auth, "logout", "POST", {});
    if (result.error) return result.error;
    await clearMusicToken(env);
    return json({ ok: true });
  }
  const browseRequest = async (path, browseMethod = "GET", body = null) => {
    if (!auth.token) return { error: json({ error: "24six login expired", relogin: true }, 403) };
    return musicUpstream(env, auth, path, browseMethod, body);
  };
  if (pathname === "/api/music/home" && method === "GET") {
    const result = await browseRequest("music?use_popularity_logic=1");
    if (result.error) return result.error;
    return json(musicDebug(url, result.payload, { sections: musicHomeSections(result.payload) }));
  }
  if (pathname === "/api/music/search" && method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.q !== "string") return json({ error: "Search query is required" }, 400);
    const result = await browseRequest("music/search", "POST", { q: body.q, type: ["artist", "collection", "content", "playlist"], limit: 50 });
    if (result.error) return result.error;
    return json(musicDebug(url, result.payload, { tiles: musicSearchTiles(result.payload) }));
  }
  if (pathname === "/api/music/library" && method === "GET") {
    const result = await browseRequest("music/library");
    if (result.error) return result.error;
    return json(musicDebug(url, result.payload, { tiles: musicTiles(result.payload) }));
  }
  const browseMatch = /^\/api\/music\/browse\/(artist|collection|playlist|category)$/.exec(pathname);
  if (browseMatch && method === "GET") {
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const params = new URLSearchParams({
      page: String(page),
      per_page: "40"
    });
    for (const key of ["sort", "keyword", "category_id"]) {
      const value = url.searchParams.get(key);
      if (value !== null && value !== "") params.set(key, value);
    }
    const result = await browseRequest(`music/${browseMatch[1]}?${params}`);
    if (result.error) return result.error;
    const tiles = musicTiles(result.payload);
    const metadata = result.payload?.pagination ?? result.payload?.meta ?? result.payload;
    const currentPage = Number(metadata?.current_page ?? metadata?.page ?? page);
    const lastPage = Number(metadata?.last_page ?? metadata?.total_pages ?? metadata?.pages);
    const total = Number(metadata?.total ?? metadata?.total_count);
    const hasMore = Number.isFinite(lastPage) && lastPage > 0
      ? currentPage < lastPage
      : Number.isFinite(total) && total >= 0
        ? currentPage * 40 < total
        : tiles.length >= 40;
    return json(musicDebug(url, result.payload, { tiles, page, hasMore }));
  }
  const listMatch = /^\/api\/music\/list\/(playlist|collection|artist|category)\/([^/]+)$/.exec(pathname);
  if (listMatch && method === "GET") {
    let id;
    try {
      id = decodeURIComponent(listMatch[2]);
    } catch (_) {
      return json({ error: "Invalid music list id" }, 400);
    }
    const path = listMatch[1] === "playlist"
      ? `music/playlist/${encodeURIComponent(id)}?page=1`
      : `music/${listMatch[1]}/${encodeURIComponent(id)}`;
    const result = await browseRequest(path);
    if (result.error) return result.error;
    return json(musicDebug(url, result.payload, { tiles: musicTiles(result.payload) }));
  }
  if (pathname === "/api/music/recent" && method === "GET") {
    const result = await browseRequest("music/content/recent");
    if (result.error) return result.error;
    return json(musicDebug(url, result.payload, { tiles: musicTiles(result.payload) }));
  }
  const streamMatch = /^\/api\/music\/stream\/([^/]+)$/.exec(pathname);
  if (streamMatch && method === "GET") {
    let id;
    try {
      id = decodeURIComponent(streamMatch[1]);
    } catch (_) {
      return json({ error: "Invalid track id" }, 400);
    }
    const result = await browseRequest(`music/content/${encodeURIComponent(id)}`, "POST", {});
    if (result.error) return result.error;
    const playResult = await musicUpstream(
      env,
      auth,
      `content/${encodeURIComponent(id)}/play?format=m3u8`,
      "GET",
      null,
      true,
      { redirect: "manual" }
    );
    if (playResult.error) return playResult.error;
    const streamUrl = playResult.location ||
      findMusicString(playResult.payload, (value) => value.includes(".m3u8")) ||
      findMusicString(result.payload, (value) => value.includes(".m3u8"));
    if (!streamUrl) return json({ error: "24six did not return a stream URL", upstreamStatus: 200 }, 502);
    const tile = musicTiles(result.payload).find((item) => String(item.id) === id) || musicTiles(result.payload)[0];
    const stream = {
      id: Number(id),
      url: streamUrl,
      title: tile?.title ?? musicMetadata(result.payload, "title") ?? "",
      artist: tile?.subtitle ?? musicMetadata(result.payload, "artist") ?? "",
      img: tile?.img ?? musicMetadata(result.payload, "img") ?? musicMetadata(result.payload, "artwork") ?? "",
      length: tile?.length ?? musicMetadata(result.payload, "length") ?? musicMetadata(result.payload, "duration") ?? null
    };
    return json(musicDebug(url, result.payload, stream));
  }
  if (pathname === "/api/music/log" && method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body || body.id == null || !Number.isFinite(Number(body.seconds))) return json({ error: "Track id and seconds are required" }, 400);
    const result = await browseRequest(`content/${encodeURIComponent(body.id)}/log`, "POST", {
      seconds: Number(body.seconds),
      current: Number(body.seconds),
      streamed_at: new Date().toISOString(),
      is_offline: 0
    });
    if (result.error) return result.error;
    return json({ ok: true });
  }
  return json({ error: "Not found" }, 404);
}
function validChores(value) {
  return Array.isArray(value) && value.length <= 200 && new Set(value.map((c) => c?.id)).size === value.length && value.every((c) =>
    c && typeof c.id === "string" && c.id.length > 0 && c.id.length <= 100 &&
    typeof c.title === "string" && c.title.trim().length > 0 && c.title.length <= 200 &&
    (c.who == null || typeof c.who === "string") && Array.isArray(c.days) &&
    c.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
    typeof c.erevShabbos === "boolean" && typeof c.erevYomTov === "boolean");
}
async function compareState(db, key, value, base, now = Date.now()) {
  const updated = Math.max(now, base + 1);
  return db.prepare(
    "INSERT INTO state (key, json, updated) SELECT ?, ?, ? WHERE ? = 0 OR EXISTS (SELECT 1 FROM state WHERE key = ? AND updated = ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated = excluded.updated WHERE state.updated = ? RETURNING updated"
  ).bind(key, JSON.stringify(value), updated, base, key, base, base).first();
}
async function materializeChores(env, now = Date.now(), fixtureWindows) {
  const clock = arguments.length > 1 ? () => now : () => Date.now();
  const hid = env.household.id, tz = env.household.settings.location.tz;
  const date = dateString(dateParts(new Date(now), tz));
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  let windows = fixtureWindows;
  for (let attempt = 0; attempt < 4; attempt++) {
    const definitions = await env.DB.prepare("SELECT json FROM state WHERE key = ?").bind(ns(hid, "chores")).first();
    const chores = definitions ? JSON.parse(definitions.json) : [];
    if (!validChores(chores) || !chores.length) return;
    if (!windows) windows = (await zmanimData(fetch, env.household.settings)).windows;
    if (isKodeshWindowActive(windows, now)) return;
    const due = chores.filter((c) => c.days.includes(day) || windows.some((w) =>
      new Date(w.start).getTime() > now && dateString(dateParts(new Date(w.start), tz)) === date &&
      (w.yomtov ? c.erevYomTov : c.erevShabbos)));
    if (!due.length) return;
    const key = ns(hid, "tasks");
    const current = await env.DB.prepare("SELECT json, updated FROM state WHERE key = ?").bind(key).first();
    let tasks = current ? JSON.parse(current.json) : [];
    if (!Array.isArray(tasks)) return;
    const missing = due.filter((c) => !tasks.some((t) => t.choreId === c.id && t.occurrence === date));
    if (!missing.length) return;
    tasks = tasks.filter((t) => !missing.some((c) => t.choreId === c.id));
    tasks.push(...missing.map((c) => ({
      id: "chore:" + c.id + ":" + date, title: c.title, who: c.who || null,
      due: date, done: false, doneAt: null, created: new Date(now).toISOString(), choreId: c.id, occurrence: date
    })));
    const at = clock();
    if (dateString(dateParts(new Date(at), tz)) !== date || isKodeshWindowActive(windows, at)) return;
    if (await compareState(env.DB, key, tasks, Number(current?.updated || 0), now)) return;
  }
}
async function state(request, env, key) {
  if (!STATE_KEYS.has(key)) return json({ error: "Unknown state key" }, 404);
  const name = key;
  if (request.method === "GET" && key === "tasks") await materializeChores(env);
  key = ns(env.household.id, key);
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT json, updated FROM state WHERE key = ?").bind(key).first();
    return row ? json({ json: JSON.parse(row.json), updated: row.updated }) : json({ json: null, updated: 0 });
  }
  if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  if (isKodeshWindowActive((await zmanimData(fetch, env.household?.settings)).windows)) {
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
  if (name === "chores" && !validChores(payload.json)) return json({ error: "Invalid repeating chores" }, 400);
  const current = await env.DB.prepare("SELECT json, updated FROM state WHERE key = ?").bind(key).first();
  const currentUpdated = Number(current?.updated || 0);
  if (Number(payload.base) !== currentUpdated) {
    return json({ json: current ? JSON.parse(current.json) : null, updated: currentUpdated }, 409);
  }
  const saved = await compareState(env.DB, key, payload.json, currentUpdated);
  if (!saved) {
    const latest = await env.DB.prepare("SELECT json, updated FROM state WHERE key = ?").bind(key).first();
    return json({ json: latest ? JSON.parse(latest.json) : null, updated: latest?.updated || 0 }, 409);
  }
  return json({ json: payload.json, updated: saved.updated });
}
var index_default = {
  async scheduled(event, env) {
    const rows = await env.DB.prepare("SELECT id FROM household").all();
    await Promise.all(rows.results.map(async (row) => {
      const h = await loadHousehold(env, row.id);
      await materializeChores({ ...env, household: h });
      await Promise.all(["main", "shabbat"].map((album) => {
        const url = albumShareUrl({ ...env, household: h }, album);
        return url ? scanAlbum(env.DB, ns(h.id, album), url, fetch, Date.now(), h.settings.location.tz) : null;
      }));
    }));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const hid = await sessionHousehold(request, env);
    const household = hid ? await loadHousehold(env, hid) : null;
    env = { ...env, household };
    const html = async (path) => {
      const response = await env.ASSETS.fetch(new Request(new URL(path, request.url), request));
      const settings = household?.settings || householdSettings({}, {}, 0);
      const fd = JSON.stringify({ hid: household?.id || 0, tz: settings.location.tz, city: settings.location.name, admin: household?.id === 1, minyanimUrl: settings.minyanimUrl }).replaceAll("<", "\\u003c");
      const transformed = new HTMLRewriter().on("head", { element(element) { element.append(`<script>window.FD=${fd}</script>`, { html: true }); } }).transform(response);
      const result = new Response(transformed.body, transformed);
      result.headers.set("cache-control", "private, no-store");
      return result;
    };
    if (url.pathname === "/" && env.ASSETS) {
      return html("/index.html");
    }
    if ((url.pathname === "/m" || url.pathname === "/m/") && env.ASSETS) {
      return html("/m.html");
    }
    if ((url.pathname === "/admin" || url.pathname === "/admin/") && env.ASSETS) return html("/admin.html");
    if (url.pathname.startsWith("/api/admin/")) {
      try { return await adminRoute(request, env, url); }
      catch (_) { return json({ error: "Admin request failed" }, 502); }
    }
    if (url.pathname.startsWith("/api/music/")) {
      if (!household) return json({ error: "Authentication required" }, 403);
      try {
        return await musicRoute(request, env, url);
      } catch (_) {
        return json({ error: "24six request failed", upstreamStatus: 0 }, 502);
      }
    }
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/login" && request.method === "POST") {
        try {
          return await login(request, env);
        } catch (_) {
          return json({ error: "Login unavailable" }, 502);
        }
      }
      if (!household) return json({ error: "Authentication required" }, 401);
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
    if (household) {
      try {
        const response = await householdRoute(request, env, url);
        if (response) return response;
      } catch (_) { return json({ error: "Household request failed" }, 502); }
    }
    if (url.pathname === "/api/weather" && request.method === "GET") {
      try {
        return await weather(request, household.settings);
      } catch (_) {
        return json({ error: "Weather unavailable" }, 502);
      }
    }
    if (url.pathname === "/api/zmanim" && request.method === "GET") {
      try {
        return await zmanim(household.settings);
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
  materializeChores,
  compareState,
  constantTimeEqual,
  index_default as default,
  expandCalendar,
  hidePhoto,
  hiddenPhotos,
  indexedAlbumPhotos,
  isKodeshWindowActive,
  musicTiles,
  musicToken,
  mergeEvents,
  parseBatchExecutePage,
  parseSharedAlbumPage,
  scanAlbum,
  sharedAlbumPhotos,
  upcomingWindow,
  zmanimData
};
