#!/usr/bin/env node
// Builds data/cards.js, data/printed.js and data/decks.js from the gitignored
// scratch/ dumps (pool.json = the 163-card union, selected.json = the 10 decks,
// subtitles.json = tools/fetch-subtitles.mjs).
// Mechanical fields and names cross into the repo; nothing else does.
import fs from 'node:fs';
const pool = JSON.parse(fs.readFileSync('scratch/pool.json', 'utf8'));
const sel  = JSON.parse(fs.readFileSync('scratch/selected.json', 'utf8'));
const subs = JSON.parse(fs.readFileSync('scratch/subtitles.json', 'utf8'));

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const id   = c => (c.setCode + '-' + c.cardNumber.split('-')[0]);
const byDeckId = {};
for (const c of pool) byDeckId[(c.setCode + '-' + c.cardNumber.split('-')[0]).toUpperCase()] = c;

// A card's name is "[Short Name], [Subtitle]" for ALL purposes (rules 1.2), which is why
// two Rengars can sit in one deck at 3 copies each: they are different names. pool.json
// carries only the short half, so the subtitle is merged in here from its own dump, and
// `nameId` is slugged from the FULL name — otherwise sfd-025 and unl-120 slug to the same
// key and whichever registers last silently evicts the other from the name index.
//
// The gallery reuses one `subtitle` key for three different things, and only the first is
// a subtitle. The supertype is what tells them apart — NOT whether the value also appears
// in `tags`, which was the first guess here and was wrong: ogn-027 prints TRIFARIAN as a
// tag chip on the type line AND as the subtitle under the name, both, on the same card.
//   Unit + Champion   -> the real subtitle          sfd-109 "Mischievous", ogn-027 "Trifarian"
//   Spell + Signature -> the champion tag           ogn-268 "Miss Fortune"  (already in tags)
//   Legend            -> a product marker           ogs-017 "Starter"
// Each of the three was checked against the printed card face before this line was written.
const subtitleOf = c => {
  const s = subs[id(c)];
  if (!s) return null;
  if (c.cardType !== 'Unit' || !(c.cardTypeLabels || []).includes('Champion')) return null;
  return s.subtitle;
};
const fullName = c => {
  const s = subtitleOf(c);
  return s ? c.name + ', ' + s : c.name;
};

const cards = pool.map(c => ({
  id: id(c),
  name: c.name,
  subtitle: subtitleOf(c),
  nameId: slug(fullName(c)),
  type: c.cardType,
  domain: c.domain,
  domains: c.domains || [],
  tags: c.tags || [],
  energy: c.energy,
  power: c.power,
  might: c.might,
  rarity: c.rarity,
  set: c.cardSet,
  artist: c.artist,
})).sort((a, b) => a.id.localeCompare(b.id));

const printed = {};
for (const c of pool) printed[id(c)] = (c.abilityEffective || '').trim();

