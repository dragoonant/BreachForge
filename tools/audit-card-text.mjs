#!/usr/bin/env node
// The fidelity instrument.
//
// The card FACE shows the printed text verbatim (CLAUDE.md decision 1), so the describer
// in js/text.js is not what the player reads — it is the AUDITOR. This tool generates
// prose from each card's ability data and diffs it against the printed text by id,
// offline, and reports what does not line up.
//
// That diff is the only automated way to catch the biggest defect class in this series:
// a printed clause silently dropped for want of a primitive. The card plays, it looks
// structurally valid, and it is the wrong card. A test cannot see it, because the test
// only knows what the ability data says — both sides of a test come from the same source.
//
// It PRINTS FINDINGS, not material: counts to stdout, the detail to scratch/. A findings
// count you can act on beats a dump you have to read.
//
//   node tools/audit-card-text.mjs            # every card in a registered deck
//   node tools/audit-card-text.mjs --all      # every card in the pool
//   node tools/audit-card-text.mjs --only ogn-192
//   node tools/audit-card-text.mjs --verbose  # print each finding as well as writing it
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = n => { const i = argv.indexOf('--' + n); return i < 0 ? null : argv[i + 1]; };

const RB = loadEngine();
// The printed pack is deliberately absent from tests.html — a test loading it would start
// checking printed text instead of the describers — so the audit loads it itself. This is
// the one place both sides exist at once, which is the whole point of the tool.
const box = { console, Math, Date, JSON };
box.window = box; box.globalThis = box;
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/printed.js'), 'utf8'), box);
RB.printed = box.RB.printed;
RB.registerCards();

const THREW = '@@threw@@';

// --- normalisation --------------------------------------------------------
// Both sides are reduced to comparable facts. Anything the describer is not trying to
// reproduce — reminder text in parentheses, icon glyphs, register — is removed from both,
// so a finding is a real divergence rather than a difference of style.
const KW = /\[([A-Za-z][A-Za-z' -]*)(?: (\d+))?\]/g;
const GLYPH = /^(?:S|M|E|T|C|A|R|G|B|O|P|Y|K|>)$/;

function stripReminders(t) { return t.replace(/\([^)]*\)/g, ' '); }

function numbersIn(t) {
  // A bracketed number is a resource cost, printed on the card frame as well as in its
  // text; the describer does not repeat those in a rules line, so they are not compared.
  const body = t.replace(/\[(\d+)\]/g, ' ');
  const out = [];
  for (const m of body.matchAll(/(?<![A-Za-z])(\d+)(?![A-Za-z])/g)) out.push(+m[1]);
  return out.sort((a, b) => a - b);
}

function keywordsIn(t) {
  const out = new Set();
  for (const m of t.matchAll(KW)) {
    if (GLYPH.test(m[1])) continue;
    out.add(m[1].toLowerCase());
  }
  return out;
}

function words(t) {
  return new Set(stripReminders(t).toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z ]+/g, ' ')
    .split(/\s+/).filter(w => w.length > 3));
}

// Vocabulary the describer deliberately does not mirror, so its absence is not a finding.
const IGNORE = new Set(['this', 'that', 'them', 'they', 'their', 'your', 'with', 'from',
  'when', 'while', 'each', 'other', 'only', 'than', 'then', 'also', 'here', 'have',
  'into', 'more', 'must', 'such', 'unit', 'units', 'card', 'cards', 'player', 'players']);

function generatedFor(id) {
  try { return RB.cardText(id).trim(); } catch (e) { return THREW + e.message; }
}

