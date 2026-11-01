(function () {
  const stage = document.getElementById("stage");
  if (!stage) return;

  const appStageWidth = Number(window.App?.stageW || 1280);
  const appStageHeight = Number(window.App?.stageH || 800);
  const stageWidth = appStageWidth === 1280 ? Math.max(1280, Math.round(800 * window.innerWidth / window.innerHeight)) : appStageWidth;
  const stageHeight = appStageHeight === 800 ? Math.max(800, Math.round(1280 * window.innerHeight / window.innerWidth)) : appStageHeight;
  const frameLabel = Math.abs(stageWidth / stageHeight - 1.6) < 0.025 ? "small" : "large";
  const nowKey = `music_now_${frameLabel}`;
  const sequenceKey = `frame-music-seq-${frameLabel}`;
  const audio = new Audio();
  audio.preload = "none";
  audio.crossOrigin = "anonymous";

  let musicState = null;
  let musicVersion = null;
  let nowUpdated = 0;
  let activeIndex = 0;
  let activeTrack = null;
  let currentStreamUrl = "";
  let currentHls = null;
  let playbackError = "";
  let playerPlaying = false;
  let shofarInterrupted = false;
  let shofarActive = false;
  let retryUsed = false;
  let pollTimer = 0;
  let hlsLoading = null;

  function musicIcon(name) {
    const paths = {
      play: '<path d="m8 5 12 7-12 7z"/>',
      pause: '<path d="M8 5v14M16 5v14"/>',
      next: '<path d="M5 5v14l11-7z"/><path d="M19 5v14"/>',
      prev: '<path d="M19 5v14L8 12z"/><path d="M5 5v14"/>',
      note: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'
    };
    return `<svg class="music-chip__icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  }

  const chip = document.createElement("aside");
  chip.className = "music-chip";
  chip.hidden = true;
  chip.setAttribute("aria-label", "Now playing");
  chip.innerHTML =
    '<div class="music-chip__cover-wrap"><img class="music-chip__cover" alt="" draggable="false">' +
    `<span class="music-chip__placeholder" hidden>${musicIcon("note")}</span></div>` +
    '<div class="music-chip__details"><span class="music-chip__title"></span><span class="music-chip__artist"></span></div>' +
    `<button class="music-chip__button" type="button" data-music-toggle aria-label="Play">${musicIcon("play")}</button>` +
    `<button class="music-chip__button" type="button" data-music-next aria-label="Next track">${musicIcon("next")}</button>`;
  stage.appendChild(chip);

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (_) {}
  }

  function queue() {
    return Array.isArray(musicState?.queue) ? musicState.queue : [];
  }

  function currentTrack() {
    return activeTrack || queue()[activeIndex] || null;
  }

  function setVolume(value) {
    const volume = Math.max(0, Math.min(100, Number(value) || 0));
    if (window.HomeHQ && typeof window.HomeHQ.setVolume === "function") {
      try {
        window.HomeHQ.setVolume(volume);
        return;
      } catch (_) {}
    }
    audio.volume = volume / 100;
  }

  function kodeshWindows() {
    if (window.App?.state?.zmanim && Array.isArray(window.App.state.zmanim.windows)) {
      return window.App.state.zmanim.windows;
    }
    try {
      const cached = JSON.parse(safeStorageGet("frame-zmanim") || "null");
      return Array.isArray(cached?.windows) ? cached.windows : [];
    } catch (_) {
      return [];
    }
  }

  function isKodeshActive() {
    const now = Date.now();
    return !!window.App?.kodeshActive || kodeshWindows().some((window) => {
      const start = new Date(window?.start).getTime();
      const end = new Date(window?.end).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
    });
  }

  function renderChip() {
    const tracks = queue();
    chip.hidden = tracks.length === 0;
    const track = currentTrack() || tracks[Number(musicState?.index) || 0];
    chip.querySelector(".music-chip__title").textContent = track?.title || "24six";
    chip.querySelector(".music-chip__artist").textContent = track?.artist || "";
    const cover = chip.querySelector(".music-chip__cover");
    const placeholder = chip.querySelector(".music-chip__placeholder");
    if (track?.img) {
      cover.src = track.img;
      cover.hidden = false;
      placeholder.hidden = true;
    } else {
      cover.removeAttribute("src");
      cover.hidden = true;
      placeholder.hidden = false;
    }
    const toggle = chip.querySelector("[data-music-toggle]");
    toggle.innerHTML = musicIcon(playerPlaying ? "pause" : "play");
    toggle.setAttribute("aria-label", playerPlaying ? "Pause" : "Play");
  }

  function stopEvent(event) {
    event.stopPropagation();
  }

  ["pointerdown", "pointerup", "click", "touchstart", "mousedown"].forEach((type) => {
    chip.addEventListener(type, stopEvent);
  });
  chip.addEventListener("dragstart", (event) => event.preventDefault());
  chip.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-music-next")) {
      advanceTrack(1, true);
    } else if (playerPlaying) {
      pausePlayback();
    } else {
      resumePlayback();
    }
  });

  function reportNowPlaying() {
    const track = currentTrack();
    const value = {
      id: track?.id ?? null,
      title: track?.title || "",
      artist: track?.artist || "",
      img: track?.img || "",
      pos: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      dur: Number.isFinite(audio.duration) ? audio.duration : 0,
      playing: playerPlaying,
      index: activeIndex,
      error: playbackError,
      at: new Date().toISOString()
    };
    fetch(`/api/state/${nowKey}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ json: value, base: nowUpdated })
    }).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && Number.isSafeInteger(result.updated)) {
        nowUpdated = result.updated;
        const retry = await fetch(`/api/state/${nowKey}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ json: value, base: nowUpdated })
        });
        const retried = await retry.json().catch(() => ({}));
        if (retry.ok && Number.isSafeInteger(retried.updated)) nowUpdated = retried.updated;
        return;
      }
      if (response.ok && Number.isSafeInteger(result.updated)) nowUpdated = result.updated;
    }).catch(() => {});
  }

  async function loadNowVersion() {
    try {
      const response = await fetch(`/api/state/${nowKey}`, { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json();
      nowUpdated = Number(result.updated) || 0;
    } catch (_) {}
  }

  async function ensureHls() {
    if (window.Hls) return window.Hls;
    if (hlsLoading) return hlsLoading;
    hlsLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/assets/hls.light.min.js";
      script.onload = () => window.Hls ? resolve(window.Hls) : reject(new Error("HLS playback unavailable"));
      script.onerror = () => reject(new Error("HLS playback unavailable"));
      document.head.appendChild(script);
    });
    return hlsLoading;
  }

  function destroyHls() {
    if (currentHls) currentHls.destroy();
    currentHls = null;
  }

  function logTrack(track, seconds) {
    if (!track || seconds < 30) return;
    fetch("/api/music/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: track.id, seconds })
    }).catch(() => {});
  }

  function stopPlayback() {
    playerPlaying = false;
    shofarInterrupted = false;
    audio.pause();
    destroyHls();
    audio.removeAttribute("src");
    audio.load();
    currentStreamUrl = "";
    renderChip();
    reportNowPlaying();
  }

  async function loadAndPlay(index, retry = false) {
    if (isKodeshActive()) {
      playbackError = "Playback is paused during Shabbat/Yom Tov";
      stopPlayback();
      return;
    }
    const tracks = queue();
    if (!tracks.length) return;
    activeIndex = (index + tracks.length) % tracks.length;
    activeTrack = tracks[activeIndex];
    if (shofarActive) {
      shofarInterrupted = true;
      renderChip();
      reportNowPlaying();
      return;
    }
    retryUsed = retry;
    playbackError = "";
    renderChip();
    try {
      const response = await fetch(`/api/music/stream/${encodeURIComponent(activeTrack.id)}`, { cache: "no-store" });
      const stream = await response.json().catch(() => ({}));
      if (!response.ok || typeof stream.url !== "string") throw new Error(stream.error || "Stream unavailable");
      destroyHls();
      audio.pause();
      audio.removeAttribute("src");
      currentStreamUrl = stream.url;
      if (isKodeshActive()) {
        playbackError = "Playback is paused during Shabbat/Yom Tov";
        stopPlayback();
        return;
      }
      let Hls = null;
      try {
        Hls = await ensureHls();
      } catch (_) {}
      if (Hls && Hls.isSupported()) {
        currentHls = new Hls();
        const hlsPlayback = new Promise((resolve, reject) => {
          currentHls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (shofarActive) {
              shofarInterrupted = true;
              resolve();
              return;
            }
            audio.play().then(resolve, reject);
          });
          currentHls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) reject(new Error("HLS playback failed"));
          });
          currentHls.loadSource(stream.url);
          currentHls.attachMedia(audio);
        });
        setVolume(musicState?.volume ?? 70);
        await hlsPlayback;
      } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
        audio.src = stream.url;
        setVolume(musicState?.volume ?? 70);
        if (shofarActive) shofarInterrupted = true;
        else await audio.play();
      } else {
        throw new Error("This frame cannot play HLS streams");
      }
      if (isKodeshActive()) {
        playbackError = "Playback is paused during Shabbat/Yom Tov";
        stopPlayback();
        return;
      }
      if (shofarActive) {
        shofarInterrupted = true;
        return;
      }
      playerPlaying = true;
      playbackError = "";
      renderChip();
      reportNowPlaying();
    } catch (error) {
      if (!retryUsed && currentStreamUrl) {
        retryStream();
        return;
      }
      playerPlaying = false;
      playbackError = error.message || "Playback failed";
      renderChip();
      reportNowPlaying();
    }
  }

  function retryStream() {
    if (retryUsed || !currentTrack()) {
      playerPlaying = false;
      playbackError = "Stream playback failed";
      renderChip();
      reportNowPlaying();
      return;
    }
    retryUsed = true;
    loadAndPlay(activeIndex, true);
  }

  function pausePlayback() {
    if (!playerPlaying) return;
    playerPlaying = false;
    shofarInterrupted = false;
    audio.pause();
    renderChip();
    reportNowPlaying();
  }

  function resumePlayback() {
    if (isKodeshActive()) {
      playbackError = "Playback is paused during Shabbat/Yom Tov";
      stopPlayback();
      return;
    }
    if (shofarActive) return;
    if (currentStreamUrl && audio.src) {
      audio.play().then(() => {
        playerPlaying = true;
        playbackError = "";
        renderChip();
        reportNowPlaying();
      }).catch((error) => {
        playbackError = error.message || "Playback failed";
        reportNowPlaying();
      });
    } else {
      loadAndPlay(Number(musicState?.index) || activeIndex);
    }
  }

  function advanceTrack(direction, logCurrent) {
    if (!queue().length) return;
    if (logCurrent) logTrack(currentTrack(), Number(audio.currentTime) || 0);
    loadAndPlay(activeIndex + direction);
  }

  function applyCommand(command) {
    const argument = command.arg;
    switch (command.cmd) {
      case "play":
        loadAndPlay(Number.isFinite(Number(argument)) ? Number(argument) : Number(command.index) || 0);
        break;
      case "pause":
        pausePlayback();
        break;
      case "resume":
        resumePlayback();
        break;
      case "next":
        advanceTrack(1, true);
        break;
      case "prev":
        advanceTrack(-1, true);
        break;
      case "stop":
        if (playerPlaying) logTrack(currentTrack(), Number(audio.currentTime) || 0);
        stopPlayback();
        break;
      case "volume":
        setVolume(argument ?? command.volume);
        reportNowPlaying();
        break;
      case "seek":
        if (Number.isFinite(Number(argument)) && Number.isFinite(audio.duration)) {
          audio.currentTime = Math.max(0, Math.min(audio.duration, Number(argument)));
          reportNowPlaying();
        }
        break;
    }
  }

  async function updateMusicState() {
    try {
      const versionsResponse = await fetch("/api/state/version", { cache: "no-store" });
      if (!versionsResponse.ok) return;
      const versions = await versionsResponse.json();
      const nextVersion = Number(versions.music) || 0;
      if (nextVersion === musicVersion) return;
      const stateResponse = await fetch("/api/state/music", { cache: "no-store" });
      if (!stateResponse.ok) return;
      const stateResult = await stateResponse.json();
      musicVersion = Number(stateResult.updated) || nextVersion;
      musicState = stateResult.json && typeof stateResult.json === "object" ? stateResult.json : null;
      if (!musicState) {
        renderChip();
        return;
      }
      activeIndex = Number(musicState.index) || 0;
      activeTrack = queue()[activeIndex] || null;
      renderChip();
      const targetMatches = musicState.target === "both" || musicState.target === frameLabel;
      const sequence = Number(musicState.seq) || 0;
      const lastSequence = Number(safeStorageGet(sequenceKey)) || 0;
      if (targetMatches && sequence > lastSequence) {
        safeStorageSet(sequenceKey, sequence);
        applyCommand(musicState);
      }
    } catch (_) {}
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    const queuedOrPlaying = queue().length > 0 || playerPlaying;
    pollTimer = setTimeout(async () => {
      await updateMusicState();
      schedulePoll();
    }, queuedOrPlaying ? 2000 : 5000);
  }

  audio.addEventListener("ended", () => {
    const seconds = Number.isFinite(audio.duration) ? audio.duration : Number(audio.currentTime) || 0;
    logTrack(currentTrack(), seconds);
    if (activeIndex + 1 < queue().length) {
      activeIndex += 1;
      activeTrack = queue()[activeIndex];
      loadAndPlay(activeIndex);
    } else {
      playerPlaying = false;
      renderChip();
      reportNowPlaying();
    }
  });
  audio.addEventListener("error", retryStream);
  audio.addEventListener("seeked", reportNowPlaying);
  audio.addEventListener("pause", () => {
    if (playerPlaying && !shofarInterrupted) {
      playerPlaying = false;
      renderChip();
      reportNowPlaying();
    }
  });
  audio.addEventListener("play", () => {
    playerPlaying = true;
    renderChip();
    reportNowPlaying();
  });

  window.addEventListener("hq:shofar-start", () => {
    shofarActive = true;
    if (!playerPlaying) return;
    shofarInterrupted = true;
    playerPlaying = false;
    audio.pause();
    renderChip();
    reportNowPlaying();
  });
  window.addEventListener("hq:shofar-end", () => {
    shofarActive = false;
    if (!shofarInterrupted) return;
    if (isKodeshActive()) {
      playbackError = "Playback is paused during Shabbat/Yom Tov";
      stopPlayback();
      return;
    }
    shofarInterrupted = false;
    resumePlayback();
  });

  if (typeof window.App?.on === "function") {
    window.App.on("data", () => {
      if (playerPlaying && isKodeshActive()) {
        playbackError = "Playback is paused during Shabbat/Yom Tov";
        stopPlayback();
      }
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateMusicState();
  });

  const musicViewState = {
    root: null,
    tab: "home",
    tiles: [],
    sections: [],
    page: 1,
    hasMore: false,
    detail: null,
    search: "",
    loading: false
  };
  const musicTabs = [
    ["home", "Home"],
    ["artist", "Artists"],
    ["collection", "Albums"],
    ["playlist", "Playlists"],
    ["category", "Categories"],
    ["search", "Search"],
    ["library", "Library"]
  ];

  function musicViewEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function musicViewIcon(name) {
    return musicIcon(name).replace('class="music-chip__icon"', 'class="music-view-icon"');
  }

  function musicViewTile(tile, index) {
    const image = tile.img
      ? `<img src="${musicViewEscape(tile.img)}" alt="" draggable="false" loading="lazy">`
      : `<span class="music-view-placeholder">${musicViewIcon("note")}</span>`;
    const isTrack = tile.kind === "track" || tile.kind === "content" || tile.kind === "music";
    return `<button class="music-view-tile" type="button" data-view-track="${isTrack ? "1" : "0"}" data-view-index="${index}" data-view-id="${musicViewEscape(tile.id)}" data-view-kind="${musicViewEscape(tile.kind || "playlist")}" data-view-title="${musicViewEscape(tile.title || "Untitled")}" data-view-artist="${musicViewEscape(tile.subtitle || "")}" data-view-img="${musicViewEscape(tile.img || "")}">${image}<span class="music-view-tile-copy"><strong>${musicViewEscape(tile.title || "Untitled")}</strong><small>${musicViewEscape(tile.subtitle || "")}</small></span></button>`;
  }

  function renderMusicPlayer() {
    const root = musicViewState.root?.querySelector("[data-music-view-player]");
    if (!root) return;
    const tracks = Array.isArray(musicState?.queue) ? musicState.queue : [];
    const index = Number(musicState?.index) || activeIndex;
    const track = tracks[index] || activeTrack || {};
    const cover = track.img
      ? `<img class="music-view-art" src="${musicViewEscape(track.img)}" alt="" draggable="false">`
      : `<div class="music-view-art music-view-placeholder">${musicViewIcon("note")}</div>`;
    const nextTracks = tracks.slice(index + 1);
    const progress = audio.duration ? Math.round((audio.currentTime / audio.duration) * 100) : 0;
    root.innerHTML = `<div class="music-view-now">${cover}<div class="music-view-copy"><small>NOW PLAYING</small><h1>${musicViewEscape(track.title || "Choose something to play")}</h1><p>${musicViewEscape(track.artist || track.subtitle || "")}</p></div><input class="music-view-progress" data-music-seek type="range" min="0" max="100" value="${progress}" aria-label="Track progress"><div class="music-view-controls"><button type="button" data-player-action="prev" aria-label="Previous">${musicViewIcon("prev")}</button><button type="button" data-player-action="toggle" aria-label="Play or pause">${musicViewIcon(playerPlaying ? "pause" : "play")}</button><button type="button" data-player-action="next" aria-label="Next">${musicViewIcon("next")}</button></div><label class="music-view-volume">Volume<input type="range" data-player-volume min="0" max="100" value="${Number(musicState?.volume ?? 70)}" aria-label="Volume"></label><h2>Up next</h2><div class="music-view-upnext">${nextTracks.length ? nextTracks.map((item, nextIndex) => `<button type="button" data-player-queue="${index + nextIndex + 1}">${musicViewEscape(item.title || "Untitled")}<small>${musicViewEscape(item.artist || "")}</small></button>`).join("") : `<p>${tracks.length ? "End of queue" : "Your queue will appear here."}</p>`}</div>${playbackError ? `<p class="music-view-error">${musicViewEscape(playbackError)}</p>` : ""}</div>`;
  }

  function renderMusicBrowser() {
    const root = musicViewState.root?.querySelector("[data-music-view-browser]");
    if (!root) return;
    const activeLabel = musicTabs.find(([id]) => id === musicViewState.tab)?.[1] || "Music";
    let content = "";
    if (musicViewState.tab === "search") {
      content = `<form class="music-view-search" data-music-search><input type="search" name="keyword" data-music-search-input value="${musicViewEscape(musicViewState.search)}" placeholder="Search artists, albums and songs" aria-label="Search 24six"><button type="submit">Search</button></form><div class="music-view-keyboard" data-music-keyboard aria-label="On-screen keyboard">${["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map((row) => `<div>${Array.from(row).map((key) => `<button type="button" data-soft-key="${key}">${key}</button>`).join("")}</div>`).join("")}<div class="music-view-keyboard-actions"><button type="button" data-soft-key="space">Space</button><button type="button" data-soft-key="backspace">⌫</button><button type="button" data-soft-key="clear">Clear</button></div></div>`;
    }
    if (musicViewState.detail) {
      const detail = musicViewState.detail;
      const tracks = detail.tiles || [];
      content = `<button type="button" class="music-view-back" data-view-back>‹ Back</button><h2>${musicViewEscape(detail.title || "Music")}</h2><button type="button" class="music-view-play-all" data-view-play-all>Play all</button><div class="music-view-tracklist">${tracks.map((track, index) => `<button type="button" data-view-detail-track="${index}"><span>${index + 1}</span><strong>${musicViewEscape(track.title || "Untitled")}</strong><small>${musicViewEscape(track.subtitle || "")}</small>${musicViewIcon("play")}</button>`).join("")}</div>`;
    } else if (musicViewState.tab === "home" && musicViewState.sections.length) {
      content += musicViewState.sections.map((section) => `<section class="music-view-shelf"><h2>${musicViewEscape(section.title)}</h2><div class="music-view-grid">${(section.tiles || []).map(musicViewTile).join("")}</div></section>`).join("");
    } else {
      content += `<div class="music-view-grid">${musicViewState.tiles.map(musicViewTile).join("")}</div>`;
      if (musicViewState.hasMore) content += `<button type="button" class="music-view-more" data-view-more>Load more</button>`;
      if (!musicViewState.tiles.length && !musicViewState.loading) content += `<p class="music-view-empty">No music found.</p>`;
    }
    root.innerHTML = `<header class="music-view-heading"><p>24six</p><h2>${musicViewEscape(activeLabel)}</h2></header><nav class="music-view-tabs" aria-label="Music catalog">${musicTabs.map(([id, label]) => `<button type="button" data-view-tab="${id}" class="${musicViewState.tab === id ? "is-active" : ""}">${label}</button>`).join("")}</nav><div class="music-view-content" data-music-view-content>${content}</div>`;
  }

  async function fetchMusicBrowse(tab, page = 1, keyword = "") {
    musicViewState.loading = true;
    musicViewState.tab = tab;
    musicViewState.page = page;
    musicViewState.detail = null;
    renderMusicBrowser();
    try {
      let result;
      if (tab === "home") {
        result = await fetch("/api/music/home", { cache: "no-store" }).then((response) => response.json());
        musicViewState.sections = result.sections || [];
        musicViewState.tiles = [];
        musicViewState.hasMore = false;
      } else if (tab === "library") {
        result = await fetch("/api/music/library", { cache: "no-store" }).then((response) => response.json());
        musicViewState.tiles = result.tiles || [];
        musicViewState.hasMore = false;
      } else if (tab === "search") {
        musicViewState.search = keyword;
        result = await fetch("/api/music/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: keyword }) }).then((response) => response.json());
        musicViewState.tiles = result.tiles || [];
        musicViewState.hasMore = false;
      } else {
        const params = new URLSearchParams({ page: String(page) });
        if (keyword) params.set("keyword", keyword);
        result = await fetch(`/api/music/browse/${tab}?${params}`, { cache: "no-store" }).then((response) => response.json());
        musicViewState.tiles = page > 1 ? [...musicViewState.tiles, ...(result.tiles || [])] : result.tiles || [];
        musicViewState.hasMore = !!result.hasMore;
      }
    } catch (_) {
      musicViewState.tiles = [];
      musicViewState.sections = [];
      musicViewState.hasMore = false;
    }
    musicViewState.loading = false;
    renderMusicBrowser();
  }

  async function openMusicDetail(kind, id, title) {
    try {
      const response = await fetch(`/api/music/list/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, { cache: "no-store" });
      const result = await response.json();
      musicViewState.detail = { kind, id, title, tiles: result.tiles || [] };
    } catch (_) {
      musicViewState.detail = { title, tiles: [] };
    }
    renderMusicBrowser();
  }

  async function persistMusicCommand(commandQueue, index, command = "play", argument = index) {
    try {
      let response = await fetch("/api/state/music", { cache: "no-store" });
      let current = await response.json();
      const next = {
        target: frameLabel,
        queue: commandQueue,
        index,
        playing: command === "pause" || command === "stop" ? false : command === "volume" ? !!musicState?.playing : true,
        volume: command === "volume" ? Number(argument) : Number(musicState?.volume ?? 70),
        seq: (Number(musicState?.seq) || 0) + 1,
        cmd: command,
        arg: argument,
        at: new Date().toISOString()
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        response = await fetch("/api/state/music", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ json: next, base: Number(current.updated) || 0 })
        });
        const result = await response.json();
        if (response.status === 409) {
          current = result;
          continue;
        }
        if (!response.ok) throw new Error(result.error || "Could not update playback");
        musicState = next;
        musicVersion = Number(result.updated) || musicVersion;
        safeStorageSet(sequenceKey, next.seq);
        applyCommand(next);
        renderMusicPlayer();
        return;
      }
    } catch (error) {
      playbackError = error.message || "Could not update playback";
      renderMusicPlayer();
    }
  }

  function buildMusicView(element) {
    musicViewState.root = element;
    element.innerHTML = `<div class="music-view"><section class="music-view-player" data-music-view-player></section><section class="music-view-browser" data-music-view-browser></section></div>`;
    element.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.softKey) {
        const input = element.querySelector("[data-music-search-input]");
        if (input) {
          const key = button.dataset.softKey;
          if (key === "space") input.value += " ";
          else if (key === "backspace") input.value = input.value.slice(0, -1);
          else if (key === "clear") input.value = "";
          else input.value += key;
          musicViewState.search = input.value;
        }
        return;
      }
      if (button.dataset.viewTab) return fetchMusicBrowse(button.dataset.viewTab, 1);
      if (button.hasAttribute("data-view-more")) return fetchMusicBrowse(musicViewState.tab, musicViewState.page + 1);
      if (button.hasAttribute("data-view-back")) {
        musicViewState.detail = null;
        return renderMusicBrowser();
      }
      if (button.dataset.viewTrack === "1") {
        const tile = { id: Number(button.dataset.viewId), title: button.dataset.viewTitle, artist: button.dataset.viewArtist, img: button.dataset.viewImg };
        return persistMusicCommand([tile], 0);
      }
      if (button.dataset.viewId) return openMusicDetail(button.dataset.viewKind, button.dataset.viewId, button.dataset.viewTitle);
      if (button.hasAttribute("data-view-play-all")) {
        const tracks = (musicViewState.detail?.tiles || []).filter((tile) => tile.kind === "track").map((tile) => ({ id: tile.id, title: tile.title, artist: tile.subtitle, img: tile.img }));
        if (tracks.length) return persistMusicCommand(tracks, 0);
      }
      if (button.dataset.viewDetailTrack != null) {
        const tracks = (musicViewState.detail?.tiles || []).filter((tile) => tile.kind === "track").map((tile) => ({ id: tile.id, title: tile.title, artist: tile.subtitle, img: tile.img }));
        if (tracks.length) return persistMusicCommand(tracks, Number(button.dataset.viewDetailTrack));
      }
      if (button.dataset.playerAction === "toggle") return persistMusicCommand(musicState?.queue || [], Number(musicState?.index) || 0, playerPlaying ? "pause" : "resume");
      if (button.dataset.playerAction === "next") return persistMusicCommand(musicState?.queue || [], Number(musicState?.index) || 0, "next");
      if (button.dataset.playerAction === "prev") return persistMusicCommand(musicState?.queue || [], Number(musicState?.index) || 0, "prev");
      if (button.dataset.playerQueue != null) return persistMusicCommand(musicState?.queue || [], Number(button.dataset.playerQueue), "play", Number(button.dataset.playerQueue));
    });
    element.addEventListener("submit", (event) => {
      if (!event.target.matches("[data-music-search]")) return;
      event.preventDefault();
      const keyword = new FormData(event.target).get("keyword").toString().trim();
      fetchMusicBrowse("search", 1, keyword);
    });
    element.addEventListener("input", (event) => {
      if (event.target.matches("[data-player-volume]")) {
        setVolume(event.target.value);
        persistMusicCommand(musicState?.queue || [], Number(musicState?.index) || 0, "volume", Number(event.target.value));
      }
      if (event.target.matches("[data-music-seek]") && audio.duration) {
        audio.currentTime = audio.duration * Number(event.target.value) / 100;
      }
    });
    element.addEventListener("scroll", (event) => {
      const panel = event.target.closest("[data-music-view-content]");
      if (panel && panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 180 && musicViewState.hasMore && !musicViewState.loading) {
        fetchMusicBrowse(musicViewState.tab, musicViewState.page + 1);
      }
    }, true);
    element.addEventListener("dragstart", (event) => event.preventDefault(), true);
    element.classList.toggle("is-kodesh", !!window.App?.kodeshActive);
    element.dataset.musicBuilt = "true";
    renderMusicPlayer();
    fetchMusicBrowse("home");
  }

  if (typeof window.App?.register === "function") {
    window.App.register("music", {
      show: (element) => {
        if (element.dataset.musicBuilt !== "true") buildMusicView(element);
        else {
          musicViewState.root = element;
          renderMusicPlayer();
          renderMusicBrowser();
        }
      },
      resume: () => renderMusicPlayer(),
      hide: () => {}
    });
    window.App.on("data", () => {
      const root = document.getElementById("view-music");
      if (root) root.classList.toggle("is-kodesh", !!window.App.kodeshActive);
    });
  }

  loadNowVersion().then(() => {
    updateMusicState().finally(schedulePoll);
  });
  setInterval(() => {
    if (playerPlaying && isKodeshActive()) {
      playbackError = "Playback is paused during Shabbat/Yom Tov";
      stopPlayback();
    } else if (playerPlaying) {
      reportNowPlaying();
    }
  }, 5000);
  renderChip();
})();
