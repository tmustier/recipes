// Builds a shared menu page from menus/<id>.json: the dishes (each a recipe scaled up or down),
// one combined shopping list grouped by shop, and the cooking jobs split into stations.
// The live part (who has what, who's doing which job) is stored by worker.js and drawn by recipes/menu.js.
import { ingredients, formatQuantity } from "./recipe.mjs";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const COUNTED = ["", "cloves", "clove", "sprigs", "bunch", "sheet", "sheets"];
const PLURALS = { sheet: "sheets", bunch: "bunches", clove: "cloves", sprig: "sprigs" };
const SPOONS = ["tsp", "Tbsp", "cup", "cups"];

// Round a scaled amount to something you'd measure or buy: whole shallots, 5 g steps, half spoons.
function round(n, unit) {
  if (COUNTED.includes(unit)) return Math.ceil(n - 0.05);
  if (SPOONS.includes(unit)) return Math.ceil(n * 2 - 0.05) / 2;
  if (unit === "g" || unit === "ml") return n <= 100 ? Math.ceil(n / 5) * 5 : n <= 1000 ? Math.ceil(n / 10) * 10 : Math.ceil(n / 50) * 50;
  return Math.round(n * 100) / 100;
}

// 1800 g reads better as 1.8 kg
function tidy({ amount, unit }) {
  const big = Array.isArray(amount) ? amount[0] : amount;
  if (unit === "g" && big >= 1000) return { amount: Array.isArray(amount) ? amount.map(a => a / 1000) : amount / 1000, unit: "kg" };
  if (unit === "ml" && big >= 1000) return { amount: Array.isArray(amount) ? amount.map(a => a / 1000) : amount / 1000, unit: "l" };
  return { amount, unit };
}

// Combine every ingredient of every dish into one list, keyed by the name in menu.items.
export function shoppingList(menu, recipes) {
  const items = new Map();
  for (const dish of menu.dishes) {
    const r = recipes[dish.recipe];
    if (!r) throw new Error(`menus: no recipe called ${dish.recipe}`);
    for (const ing of ingredients(r)) {
      let info = menu.items[ing.name];
      if (!info) throw new Error(`menus: add "${ing.name}" (from ${dish.recipe}) to "items"`);
      if (info.skip) continue;
      const name = info.as ?? ing.name;
      info = menu.items[name];
      const item = items.get(name) ?? { id: slug(name), name, fr: info.fr, shop: info.shop, note: info.note ?? null, sums: {}, words: null, dishes: new Set() };
      if (ing.qty.amount === null) item.words ??= ing.qty.unit;
      else {
        const [lo, hi] = [].concat(ing.qty.amount);
        const s = item.sums[ing.qty.unit] ??= [0, 0];
        s[0] += lo * dish.scale; s[1] += (hi ?? lo) * dish.scale;
      }
      item.dishes.add(r.title);
      items.set(name, item);
    }
  }
  const list = [...items.values()].map(({ sums, words, dishes, ...item }) => {
    const qty = Object.entries(sums).map(([unit, [lo, hi]]) => {
      const a = round(lo, unit), b = round(hi, unit);
      const plural = b > 1 && PLURALS[unit] ? PLURALS[unit] : unit;
      return formatQuantity(tidy({ amount: a === b ? a : [a, b], unit: plural }));
    }).join(" + ") || words;
    return { ...item, qty, dishes: [...dishes].join(", ") };
  });
  for (const x of menu.extras ?? []) list.push({ id: slug(`${x.shop}-${x.name}`), name: x.name, fr: null, shop: x.shop, note: x.note ?? null, qty: x.qty, dishes: "" });
  return menu.shops.map(s => ({ ...s, items: list.filter(i => i.shop === s.key) }));
}

export function renderMenu(id, menu, recipes) {
  const data = {
    id, title: menu.title, when: menu.when, intro: menu.intro, eaters: menu.eaters,
    dishes: menu.dishes.map(d => ({ href: d.recipe, title: recipes[d.recipe].title, label: d.label ?? null,
      serves: recipes[d.recipe].serves && Math.round(recipes[d.recipe].serves * d.scale), scale: d.scale })),
    shops: shoppingList(menu, recipes),
    stations: menu.stations.map(s => ({ ...s, jobs: s.jobs.map(j => ({ ...j, title: j.recipe ? recipes[j.recipe].title : null })) })),
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${esc(menu.title)}</title>
<link rel="stylesheet" href="menu.css">
<script src="menu.js" defer></script>
</head>
<body>
<header>
  <h1>${esc(menu.title)}</h1>
  <p>${esc(menu.when)}</p>
</header>
<main id="app"><noscript>This page needs JavaScript.</noscript></main>
<script type="application/json" id="menu">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
</body>
</html>
`;
}
