// Builds the site into dist/: copies everything in recipes/ (pages, toolchart.css, toolchart.js)
// and writes an index page listing the recipe pages.
// No dependencies. Run with: node build.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SRC = "recipes", OUT = "dist";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);

const text = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// date a recipe was first added, from git; falls back to today
function added(file) {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--follow", "--format=%cs", "--", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (out) return out.split("\n").pop();
  } catch {}
  return new Date().toISOString().slice(0, 10);
}

for (const f of readdirSync(SRC)) copyFileSync(`${SRC}/${f}`, `${OUT}/${f}`);

const recipes = readdirSync(SRC).filter(f => f.endsWith(".html")).map(f => {
  const html = readFileSync(`${SRC}/${f}`, "utf8");
  const header = html.match(/<header>([\s\S]*?)<\/header>/)?.[1] ?? "";
  const title = text(header.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? "") || text(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? f);
  const facts = [...header.matchAll(/<span>([\s\S]*?)<\/span>/g)].map(m => text(m[1])).filter(s => !/^Equipment/i.test(s));
  const ingredients = [...html.matchAll(/<div class="ing">[\s\S]*?<span>([\s\S]*?)<\/span>/g)].map(m => text(m[1]));
  return { href: f.replace(/\.html$/, ""), title, facts, date: added(`${SRC}/${f}`), search: [title, ...ingredients].join(" ").toLowerCase() };
}).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

// copied to the clipboard by the button on the home page
const AGENT_INSTRUCTIONS = "Fork github.com/lucasmeijer/recipes into my own GitHub account. " +
  "Ask me whether I want to keep the existing recipes or start without any. " +
  "To have the results published automatically, set up something like GitHub Pages or Cloudflare Pages, like the original repo does. " +
  "Then explain to me that I can start an agent in a clone of my new repo and ask it to make batch-cooking recipes, " +
  "and that they'll automatically be added to my new website.";

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
let year = "";
const items = recipes.map(r => {
  const [y, m, d] = r.date.split("-");
  const marker = y !== year ? `\n    <li class="marker">${(year = y)}</li>` : "";
  return `${marker}
    <li data-search="${esc(r.search)}">
      <div class="head"><span class="date">${+d} ${MONTHS[m - 1]}</span> <a href="${esc(r.href)}">${esc(r.title)}</a></div>
      <div class="desc">${r.facts.map(esc).join(" · ")}</div>
    </li>`;
}).join("");

