// The card registry. RB.cardData is generated (tools/import-cards.mjs); the ability data
// that makes a card play lives in data/abilities.js keyed by the same id. Load-time
// validation runs here: a registered card with no ability data, an unimplemented marker,
// or a skeleton default that a real value would replace, fails loudly.
(function (RB) {
  'use strict';
  const byId = Object.create(null);
  const byNameId = Object.create(null);

  RB.DOMAINS = ['Fury', 'Calm', 'Mind', 'Body', 'Order', 'Chaos'];
  RB.VICTORY_SCORE = 8;

  RB.registerCards = function () {
    // Tokens register alongside real cards so every selector, describer and renderer sees
    // one card table. A token's might can still be overridden at mint time by the card
    // that makes it, because several cards create the same token at different sizes.
    if (!RB.abilityData || !RB.abilityData['tok-gold']) RB.registerAbilities(RB.tokenAbilities);
    for (const c of RB.cardData.concat(RB.tokenData)) {
      byId[c.id] = c;
      byNameId[c.nameId] = c;
      c.abilities = (RB.abilityData && RB.abilityData[c.id]) || null;
    }
    return Object.keys(byId).length;
  };
  RB.card = function (id) {
    const c = byId[id];
    if (!c) throw new Error('unknown card id: ' + id);
    return c;
  };
  RB.cardByNameId = function (n) { return byNameId[n] || null; };
  RB.allCards = function () { return Object.values(byId); };

  // Printed text is the face; the describer in js/text.js is the auditor and the
  // harness fallback. index.html loads data/printed.js; tests.html must not.
  RB.printedText = function (id) {
    return (RB.printed && RB.printed[id]) || (RB.cardText ? RB.cardText(id) : '');
  };

  // --- load-time validation -------------------------------------------------
  RB.validate = function () {
    const problems = [];
    const inPlay = new Set();
    for (const d of RB.deckData)
      for (const e of [{ id: d.legend, qty: 1 }, ...d.runes, ...d.battlefields, ...d.main])
        inPlay.add(e.id);

    for (const c of RB.allCards()) {
      if (!c.type) problems.push(c.id + ': no type');
      if (c.type === 'Unit' && (c.might === null || c.might === undefined))
        problems.push(c.id + ': unit with no might');
      if (!inPlay.has(c.id)) continue;
      // A basic rune's two abilities are the engine's payment rules (§165.3), not card
      // data — nothing to author, and an entry for one would be a second home for them.
      if (c.type === 'Rune') continue;
      if (!c.abilities) { problems.push(c.id + ': registered but has no ability data'); continue; }
      if (c.abilities.vanilla) continue;
      if (c.abilities.skeleton)
        problems.push(c.id + ': still carries the skeleton default');
    }
    for (const d of RB.deckData) {
      const n = d.main.reduce((s, e) => s + e.qty, 0);
      if (n < 1) problems.push(d.id + ': empty main deck');
      const total = {};
      for (const e of d.main) total[e.id] = (total[e.id] || 0) + e.qty;
      for (const k of Object.keys(total))
        if (total[k] > 3) problems.push(d.id + ': ' + k + ' x' + total[k] + ' exceeds the copy limit');
    }
    return problems;
  };

  // A card whose printed text the grammar cannot yet express carries an `unimplemented`
  // marker. It plays as its printed body — a unit's might works, its ability does not —
  // and it is MARKED, on the card face and in the deck picker, with the clause that is
  // missing. The alternative the earlier projects used was to hide every deck containing
  // one, which here would hide all ten and leave nothing to practise against; an
  // unmarked partial card is the thing that must never happen, and this is not that.
  //
  // A card that plays WRONG — as opposed to incompletely — still goes in data/defects.js
  // and still takes its decks out of circulation.
  RB.isPartial = function (id) {
    const c = byId[id];
    return !!(c && c.abilities && c.abilities.unimplemented);
  };
  RB.partialReason = function (id) {
    const c = byId[id];
    return (c && c.abilities && c.abilities.unimplemented) || null;
  };
  RB.deckPartials = function (d) {
    const ids = [d.legend, ...d.runes.map(e => e.id), ...d.battlefields.map(e => e.id), ...d.main.map(e => e.id)];
    return [...new Set(ids.filter(RB.isPartial))];
  };

  // The content gate. data/defects.js lists ids that do not yet play as they read;
  // any deck containing one is out of circulation until the entry is deleted.
  RB.playableDecks = function () {
    const bad = new Set(RB.defects || []);
    return RB.deckData.filter(d =>
      ![d.legend, ...d.runes.map(e => e.id), ...d.battlefields.map(e => e.id), ...d.main.map(e => e.id)]
        .some(id => bad.has(id)));
  };
  RB.deck = function (id) {
    const d = RB.deckData.find(x => x.id === id);
    if (!d) throw new Error('unknown deck id: ' + id);
    return d;
  };
})(window.RB = window.RB || {});
