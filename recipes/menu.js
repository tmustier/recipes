// Shared menu page: who's cooking what, and the shopping list everyone ticks off together.
// Static content comes from the JSON in the page; the live state lives at /api/board/<id> (worker.js).
//
// Item states: none (still to buy), "bought", "have" (already at home), "need" (a cupboard or kit item
// that turned out to be missing; it then shows on the shopping list).
(() => {
  const menu = JSON.parse(document.getElementById("menu").textContent);
  const app = document.getElementById("app");
  const API = `/api/board/${menu.id}`;
  let state = { items: {}, claims: {}, added: [], v: 0 };
  let me = localStorage.getItem("menu-name") || "";
  let view = localStorage.getItem("menu-view") || "todo";
  let pending = 0;
  let waiting = null; // the tap made before we knew who you are; replayed once you pick a name

  const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const status = id => state.items[id]?.status;
  const by = id => state.items[id]?.by;

  app.innerHTML = `
    <section class="me" id="me"></section>
    <section>
      <h2>Menu <span>for ${menu.eaters}</span></h2>
      <ul class="dishes">${menu.dishes.map(d => `
        <li><a href="${esc(d.href)}">${esc(d.title)}</a>${d.label ? ` <span class="muted">(${esc(d.label)})</span>` : ""}</li>`).join("")}
      </ul>
    </section>
    <section>
      <div class="bar">
        <h2>Shopping <span id="count"></span></h2>
        <nav class="seg" id="view"><button data-view="todo">To buy</button><button data-view="all">All</button></nav>
      </div>
      <div id="shops"></div>
      <form id="add" class="add"><input name="text" placeholder="Add something we need" autocomplete="off" enterkeyhint="done"><button>Add</button></form>
    </section>
    <section>
      <h2>Jobs</h2>
      <div id="stations"></div>
    </section>
    <div class="sheet" id="sheet" hidden>
      <div class="scrim" data-act="close"></div>
      <form class="panel" id="who">
        <h3>Who's this?</h3>
        <p class="muted">So everyone can see who's doing what. You only do this once.</p>
        <div class="names" id="known"></div>
        <div class="add"><input name="name" placeholder="Your name" autocomplete="given-name" enterkeyhint="go" maxlength="40"><button>Go</button></div>
      </form>
    </div>`;

  function renderMe() {
    document.getElementById("me").innerHTML = me
      ? `You're <b>${esc(me)}</b> <button class="link" data-act="rename">change</button>`
      : `<button class="pill" data-act="rename">Add your name</button>`;
  }

  function claim(key, label) {
    const list = state.claims[key] ?? [];
    const mine = list.includes(me);
    return `<div class="claim">${list.length ? `<span class="who">${list.map(esc).join(", ")}</span>` : ""}<button class="pill${mine ? " on" : ""}" data-claim="${esc(key)}">${mine ? "Leave" : label}</button></div>`;
  }

  function renderStations() {
    document.getElementById("stations").innerHTML = menu.stations.map(s => `
      <div class="station">
        <div class="row"><h3>${esc(s.name)}</h3>${claim(`station:${s.key}`, "Join")}</div>
        <ol>${s.jobs.map(j => `<li><em>${esc(j.when)}</em> ${esc(j.text)}${j.href ? ` <a href="${esc(j.href)}">${esc(j.title)}&nbsp;→</a>` : ""}</li>`).join("")}</ol>
      </div>`).join("");
  }

  // One line of the list. The big area ticks it; the small link is the other choice.
  function row(item, { done, side, sideLabel, who }) {
    return `<li class="item${done ? " done" : ""}" data-id="${esc(item.id)}">
      <button class="tick" data-tick>
        <span class="box">${done ? "✓" : ""}</span>
        <span class="what">
          <span class="line"><span class="name">${esc(item.name)}</span>${item.qty ? ` <span class="qty">${esc(item.qty)}</span>` : ""}</span>
          ${item.fr ? `<span class="fr">${esc(item.fr)}</span>` : ""}
          ${item.note && !done ? `<span class="note">${esc(item.note)}</span>` : ""}
          ${who ? `<span class="by">${esc(who)}</span>` : ""}
        </span>
      </button>
      ${side ? `<button class="side" data-side="${side}">${sideLabel}</button>` : ""}
    </li>`;
  }

  function renderShops() {
    const check = menu.shops.filter(s => s.check), buy = menu.shops.filter(s => !s.check);
    const added = state.added.map(a => ({ id: a.id, name: a.text, note: `Added by ${a.by}`, added: true }));
    // cupboard and kit items found missing join the supermarket list
    const missing = check.flatMap(s => s.items).filter(i => ["need", "bought"].includes(status(i.id)));
    const lists = buy.map(s => ({ ...s, items: s.key === "supermarket" ? [...s.items, ...missing] : s.items }));
    if (added.length) lists.push({ key: "added", title: "Added", where: "", items: added });

    const buyItems = lists.flatMap(s => s.items);
    const toBuy = buyItems.filter(i => !status(i.id) || status(i.id) === "need").length;
    const bought = buyItems.filter(i => status(i.id) === "bought").length;
    const atHome = Object.values(state.items).filter(x => x.status === "have").length;
    document.getElementById("count").textContent = toBuy ? `${toBuy} to buy` : "all done";
    document.querySelectorAll("#view button").forEach(b => b.classList.toggle("on", b.dataset.view === view));

    const buyHtml = lists.map(s => {
      const open = s.items.filter(i => status(i.id) !== "have");
      const shown = view === "todo" ? open.filter(i => status(i.id) !== "bought") : open;
      const home = s.items.filter(i => status(i.id) === "have");
      if (!shown.length && !home.length && s.key === "added") return "";
      return `<div class="shop">
        <div class="row"><div><h3>${s.map ? `<a href="${esc(s.map)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}</h3>${s.where ? `<div class="where">${esc(s.where)}</div>` : ""}</div>${s.key === "added" ? "" : claim(`shop:${s.key}`, "I'll go")}</div>
        ${shown.length ? `<ul>${shown.map(i => row(i, {
          done: status(i.id) === "bought",
          who: status(i.id) === "bought" ? `Bought by ${by(i.id)}` : status(i.id) === "need" ? `Missing, said ${by(i.id)}` : i.added ? i.note : "",
          side: i.added ? "remove" : status(i.id) === "need" ? "" : "have", sideLabel: i.added ? "Remove" : "We have it",
        })).join("")}</ul>` : `<p class="empty">${open.length ? `All bought` : "Nothing to buy"}</p>`}
        ${home.length ? `<details><summary>Already at home (${home.length})</summary><ul>${home.map(i => row(i, { done: true, who: `${by(i.id)} has it`, side: "undo", sideLabel: "Undo" })).join("")}</ul></details>` : ""}
      </div>`;
    }).join("");

    const checkHtml = check.map(s => {
      const items = s.items.filter(i => !["need", "bought"].includes(status(i.id)));
      const shown = view === "todo" ? items.filter(i => status(i.id) !== "have") : items;
      const moved = s.items.length - items.length;
      return `<div class="shop">
        <div class="row"><div><h3>${esc(s.title)}</h3><div class="where">${esc(s.where)}. Tick what we have.</div></div>${claim(`shop:${s.key}`, "I'll check")}</div>
        ${shown.length ? `<ul>${shown.map(i => row(i, {
          done: status(i.id) === "have", who: status(i.id) === "have" ? `${by(i.id)} has it` : "",
          side: status(i.id) === "have" ? "" : "need", sideLabel: "Need to buy",
        })).join("")}</ul>` : `<p class="empty">All checked</p>`}
        ${moved ? `<p class="empty">${moved} moved to the supermarket list</p>` : ""}
      </div>`;
    }).join("");

    document.getElementById("shops").innerHTML = buyHtml + checkHtml;
    document.getElementById("count").title = `${toBuy} to buy, ${bought} bought, ${atHome} at home`;
  }

  function render() { renderStations(); renderShops(); }

  async function load() {
    if (pending) return;
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (res.ok && !pending) { state = await res.json(); render(); }
    } catch {}
  }

  // Show the change straight away, then save it; the server's copy wins when it answers.
  async function send(change) {
    if (!me) { askName(change); return; }
    apply(change);
    render();
    pending++;
    try {
      const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...change, by: me }) });
      if (res.ok) state = await res.json();
    } catch {} finally { pending--; render(); }
  }

  function apply(c) {
    if (c.kind === "item") c.status ? (state.items[c.id] = { status: c.status, by: me }) : delete state.items[c.id];
    if (c.kind === "claim") {
      const list = new Set(state.claims[c.key] ?? []);
      c.on ? list.add(me) : list.delete(me);
      state.claims[c.key] = [...list];
    }
    if (c.kind === "remove") state.added = state.added.filter(a => a.id !== c.id);
  }

  // names already on the board, so someone on a second phone (or who cleared it) can just tap theirs
  function knownNames() {
    const all = [...Object.values(state.claims).flat(), ...Object.values(state.items).map(i => i.by), ...state.added.map(a => a.by)];
    return [...new Set(all.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function askName(change = null) {
    waiting = change;
    document.getElementById("known").innerHTML = knownNames().map(n => `<button type="button" class="pill" data-name="${esc(n)}">${esc(n)}</button>`).join("");
    document.getElementById("sheet").hidden = false;
    document.body.classList.add("locked");
    if (!knownNames().length) document.querySelector("#who input").focus();
  }

  function closeSheet() {
    document.getElementById("sheet").hidden = true;
    document.body.classList.remove("locked");
    document.querySelector("#who input").value = "";
  }

  function setName(name) {
    name = name.trim().slice(0, 40);
    if (!name) return;
    me = name;
    localStorage.setItem("menu-name", me);
    closeSheet(); renderMe(); render();
    const change = waiting; waiting = null;
    if (change) send(change);
  }

  const isCheck = id => menu.shops.some(s => s.check && s.items.some(i => i.id === id));

  app.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.name) { setName(b.dataset.name); return; }
    if (b.dataset.act === "rename") { askName(); return; }
    if (b.dataset.view) { view = b.dataset.view; localStorage.setItem("menu-view", view); renderShops(); return; }
    if (b.dataset.claim) { send({ kind: "claim", key: b.dataset.claim, on: !b.classList.contains("on") }); return; }
    const id = b.closest(".item")?.dataset.id;
    if (!id) return;
    const st = status(id);
    if (b.dataset.tick !== undefined) {
      // a cupboard item: tick means "we have it"; anything else: tick means "bought"
      const next = isCheck(id) && st !== "need" && st !== "bought" ? (st === "have" ? null : "have")
        : st === "bought" ? (isCheck(id) ? "need" : null) : st === "have" ? null : "bought";
      send({ kind: "item", id, status: next });
    } else if (b.dataset.side === "have") send({ kind: "item", id, status: "have" });
    else if (b.dataset.side === "need") send({ kind: "item", id, status: "need" });
    else if (b.dataset.side === "undo") send({ kind: "item", id, status: null });
    else if (b.dataset.side === "remove") send({ kind: "remove", id });
  });

  app.addEventListener("click", e => { if (e.target.dataset.act === "close") { waiting = null; closeSheet(); } });

  app.addEventListener("submit", e => {
    e.preventDefault();
    if (e.target.id === "who") setName(e.target.name.value);
    else if (e.target.id === "add") {
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
