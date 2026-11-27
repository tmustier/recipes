# Agent instructions

This repo is a collection of recipes, each a `.recipe` text file in `recipes/` that the build renders as a page.

- Skills live in `.agents/skills/` (`.claude/skills` is a symlink to it). Read the relevant `SKILL.md` before doing recipe, batch-cooking or grocery work.
- Save every recipe as `recipes/<name>.recipe`, using a short lowercase-hyphenated name like `chili-sin-carne.recipe`. The file name becomes its URL.
- `recipe.mjs` parses `.recipe` files and renders them. `recipes/toolchart.css` and `recipes/toolchart.js` are shared by every recipe page. Only change these to change the format, look or behaviour of all recipes.
- Don't edit `dist/`; `node build.mjs` generates it. Publish with `npx wrangler deploy` (see README).
- A menu for a meal is `menus/<id>.json`: dishes (recipe + scale), French names and shops for every ingredient, extras and cooking stations. The build turns it into `/<id>`, a shared page with a combined shopping list and job sign-ups; `worker.js` stores who's doing what in a Durable Object. Menu pages aren't listed on the index.
