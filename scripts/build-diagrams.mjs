// Build the diagram set from its sources.
//
//   node scripts/build-diagrams.mjs            regenerate
//   node scripts/build-diagrams.mjs --check     fail if anything is out of date
//   node scripts/build-diagrams.mjs --render    also render every diagram (slow)
//
// Inputs:  docs/diagrams/manifest.json  (order, titles, how to read each one)
//          docs/diagrams/src/*.mmd      (one Mermaid source per diagram)
// Outputs: docs/diagrams/index.html     a self-contained viewer — double-click it
//          docs/DIAGRAMS.md             the same set, rendered by GitHub
//          docs/diagrams/vendor/mermaid.min.js  copied from node_modules
//
// WHY A BUILD STEP AT ALL: the .mmd files are the source of truth, so a diagram
// can be reviewed as a diff. Everything a reader opens is generated from them,
// which is what keeps the viewer, the Markdown and the sources in agreement —
// `--check` runs in CI and fails the build if someone edits one and not the
// others. The output is deterministic (no timestamps), so the check is stable.
//
// WHY MERMAID IS VENDORED: the viewer has to open from the filesystem with no
// server and no network — a reviewer should be able to double-click one file.
// A CDN fallback is still wired in, for the case where node_modules is absent.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, copyFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "docs", "diagrams");
const srcDir = join(dir, "src");
const vendorDir = join(dir, "vendor");
const check = process.argv.includes("--check");
// Rendering every diagram is a stronger check than parsing, but it leans on
// jsdom standing in for SVG geometry, so it is opt-in rather than part of the
// CI gate: a future mermaid or jsdom release should not be able to fail a build
// for environmental reasons. Run it when you change a diagram's shape.
const renderAll = process.argv.includes("--render");

const require = createRequire(import.meta.url);
const read = (p) => readFileSync(p, "utf8");

// ---- inputs ----------------------------------------------------------------

const manifest = JSON.parse(read(join(dir, "manifest.json")));
const problems = [];

const sourceFiles = readdirSync(srcDir).filter((f) => f.endsWith(".mmd"));
const listed = new Set(manifest.diagrams.map((d) => d.file));
for (const f of sourceFiles) if (!listed.has(f)) problems.push(`src/${f} exists but is not listed in manifest.json`);

const diagrams = manifest.diagrams.map((d) => {
  const path = join(srcDir, d.file);
  if (!existsSync(path)) {
    problems.push(`manifest.json lists ${d.file}, which does not exist`);
    return { ...d, code: "" };
  }
  const raw = read(path).replace(/\r\n/g, "\n").trimEnd();
  // The leading %% lines are notes for whoever edits the source; the viewer
  // shows them with the source rather than in the diagram.
  const notes = raw
    .split("\n")
    .filter((l) => l.startsWith("%%"))
    .map((l) => l.replace(/^%%\s?/, ""))
    .join(" ");
  for (const field of ["title", "group", "type", "status", "summary", "howToRead"]) {
    if (!d[field]) problems.push(`${d.file}: manifest entry is missing "${field}"`);
  }
  if (!manifest.groups.some((g) => g.id === d.group)) problems.push(`${d.file}: unknown group "${d.group}"`);
  return { ...d, code: raw, notes };
});

