// Serves the static site from dist/, plus a tiny shared store for menu pages at /api/board/<menu id>.
// Each menu gets one Durable Object holding who has which item and who's on which job.
import { DurableObject } from "cloudflare:workers";

const STATUSES = ["have", "bought", "need"];
const text = (s, max) => String(s ?? "").trim().slice(0, max);

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/board\/([a-z0-9-]{1,40})$/);
    if (!m) return env.ASSETS.fetch(request);
    // only menus the build actually published get a board
    const exists = await env.ASSETS.fetch(new URL(`/${m[1]}.menu.json`, url));
    if (!exists.ok) return new Response("no such menu", { status: 404 });
    return env.BOARD.get(env.BOARD.idFromName(m[1])).fetch(request);
  },
};