function audit(id) {
  const ab = RB.card(id).abilities;
  const printed = (RB.printed[id] || '').trim();
  const generated = generatedFor(id);
  const f = [];

  if (generated.startsWith(THREW))
    return [{ id, kind: 'THREW', detail: generated.slice(THREW.length) }];
  if (!ab) return [{ id, kind: 'NO-DATA', detail: 'registered but has no ability data' }];
  if (ab.unimplemented) return [{ id, kind: 'PARTIAL', detail: ab.unimplemented }];
  if (ab.vanilla) {
    if (printed) f.push({ id, kind: 'VANILLA-BUT-PRINTED',
      detail: 'marked vanilla, but the card prints ' + printed.split('\n').length + ' line(s)' });
    return f;
  }
  if (printed && !generated)
    return [{ id, kind: 'EMPTY', detail: 'the card prints text and the describer says nothing' }];

  // 1. Numbers, in ONE direction only. A printed number absent from the generated prose
  //    is the most reliable single sign of a dropped or mistranscribed clause. The other
  //    direction is noise: the describer is routinely more explicit than the card, saying
  //    "+1 Might for each of your points" where the card says "increased by your points".
  const pn = numbersIn(stripReminders(printed));
  const gn = numbersIn(generated);
  const missingN = pn.filter(n => !gn.includes(n));
  if (missingN.length)
    f.push({ id, kind: 'NUMBER', detail: 'printed has ' + missingN.join(',') + ', generated does not' });

  // 2. Keywords. A bracketed keyword the ability data never declares — EXCEPT the ones
  //    expressed structurally rather than by name. [Accelerate] is correctly authored as
  //    an optional additional cost that makes the unit enter ready, so the word never
  //    appears in the prose and never should; flagging it would train the reader to
  //    ignore this check, which is worse than not having it.
  // Scan only the card's OWN text. Reminder text exists to explain one keyword by naming
  // others — "[Ambush] (You may play me as a [Reaction] …)" is not a card with Reaction —
  // and a quoted token's abilities belong to the token, authored there. Both were
  // generating findings that could never be actioned, which trains a reader to skim.
  const own = stripReminders(printed).replace(/"[^"]*"/g, ' ');
  const gl = generated.toLowerCase();
  const missingK = [...keywordsIn(own)]
    .filter(k => !gl.includes(k) && !structurallyPresent(k, ab, gl));
  if (missingK.length)
    f.push({ id, kind: 'KEYWORD', detail: 'printed names ' + missingK.join(', ') });

  // 3. Volume. Prose far shorter than print usually means a clause never arrived. Matched
  //    on a 5-character prefix, because the describer's register differs from the card's
  //    by inflection far more often than by meaning — "defends" against "defending".
  const pw = [...words(printed)].filter(w => !IGNORE.has(w));
  const gw = [...words(generated)];
  const seen = w => gw.some(g => g.startsWith(w.slice(0, 5)) || w.startsWith(g.slice(0, 5)));
  const unseen = pw.filter(w => !seen(w));
  if (pw.length >= 5 && unseen.length / pw.length > 0.65)
    f.push({ id, kind: 'SHORT', detail: Math.round(100 * unseen.length / pw.length) +
      '% of the printed vocabulary is absent — likely a dropped clause' });

  // 4. Malformed prose. These are defects in the DESCRIBER rather than in the card, and
  //    they are worth their own finding because a reader skims past them.
  if (/,\s*$|,\s*\n|:\s*$/.test(generated))
    f.push({ id, kind: 'DANGLING', detail: 'a clause ends with nothing after it — an empty effect list' });
  const dbl = generated.match(/\b(\w+)\s+\1\b/i);
  if (dbl) f.push({ id, kind: 'DOUBLED', detail: 'repeats the word "' + dbl[1] + '"' });

  return f;
}

// Keywords the grammar expresses as a SHAPE rather than as a declared name. Each entry
// says what to look for in the ability data; finding it means the card says the keyword
// even though the word is absent from the prose.
function structurallyPresent(kw, ab, gl) {
  switch (kw) {
    case 'accelerate':
      return (ab.additionalCosts || []).some(x => x.entersReady) || gl.includes('enter ready');
    case 'hidden':
      // Hidden is entirely the engine's: declaring the keyword IS the implementation.
      return (ab.keywords || []).some(k => (k.name || k) === 'Hidden');
    case 'repeat':
      return (ab.additionalCosts || []).some(x => x.effects);
    case 'empower': case 'empowered':
      return !!(ab.activated || []).length;
    case 'hunt':
      // [Hunt N] IS "when you conquer or hold, gain N XP", authored as those triggers.
      return (ab.triggers || []).some(t => t.on === 'conquer' || t.on === 'hold');
    case 'level':
      // [Level N] gates something on XP, authored as a static with an xpAtLeast condition.
      return (ab.statics || []).some(st => st.when && JSON.stringify(st.when).includes('xp'));
    case 'buff':
      return gl.includes('buff') || gl.includes('might');
    default:
      return false;
  }
}

// --- run ------------------------------------------------------------------
const inDeck = new Set();
for (const d of RB.deckData)
  for (const e of [{ id: d.legend }, ...d.runes, ...d.battlefields, ...d.main]) inDeck.add(e.id);

const only = opt('only');
let cards = RB.allCards().filter(c => c.type !== 'Rune');
if (!flag('all')) cards = cards.filter(c => inDeck.has(c.id));
if (only) cards = cards.filter(c => c.id === only);

const findings = [];
for (const c of cards) findings.push(...audit(c.id));

const byKind = {};
for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;

fs.mkdirSync(path.join(ROOT, 'scratch'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'scratch/audit-card-text.txt'),
  findings.map(f => {
    const printed = (RB.printed[f.id] || '').replace(/\n/g, ' / ');
    const gen = generatedFor(f.id).replace(THREW, '(threw) ').replace(/\n/g, ' / ');
    return f.kind + '  ' + f.id + '  ' + RB.card(f.id).name +
      '\n  why:       ' + f.detail +
      '\n  printed:   ' + printed +
      '\n  generated: ' + gen + '\n';
  }).join('\n'));

console.log(cards.length + ' cards audited, ' + findings.length + ' findings');
for (const k of Object.keys(byKind).sort()) console.log('  ' + k.padEnd(20) + byKind[k]);
if (flag('verbose')) for (const f of findings) console.log('  ' + f.kind + ' ' + f.id + ': ' + f.detail);
console.log('detail -> scratch/audit-card-text.txt');