if (problems.length) {
  console.error("diagram set is inconsistent:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

// ---- validate every source by actually parsing it --------------------------
//
// A diagram that does not parse is worse than no diagram: it looks fine in the
// repository and shows an error box to whoever opens it. Mermaid needs a DOM,
// so jsdom stands in for one. If either dev dependency is missing we say so and
// carry on (the generated files are still correct) rather than failing a build
// that was never asked to install them.

async function validate() {
  let JSDOM;
  try {
    ({ JSDOM } = require("jsdom"));
  } catch {
    console.warn("! jsdom is not installed — skipping syntax validation (run npm install to enable it)");
    return 0;
  }

  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  for (const key of ["window", "document", "navigator", "Element", "SVGElement", "DOMParser", "MutationObserver", "Node"]) {
    const value = dom.window[key] ?? dom.window[key.toLowerCase()];
    if (value === undefined) continue;
    // Some globals (navigator) are getter-only on recent Node, so define
    // rather than assign, and never let a read-only global fail the build.
    try {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    } catch {
      /* the DOM stand-in is best effort; mermaid.parse needs very little of it */
    }
  }
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  // jsdom implements no SVG geometry at all. These four methods are what
  // mermaid's layout and its ER renderer call; stubbing them is what makes a
  // headless render possible, and their absence is a jsdom gap rather than
  // anything wrong with a diagram.
  const svgProto = dom.window.SVGElement.prototype;
  svgProto.getBBox = () => ({ x: 0, y: 0, width: 120, height: 20 });
  svgProto.getComputedTextLength = () => 100;
  svgProto.getTotalLength = () => 200;
  svgProto.getPointAtLength = () => ({ x: 50, y: 50 });
  dom.window.Element.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 120,
    height: 20,
    top: 0,
    left: 0,
    right: 120,
    bottom: 20,
  });

  // Imported only now: mermaid bundles DOMPurify, which binds itself to
  // whatever `window` exists at import time. Importing it before the stand-in
  // DOM exists leaves it unbound, and every parse fails with
  // "DOMPurify.addHook is not a function" — a false alarm that would hide real
  // syntax errors.
  let mermaid;
  try {
    mermaid = (await import("mermaid")).default;
  } catch {
    console.warn("! mermaid is not installed — skipping syntax validation (run npm install to enable it)");
    return 0;
  }
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });

  let failed = 0;
  for (const d of diagrams) {
    try {
      await mermaid.parse(d.code);
      if (renderAll) {
        const { svg } = await mermaid.render(`r-${d.id}`, d.code);
        if (/aria-roledescription="error"|Syntax error/i.test(svg)) {
          throw new Error("rendered mermaid's error diagram instead of the content");
        }
        console.log(`  rendered ${d.file} (${Math.round(svg.length / 1024)} KB of SVG)`);
      }
    } catch (err) {
      failed++;
      const message = String(err?.message ?? err).split("\n").slice(0, 6).join("\n    ");
      console.error(`✖ ${d.file} does not ${renderAll ? "render" : "parse"}:\n    ${message}`);
    }
    for (const issue of lintStyling(d)) {
      failed++;
      console.error(`✖ ${issue}`);
    }
  }
  if (!failed) console.log(`✓ ${diagrams.length} diagrams parse and reference their styles correctly (mermaid ${mermaidVersion()})`);
  return failed;
}

/**
 * Catch the mistakes Mermaid accepts but renders wrongly.
 *
 * `class FOO bar` with a typo in FOO parses fine and then silently leaves that
 * node unstyled, and `class FOO nosuchclass` leaves it unstyled too — both look
 * like a diagram that "mostly works", which is the worst failure mode for a
 * document someone is meant to review. Parsing cannot catch either, so these
 * two references are checked by hand.
 */
function lintStyling(d) {
  const found = [];
  const lines = d.code.split("\n");
  const defined = new Set();
  for (const line of lines) {
    const m = line.match(/^\s*classDef\s+([A-Za-z0-9_-]+)/);
    if (m) defined.add(m[1]);
  }
  const bodyWithoutClassLines = lines
    .filter((l) => !/^\s*class(Def)?\s/.test(l))
    .join("\n");

  for (const line of lines) {
    const m = line.match(/^\s*class\s+([A-Za-z0-9_,\s-]+?)\s+([A-Za-z0-9_-]+)\s*$/);
    if (!m) continue;
    const [, idList, className] = m;
    if (defined.size && !defined.has(className)) {
      found.push(`${d.file}: "class ... ${className}" has no matching classDef`);
    }
    for (const id of idList.split(",").map((s) => s.trim()).filter(Boolean)) {
      const used = new RegExp(`(^|[^A-Za-z0-9_])${id}([^A-Za-z0-9_]|$)`, "m").test(bodyWithoutClassLines);
      if (!used) found.push(`${d.file}: "class ${id} ${className}" refers to a node that is never declared`);
    }
  }
  return found;
}

function mermaidVersion() {
  try {
    return require("mermaid/package.json").version;
  } catch {
    return "unknown";
  }
}

