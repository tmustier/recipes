// Shared menu page: who's cooking what, and the shopping list everyone ticks off together.
// Static content comes from the JSON in the page; the live board lives at /api/board/<id> (worker.js).
// What each tap does to an item is defined once, in board.js, and shared with the server.
//
// Keeping phones in step:
//   - Every tap goes into an outbox kept on the phone, shows straight away and is sent in order. If it can't
//     be sent (no signal), it stays in the outbox, is retried, and survives a reload. Resending is safe.
//   - The page shows the server's latest board with the outbox's changes on top.
//   - The server pushes the board over a WebSocket on every change. A check every few seconds is the backup.
//   - Each board has a version number; an older one than we already have is ignored.
import { applyChange, newExtraId } from "./board.js";

{
  const menu = JSON.parse(document.getElementById("menu").textContent);
  const app = document.getElementById("app");
  const API = `/api/board/${menu.id}`;
  const OUTBOX = `menu-outbox-${menu.id}`;
  let server = { items: {}, claims: {}, added: [], v: 0 }; // the newest board the server has sent us
  let outbox = JSON.parse(localStorage.getItem(OUTBOX) || "[]"); // our changes it hasn't confirmed yet
  let state = server; // what's shown: server plus outbox
  let me = localStorage.getItem("menu-name") || "";
  let view = localStorage.getItem("menu-view") || "todo";
  let offline = false; // the last attempt to reach the server failed
  let problem = ""; // a change the server turned down, shown briefly
  let recent = new Map(); // id -> time ticked here; ticked items linger in "To buy" briefly so a slip is easy to undo
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
        <p class="sync" id="sync" hidden></p>
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

  const unsaved = id => offline && outbox.some(c => c.id === id);

  function renderSync() {
    const el = document.getElementById("sync");
    const n = outbox.length;
    el.textContent = problem ? `Couldn't save: ${problem}`
      : offline && n ? `No connection. ${n === 1 ? "1 change" : `${n} changes`} will save when you're back online.`
      : offline ? "No connection. The list may be out of date." : "";
    el.hidden = !el.textContent;
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
    document.getElementById("count").textContent = toBuy ? `${toBuy} to buy` : "all done";
    document.querySelectorAll("#view button").forEach(b => b.classList.toggle("on", b.dataset.view === view));

    const lingering = id => recent.has(id) && Date.now() - recent.get(id) < 5000;
    const buyHtml = lists.map(s => {
      const shown = view === "todo" ? s.items.filter(i => status(i.id) !== "bought" || lingering(i.id)) : s.items;
      if (!shown.length && s.key === "added") return "";
      return `<div class="shop">
        <div class="row"><div><h3>${s.map ? `<a href="${esc(s.map)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}</h3>${s.where ? `<div class="where">${esc(s.where)}</div>` : ""}</div>${s.key === "added" ? "" : claim(`shop:${s.key}`, "I'll go")}</div>
        ${shown.length ? `<ul>${shown.map(i => row(i, {
          done: status(i.id) === "bought",
          who: unsaved(i.id) ? "Not saved yet" : status(i.id) === "bought" ? by(i.id) : status(i.id) === "need" ? `Missing, said ${by(i.id)}` : i.added ? i.note : "",
          side: i.added && status(i.id) !== "bought" ? "remove" : "", sideLabel: "Remove",
        })).join("")}</ul>` : `<p class="empty">All sorted</p>`}
      </div>`;
    }).join("");

    const checkHtml = check.map(s => {
      const items = s.items.filter(i => !["need", "bought"].includes(status(i.id)));
      const shown = view === "todo" ? items.filter(i => status(i.id) !== "have" || lingering(i.id)) : items;
      const moved = s.items.length - items.length;
      return `<div class="shop">
        <div class="row"><div><h3>${esc(s.title)}</h3><div class="where">${esc(s.where)}. Tick what we have.</div></div>${claim(`shop:${s.key}`, "I'll check")}</div>
        ${shown.length ? `<ul>${shown.map(i => row(i, {
          done: status(i.id) === "have", who: unsaved(i.id) ? "Not saved yet" : status(i.id) === "have" ? by(i.id) : "",
          side: status(i.id) === "have" ? "" : "need", sideLabel: "Need to buy",
        })).join("")}</ul>` : `<p class="empty">All checked</p>`}
        ${moved ? `<p class="empty">${moved} moved to the supermarket list</p>` : ""}
      </div>`;
    }).join("");

    document.getElementById("shops").innerHTML = buyHtml + checkHtml;
  }

  function render() { renderStations(); renderShops(); renderSync(); }

  function refresh() {
    state = outbox.reduce(applyChange, structuredClone(server));
    render();
  }

  // Take a board from the server unless we already have a newer one.
  function adopt(board) {
    if (board.v > server.v) server = board;
    refresh();
  }

  function setOffline(value) {
    if (offline === value) return;
    offline = value;
    render();
  }

  async function load() {
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) throw new Error();
      adopt(await res.json());
      setOffline(false);
      flush();
    } catch { setOffline(true); }
  }

  // A tap: show it now, keep it in the outbox until the server has it.
  function send(change) {
    if (!me) { askName(change); return; }
    outbox.push({ ...change, by: me, at: Date.now() });
    localStorage.setItem(OUTBOX, JSON.stringify(outbox));
    refresh();
    flush();
  }

  // Send the outbox in order, one change at a time. Stops at the first failure and tries again later.
  let flushing = false, retry = null, wait = 1000;
  async function flush() {
    if (flushing || !outbox.length) return;
    flushing = true;
    clearTimeout(retry);
    while (outbox.length) {
      let res = null;
      try { res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(outbox[0]) }); } catch {}
      if (!res || res.status >= 500 || res.status === 429) {
        setOffline(true);
        retry = setTimeout(flush, wait);
        wait = Math.min(wait * 2, 15000);
        break;
      }
      outbox.shift(); // saved, or turned down for good: either way, don't send it again
      localStorage.setItem(OUTBOX, JSON.stringify(outbox));
      wait = 1000;
      setOffline(false);
      const body = await res.json().catch(() => null);
      if (!res.ok) { problem = body?.error ?? "something went wrong"; setTimeout(() => { problem = ""; renderSync(); }, 6000); }
      if (res.ok && body) adopt(body); else refresh();
    }
    flushing = false;
  }

  // Live updates. The server sends the whole board when we connect and after every change.
  let socket = null, socketWait = 1000;
  function connect() {
    if (document.hidden || socket) return;
    socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${API}`);
    socket.onopen = () => { socketWait = 1000; setOffline(false); flush(); };
    socket.onmessage = e => { if (e.data !== "pong") adopt(JSON.parse(e.data)); };
    socket.onclose = () => {
      socket = null;
      if (!document.hidden) setTimeout(connect, socketWait);
      socketWait = Math.min(socketWait * 2, 15000);
    };
  }
  const live = () => socket?.readyState === WebSocket.OPEN;

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
    if (b.dataset.view) { recent.clear(); view = b.dataset.view; localStorage.setItem("menu-view", view); renderShops(); return; }
    if (b.dataset.claim) { send({ kind: "claim", key: b.dataset.claim, on: !b.classList.contains("on") }); return; }
    const id = b.closest(".item")?.dataset.id;
    if (!id) return;
    const done = ["have", "bought"].includes(status(id));
    if (b.dataset.tick !== undefined) {
      if (!done) { recent.set(id, Date.now()); setTimeout(renderShops, 5100); }
      send({ kind: "item", id, action: done ? "not_sorted" : "sorted", check: isCheck(id) });
    } else if (b.dataset.side === "need") send({ kind: "item", id, action: "need_to_buy", check: true });
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
      send({ kind: "add", id: newExtraId(), text });
    }
  });

  // ───── WebMCP: the same actions as tools for an AI agent using this page (ChatGPT's desktop browser,
  // Chrome with WebMCP on). They call the plain-language API in worker.js, then refresh what's on screen.
  const mc = document.modelContext ?? navigator.modelContext;
  if (mc?.registerTool) {
    const base = `/api/menus/${menu.id}`;
    const who = by => {
      const name = String(by ?? me ?? "").trim().slice(0, 40);
      if (!name) throw new Error("Ask the person for their first name and pass it as `by`.");
      if (!me) { me = name; localStorage.setItem("menu-name", me); renderMe(); }
      return name;
    };
    const call = async (path, body) => {
      const res = await fetch(base + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);
      return data; // the page hears about the change over its live connection
    };
    const byField = { type: "string", description: "First name of the person you're helping. Defaults to the name saved on this page." };
    const tools = [
      {
        name: "get_dinner_plan", title: "Get the dinner plan",
        description: `Everything about ${menu.title}: dishes, each shop with address, hours, map link and who's going, every item with quantity, French name, status and id, extras, and the cooking stations with who has joined. Call this first and after changes; other people update it live.`,
        inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true },
        execute: () => call(""),
      },
      {
        name: "tick_item", title: "Tick an item off the list",
        description: "Mark a shopping item. sorted: bought, or (cupboard and kitchen kit items) we have it. need_to_buy: a cupboard or kit item is missing, so it joins the G20 list. not_sorted: undo. Use the item id from get_dinner_plan.",
        inputSchema: { type: "object", required: ["item_id", "status"], properties: {
          item_id: { type: "string", description: "Item id from get_dinner_plan, e.g. cheeses" },
          status: { type: "string", enum: ["sorted", "need_to_buy", "not_sorted"] }, by: byField } },
        execute: ({ item_id, status, by }) => call(`/items/${encodeURIComponent(item_id)}`, { status, by: who(by) }),
      },
      {
        name: "sign_up", title: "Join or leave a shop run or cooking station",
        description: "Sign someone up to go to a shop or take a cooking station, or take them off it. Keys come from get_dinner_plan.",
        inputSchema: { type: "object", required: ["target"], properties: {
          target: { type: "string", description: "shop:<key> or station:<key>, e.g. shop:market or station:beef" },
          join: { type: "boolean", description: "false to leave; defaults to true" }, by: byField } },
        execute: ({ target, join = true, by }) => call("/signups", { target, join, by: who(by) }),
      },
      {
        name: "add_to_list", title: "Add something to the shopping list",
        description: "Add an extra item that isn't on the list yet, e.g. candles or champagne.",
        inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string", description: "What to buy, with a quantity if known" }, by: byField } },
        execute: ({ text, by }) => call("/extras", { text, by: who(by) }),
      },
      {
        name: "get_recipe", title: "Get a dish's recipe",
        description: "One dish as numbered steps in cooking order, with quantities already scaled for this dinner.",
        inputSchema: { type: "object", required: ["recipe"], properties: { recipe: { type: "string", enum: menu.dishes.map(d => d.href.replace(`${menu.id}-`, "")) } } },
        annotations: { readOnlyHint: true },
        execute: ({ recipe }) => call(`/recipes/${encodeURIComponent(recipe)}`),
      },
    ];
    // a thrown error reaches the agent only as "Tool execution failed", so hand back the reason instead
    for (const t of tools) {
      const run = t.execute;
      t.execute = async input => { try { return await run(input ?? {}); } catch (e) { return { error: e.message }; } };
      Promise.resolve(mc.registerTool(t)).catch(e => console.warn("WebMCP", t.name, e));
    }
  }

  renderMe(); refresh(); load(); connect();
  // backup check: every 4 s without a live connection, every 30 s with one
  let ticks = 0;
  setInterval(() => { if (!document.hidden && (!live() || ++ticks % 8 === 0)) load(); }, 4000);
  setInterval(() => { if (live()) socket.send("ping"); }, 25000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) socket?.close(); // phones drop it in the background anyway
    else { load(); connect(); }
  });
  addEventListener("online", () => { load(); connect(); });
  // another tab on this phone changed the outbox
  addEventListener("storage", e => { if (e.key === OUTBOX) { outbox = JSON.parse(e.newValue || "[]"); refresh(); } });
}
