# Recipes

My recipes as one-page "toolcharts": each recipe is a single rectangular flowchart, with ingredients down the left and steps to the right, in the style of Cooking for Engineers. Each one is an HTML page that works on a phone, tablet or desktop, and keeps the screen on while it's open.

Live at **https://recipes.mustier.ai**. Forked from [lucasmeijer/recipes](https://github.com/lucasmeijer/recipes).

## Make your own

Fork or clone this repo, then ask your coding agent (Claude Code, Codex, …) for a recipe:

> Make a recipe toolchart for chicken tikka masala.

The agent follows the skills in [`.agents/skills/`](.agents/skills):

| Skill | What it does |
|---|---|
| [recipe-toolchart](.agents/skills/recipe-toolchart/SKILL.md) | Turns a recipe into a toolchart HTML page, saved in `recipes/` |
| [batch-cooking](.agents/skills/batch-cooking/SKILL.md) | Designs freezer-friendly batch recipes sized to whole grocery packs |
| [crisp-groceries](.agents/skills/crisp-groceries/SKILL.md) | Shops and manages recipes in the Crisp app (a Dutch/Belgian grocery delivery service) |

Delete the recipes in `recipes/` that you don't want, and `crisp-groceries` if you don't use Crisp.

## Publish

`node build.mjs` copies `recipes/` into `dist/` and generates `dist/index.html`, a searchable list of every recipe, newest first. It has no dependencies.

To host it on Cloudflare Pages, the included GitHub Action ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) builds and deploys on every push to `main`:

1. Create a Cloudflare Pages project: `npx wrangler pages project create recipes --production-branch main`. If you pick a different name, set it as the repo variable `CF_PAGES_PROJECT`.
2. Add the repo secrets `CLOUDFLARE_API_TOKEN` (a token with **Cloudflare Pages: Edit** permission) and `CLOUDFLARE_ACCOUNT_ID`.
3. Optionally, add a custom domain in the Pages project under **Custom domains**.

Each recipe is available at `/<file-name>`, e.g. `/puttanesca`. Open the index on your phone and use **Add to Home Screen**.
