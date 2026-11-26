// Reads a .recipe file into plain data, and renders that data as a toolchart page.
// The format is described in .agents/skills/recipe-toolchart/SKILL.md.
//
// Data shape:
//   Recipe     { title, serves, facts: [[label, value]], equipment: [string], root: Step }
//   Step       { verb, type: "prep"|"heat"|"combine"|"finish", time, wait, text, inputs: [Step|Ingredient] }
//   Ingredient { qty: Quantity, alt: Quantity|null, name, note }
//   Quantity   { amount: number|[low, high]|null, unit }   amount is null for "to taste" etc.; then unit holds the words

const FRACTIONS = { "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4, "⅛": 1 / 8 };
const NUMBER = String.raw`(?:\d+(?:\.\d+)?[½⅓⅔¼¾⅛]?|[½⅓⅔¼¾⅛])`;
const QUANTITY = new RegExp(String.raw`^(${NUMBER})(?:\s*–\s*(${NUMBER}))?(?:\s+(.+))?$`);
const TYPES = ["heat", "combine"];

const toNumber = s => {
  const frac = FRACTIONS[s.at(-1)] ?? 0;
  return (frac ? Number(s.slice(0, -1) || 0) : Number(s)) + frac;
};

export function parseQuantity(s) {
  const m = s.trim().match(QUANTITY);
  if (!m) return { amount: null, unit: s.trim() };
  const low = toNumber(m[1]);
  return { amount: m[2] ? [low, toNumber(m[2])] : low, unit: m[3] ?? "" };
}

const formatNumber = n => {
  const whole = Math.floor(n + 1e-9), rest = n - whole;
  const frac = Object.entries(FRACTIONS).find(([, v]) => Math.abs(v - rest) < 0.01)?.[0];
  if (rest < 0.01) return String(whole);
  if (frac) return (whole || "") + frac;
  return String(Math.round(n * 100) / 100);
};

export function formatQuantity({ amount, unit }) {
  if (amount === null) return unit;
  const n = Array.isArray(amount) ? amount.map(formatNumber).join("–") : formatNumber(amount);
  return unit ? `${n} ${unit}` : n;
}

export function parseRecipe(source, file = "recipe") {
  const lines = source.split("\n").map((text, i) => ({ text: text.replace(/\s+$/, ""), line: i + 1 }));
  const fail = (line, msg) => { throw new Error(`${file}:${line}: ${msg}`); };

  // header: title line, then "Label: value" lines, then a blank line
  const title = lines[0].text.trim();
  let i = 1;
  const facts = [], equipment = [];
  let serves = null;
  for (; i < lines.length && lines[i].text; i++) {
    const m = lines[i].text.match(/^([A-Za-z ]+):\s*(.+)$/);
    if (!m) fail(lines[i].line, `expected "Label: value" in the header`);
    const [, label, value] = m;
    if (label === "Equipment") equipment.push(...value.split(",").map(s => s.trim()));
    else facts.push([label, value]);
    if (label === "Serves") serves = Number(value);
  }

  // body: an indented tree, two spaces per level, one root step
  const stack = [];
  let root = null;
  for (const { text, line } of lines.slice(i)) {
    if (!text.trim() || text.trim().startsWith("//")) continue;
    const indent = text.match(/^ */)[0].length;
    if (indent % 2) fail(line, "indent with two spaces per level");
    const depth = indent / 2;
    if (depth > stack.length) fail(line, "indented too far");
    stack.length = depth;
    const node = text.trim().startsWith("-") ? parseIngredient(text.trim().slice(1).trim(), line, fail) : parseStep(text.trim(), line, fail);
    if (depth === 0) {
      if (root) fail(line, "only one final step is allowed at the top level");
      if (!node.inputs) fail(line, "the top level must be the final step, not an ingredient");
      root = node;
      root.type = "finish";
    } else {
      const parent = stack[depth - 1];
      if (!parent.inputs) fail(line, "an ingredient can't have inputs");
      parent.inputs.push(node);
    }
    stack.push(node);
  }
  if (!root) fail(lines.length, "no steps");
  const check = s => { if (!s.inputs.length) fail(s.line, `step "${s.verb}" has no inputs`); s.inputs.filter(n => n.inputs).forEach(check); };
  check(root);
  const strip = n => { delete n.line; n.inputs?.forEach(strip); return n; };
  return { title, serves, facts, equipment, root: strip(root) };
}

// "Sear (heat, ~8 min): Oil **smoking**…"  options: heat | combine, "then <wait label>", anything else is the time
function parseStep(s, line, fail) {
  const m = s.match(/^([^():]+?)\s*(?:\(([^)]*)\))?:\s*(.+)$/);
  if (!m) fail(line, `expected "Verb (options): text" or "- quantity | name | note"`);
  const step = { verb: m[1], type: "prep", time: null, wait: null, text: m[3], inputs: [], line };
  for (const opt of (m[2] ?? "").split(",").map(o => o.trim()).filter(Boolean)) {
    if (TYPES.includes(opt)) step.type = opt;
    else if (opt.startsWith("then ")) step.wait = opt.slice(5);
    else step.time = opt;
  }
  return step;
}

// "240 ml = 1 cup | Dry white wine | note"
function parseIngredient(s, line, fail) {
  const [qty, name, note, ...extra] = s.split("|").map(p => p.trim());
  if (!name || extra.length) fail(line, `expected "- quantity | name" or "- quantity | name | note"`);
  const [main, alt] = qty.split("=").map(q => q.trim());
  return { qty: parseQuantity(main), alt: alt ? parseQuantity(alt) : null, name, note: note || null };
}

// ───── rendering ─────

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

function renderNode(n, pad) {
  if (!n.inputs) {
    const note = [n.note, n.alt && formatQuantity(n.alt)].filter(Boolean).join(" · ");
    return `${pad}<div class="ing"><div class="label"><b>${esc(formatQuantity(n.qty))}</b><span>${esc(n.name)}</span>${note ? `<small>${esc(note)}</small>` : ""}</div></div>\n`;
  }
  const cls = n.type === "prep" ? "step" : `step ${n.type}`;
  const wait = n.wait ? ` data-wait="${esc(n.wait)}"` : "";
  return `${pad}<div class="${cls}"${wait}>\n${pad}  <div class="in">\n` +
    n.inputs.map(c => renderNode(c, pad + "    ")).join("") +
    `${pad}  </div>\n${pad}  <div class="do"><h3>${esc(n.verb)}</h3><p>${inline(n.text)}</p>${n.time ? `<time>${esc(n.time)}</time>` : ""}</div>\n${pad}</div>\n`;
}

export function renderPage(r) {
  const facts = [...r.facts, ...(r.equipment.length ? [["Equipment", r.equipment.join(" · ")]] : [])];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(r.title)}</title>
<link rel="stylesheet" href="toolchart.css">
<script src="toolchart.js" defer></script>
</head>
<body>

<header>
  <h1>${esc(r.title)}</h1>
${facts.map(([k, v]) => `  <span><em>${esc(k)}</em> ${esc(v)}</span>\n`).join("")}</header>

<div class="toolchart">
${renderNode(r.root, "  ")}</div>

</body>
</html>
`;
}

export const ingredients = r => {
  const out = [];
  const walk = n => n.inputs ? n.inputs.forEach(walk) : out.push(n);
  walk(r.root);
  return out;
};
