---
name: recipe-toolchart
description: Turns a recipe into an HTML "toolchart" page — a Cooking for Engineers–style tabular recipe where ingredients sit in the left column and each step is a cell spanning the ingredients it combines, so the whole recipe reads as one rectangular flowchart. Use when asked to visualize, chart, or make a cooking-friendly page for a recipe.
---

# Recipe Toolchart

The output is one HTML page in `recipes/` that works on phones, tablets and desktops. All styling and layout lives in the shared [`recipes/toolchart.css`](../../../recipes/toolchart.css), and [`recipes/toolchart.js`](../../../recipes/toolchart.js) keeps the screen on while a recipe is open. Your job is only the recipe content. [`recipes/beef-wellington.html`](../../../recipes/beef-wellington.html) is a complete worked example.

## Workflow

1. Copy `recipes/beef-wellington.html` to `recipes/<recipe-name>.html`, using a short lowercase-hyphenated name like `chili-sin-carne.html`.
2. Set `<title>`, and keep the rest of the `<head>` as it is: it links `toolchart.css` and `toolchart.js`. Don't edit those two files, and don't add classes, inline styles or scripts.
3. Replace the `<header>` and the `.toolchart` with your recipe's.
4. Render it and look at it (see Check).

## Think of the recipe as a tree

The final step (usually *Serve*) is the root. Its inputs are earlier steps, and their inputs are earlier steps, down to raw ingredients. Write it as a nested expression first:

```
Serve( Emulsify( Toss( Cook( Boil(water, salt), spaghetti ),
                       Render( Cut(guanciale) ) ),
                 Whisk(yolks, egg, pecorino, parmigiano, pepper) ) )
```

Rules:
- Every ingredient and every step is used exactly once, and there is exactly one final step.
- An ingredient used in two places (e.g. cheese in the sauce and on top) becomes two ingredient rows with the quantity split between them.
- Something added late, like salt to taste at the end, is an input of the step where it's added. The layout will draw an arrow carrying it across.
- Prep with no dependencies (chopping, whisking, measuring) comes straight off its raw ingredients, so it lands in the first column and reads as "do this while waiting".

## Markup

The CSS lays everything out from the nesting alone. A step is a `.step` containing its inputs in `.in`, then its own cell `.do`:

```html
<div class="step heat">                       <!-- type: prep (no class), heat, combine, finish -->
  <div class="in">                            <!-- inputs, top to bottom -->
    <div class="step"> … </div>               <!-- an earlier step -->
    <div class="ing"><b>400 g</b><span>Spaghetti</span><small>bronze-cut if you can</small></div>
  </div>
  <div class="do"><h3>Cook</h3><p>Add pasta. Cook <b>2 min less</b> than the package says.</p><time>8 min</time></div>
</div>
```

- **`.toolchart`** wraps exactly one `.step`: the final step.
- **Step type:** no class for prep (cut, whisk, measure), `heat` for anything on the stove or in the oven, `combine` for bringing components together, `finish` for the last plating or serving step.
- **`.in` before `.do`**, always. Order the inputs top to bottom with the main flow on top and side prep below.
- **`.ing`** is exactly `<b>quantity</b><span>name</span>`, plus an optional `<small>note</small>`. Keep the three tags and don't put loose text in it. If there's no quantity, put something like `to taste` in the `<b>`.
- **`.do`** is `<h3>` with one verb, then `<p>` with one or two short sentences (under ~30 words), then an optional `<time>`. Put the critical numbers in **bold**: temperatures, times, sizes, amounts, and warnings like **Heat OFF**.
- **`data-wait="…"`** on a `.step` labels the dashed arrow drawn after it when its result has to wait for a longer branch, e.g. `set aside`, `keep warm`, `rest`, `chill`. Use it only where waiting is meaningful.
- Steps always sit as far left as their inputs allow. You can't move a step to a later column, and you don't need to.

Indent two spaces per nesting level, as in the example. It's the only way to keep the nesting readable.

## Header

One line of bare facts, no subtitle or description:

```html
<header>
  <h1>Spaghetti Carbonara</h1>
  <span><em>Serves</em> 4</span>
  <span><em>Active</em> 20 min</span>
  <span><em>Total</em> 25 min</span>
  <span><em>Equipment</em> Large pot · 12″ skillet · Mixing bowl · Tongs</span>
</header>
```

## Keep it minimal

- No notes, tips or intro sections. If a tip matters, fold it into the cell of the step it belongs to, in a few words.
- No interactivity: no checkboxes, timers, scaling or buttons.

## Check

If you can render HTML (e.g. Playwright with a headless Chromium), take screenshots at about 1440×900 and 390×844 and look at them:
- Each step cell spans exactly the rows of the ingredients it uses.
- Dashed arrows appear only where an input waits for a longer branch.
- No cell is crammed or empty.

Mis-nesting doesn't produce an error, it just draws the wrong chart, so compare the picture against your nested expression. On narrow phones the chart scrolls sideways; that's expected.

The font (Fragment Mono, the same as mustier.ai) is self-hosted in `recipes/`. It has no bold, so `<b>` renders as brick-coloured regular text.
