// Content gates. These are the tests that keep a broken card out of circulation.
export function run(t) {
  const RB = t.RB;
  RB.registerCards();

  t.test('every card in a registered deck has ability data', () => {
    const missing = RB.validate().filter(p => /has no ability data/.test(p));
    t.eq(missing.length, 0, missing.slice(0, 6).join('; '));
  });

  t.test('no registered card carries a skeleton default a real value would replace', () => {
    const bad = RB.validate().filter(p => /skeleton/.test(p));
    t.eq(bad.length, 0, bad.slice(0, 6).join('; '));
  });

  t.test('every partial card states which clause is missing, and is marked as partial', () => {
    const bad = [];
    for (const c of RB.allCards()) {
      if (!c.abilities || !c.abilities.unimplemented) continue;
      if (typeof c.abilities.unimplemented !== 'string' || c.abilities.unimplemented.length < 12)
        bad.push(c.id + ': unimplemented marker does not say what is missing');
      if (!RB.isPartial(c.id)) bad.push(c.id + ': marker not surfaced by isPartial');
    }
    t.eq(bad.length, 0, bad.slice(0, 5).join('; '));
  });

  t.test('at least half the decks are offered — a gate that hides everything is a failure', () => {
    t.ok(RB.playableDecks().length >= 5,
      'only ' + RB.playableDecks().length + ' of ' + RB.deckData.length + ' decks are offered');
  });

  t.test('every op named in ability data has a handler and a describer', () => {
    const missing = [];
    for (const c of RB.allCards()) {
      const ab = c.abilities;
      if (!ab || ab.vanilla) continue;
      const walk = list => { for (const e of list || []) {
        if (!RB.ops[e.op]) missing.push(c.id + ': no handler for ' + e.op);
        if (!RB.describers[e.op]) missing.push(c.id + ': no describer for ' + e.op);
      } };
      walk(ab.effects);
      for (const x of ab.triggers || []) walk(x.effects);
      for (const x of ab.activated || []) walk(x.effects);
    }
    t.eq(missing.length, 0, missing.slice(0, 6).join('; '));
  });

  t.test('the describer renders every registered card without throwing', () => {
    const bad = [];
    for (const c of RB.allCards()) { try { RB.cardText(c.id); } catch (e) { bad.push(c.id + ': ' + e.message); } }
    t.eq(bad.length, 0, bad.slice(0, 4).join('; '));
  });

  t.test('every deck is legal: one legend, twelve runes, three battlefields, no card over three copies', () => {
    const bad = [];
    for (const d of RB.deckData) {
      if (!d.legend) bad.push(d.id + ': no legend');
      const runes = d.runes.reduce((n, e) => n + e.qty, 0);
      if (runes !== 12) bad.push(d.id + ': ' + runes + ' runes');
      const bf = d.battlefields.reduce((n, e) => n + e.qty, 0);
      if (bf !== 3) bad.push(d.id + ': ' + bf + ' battlefields');
      for (const e of d.main) if (e.qty > 3) bad.push(d.id + ': ' + e.id + ' x' + e.qty);
    }
    t.eq(bad.length, 0, bad.join('; '));
  });

  t.test('no two decks share a legend', () => {
    const seen = new Set();
    for (const d of RB.deckData) {
      t.ok(!seen.has(d.legend), 'duplicate legend ' + d.legend);
      seen.add(d.legend);
    }
    t.eq(seen.size, 10);
  });

  t.test('the defects gate hides any deck containing a defective id', () => {
    const before = RB.playableDecks().length;
    const saved = RB.defects;
    RB.defects = [RB.deckData[0].main[0].id];
    t.ok(RB.playableDecks().length < before, 'a defective id takes its decks out of circulation');
    RB.defects = saved;
  });
}
