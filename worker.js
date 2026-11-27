// Serves the static site from dist/, plus the shared state for menu pages.
//
//   /api/board/<menu>              raw board used by the menu page (recipes/menu.js)
//   /api/menus/<menu>              everything about the meal plus live status, in plain words (for ChatGPT and other assistants)
//   /api/menus/<menu>/recipes/<r>  one dish as numbered steps, already scaled
//   POST /api/menus/<menu>/items/<item>   { status: "sorted" | "need_to_buy" | "not_sorted", by }
//   POST /api/menus/<menu>/signups        { target: "shop:<key>" | "station:<key>", join, by }
//   POST /api/menus/<menu>/extras         { text, by }
//
//   WebSocket /api/board/<menu>    the board again on every change, so phones update straight away
//
// Each menu gets one Durable Object holding who has which item and who's on which job. Every change, from a phone
// or an assistant, is checked against the menu here and then applied by the object one at a time.
import { DurableObject } from "cloudflare:workers";
import { ACTIONS, applyChange, emptyBoard, newExtraId, EXTRA_ID } from "./recipes/board.js";

const text = (s, max) => String(s ?? "").trim().slice(0, max);
const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });

export class Board extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Load once and keep the board in memory. A change is then applied without any waiting between reading and
    // writing it, so two changes arriving together can't both start from the same old copy.
    ctx.blockConcurrencyWhile(async () => { this.board = (await ctx.storage.get("state")) ?? emptyBoard(); });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    if (request.headers.get("upgrade") === "websocket") {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify(this.board));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (request.method === "POST") {
      const change = await request.json(); // already checked by the worker
      if (change.kind === "item" && change.extra && !this.board.added.some(a => a.id === change.id))
        return json({ error: `no item with id ${change.id}; get the menu to see item ids` }, 404);
      applyChange(this.board, change);
      this.board.v++;
      this.ctx.storage.put("state", this.board); // the reply waits until this is saved
      const update = JSON.stringify(this.board);
      for (const ws of this.ctx.getWebSockets()) try { ws.send(update); } catch {}
    }
    return json(this.board);
  }

  webSocketClose(ws, code) { try { ws.close(code); } catch {} }
}

// Menus only change when the site is deployed, which starts fresh workers, so each worker reads each menu once.
const menus = new Map();
function getMenu(env, url, id) {
  if (!menus.has(id)) menus.set(id, env.ASSETS.fetch(new URL(`/${id}.menu.json`, url)).then(r => (r.ok ? r.json() : (menus.delete(id), null))));
  return menus.get(id);
}

// Turn what a phone or assistant asked for into a change the board can apply, or say what's wrong with it.
function toChange(menu, body) {
  const by = text(body.by, 40);
  if (!by) return { error: "say who you are: 'by' is the person's first name" };
  const at = Date.now();
  if (body.kind === "item") {
    const id = text(body.id, 80);
    const item = menu.shops.flatMap(s => s.items.map(i => ({ ...i, check: !!s.check }))).find(i => i.id === id);
    if (!item && !EXTRA_ID.test(id)) return { error: `no item with id ${id}; get the menu to see item ids`, status: 404 };
    if (!ACTIONS.includes(body.action)) return { error: `status must be ${ACTIONS.join(", ")}` };
    if (body.action === "need_to_buy" && !item?.check) return { error: "need_to_buy is only for cupboard and kitchen kit items; use sorted or not_sorted" };
    return { change: { kind: "item", id, action: body.action, check: !!item?.check, extra: !item, by, at } };
  }
  if (body.kind === "claim") {
    const [kind, key] = String(body.key ?? "").split(":");
    const ok = kind === "shop" ? menu.shops.some(s => s.key === key) : kind === "station" ? menu.stations.some(s => s.key === key) : false;
    if (!ok) return { error: "target must be shop:<key> or station:<key> from the menu" };
    return { change: { kind: "claim", key: `${kind}:${key}`, on: body.on !== false, by, at } };
  }
  if (body.kind === "add") {
    const t = text(body.text, 120);
    if (!t) return { error: "say what to add" };
    return { change: { kind: "add", id: EXTRA_ID.test(body.id) ? body.id : newExtraId(), text: t, by, at } };
  }
  if (body.kind === "remove") {
    if (!EXTRA_ID.test(body.id)) return { error: "only items someone added can be removed" };
    return { change: { kind: "remove", id: body.id, by, at } };
  }
  return { error: "unknown change" };
}

// Apply a change: { board } when saved, or { error, status }.
async function change(menu, board, body) {
  const { change, error, status = 400 } = toChange(menu, body);
  if (error) return { error, status };
  const res = await board.fetch("https://board/", { method: "POST", body: JSON.stringify(change) });
  return res.ok ? { board: await res.json() } : { error: (await res.json()).error, status: res.status };
}

