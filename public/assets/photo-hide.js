// Hide a photo from all frames (frame: Photos view button or long-press on the screensaver;
// phone page: Hidden photos list with Unhide).
(function () {
  var EYE_OFF = '<path d="M3 3l18 18"/><path d="M10.6 6.1A10.5 10.5 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3.2 3.7M6.6 6.6C4.3 8.2 3 12 3 12s4 6 9 6c1.5 0 2.9-.4 4.1-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';
  function icon(size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + EYE_OFF + "</svg>";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function baseId(src) {
    return String(src || "").replace(/=[A-Za-z0-9-]*$/, "");
  }
  function post(path, body) {
    return fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || "Request failed");
        return j;
      });
    });
  }
  function css(text) {
    var s = document.createElement("style");
    s.textContent = text;
    document.head.appendChild(s);
  }

  if (document.getElementById("mApp")) return phone();
  if (!document.getElementById("ambient")) return;

  document.addEventListener("dragstart", function (e) { e.preventDefault(); }, true);
  css(
    "#stage img{-webkit-user-drag:none;user-drag:none;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}#ambient{touch-action:none}" +
    ".hh-layer{position:absolute;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62)}" +
    ".hh-card{background:var(--paper,#f2eee6);color:var(--ink,#1d1d1b);border-radius:28px;padding:34px 36px 30px;width:760px;max-width:92%;box-shadow:0 30px 80px rgba(0,0,0,.4)}" +
    ".hh-card h2{margin:0 0 8px;font-size:46px;line-height:1}.hh-card p{margin:0 0 22px;font-size:19px;opacity:.75}" +
    ".hh-list{display:flex;gap:18px;justify-content:center;margin-bottom:24px}" +
    ".hh-item{flex:1;max-width:300px;display:flex;flex-direction:column;gap:12px}" +
    ".hh-item img{width:100%;height:230px;object-fit:cover;border-radius:16px;background:#0002}" +
    ".hh-item .btn{width:100%}.hh-actions{display:flex;justify-content:center}" +
    ".hh-danger{background:#bd241c!important;border-color:#bd241c!important;color:#fff!important}"
  );

  var shows = [];
  var proto = window.App && App.Slideshow && App.Slideshow.prototype;
  if (proto) {
    var take = proto.take, render = proto.render;
    proto.take = function (filter) {
      return take.call(this, function (p) { return !p._hidden && (!filter || filter(p)); });
    };
    proto.render = function (e) {
      if (shows.indexOf(this) < 0) shows.push(this);
      return render.apply(this, arguments);
    };
  }

  function shownPhotos(stage) {
    var slide = stage && stage.lastElementChild;
    var seen = {};
    var list = [];
    var srcs = slide ? Array.prototype.map.call(slide.querySelectorAll("img:not(.blurfill)"), function (i) { return i.getAttribute("src"); }) : [];
    var all = (App.state && App.state.photos) || [];
    srcs.forEach(function (src) {
      var id = baseId(src);
      if (!id || seen[id]) return;
      seen[id] = 1;
      var photo = all.filter(function (p) { return baseId(p.src) === id; })[0];
      list.push(photo || { src: src, tag: "main" });
    });
    return list;
  }

  var layer = null;
  function close() {
    if (layer) layer.remove();
    layer = null;
  }
  function open(stage) {
    if (layer) return;
    if (App.kodeshActive) return App.toast("Editing is disabled during Shabbat/Yom Tov", { ms: 3000 });
    var photos = shownPhotos(stage);
    if (!photos.length) return;
    layer = document.createElement("div");
    layer.className = "hh-layer";
    layer.innerHTML =
      '<div class="hh-card" role="dialog" aria-modal="true" aria-label="Hide photo"><h2 class="serif">Hide ' + (photos.length > 1 ? "a photo" : "this photo") + " from the frame?</h2>" +
      "<p>It won't show on any frame again. It stays in Google Photos. You can unhide it from the phone page (Frame tab → Hidden photos).</p>" +
      '<div class="hh-list">' +
      photos.map(function (p, i) {
        return '<div class="hh-item"><img src="' + esc(p.src) + '" alt=""><button class="btn btn--solid hh-danger" data-hh-hide="' + i + '">' + icon(22) + (photos.length > 1 ? "Hide this one" : "Hide photo") + "</button></div>";
      }).join("") +
      '</div><div class="hh-actions"><button class="btn btn--ghost" data-hh-cancel>Cancel</button></div></div>';
    document.getElementById("stage").appendChild(layer);
    layer.addEventListener("click", function (e) {
      e.stopPropagation();
      if (App.resetIdle) App.resetIdle();
      var b = e.target.closest("button");
      if (e.target === layer || (b && b.hasAttribute("data-hh-cancel"))) return close();
      if (!b || !b.hasAttribute("data-hh-hide") || b.disabled) return;
      var photo = photos[Number(b.dataset.hhHide)];
      b.disabled = true;
      b.lastChild.textContent = "Hiding…";
      post("/api/photos/hide", { album: photo.tag === "shabbat" ? "shabbat" : "main", src: photo.src }).then(function () {
        hideLocally(photo);
        close();
        App.toast("Photo hidden from the frame", { icon: "check", ms: 3000 });
      }).catch(function (err) {
        b.disabled = false;
        b.lastChild.textContent = "Try again";
        App.toast(esc(err.message), { ms: 3500 });
      });
    });
  }
  function hideLocally(photo) {
    var id = baseId(photo.src);
    var all = (App.state && App.state.photos) || [];
    all.forEach(function (p) { if (baseId(p.src) === id) p._hidden = true; });
    if (App.state && App.state.photos) App.state.photos = all.filter(function (p) { return !p._hidden; });
    shows.forEach(function (s) {
      var cur = s.current && s.current.photos;
      if (cur && cur.some(function (p) { return p && p._hidden; })) {
        s.history = [];
        if (s.timer) s.next();
        else s.current = null;
      }
    });
    App.emit("data", { photos: true });
  }

  // Photos view: "Hide" button next to Favourite.
  var view = document.getElementById("view-photos");
  function addButton() {
    var bar = view.querySelector(".ph-bottom");
    if (!bar || bar.querySelector("[data-hh-open]")) return;
    var fav = bar.querySelector("[data-fav]");
    var b = document.createElement("button");
    b.className = "ph-btn";
    b.setAttribute("data-hh-open", "");
    b.innerHTML = icon(28) + "<span>Hide</span>";
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      open(view.querySelector(".ph-stage"));
    });
    bar.insertBefore(b, fav ? fav.nextSibling : null);
  }
  new MutationObserver(addButton).observe(view, { childList: true });
  addButton();

  // Screensaver: a tap still wakes the dashboard; press and hold 1s to hide the photo.
  var amb = document.getElementById("ambient");
  var holdTimer = null, held = false, startX = 0, startY = 0;
  function cancelHold() { clearTimeout(holdTimer); holdTimer = null; }
  amb.addEventListener("pointerdown", function (e) {
    held = false;
    startX = e.clientX; startY = e.clientY;
    cancelHold();
    holdTimer = setTimeout(function () {
      holdTimer = null;
      held = true;
      open(amb.querySelector(".amb-stage"));
    }, 1000);
  });
  amb.addEventListener("pointermove", function (e) {
    if (holdTimer && Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 24) cancelHold();
  });
  amb.addEventListener("pointerup", cancelHold);
  amb.addEventListener("pointercancel", cancelHold);
  amb.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    if (!holdTimer) return;
    cancelHold();
    held = true;
    open(amb.querySelector(".amb-stage"));
  });
  amb.addEventListener("click", function (e) {
    if (held) {
      held = false;
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
  if (App.on) App.on("mode", close);

  function phone() {
    var list = null, loading = false, error = "", selected = null;
    css(
      ".m-hh-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}" +
      ".m-hh-thumb{position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;padding:0;background:var(--paper-2)}" +
      ".m-hh-thumb img{width:100%;height:100%;object-fit:cover;display:block}" +
      ".m-hh-action-backdrop{position:fixed;inset:0;z-index:60;background:rgba(31,35,30,.4);display:grid;align-items:end;padding:16px}" +
      ".m-hh-action{width:min(440px,100%);margin:0 auto;background:var(--card);border-radius:24px;padding:16px;box-shadow:0 16px 48px rgba(0,0,0,.18)}" +
      ".m-hh-action img{display:block;width:min(220px,70vw);aspect-ratio:1;object-fit:cover;border-radius:16px;margin:0 auto 14px}" +
      ".m-hh-action button,.m-hh-action a{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;margin-top:8px;border-radius:14px;text-decoration:none}"
    );
    function body() {
      if (error) return '<div class="m-empty">' + esc(error) + "</div>";
      if (!list) return '<div class="m-empty">Loading…</div>';
      if (!list.length) return '<div class="m-empty">No hidden photos.</div>';
      var grid = '<div class="m-hh-grid">' + list.map(function (p, index) {
        return '<button type="button" class="m-hh-thumb" data-hh-select="' + index + '" aria-label="View hidden photo"><img src="' + esc(p.src) + '" alt="" loading="lazy"></button>';
      }).join("") + "</div>";
      if (!selected) return grid;
      var link = selected.googlePhotosUrl || selected.google_photos_url || selected.link || selected.url || "";
      return grid + '<div class="m-hh-action-backdrop" data-hh-overlay><section class="m-hh-action" role="dialog" aria-modal="true" aria-label="Hidden photo actions">' +
        '<img src="' + esc(selected.src) + '" alt="">' +
        '<button type="button" class="m-btn m-btn--solid" data-write data-hh-unhide="' + esc(selected.id) + '" data-hh-album="' + esc(selected.album) + '">Unhide</button>' +
        (link ? '<a class="m-btn" href="' + esc(link) + '" target="_blank" rel="noopener">Open in Google Photos</a>' : "") +
        '<button type="button" class="m-btn" data-hh-cancel>Cancel</button></section></div>';
    }
    function paint() {
      var el = document.querySelector("[data-hh-body]");
      if (el) el.innerHTML = body();
      document.dispatchEvent(new Event("hq:hidden-updated"));
    }
    function load() {
      if (loading) return;
      loading = true;
      fetch("/api/photos/hidden", { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("Couldn't load hidden photos");
        return r.json();
      }).then(function (j) {
        list = j.photos || [];
        error = "";
      }).catch(function (e) {
        error = e.message;
      }).then(function () {
        loading = false;
        paint();
      });
    }
    window.HQHidden = {
      html: function () {
        if (!list && !error) setTimeout(load);
        return '<p class="m-muted">These photos stay in Google Photos but are hidden from the frames.</p><div data-hh-body>' + body() + "</div>";
      },
      count: function () { if (!list && !loading && !error) load(); return list ? list.length : 0; },
      load: load,
    };
    document.addEventListener("click", function (e) {
      var select = e.target.closest && e.target.closest("[data-hh-select]");
      if (select) {
        selected = list && list[Number(select.dataset.hhSelect)] || null;
        paint();
        return;
      }
      if ((e.target.closest && e.target.closest("button[data-hh-cancel]")) || e.target.hasAttribute("data-hh-overlay")) {
        selected = null;
        paint();
        return;
      }
      var b = e.target.closest && e.target.closest("[data-hh-unhide]");
      if (!b || b.disabled) return;
      b.disabled = true;
      b.textContent = "…";
      post("/api/photos/unhide", { album: b.dataset.hhAlbum, src: b.dataset.hhUnhide }).then(function () {
        list = list.filter(function (p) { return !(p.id === b.dataset.hhUnhide && p.album === b.dataset.hhAlbum); });
        selected = null;
        paint();
      }).catch(function (err) {
        b.disabled = false;
        b.textContent = "Unhide";
        alert(err.message);
      });
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) load();
    });
    load();
  }
})();
