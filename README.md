# Recipes

My recipes as one-page "toolcharts": each recipe is a single rectangular flowchart, with ingredients down the left and steps to the right, in the style of Cooking for Engineers. Each recipe is written as a small indented text file (`recipes/<name>.recipe`) and rendered as a page that works on a phone, tablet or desktop and keeps the screen on while it's open. On phones you swipe through it one step at a time.

Live at **https://recipes.mustier.ai**. Forked from [lucasmeijer/recipes](https://github.com/lucasmeijer/recipes).

## Make your own

Fork or clone this repo, then ask your coding agent (Claude Code, Codex, …) for a recipe:

> Make a recipe toolchart for chicken tikka masala.

The agent follows the skills in [`.agents/skills/`](.agents/skills):

| Skill | What it does |
|---|---|
| [recipe-toolchart](.agents/skills/recipe-toolchart/SKILL.md) | Turns a recipe into a `.recipe` file in `recipes/` |
| [batch-cooking](.agents/skills/batch-cooking/SKILL.md) | Designs freezer-friendly batch recipes sized to whole grocery packs |
| [crisp-groceries](.agents/skills/crisp-groceries/SKILL.md) | Shops and manages recipes in the Crisp app (a Dutch/Belgian grocery delivery service) |

Delete the recipes in `recipes/` that you don't want, and `crisp-groceries` if you don't use Crisp.

## Publish

`node build.mjs` renders each `recipes/<name>.recipe` into `dist/<name>.html` (plus the parsed data as `dist/<name>.json`), copies the shared files and generates `dist/index.html`, a searchable list of every recipe, newest first. It has no dependencies.

The site is served by a Cloudflare Worker with static assets at **recipes.mustier.ai** (see [`wrangler.jsonc`](wrangler.jsonc)). To publish by hand:

```
node build.mjs && npx wrangler deploy
```

The GitHub Action ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) does the same on every push to `main` once the repo secret `CLOUDFLARE_API_TOKEN` (a token with **Workers Scripts: Edit** permission) is set. `CLOUDFLARE_ACCOUNT_ID` is already set.

Each recipe is available at `/<file-name>`, e.g. `/lamb-shanks`. Open the index on your phone and use **Add to Home Screen**.
