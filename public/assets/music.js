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
  let playQueue = [];
  let activeIndex = 0;
  let activeTrack = null;
  let currentStreamUrl = "";
  let currentHls = null;
  let playbackError = "";
  let playerPlaying = false;
  let shofarInterrupted = false;
  let shofarActive = false;
  let musicViewActive = false;
  let chipDismissed = false;
  let retryUsed = false;
  let pollTimer = 0;
  let hlsLoading = null;

  function musicIcon(name) {
    const paths = {
      play: '<path d="m8 5 12 7-12 7z"/>',
      pause: '<path d="M8 5v14M16 5v14"/>',
      next: '<path d="M5 5v14l11-7z"/><path d="M19 5v14"/>',
      prev: '<path d="M19 5v14L8 12z"/><path d="M5 5v14"/>',
      shuffle: '<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h2.5a5 5 0 0 0 4-2l7-10a5 5 0 0 1 4-2H22"/><path d="M2 6h2.5a5 5 0 0 1 4 2l7 10a5 5 0 0 0 4 2H22"/>',
      close: '<path d="m18 6-12 12M6 6l12 12"/>',
      back: '<path d="m15 18-6-6 6-6"/>',
      note: '<path d="M17.7257 7.64472L7.03615 0.62549C4.7697 -0.65996 1.89435 0.134989 0.608897 2.40144C0.202966 3.11182 0 3.90677 0 4.73555V18.774C0 21.3787 2.09731 23.493 4.70204 23.493C5.5139 23.493 6.32577 23.29 7.03615 22.8841L17.7426 15.8648C20.009 14.5794 20.804 11.6871 19.5185 9.42067C19.0957 8.67647 18.4699 8.06757 17.7257 7.64472ZM6.93466 18.8586C6.93466 20.1271 5.91984 21.1419 4.6513 21.1419C3.38276 21.1419 2.36793 20.1271 2.36793 18.8586V7.78003H4.90501C6.02132 7.78003 6.93466 8.69338 6.93466 9.80969V18.8586ZM4.6513 6.93434C3.38276 6.93434 2.36793 5.91951 2.36793 4.65098C2.36793 3.38244 3.38276 2.36761 4.6513 2.36761C5.91984 2.36761 6.93466 3.38244 6.93466 4.65098C6.93466 5.91951 5.91984 6.93434 4.6513 6.93434ZM12.3471 15.3067C12.3471 16.5752 11.3323 17.59 10.0637 17.59C8.79518 17.59 7.78036 16.5752 7.78036 15.3067V13.3616C7.78036 12.2453 8.6937 11.3319 9.81001 11.3319H12.3471V15.3067ZM10.0637 10.4862C8.79518 10.4862 7.78036 9.47142 7.78036 8.20288C7.78036 6.93434 8.79518 5.91951 10.0637 5.91951C11.3323 5.91951 12.3471 6.93434 12.3471 8.20288C12.3471 9.47142 11.3323 10.4862 10.0637 10.4862ZM15.4761 14.0381C14.2076 14.0381 13.1928 13.0233 13.1928 11.7548C13.1928 10.4862 14.2076 9.47142 15.4761 9.47142C16.7447 9.47142 17.7595 10.4862 17.7595 11.7548C17.7595 13.0233 16.7447 14.0381 15.4761 14.0381Z" fill="#FFB84A" stroke="none" transform="translate(3.2 1.9) scale(0.84)"/>'
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
    `<button class="music-chip__button" type="button" data-music-next aria-label="Next track">${musicIcon("next")}</button>` +
    `<button class="music-chip__button music-chip__button--secondary" type="button" data-music-close aria-label="Close player">${musicIcon("close")}</button>`;
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
    return playQueue;
  }

  function shuffledQueue(tracks, keepIndex) {
    const shuffled = Array.isArray(tracks) ? tracks.slice() : [];
    const hasFirst = Number.isInteger(keepIndex) && keepIndex >= 0 && keepIndex < shuffled.length;
    const first = hasFirst ? shuffled.splice(keepIndex, 1)[0] : null;
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    return hasFirst ? [first, ...shuffled] : shuffled;
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
    chip.hidden = tracks.length === 0 || musicViewActive || chipDismissed;
    const track = currentTrack();
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
    renderMusicPlayer();
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
    if (!button) {
      if (typeof window.App?.go === "function") window.App.go("music");
      return;
    }
    if (button.hasAttribute("data-music-close")) {
      stopCurrentPlayback(true);
    } else if (button.hasAttribute("data-music-next")) {
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

  function stopCurrentPlayback(dismissChip = false) {
    if (playerPlaying) logTrack(currentTrack(), Number(audio.currentTime) || 0);
    if (dismissChip) chipDismissed = true;
    stopPlayback();
  }

  async function loadAndPlay(index, retry = false) {
    chipDismissed = false;
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
    chipDismissed = false;
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
      loadAndPlay(activeIndex);
    }
  }

  function advanceTrack(direction, logCurrent) {
    if (!queue().length) return;
    chipDismissed = false;
    if (logCurrent) logTrack(currentTrack(), Number(audio.currentTime) || 0);
    loadAndPlay(activeIndex + direction);
  }

  function applyCommand(command) {
    const argument = command.arg;
    switch (command.cmd) {
      case "play":
        loadAndPlay(Number.isFinite(Number(argument)) ? Number(argument) : Number(command.index) || 0);
        break;
      case "shuffle":
        activeIndex = Number(command.index) || 0;
        activeTrack = playQueue[activeIndex];
        renderChip();
        reportNowPlaying();
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
        stopCurrentPlayback();
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
      const firstLoad = musicVersion === null;
      musicVersion = Number(stateResult.updated) || nextVersion;
      musicState = stateResult.json && typeof stateResult.json === "object" ? stateResult.json : null;
      if (!musicState) {
        renderChip();
        return;
      }
      const targetMatches = musicState.target === "both" || musicState.target === frameLabel;
      const sequence = Number(musicState.seq) || 0;
      const lastSequence = Number(safeStorageGet(sequenceKey)) || 0;
      if (targetMatches && sequence > lastSequence) {
        playQueue = Array.isArray(musicState.queue) ? musicState.queue.slice() : [];
        safeStorageSet(sequenceKey, sequence);
        applyCommand(musicState);
      } else if (firstLoad && targetMatches && playQueue.length === 0) {
        playQueue = Array.isArray(musicState.queue) ? musicState.queue.slice() : [];
        const sharedIndex = Number(musicState.index);
        activeIndex = Number.isInteger(sharedIndex) && sharedIndex >= 0 ? sharedIndex : 0;
        activeTrack = playQueue[activeIndex] || null;
      }
      renderChip();
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

  function musicViewDuration(value) {
    const formatted = String(value ?? "").trim();
    if (/^\d{1,3}:\d{2}$/.test(formatted)) return formatted;
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return "";
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
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
    const tracks = queue();
    const index = activeIndex;
    const track = activeTrack || tracks[index] || {};
    const cover = track.img
      ? `<img class="music-view-art" src="${musicViewEscape(track.img)}" alt="" draggable="false">`
      : `<div class="music-view-art music-view-placeholder">${musicViewIcon("note")}</div>`;
    const nextTracks = tracks.slice(index + 1);
    const progress = audio.duration ? Math.round((audio.currentTime / audio.duration) * 100) : 0;
    const queuedTracks = nextTracks.length
      ? nextTracks.map((item, nextIndex) => `<button type="button" data-player-queue="${index + nextIndex + 1}">${musicViewEscape(item.title || "Untitled")}<small>${musicViewEscape(item.artist || "")}</small></button>`).join("")
      : `<p>${tracks.length ? "End of queue" : "Your queue will appear here."}</p>`;
    root.innerHTML = `<div class="music-view-now">${cover}<div class="music-view-copy"><small>NOW PLAYING</small><h1>${musicViewEscape(track.title || "Choose something to play")}</h1><p>${musicViewEscape(track.artist || track.subtitle || "")}</p></div></div><input class="music-view-progress" data-music-seek type="range" min="0" max="100" value="${progress}" aria-label="Track progress"><div class="music-view-controls"><button type="button" class="${musicState?.shuffle ? "is-on" : ""}" data-player-action="shuffle" aria-label="Shuffle" aria-pressed="${!!musicState?.shuffle}"${tracks.length ? "" : " disabled"}>${musicViewIcon("shuffle")}</button><button type="button" data-player-action="prev" aria-label="Previous">${musicViewIcon("prev")}</button><button type="button" data-player-action="toggle" aria-label="Play or pause">${musicViewIcon(playerPlaying ? "pause" : "play")}</button><button type="button" data-player-action="next" aria-label="Next">${musicViewIcon("next")}</button></div><label class="music-view-volume">Volume<input type="range" data-player-volume min="0" max="100" value="${Number(musicState?.volume ?? 70)}" aria-label="Volume"></label><section class="music-view-queue"><h2>Up next</h2><div class="music-view-upnext">${queuedTracks}</div></section>${playbackError ? `<p class="music-view-error">${musicViewEscape(playbackError)}</p>` : ""}`;
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
      const playableTracks = tracks.filter((track) => track.kind === "track");
      content = `<div class="music-view-detail-heading"><button type="button" class="music-view-back" data-view-back>${musicViewIcon("back")}<span>Back</span></button><h2>${musicViewEscape(detail.title || "Music")}</h2><button type="button" class="music-view-play-all" data-view-play-all>Play all</button></div><div class="music-view-tracklist">${playableTracks.map((track, index) => {
        const cover = track.img
          ? `<img class="music-view-track-cover" src="${musicViewEscape(track.img)}" alt="" draggable="false">`
          : `<span class="music-view-track-cover music-view-track-cover--empty">${musicViewIcon("note")}</span>`;
        return `<button type="button" data-view-detail-track="${index}" aria-label="Play ${musicViewEscape(track.title || "Untitled")}"><span class="music-view-track-number">${index + 1}</span>${cover}<span class="music-view-track-copy"><strong>${musicViewEscape(track.title || "Untitled")}</strong><small>${musicViewEscape(track.subtitle || "")}</small></span><span class="music-view-duration">${musicViewDuration(track.length)}</span><span class="music-view-track-play">${musicViewIcon("play")}</span></button>`;
      }).join("")}</div>`;
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
      const isCurrentQueue = commandQueue === playQueue;
      let nextQueue = Array.isArray(commandQueue) ? commandQueue.slice() : [];
      let nextIndex = index;
      let nextArgument = command === "play" && argument == null ? 0 : argument;
      let shuffle = !!musicState?.shuffle;
      let unshuffled = Array.isArray(musicState?.unshuffled) ? musicState.unshuffled.slice() : null;
      if (command === "shuffle") {
        const currentTrackId = currentTrack()?.id;
        if (argument) {
          unshuffled = queue().slice();
          nextQueue = shuffledQueue(unshuffled, activeIndex);
          nextIndex = 0;
          shuffle = true;
        } else {
          nextQueue = Array.isArray(musicState?.unshuffled) ? musicState.unshuffled.slice() : queue().slice();
          const restoredIndex = currentTrackId == null ? -1 : nextQueue.findIndex((track) => String(track?.id) === String(currentTrackId));
          nextIndex = restoredIndex >= 0 ? restoredIndex : 0;
          unshuffled = null;
          shuffle = false;
        }
        nextArgument = !!argument;
      } else if (command === "play" && shuffle && !isCurrentQueue) {
        unshuffled = nextQueue.slice();
        nextQueue = shuffledQueue(unshuffled, argument == null ? null : Number(index));
        nextIndex = 0;
        nextArgument = 0;
      }
      const next = {
        target: frameLabel,
        queue: nextQueue,
        index: nextIndex,
        playing: command === "shuffle" ? playerPlaying : command === "pause" || command === "stop" ? false : command === "volume" || command === "seek" ? !!musicState?.playing : true,
        volume: command === "volume" ? Number(argument) : Number(musicState?.volume ?? 70),
        shuffle,
        seq: (Number(current.json?.seq) || Number(musicState?.seq) || 0) + 1,
        cmd: command,
        arg: nextArgument,
        at: new Date().toISOString()
      };
      if (shuffle && Array.isArray(unshuffled)) next.unshuffled = unshuffled;
      for (let attempt = 0; attempt < 2; attempt++) {
        response = await fetch("/api/state/music", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ json: next, base: Number(current.updated) || 0 })
        });
        const result = await response.json();
        if (response.status === 409 && attempt === 0) {
          current = result;
          next.seq = (Number(result.json?.seq) || 0) + 1;
          continue;
        }
        if (!response.ok) throw new Error(result.error || "Could not update playback");
        musicState = next;
        musicVersion = Number(result.updated) || musicVersion;
        safeStorageSet(sequenceKey, next.seq);
        playQueue = nextQueue.slice();
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
        if (tracks.length) return persistMusicCommand(tracks, 0, "play", null);
      }
      if (button.dataset.viewDetailTrack != null) {
        const tracks = (musicViewState.detail?.tiles || []).filter((tile) => tile.kind === "track").map((tile) => ({ id: tile.id, title: tile.title, artist: tile.subtitle, img: tile.img }));
        if (tracks.length) return persistMusicCommand(tracks, Number(button.dataset.viewDetailTrack));
      }
      if (button.dataset.playerAction === "shuffle") return persistMusicCommand(queue(), activeIndex, "shuffle", !musicState?.shuffle);
      if (button.dataset.playerAction === "toggle") return persistMusicCommand(queue(), activeIndex, playerPlaying ? "pause" : "resume");
      if (button.dataset.playerAction === "next") return persistMusicCommand(queue(), activeIndex, "next");
      if (button.dataset.playerAction === "prev") return persistMusicCommand(queue(), activeIndex, "prev");
      if (button.dataset.playerQueue != null) return persistMusicCommand(queue(), Number(button.dataset.playerQueue), "play", Number(button.dataset.playerQueue));
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
      }
      if (event.target.matches("[data-music-seek]") && audio.duration) {
        audio.currentTime = audio.duration * Number(event.target.value) / 100;
      }
    });
    element.addEventListener("change", (event) => {
      if (event.target.matches("[data-player-volume]")) {
        persistMusicCommand(queue(), activeIndex, "volume", Number(event.target.value));
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
        musicViewActive = true;
        renderChip();
        if (element.dataset.musicBuilt !== "true") buildMusicView(element);
        else {
          musicViewState.root = element;
          renderMusicPlayer();
          renderMusicBrowser();
        }
      },
      resume: () => {
        musicViewActive = true;
        renderChip();
        renderMusicPlayer();
      },
      hide: () => {
        musicViewActive = false;
        renderChip();
      }
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
