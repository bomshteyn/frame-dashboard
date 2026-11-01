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
      held: !1,
      holdTimer: null,
      wakeLock: null,
      toastTimer: null,
      renderPending: !1,
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
  window.FD_PHONE = {
    data: mobileData,
    stateSync: stateSync,
  };
  function escapeHTML(value) {
    var element = document.createElement(`span`);
    return ((element.textContent = String(value ?? ``)), element.innerHTML);
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
      render());
  }
  function persistState(key) {
    (stateSync.persist(key), render());
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
  function renderHeader(title, showBackButton) {
    return (
      `<header class="m-header"><div class="m-header-row"><div><div class="m-brand">Home HQ</div><h1 class="m-title serif">` +
      escapeHTML(title) +
      `</h1></div>` +
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
      `<div class="m-section-heading"><h2 class="serif">Shopping</h2><span class="m-muted">Shared list</span></div><div class="m-store-grid">` +
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
        : `<div class="m-empty serif">Nothing left to buy.</div>`) +
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
      `<div class="m-section-heading"><h2 class="serif">Family tasks</h2><span class="m-muted">` +
      value.length +
      ` open</span></div><form class="m-form" data-form="task"><input class="m-input" name="task" aria-label="Add a task" placeholder="Add a task…" autocomplete="off" value="` +
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
        : `<div class="m-empty serif">Nothing to do right now.</div>`) +
      `</div>` +
      (value2.length
        ? `<button type="button" class="m-done-toggle" data-action="toggle-done">Done · ` +
          value2.length +
          ` ` +
          (viewState.doneOpen ? `· Hide` : `· Show`) +
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
  function frameLastSeenText() {
    if (!viewState.heartbeat) return `Frame has not checked in yet`;
    var value = Math.max(
        0,
        Math.floor((Date.now() - viewState.heartbeat) / 1e3),
      ),
      value2 = mobileData.heartbeat && mobileData.heartbeat.app,
      value3 =
        value2 && typeof value2.versionName == `string`
          ? ` · App ` +
            value2.versionName +
            ` · auto-updates ` +
            (value2.deviceOwner ? `on` : `off`)
          : ``;
    return `Frame last seen ` + value + `s ago` + value3;
  }
  function renderFrame() {
    return (
      `<div class="m-section-heading"><h2 class="serif">Frame remote</h2></div><div class="m-frame-status" data-frame-last-seen>` +
      escapeHTML(frameLastSeenText()) +
      `</div><div class="m-frame-grid">` +
      [
        [`Screen off`, `screenOff`, ``],
        [`Screen on`, `screenOn`, ``],
        [`Today`, `go`, `home`],
        [`Calendar`, `go`, `calendar`],
        [`Tasks`, `go`, `tasks`],
        [`Shopping`, `go`, `shopping`],
        [`Photos`, `go`, `photos`],
        [`Weather`, `go`, `weather`],
        [`Next photo`, `nextPhoto`, ``],
        [`Reload frame`, `reload`, ``],
      ]
        .map(function (item) {
          return (
            `<button type="button" class="m-frame-action" data-remote="` +
            item[1] +
            `" data-arg="` +
            escapeHTML(item[2]) +
            `" data-write ` +
            (viewState.kodesh ? `disabled` : ``) +
            `>` +
            escapeHTML(item[0]) +
            `<small>` +
            (item[1] === `screenOff`
              ? `Turn display off`
              : item[1] === `screenOn`
                ? `Turn display on`
                : item[1] === `go`
                  ? `Open on the frame`
                  : item[1] === `nextPhoto`
                    ? `Advance slideshow`
                    : `Send command`) +
            `</small></button>`
          );
        })
        .join(``) +
      `</div>` +
      renderPeople() +
      (window.HQHidden ? window.HQHidden.html() : ``)
    );
  }
  function renderPeople() {
    return (
      `<section class="m-frame-people"><div class="m-section-heading"><h2 class="serif">People</h2></div>` +
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
      ? renderHeader(`Tasks`) +
          `<main class="m-content">` +
          renderTasks() +
          `</main>`
      : viewState.tab === `frame`
        ? renderHeader(`Frame`) +
          `<main class="m-content">` +
          renderFrame() +
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
          appRoot.querySelectorAll(`[data-write]`).forEach(function (item) {
            item.disabled = viewState.kodesh;
          }));
        return;
      }
      viewState.renderPending = !1;
      var value =
        viewState.tab === `shopping`
          ? `Shopping`
          : viewState.tab === `tasks`
            ? `Tasks`
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
          [`frame`, `Frame`, `home`],
        ]
          .map(function (item) {
            return (
              `<button type="button" class="m-tab` +
              (viewState.tab === item[0] ? ` is-on` : ``) +
              `" data-tab="` +
              item[0] +
              `"><svg class="m-tab-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
              (window.ICONS[item[2]] || ``) +
              `</svg>` +
              item[1] +
              `</button>`
            );
          })
          .join(``) +
        `</nav>` +
        renderModal()),
        (appRoot.dataset.title = value));
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
      openModal(
        `Command sent`,
        `<p class="m-muted">The frame will ` +
          escapeHTML(
            command === `go`
              ? `open ` + argument
              : command === `nextPhoto`
                ? `show the next photo`
                : command === `screenOff`
                  ? `turn its screen off`
                  : command === `screenOn`
                    ? `turn its screen on`
                    : `reload`,
          ) +
          `.</p>`,
        [
          {
            id: `ok`,
            label: `Done`,
            cls: `m-btn--solid`,
          },
        ],
      ));
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
    var value = event.target.closest(`button,[data-grocery-id]`);
    if (value && !isWriteDisabled(value)) {
      if (value.dataset.tab) return switchTab(value.dataset.tab);
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
      if ((event.preventDefault(), !viewState.kodesh)) {
        if (value.dataset.form === `grocery`)
          addGroceryItem(value.querySelector(`[name="item"]`).value);
        else if (value.dataset.form === `task`)
          addTask(value.querySelector(`[name="task"]`).value);
        else if (value.dataset.form === `store`) {
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
        } else if (value.dataset.form === `category`) {
          var value3 = value.querySelector(`[name="category"]`).value.trim(),
            store = findStore(value.dataset.store);
          value3 &&
            store &&
            !store.cats.includes(value3) &&
            (store.cats.push(value3), persistState(`stores`));
        } else if (value.dataset.form === `product`) {
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
      }
    }),
    appRoot.addEventListener(`input`, function (event) {
      if (event.target.name === `item`) {
        viewState.query = event.target.value;
        var element = appRoot.querySelector(`#mSuggestions`);
        element && (element.innerHTML = renderProductSuggestions());
      } else
        event.target.name === `task` && (viewState.query = event.target.value);
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
    document.addEventListener(`visibilitychange`, function () {
      document.hidden || (refreshKodeshState(), stateSync.poll());
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
