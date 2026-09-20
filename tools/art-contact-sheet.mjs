#!/usr/bin/env node
// Builds a contact sheet of the generated card art so a whole run can be judged at a glance.
//
// Reads data/cards.js, tools/art-prompts.json and whatever is in art/cards/, and writes
// scratch/art-contact-sheet.html (scratch/ is gitignored — this is a review artefact, not output).
// Cards with art show the image; cards without show a placeholder painted by js/procart.js, so the
// sheet always shows the 163 faces the game will actually draw, generated or procedural.
//
// Usage:
//   node tools/art-contact-sheet.mjs                     every card, grouped by type
//   node tools/art-contact-sheet.mjs --group domain      group by domain instead
//   node tools/art-contact-sheet.mjs --missing           only the ids with no generated art
//   node tools/art-contact-sheet.mjs --generated         only the ids that DO have generated art
//   node tools/art-contact-sheet.mjs --ids a,b,c         only these ids (QC a regeneration batch)
//   node tools/art-contact-sheet.mjs --page 3            16 tiles per sheet, sheet 3 (1-based)
//   node tools/art-contact-sheet.mjs --per 12 --page 2   override tiles per sheet
//   node tools/art-contact-sheet.mjs --size 220          tile width in px (default 200)
//   node tools/art-contact-sheet.mjs --open              also print the file:// URL to open

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART_DIR = path.join(ROOT, 'art', 'cards');
const OUT = path.join(ROOT, 'scratch', 'art-contact-sheet.html');

function parseArgs(argv) {
  const o = { group: 'type', missing: false, generated: false, ids: null, size: 200, open: false, page: 0, per: 16 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--group') o.group = argv[++i];
    else if (a === '--missing') o.missing = true;
    else if (a === '--generated') o.generated = true;
    else if (a === '--ids') o.ids = new Set(argv[++i].split(',').map((x) => x.trim()).filter(Boolean));
    else if (a === '--page') o.page = Number(argv[++i]);
    else if (a === '--per') o.per = Number(argv[++i]);
    else if (a === '--size') o.size = Number(argv[++i]);
    else if (a === '--open') o.open = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else { console.error(`Unknown flag: ${a}`); process.exit(1); }
  }
  return o;
}

