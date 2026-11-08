const root = document.getElementById("admin");
let families = null, issued = null, error = "", busy = false;
function esc(value) {
  const el = document.createElement("span");
  el.textContent = String(value ?? "");
  return el.innerHTML.replaceAll('"', "&quot;");
}
async function api(path, method = "GET", body) {
  const response = await fetch("/api/admin/" + path, { method, headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) { families = null; issued = null; }
    throw new Error(result.error || "Request failed");
  }
  return result;
}
function time(value) { return value ? new Date(value).toLocaleString() : "Never"; }
function setupText() {
  return "On the frame's login screen enter PIN " + issued.pin + ". On your phone open " + location.origin +
    "/m and enter the same PIN, then go to Settings to add your photos album, calendars and city.";
}
function render() {
  root.innerHTML = '<header><div><p class="muted">HOME HQ · ADMINISTRATION</p><h1>Families</h1></div>' +
    (families ? '<button data-action="logout">Log out</button>' : '') + '</header>' +
    '<p class="error" role="alert">' + esc(error) + '</p><fieldset' + (busy ? " disabled" : "") + '>' +
    (families === null ? '<section class="login"><h2>Admin login</h2><p class="muted">Use your administrator password, not a family PIN.</p>' +
      '<form id="login"><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Log in</button></form></section>' :
      (issued ? '<section class="notice" role="status"><h2>New family PIN</h2><strong class="pin">' + esc(issued.pin) +
        '</strong><p>Save this now. It is shown only once.</p><label>Setup instructions<textarea id="setupText" readonly>' +
        esc(setupText()) + '</textarea></label><div class="actions"><button data-action="copy">Copy setup text</button><button data-action="dismiss">I saved the PIN</button></div></section>' : '') +
      '<section><h2>Add a family</h2><form id="add"><label>Family name<input name="name" maxlength="100" required></label><button class="primary">Add family</button></form></section>' +
      (families.length ? families.map(f => '<article><h2>' + esc(f.name) + '</h2><small>Family ' + f.id + ' · Created ' +
        esc(time(f.created)) + '</small><small>Last frame heartbeat: ' + esc(time(f.heartbeat)) + '</small><div class="actions">' +
        '<button data-action="rename" data-id="' + f.id + '">Rename</button>' + (f.id === 1 ? '<small>Owner family · PIN managed separately</small>' :
          '<button data-action="pin" data-id="' + f.id + '">Reset PIN</button><button class="danger" data-action="delete" data-id="' + f.id + '">Delete</button>') + '</div></article>').join('') :
        '<section><p>No families yet. Add one above.</p></section>')) + '</fieldset>';
}
async function run(action) {
  if (busy) return;
  busy = true; error = ""; render();
  try { await action(); } catch (e) { error = e.message; }
  finally { busy = false; render(); }
}
root.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target, data = new FormData(form);
  run(async () => {
    if (form.id === "login") await api("login", "POST", { password: data.get("password") });
    else { issued = null; issued = await api("households", "POST", { name: data.get("name").trim() }); }
    families = await api("households");
  });
});
root.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button || busy) return;
  const action = button.dataset.action, id = Number(button.dataset.id), family = families?.find(f => f.id === id);
  if (action === "dismiss") { issued = null; render(); return; }
  if (action === "copy") {
    navigator.clipboard.writeText(setupText()).then(() => { button.textContent = "Copied"; }).catch(() => {
      root.querySelector("#setupText").select();
    });
    return;
  }
  let name;
  if (action === "rename") { name = prompt("Family name", family.name); if (name === null) return; }
  if (action === "pin" && !confirm("Reset the PIN for " + family.name + "? Existing frames stay logged in.")) return;
  if (action === "delete" && !confirm("Delete " + family.name + " and all its data? This cannot be undone.")) return;
  run(async () => {
    issued = null;
    if (action === "logout") { await api("logout", "POST"); families = null; return; }
    if (action === "rename") await api("households/" + id, "PATCH", { name });
    if (action === "pin") issued = await api("households/" + id + "/pin", "POST", {});
    if (action === "delete") await api("households/" + id, "DELETE");
    families = await api("households");
  });
});
render();
try { families = await api("households"); } catch (e) { if (e.message !== "Authentication required") error = e.message; }
render();
