// Builds the site, checks the change won't hide anything people have already ticked on a live menu, then deploys.
// Run: node deploy.mjs            (--check to stop before deploying, --force to deploy anyway)
//
// The live board stores ticks by item id and sign-ups by shop or station key. If a menu edit renames or removes
// one that's in use, those ticks would quietly stop showing, so this stops and says which.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const SITE = process.env.SITE ?? "https://recipes.mustier.ai";
execFileSync("node", ["build.mjs"], { stdio: "inherit" });

let lost = 0;
for (const f of readdirSync("dist").filter(f => f.endsWith(".menu.json"))) {
  const menu = JSON.parse(readFileSync(`dist/${f}`, "utf8"));
  const res = await fetch(`${SITE}/api/board/${menu.id}`, { signal: AbortSignal.timeout(15000) });
  if (res.status === 404) continue; // not live yet
  if (!res.ok) throw new Error(`couldn't read the live board for ${menu.id} (${res.status})`);
  const board = await res.json();
  const ids = new Set(menu.shops.flatMap(s => s.items.map(i => i.id)));
  const keys = new Set([...menu.shops.map(s => `shop:${s.key}`), ...menu.stations.map(s => `station:${s.key}`)]);
  const gone = [
    ...Object.entries(board.items).filter(([id]) => !id.startsWith("added-") && !ids.has(id)).map(([id, t]) => `item ${id} (${t.status}, ${t.by})`),
    ...Object.entries(board.claims).filter(([k, names]) => names.length && !keys.has(k)).map(([k, names]) => `${k} (${names.join(", ")})`),
  ];
  if (gone.length) {
    lost += gone.length;
    console.error(`\n${menu.id}: this build no longer has these, so they'd stop showing:\n  ${gone.join("\n  ")}`);
    console.error(`Give the renamed item or shop its old id or key in menus/${menu.id}.json, or rerun with --force.`);
  }
}
if (lost && !process.argv.includes("--force")) process.exit(1);
if (process.argv.includes("--check")) { console.log("Live boards OK."); process.exit(0); }
execFileSync("npx", ["-y", "wrangler@4", "deploy"], { stdio: "inherit" });
