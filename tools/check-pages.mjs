#!/usr/bin/env node
// The deploy gate. index.html and tests.html must load the SAME engine scripts in the
// SAME order; only a declared UI-only tail (tools/ui-only.json) and a test-only tail may
// differ. Two prior projects shipped a page with a module missing and a green suite.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = f => [...fs.readFileSync(path.join(ROOT, f), 'utf8')
  .matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const uiOnly = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/ui-only.json'), 'utf8')));
const problems = [];
const a = scripts('index.html').filter(s => !uiOnly.has(s));
const b = scripts('tests.html').filter(s => !s.startsWith('tests/') && !uiOnly.has(s));
if (JSON.stringify(a) !== JSON.stringify(b)) {
  problems.push('engine script lists differ:\n  index: ' + a.join(' ') + '\n  tests: ' + b.join(' '));
}
for (const s of new Set([...scripts('index.html'), ...scripts('tests.html')]))
  if (!fs.existsSync(path.join(ROOT, s))) problems.push('missing file: ' + s);
// hard rule 3: no defensive module fallbacks in UI code
for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  const m = src.match(/if\s*\(\s*!\s*RB\.[a-zA-Z]+\s*\)/);
  if (m) problems.push(`js/${f}: defensive module fallback ${m[0]} — a missing module must throw`);
}
// the printed pack is loaded by index.html only
if (scripts('tests.html').includes('data/printed.js'))
  problems.push('tests.html loads data/printed.js — text tests would check printed text, not the describers');
// The doors. Each of these is a rule with exactly one home, and each was at some point
// bypassed by a second path that looked fine and played wrong — damage written straight
// to the object skipping prevention and the bonus layer, a target pool sliced inside a
// pack skipping the player, Deflect and the `chosen` trigger. A grep is the cheapest
// possible guard and it costs nothing to keep.
const DOORS = [
  { file: /^js\/(ops-.*|abilities|combat|engine)\.js$/,
    bad: /\.damage\s*\+=/,
    allow: ['js/abilities.js'],
    say: 'writes obj.damage directly — damage goes through RB.dealDamage, or it skips ' +
         'prevention and the bonus-damage layer' },
  { file: /^js\/ops-.*\.js$/,
    bad: /RB\.tokenData\.push/,
    allow: [],
    say: 'pushes into RB.tokenData — declare a pack token with RB.defineToken, or anything ' +
         'building a work list from data/tokens.js misses it' },
];
for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
  const rel = 'js/' + f;
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const d of DOORS) {
    if (!d.file.test(rel) || d.allow.includes(rel)) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++)
      if (d.bad.test(lines[i]) && !/^\s*\/\//.test(lines[i]))
        problems.push(rel + ':' + (i + 1) + ' ' + d.say);
  }
}

if (problems.length) { for (const p of problems) console.error('✗ ' + p); process.exit(1); }
console.log('✓ check-pages: ' + a.length + ' engine scripts, lists match, ' +
  DOORS.length + ' doors unbypassed');
