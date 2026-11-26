---
name: recipe-toolchart
description: Turns a recipe into a "toolchart" page — a Cooking for Engineers–style tabular recipe where ingredients sit in the left column and each step is a cell spanning the ingredients it combines, so the whole recipe reads as one rectangular flowchart. Use when asked to visualize, chart, or make a cooking-friendly page for a recipe.
---

# Recipe Toolchart

Each recipe is one text file, `recipes/<name>.recipe`, using a short lowercase-hyphenated name like `chili-sin-carne.recipe`. The file name becomes its URL. `node build.mjs` reads it with [`recipe.mjs`](../../../recipe.mjs) and renders a page that works on phones, tablets and desktops, styled by the shared [`recipes/toolchart.css`](../../../recipes/toolchart.css) and [`recipes/toolchart.js`](../../../recipes/toolchart.js). It also writes the parsed recipe as `<name>.json`. Your job is only the `.recipe` file. [`recipes/lamb-shanks.recipe`](../../../recipes/lamb-shanks.recipe) is a short worked example and [`recipes/beef-wellington.recipe`](../../../recipes/beef-wellington.recipe) a long one.

## Think of the recipe as a tree

The final step (usually *Serve*) is the root. Its inputs are earlier steps, and their inputs are earlier steps, down to raw ingredients.

Rules:
- Every ingredient and every step is used exactly once, and there is exactly one final step.
- An ingredient used in two places (e.g. cheese in the sauce and on top) becomes two ingredient lines with the quantity split between them.
- Something added late, like salt to taste at the end, is an input of the step where it's added. The chart draws an arrow carrying it across.
- Prep with no dependencies (chopping, whisking, measuring) comes straight off its raw ingredients, so it lands in the first column and reads as "do this while waiting".
- Show every prep job. List ingredients as you buy them (`Shallots`, not `Shallots, minced`) and make the chopping, mincing, peeling, beating or thawing a step, or fold it into the step that first uses the ingredient. Notes are for variety, size or substitutes, never for work the cook has to do.

## Format

```
Lamb Shanks with Mustard and Mint
Serves: 4
Prep: 15 min
Total: 2¼ hr
Equipment: Dutch oven or braiser, Tongs, Ladle

Serve: Ladle sauce over the shanks and scatter with mint.
  Reduce (heat): Shanks to a platter. Simmer sauce to about **360 ml**. Skim the fat.
    Braise (heat, 2–2½ hr): Add stock; scrape the pan. Cover, into the oven until meat **falls off the bone**.
      Sear (heat, ~8 min): Oven to **180 °C / 350 °F**. Oil **smoking**. Brown on all sides.
        - 2 Tbsp | Olive oil
        - 4 | Lamb shanks | about 1.4 kg · 3 lb
        - to taste | Kosher salt & pepper
      - 480 ml = 2 cups | Chicken stock | low-sodium
  Chop (then set aside): Pick the leaves and chop roughly.
    - ½ bunch | Fresh mint
```

**Header:** the title on the first line, then `Label: value` lines, then a blank line. Use `Serves` as a plain number. Separate equipment with commas. Every label except `Equipment` shows in the home page list.

**Tree:** indent two spaces per level. A line's inputs are the lines indented under it, top to bottom, with the main flow on top and side prep below. Lines starting with `//` are comments.

**Step:** `Verb (options): text`.
- One verb, then one or two short sentences (under ~30 words). Put the critical numbers in `**double stars**`: temperatures, times, sizes, amounts, and warnings like `**Heat OFF**`.
- Options, comma-separated and all optional: `heat` for anything on the stove or in the oven, `combine` for bringing components together (no option means prep: cut, whisk, measure); a time like `~8 min`; and `then <label>` to label the arrow when the result has to wait for a longer branch, e.g. `then set aside`, `then keep warm`, `then chill`. Use `then` only where waiting is meaningful.
- The top-level step is always the final step and is styled as such.

**Ingredient:** `- quantity | name | note`, with the note optional.
- The quantity is a number and unit (`240 ml`, `½ bunch`, `4–5 sprigs`, `1½ tsp`) or words (`to taste`, `for dusting`). Numbers are parsed so a recipe can later be scaled, so keep the number first and use one of `½ ⅓ ⅔ ¼ ¾ ⅛`, a decimal or a range with `–`.
- Write metric first. Add the US equivalent after `=`: `240 ml = 1 cup`, `900 g = 2 lb`. Don't put amounts in the note.

Steps always sit as far left as their inputs allow. You can't move a step to a later column, and you don't need to.

## Keep it minimal

- No notes, tips or intro sections. If a tip matters, fold it into the step it belongs to, in a few words.
- No interactivity: no checkboxes, timers or buttons.

## Check

Run `node build.mjs`. A malformed file stops the build with the file and line number. Then, if you can render HTML (e.g. Playwright with a headless Chromium), take screenshots of `dist/<name>.html` at about 1440×900 and 390×844 and look at them:
- Each step cell spans exactly the rows of the ingredients it uses.
- Dashed arrows appear only where an input waits for a longer branch.
- No cell is crammed or empty.

Mis-nesting doesn't produce an error, it just draws the wrong chart, so compare the picture against the recipe. On phones (under 640 px wide) the chart shows one step column at a time and swipes sideways, with each ingredient pinned on the left until the step that uses it.

The font (Fragment Mono, the same as mustier.ai) is self-hosted in `recipes/`. It has no bold, so `**text**` renders as brick-coloured regular text.