// ---- outputs ---------------------------------------------------------------

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const STATUS_LABEL = {
  current: "Built today",
  future: "Not built yet",
  mixed: "Partly built",
};

/**
 * Make a JSON string safe to paste inside a <script> element: "<" cannot be
 * allowed to form "</script>", and U+2028/U+2029 are legal in JSON but are line
 * terminators in a script body. Both are rewritten to their escape sequences,
 * which JSON.parse turns back into the original characters.
 */
function scriptSafeJson(value) {
  const ESC_LT = "\\u003c";
  const ESC_LS = "\\u2028";
  const ESC_PS = "\\u2029";
  let out = "";
  for (const ch of JSON.stringify(value)) {
    const code = ch.codePointAt(0);
    out += ch === "<" ? ESC_LT : code === 0x2028 ? ESC_LS : code === 0x2029 ? ESC_PS : ch;
  }
  return out;
}

function buildHtml() {
  // Embedded as JSON so no Mermaid source has to be HTML-escaped by hand.
  const data = scriptSafeJson({
    meta: { title: manifest.title, subtitle: manifest.subtitle },
    groups: manifest.groups,
    diagrams,
  });

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(manifest.title)}</title>
<meta name="description" content="${esc(manifest.subtitle)}" />
<meta name="generator" content="scripts/build-diagrams.mjs — do not edit this file by hand; edit docs/diagrams/src/*.mmd and run npm run diagrams" />
<style>
:root{
  --navy:#0F2A4A; --teal:#0E6A6A; --ink:#16202C; --ink-2:#44536B; --ink-3:#6B7A90;
  --line:#DCE3EC; --surface:#FFFFFF; --surface-2:#F5F7FA; --accent:#0E6A6A;
  --future:#6B46C1; --warn:#B3261E; --radius:10px;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
}
html[data-theme="dark"]{
  --navy:#0C1725; --ink:#E8EDF4; --ink-2:#AFBCCD; --ink-3:#8292A6;
  --line:#243244; --surface:#111C2A; --surface-2:#0C1725;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:var(--sans);color:var(--ink);background:var(--surface-2);line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:var(--teal)}
header{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;padding:12px 18px;
  background:var(--navy);color:#fff;box-shadow:0 1px 0 rgba(0,0,0,.2)}
header h1{font-size:15px;margin:0;font-weight:700;letter-spacing:.2px}
header .sub{font-size:12px;opacity:.75;margin:0}
header .spacer{flex:1}
.hbtn{font:inherit;font-size:12px;padding:7px 11px;border-radius:8px;border:1px solid rgba(255,255,255,.28);
  background:transparent;color:#fff;cursor:pointer}
.hbtn:hover{background:rgba(255,255,255,.12)}
.layout{display:grid;grid-template-columns:320px minmax(0,1fr);min-height:calc(100% - 56px)}
nav{border-right:1px solid var(--line);background:var(--surface);padding:14px 12px 40px;position:sticky;top:56px;
  height:calc(100vh - 56px);overflow:auto}
nav .filter{width:100%;font:inherit;font-size:13px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;
  background:var(--surface-2);color:var(--ink);margin-bottom:10px}
nav .seg{display:flex;gap:4px;margin-bottom:14px}
nav .seg button{flex:1;font:inherit;font-size:11px;padding:6px 4px;border:1px solid var(--line);background:var(--surface-2);
  color:var(--ink-2);border-radius:7px;cursor:pointer}
nav .seg button[aria-pressed="true"]{background:var(--teal);border-color:var(--teal);color:#fff}
nav h2{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3);margin:18px 0 4px}
nav h2:first-of-type{margin-top:4px}
nav .gblurb{font-size:11.5px;color:var(--ink-3);margin:0 0 7px}
nav ol{list-style:none;margin:0 0 6px;padding:0}
nav li a{display:flex;gap:8px;align-items:baseline;padding:7px 9px;border-radius:8px;text-decoration:none;
  color:var(--ink);font-size:13px}
nav li a:hover{background:var(--surface-2)}
nav li a[aria-current="true"]{background:var(--teal);color:#fff}
nav li a[aria-current="true"] .num{color:rgba(255,255,255,.8)}
.num{font-variant-numeric:tabular-nums;color:var(--ink-3);font-size:11px;min-width:16px}
main{padding:22px 26px 70px;min-width:0}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:20px 22px;margin:0 auto;max-width:1180px}
.chips{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 10px}
.chip{font-size:11px;padding:3px 9px;border-radius:999px;border:1px solid var(--line);color:var(--ink-2);background:var(--surface-2)}
.chip.current{border-color:#0E6A6A;color:#0B3B3B;background:#E6F0F0}
.chip.future{border-color:var(--future);color:#32225E;background:#F3EEFB}
.chip.mixed{border-color:#B4761A;color:#5C3A06;background:#FDF4E3}
h2.dtitle{font-size:21px;margin:2px 0 8px;line-height:1.25}
.summary{font-size:14.5px;color:var(--ink);margin:0 0 14px}
.how{background:var(--surface-2);border-left:3px solid var(--teal);padding:11px 14px;border-radius:0 8px 8px 0;margin:0 0 16px}
.how strong{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--teal);margin-bottom:3px}
.how p{margin:0;font-size:13.5px;color:var(--ink-2)}
.canvas{position:relative;border:1px solid var(--line);border-radius:8px;background:#fff;padding:14px;overflow:auto;
  min-height:240px;max-height:min(1400px,78vh)}
.canvas svg{max-width:none;height:auto;display:block;margin:0 auto}
.toolbar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:12px 0 0}
.tbtn{font:inherit;font-size:12px;padding:6px 10px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);
  border-radius:7px;cursor:pointer}
.tbtn:hover{border-color:var(--teal);color:var(--teal)}
.zoomval{font-size:12px;color:var(--ink-3);font-variant-numeric:tabular-nums;min-width:42px;text-align:center}
.review{margin:18px 0 0;padding:14px 16px;border:1px dashed var(--line);border-radius:8px;background:var(--surface-2)}
.review strong{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:6px}
.review ul{margin:0;padding-left:18px}
.review li{font-size:13.5px;color:var(--ink-2);margin:3px 0}
details.src{margin-top:16px}
details.src summary{cursor:pointer;font-size:12.5px;color:var(--ink-2)}
details.src pre{background:var(--navy);color:#E8EDF4;padding:14px;border-radius:8px;overflow:auto;font-family:var(--mono);
  font-size:12px;line-height:1.45;margin:9px 0 0}
.legend{max-width:1180px;margin:0 auto 16px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;
  background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:11px 16px;font-size:12px;color:var(--ink-2)}
.legend .sw{display:inline-flex;align-items:center;gap:6px}
.legend i{width:14px;height:14px;border-radius:4px;display:inline-block;border:1px solid rgba(0,0,0,.18)}
.err{color:var(--warn);font-family:var(--mono);font-size:12px;white-space:pre-wrap}
.printonly{display:none}
@media (max-width:980px){
  .layout{grid-template-columns:1fr}
  nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}
  main{padding:16px}
}
@media print{
  header,nav,.toolbar,details.src,.seg,.filter{display:none!important}
  .layout{display:block}
  body{background:#fff}
  .panel{break-inside:avoid;page-break-after:always;border:0;max-width:none;padding:0 0 18px}
  .canvas{max-height:none;border:0;overflow:visible}
  .printonly{display:block}
}
</style>
</head>
<body>
<header>
  <div>
    <h1>${esc(manifest.title)}</h1>
    <p class="sub">${esc(manifest.subtitle)}</p>
  </div>
  <div class="spacer"></div>
  <button class="hbtn" id="print">Print / PDF (all)</button>
  <button class="hbtn" id="theme">Dark</button>
</header>

<div class="layout">
  <nav aria-label="Diagrams">
    <input class="filter" id="filter" type="search" placeholder="Filter diagrams…" aria-label="Filter diagrams" />
    <div class="seg" role="group" aria-label="Show">
      <button data-scope="all" aria-pressed="true">All</button>
      <button data-scope="current" aria-pressed="false">Built</button>
      <button data-scope="future" aria-pressed="false">Future</button>
    </div>
    <div id="toc"></div>
  </nav>
  <main>
    <div class="legend" aria-label="Colour legend">
      <span class="sw"><i style="background:#0F2A4A"></i> person / client</span>
      <span class="sw"><i style="background:#0E6A6A"></i> Beacon process</span>
      <span class="sw"><i style="background:#E6F0F0"></i> in-process module</span>
      <span class="sw"><i style="background:#FDF4E3"></i> data store</span>
      <span class="sw"><i style="background:#F2F3F5"></i> external system</span>
      <span class="sw"><i style="background:#FFF0F0"></i> human gate / risk</span>
      <span class="sw"><i style="background:#F3EEFB"></i> not built yet</span>
    </div>
    <div id="view"></div>
  </main>
</div>

<script type="application/json" id="diagram-data">${data}</script>
<script src="vendor/mermaid.min.js"></script>
<script>
// Fall back to a pinned CDN build only if the vendored copy is missing (for
// example in a checkout where npm install was never run).
if (!window.mermaid) {
  document.write('<script src="https://cdn.jsdelivr.net/npm/mermaid@${mermaidVersion()}/dist/mermaid.min.js"><\\/script>');
}
</script>
<script>
(function () {
  var DATA = JSON.parse(document.getElementById("diagram-data").textContent);
  var diagrams = DATA.diagrams;
  var groups = DATA.groups;
  var STATUS = ${JSON.stringify(STATUS_LABEL)};
  var byId = {};
  diagrams.forEach(function (d, i) { d.n = i + 1; byId[d.id] = d; });

  var state = { id: (location.hash || "").replace("#", "") || diagrams[0].id, scope: "all", q: "", zoom: 1, printing: false };
  var svgCache = {};

  if (window.mermaid) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: '"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif',
      themeVariables: {
        primaryColor: "#E6F0F0", primaryTextColor: "#16202C", primaryBorderColor: "#0E6A6A",
        lineColor: "#44536B", secondaryColor: "#F5F7FA", tertiaryColor: "#FFFFFF",
        fontSize: "14px", clusterBkg: "#FBFCFE", clusterBorder: "#DCE3EC",
        noteBkgColor: "#FDF4E3", noteTextColor: "#5C3A06", noteBorderColor: "#B4761A",
        actorBkg: "#0F2A4A", actorTextColor: "#FFFFFF", actorBorder: "#07192E",
        signalColor: "#16202C", signalTextColor: "#16202C", labelBoxBkgColor: "#E6F0F0",
        labelBoxBorderColor: "#0E6A6A", labelTextColor: "#0B3B3B", loopTextColor: "#16202C",
        sequenceNumberColor: "#FFFFFF"
      },
      flowchart: { htmlLabels: true, curve: "basis", nodeSpacing: 46, rankSpacing: 54, useMaxWidth: false },
      sequence: { useMaxWidth: false, wrap: true, width: 190, actorMargin: 60 },
      er: { useMaxWidth: false },
      gantt: { useMaxWidth: false, barHeight: 18, fontSize: 12 },
      journey: { useMaxWidth: false }
    });
  }

  function matches(d) {
    if (state.scope === "current" && d.status === "future") return false;
    if (state.scope === "future" && d.status === "current") return false;
    if (!state.q) return true;
    var hay = (d.title + " " + d.summary + " " + d.type + " " + d.howToRead + " " + d.code).toLowerCase();
    return hay.indexOf(state.q.toLowerCase()) > -1;
  }

  function renderToc() {
    var toc = document.getElementById("toc");
    toc.innerHTML = "";
    groups.forEach(function (g) {
      var items = diagrams.filter(function (d) { return d.group === g.id && matches(d); });
      if (!items.length) return;
      var h = document.createElement("h2"); h.textContent = g.title; toc.appendChild(h);
      var b = document.createElement("p"); b.className = "gblurb"; b.textContent = g.blurb; toc.appendChild(b);
      var ol = document.createElement("ol");
      items.forEach(function (d) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = "#" + d.id;
        a.setAttribute("aria-current", d.id === state.id ? "true" : "false");
        a.innerHTML = '<span class="num">' + d.n + '</span><span>' + escapeHtml(d.title) + "</span>";
        li.appendChild(a); ol.appendChild(li);
      });
      toc.appendChild(ol);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function panel(d) {
    var el = document.createElement("section");
    el.className = "panel";
    el.id = "panel-" + d.id;
    var review = (d.review || []).map(function (q) { return "<li>" + escapeHtml(q) + "</li>"; }).join("");
    el.innerHTML =
      '<div class="chips">' +
        '<span class="chip ' + d.status + '">' + escapeHtml(STATUS[d.status] || d.status) + "</span>" +
        '<span class="chip">' + escapeHtml(d.type) + "</span>" +
        '<span class="chip">' + d.n + " of " + diagrams.length + "</span>" +
      "</div>" +
      '<h2 class="dtitle">' + escapeHtml(d.title) + "</h2>" +
      '<p class="summary">' + escapeHtml(d.summary) + "</p>" +
      '<div class="how"><strong>How to read it</strong><p>' + escapeHtml(d.howToRead) + "</p></div>" +
      '<div class="canvas" id="canvas-' + d.id + '"><p class="err">Rendering…</p></div>' +
      '<div class="toolbar">' +
        '<button class="tbtn" data-act="out">− Zoom out</button>' +
        '<span class="zoomval" id="zoom-' + d.id + '">100%</span>' +
        '<button class="tbtn" data-act="in">+ Zoom in</button>' +
        '<button class="tbtn" data-act="fit">Fit width</button>' +
        '<button class="tbtn" data-act="svg">Download SVG</button>' +
        '<button class="tbtn" data-act="png">Download PNG</button>' +
        '<button class="tbtn" data-act="copy">Copy source</button>' +
      "</div>" +
      (review ? '<div class="review"><strong>What to check when reviewing it</strong><ul>' + review + "</ul></div>" : "") +
      '<details class="src"><summary>Mermaid source — docs/diagrams/src/' + escapeHtml(d.file) + "</summary><pre>" + escapeHtml(d.code) + "</pre></details>";
    return el;
  }

  function draw(d, into) {
    var target = into || document.getElementById("canvas-" + d.id);
    if (!target) return Promise.resolve();
    if (!window.mermaid) {
      target.innerHTML = '<p class="err">Mermaid could not be loaded. Run <code>npm run diagrams</code> to vendor it into docs/diagrams/vendor/, or open this page while online.</p>';
      return Promise.resolve();
    }
    if (svgCache[d.id]) { target.innerHTML = svgCache[d.id]; return Promise.resolve(); }
    return mermaid
      .render("m-" + d.id + "-" + Math.random().toString(36).slice(2, 7), d.code)
      .then(function (res) { svgCache[d.id] = res.svg; target.innerHTML = res.svg; })
      .catch(function (err) {
        target.innerHTML = '<p class="err">This diagram failed to render:\\n' + escapeHtml(String(err && err.message ? err.message : err)) + "</p>";
      });
  }

  function applyZoom(d) {
    var svg = document.querySelector("#canvas-" + d.id + " svg");
    var label = document.getElementById("zoom-" + d.id);
    if (!svg) return;
    svg.style.transformOrigin = "top center";
    svg.style.transform = "scale(" + state.zoom + ")";
    if (label) label.textContent = Math.round(state.zoom * 100) + "%";
  }

  function fitWidth(d) {
    var box = document.getElementById("canvas-" + d.id);
    var svg = box && box.querySelector("svg");
    if (!svg) return;
    var w = svg.getBoundingClientRect().width / (state.zoom || 1);
    if (w > 0) { state.zoom = Math.min(1, (box.clientWidth - 28) / w); applyZoom(d); }
  }

  function download(name, blob) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function exportPng(d) {
    var svg = document.querySelector("#canvas-" + d.id + " svg");
    if (!svg) return;
    var clone = svg.cloneNode(true);
    clone.style.transform = "";
    var rect = svg.getBoundingClientRect();
    var w = Math.max(640, Math.round(rect.width / (state.zoom || 1)));
    var h = Math.max(360, Math.round(rect.height / (state.zoom || 1)));
    clone.setAttribute("width", w); clone.setAttribute("height", h);
    var xml = new XMLSerializer().serializeToString(clone);
    var img = new Image();
    img.onload = function () {
      var scale = 2;
      var c = document.createElement("canvas");
      c.width = w * scale; c.height = h * scale;
      var ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0);
      c.toBlob(function (blob) { if (blob) download(d.id + ".png", blob); });
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  }

  function show(id) {
    var d = byId[id] || diagrams[0];
    state.id = d.id; state.zoom = 1;
    var view = document.getElementById("view");
    view.innerHTML = "";
    var el = panel(d);
    view.appendChild(el);
    renderToc();
    draw(d).then(function () { fitWidth(d); });
    el.addEventListener("click", function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute("data-act");
      if (!act) return;
      if (act === "in") { state.zoom = Math.min(3, state.zoom + 0.15); applyZoom(d); }
      if (act === "out") { state.zoom = Math.max(0.3, state.zoom - 0.15); applyZoom(d); }
      if (act === "fit") { state.zoom = 1; applyZoom(d); fitWidth(d); }
      if (act === "svg" && svgCache[d.id]) download(d.id + ".svg", new Blob([svgCache[d.id]], { type: "image/svg+xml" }));
      if (act === "png") exportPng(d);
      if (act === "copy") {
        navigator.clipboard && navigator.clipboard.writeText(d.code);
        e.target.textContent = "Copied";
        setTimeout(function () { e.target.textContent = "Copy source"; }, 1200);
      }
    });
    document.title = d.title + " — " + DATA.meta.title;
  }

  // Print / PDF: render every diagram into one scrolling document first, so the
  // export is the whole set rather than whichever one happens to be open.
  function printAll() {
    if (state.printing) { window.print(); return; }
    var view = document.getElementById("view");
    view.innerHTML = "";
    var jobs = diagrams.map(function (d) {
      var el = panel(d);
      view.appendChild(el);
      return draw(d);
    });
    Promise.all(jobs).then(function () {
      state.printing = true;
      window.print();
    });
  }

  document.getElementById("filter").addEventListener("input", function (e) {
    state.q = e.target.value; renderToc();
  });
  Array.prototype.forEach.call(document.querySelectorAll(".seg button"), function (b) {
    b.addEventListener("click", function () {
      state.scope = b.getAttribute("data-scope");
      Array.prototype.forEach.call(document.querySelectorAll(".seg button"), function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      renderToc();
    });
  });
  document.getElementById("print").addEventListener("click", printAll);
  document.getElementById("theme").addEventListener("click", function (e) {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    document.documentElement.setAttribute("data-theme", dark ? "light" : "dark");
    e.target.textContent = dark ? "Dark" : "Light";
  });
  window.addEventListener("hashchange", function () {
    var id = (location.hash || "").replace("#", "");
    if (id && byId[id]) { state.printing = false; show(id); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    var i = diagrams.findIndex(function (d) { return d.id === state.id; });
    if (e.key === "j" || e.key === "ArrowDown") { location.hash = diagrams[Math.min(diagrams.length - 1, i + 1)].id; }
    if (e.key === "k" || e.key === "ArrowUp") { location.hash = diagrams[Math.max(0, i - 1)].id; }
  });

  show(state.id);
})();
</script>
</body>
</html>
`;
}

function buildMarkdown() {
  const lines = [];
  lines.push(`# ${manifest.title}`);
  lines.push("");
  lines.push(manifest.subtitle);
  lines.push("");
  lines.push(
    "**Three ways to read these.** Open [docs/diagrams/index.html](diagrams/index.html) in a browser for the " +
      "viewer (filter, zoom, SVG/PNG export, print-to-PDF of the whole set — it works offline, straight from the " +
      "filesystem). Scroll this file to read them on GitHub, which renders Mermaid natively. Or read the sources " +
      "under [docs/diagrams/src](diagrams/src), which is what review and diffs are for.",
  );
  lines.push("");
  lines.push(`Generated by \`${manifest.generatedBy}\` — **do not edit this file by hand**; edit the \`.mmd\` source and regenerate.`);
  lines.push("");
  lines.push("| # | Diagram | Kind | Status |");
  lines.push("|---|---|---|---|");
  diagrams.forEach((d, i) => {
    lines.push(`| ${i + 1} | [${d.title}](#${slug(d.title)}) | ${d.type} | ${STATUS_LABEL[d.status] ?? d.status} |`);
  });
  lines.push("");
  lines.push("### Colour legend");
  lines.push("");
  lines.push("| Fill | Meaning |");
  lines.push("|---|---|");
  lines.push("| navy | a person, or the browser they use |");
  lines.push("| teal | a Beacon process or the core computation |");
  lines.push("| pale teal | a module inside a process (not a service) |");
  lines.push("| sand | a data store |");
  lines.push("| grey, dashed | an external system |");
  lines.push("| pale red | a human gate, or a risk worth looking at |");
  lines.push("| purple, dashed | **not built yet** (phase 4 or 5) |");
  lines.push("");

  for (const g of manifest.groups) {
    const items = diagrams.filter((d) => d.group === g.id);
    if (!items.length) continue;
    lines.push(`## ${g.title}`);
    lines.push("");
    lines.push(`_${g.blurb}_`);
    lines.push("");
    for (const d of items) {
      lines.push(`### ${d.title}`);
      lines.push("");
      lines.push(`**${STATUS_LABEL[d.status] ?? d.status}** · ${d.type} · source: [\`src/${d.file}\`](diagrams/src/${d.file})`);
      lines.push("");
      lines.push(d.summary);
      lines.push("");
      lines.push(`> **How to read it.** ${d.howToRead}`);
      lines.push("");
      lines.push("```mermaid");
      lines.push(d.code.split("\n").filter((l) => !l.startsWith("%%")).join("\n").trim());
      lines.push("```");
      lines.push("");
      if (d.review?.length) {
        lines.push("<details><summary>What to check when reviewing it</summary>");
        lines.push("");
        for (const q of d.review) lines.push(`- ${q}`);
        lines.push("");
        lines.push("</details>");
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}

const slug = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

// ---- vendored mermaid ------------------------------------------------------

function vendorMermaid() {
  const target = join(vendorDir, "mermaid.min.js");
  let source;
  try {
    source = require.resolve("mermaid/dist/mermaid.min.js");
  } catch {
    return existsSync(target)
      ? { ok: true, note: "kept the existing vendored copy (mermaid is not installed)" }
      : { ok: false, note: "mermaid is not installed and no vendored copy exists — the viewer will use the CDN" };
  }
  if (!existsSync(vendorDir)) mkdirSync(vendorDir, { recursive: true });
  const fresh = !existsSync(target) || statSync(target).size !== statSync(source).size;
  if (fresh) copyFileSync(source, target);
  return { ok: true, note: fresh ? `vendored mermaid ${mermaidVersion()}` : "vendored mermaid already current", missing: !existsSync(target) };
}

// ---- run -------------------------------------------------------------------

const html = buildHtml();
const md = buildMarkdown();
const htmlPath = join(dir, "index.html");
const mdPath = join(root, "docs", "DIAGRAMS.md");
const same = (path, content) => existsSync(path) && read(path).replace(/\r\n/g, "\n") === content;

if (check) {
  const failed = await validate();
  const stale = [];
  if (!same(htmlPath, html)) stale.push("docs/diagrams/index.html");
  if (!same(mdPath, md)) stale.push("docs/DIAGRAMS.md");
  if (!existsSync(join(vendorDir, "mermaid.min.js"))) stale.push("docs/diagrams/vendor/mermaid.min.js");
  if (stale.length) {
    console.error(`✖ out of date with docs/diagrams/src: ${stale.join(", ")}`);
    console.error("  run `npm run diagrams` and commit the result.");
    process.exit(1);
  }
  if (failed) process.exit(1);
  console.log(`✓ ${diagrams.length} diagrams, index.html and DIAGRAMS.md are current`);
} else {
  const failed = await validate();
  writeFileSync(htmlPath, html);
  writeFileSync(mdPath, md);
  const v = vendorMermaid();
  console.log(`✓ wrote docs/diagrams/index.html and docs/DIAGRAMS.md (${diagrams.length} diagrams)`);
  console.log(`  ${v.note}`);
  if (failed) {
    console.error(`✖ ${failed} problem(s) in docs/diagrams/src — fix the source before committing`);
    process.exit(1);
  }
}