writeFileSync(`${OUT}/index.html`, `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-title" content="Recipes">
<title>Recipes · Thomas Mustier</title>
<script src="toolchart.js" defer></script>
<style>
@font-face{font-family:"Fragment Mono";src:url("fragment-mono-regular.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"Fragment Mono";src:url("fragment-mono-italic.woff2") format("woff2");font-weight:400;font-style:italic;font-display:swap}
:root{--ink:#1d1d1b;--muted:#8b8b85;--faint:#b9b9b2;--line:#e6e6e1;--paper:#fbfbf9;--accent:#96341f}
*{margin:0;padding:0;box-sizing:border-box}
html{background:var(--paper)}
body{font-family:"Fragment Mono",ui-monospace,monospace;font-size:14px;line-height:1.65;color:var(--ink);max-width:620px;margin:0 auto;
  padding:max(72px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) 96px max(24px,env(safe-area-inset-left));
  text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
a{color:var(--ink);text-decoration:underline;text-decoration-color:var(--faint);text-underline-offset:3px}
a:hover{color:var(--accent);text-decoration-color:var(--accent)}
header h1{font-size:14px;font-weight:400;letter-spacing:.02em}
header h1 a{text-decoration:none}
main{margin-top:64px}
main h2{font-size:14px;font-weight:400;color:var(--muted);margin-bottom:12px}
input{width:100%;font:inherit;color:inherit;padding:6px 0;border:0;border-bottom:1px solid var(--line);background:transparent;border-radius:0;-webkit-appearance:none}
input::placeholder{color:var(--faint)}
input:focus{outline:0;border-bottom-color:var(--accent)}
ul{list-style:none}
li{margin-top:36px}
.marker{color:var(--faint);font-size:13px;margin-top:48px}
.head{display:flex;align-items:baseline;gap:12px}
.date{color:var(--muted);font-size:13px;white-space:nowrap}
.desc{margin-top:4px;color:var(--muted);font-size:13px}
.empty{color:var(--muted);margin-top:36px;display:none}
footer{margin-top:96px;padding-top:24px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
footer p + p{margin-top:4px}
footer a{color:var(--muted)}
.agent{font:inherit;color:var(--muted);background:none;border:0;cursor:pointer;text-decoration:underline;text-decoration-color:var(--faint);text-underline-offset:3px}
.agent:hover{color:var(--accent);text-decoration-color:var(--accent)}
.agent .done{display:none;text-decoration:none}
.agent.copied{text-decoration:none}
.agent.copied .idle{display:none}
.agent.copied .done{display:inline}
html{overscroll-behavior-y:none}
.ptr{position:fixed;top:0;left:50%;z-index:9;width:32px;height:32px;margin-left:-16px;display:grid;place-items:center;border-radius:50%;
  background:var(--paper);border:1px solid var(--line);color:var(--muted);transform:translateY(-48px);opacity:0;pointer-events:none}
.ptr svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.ptr.back{transition:transform .25s,opacity .25s}
.ptr.loading svg{animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="ptr" id="ptr" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg></div>
<header><h1><a href="https://www.mustier.ai">Thomas Mustier</a></h1></header>
<main>
<h2>Recipes</h2>
<input id="q" type="search" placeholder="Search by name or ingredient…" autocomplete="off">
<ul id="list">${items}
</ul>
<p class="empty" id="empty">No recipes match.</p>
</main>
<footer>
<p>Each recipe is one chart: ingredients on the left, steps to the right. Format and tooling from <a href="https://github.com/lucasmeijer/recipes">Lucas Meijer</a>.</p>
<p><button class="agent" id="agent" type="button"><span class="idle">Agent instructions for getting your own version of this recipe website</span><span class="done" aria-live="polite">Copied to clipboard</span></button></p>
</footer>
<script>
const q = document.getElementById("q"), lis = [...document.querySelectorAll("#list li[data-search]")];
q.oninput = () => {
  const words = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
  let shown = 0;
  for (const li of lis) { const ok = words.every(w => li.dataset.search.includes(w)); li.hidden = !ok; shown += ok; }
  for (const m of document.querySelectorAll(".marker")) m.hidden = words.length > 0;
  document.getElementById("empty").style.display = shown ? "none" : "block";
};
// pull down from the top of the page to reload (also in home-screen apps, which have no browser reload)
{
  const ptr = document.getElementById("ptr"), icon = ptr.firstChild, THRESHOLD = 70;
  let startY = null, pull = 0;
  const show = (y, back) => {
    ptr.classList.toggle("back", back);
    ptr.style.transform = \`translateY(\${y - 48}px)\`;
    ptr.style.opacity = Math.min(1, y / THRESHOLD);
  };
  addEventListener("touchstart", e => {
    startY = scrollY <= 0 && e.touches.length === 1 && !ptr.classList.contains("loading") ? e.touches[0].clientY : null;
  }, { passive: true });
  addEventListener("touchmove", e => {
    if (startY === null) return;
    pull = Math.max(0, e.touches[0].clientY - startY);
    if (!pull) return;
    const y = Math.min(110, pull * 0.5);                                // resistance
    show(y, false);
    icon.style.transform = \`rotate(\${pull * 1.5}deg)\`;
    ptr.style.color = y >= THRESHOLD ? "#96341f" : "";
  }, { passive: true });
  addEventListener("touchend", () => {
    if (startY === null) return;
    startY = null;
    if (Math.min(110, pull * 0.5) >= THRESHOLD) {
      show(THRESHOLD, true);
      icon.style.transform = "";
      ptr.classList.add("loading");
      setTimeout(() => location.reload(), 150);
    } else show(0, true);
    pull = 0;
  });
}
const agent = document.getElementById("agent"), instructions = ${JSON.stringify(AGENT_INSTRUCTIONS)};
let timer;
agent.onclick = async () => {
  try { await navigator.clipboard.writeText(instructions); }
  catch {
    const t = Object.assign(document.createElement("textarea"), { value: instructions });
    document.body.append(t); t.select(); document.execCommand("copy"); t.remove();
  }
  agent.classList.remove("copied"); void agent.offsetWidth; agent.classList.add("copied");
  clearTimeout(timer); timer = setTimeout(() => agent.classList.remove("copied"), 2000);
};
</script>
</body>
</html>
`);

console.log(`Built ${recipes.length} recipes into ${OUT}/`);