const decks = sel.map((d, i) => {
  // The source lists a card once per printing (a foil and a normal row both resolve to the
  // same base id), so entries must be merged by id or a deck reads "2x Akshan / 1x Akshan"
  // and every per-entry copy-limit check silently measures the wrong thing.
  const merged = new Map();
  for (const x of d.cards) {
    const key = id(byDeckId[x.id]);
    merged.set(key, (merged.get(key) || 0) + x.qty);
  }
  const entries = [...merged].map(([k, qty]) => ({ id: k, qty: qty }));
  {
    const legendCard = byDeckId[[...merged.keys()].find(k => byDeckId[k.toUpperCase()].cardType === 'Legend').toUpperCase()];
    const tag = (legendCard.tags || [])[0];
    const hasChampion = entries.some(e => {
      const c = byDeckId[e.id.toUpperCase()];
      return c && c.cardType === 'Unit' && (c.tags || []).includes(tag);
    });
    const fb = {
      LeBlanc: 'unl-172', Vex: 'unl-150', Azir: 'sfd-177', Sivir: 'sfd-143',
      Viktor: 'ogn-246', Ezreal: 'sfd-149', "Kai'Sa": 'ogn-112', Lillia: 'unl-058',
      Sett: 'ogn-164', 'Miss Fortune': 'ogn-193', "Kha'Zix": 'unl-143',
    }[tag];
    if (!hasChampion && fb) entries.push({ id: fb, qty: 1 });
  }
  const grab = t => entries.filter(e => byDeckId[e.id.toUpperCase()].cardType === t);
  // Some posted decklists omit part of the rune deck. A legal Riftbound deck has exactly
  // 12 runes matching the legend's domains, so the shortfall is filled with basic runes of
  // the deck's under-represented domains rather than played short. D-3 in DEVIATIONS.md.
  const BASIC = { Fury: 'ogn-007', Calm: 'ogn-042', Mind: 'ogn-089',
                  Body: 'ogn-126', Chaos: 'ogn-166', Order: 'ogn-214' };
  const fillRunes = (runes, domains) => {
    const have = {};
    for (const e of runes) have[byDeckId[e.id.toUpperCase()].domain] = (have[byDeckId[e.id.toUpperCase()].domain] || 0) + e.qty;
    let total = Object.values(have).reduce((a, b) => a + b, 0);
    const doms = domains.filter(x => BASIC[x]);
    while (total < 12) {
      // Top up the domain furthest below an even split, so a list that recorded only one
      // colour ends up with the split its legend actually requires.
      doms.sort((a, b) => (have[a] || 0) - (have[b] || 0));
      const d = doms[0];
      have[d] = (have[d] || 0) + 1; total++;
      const e = runes.find(x => x.id === BASIC[d]);
      if (e) e.qty++; else runes.push({ id: BASIC[d], qty: 1 });
    }
    return runes;
  };

  // The Chosen Champion is a champion unit whose champion tag matches the legend's, taken
  // out of the main deck at setup and started in the public Champion Zone (§1.1). Four of
  // the posted lists omit it — the site's payload does not record it — and a deck without
  // one is illegal, so the shortfall is filled with a champion of the legend's own name in
  // the deck's domains. D-11 in DEVIATIONS.md.
  const CHAMPION_FALLBACK = {
    LeBlanc: 'unl-172', Vex: 'unl-150', Azir: 'sfd-177', Sivir: 'sfd-143',
    Viktor: 'ogn-246', Ezreal: 'sfd-149', "Kai'Sa": 'ogn-112', Lillia: 'unl-058',
    Sett: 'ogn-164', 'Miss Fortune': 'ogn-193', "Kha'Zix": 'unl-143',
  };
  const chosenChampion = (entries, legendCard) => {
    const tag = (legendCard.tags || [])[0];
    const found = entries.find(e => {
      const c = byDeckId[e.id.toUpperCase()];
      return c && c.cardType === 'Unit' && (c.tags || []).includes(tag);
    });
    if (found) return found.id;
    return CHAMPION_FALLBACK[tag] || null;
  };

  return {
    id: slug(d.legend.split(',')[0]) + '-' + slug(d.domains.split(',')[0]),
    name: d.legend,
    legend: grab('Legend')[0].id,
    domains: d.domains.split(','),
    event: d.event, result: d.result, date: d.date,
    runes: fillRunes(grab('Rune'), d.domains.split(',')),
    battlefields: grab('Battlefield'),
    main: entries.filter(e => !['Legend', 'Rune', 'Battlefield'].includes(byDeckId[e.id.toUpperCase()].cardType)),
    champion: chosenChampion(entries, byDeckId[grab('Legend')[0].id.toUpperCase()]),
  };
});

// Every champion unit on paper carries a subtitle, so a champion unit that arrives without
// one means the subtitle dump is stale for a set the pool already has — the exact shape of
// the bug this file is fixing, and it must not be able to happen quietly a second time.
const unsubtitled = pool.filter(c =>
  (c.cardTypeLabels || []).includes('Champion') && c.cardType === 'Unit' && !subtitleOf(c));
if (unsubtitled.length)
  throw new Error('champion units with no subtitle (re-run tools/fetch-subtitles.mjs): ' +
    unsubtitled.map(id).join(' '));

// Two ids sharing a name is legal only when their subtitles differ; identical full names
// would mean the 3-copy limit is being counted against the wrong thing.
const seen = new Map();
for (const c of cards) {
  if (seen.has(c.nameId))
    throw new Error('two cards share the full name "' + c.name +
      (c.subtitle ? ', ' + c.subtitle : '') + '": ' + seen.get(c.nameId) + ' and ' + c.id);
  seen.set(c.nameId, c.id);
}

const banner = '// GENERATED by tools/import-cards.mjs — do not hand-edit.\n';
const w = (f, body) => { fs.writeFileSync(f, banner + body); console.log(f, fs.statSync(f).size); };
w('data/cards.js', 'window.RB = window.RB || {};\nRB.cardData = ' + JSON.stringify(cards, null, 0).replace(/\},\{/g, '},\n{') + ';\n');
w('data/printed.js', 'window.RB = window.RB || {};\nRB.printed = ' + JSON.stringify(printed, null, 1) + ';\n');
w('data/decks.js', 'window.RB = window.RB || {};\nRB.deckData = ' + JSON.stringify(decks, null, 1) + ';\n');
console.log('cards', cards.length, 'decks', decks.length);
