#!/usr/bin/env node
// Writes scratch/subtitles.json — the printed subtitle of every card that has one.
//
// The original pool scrape read the gallery's `name` field and stopped there, so 63 cards
// arrived carrying half of their printed name: sfd-109 was "Akshan", never "Akshan /
// Mischievous". The gallery's own payload has always had the field; nothing was ever
// asked for it. This tool asks.
//
// Two shapes share that `subtitle` key upstream and only one of them is a subtitle:
//   - a champion unit carries its real one          sfd-109 -> "Mischievous"
//   - a signature spell carries its CHAMPION TAG    ogn-268 -> "Miss Fortune"
// The second is already in `tags` and prints as a tag chip on the type line, not as a
// subtitle band (checked against the card face). Writing it here too would print the
// champion's name on the card twice, so a subtitle equal to one of the card's own tags is
// dropped. Legends are the same story from the other side: the gallery names them by the
// epithet alone ("Pridestalker") with the champion in `tags`, which is exactly what the
// printed card does, so they need nothing and get nothing.
import fs from 'node:fs';

const URL = 'https://playriftbound.com/en-us/card-gallery/';
const res = await fetch(URL, { headers: { 'user-agent': 'Mozilla/5.0' } });
if (!res.ok) throw new Error('gallery fetch failed: ' + res.status);
const html = await res.text();

// The card records sit in the page's embedded payload as plain JSON. Matching the three
// keys in printed order is what keeps this from picking up some other object's `name`.
const RE = /"id":"([a-z]{3}-[0-9a-z]+-[0-9]+)","collectorNumber":[0-9]+,"name":"((?:[^"\\]|\\.)*)","subtitle":"((?:[^"\\]|\\.)*)"/g;

const unesc = s => JSON.parse('"' + s + '"');
const out = {};
let hits = 0;
for (const m of html.matchAll(RE)) {
  hits++;
  // A card is printed in several products; the base id is what the repo keys on.
  const base = m[1].split('-').slice(0, 2).join('-');
  const sub = unesc(m[3]).trim();
  if (sub) out[base] = { name: unesc(m[2]).trim(), subtitle: sub };
}
if (hits === 0)
  throw new Error('gallery payload matched no card records — the page shape changed');

const sorted = {};
for (const k of Object.keys(out).sort()) sorted[k] = out[k];
fs.mkdirSync('scratch', { recursive: true });
fs.writeFileSync('scratch/subtitles.json', JSON.stringify(sorted, null, 1) + '\n');
console.log('scratch/subtitles.json: ' + Object.keys(sorted).length + ' subtitles from ' + hits + ' records');
