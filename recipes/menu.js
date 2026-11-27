// Shared menu page: who's cooking what, and the shopping list everyone ticks off together.
// Static content comes from the JSON in the page; the live state lives at /api/board/<id> (worker.js).
(() => {
  const menu = JSON.parse(document.getElementById("menu").textContent);
  const app = document.getElementById("app");
  const API = `/api/board/${menu.id}`;
  const STATUS = { have: "at home", getting: "getting it", bought: "bought" };
  let state = { items: {}, claims: {}, added: [], v: 0 };
  let me = localStorage.getItem("menu-name") || "";
  let filter = localStorage.getItem("menu-filter") || "all";
  let pending = 0;

  const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const names = list => list?.length ? list.map(esc).join(", ") : "";

  app.innerHTML = `
    <section class="me" id="me"></section>
    ${menu.intro ? `<p class="intro">${esc(menu.intro)}</p>` : ""}
    <section>
      <h2>Menu <span>for ${menu.eaters}</span></h2>
      <ul class="dishes">${menu.dishes.map(d => `
        <li><a href="${esc(d.href)}">${esc(d.title)}</a> <span class="muted">×${d.scale}${d.serves ? ` · serves ${d.serves}` : ""}</span>${d.label ? `<div class="muted">${esc(d.label)}</div>` : ""}</li>`).join("")}
      </ul>
      <p class="muted small">Recipe pages show one batch; multiply the amounts by the × number.</p>
    </section>
    <section>
      <h2>Shopping <span id="count"></span></h2>
      <nav class="filter" id="filter">
        <button data-filter="all">All</button><button data-filter="todo">Still to get</button><button data-filter="mine">Mine</button>
      </nav>
      <div id="shops"></div>
      <form id="add" class="add"><input name="text" placeholder="Add something we need…" autocomplete="off"><button>Add</button></form>
    </section>
    <section>
      <h2>Jobs <span>tap a station to join it</span></h2>
      <div id="stations"></div>
    </section>`;

  function renderMe() {
    document.getElementById("me").innerHTML = me
      ? `You're <b>${esc(me)}</b> · <button class="link" data-act="rename">change</button>`
      : `<form id="name" class="add"><input name="name" placeholder="Your name, so others see who's doing what" autocomplete="given-name" required><button>Save</button></form>`;
  }

  function claim(key, label = "Join") {
    const list = state.claims[key] ?? [];
    const mine = list.includes(me);
    return `<button class="claim${mine ? " on" : ""}" data-claim="${esc(key)}">${mine ? "Leave" : label}</button>${list.length ? `<span class="who">${names(list)}</span>` : `<span class="who none">nobody yet</span>`}`;
  }

  function renderStations() {
    document.getElementById("stations").innerHTML = menu.stations.map(s => `
      <div class="station">
        <div class="row"><h3>${esc(s.name)}</h3>${claim(`station:${s.key}`)}</div>
        <ol>${s.jobs.map(j => `<li><em>${esc(j.when)}</em> ${esc(j.text)}${j.recipe ? ` <a href="${esc(j.recipe)}">${esc(j.title)} →</a>` : ""}</li>`).join("")}</ol>
      </div>`).join("");
  }

  function visible(item, shopKey) {
    const st = state.items[item.id];
    if (filter === "todo") return !st || st.status === "getting";
    if (filter === "mine") return (st && st.by === me && st.status !== "have") || (state.claims[`shop:${shopKey}`] ?? []).includes(me);
    return true;
  }

  function itemRow(item) {
    const st = state.items[item.id];
    return `<li class="item${st ? ` s-${st.status}` : ""}" data-id="${esc(item.id)}">
      <div class="what">
        <span class="name">${esc(item.name)}</span>${item.qty ? ` <span class="qty">${esc(item.qty)}</span>` : ""}
        ${item.fr ? `<div class="fr">${esc(item.fr)}</div>` : ""}
        ${item.note ? `<div class="note">${esc(item.note)}</div>` : ""}
        ${item.dishes ? `<div class="for">${esc(item.dishes)}</div>` : ""}
        ${st ? `<div class="status">${STATUS[st.status]} · ${esc(st.by)}</div>` : ""}
      </div>
      <div class="acts">${Object.entries(STATUS).map(([s, label]) => `<button data-status="${s}"${st?.status === s ? ` class="on"` : ""}>${label}</button>`).join("")}${item.removable ? `<button data-remove="${esc(item.id)}" title="Remove">×</button>` : ""}</div>
    </li>`;
  }

  function renderShops() {
    const shops = [...menu.shops, { key: "added", title: "Added by you all", where: "", items: state.added.map(a => ({ id: a.id, name: a.text, qty: "", note: `added by ${a.by}`, removable: true })) }];
    const all = shops.flatMap(s => s.key === "kit" || s.key === "pantry" ? [] : s.items);
    const done = all.filter(i => ["have", "bought"].includes(state.items[i.id]?.status)).length;
    document.getElementById("count").textContent = `${done} of ${all.length} sorted`;
    document.querySelectorAll("#filter button").forEach(b => b.classList.toggle("on", b.dataset.filter === filter));
    document.getElementById("shops").innerHTML = shops.map(s => {
      const items = s.items.filter(i => visible(i, s.key));
      if (!items.length && (s.key === "added" || filter !== "all")) return "";
      return `<div class="shop">
        <div class="row"><h3>${esc(s.title)}</h3>${s.key === "added" ? "" : claim(`shop:${s.key}`, s.key === "pantry" || s.key === "kit" ? "I'll check" : "I'll go")}</div>
        ${s.where ? `<div class="muted small">${esc(s.where)}</div>` : ""}
        <ul>${items.map(itemRow).join("")}</ul>
      </div>`;
    }).join("") || `<p class="muted">Nothing here.</p>`;
  }

  function render() { renderStations(); renderShops(); }

  async function load() {
    if (pending) return;
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (res.ok && !pending) { state = await res.json(); render(); }
    } catch {}
  }

  async function send(change) {
    if (!me) { askName(); return; }
    pending++;
    try {
      const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...change, by: me }) });
      if (res.ok) state = await res.json();
    } finally { pending--; render(); }
  }

  function askName() {
    me = ""; renderMe();
    const input = document.querySelector("#name input");
    input.scrollIntoView({ block: "center" }); input.focus();
  }

  app.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.act === "rename") { localStorage.removeItem("menu-name"); askName(); return; }
    if (b.dataset.filter) { filter = b.dataset.filter; localStorage.setItem("menu-filter", filter); renderShops(); return; }
    if (b.dataset.claim) { send({ kind: "claim", key: b.dataset.claim, on: !b.classList.contains("on") }); return; }
    if (b.dataset.remove) { send({ kind: "remove", id: b.dataset.remove }); return; }
    if (b.dataset.status) {
      const id = b.closest(".item").dataset.id;
      send({ kind: "item", id, status: b.classList.contains("on") ? null : b.dataset.status });
    }
  });

  app.addEventListener("submit", e => {
    e.preventDefault();
    if (e.target.id === "name") {
      me = e.target.name.value.trim().slice(0, 40);
      if (!me) return;
      localStorage.setItem("menu-name", me); renderMe(); render();
    } else if (e.target.id === "add") {
      const text = e.target.text.value.trim();
      if (!text) return;
      e.target.text.value = "";
      send({ kind: "add", text });
    }
  });

  renderMe(); render(); load();
  setInterval(() => { if (!document.hidden) load(); }, 4000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
