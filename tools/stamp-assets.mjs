#!/usr/bin/env node
// Cache busting, without a build step.
//
// GitHub Pages serves every file with `cache-control: max-age=600` and no way to change
// it. Each asset is fetched and aged independently, so for ten minutes after a deploy a
// returning player can hold NEW index.html alongside OLD css/style.css — which is exactly
// how a shipped, verified fix to the log drawer still rendered broken in a real browser.
// The page was not wrong; the stylesheet was ten minutes behind it.
//
// The fix is to make the HTML the only thing that can be stale. Every declared asset
// carries `?v=<hash of its own contents>`, so:
//   * a file that did not change keeps its URL and stays cached — no cost to shipping;
//   * a file that DID change has a URL the browser has never seen, so it cannot serve a
//     stale copy of it;
//   * until the new index.html arrives you get the old version, WHOLE. A mixed page is
//     the failure mode this removes, and a consistent old page is not a bug.
//
// tests.html is deliberately not stamped: it never deploys, and check-pages strips the
// query before comparing the two script lists, so hard rule 3 still holds.
//
//   node tools/stamp-assets.mjs           rewrite index.html with current hashes
//   node tools/stamp-assets.mjs --check   exit 1 if any stamp is stale (the CI gate)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'index.html';
const check = process.argv.includes('--check');

// The declared assets: the script list and the stylesheet. Runtime-loaded files (card art,
// audio) are NOT stamped — they are fetched by id from a manifest that IS stamped, and a
// briefly stale image is a cosmetic self-healing miss rather than a broken page.
const TAGS = [
  { re: /(<script src=")([^"]+)(")/g, what: 'script' },
  { re: /(<link rel="stylesheet" href=")([^"]+)(")/g, what: 'stylesheet' },
  // "EVERY declared asset" is the rule, and the title video is one. It will almost never
  // change, which is exactly why a stamp costs nothing: an unchanged file keeps its URL
  // and stays cached.
  { re: /(<video id="[^"]*" src=")([^"]+)(")/g, what: 'video' },
];

const bare = u => u.split('?')[0];
const isLocal = u => !/^[a-z]+:/i.test(u) && !u.startsWith('//');

function hashOf(rel) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) throw new Error(`${PAGE} references a file that does not exist: ${rel}`);
  return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10);
}

const src = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');
const stale = [];
let out = src;
let n = 0;

for (const { re } of TAGS) {
  out = out.replace(re, (whole, pre, url, post) => {
    if (!isLocal(url)) return whole;
    const rel = bare(url);
    const want = rel + '?v=' + hashOf(rel);
    n++;
    if (url !== want) stale.push(rel);
    return pre + want + post;
  });
}

if (check) {
  if (stale.length) {
    console.error('✗ stamp-assets: ' + stale.length + ' asset stamp(s) out of date in ' + PAGE + ':');
    for (const s of stale) console.error('    ' + s);
    console.error('  run: node tools/stamp-assets.mjs');
    process.exit(1);
  }
  console.log('✓ stamp-assets: ' + n + ' assets, every stamp current');
} else {
  if (out !== src) fs.writeFileSync(path.join(ROOT, PAGE), out);
  console.log((out === src ? '= ' : '✓ ') + 'stamp-assets: ' + n + ' assets stamped' +
    (stale.length ? ', ' + stale.length + ' updated' : ', no change'));
}
