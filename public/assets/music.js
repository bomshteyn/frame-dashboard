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