// ───── assistant-friendly API ─────

function plainStatus(item, check, st) {
  const s = st?.status;
  if (check) return { have: "we have it", need: "missing, needs buying at G20", bought: "was missing, now bought" }[s] ?? "not checked yet";
  return s === "bought" ? "sorted" : "to buy";
}

function describe(menu, state, origin) {
  const shops = menu.shops.map(s => {
    const items = s.items.map(i => ({
      id: i.id, name: i.name, french_name: i.fr, quantity: i.qty, note: i.note, for: i.dishes || null,
      status: plainStatus(i, s.check, state.items[i.id]), ticked_by: state.items[i.id]?.by ?? null,
    }));
    return {
      key: s.key, name: s.title, kind: s.check ? "check at home" : "shop", what: s.where, address: s.address ?? null, hours: s.hours ?? null,
      map: s.map ?? null, people_going: state.claims[`shop:${s.key}`] ?? [], items,
      left: items.filter(i => i.status === "to buy" || i.status === "not checked yet" || i.status.startsWith("missing")).map(i => i.name),
    };
  });
  const extras = state.added.map(a => ({ id: a.id, name: a.text, added_by: a.by, status: state.items[a.id]?.status === "bought" ? "sorted" : "to buy", ticked_by: state.items[a.id]?.by ?? null }));
  const toBuy = shops.filter(s => s.kind === "shop").flatMap(s => s.items.filter(i => i.status === "to buy")).length
    + shops.flatMap(s => s.items.filter(i => i.status.startsWith("missing"))).length + extras.filter(e => e.status === "to buy").length;
  return {
    menu: menu.id, title: menu.title, when: menu.when, eaters: menu.eaters, near: menu.near, page: `${origin}/${menu.id}`,
    summary: { still_to_buy: toBuy, shops_with_things_left: shops.filter(s => s.kind === "shop" && s.left.length).map(s => s.name) },
    dishes: menu.dishes.map(d => ({ name: d.title, note: d.label, recipe: d.href.replace(`${menu.id}-`, ""), page: `${origin}/${d.href}` })),
    shops, extras,
    stations: menu.stations.map(s => ({ key: s.key, name: s.name, people: state.claims[`station:${s.key}`] ?? [], jobs: s.jobs.map(j => ({ when: j.when, job: j.text, recipe: j.recipe ?? null })) })),
  };
}

async function api(request, env, url, id, rest, menu) {
  const board = env.BOARD.get(env.BOARD.idFromName(id));
  const read = async () => (await board.fetch("https://board/")).json();

  if (request.method === "GET" && !rest) return json(describe(menu, await read(), url.origin));

  if (request.method === "GET" && rest.startsWith("recipes/")) {
    const r = rest.slice(8);
    if (!menu.dishes.some(d => d.href === `${id}-${r}`)) return json({ error: `no dish called ${r}; use one of ${menu.dishes.map(d => d.href.replace(`${id}-`, "")).join(", ")}` }, 404);
    return env.ASSETS.fetch(new URL(`/${id}-${r}.steps.json`, url));
  }

  if (request.method !== "POST") return json({ error: "not found" }, 404);
  const body = await request.json().catch(() => ({}));
  let asked;
  if (rest.startsWith("items/")) asked = { kind: "item", id: decodeURIComponent(rest.slice(6)), action: body.status };
  else if (rest === "signups") asked = { kind: "claim", key: body.target, on: body.join !== false };
  else if (rest === "extras") asked = { kind: "add", text: body.text };
  else return json({ error: "not found" }, 404);
  const result = await change(menu, board, { ...asked, by: body.by });
  return result.error ? json({ error: result.error }, result.status) : json(describe(menu, result.board, url.origin));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/(menus|board)\/([a-z0-9-]{1,40})(?:\/(.*))?$/);
    if (!m) return env.ASSETS.fetch(request);
    // only menus the build actually published get a board
    const menu = await getMenu(env, url, m[2]);
    if (!menu) return json({ error: `no menu called ${m[2]}` }, 404);
    if (m[1] === "menus") return api(request, env, url, m[2], m[3] ?? "", menu);
    if (m[3]) return json({ error: "not found" }, 404);
    const board = env.BOARD.get(env.BOARD.idFromName(m[2]));
    if (request.method !== "POST") return board.fetch(request); // the board, or a live connection to it
    const result = await change(menu, board, await request.json().catch(() => ({})));
    return result.error ? json({ error: result.error }, result.status) : json(result.board);
  },
};
