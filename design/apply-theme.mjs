/* ============================================================================
   apply-theme.mjs — push the common design system into every artboard.

   What it does, per screen in screens.json:
     1. injects beacon.css into the artboard's <style> between BEACON markers
     2. strips local CSS rules whose selectors beacon.css now owns  (dedup)
     3. replaces the sidebar with the ONE canonical role-based navigation
     4. renames legacy shell classes  pg→app, top→topbar, side→sidenav

   Run:  node design/apply-theme.mjs            (writes design/screens)
         node design/apply-theme.mjs <outDir>   (also mirror to the canvas dir)
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, 'beacon.css'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(join(HERE, 'screens.json'), 'utf8'));
const START = '/*==BEACON:START==*/';
const END = '/*==BEACON:END==*/';

/* ---- 1. which selectors does beacon.css own? (self-maintaining) -------- */
function topLevelRules(css) {
  const out = [];
  let depth = 0, buf = '', sel = '';
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const ch of src) {
    if (ch === '{') { depth++; if (depth === 1) { sel = buf.trim(); buf = ''; continue; } }
    else if (ch === '}') { depth--; if (depth === 0) { out.push({ sel, body: buf }); buf = ''; continue; } }
    buf += ch;
  }
  return out;
}
const OWNED = new Set();
for (const r of topLevelRules(CSS)) {
  const pool = r.sel.startsWith('@') ? topLevelRules(r.body) : [r];
  for (const x of pool) {
    if (x.sel.startsWith('@')) continue;
    for (const s of x.sel.split(',')) OWNED.add(s.trim());
  }
}

/* legacy selectors the rename makes dead — drop them too */
for (const s of ['.pg', '.top', '.side', '.h1s', '.navlab', '.side .navlab',
                 '.sidenav .navlab', '.demo', '.ro', '.top .demo', '.topbar .demo',
                 '.tabs', '.tab', '.tab.on', '.tab svg', '.tabs .tab']) OWNED.add(s);

/* ---- 2. strip rules beacon.css owns ----------------------------------- */
const dropped = [];
function strip(css, file) {
  const keep = [];
  for (const r of topLevelRules(css)) {
    if (r.sel.startsWith('@media')) {
      const inner = topLevelRules(r.body).filter(x => {
        const owned = x.sel.split(',').every(s => OWNED.has(s.trim()));
        if (owned) dropped.push(`${file}  @media ${x.sel}`);
        return !owned;
      });
      if (inner.length) keep.push(`${r.sel}{${inner.map(x => `${x.sel}{${x.body}}`).join('')}}`);
      continue;
    }
    if (r.sel.startsWith('@')) { keep.push(`${r.sel}{${r.body}}`); continue; }
    if (r.sel.split(',').every(s => OWNED.has(s.trim()))) { dropped.push(`${file}  ${r.sel}`); continue; }
    keep.push(`${r.sel}{${r.body}}`);
  }
  return keep.join('\n ');
}

