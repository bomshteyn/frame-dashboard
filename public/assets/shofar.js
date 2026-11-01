(function () {
  var DEFAULTS = { on: true, volume: 70, test: 0 };
  var SETTING_URL = "/api/state/shofar";

  function due(windows, nowMs, played) {
    windows = Array.isArray(windows) ? windows : [];
    played = Array.isArray(played) ? played : [];
    var events = [];
    windows.forEach(function (window, index) {
      var start = new Date(window && window.start).getTime();
      if (!Number.isFinite(start)) return;
      events.push({ index: index, time: start - 15 * 60 * 1000, kind: "warn", start: window.start });
      events.push({ index: index, time: start, kind: "start", start: window.start });
    });
    events.sort(function (a, b) { return a.time - b.time; });
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      var key = event.start + "|" + event.kind;
      if (event.time > nowMs || nowMs >= event.time + 90 * 1000 || played.indexOf(key) >= 0) continue;
      var inOtherWindow = windows.some(function (window, index) {
        if (index === event.index || !window) return false;
        var start = new Date(window.start).getTime();
        var end = new Date(window.end).getTime();
        return Number.isFinite(start) && Number.isFinite(end) && start <= event.time && event.time < end;
      });
      if (!inOtherWindow) return { key: key, kind: event.kind, start: event.start };
    }
    return null;
  }

  window.HQShofar = window.HQShofar || {};
  window.HQShofar.due = due;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }
  function css(text) {
    var style = document.createElement("style");
    style.textContent = text;
    document.head.appendChild(style);
  }
  function normalize(value) {
    value = value && typeof value === "object" ? value : {};
    var volume = Number(value.volume);
    var test = Number(value.test);
    return {
      on: typeof value.on === "boolean" ? value.on : DEFAULTS.on,
      volume: Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : DEFAULTS.volume,
      test: Number.isFinite(test) ? Math.max(0, test) : DEFAULTS.test,
      testAt: typeof value.testAt === "string" ? value.testAt : ""
    };
  }
  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }
  function fetchJson(url, options) {
    return fetch(url, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (value) {
        if (!response.ok) throw new Error(value.error || "Request failed");
        return value;
      });
    });
  }

  function phone() {
    var setting = normalize(null);
    var updated = 0;
    var windows = [];
    var windowsLoaded = false;
    var windowsLoading = false;
    var loading = false;
    var loadAttempted = false;
    var loaded = false;
    var saving = false;
    var loadError = "";
    var feedback = "";

    css(
      ".m-shofar-controls{display:flex;align-items:center;justify-content:space-between;gap:16px;background:var(--card);border-radius:16px;margin:12px 0;padding:14px}" +
      ".m-shofar-toggle{display:flex;align-items:center;gap:10px;font-weight:600}" +
      ".m-shofar-toggle input{width:20px;height:20px;accent-color:var(--ink,#1d1d1b)}" +
      ".m-shofar-volume{display:flex;flex-direction:column;gap:8px;background:var(--card);border-radius:16px;margin:0 0 12px;padding:14px}" +
      ".m-shofar-volume span{display:flex;justify-content:space-between;gap:10px}" +
      ".m-shofar-volume input{width:100%;accent-color:var(--ink,#1d1d1b)}" +
      ".m-shofar-status{margin:10px 0}"
    );

    function isLocked() {
      var now = Date.now();
      return windows.some(function (window) {
        if (!window) return false;
        return new Date(window.start).getTime() <= now && now < new Date(window.end).getTime();
      });
    }
    function nextText() {
      var now = Date.now();
      var next = windows.filter(function (window) {
        return new Date(window.start).getTime() > now;
      })[0];
      if (!next) return windowsLoaded ? "Next: not available" : "Next: loading…";
      var start = new Date(next.start);
      var warn = new Date(start.getTime() - 15 * 60 * 1000);
      var day = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "long" }).format(start);
      var time = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" });
      return "Next: " + day + " " + time.format(warn) + " and " + time.format(start);
    }
    function body() {
      var locked = isLocked();
      var disabled = locked || !loaded || !windowsLoaded || saving;
      return '<p class="m-muted">Plays on the frames 15 minutes before candle lighting and at candle lighting. Silent when Shabbat or Yom Tov starts during Yom Tov.</p>' +
        (locked ? '<p class="m-muted">Settings are locked during Shabbat/Yom Tov</p>' : "") +
        '<div class="m-shofar-controls"><label class="m-shofar-toggle"><input type="checkbox" data-shofar-on' + (setting.on ? " checked" : "") + (disabled ? " disabled" : "") + '>On</label>' +
        '<button type="button" class="m-mini" data-shofar-test' + (disabled ? " disabled" : "") + '>Test on frames</button></div>' +
        '<label class="m-shofar-volume"><span>Volume <b>' + setting.volume + '</b></span><input type="range" min="0" max="100" value="' + setting.volume + '" data-shofar-volume' + (disabled ? " disabled" : "") + '></label>' +
        (feedback ? '<p class="m-muted m-shofar-status">' + esc(feedback) + "</p>" : "") +
        '<p class="m-muted">' + esc(nextText()) + "</p>" +
        (loadError ? '<p class="m-muted">' + esc(loadError) + "</p>" : "");
    }
    function paint() {
      var element = document.querySelector("[data-shofar-body]");
      if (element) element.innerHTML = body();
    }
    function loadSetting() {
      if (loading) return;
      loading = true;
      loadAttempted = true;
      fetchJson(SETTING_URL, { cache: "no-store" }).then(function (result) {
        setting = normalize(result.json);
        updated = Number(result.updated) || 0;
        loaded = true;
        loadError = "";
      }).catch(function (error) {
        loadError = error.message;
      }).then(function () {
        loading = false;
        paint();
      });
    }
    function loadWindows() {
      if (windowsLoading) return;
      windowsLoading = true;
      fetchJson("/api/zmanim", { cache: "no-store" }).then(function (result) {
        windows = Array.isArray(result.windows) ? result.windows : [];
      }).catch(function () {
        windows = [];
      }).then(function () {
        windowsLoading = false;
        windowsLoaded = true;
        paint();
      });
    }
    function section() {
      if (!loaded && !loading && !loadAttempted) loadSetting();
      if (!windowsLoaded) loadWindows();
      return '<section class="m-frame-shofar"><div class="m-section-heading"><h2 class="serif">Shabbat shofar</h2></div><div data-shofar-body>' + body() + "</div></section>";
    }
    function applyPatch(base, patch) {
      var changes = typeof patch === "function" ? patch(base) : patch;
      return Object.assign({}, base, changes);
    }
    function put(candidate, base) {
      return fetch(SETTING_URL, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: candidate, base: base })
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (result) {
          return { status: response.status, ok: response.ok, result: result };
        });
      });
    }
    function save(patch, success) {
      if (isLocked()) return alert("Settings are locked during Shabbat/Yom Tov");
      saving = true;
      feedback = "";
      paint();
      var candidate = normalize(applyPatch(setting, patch));
      put(candidate, updated).then(function (response) {
        if (response.status === 409) {
          setting = normalize(response.result.json);
          updated = Number(response.result.updated) || 0;
          return put(normalize(applyPatch(setting, patch)), updated).then(function (retry) {
            if (!retry.ok) throw new Error(retry.result.error || "Request failed");
            setting = normalize(retry.result.json);
            updated = Number(retry.result.updated) || 0;
          });
        }
        if (!response.ok) throw new Error(response.result.error || "Request failed");
        setting = normalize(response.result.json);
        updated = Number(response.result.updated) || 0;
      }).then(function () {
        feedback = success || "";
      }).catch(function (error) {
        alert(error.message);
      }).then(function () {
        saving = false;
        paint();
      });
    }

    document.addEventListener("change", function (event) {
      var target = event.target;
      if (target.matches && target.matches("[data-shofar-on]")) {
        save({ on: target.checked });
      } else if (target.matches && target.matches("[data-shofar-volume]")) {
        save({ volume: Number(target.value) });
      }
    });
    document.addEventListener("click", function (event) {
      var button = event.target.closest && event.target.closest("[data-shofar-test]");
      if (!button || button.disabled) return;
      save(function (current) {
        return { test: (Number(current.test) || 0) + 1, testAt: new Date().toISOString() };
      }, "Sent — the frames will play it within a minute");
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        loadAttempted = false;
        loadWindows();
        loadSetting();
      }
    });
    setInterval(paint, 60000);

    var hidden = window.HQHidden;
    if (hidden && typeof hidden.html === "function") {
      var hiddenHtml = hidden.html;
      hidden.html = function () { return section() + hiddenHtml.apply(hidden, arguments); };
    } else {
      window.HQHidden = { html: section };
    }
  }

  function frame() {
    var setting = normalize(null);
    var updated = 0;
    var loaded = false;
    var played;
    var activeAudio = null;
    var blobUrl = null;
    try {
      var storedPlayed = JSON.parse(safeGet("frame-shofar-played") || "[]");
      played = Array.isArray(storedPlayed) ? storedPlayed.slice(-20) : [];
    } catch (_) {
      played = [];
    }

    fetch("/assets/shofar-tekiah.mp3").then(function (response) {
      if (!response.ok) throw new Error("Shofar audio unavailable");
      return response.blob();
    }).then(function (blob) {
      blobUrl = URL.createObjectURL(blob);
    }).catch(function () {});

    function play(volume) {
      if (activeAudio) return;
      var oldVolume = null;
      var bridge = window.HomeHQ;
      if (bridge && typeof bridge.getVolume === "function" && typeof bridge.setVolume === "function") {
        try {
          var currentVolume = bridge.getVolume();
          if (currentVolume !== null && currentVolume !== undefined && Number.isFinite(Number(currentVolume))) {
            oldVolume = Number(currentVolume);
          }
          bridge.setVolume(Math.max(0, Math.min(100, Number(volume) || 0)));
        } catch (_) {
          oldVolume = null;
        }
      }
      var audio;
      try {
        audio = new Audio(blobUrl || "/assets/shofar-tekiah.mp3");
      } catch (_) {
        if (oldVolume !== null && bridge && bridge.setVolume) {
          try { bridge.setVolume(oldVolume); } catch (_) {}
        }
        return;
      }
      activeAudio = audio;
      window.dispatchEvent(new Event("hq:shofar-start"));
      var restored = false;
      function restore() {
        if (restored) return;
        restored = true;
        if (activeAudio === audio) activeAudio = null;
        if (oldVolume !== null && bridge && typeof bridge.setVolume === "function") {
          try { bridge.setVolume(oldVolume); } catch (_) {}
        }
        window.dispatchEvent(new Event("hq:shofar-end"));
      }
      audio.addEventListener("ended", restore);
      audio.addEventListener("error", restore);
      try {
        var result = audio.play();
        if (result && typeof result.catch === "function") result.catch(restore);
      } catch (_) {
        restore();
      }
    }
    function remember(key) {
      played = played.filter(function (value) { return value !== key; });
      played.push(key);
      played = played.slice(-20);
      safeSet("frame-shofar-played", JSON.stringify(played));
    }
    function windows() {
      if (window.App && App.state && App.state.zmanim && Array.isArray(App.state.zmanim.windows)) return App.state.zmanim.windows;
      try {
        var cached = JSON.parse(safeGet("frame-zmanim") || "null");
        return cached && Array.isArray(cached.windows) ? cached.windows : [];
      } catch (_) {
        return [];
      }
    }
    function tick() {
      if (!loaded) return;
      var event = due(windows(), Date.now(), played);
      if (!event) return;
      remember(event.key);
      if (setting.on) play(setting.volume);
    }
    function accept(result) {
      setting = normalize(result.json);
      updated = Number(result.updated) || 0;
      loaded = true;
      var lastTest = safeGet("frame-shofar-test");
      if (lastTest === null) {
        safeSet("frame-shofar-test", String(setting.test));
        return;
      }
      var seen = Number(lastTest);
      if (setting.test > (Number.isFinite(seen) ? seen : 0)) {
        safeSet("frame-shofar-test", String(setting.test));
        var testAt = new Date(setting.testAt).getTime();
        var age = Date.now() - testAt;
        if (Number.isFinite(testAt) && age >= 0 && age <= 2 * 60 * 1000) play(setting.volume);
      }
      tick();
    }
    function loadSetting() {
      fetchJson(SETTING_URL, { cache: "no-store" }).then(accept).catch(function () {
        loaded = true;
      });
    }
    function checkVersion() {
      fetchJson("/api/state/version", { cache: "no-store" }).then(function (versions) {
        var next = Number(versions.shofar) || 0;
        if (next !== updated) loadSetting();
      }).catch(function () {});
    }

    loadSetting();
    setInterval(tick, 10000);
    setInterval(checkVersion, 60000);
  }

  if (document.getElementById("mApp")) return phone();
  if (!document.getElementById("ambient")) return;
  frame();
})();
