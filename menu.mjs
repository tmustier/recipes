// Builds a shared menu page from menus/<id>.json: the dishes (each a recipe scaled up or down),
// one combined shopping list grouped by shop, and the cooking jobs split into stations.
// The live part (who has what, who's doing which job) is stored by worker.js and drawn by recipes/menu.js.
import { ingredients, formatQuantity, scaleRecipe, scaleQuantity } from "./recipe.mjs";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Each dish as it'll actually be cooked: { serves: 10 } scales the recipe to 10, { scale: 2 } doubles it.
export function scaledDishes(menu, recipes) {
  return menu.dishes.map(d => {
    const r = recipes[d.recipe];
    if (!r) throw new Error(`menus: no recipe called ${d.recipe}`);
    return { ...d, href: `${d.recipe}`, scaled: scaleRecipe(r, d.serves ? d.serves / r.serves : d.scale) };
  });
}

// Combine every ingredient of every dish into one list, keyed by the name in menu.items.
function shoppingList(menu, dishes) {
  const items = new Map();
  for (const dish of dishes) {
    const r = dish.scaled;
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
        s[0] += lo; s[1] += hi ?? lo;
      }
      item.dishes.add(r.title);
      items.set(name, item);
    }
  }
  const list = [...items.values()].map(({ sums, words, dishes, ...item }) => {
    const qty = Object.entries(sums).map(([unit, [lo, hi]]) => formatQuantity(scaleQuantity({ amount: lo === hi ? lo : [lo, hi], unit }, 1))).join(" + ") || words;
    return { ...item, qty, dishes: [...dishes].join(", ") };
  });
  for (const x of menu.extras ?? []) list.push({ id: slug(`${x.shop}-${x.name}`), name: x.name, fr: null, shop: x.shop, note: x.note ?? null, qty: x.qty, dishes: "" });
  return menu.shops.map(s => ({ ...s, items: list.filter(i => i.shop === s.key) }));
}

// The menu page's data. Dish links point at the scaled copies the build writes as <menu id>-<recipe>.
export function menuData(id, menu, dishes) {
  const page = r => `${id}-${r}`;
  return {
    id, title: menu.title, when: menu.when, eaters: menu.eaters, near: menu.near ?? null,
    dishes: dishes.map(d => ({ href: page(d.recipe), title: d.scaled.title, label: d.label ?? null })),
    shops: shoppingList(menu, dishes),
    stations: menu.stations.map(s => ({ ...s, jobs: s.jobs.map(j => ({ ...j, href: j.recipe ? page(j.recipe) : null, title: j.recipe ? dishes.find(d => d.recipe === j.recipe).scaled.title : null })) })),
  };
}

export function renderMenu(menu, data) {
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

// A recipe as numbered steps in cooking order (each step after the steps it needs), for reading out loud
// or by a chat assistant rather than as a chart.
export function recipeSteps(r) {
  const steps = [];
  const plain = t => t.replace(/\{([^}]+)\}/g, "$1").replace(/\*\*(.+?)\*\*/g, "$1");
  const visit = n => {
    const after = n.inputs.filter(c => c.inputs).map(visit);
    const adds = n.inputs.filter(c => !c.inputs).map(i => [formatQuantity(i.qty) + (i.alt ? ` (${formatQuantity(i.alt)})` : ""), i.name, i.note].filter(Boolean).join(" "));
    steps.push({ step: steps.length + 1, action: n.verb, text: plain(n.text), time: n.time, ingredients: adds, after_steps: after, then: n.wait });
    return steps.length;
  };
  visit(r.root);
  return { title: r.title, serves: r.serves, facts: Object.fromEntries(r.facts), equipment: r.equipment, ingredients: ingredients(r).map(i => `${formatQuantity(i.qty)} ${i.name}`), steps };
}