/* ---- 3. the canonical navigation -------------------------------------- */
const I = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  board:    '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/>',
  inbox:    '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M4 12V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6"/><path d="M3 12v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  delivery: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  people:   '<circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 5.5a3.4 3.4 0 0 1 0 6.6M17.5 15c2 .7 3.5 2.3 3.5 5"/>',
  insights: '<line x1="6" y1="20" x2="6" y2="11"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="14"/>',
  retro:    '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  mywork:   '<path d="M4 7h16v13H4z"/><path d="M9 7V4h6v3"/><path d="M4 12h16"/>',
  help:     '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2A2.8 2.8 0 0 1 14.6 10c0 1.9-2.6 2-2.6 4"/><circle cx="12" cy="17.6" r="1"/>',
};
// role → [key, label, href, optional badge]
const NAV = {
  facilitator: [
    ['overview', 'Overview',  'Overview.dc.html'],
    ['board',    'Board',     'Main.dc.html'],
    ['inbox',    'Inbox',     'MeetingInbox.dc.html', '5'],
    ['delivery', 'Delivery',  'Hierarchy.dc.html'],
    ['people',   'People',    'TeamStatus.dc.html'],
    ['insights', 'Insights',  'RootCause.dc.html'],
    ['retro',    'Retro',     'Retro.dc.html'],
  ],
  manager: [
    ['overview', 'Overview',  'ManagerDashboard.dc.html'],
    ['delivery', 'Delivery',  'Hierarchy.dc.html'],
    ['people',   'People',    'Planning.dc.html'],
    ['insights', 'Insights',  'RootCause.dc.html'],
  ],
  member: [
    ['mywork',   'My work',   'MemberDashboard.dc.html'],
    ['board',    'Board',     'Main.dc.html'],
    ['help',     'Get help',  'BlockerAssist.dc.html'],
    ['insights', 'My trends', 'Metrics.dc.html'],
  ],
};
const NOTE = {
  facilitator: 'Sarah · Facilitator',
  manager: 'Dana · Manager · read-only',
  member: 'Marcus · Member',
};
function navHtml(role, active) {
  const items = NAV[role].map(([k, label, href, badge]) => {
    const svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${I[k]}</svg>`;
    const b = badge ? `<span class="count">${badge}</span>` : '';
    return k === active
      ? `      <span class="nav on" aria-current="page">${svg} <span>${label}</span>${b}</span>`
      : `      <a class="nav" href="${href}">${svg} <span>${label}</span>${b}</a>`;
  }).join('\n');
  return `<nav class="sidenav" aria-label="${role} navigation">\n${items}\n      <span class="navgap"></span>\n      <span class="navnote">${NOTE[role]}</span>\n    </nav>`;
}

/* ---- 4. apply --------------------------------------------------------- */
const dirs = [join(HERE, 'screens'), ...process.argv.slice(2)];
const log = [];
for (const name of Object.keys(MANIFEST)) {
  const spec = MANIFEST[name];
  for (const dir of dirs) {
    const path = join(dir, name);
    let src;
    try { src = readFileSync(path, 'utf8'); } catch { continue; }
    const before = src.length;

    // legacy shell class names → system names
    src = src.replace(/class="pg"/g, 'class="app"')
             .replace(/class="top"/g, 'class="topbar"')
             .replace(/class="side"/g, 'class="sidenav"')
             .replace(/class="h1s"/g, 'class="sub"')
             .replace(/class="demo"/g, 'class="tag"')
             .replace(/class="ro"/g, 'class="tag plain"')
             .replace(/<span class="navlab">([\s\S]*?)<\/span>/g, '<span>$1</span>');

    // lens bar — several artboards presenting as one screen
    if (spec.lens) {
      const [group, current] = spec.lens;
      const siblings = Object.entries(MANIFEST)
        .filter(([f, s]) => s.lens && s.lens[0] === group)
        .map(([f, s]) => s.lens[1] === current
          ? `<span class="on" aria-current="page">${s.lens[1]}</span>`
          : `<a href="${f}">${s.lens[1]}</a>`)
        .join('');
      const bar = `<div class="lens" aria-label="${group} views">${siblings}</div>`;
      src = src.replace(/(<div class="lens"[\s\S]*?<\/div>\s*)/, '');           // idempotent
      src = src.replace(/(<div class="sub">[\s\S]*?<\/div>)/, `$1\n      ${bar}`);
    }

    // canonical navigation
    // "tabs" was a second, hand-written bottom-bar implementation; the system's
    // .sidenav already becomes a bottom bar at phone width, so it replaces it.
    if (spec.role && spec.nav !== false) {
      const re = /<nav class="(?:side|sidenav|tabs)"[^>]*>[\s\S]*?<\/nav>/;
      if (re.test(src)) src = src.replace(re, navHtml(spec.role, spec.active));
    }

    // inject the system, strip what it owns
    src = src.replace(/<style>([\s\S]*?)<\/style>/, (_m, body) => {
      const local = strip(body.replace(new RegExp(`${esc(START)}[\\s\\S]*?${esc(END)}`), ''), name);
      return `<link rel="stylesheet" href="./beacon.css">\n<style>\n${START}\n${CSS}\n${END}\n /* ${name} — screen-specific only */\n ${local}\n</style>`;
    });
    // the <link> is a convenience for standalone viewing; the inlined copy is
    // what the canvas runtime renders, so the screen never depends on it.
    src = src.replace(/<link rel="stylesheet" href="\.\/beacon\.css">\s*(?=<link rel="stylesheet" href="\.\/beacon\.css">)/g, '');

    writeFileSync(path, src);
    if (dir === dirs[0]) log.push(`${name}  ${before} → ${src.length}`);
  }
}
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

console.log(`beacon.css owns ${OWNED.size} selectors`);
console.log(`\nrules dropped as duplicates (${dropped.length}):`);
console.log(dropped.join('\n'));
console.log(`\nscreens updated:\n${log.join('\n')}`);
