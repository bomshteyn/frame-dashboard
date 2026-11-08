const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function locked() { return window.App.kodeshActive; }
async function api(method = "GET", body) {
  const response = await fetch("/api/state/chores", { method, headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(response.status === 409 ? "Repeats changed on another device. Close and reopen to review." : result.error || "Could not load repeating chores.");
  return result;
}
function schedule(chore) {
  return chore.days.map(d => weekdays[d]).concat(chore.erevShabbos ? ["Erev Shabbos"] : [], chore.erevYomTov ? ["Erev Yom Tov"] : []).join(" · ") || "No scheduled days";
}
function message(error) { window.App.toast(window.App.esc(error.message)); }
async function list() {
  if (locked()) return;
  try {
    const state = await api(), chores = state.json || [], App = window.App;
    if (locked()) return;
    App.sheet('<div class="sheet-pad frame-chores"><div class="label">Family tasks</div><h2 class="serif sheet-h">Repeating chores</h2>' +
      '<p>Chores appear automatically on their scheduled days. Editing a repeat changes future occurrences.</p>' +
      '<button class="btn" data-new-repeat>Add repeating chore</button><div class="frame-repeat-list">' +
      (chores.length ? chores.map(c => '<button class="frame-repeat-row" data-repeat-id="' + App.esc(c.id) +
        '"><strong>↻ ' + App.esc(c.title) + '</strong><span>' + App.esc(schedule(c)) +
        (c.who ? ' · ' + App.esc(App.person(c.who)?.name || c.who) : ' · Anyone') + '</span><small>Edit repeat</small></button>').join("") :
        '<p class="frame-repeat-empty">No repeating chores yet.</p>') + '</div></div>', { onMount(sheet) {
        sheet.addEventListener("click", event => {
          if (locked()) return;
          if (event.target.closest("[data-new-repeat]")) edit();
          const row = event.target.closest("[data-repeat-id]");
          if (row) edit({ id: row.dataset.repeatId });
        });
      } });
  } catch (error) { message(error); }
}
async function edit(seed = {}, onSaved) {
  if (locked()) return;
  try {
    const state = await api(), chores = state.json || [], App = window.App;
    if (locked()) return;
    const existing = seed.id && chores.find(c => c.id === seed.id);
    if (seed.id && !existing) throw new Error("This repeat was deleted. Open the list again.");
    const chore = existing || { title: seed.title || "", who: seed.who || null, days: [], erevShabbos: false, erevYomTov: false };
    const people = window.CONFIG.people.filter(p => !p.shared || p.id === "family");
    App.sheet('<form class="sheet-pad frame-chores"><div class="label">' + (existing ? 'Edit repeat' : 'Repeat a task') +
      '</div><h2 class="serif sheet-h">Repeating chore</h2><p class="frame-repeat-error" role="alert"></p><fieldset>' +
      '<label>Task<input class="s-input" name="title" maxlength="200" value="' + App.esc(chore.title) + '" required></label>' +
      '<label>For<select name="who"><option value="">Anyone</option>' + people.map(p => '<option value="' + App.esc(p.id) + '"' +
        (chore.who === p.id ? ' selected' : '') + '>' + App.esc(p.name) + '</option>').join("") + '</select></label>' +
      '<div><span class="label">Repeat on</span><div class="frame-weekdays">' + weekdays.map((day, i) =>
        '<label class="frame-weekday"><input type="checkbox" name="days" value="' + i + '"' +
        (chore.days.includes(i) ? ' checked' : '') + '><span>' + day + '</span></label>').join("") + '</div></div>' +
      '<label class="frame-repeat-check"><input type="checkbox" name="erevShabbos"' + (chore.erevShabbos ? ' checked' : '') + '> Erev Shabbos</label>' +
      '<label class="frame-repeat-check"><input type="checkbox" name="erevYomTov"' + (chore.erevYomTov ? ' checked' : '') + '> Erev Yom Tov</label>' +
      '<p>Today’s matching chore appears right away. No chores are added during Shabbos or Yom Tov.</p>' +
      '<div class="frame-repeat-actions"><button class="btn" type="submit">Save repeat</button>' +
      (existing ? '<button class="btn btn--ghost" type="button" data-delete-repeat>Delete repeat</button>' : '') +
      '<button class="btn btn--ghost" type="button" data-close>Cancel</button></div></fieldset></form>', {
      onMount(sheet) {
        let busy = false;
        async function save(remove) {
          if (locked() || busy) return;
          const data = new FormData(sheet.querySelector("form")), title = data.get("title").trim(), days = data.getAll("days").map(Number);
          const definition = { id: existing?.id || crypto.randomUUID(), title, who: data.get("who") || null,
            days, erevShabbos: data.has("erevShabbos"), erevYomTov: data.has("erevYomTov") };
          const errorNode = sheet.querySelector('[role="alert"]');
          if (!remove && (!title || !(days.length || definition.erevShabbos || definition.erevYomTov))) {
            errorNode.textContent = "Enter a task and choose at least one day or erev option."; return;
          }
          if (remove && !confirm("Delete this repeat? Tasks already on the list will remain.")) return;
          busy = true; errorNode.textContent = ""; sheet.querySelector("fieldset").disabled = true;
          try {
            await api("PUT", { json: chores.filter(c => c.id !== definition.id).concat(remove ? [] : [definition]), base: state.updated });
            await App.reloadTasks();
            App.closeSheet();
            if (onSaved) onSaved();
            App.toast(remove ? "Repeat deleted" : "Repeat saved");
          } catch (error) { errorNode.textContent = error.message; }
          finally { busy = false; sheet.querySelector("fieldset").disabled = false; }
        }
        sheet.addEventListener("submit", event => { event.preventDefault(); save(false); });
        sheet.querySelector("[data-delete-repeat]")?.addEventListener("click", () => save(true));
      }
    });
  } catch (error) { message(error); }
}
window.FrameChores = { list, edit };