function loadCards() {
  const src = fs.readFileSync(path.join(ROOT, 'data', 'cards.js'), 'utf8');
  const ctx = vm.createContext({});
  vm.runInContext('var window = globalThis;', ctx);
  vm.runInContext(src, ctx);
  return ctx.RB.cardData;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('See the header comment in tools/art-contact-sheet.mjs.');
    return;
  }

  const cards = loadCards();
  const promptsPath = path.join(ROOT, 'tools', 'art-prompts.json');
  const prompts = fs.existsSync(promptsPath) ? JSON.parse(fs.readFileSync(promptsPath, 'utf8')) : {};

  let rows = cards.map((c) => {
    const file = path.join(ART_DIR, `${c.id}.webp`);
    const has = fs.existsSync(file);
    return {
      card: c,
      has,
      bytes: has ? fs.statSync(file).size : 0,
      src: `../art/cards/${c.id}.webp`,
      prompt: prompts[c.id] || ''
    };
  });

  const total = rows.length;
  const generated = rows.filter((r) => r.has).length;
  if (opts.missing) rows = rows.filter((r) => !r.has);
  if (opts.generated) rows = rows.filter((r) => r.has);
  if (opts.ids) rows = rows.filter((r) => opts.ids.has(r.card.id));

  // Paging exists so a whole run can be QC'd sheet by sheet at a readable size rather than as one
  // unreviewable wall of 166 tiles.
  const pages = Math.max(1, Math.ceil(rows.length / opts.per));
  let pageNote = '';
  if (opts.page) {
    const p = Math.min(Math.max(1, opts.page), pages);
    pageNote = ` · sheet ${p} of ${pages}`;
    rows = rows.slice((p - 1) * opts.per, p * opts.per);
  } else if (opts.per > 0 && rows.length > opts.per) {
    // No explicit --page: emit every tile but let ?sheet=N in the URL show one sheet at a time,
    // so a reviewer (or a screenshot loop) can step through without rebuilding the file.
    pageNote = ` · ?sheet=1..${pages}`;
  }

  const keyOf = (r) => (opts.group === 'domain'
    ? (r.card.domains || []).join(' + ') || r.card.domain
    : r.card.type);
  const groups = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const sections = [...groups.entries()].map(([name, list]) => `
    <h2>${esc(name)} <span class="c">${list.length}</span></h2>
    <div class="grid">
      ${list.map((r) => `
        <figure class="${r.has ? 'has' : 'no'}" data-id="${esc(r.card.id)}"
                data-domains="${esc((r.card.domains || []).join(','))}"
                data-type="${esc(r.card.type)}">
          ${r.has
    ? `<img src="${esc(r.src)}" alt="">`
    : '<canvas class="proc" width="200" height="280"></canvas>'}
          <figcaption>
            <b>${esc(r.card.name)}</b>
            <span class="id">${esc(r.card.id)} · ${esc(r.card.type)} · ${esc((r.card.domains || []).join('+'))}</span>
            <span class="st">${r.has ? `${Math.round(r.bytes / 1024)} KB` : 'procedural placeholder'}</span>
            ${opts.page ? '' : `<span class="pr">${esc(r.prompt)}</span>`}
          </figcaption>
        </figure>`).join('')}
    </div>`).join('');

  const html = `<!doctype html>
<meta charset="utf-8">
<title>BreachForge art contact sheet</title>
<link rel="stylesheet" href="../css/style.css">
<style>
  body { background:#101317; color:#d7dde4; font:13px/1.5 -apple-system,system-ui,sans-serif; margin:0; padding:20px 24px 60px; }
  h1 { font-size:16px; margin:0 0 4px; }
  .sum { color:#8b949e; font-size:12px; margin-bottom:18px; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.09em; color:#8b949e;
       margin:26px 0 10px; border-bottom:1px solid #222a33; padding-bottom:6px; }
  h2 .c { color:#586069; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(${opts.size}px,1fr)); gap:16px; }
  figure { margin:0; }
  figure img, figure canvas { display:block; width:100%; aspect-ratio:512/676; object-fit:cover;
       border-radius:8px; background:#1a1f26; box-shadow:0 3px 12px rgba(0,0,0,.45); }
  figure.no img, figure.no canvas { outline:1px dashed #3d4752; outline-offset:-1px; }
  figcaption { margin-top:6px; display:flex; flex-direction:column; gap:1px; }
  figcaption b { font-size:12px; }
  .id, .st { color:#7d8590; font-size:10px; }
  .pr { color:#5b636c; font-size:9.5px; max-height:2.6em; overflow:hidden; }
</style>
<h1>BreachForge card art</h1>
<div class="sum">${generated} of ${total} generated · ${total - generated} still on procedural art · grouped by ${esc(opts.group)}${esc(pageNote)}</div>
${sections}
<script src="../data/cards.js"></script>
<script src="../js/procart.js"></script>
<script>
  // Paint the procedural placeholder for every card that has no generated art yet, so the sheet
  // shows the real face the game draws rather than an empty box.
  // ?sheet=N shows only the Nth group of tiles.
  (function () {
    var n = parseInt(new URLSearchParams(location.search).get('sheet') || '0', 10);
    if (!n) return;
    var per = __PER__;
    var figs = [].slice.call(document.querySelectorAll('figure'));
    figs.forEach(function (f, i) {
      f.style.display = (i >= (n - 1) * per && i < n * per) ? '' : 'none';
    });
    document.querySelectorAll('h2').forEach(function (h) {
      var g = h.nextElementSibling;
      var any = [].slice.call(g.querySelectorAll('figure')).some(function (f) { return f.style.display !== 'none'; });
      h.style.display = any ? '' : 'none';
      g.style.display = any ? '' : 'none';
    });
    document.querySelector('.sum').textContent += ' — showing sheet ' + n;
  })();

  var byId = {};
  RB.cardData.forEach(function (c) { byId[c.id] = c; });
  document.querySelectorAll('figure.no').forEach(function (fig) {
    var card = byId[fig.dataset.id];
    var host = fig.querySelector('canvas.proc');
    if (!card || !host) return;
    var art = RB.procArt(card, 200, 280);
    var ctx = host.getContext('2d');
    ctx.drawImage(art, 0, 0, host.width, host.height);
  });
</script>
`.replace('__PER__', String(opts.per));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`${generated}/${total} cards have generated art.`);
  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
  if (opts.open) console.log(`file://${OUT}`);
}

main();
