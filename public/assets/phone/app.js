import {
  i as createStateSync,
  n as filterExpiredTasks,
  r as sortTasks,
  t as formatDueLabel,
} from "../auto-update-nlFnScvE.js";
(function () {
  var mobileData = window.DATA,
    appRoot = document.getElementById(`mApp`),
    viewState = {
      tab: `shopping`,
      screen: `stores`,
      storeId: null,
      query: ``,
      shopMode: !1,
      manageTab: `stores`,
      manageStore: ``,
      who: null,
      due: null,
      doneOpen: !1,
      kodesh: !1,
      heartbeat: 0,
      modal: null,
      sheet: null,
      held: !1,
      holdTimer: null,
      wakeLock: null,
      toastTimer: null,
      renderPending: !1,
      musicConnected: null,
      musicError: ``,
      musicStep: `credentials`,
      musicEmail: ``,
      musicPassword: ``,
      musicProfiles: [],
      musicProfile: null,
      musicPin: ``,
      musicView: `home`,
      musicList: null,
      musicSearch: ``,
      musicSections: [],
      musicLibrary: [],
      musicRecent: [],
      musicBrowseTab: ``,
      musicBrowseTiles: [],
      musicBrowsePage: 1,
      musicBrowseHasMore: !1,
      musicNowPlaying: null,
      musicTarget: `small`,
      musicVolume: 70,
    },
    stateSync = createStateSync(mobileData, {
      pauseWhenHidden: !0,
      onData: function () {
        render();
      },
      onHeartbeat: function (value) {
        ((viewState.heartbeat = value), render());
      },
    });
  var musicStateVersions = {},
    musicStatePolling = !1,
    musicCommandSequence = 0;
  window.FD_PHONE = {
    data: mobileData,
    stateSync: stateSync,
  };
  function escapeHTML(value) {
    var element = document.createElement(`span`);
    return ((element.textContent = String(value ?? ``)), element.innerHTML);
  }
  function phoneIcon(name, size) {
    var paths = {
      home: `<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>`,
      calendar: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`,
      tasks: `<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/>`,
      cart: `<path d="M3 4h2l2.5 11h11L21 8H6"/><circle cx="10" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>`,
      photo: `<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/>`,
      sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
      moon: `<path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.2 8.2 0 1 0 20 14.5z"/>`,
      "skip-forward": `<path d="M5 5v14l11-7z"/><path d="M19 5v14"/>`,
      "skip-back": `<path d="M19 5v14L8 12z"/><path d="M5 5v14"/>`,
      "eye-off": `<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.2-2.3 3.3M6.2 6.2C3.9 7.7 2.7 10 2.5 12c.7 1.8 2 3.5 3.8 4.8A10 10 0 0 0 12 19"/>`,
      users: `<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.2a4 4 0 0 1 0 7.6"/>`,
      bell: `<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>`,
      refresh: `<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/>`,
      music: `<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>`,
      play: `<path d="m8 5 12 7-12 7z"/>`,
      pause: `<path d="M8 5v14M16 5v14"/>`,
      "delete-left": `<path d="M21 5H9l-6 7 6 7h12z"/><path d="m12 9 6 6m0-6-6 6"/>`,
      back: `<path d="m15 18-6-6 6-6"/>`,
      chevron: `<path d="m9 18 6-6-6-6"/>`,
      "chevron-down": `<path d="m6 9 6 6 6-6"/>`,
      "chevron-up": `<path d="m6 15 6-6 6 6"/>`,
    };
    size = size || 20;
    return `<svg class="m-inline-icon" viewBox="0 0 24 24" width="` + size + `" height="` + size + `" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` + (paths[name] || ``) + `</svg>`;
  }
  function createId(prefix) {
    return (
      prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    );
  }
  function localDate() {
    var value = new Intl.DateTimeFormat(`en-CA`, {
      timeZone: `America/Toronto`,
      year: `numeric`,
      month: `2-digit`,
      day: `2-digit`,
    })
      .formatToParts(new Date())
      .reduce(function (result, item) {
        return ((result[item.type] = item.value), result);
      }, {});
    return value.year + `-` + value.month + `-` + value.day;
  }
  function addDays(date, offsetDays) {
    var items = date.split(`-`).map(Number);
    return new Date(Date.UTC(items[0], items[1] - 1, items[2] + offsetDays))
      .toISOString()
      .slice(0, 10);
  }
  function getStores() {
    return Array.isArray(mobileData.stores) ? mobileData.stores : [];
  }
  function findStore(storeId) {
    return getStores().find(function (item) {
      return item.id === storeId;
    });
  }
  function getProducts() {
    return Array.isArray(mobileData.products) ? mobileData.products : [];
  }
  function getOpenGroceries(storeId) {
    return mobileData.groceries.filter(function (item) {
      return !item.done && (!storeId || item.store === storeId);
    });
  }
  function getDoneGroceries(storeId) {
    return mobileData.groceries.filter(function (item) {
      return item.done && (!storeId || item.store === storeId);
    });
  }
  function countOpenGroceries(storeId) {
    return getOpenGroceries(storeId).length;
  }
  function switchTab(tabName) {
    (exitShoppingMode(),
      (viewState.tab = tabName),
      (viewState.screen = tabName === `shopping` ? `stores` : tabName),
      (viewState.modal = null),
      (viewState.sheet = null),
      render());
  }
  function persistState(key) {
    (stateSync.persist(key), render());
  }
  async function writeMusicState(next, isCommand) {
    var response,
      result,
      current;
    try {
      response = await fetch(`/api/state/music`, { cache: `no-store` });
      current = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        throw new Error(response.status === 423 ? `Controls are disabled during Kodesh.` : `Could not send command to frame.`);
      }
      var currentSequence = Number(current.json && current.json.seq) || 0;
      if (isCommand && (Number(next.seq) || 0) <= currentSequence) next.seq = currentSequence + 1;
      musicCommandSequence = Math.max(musicCommandSequence, currentSequence, Number(next.seq) || 0);
      for (var attempt = 0; attempt < 2; attempt += 1) {
        response = await fetch(`/api/state/music`, {
          method: `PUT`,
          cache: `no-store`,
          headers: { "content-type": `application/json` },
          body: JSON.stringify({ json: next, base: Number(current.updated) || 0 }),
        });
        result = await response.json().catch(function () { return {}; });
        if (response.status === 409 && attempt === 0) {
          current = result;
          next.seq = (Number(result.json && result.json.seq) || 0) + 1;
          musicCommandSequence = Math.max(musicCommandSequence, next.seq);
          continue;
        }
        if (!response.ok) {
          throw new Error(response.status === 423 ? `Controls are disabled during Kodesh.` : response.status === 409 ? `Playback changed. Try again.` : `Could not send command to frame.`);
        }
        mobileData.music = next;
        musicStateVersions.music = Number(result.updated) || Number(current.updated) || 0;
        musicCommandSequence = Math.max(musicCommandSequence, Number(next.seq) || 0);
        viewState.musicError = ``;
        render();
        return;
      }
    } catch (error) {
      viewState.musicError = error.message || `Could not send command to frame.`;
      render();
    }
  }
  function showTaskCompletedToast(task) {
    var element = appRoot.querySelector(`.m-toast`);
    (element && element.remove(), clearTimeout(viewState.toastTimer));
    var element2 = document.createElement(`div`);
    ((element2.className = `m-toast`),
      (element2.innerHTML = `<span></span><button type="button">Undo</button>`),
      (element2.querySelector(`span`).textContent = `Task completed`),
      element2.querySelector(`button`).addEventListener(`click`, function () {
        viewState.kodesh ||
          ((task.done = !1),
          (task.doneAt = null),
          element2.remove(),
          persistState(`tasks`));
      }),
      appRoot.appendChild(element2),
      (viewState.toastTimer = setTimeout(function () {
        element2.remove();
      }, 5e3)));
  }
  function showNamesSavedToast() {
    var element = appRoot.querySelector(`.m-toast`);
    (element && element.remove(), clearTimeout(viewState.toastTimer));
    var element2 = document.createElement(`div`);
    ((element2.className = `m-toast`),
      (element2.innerHTML = `<span></span>`),
      (element2.querySelector(`span`).textContent = `Names saved`),
      appRoot.appendChild(element2),
      (viewState.toastTimer = setTimeout(function () {
        element2.remove();
      }, 5e3)));
  }
  function exitShoppingMode() {
    ((viewState.shopMode = !1),
      (viewState.wakeLock &&=
        (viewState.wakeLock.release().catch(function () {}), null)));
  }
  function enterShoppingMode() {
    ((viewState.shopMode = !0),
      navigator.wakeLock &&
        navigator.wakeLock.request &&
        navigator.wakeLock
          .request(`screen`)
          .then(function (result) {
            viewState.wakeLock = result;
          })
          .catch(function () {}),
      render());
  }
  function openModal(title, body, actions) {
    ((viewState.modal = {
      title: title,
      body: body,
      actions: actions || [],
    }),
      render());
  }
  function closeModal() {
    ((viewState.modal = null), render());
  }
  function isWriteDisabled(element) {
    return !!(viewState.kodesh && element && element.closest(`[data-write]`));
  }
  function renderHeader(title, showBackButton, titleMeta) {
    return (
      `<header class="m-header"><div class="m-header-row"><div><div class="m-brand">Home HQ</div><div class="m-title-row"><h1 class="m-title serif">` +
      escapeHTML(title) +
      `</h1>` + (titleMeta ? `<span class="m-title-meta">` + escapeHTML(titleMeta) + `</span>` : ``) + `</div></div>` +
      (showBackButton
        ? `<button type="button" class="m-back" data-action="back">Back</button>`
        : ``) +
      `</div></header>`
    );
  }
  function renderButton(label, action, className, isWriteAction) {
    return (
      `<button type="button" class="m-btn ` +
      (className || ``) +
      `" data-action="` +
      action +
      `"` +
      (isWriteAction ? ` data-write` : ``) +
      (isWriteAction && viewState.kodesh ? ` disabled` : ``) +
      `>` +
      label +
      `</button>`
    );
  }
  function renderPersonChips(selectedPersonId) {
    return (
      `<div class="m-chips"><button type="button" class="m-chip` +
      (selectedPersonId ? `` : ` is-on`) +
      `" data-who="" data-write ` +
      (viewState.kodesh ? `disabled` : ``) +
      `>None</button>` +
      window.CONFIG.people
        .map(function (person) {
          return (
            `<button type="button" class="m-chip` +
            (selectedPersonId === person.id ? ` is-on` : ``) +
            `" style="background:` +
            (selectedPersonId === person.id ? person.color : ``) +
            `;color:` +
            (selectedPersonId === person.id ? person.ink : ``) +
            `" data-who="` +
            escapeHTML(person.id) +
            `" data-write ` +
            (viewState.kodesh ? `disabled` : ``) +
            `>` +
            escapeHTML(person.name) +
            `</button>`
          );
        })
        .join(``) +
      `</div>`
    );
  }
  function taskDueOptions() {
    var date = localDate(),
      value = new Intl.DateTimeFormat(`en-US`, {
        timeZone: `America/Toronto`,
        weekday: `short`,
      }).format(new Date()),
      value2 =
        (5 -
          [`Sun`, `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`].indexOf(value) +
          7) %
        7;
    return [
      {
        id: ``,
        title: `None`,
        date: null,
      },
      {
        id: `today`,
        title: `Today`,
        date: date,
      },
      {
        id: `tomorrow`,
        title: `Tomorrow`,
        date: addDays(date, 1),
      },
      {
        id: `week`,
        title: `This week`,
        date: addDays(date, value2),
      },
    ];
  }
  function renderDueChips(selectedDate) {
    return (
      `<div class="m-chips">` +
      taskDueOptions()
        .map(function (item) {
          return (
            `<button type="button" class="m-chip` +
            (selectedDate === item.date ? ` is-on` : ``) +
            `" data-due="` +
            item.id +
            `" data-write ` +
            (viewState.kodesh ? `disabled` : ``) +
            `>` +
            item.title +
            `</button>`
          );
        })
        .join(``) +
      `</div>`
    );
  }
  function renderTaskItems(tasks, isDone) {
    return tasks
      .map(function (task) {
        var value = task.due ? formatDueLabel(task.due, localDate()) : ``,
          item = window.CONFIG.people.find(function (item) {
            return item.id === task.who;
          });
        return (
          `<button type="button" class="m-task` +
          (isDone ? ` is-done` : ``) +
          (value === `Overdue` && !isDone ? ` is-overdue` : ``) +
          `" data-task-id="` +
          escapeHTML(task.id) +
          `" data-done="` +
          (isDone ? `1` : `0`) +
          `" data-write ` +
          (viewState.kodesh ? `disabled` : ``) +
          `><span class="m-task-check">` +
          (isDone ? `✓` : ``) +
          `</span><span class="m-task-copy"><strong>` +
          escapeHTML(task.title) +
          `</strong><small>` +
          (item ? escapeHTML(item.name) + (value ? ` · ` : ``) : ``) +
          escapeHTML(value) +
          `</small></span></button>`
        );
      })
      .join(``);
  }
  function renderShopping() {
    return (
      `<p class="m-muted m-shopping-context">Shared list</p><div class="m-store-grid">` +
      getStores()
        .map(function (item) {
          var value = countOpenGroceries(item.id);
          return (
            `<button type="button" class="m-store-card" data-store-open="` +
            escapeHTML(item.id) +
            `"><span><strong>` +
            escapeHTML(item.name) +
            `</strong><small>` +
            value +
            ` open ` +
            (value === 1 ? `item` : `items`) +
            `</small></span><span class="m-count">` +
            value +
            `</span></button>`
          );
        })
        .join(``) +
      `</div><div style="margin-top:16px">` +
      renderButton(`Manage stores & products`, `manage`, `m-btn--quiet`) +
      `</div>`
    );
  }
  function renderProductSuggestions() {
    var value = viewState.query.trim().toLowerCase();
    if (!value) return ``;
    var value2 = getProducts()
        .filter(function (item) {
          return (
            item.store === viewState.storeId &&
            item.name.toLowerCase().includes(value)
          );
        })
        .slice(0, 5),
      value3 = value2.some(function (item) {
        return item.name.toLowerCase() === value;
      });
    return (
      `<div class="m-suggestions">` +
      value2
        .map(function (item) {
          return (
            `<button type="button" class="m-suggestion" data-add-product="` +
            escapeHTML(item.id) +
            `"><span>` +
            escapeHTML(item.name) +
            `</span><small>` +
            escapeHTML(item.cat) +
            `</small></button>`
          );
        })
        .join(``) +
      (value3
        ? ``
        : `<button type="button" class="m-suggestion" data-add-new="` +
          escapeHTML(viewState.query.trim()) +
          `"><span>Add “` +
          escapeHTML(viewState.query.trim()) +
          `”</span><small>New item</small></button>`) +
      `</div>`
    );
  }
  function renderGroceryRow(grocery, isDone) {
    return (
      `<div class="m-grocery` +
      (isDone ? ` is-done` : ``) +
      `" data-grocery-id="` +
      escapeHTML(grocery.id) +
      `"><button type="button" class="m-check" data-action="toggle-grocery" data-id="` +
      escapeHTML(grocery.id) +
      `" data-write ` +
      (viewState.kodesh ? `disabled` : ``) +
      ` aria-label="` +
      (isDone ? `Uncheck ` : `Check `) +
      escapeHTML(grocery.name) +
      `">` +
      (isDone ? `✓` : ``) +
      `</button><button type="button" class="m-grocery-main" data-action="note" data-id="` +
      escapeHTML(grocery.id) +
      `" data-write ` +
      (viewState.kodesh ? `disabled` : ``) +
      `><strong>` +
      escapeHTML(grocery.name) +
      `</strong>` +
      (grocery.note ? `<small>` + escapeHTML(grocery.note) + `</small>` : ``) +
      `</button><div class="m-qty"><button type="button" data-action="qty" data-id="` +
      escapeHTML(grocery.id) +
      `" data-delta="-1" data-write ` +
      (viewState.kodesh ? `disabled` : ``) +
      `>−</button><b>` +
      grocery.qty +
      `</b><button type="button" data-action="qty" data-id="` +
      escapeHTML(grocery.id) +
      `" data-delta="1" data-write ` +
      (viewState.kodesh ? `disabled` : ``) +
      `>+</button></div></div>`
    );
  }
  function renderGroceryCategories(groceries, categories) {
    var items = (categories || [])
        .concat([`Other`])
        .filter(function (item, index, items) {
          return items.indexOf(item) === index;
        }),
      value = ``;
    return (
      items.forEach(function (item) {
        var items2 = groceries.filter(function (item2) {
          return item2.cat === item;
        });
        items2.length &&
          (value +=
            `<section class="m-category"><div class="m-category-title"><span>` +
            escapeHTML(item) +
            `</span><span>` +
            items2.length +
            `</span></div>` +
            items2
              .map(function (item2) {
                return renderGroceryRow(item2, item2.done);
              })
              .join(``) +
            `</section>`);
      }),
      groceries
        .filter(function (item) {
          return items.indexOf(item.cat) < 0;
        })
        .forEach(function (item) {
          value +=
            `<section class="m-category"><div class="m-category-title">` +
            escapeHTML(item.cat) +
            `</div>` +
            renderGroceryRow(item, item.done) +
            `</section>`;
        }),
      value
    );
  }
  function renderStore() {
    var store = findStore(viewState.storeId);
    if (!store) return ((viewState.screen = `stores`), renderShopping());
    var items = mobileData.groceries.filter(function (item) {
        return item.store === store.id;
      }),
      items2 = items.filter(function (item) {
        return !item.done;
      }),
      items3 = items.filter(function (item) {
        return item.done;
      }),
      value = viewState.shopMode
        ? renderGroceryCategories(items2, store.cats) +
          (items3.length
            ? `<section class="m-category"><div class="m-category-title"><span>In cart</span><span>` +
              items3.length +
              `</span></div>` +
              items3
                .map(function (item) {
                  return renderGroceryRow(item, !0);
                })
                .join(``) +
              `</section>`
            : ``)
        : renderGroceryCategories(items, store.cats);
    return (
      `<div class="m-toolbar">` +
      renderButton(`Manage`, `manage`, `m-btn--quiet`) +
      (viewState.shopMode
        ? renderButton(`Exit shop`, `exit-shop`, `m-btn--quiet`)
        : renderButton(
            `Shop · ` + items2.length,
            `start-shop`,
            `m-btn--solid`,
            !0,
          )) +
      `</div><form class="m-form" data-form="grocery"><input class="m-input" name="item" aria-label="Add a grocery item" placeholder="Add an item…" autocomplete="off" value="` +
      escapeHTML(viewState.query) +
      `"` +
      (viewState.kodesh ? ` disabled` : ``) +
      `><button class="m-btn m-btn--solid" type="submit" data-write ` +
      (viewState.kodesh ? `disabled` : ``) +
      `>Add</button></form><div id="mSuggestions">` +
      renderProductSuggestions() +
      `</div>` +
      (items.length
        ? value
        : `<div class="m-empty">Nothing left to buy.</div>`) +
      (viewState.shopMode && items3.length
        ? `<div class="m-done-bar">` +
          renderButton(
            `Done shopping · remove ` + items3.length,
            `done-shopping`,
            `m-btn--solid`,
            !0,
          ) +
          `</div>`
        : ``)
    );
  }
  function renderManageStores() {
    return (
      `<form class="m-form" data-form="store"><input class="m-input" name="store" aria-label="New store name" placeholder="Add a store…" autocomplete="off"><button class="m-btn m-btn--solid" type="submit" data-write ` +
      (viewState.kodesh ? `disabled` : ``) +
      `>Add</button></form>` +
      getStores()
        .map(function (item) {
          return (
            `<section class="m-manage-store"><div class="m-manage-store-head"><strong>` +
            escapeHTML(item.name) +
            `</strong><button type="button" class="m-mini" data-action="rename-store" data-id="` +
            escapeHTML(item.id) +
            `" data-write ` +
            (viewState.kodesh ? `disabled` : ``) +
            `>Rename</button><button type="button" class="m-mini" data-action="delete-store" data-id="` +
            escapeHTML(item.id) +
            `" data-write ` +
            (viewState.kodesh ? `disabled` : ``) +
            `>Delete</button></div>` +
            (item.cats || [])
              .map(function (item2, index) {
                return (
                  `<div class="m-category-edit"><span>` +
                  escapeHTML(item2) +
                  `</span><button type="button" class="m-mini" data-action="move-cat" data-store="` +
                  escapeHTML(item.id) +
                  `" data-index="` +
                  index +
                  `" data-delta="-1" data-write ` +
                  (viewState.kodesh || index === 0 ? `disabled` : ``) +
                  `>↑</button><button type="button" class="m-mini" data-action="move-cat" data-store="` +
                  escapeHTML(item.id) +
                  `" data-index="` +
                  index +
                  `" data-delta="1" data-write ` +
                  (viewState.kodesh || index === item.cats.length - 1
                    ? `disabled`
                    : ``) +
                  `>↓</button></div>`
                );
              })
              .join(``) +
            `<form class="m-form" data-form="category" data-store="` +
            escapeHTML(item.id) +
            `" style="margin-top:10px"><input class="m-input" name="category" aria-label="Add category to ` +
            escapeHTML(item.name) +
            `" placeholder="Add category…" autocomplete="off"><button class="m-btn" type="submit" data-write ` +
            (viewState.kodesh ? `disabled` : ``) +
            `>Add</button></form></section>`
          );
        })
        .join(``)
    );
  }
  function renderManageProducts() {
    var value = findStore(viewState.manageStore) || getStores()[0];
    if (!value) return `<div class="m-empty">Add a store first.</div>`;
    viewState.manageStore = value.id;
    var items = getProducts().filter(function (item) {
      return item.store === value.id;
    });
    return (
      `<div class="m-manage-tabs">` +
        getStores()
          .map(function (item) {
            return (
              `<button type="button" class="` +
              (item.id === value.id ? `is-on` : ``) +
              `" data-manage-store="` +
              escapeHTML(item.id) +
              `">` +
              escapeHTML(item.name) +
              `</button>`
            );
          })
          .join(``) +
        `</div><form class="m-form" data-form="product"><input class="m-input" name="product" aria-label="New product name" placeholder="Add a product…" autocomplete="off"><button class="m-btn m-btn--solid" type="submit" data-write ` +
        (viewState.kodesh ? `disabled` : ``) +
        `>Add</button></form>` +
        items
          .map(function (item) {
            return (
              `<div class="m-product" data-product-id="` +
              escapeHTML(item.id) +
              `"><span><strong>` +
              escapeHTML(item.name) +
              `</strong><small>` +
              escapeHTML(item.cat) +
              `</small></span><button type="button" class="m-mini" data-action="edit-product" data-id="` +
              escapeHTML(item.id) +
              `" data-write ` +
              (viewState.kodesh ? `disabled` : ``) +
              `>Edit</button></div>`
            );
          })
          .join(``) || `<div class="m-empty">No products yet.</div>`
    );
  }
  function renderShoppingManagement() {
    return (
      `<div class="m-manage-tabs"><button type="button" class="` +
      (viewState.manageTab === `stores` ? `is-on` : ``) +
      `" data-manage-tab="stores">Stores & categories</button><button type="button" class="` +
      (viewState.manageTab === `products` ? `is-on` : ``) +
      `" data-manage-tab="products">Products</button></div>` +
      (viewState.manageTab === `stores`
        ? renderManageStores()
        : renderManageProducts())
    );
  }
  function renderTasks() {
    var date = localDate(),
      value = sortTasks(
        mobileData.tasks.filter(function (item) {
          return !item.done;
        }),
        date,
      ),
      value2 = mobileData.tasks
        .filter(function (item) {
          return item.done;
        })
        .sort(function (left, right) {
          return (right.doneAt || ``).localeCompare(left.doneAt || ``);
        });
    return (
      `<form class="m-form" data-form="task"><input class="m-input" name="task" aria-label="Add a task" placeholder="Add a task…" autocomplete="off" value="` +
      escapeHTML(viewState.query) +
      `"` +
      (viewState.kodesh ? ` disabled` : ``) +
      `><button class="m-btn m-btn--solid" type="submit" data-write ` +
      (viewState.kodesh ? `disabled` : ``) +
      `>Add</button></form><div class="m-task-options"><div><span class="m-muted">For</span>` +
      renderPersonChips(viewState.who) +
      `</div><div><span class="m-muted">Due</span>` +
      renderDueChips(viewState.due) +
      `</div></div><div class="m-tasks">` +
      (value.length
        ? renderTaskItems(value, !1)
        : `<div class="m-empty">Nothing to do right now.</div>`) +
      `</div>` +
      (value2.length
        ? `<button type="button" class="m-done-toggle" data-action="toggle-done" aria-expanded="` + viewState.doneOpen + `">` +
          (viewState.doneOpen ? `Hide done` : `Show ` + value2.length + ` done`) + phoneIcon(viewState.doneOpen ? `chevron-up` : `chevron-down`, 16) +
          `</button>` +
          (viewState.doneOpen
            ? `<div class="m-tasks">` +
              renderTaskItems(value2, !0) +
              renderButton(`Clear done`, `clear-done`, `m-btn--quiet`, !0) +
              `</div>`
            : ``)
        : ``)
    );
  }
  function musicApi(path, options) {
    return fetch(path, Object.assign({ cache: `no-store` }, options || {}))
      .then(function (response) {
        return response.json().catch(function () {
          return {};
        }).then(function (result) {
          if (response.status === 403 && result.relogin) {
            viewState.musicConnected = !1;
            viewState.musicError = `Please connect to 24six again.`;
            viewState.musicStep = `credentials`;
            viewState.sheet = `music-connect`;
            render();
          }
          if (!response.ok) throw new Error(result.error || `24six request failed`);
          return result;
        });
      });
  }
  function musicPost(path, body) {
    return musicApi(path, {
      method: `POST`,
      headers: { "content-type": `application/json` },
      body: JSON.stringify(body || {}),
    });
  }
  function loadMusicShelves() {
    Promise.all([
      musicApi(`/api/music/home`),
      musicApi(`/api/music/library`),
      musicApi(`/api/music/recent`),
    ]).then(function (result) {
      viewState.musicSections = result[0].sections || [];
      viewState.musicLibrary = result[1].tiles || [];
      viewState.musicRecent = result[2].tiles || [];
      render();
    }).catch(function (error) {
      viewState.musicError = error.message;
      render();
    });
  }
  function loadMusicStatus() {
    musicApi(`/api/music/status`).then(function (result) {
      viewState.musicConnected = !!result.connected;
      viewState.musicProfile = result.profile || null;
      viewState.musicEmail = result.email || ``;
      var command = mobileData.music || {};
      viewState.musicTarget = command.target || `small`;
      viewState.musicVolume = Number.isFinite(Number(command.volume)) ? Number(command.volume) : 70;
      viewState.musicNowPlaying = currentMusicNowPlaying();
      if (viewState.musicConnected) loadMusicShelves();
      else render();
    }).catch(function () {
      viewState.musicConnected = !1;
      render();
    });
  }
  function musicNowState(key) {
    var state = mobileData[key];
    if (state && state.json && typeof state.json === `object`) return state.json;
    return state && typeof state === `object` ? state : {};
  }
  function currentMusicNowPlaying() {
    var command = mobileData.music || {},
      target = viewState.musicTarget || command.target,
      small = musicNowState(`music_now_small`),
      large = musicNowState(`music_now_large`);
    if (target === `small`) return small;
    if (target === `large`) return large;
    if (small.playing) return small;
    if (large.playing) return large;
    return (Date.parse(large.at || ``) || 0) > (Date.parse(small.at || ``) || 0) ? large : small;
  }
  function pollMusicState() {
    if (document.hidden || musicStatePolling) return;
    musicStatePolling = !0;
    fetch(`/api/state/version`, { cache: `no-store` })
      .then(function (response) {
        if (!response.ok) throw new Error(`State versions unavailable`);
        return response.json();
      })
      .then(function (versions) {
        var stateVersions = versions.keys || versions,
          changed = !1;
        return Promise.all([`music`, `music_now_small`, `music_now_large`].map(function (key) {
          var updated = Number(stateVersions[key]) || 0;
          if (updated === Number(musicStateVersions[key] || 0)) return null;
          return fetch(`/api/state/` + encodeURIComponent(key), { cache: `no-store` })
            .then(function (response) {
              if (!response.ok) throw new Error(`Music state unavailable`);
              return response.json();
            })
            .then(function (result) {
              musicStateVersions[key] = Number(result.updated) || updated;
              mobileData[key] = result.json && typeof result.json === `object` ? result.json : null;
              if (key === `music`) musicCommandSequence = Math.max(musicCommandSequence, Number(mobileData.music && mobileData.music.seq) || 0);
              changed = !0;
            });
        })).then(function () {
          if (!changed) return;
          var command = mobileData.music || {};
          if ([`small`, `large`, `both`].indexOf(command.target) >= 0) viewState.musicTarget = command.target;
          if (command.volume != null && Number.isFinite(Number(command.volume))) viewState.musicVolume = Number(command.volume);
          viewState.musicNowPlaying = currentMusicNowPlaying();
          if (viewState.tab === `music`) render();
        });
      })
      .catch(function () {})
      .finally(function () {
        musicStatePolling = !1;
      });
  }
  function renderMusicTile(tile) {
    var id = escapeHTML(tile.id),
      title = escapeHTML(tile.title || `Untitled`),
      subtitle = escapeHTML(tile.subtitle || ``),
      image = tile.img
        ? `<img src="` + escapeHTML(tile.img) + `" alt="" loading="lazy">`
        : `<span class="m-music-cover-placeholder">` + phoneIcon(`music`, 28) + `</span>`;
    return tile.kind === `track`
      ? `<button type="button" class="m-music-tile" data-write data-music-track="` + id + `" data-title="` + title + `" data-artist="` + subtitle + `" data-img="` + escapeHTML(tile.img || ``) + `"` + (viewState.kodesh ? ` disabled` : ``) + `>` + image + `<span><strong>` + title + `</strong><small>` + subtitle + `</small></span></button>`
      : `<button type="button" class="m-music-tile" data-music-open="` + id + `" data-music-kind="` + escapeHTML(tile.kind || `playlist`) + `" data-title="` + title + `">` + image + `<span><strong>` + title + `</strong><small>` + subtitle + `</small></span></button>`;
  }
  function renderMusicShelf(title, tiles) {
    if (!tiles || !tiles.length) return ``;
    return `<section class="m-music-shelf"><div class="m-shelf-heading"><h2>` + escapeHTML(title) + `</h2><span>` + tiles.length + `</span></div><div class="m-music-shelf-row">` + tiles.slice(0, 12).map(renderMusicTile).join(``) + `</div></section>`;
  }
  function renderMusicNowCard() {
    var state = currentMusicNowPlaying(),
      command = mobileData.music || {},
      queue = Array.isArray(command.queue) ? command.queue : [],
      current = state.id != null ? state : queue[Number(command.index) || 0] || {},
      title = current.title || `Nothing playing`,
      artist = current.artist || ``,
      img = current.img || ``,
      playing = typeof state.playing === `boolean` ? state.playing : !!command.playing,
      disabled = viewState.kodesh ? ` disabled` : ``;
    return `<section class="m-music-now"><div class="m-music-now-art">` +
      (img ? `<img src="` + escapeHTML(img) + `" alt="">` : phoneIcon(`music`, 30)) +
      `</div><div class="m-music-now-copy"><small>NOW PLAYING</small><strong>` + escapeHTML(title) + `</strong><span>` + escapeHTML(artist) + `</span></div><div class="m-music-controls"><button type="button" data-write data-music-action="prev" aria-label="Previous track"` + disabled + `>` + phoneIcon(`skip-back`) + `</button><button type="button" class="m-music-play" data-write data-music-action="toggle" aria-label="Play or pause"` + disabled + `>` + phoneIcon(playing ? `pause` : `play`) + `</button><button type="button" data-write data-music-action="next" aria-label="Next track"` + disabled + `>` + phoneIcon(`skip-forward`) + `</button></div><div class="m-music-target" role="group" aria-label="Play on"><button type="button" data-write data-music-target="small" class="` + (viewState.musicTarget === `small` ? `is-on` : ``) + `"` + disabled + `>10″</button><button type="button" data-write data-music-target="large" class="` + (viewState.musicTarget === `large` ? `is-on` : ``) + `"` + disabled + `>15″</button><button type="button" data-write data-music-target="both" class="` + (viewState.musicTarget === `both` ? `is-on` : ``) + `"` + disabled + `>Both</button></div><label class="m-music-volume"><span>Volume</span><input type="range" min="0" max="100" value="` + Number(viewState.musicVolume) + `" data-write data-music-volume aria-label="Volume"` + disabled + `></label></section>`;
  }
  function renderMusicList() {
    var list = viewState.musicList;
    if (!list) return ``;
    return `<div class="m-music-list-head"><button type="button" class="m-back" data-music-action="back">` + phoneIcon(`back`, 18) + `<span>Back</span></button><h2 class="serif">` + escapeHTML(list.title) + `</h2></div><button type="button" class="m-btn m-btn--solid m-music-play-all" data-write data-music-action="play-all"` + (viewState.kodesh ? ` disabled` : ``) + `>Play all</button><div class="m-music-track-list">` + (list.tiles || []).map(function (tile, index) {
      return `<button type="button" class="m-music-track" data-write data-music-track-index="` + index + `"` + (viewState.kodesh ? ` disabled` : ``) + `><span class="m-track-number">` + (index + 1) + `</span><span><strong>` + escapeHTML(tile.title) + `</strong><small>` + escapeHTML(tile.subtitle || ``) + `</small></span>` + phoneIcon(`play`, 18) + `</button>`;
    }).join(``) + `</div>`;
  }
  function renderMusicQueue() {
    var command = mobileData.music || {},
      queue = Array.isArray(command.queue) ? command.queue : [],
      nowState = currentMusicNowPlaying(),
      nowIndex = Number(nowState.index),
      currentIndex = nowState.id != null && Number.isInteger(nowIndex) && queue[nowIndex] && String(queue[nowIndex].id) === String(nowState.id)
        ? nowIndex
        : Number(command.index) || 0;
    if (!queue.length) return ``;
    return `<section class="m-music-queue"><div class="m-shelf-heading"><h2>Up next</h2><span>` + queue.length + ` tracks</span></div>` + queue.map(function (track, index) {
      return `<button type="button" class="m-music-track` + (index === currentIndex ? ` is-current` : ``) + `" data-write data-music-queue-index="` + index + `"` + (viewState.kodesh ? ` disabled` : ``) + `><span class="m-track-number">` + (index === currentIndex ? phoneIcon(`music`, 16) : index + 1) + `</span><span><strong>` + escapeHTML(track.title || `Untitled`) + `</strong><small>` + escapeHTML(track.artist || ``) + `</small></span>` + phoneIcon(`chevron`, 16) + `</button>`;
    }).join(``) + `</section>`;
  }
  function loadMusicBrowse(tab, page) {
    viewState.musicBrowseTab = tab;
    viewState.musicBrowsePage = page || 1;
    musicApi(`/api/music/browse/` + encodeURIComponent(tab) + `?page=` + viewState.musicBrowsePage).then(function (result) {
      viewState.musicBrowseTiles = viewState.musicBrowsePage > 1
        ? viewState.musicBrowseTiles.concat(result.tiles || [])
        : result.tiles || [];
      viewState.musicBrowseHasMore = !!result.hasMore;
      viewState.musicError = ``;
      render();
    }).catch(function (error) {
      viewState.musicError = error.message;
      render();
    });
  }
  function renderMusicBrowse() {
    var tabs = [
      [`artist`, `Artists`],
      [`collection`, `Albums`],
      [`playlist`, `Playlists`],
      [`category`, `Categories`],
    ];
    return `<section class="m-music-browse"><div class="m-music-browse-tabs" role="tablist" aria-label="Browse 24six">` +
      tabs.map(function (item) {
        return `<button type="button" role="tab" aria-selected="` + (viewState.musicBrowseTab === item[0]) + `" class="` + (viewState.musicBrowseTab === item[0] ? `is-active` : ``) + `" data-music-browse-tab="` + item[0] + `">` + item[1] + `</button>`;
      }).join(``) +
      `</div>` +
      (viewState.musicBrowseTab
        ? `<div class="m-music-browse-grid">` + viewState.musicBrowseTiles.map(renderMusicTile).join(``) + `</div>` +
          (viewState.musicBrowseHasMore ? `<button type="button" class="m-btn m-music-more" data-music-more>Load more</button>` : ``)
        : `<p class="m-muted m-music-browse-hint">Browse artists, albums, playlists and categories.</p>`) +
      `</section>`;
  }
  function renderMusic() {
    if (viewState.musicConnected === null) return `<div class="m-empty">Loading 24six…</div>`;
    if (!viewState.musicConnected) return `<section class="m-music-connect-card"><span class="m-music-mark">` + phoneIcon(`music`, 28) + `</span><h2 class="serif">Music for home</h2><p class="m-muted">Connect your 24six account to browse and play on your frames.</p><button type="button" class="m-btn m-btn--solid" data-write data-music-action="connect"` + (viewState.kodesh ? ` disabled` : ``) + `>Connect 24six</button>` + (viewState.musicError ? `<p class="m-music-error">` + escapeHTML(viewState.musicError) + `</p>` : ``) + `</section>`;
    if (viewState.musicList) return renderMusicList();
    return renderMusicNowCard() +
      renderMusicQueue() +
      `<form class="m-form m-music-search" data-form="music-search"><input class="m-input" name="musicSearch" type="search" placeholder="Search 24six" aria-label="Search 24six" value="` + escapeHTML(viewState.musicSearch) + `"><button type="submit" class="m-btn">Search</button></form>` +
      renderMusicBrowse() +
      (viewState.musicBrowseTab ? `` :
      (viewState.musicError ? `<p class="m-music-error">` + escapeHTML(viewState.musicError) + `</p>` : ``) +
      renderMusicShelf(`Your library`, viewState.musicLibrary) +
      renderMusicShelf(`Recently played`, viewState.musicRecent) +
      viewState.musicSections.map(function (section) {
        return renderMusicShelf(section.title, section.tiles);
      }).join(``)) +
      `<section class="m-music-account"><div><strong>` + escapeHTML(viewState.musicProfile && viewState.musicProfile.name || `24six account`) + `</strong><small>Connected to 24six</small></div><button type="button" data-write data-music-action="switch"` + (viewState.kodesh ? ` disabled` : ``) + `>Switch profile</button><button type="button" data-write data-music-action="disconnect"` + (viewState.kodesh ? ` disabled` : ``) + `>Disconnect</button></section>`;
  }
  function renderMusicConnect() {
    var error = viewState.musicError ? `<p class="m-music-error" role="alert">` + escapeHTML(viewState.musicError) + `</p>` : ``;
    if (viewState.musicStep === `profiles`) return error + `<p class="m-muted">Choose a profile</p><div class="m-profile-grid">` + viewState.musicProfiles.map(function (profile) {
      return `<button type="button" class="m-profile-card" data-write data-profile-id="` + escapeHTML(profile.id) + `"` + (viewState.kodesh ? ` disabled` : ``) + `>` + (profile.img ? `<img src="` + escapeHTML(profile.img) + `" alt="">` : `<span class="m-profile-avatar">` + escapeHTML((profile.name || `?`).charAt(0)) + `</span>`) + `<strong>` + escapeHTML(profile.name || `Profile`) + `</strong><small>` + (profile.pin_required ? `PIN required` : `No PIN`) + `</small></button>`;
    }).join(``) + `</div>`;
    if (viewState.musicStep === `pin`) return error + `<p class="m-muted">Enter the 4-digit PIN for <strong>` + escapeHTML(viewState.musicProfile && viewState.musicProfile.name || `this profile`) + `</strong></p><div class="m-pin-display" role="img" aria-label="` + viewState.musicPin.length + ` of 4 PIN digits entered">` + Array.from({ length: 4 }, function (_, index) { return `<span class="m-pin-dot` + (index < viewState.musicPin.length ? ` is-filled` : ``) + `"></span>`; }).join(``) + `</div><div class="m-pin-pad">` + [`1`,`2`,`3`,`4`,`5`,`6`,`7`,`8`,`9`,`back`,`0`,`clear`].map(function (digit) {
      return `<button type="button" data-write data-pin-digit="` + digit + `"` + (viewState.kodesh ? ` disabled` : ``) + `>` + (digit === `back` ? phoneIcon(`delete-left`, 18) : digit === `clear` ? `Clear` : digit) + `</button>`;
    }).join(``) + `</div>`;
    return error + `<form class="m-music-credentials" data-form="music-credentials"><label>Email<input class="m-input" data-write name="musicEmail" type="email" autocomplete="username" required value="` + escapeHTML(viewState.musicEmail) + `"` + (viewState.kodesh ? ` disabled` : ``) + `></label><label>Password<input class="m-input" data-write name="musicPassword" type="password" autocomplete="current-password" required` + (viewState.kodesh ? ` disabled` : ``) + `></label><button type="submit" data-write class="m-btn m-btn--solid"` + (viewState.kodesh ? ` disabled` : ``) + `>Continue</button></form>`;
  }
  function selectMusicProfile(profile) {
    viewState.musicProfile = profile;
    viewState.musicError = ``;
    viewState.musicPin = ``;
    if (!profile.pin_required) return loginMusicProfile(``);
    viewState.musicStep = `pin`;
    render();
  }
  function loginMusicProfile(pin) {
    var credentials = {
      email: viewState.musicEmail,
      password: viewState.musicPassword,
      profile_id: viewState.musicProfile && viewState.musicProfile.id,
      device_name: `Home HQ`,
    };
    if (pin) credentials.pin = pin;
    musicPost(`/api/music/login`, credentials).then(function (result) {
      viewState.musicConnected = !0;
      viewState.musicProfile = result.profile || viewState.musicProfile;
      viewState.musicPassword = ``;
      viewState.musicError = ``;
      viewState.sheet = null;
      viewState.musicStep = `credentials`;
      render();
      loadMusicShelves();
    }).catch(function (error) {
      viewState.musicError = error.message;
      if (viewState.musicStep === `pin`) viewState.musicPin = ``;
      render();
    });
  }
  function openMusicList(kind, id, title) {
    musicApi(`/api/music/list/` + encodeURIComponent(kind) + `/` + encodeURIComponent(id)).then(function (result) {
      viewState.musicList = { kind: kind, id: id, title: title || `Music`, tiles: result.tiles || [] };
      viewState.musicView = `list`;
      viewState.musicError = ``;
      render();
    }).catch(function (error) {
      viewState.musicError = error.message;
      render();
    });
  }
  function issueMusicCommand(command, queue, index, extra) {
    var current = mobileData.music || {},
      next = Object.assign({}, current, {
        target: viewState.musicTarget || `small`,
        queue: queue || current.queue || [],
        index: index == null ? Number(current.index) || 0 : index,
        playing: command === `pause` || command === `stop` ? !1 : command === `volume` || command === `seek` ? !!current.playing : !0,
        volume: Number(viewState.musicVolume),
        seq: Math.max(musicCommandSequence, Number(current.seq) || 0) + 1,
        cmd: command,
        arg: extra == null ? `` : extra,
        at: new Date().toISOString(),
      });
    musicCommandSequence = Number(next.seq) || musicCommandSequence;
    mobileData.music = next;
    writeMusicState(next, !0);
  }
  function musicTileFromButton(button) {
    return {
      id: button.dataset.musicTrack || button.dataset.musicTrackId || ``,
      title: button.dataset.title || ``,
      artist: button.dataset.artist || ``,
      img: button.dataset.img || ``,
    };
  }
  function frameHeartbeatStatus() {
    var timestamp = typeof viewState.heartbeat === `number`
      ? viewState.heartbeat
      : new Date(viewState.heartbeat).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= 0) return { online: !1, text: `Offline · never seen` };
    if (timestamp < 1e12) timestamp *= 1000;
    var seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    var age = seconds < 60 ? seconds + `s ago`
      : seconds < 3600 ? Math.floor(seconds / 60) + ` min ago`
        : seconds < 86400 ? Math.floor(seconds / 3600) + ` h ago`
          : Math.floor(seconds / 86400) + ` d ago`;
    var online = seconds < 120;
    return { online: online, text: (online ? `Online · seen ` : `Offline · last seen `) + age };
  }
  function renderFrame() {
    var status = frameHeartbeatStatus();
    return (
      `<div class="m-frame-status" data-frame-last-seen><span class="m-status-dot` + (status.online ? ` is-online` : ``) + `"></span><span>` +
      escapeHTML(status.text) +
      `</div><div class="m-frame-segment" role="group" aria-label="Screen power"><button type="button" data-remote="screenOn" data-write ` +
      (viewState.kodesh ? `disabled` : ``) +
      `>` + phoneIcon(`sun`, 18) + `Screen on</button><button type="button" data-remote="screenOff" data-write ` +
      (viewState.kodesh ? `disabled` : ``) +
      `>` + phoneIcon(`moon`, 18) + `Screen off</button></div><div class="m-frame-grid">` +
      [
        [`Today`, `go`, `home`, `home`],
        [`Calendar`, `go`, `calendar`, `calendar`],
        [`Tasks`, `go`, `tasks`, `tasks`],
        [`Shopping`, `go`, `shopping`, `cart`],
        [`Photos`, `go`, `photos`, `photo`],
        [`Weather`, `go`, `weather`, `sun`],
        [`Next photo`, `nextPhoto`, ``, `skip-forward`],
      ]
        .map(function (item) {
          return (
            `<button type="button" class="m-frame-action" data-remote="` +
            item[1] +
            `" data-arg="` +
            escapeHTML(item[2]) +
            `" data-write ` +
            (viewState.kodesh ? `disabled` : ``) +
            `><span class="m-frame-icon">` +
            phoneIcon(item[3], 22) +
            `</span><span>` +
            escapeHTML(item[0]) +
            `</span></button>`
          );
        })
        .join(``) +
      `</div><div class="m-section-heading m-settings-heading"><h2>Settings</h2></div><div class="m-settings-list">` +
      `<button type="button" class="m-setting-row" data-open-sheet="hidden"><span class="m-setting-icon">` + phoneIcon(`eye-off`) + `</span><span><strong>Hidden photos</strong><small>Photos kept off the frame</small></span><b class="m-row-trailing"><span data-hidden-count>` +
      String(window.HQHidden && window.HQHidden.count ? window.HQHidden.count() : 0) +
      `</span>` + phoneIcon(`chevron`, 16) + `</b></button><button type="button" class="m-setting-row" data-open-sheet="people"><span class="m-setting-icon">` + phoneIcon(`users`) + `</span><span><strong>People</strong><small>Family names and assignments</small></span><b class="m-row-trailing">` + phoneIcon(`chevron`, 16) + `</b></button><button type="button" class="m-setting-row" data-open-sheet="shofar"><span class="m-setting-icon">` + phoneIcon(`bell`) + `</span><span><strong>Shabbat shofar</strong><small>` +
      (window.HQShofar && window.HQShofar.phoneStatus ? escapeHTML(window.HQShofar.phoneStatus()) : `Alerts and frame volume`) +
      `</small></span><b class="m-row-trailing">` + phoneIcon(`chevron`, 16) + `</b></button><button type="button" class="m-setting-row" data-remote="reload" data-write ` +
      (viewState.kodesh ? `disabled` : ``) +
      `><span class="m-setting-icon">` + phoneIcon(`refresh`) + `</span><span><strong>Reload frame</strong><small>Restart the frame app</small></span><b class="m-row-trailing">` + phoneIcon(`chevron`, 16) + `</b></button></div>`
    );
  }
  function renderPeople() {
    return (
      `<section class="m-frame-people">` +
      window.CONFIG.people
        .filter(function (item) {
          return !item.shared && item.id !== `family`;
        })
        .map(function (item, index) {
          return (
            `<label class="m-person-edit"><span class="m-person-dot" style="background-color:` +
            escapeHTML(item.color) +
            `" aria-hidden="true"></span><input class="m-input" type="text" data-person-name="` +
            escapeHTML(item.id) +
            `" aria-label="Person ` +
            (index + 1) +
            ` name" maxlength="30" value="` +
            escapeHTML(item.name) +
            `" data-write ` +
            (viewState.kodesh ? `disabled` : ``) +
            `></label>`
          );
        })
        .join(``) +
      `<button type="button" class="m-btn m-btn--solid m-person-save" data-action="save-people" data-write ` +
      (viewState.kodesh ? `disabled` : ``) +
      `>Save names</button></section>`
    );
  }
  function renderCurrentScreen() {
    return viewState.tab === `tasks`
      ? renderHeader(`Tasks`, !1, mobileData.tasks.filter(function (item) { return !item.done; }).length + ` open`) +
          `<main class="m-content">` +
          renderTasks() +
          `</main>`
      : viewState.tab === `frame`
        ? renderHeader(`Frame`) +
          `<main class="m-content">` +
          renderFrame() +
          `</main>`
        : viewState.tab === `music`
          ? renderHeader(`Music`) +
            `<main class="m-content">` +
            renderMusic() +
            `</main>`
        : viewState.screen === `manage`
          ? renderHeader(`Manage shopping`, !0) +
            `<main class="m-content">` +
            renderShoppingManagement() +
            `</main>`
          : viewState.screen === `store`
            ? renderHeader(
                (findStore(viewState.storeId) || {}).name || `Shopping`,
                !0,
              ) +
              `<main class="m-content">` +
              renderStore() +
              `</main>`
            : renderHeader(`Shopping`) +
              `<main class="m-content">` +
              renderShopping() +
              `</main>`;
  }
  function renderSheet() {
    if (!viewState.sheet) return ``;
    var sheetBody = ``;
    if (viewState.sheet === `people`) sheetBody = renderPeople();
    else if (viewState.sheet === `hidden`) sheetBody = window.HQHidden && window.HQHidden.html ? window.HQHidden.html() : `<p class="m-muted">Hidden photos are loading…</p>`;
    else if (viewState.sheet === `shofar`) sheetBody = window.HQShofar && window.HQShofar.phoneHtml ? window.HQShofar.phoneHtml() : `<p class="m-muted">Shabbat shofar settings are loading…</p>`;
    else if (viewState.sheet === `music-connect`) sheetBody = renderMusicConnect();
    return `<div class="m-sheet-backdrop` + (viewState.sheet === `hidden` ? ` m-sheet-backdrop--full` : ``) + `" data-sheet-backdrop><section class="m-sheet` + (viewState.sheet === `hidden` ? ` m-sheet--fullscreen` : ``) + `" role="dialog" aria-modal="true"><div class="m-sheet-grab"></div><header class="m-sheet-header"><h2 class="serif">` +
      escapeHTML(viewState.sheet === `people` ? `People` : viewState.sheet === `hidden` ? `Hidden photos` : viewState.sheet === `shofar` ? `Shabbat shofar` : `Connect 24six`) +
      `</h2><button type="button" class="m-sheet-close" data-sheet-close aria-label="Close">×</button></header><div class="m-sheet-body">` + sheetBody + `</div></section></div>`;
  }
  function renderModal() {
    if (!viewState.modal) return ``;
    var value = viewState.modal.body;
    return (
      viewState.modal.taskId &&
        (value =
          `<div class="m-task-options"><div><span class="m-muted">For</span>` +
          renderPersonChips(viewState.modal.who) +
          `</div><div><span class="m-muted">Due</span>` +
          renderDueChips(viewState.modal.due) +
          `</div></div><div class="m-modal-actions"><button type="button" class="m-btn m-btn--danger" data-modal-action="delete-task" data-write ` +
          (viewState.kodesh ? `disabled` : ``) +
          `>Delete task</button></div>`),
      `<div class="m-modal" role="dialog" aria-modal="true"><div class="m-modal-card"><h2 class="serif">` +
        escapeHTML(viewState.modal.title) +
        `</h2><div class="m-modal-body">` +
        value +
        `</div><div class="m-modal-actions">` +
        viewState.modal.actions
          .map(function (action) {
            return (
              `<button type="button" class="m-btn ` +
              (action.cls || ``) +
              `" data-modal-action="` +
              escapeHTML(action.id) +
              `" data-write ` +
              (viewState.kodesh ? `disabled` : ``) +
              `>` +
              escapeHTML(action.label) +
              `</button>`
            );
          })
          .join(``) +
        `<button type="button" class="m-btn m-btn--quiet" data-modal-action="cancel">Cancel</button></div></div></div>`
    );
  }
  function render() {
    if (appRoot) {
      if (
        document.activeElement &&
        appRoot.contains(document.activeElement) &&
        document.activeElement.hasAttribute(`data-person-name`)
      ) {
        viewState.renderPending = !0;
        var element = appRoot.querySelector(`.m-banner`);
        (element && (element.hidden = !viewState.kodesh),
          viewState.kodesh &&
            appRoot.querySelectorAll(`[data-write]`).forEach(function (item) {
              item.disabled = !0;
            }));
        return;
      }
      viewState.renderPending = !1;
      var value =
        viewState.tab === `shopping`
          ? `Shopping`
          : viewState.tab === `tasks`
            ? `Tasks`
            : viewState.tab === `music`
              ? `Music`
              : `Frame`;
      ((appRoot.innerHTML =
        `<div class="m-banner"` +
        (viewState.kodesh ? `` : ` hidden`) +
        `>Shabbat/Yom Tov — editing disabled</div>` +
        renderCurrentScreen() +
        `<nav class="m-bottom" aria-label="Main navigation">` +
        [
          [`shopping`, `Shopping`, `cart`],
          [`tasks`, `Tasks`, `tasks`],
          [`music`, `Music`, `music`],
          [`frame`, `Frame`, `home`],
        ]
          .map(function (item) {
            return (
              `<button type="button" class="m-tab` +
              (viewState.tab === item[0] ? ` is-on` : ``) +
              `" data-tab="` +
              item[0] +
              `"><svg class="m-tab-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
              (window.ICONS[item[2]] || (item[2] === `music` ? `<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>` : ``)) +
              `</svg>` +
              item[1] +
              `</button>`
            );
          })
          .join(``) +
        `</nav>` +
        renderModal() +
        renderSheet()),
        (appRoot.dataset.title = value),
        (appRoot.dataset.tab = viewState.tab));
      if (viewState.kodesh) {
        appRoot.querySelectorAll(`[data-write]`).forEach(function (item) {
          item.disabled = !0;
        });
      }
    }
  }
  function addGroceryItem(name, product) {
    if (!viewState.kodesh) {
      var store = findStore(viewState.storeId);
      if (store && ((name = String(name || ``).trim()), name)) {
        var item = mobileData.groceries.find(function (item) {
          return (
            item.store === store.id &&
            item.name.toLowerCase() === name.toLowerCase() &&
            !item.done
          );
        });
        if (item) item.qty = (Number(item.qty) || 1) + 1;
        else {
          var value =
              product ||
              getProducts().find(function (item) {
                return (
                  item.store === store.id &&
                  item.name.toLowerCase() === name.toLowerCase()
                );
              }),
            value2 = value
              ? value.name
              : name.charAt(0).toUpperCase() + name.slice(1),
            value3 = value ? value.cat : `Other`;
          (mobileData.groceries.push({
            id: createId(`g`),
            name: value2,
            cat: value3,
            qty: 1,
            store: store.id,
            done: !1,
            note: ``,
          }),
            value ||
              (mobileData.products.push({
                id: createId(`p`),
                name: value2,
                cat: value3,
                store: store.id,
              }),
              persistState(`products`)));
        }
        ((viewState.query = ``), persistState(`groceries`));
      }
    }
  }
  function addTask(title) {
    viewState.kodesh ||
      ((title = String(title || ``).trim()),
      title &&
        (mobileData.tasks.push({
          id: createId(`t`),
          title: title,
          who: viewState.who || null,
          due: viewState.due || null,
          done: !1,
          doneAt: null,
          created: new Date().toISOString(),
        }),
        (viewState.who = null),
        (viewState.due = null),
        (viewState.query = ``),
        persistState(`tasks`)));
  }
  function sendRemoteCommand(command, argument) {
    viewState.kodesh ||
      ((mobileData.remote = {
        seq: Number((mobileData.remote && mobileData.remote.seq) || 0) + 1,
        cmd: command,
        arg: argument || ``,
        at: new Date().toISOString(),
      }),
      persistState(`remote`),
      showSimpleToast(`Sent to frame`));
  }
  function showSimpleToast(message) {
    var old = appRoot.querySelector(`.m-toast`);
    old && old.remove();
    clearTimeout(viewState.toastTimer);
    var toast = document.createElement(`div`);
    toast.className = `m-toast`;
    toast.setAttribute(`role`, `status`);
    toast.textContent = message;
    appRoot.appendChild(toast);
    viewState.toastTimer = setTimeout(function () {
      toast.remove();
    }, 3000);
  }
  function refreshKodeshState() {
    fetch(`/api/zmanim`, {
      cache: `no-store`,
    })
      .then(function (result) {
        if (result.ok) return result.json();
      })
      .then(function (result) {
        if (result) {
          var value = Date.now();
          ((viewState.kodesh = (result.windows || []).some(function (item) {
            return (
              Date.parse(item.start) <= value && Date.parse(item.end) > value
            );
          })),
            render());
        }
      })
      .catch(function () {});
  }
  function openTaskEditor(task) {
    (openModal(
      `Edit task`,
      `<div class="m-task-options"><div><span class="m-muted">For</span>` +
        renderPersonChips(task.who) +
        `</div><div><span class="m-muted">Due</span>` +
        renderDueChips(task.due) +
        `</div></div><div class="m-modal-actions"><button type="button" class="m-btn m-btn--danger" data-modal-action="delete-task" data-write ` +
        (viewState.kodesh ? `disabled` : ``) +
        `>Delete task</button></div>`,
      [
        {
          id: `save-task`,
          label: `Save`,
          cls: `m-btn--solid`,
        },
      ],
    ),
      (viewState.modal.taskId = task.id),
      (viewState.modal.who = task.who || null),
      (viewState.modal.due = task.due || null));
  }
  function openProductEditor(product) {
    var store = findStore(product.store);
    (openModal(
      `Edit product`,
      `<label class="m-muted" for="mProductName">Name</label><input id="mProductName" class="m-input" name="productName" value="` +
        escapeHTML(product.name) +
        `"><label class="m-muted" for="mProductCat">Category</label><select id="mProductCat" class="m-input" name="productCat">` +
        (store.cats || [])
          .concat([`Other`])
          .map(function (item) {
            return (
              `<option value="` +
              escapeHTML(item) +
              `"` +
              (item === product.cat ? ` selected` : ``) +
              `>` +
              escapeHTML(item) +
              `</option>`
            );
          })
          .join(``) +
        `</select><label class="m-muted" for="mProductStore">Store</label><select id="mProductStore" class="m-input" name="productStore">` +
        getStores()
          .map(function (item) {
            return (
              `<option value="` +
              escapeHTML(item.id) +
              `"` +
              (item.id === product.store ? ` selected` : ``) +
              `>` +
              escapeHTML(item.name) +
              `</option>`
            );
          })
          .join(``) +
        `</select>`,
      [
        {
          id: `save-product`,
          label: `Save product`,
          cls: `m-btn--solid`,
        },
        {
          id: `delete-product`,
          label: `Delete product`,
          cls: `m-btn--danger`,
        },
      ],
    ),
      (viewState.modal.productId = product.id));
  }
  function confirmStoreDeletion(store) {
    var items = getStores().filter(function (item) {
      return item.id !== store.id;
    });
    (openModal(
      `Delete ` + store.name + `?`,
      `<p class="m-muted">Choose where to move its grocery items, or drop them from the list.</p>` +
        items
          .map(function (item) {
            return (
              `<button type="button" class="m-btn" data-store-move="` +
              escapeHTML(item.id) +
              `" data-write ` +
              (viewState.kodesh ? `disabled` : ``) +
              `>Move items to ` +
              escapeHTML(item.name) +
              `</button>`
            );
          })
          .join(``),
      [
        {
          id: `drop-store`,
          label: `Drop this store and its items`,
          cls: `m-btn--danger`,
        },
      ],
    ),
      (viewState.modal.storeId = store.id));
  }
  function handleClick(event) {
    if (viewState.held) {
      ((viewState.held = !1), event.preventDefault());
      return;
    }
    var value = event.target.closest(`button,[data-grocery-id],[data-sheet-backdrop]`);
    if (value && !isWriteDisabled(value)) {
      if (value.dataset.sheetClose !== void 0 || (value.dataset.sheetBackdrop !== void 0 && event.target === value))
        return ((viewState.sheet = null), render());
      if (value.dataset.musicBrowseTab) {
        viewState.musicList = null;
        loadMusicBrowse(value.dataset.musicBrowseTab, 1);
        return;
      }
      if (value.hasAttribute(`data-music-more`)) {
        loadMusicBrowse(viewState.musicBrowseTab, viewState.musicBrowsePage + 1);
        return;
      }
      if (value.dataset.openSheet) {
        viewState.sheet = value.dataset.openSheet;
        render();
        if (viewState.sheet === `hidden` && window.HQHidden && window.HQHidden.load) window.HQHidden.load();
        return;
      }
      if (value.dataset.tab) return switchTab(value.dataset.tab);
      if (value.dataset.musicAction) {
        var musicAction = value.dataset.musicAction;
        if (musicAction === `connect` || musicAction === `switch`) {
          viewState.musicStep = `credentials`;
          viewState.musicError = ``;
          viewState.sheet = `music-connect`;
          return render();
        }
        if (musicAction === `disconnect`) {
          musicPost(`/api/music/logout`, {}).then(function () {
            viewState.musicConnected = !1;
            viewState.musicProfile = null;
            viewState.musicList = null;
            viewState.musicError = ``;
            render();
          }).catch(function (error) {
            viewState.musicError = error.message;
            render();
          });
          return;
        }
        if (musicAction === `back`) {
          viewState.musicList = null;
          viewState.musicError = ``;
          return render();
        }
        if (musicAction === `play-all`) {
          var listQueue = (viewState.musicList && viewState.musicList.tiles || []).filter(function (tile) { return tile.kind === `track`; }).map(function (tile) {
            return { id: tile.id, title: tile.title, artist: tile.subtitle || ``, img: tile.img || `` };
          });
          if (listQueue.length) issueMusicCommand(`play`, listQueue, 0, 0);
          return;
        }
        if (musicAction === `toggle`) {
          var queued = mobileData.music && mobileData.music.queue || [];
          if (queued.length) issueMusicCommand(mobileData.music.playing ? `pause` : `resume`);
          return;
        }
        if (musicAction === `prev` || musicAction === `next`) {
          if (mobileData.music && mobileData.music.queue && mobileData.music.queue.length) issueMusicCommand(musicAction);
          return;
        }
      }
      if (value.dataset.profileId !== void 0) {
        var profile = viewState.musicProfiles.find(function (item) { return String(item.id) === value.dataset.profileId; });
        if (profile) selectMusicProfile(profile);
        return;
      }
      if (value.dataset.pinDigit !== void 0) {
        var digit = value.dataset.pinDigit;
        if (digit === `clear`) viewState.musicPin = ``;
        else if (digit === `back`) viewState.musicPin = viewState.musicPin.slice(0, -1);
        else if (viewState.musicPin.length < 4) viewState.musicPin += digit;
        if (viewState.musicPin.length === 4) loginMusicProfile(viewState.musicPin);
        else render();
        return;
      }
      if (value.dataset.musicTarget) {
        viewState.musicTarget = value.dataset.musicTarget;
        if (mobileData.music && mobileData.music.queue && mobileData.music.queue.length) {
          var oldCommand = mobileData.music;
          issueMusicCommand(oldCommand.playing ? `resume` : `pause`);
        } else {
          mobileData.music = Object.assign({}, mobileData.music || {}, { target: viewState.musicTarget });
          writeMusicState(mobileData.music);
        }
        return;
      }
      if (value.dataset.musicOpen) {
        openMusicList(value.dataset.musicKind || `playlist`, value.dataset.musicOpen, value.dataset.title);
        return;
      }
      if (value.dataset.musicTrack !== void 0) {
        var track = musicTileFromButton(value);
        if (track.id) issueMusicCommand(`play`, [track], 0, 0);
        return;
      }
      if (value.dataset.musicTrackIndex !== void 0) {
        var index = Number(value.dataset.musicTrackIndex),
          tracks = (viewState.musicList && viewState.musicList.tiles || []).filter(function (tile) { return tile.kind === `track`; }).map(function (tile) {
            return { id: tile.id, title: tile.title, artist: tile.subtitle || ``, img: tile.img || `` };
          });
        if (tracks.length) issueMusicCommand(`play`, tracks, index, index);
        return;
      }
      if (value.dataset.musicQueueIndex !== void 0) {
        var queueIndex = Number(value.dataset.musicQueueIndex);
        if (mobileData.music && mobileData.music.queue) issueMusicCommand(`play`, mobileData.music.queue, queueIndex, queueIndex);
        return;
      }
      if (value.dataset.storeOpen)
        return (
          (viewState.storeId = value.dataset.storeOpen),
          (viewState.screen = `store`),
          (viewState.query = ``),
          render()
        );
      if (value.dataset.manageTab)
        return ((viewState.manageTab = value.dataset.manageTab), render());
      if (value.dataset.manageStore)
        return ((viewState.manageStore = value.dataset.manageStore), render());
      if (value.dataset.who !== void 0)
        return (
          viewState.modal && viewState.modal.taskId
            ? (viewState.modal.who = value.dataset.who || null)
            : (viewState.who = value.dataset.who || null),
          render()
        );
      if (value.dataset.due !== void 0) {
        var item = taskDueOptions().find(function (item) {
          return item.id === value.dataset.due;
        });
        return (
          viewState.modal && viewState.modal.taskId
            ? (viewState.modal.due = item ? item.date : null)
            : (viewState.due = item ? item.date : null),
          render()
        );
      }
      if (value.dataset.addProduct) {
        var item2 = getProducts().find(function (item) {
          return item.id === value.dataset.addProduct;
        });
        item2 && addGroceryItem(item2.name, item2);
        return;
      }
      if (value.dataset.addNew) return addGroceryItem(value.dataset.addNew);
      if (value.dataset.remote)
        return sendRemoteCommand(value.dataset.remote, value.dataset.arg);
      if (value.dataset.storeMove) {
        var store = findStore(viewState.modal.storeId),
          store2 = findStore(value.dataset.storeMove);
        if (!store || !store2) return;
        (mobileData.groceries.forEach(function (grocery) {
          grocery.store === store.id &&
            ((grocery.store = store2.id),
            store2.cats.indexOf(grocery.cat) < 0 &&
              store2.cats.push(grocery.cat));
        }),
          (mobileData.products = getProducts().filter(function (item) {
            return item.store !== store.id;
          })),
          (mobileData.stores = getStores().filter(function (item) {
            return item.id !== store.id;
          })),
          (viewState.modal = null),
          (viewState.screen = `manage`),
          persistState(`groceries`),
          persistState(`products`),
          persistState(`stores`));
        return;
      }
      if (value.dataset.action) {
        var value2 = value.dataset.action,
          item3 = mobileData.groceries.find(function (item) {
            return item.id === value.dataset.id;
          });
        if (value2 === `back`)
          return (
            exitShoppingMode(),
            (viewState.screen = `stores`),
            (viewState.tab = `shopping`),
            render()
          );
        if (value2 === `manage`)
          return (
            exitShoppingMode(),
            (viewState.screen = `manage`),
            (viewState.manageTab = `stores`),
            render()
          );
        if (value2 === `start-shop`) return enterShoppingMode();
        if (value2 === `exit-shop`) return (exitShoppingMode(), render());
        if (value2 === `save-people`) {
          if (viewState.kodesh) return;
          (window.CONFIG.people
            .filter(function (item) {
              return !item.shared && item.id !== `family`;
            })
            .forEach(function (item) {
              var element = appRoot.querySelector(
                `[data-person-name="` + item.id + `"]`,
              );
              if (element) {
                var value11 = element.value.trim().slice(0, 30);
                if (value11) {
                  item.name = value11;
                  var item10 = mobileData.people.find(function (item2) {
                    return item2.id === item.id;
                  });
                  item10 && (item10.name = value11);
                }
              }
            }),
            persistState(`people`),
            showNamesSavedToast());
          return;
        }
        if (value2 === `done-shopping`) {
          var value3 = getDoneGroceries(viewState.storeId).length;
          if (
            !value3 ||
            !window.confirm(
              `Remove ` +
                value3 +
                ` checked ` +
                (value3 === 1 ? `item` : `items`) +
                ` from this list?`,
            )
          )
            return;
          ((mobileData.groceries = mobileData.groceries.filter(function (item) {
            return !(item.store === viewState.storeId && item.done);
          })),
            exitShoppingMode(),
            persistState(`groceries`));
          return;
        }
        if (value2 === `toggle-grocery` && item3) {
          ((item3.done = !item3.done), persistState(`groceries`));
          return;
        }
        if (value2 === `qty` && item3) {
          ((item3.qty = Math.max(
            1,
            Number(item3.qty || 1) + Number(value.dataset.delta),
          )),
            persistState(`groceries`));
          return;
        }
        if (value2 === `note` && item3) {
          var value4 = window.prompt(`Item note`, item3.note || ``);
          value4 !== null && ((item3.note = value4), persistState(`groceries`));
          return;
        }
        if (value2 === `rename-store`) {
          var store3 = findStore(value.dataset.id),
            value5 = window.prompt(`Store name`, store3.name);
          value5 &&
            value5.trim() &&
            ((store3.name = value5.trim()), persistState(`stores`));
          return;
        }
        if (value2 === `delete-store`)
          return confirmStoreDeletion(findStore(value.dataset.id));
        if (value2 === `move-cat`) {
          var store4 = findStore(value.dataset.store),
            number = Number(value.dataset.index),
            value6 = number + Number(value.dataset.delta);
          if (value6 >= 0 && value6 < store4.cats.length) {
            var value7 = store4.cats.splice(number, 1)[0];
            (store4.cats.splice(value6, 0, value7), persistState(`stores`));
          }
          return;
        }
        if (value2 === `edit-product`) {
          var item4 = getProducts().find(function (item) {
            return item.id === value.dataset.id;
          });
          item4 && openProductEditor(item4);
          return;
        }
        if (value2 === `toggle-done`)
          return ((viewState.doneOpen = !viewState.doneOpen), render());
        if (value2 === `clear-done`) {
          ((mobileData.tasks = mobileData.tasks.filter(function (item) {
            return !item.done;
          })),
            (viewState.doneOpen = !1),
            persistState(`tasks`));
          return;
        }
        if (value2 === `task` && value.dataset.taskId) {
          var item5 = mobileData.tasks.find(function (item) {
            return item.id === value.dataset.taskId;
          });
          if (!item5 || value.dataset.done === `1`) return;
          ((item5.done = !0),
            (item5.doneAt = new Date().toISOString()),
            persistState(`tasks`),
            showTaskCompletedToast(item5));
          return;
        }
      }
      if (value.dataset.modalAction) {
        var value8 = value.dataset.modalAction;
        if (value8 === `cancel` || value8 === `ok`) return closeModal();
        if (value8 === `save-task` && viewState.modal.taskId) {
          var item6 = mobileData.tasks.find(function (item) {
            return item.id === viewState.modal.taskId;
          });
          (item6 &&
            ((item6.who = viewState.modal.who),
            (item6.due = viewState.modal.due)),
            (viewState.modal = null),
            persistState(`tasks`));
          return;
        }
        if (value8 === `delete-task` && viewState.modal.taskId) {
          ((mobileData.tasks = mobileData.tasks.filter(function (item) {
            return item.id !== viewState.modal.taskId;
          })),
            (viewState.modal = null),
            persistState(`tasks`));
          return;
        }
        if (value8 === `delete-grocery` && viewState.modal.groceryId) {
          var value9 = viewState.modal.groceryId;
          ((mobileData.groceries = mobileData.groceries.filter(function (item) {
            return item.id !== value9;
          })),
            (viewState.modal = null),
            persistState(`groceries`));
          return;
        }
        if (value8 === `save-product` && viewState.modal.productId) {
          var item7 = getProducts().find(function (item) {
              return item.id === viewState.modal.productId;
            }),
            value5 = appRoot.querySelector(`[name="productName"]`).value.trim();
          if (item7 && value5) {
            ((item7.name = value5),
              (item7.cat = appRoot.querySelector(`[name="productCat"]`).value),
              (item7.store = appRoot.querySelector(
                `[name="productStore"]`,
              ).value));
            var store5 = findStore(item7.store);
            (store5 &&
              store5.cats.indexOf(item7.cat) < 0 &&
              (item7.cat = store5.cats[0] || `Other`),
              (viewState.modal = null),
              persistState(`products`));
          }
          return;
        }
        if (value8 === `delete-product` && viewState.modal.productId) {
          var item8 = getProducts().find(function (item) {
            return item.id === viewState.modal.productId;
          });
          ((mobileData.products = getProducts().filter(function (item) {
            return item.id !== viewState.modal.productId;
          })),
            (mobileData.groceries = mobileData.groceries.filter(
              function (item) {
                return !(
                  item8 &&
                  item.store === item8.store &&
                  item.name === item8.name &&
                  !item.done
                );
              },
            )),
            (viewState.modal = null),
            persistState(`products`),
            persistState(`groceries`));
          return;
        }
        if (value8 === `drop-store` && viewState.modal.storeId) {
          var value10 = viewState.modal.storeId;
          ((mobileData.groceries = mobileData.groceries.filter(function (item) {
            return item.store !== value10;
          })),
            (mobileData.products = getProducts().filter(function (item) {
              return item.store !== value10;
            })),
            (mobileData.stores = getStores().filter(function (item) {
              return item.id !== value10;
            })),
            (viewState.modal = null),
            (viewState.screen = `manage`),
            persistState(`groceries`),
            persistState(`products`),
            persistState(`stores`));
          return;
        }
      }
      if (value.dataset.taskId) {
        if (value.dataset.done === `1`) return;
        var item9 = mobileData.tasks.find(function (item) {
          return item.id === value.dataset.taskId;
        });
        item9 &&
          ((item9.done = !0),
          (item9.doneAt = new Date().toISOString()),
          persistState(`tasks`),
          showTaskCompletedToast(item9));
        return;
      }
    }
  }
  (appRoot.addEventListener(`click`, handleClick),
    appRoot.addEventListener(`pointerdown`, function (event) {
      var value = event.target.closest(`[data-task-id]`),
        value2 = event.target.closest(`[data-grocery-id]`),
        value3 = event.target.closest(`.m-product`);
      (value || value2 || value3) &&
        !viewState.kodesh &&
        ((viewState.held = !1),
        clearTimeout(viewState.holdTimer),
        (viewState.holdTimer = setTimeout(function () {
          if (((viewState.held = !0), value)) {
            var item = mobileData.tasks.find(function (item) {
              return item.id === value.dataset.taskId;
            });
            item && openTaskEditor(item);
          } else if (value2) {
            var item2 = mobileData.groceries.find(function (item) {
              return item.id === value2.dataset.groceryId;
            });
            (item2 &&
              openModal(
                item2.name,
                `<p class="m-muted">` +
                  escapeHTML(item2.note || `No note`) +
                  `</p>`,
                [
                  {
                    id: `delete-grocery`,
                    label: `Delete item`,
                    cls: `m-btn--danger`,
                  },
                ],
              ),
              viewState.modal &&
                item2 &&
                (viewState.modal.groceryId = item2.id));
          } else if (value3) {
            var item3 = getProducts().find(function (item) {
              return item.id === value3.dataset.productId;
            });
            item3 && openProductEditor(item3);
          }
        }, 600)));
    }),
    [`pointerup`, `pointercancel`, `pointerleave`].forEach(function (item) {
      appRoot.addEventListener(item, function () {
        clearTimeout(viewState.holdTimer);
      });
    }),
    appRoot.addEventListener(`submit`, function (event) {
      var value = event.target;
      event.preventDefault();
      if (value.dataset.form === `music-credentials`) {
          var email = value.querySelector(`[name="musicEmail"]`).value.trim(),
            password = value.querySelector(`[name="musicPassword"]`).value;
          viewState.musicEmail = email;
          viewState.musicPassword = password;
          viewState.musicError = ``;
          musicPost(`/api/music/profiles`, { email: email, password: password }).then(function (result) {
            viewState.musicProfiles = result.profiles || [];
            if (!viewState.musicProfiles.length) throw new Error(`No profiles found for this account.`);
            viewState.musicStep = `profiles`;
            render();
          }).catch(function (error) {
            viewState.musicError = error.message;
            render();
          });
      } else if (value.dataset.form === `music-search`) {
          viewState.musicSearch = value.querySelector(`[name="musicSearch"]`).value.trim();
          if (!viewState.musicSearch) return;
          musicPost(`/api/music/search`, { q: viewState.musicSearch }).then(function (result) {
            viewState.musicList = { kind: `search`, title: `Search results`, tiles: result.tiles || [] };
            viewState.musicError = ``;
            render();
          }).catch(function (error) {
            viewState.musicError = error.message;
            render();
          });
      } else if (!viewState.kodesh && value.dataset.form === `grocery`)
        addGroceryItem(value.querySelector(`[name="item"]`).value);
      else if (!viewState.kodesh && value.dataset.form === `task`)
        addTask(value.querySelector(`[name="task"]`).value);
      else if (!viewState.kodesh && value.dataset.form === `store`) {
          var value2 = value.querySelector(`[name="store"]`).value.trim();
          if (!value2) return;
          var id = createId(`s`);
          (mobileData.stores.push({
            id: id,
            name: value2,
            cats: [`Other`],
          }),
            (viewState.manageStore = id),
            persistState(`stores`));
      } else if (!viewState.kodesh && value.dataset.form === `category`) {
          var value3 = value.querySelector(`[name="category"]`).value.trim(),
            store = findStore(value.dataset.store);
          value3 &&
            store &&
            !store.cats.includes(value3) &&
            (store.cats.push(value3), persistState(`stores`));
      } else if (!viewState.kodesh && value.dataset.form === `product`) {
          var value4 = value.querySelector(`[name="product"]`).value.trim(),
            store2 = findStore(viewState.manageStore);
          if (!value4 || !store2) return;
          (mobileData.products.push({
            id: createId(`p`),
            name: value4,
            cat: `Other`,
            store: store2.id,
            }),
            persistState(`products`));
      }
    }),
    appRoot.addEventListener(`input`, function (event) {
      if (event.target.name === `item`) {
        viewState.query = event.target.value;
        var element = appRoot.querySelector(`#mSuggestions`);
        element && (element.innerHTML = renderProductSuggestions());
      } else if (event.target.name === `musicSearch`) {
        viewState.musicSearch = event.target.value;
      } else if (event.target.matches && event.target.matches(`[data-music-volume]`)) {
        viewState.musicVolume = Number(event.target.value);
      } else
        event.target.name === `task` && (viewState.query = event.target.value);
    }),
    appRoot.addEventListener(`change`, function (event) {
      if (event.target.matches && event.target.matches(`[data-music-volume]`)) {
        viewState.musicVolume = Number(event.target.value);
        issueMusicCommand(`volume`, null, null, viewState.musicVolume);
      }
    }),
    appRoot.addEventListener(`focusout`, function (event) {
      event.target.hasAttribute(`data-person-name`) &&
        setTimeout(function () {
          if (viewState.renderPending) {
            var value = document.activeElement;
            (value &&
              appRoot.contains(value) &&
              value.closest(`.m-frame-people`)) ||
              render();
          }
        }, 0);
    }),
    window.addEventListener(`fd:auth-required`, render),
    document.addEventListener(`hq:hidden-updated`, render),
    document.addEventListener(`hq:shofar-updated`, render),
    window.addEventListener(`scroll`, function () {
      appRoot.classList.toggle(`is-scrolled`, window.scrollY > 8);
    }, { passive: !0 }),
    document.addEventListener(`visibilitychange`, function () {
      document.hidden || (refreshKodeshState(), stateSync.poll(), pollMusicState());
    }),
    window.addEventListener(`fd:editing-disabled`, function () {
      ((viewState.kodesh = !0), render());
    }));
  function expireDoneTasks() {
    if (!viewState.kodesh) {
      var value = filterExpiredTasks(mobileData.tasks, new Date());
      value.length !== mobileData.tasks.length &&
        ((mobileData.tasks = value), persistState(`tasks`));
    }
  }
  (render(),
    stateSync.loadAll().then(render),
    stateSync.start(),
    loadMusicStatus(),
    pollMusicState(),
    setInterval(pollMusicState, 5e3),
    refreshKodeshState(),
    setInterval(refreshKodeshState, 6e4),
    setInterval(expireDoneTasks, 6e4),
    setInterval(function () {
      if (!(viewState.tab !== `frame` || document.hidden)) {
        var element = appRoot.querySelector(`[data-frame-last-seen]`);
        element && (element.textContent = frameLastSeenText());
      }
    }, 1e3));
})();
