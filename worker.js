// Serves the static site from dist/, plus the shared state for menu pages.
//
//   /api/board/<menu>              raw board used by the menu page (recipes/menu.js)
//   /api/menus/<menu>              everything about the meal plus live status, in plain words (for ChatGPT and other assistants)
//   /api/menus/<menu>/recipes/<r>  one dish as numbered steps, already scaled
//   POST /api/menus/<menu>/items/<item>   { status: "sorted" | "need_to_buy" | "not_sorted", by }
//   POST /api/menus/<menu>/signups        { target: "shop:<key>" | "station:<key>", join, by }
//   POST /api/menus/<menu>/extras         { text, by }
//
// Each menu gets one Durable Object holding who has which item and who's on which job.
import { DurableObject } from "cloudflare:workers";

const STATUSES = ["have", "bought", "need"];
const text = (s, max) => String(s ?? "").trim().slice(0, max);
const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });

export class Board extends DurableObject {
  async fetch(request) {
    const state = (await this.ctx.storage.get("state")) ?? { items: {}, claims: {}, added: [], v: 0 };
    if (request.method === "POST") {
      const change = await request.json().catch(() => ({}));
      const by = text(change.by, 40);
      if (!by) return new Response("name required", { status: 400 });
      if (change.kind === "item") {
        const id = text(change.id, 80);
        if (!id || !(change.status === null || STATUSES.includes(change.status))) return new Response("bad item", { status: 400 });
        if (change.status) state.items[id] = { status: change.status, by, at: Date.now() };
        else delete state.items[id];
      } else if (change.kind === "claim") {
        const key = text(change.key, 80);
        const names = new Set(state.claims[key] ?? []);
        change.on ? names.add(by) : names.delete(by);
        state.claims[key] = [...names];
      } else if (change.kind === "add") {
        const t = text(change.text, 120);
        if (!t || state.added.length >= 200) return new Response("bad add", { status: 400 });
        state.added.push({ id: `added-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, text: t, by });
      } else if (change.kind === "remove") {
        state.added = state.added.filter(a => a.id !== change.id);
        delete state.items[change.id];
      } else return new Response("unknown change", { status: 400 });
      state.v++;
      await this.ctx.storage.put("state", state);
    }
    return Response.json(state, { headers: { "cache-control": "no-store" } });
  }
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

async function api(request, env, url, id, rest) {
  const menuRes = await env.ASSETS.fetch(new URL(`/${id}.menu.json`, url));
  if (!menuRes.ok) return json({ error: `no menu called ${id}` }, 404);
  const menu = await menuRes.json();
  const board = env.BOARD.get(env.BOARD.idFromName(id));
  const read = async () => (await board.fetch("https://board/")).json();
  const write = async change => {
    const res = await board.fetch("https://board/", { method: "POST", body: JSON.stringify(change) });
    return res.ok ? null : await res.text();
  };

  if (request.method === "GET" && !rest) return json(describe(menu, await read(), url.origin));

  if (request.method === "GET" && rest.startsWith("recipes/")) {
    const r = rest.slice(8);
    if (!menu.dishes.some(d => d.href === `${id}-${r}`)) return json({ error: `no dish called ${r}; use one of ${menu.dishes.map(d => d.href.replace(`${id}-`, "")).join(", ")}` }, 404);
    return env.ASSETS.fetch(new URL(`/${id}-${r}.steps.json`, url));
  }

  if (request.method !== "POST") return json({ error: "not found" }, 404);
  const body = await request.json().catch(() => ({}));
  const by = text(body.by, 40);
  if (!by) return json({ error: "say who you are: 'by' is the person's first name" }, 400);

  let error;
  if (rest.startsWith("items/")) {
    const itemId = rest.slice(6);
    const state = await read();
    const shop = menu.shops.find(s => s.items.some(i => i.id === itemId));
    if (!shop && !state.added.some(a => a.id === itemId)) return json({ error: `no item with id ${itemId}; get the menu to see item ids` }, 404);
    const check = shop?.check;
    const current = state.items[itemId]?.status;
    const status = { sorted: check ? (current === "need" ? "bought" : "have") : "bought", need_to_buy: check ? "need" : null, not_sorted: null }[body.status];
    if (status === undefined) return json({ error: "status must be sorted, need_to_buy or not_sorted" }, 400);
    error = await write({ kind: "item", id: itemId, status, by });
  } else if (rest === "signups") {
    const [kind, key] = String(body.target ?? "").split(":");
    const ok = kind === "shop" ? menu.shops.some(s => s.key === key) : kind === "station" ? menu.stations.some(s => s.key === key) : false;
    if (!ok) return json({ error: "target must be shop:<key> or station:<key> from the menu" }, 400);
    error = await write({ kind: "claim", key: `${kind}:${key}`, on: body.join !== false, by });
  } else if (rest === "extras") {
    error = await write({ kind: "add", text: body.text, by });
  } else return json({ error: "not found" }, 404);

  if (error) return json({ error }, 400);
  return json(describe(menu, await read(), url.origin));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const a = url.pathname.match(/^\/api\/menus\/([a-z0-9-]{1,40})(?:\/(.*))?$/);
    if (a) return api(request, env, url, a[1], a[2] ?? "");
    const m = url.pathname.match(/^\/api\/board\/([a-z0-9-]{1,40})$/);
    if (!m) return env.ASSETS.fetch(request);
    // only menus the build actually published get a board
    const exists = await env.ASSETS.fetch(new URL(`/${m[1]}.menu.json`, url));
    if (!exists.ok) return new Response("no such menu", { status: 404 });
    return env.BOARD.get(env.BOARD.idFromName(m[1])).fetch(request);
  },
};
