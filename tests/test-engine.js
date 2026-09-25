// Engine rules. Each test's name states the RULE, not the current behaviour, so a test
// that starts encoding a bug reads as wrong.
export function run(t) {
  const RB = t.RB;
  RB.registerCards();
  const decks = RB.deckData.map(d => d.id);
  const game = (seed, a, b) => {
    const s = RB.newGame({ seed: seed || 's', decks: [decks[a || 0], decks[b || 1]] });
    // drain both mulligans by keeping
    let st = s;
    while (st.queue.length && st.queue[0].kind === 'mulligan') st = RB.apply(st, { t: 'mulligan', toss: [] });
    return st;
  };

  t.test('1v1 puts exactly two battlefields in play, one provided by each player', () => {
    const s = game();
    t.eq(s.bf.length, 2);
    t.eq([s.bf[0].provider, s.bf[1].provider], [0, 1]);
  });

  t.test('the victory score in 1v1 is 8', () => t.eq(game().victoryScore, 8));

  t.test('each player opens on four cards and a rune deck of exactly twelve', () => {
    const s = game();
    // The first player has already taken their Draw Phase by the time the mulligans drain,
    // so it is the player still to act who holds the opening four.
    t.eq(s.players[RB.opponentOf(s.firstPlayer)].hand.length, 4);
    for (let p = 0; p < 2; p++)
      t.eq(s.players[p].runeDeck.length + s.players[p].runes.length, 12, 'player ' + p);
  });

  t.test('the player going second channels an extra rune on their first channel phase', () => {
    const s = game();
    const second = RB.opponentOf(s.firstPlayer);
    // first player's turn 1 already happened at setup
    t.eq(s.players[s.firstPlayer].runes.length, 2);
    let st = RB.apply(s, { t: 'endTurn' });
    t.eq(st.players[second].runes.length, 3, 'second player channels 2 + 1');
  });

  t.test('a rune is exhausted to pay energy and recycled to pay power', () => {
    const s = game();
    const p = s.active;
    const before = s.players[p].runes.length;
    const play = RB.legalActions(s).find(a => a.t === 'play' &&
      (RB.card(RB.obj(s, a.iid).cardId).power || 0) > 0);
    if (!play) return;                       // no power-costing card in the opening hand
    const after = RB.apply(s, play);
    t.ok(after.players[p].runes.length < before, 'a rune left the board to pay power');
    t.ok(after.players[p].runeDeck.length > s.players[p].runeDeck.length,
      'the recycled rune went back into the rune deck, not the trash');
  });

  t.test('units enter the board exhausted', () => {
    const s = game();
    const play = RB.legalActions(s).find(a => a.t === 'play' && RB.cardOf(s, a.iid).type === 'Unit');
    if (!play) return;
    const after = RB.apply(s, play);
    t.ok(RB.obj(after, play.iid).exhausted, 'a freshly played unit is exhausted');
  });

  t.test('moving a unit exhausts it — exhausting is the cost of a standard move', () => {
    let s = game();
    const play = RB.legalActions(s).find(a => a.t === 'play' && RB.cardOf(s, a.iid).type === 'Unit');
    if (!play) return;
    s = RB.apply(s, play);
    s = RB.apply(s, { t: 'endTurn' });
    s = RB.apply(s, { t: 'endTurn' });        // back to the same player, unit readied
    t.ok(!RB.obj(s, play.iid).exhausted, 'awaken readies it');
    const mv = RB.legalActions(s).find(a => a.t === 'move' && a.iids.includes(play.iid));
    if (!mv) return;
    t.ok(RB.obj(RB.apply(s, mv), play.iid).exhausted, 'moving exhausts it');
  });

  t.test('moving into a battlefield you do not control contests it and opens a showdown', () => {
    let s = game();
    const play = RB.legalActions(s).find(a => a.t === 'play' && RB.cardOf(s, a.iid).type === 'Unit');
    if (!play) return;
    s = RB.apply(s, play);
    s = RB.apply(s, { t: 'endTurn' }); s = RB.apply(s, { t: 'endTurn' });
    const mv = RB.legalActions(s).find(a => a.t === 'move' && a.to === 'bf0');
    if (!mv) return;
    const after = RB.apply(s, mv);
    t.ok(after.showdown !== null || after.bf[0].controller === s.active,
      'either a showdown opened or control was established unopposed');
  });

  t.test('an uncontested unit standing alone takes the battlefield and scores a conquer', () => {
    let s = game();
    const play = RB.legalActions(s).find(a => a.t === 'play' && RB.cardOf(s, a.iid).type === 'Unit');
    if (!play) return;
    s = RB.apply(s, play);
    const me = s.active;
    s = RB.apply(s, { t: 'endTurn' }); s = RB.apply(s, { t: 'endTurn' });
    const mv = RB.legalActions(s).find(a => a.t === 'move' && a.to.startsWith('bf'));
    if (!mv) return;
    let after = RB.apply(s, mv);
    while (after.showdown) after = RB.apply(after, { t: 'pass' });
    const i = +mv.to.slice(2);
    t.eq(after.bf[i].controller, me, 'control established');
    t.ok(after.players[me].points >= 1, 'and the conquer scored');
  });

  // --- the simultaneous standard move (rule 144.4) --------------------------
  // A move completes, a cleanup runs, and a staged showdown opens at once. So a unit sent
  // alone into a defended battlefield fights alone, and committing a force is possible ONLY
  // through the simultaneous move. These three tests are the rule, not the old behaviour.

  const stack = (t2, n, might, seed) => {
    const s = game(seed || 'grp');
    const card = RB.allCards().find(c => c.type === 'Unit');
    const me = s.active, them = RB.opponentOf(me);
    const mine = [];
    for (let i = 0; i < n; i++) {
      const iid = RB.mint(s, card.id, me);
      RB.obj(s, iid).buffs = might - card.might;
      s.players[me].base.push(iid);
      mine.push(iid);
    }
    return { s: s, me: me, them: them, mine: mine, card: card };
  };

  t.test('several units may standard-move to one destination as a single game action', () => {
    const g = stack(t, 3, 2);
    const acts = RB.legalActions(g.s).filter(a => a.t === 'move' && a.to === 'bf0');
    t.ok(acts.some(a => a.iids.length === 3), 'the whole group is offered');
    t.ok(acts.some(a => a.iids.length === 2), 'and every pair');
    t.eq(acts.length, 7, 'every non-empty subset of three units — 2^3 - 1');
  });

  t.test('a simultaneous move exhausts every unit in the group and arrives together', () => {
    const g = stack(t, 3, 2);
    const mv = RB.legalActions(g.s).find(a => a.t === 'move' && a.to === 'bf0' && a.iids.length === 3);
    const after = RB.apply(g.s, mv);
    for (const iid of g.mine) t.ok(RB.obj(after, iid).exhausted, 'exhausting is the cost, paid by each');
    t.eq(RB.unitsAt(after, 0, g.me).length, 3, 'all three are standing on the battlefield');
  });

  t.test('a group takes a defended battlefield that its units would lose one at a time', () => {
    // THE reported defect: three 2-might units fed in singly are three dead units and no
    // battlefield; sent together they are 6 Might against 5 and the field changes hands.
    const g = stack(t, 3, 2, 'defended');
    const big = RB.allCards().find(c => c.type === 'Unit');
    const def = RB.mint(g.s, big.id, g.them);
    RB.obj(g.s, def).buffs = 5 - big.might;          // a 5-might defender
    g.s.bf[0].units.push(def);
    g.s.bf[0].controller = g.them;

    const settle = st => { let n = 0; while (st.showdown && n++ < 8) st = RB.apply(st, { t: 'pass' }); return st; };

    const solo = RB.legalActions(g.s).find(a => a.t === 'move' && a.to === 'bf0' && a.iids.length === 1);
    const afterSolo = settle(RB.apply(g.s, solo));
    t.eq(afterSolo.bf[0].controller, g.them, 'one unit alone does not take it');

    const group = RB.legalActions(g.s).find(a => a.t === 'move' && a.to === 'bf0' && a.iids.length === 3);
    const afterGroup = settle(RB.apply(g.s, group));
    t.eq(afterGroup.bf[0].controller, g.me, 'the same three units together take it');
  });

  t.test('the standard move is an inherent ability of units — Gear in a base has no legs', () => {
    // Rule 144.4. Nineteen Gear cards were being offered a move for as long as the base was
    // read as a flat list of movable things.
    const s = game('gear');
    const gear = RB.allCards().find(c => c.type === 'Gear');
    if (!gear) return;
    const iid = RB.mint(s, gear.id, s.active);
    s.players[s.active].base.push(iid);
    t.ok(!RB.legalActions(s).some(a => a.t === 'move' && a.iids.includes(iid)),
      'gear is offered no standard move');
  });

  t.test('a unit is played to your base unless it has Ambush or a card says otherwise', () => {
    const s = game();
    const plain = RB.allCards().find(c => c.type === 'Unit' &&
      !(c.abilities && (c.abilities.playTo || (c.abilities.keywords || [])
        .some(k => k === 'Ambush' || k.name === 'Ambush'))));
    const iid = RB.mint(s, plain.id, s.active);
    s.players[s.active].hand.push(iid);
    const dests = RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid).map(a => a.to);
    if (!dests.length) return;                      // unaffordable this turn
    t.eq(dests, ['base'], 'a plain unit offers only the base');
  });

  t.test('Ambush offers a battlefield where you already control units, and still the base', () => {
    const s = game();
    const amb = RB.allCards().find(c => c.type === 'Unit' && c.abilities &&
      (c.abilities.keywords || []).some(k => k === 'Ambush' || k.name === 'Ambush'));
    if (!amb) return;
    const p = s.active;
    const iid = RB.mint(s, amb.id, p);
    s.players[p].hand.push(iid);
    s.players[p].pool.energy = 99;
    s.players[p].pool.any = 99;
    const before = RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid).map(a => a.to);
    t.eq(before, ['base'], 'with no units out, only the base');
    const friend = RB.mint(s, amb.id, p);
    s.bf[0].units.push(friend);
    const after = RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid).map(a => a.to);
    t.ok(after.includes('bf0') && after.includes('base') && !after.includes('bf1'),
      'bf0 opens up, bf1 does not: ' + after.join(','));
  });

  t.test('a player may score each battlefield at most once per turn', () => {
    const s = game();
    const p = s.active;
    let st = RB.clone(s);
    st.bf[0].controller = p;
    RB.score(st, p, 0, 'conquer');
    const after = st.players[p].points;
    RB.score(st, p, 0, 'hold');
    t.eq(st.players[p].points, after, 'the second score on the same battlefield does nothing');
  });

  t.test('the winning point cannot be taken by a conquer that did not take every battlefield', () => {
    const s = game();
    const p = s.active;
    const st = RB.clone(s);
    st.players[p].points = 7;
    RB.score(st, p, 0, 'conquer');
    t.eq(st.players[p].points, 7, 'no eighth point');
    const st2 = RB.clone(s);
    st2.players[p].points = 7;
    RB.score(st2, p, 0, 'hold');
    t.eq(st2.players[p].points, 8, 'but a hold takes it');
  });

  t.test('an attack that leaves defenders standing recalls the attackers to their base', () => {
    // Rule 449, combat cleanup step 3d. Without it two units that cannot kill each other
    // restage the combat forever — the fuzzer found exactly that with two 0-might units.
    const s = game();
    const unit = RB.allCards().find(c => c.type === 'Unit');
    const att = RB.mint(s, unit.id, 0), def = RB.mint(s, unit.id, 1);
    s.bf[0].units.push(att, def);
    RB.obj(s, att).buffs = -99; RB.obj(s, def).buffs = -99;     // both at 0 might
    s.bf[0].contestedBy = 0;
    s.showdown = { bf: 0, attacker: 0, defender: 1, combat: true };
    RB.closeShowdown(s);
    t.ok(s.players[0].base.includes(att), 'the attacker bounced home');
    t.ok(s.bf[0].units.includes(def), 'the defender held the field');
    t.eq(s.bf[0].combatStaged, false, 'and nothing restaged');
  });

  t.test('combat damage is assigned lethal-first, without overkill while a unit remains', () => {
    const s = game();
    const big = RB.allCards().find(c => c.type === 'Unit' && c.might >= 5);
    const small = RB.allCards().find(c => c.type === 'Unit' && c.might === 2);
    if (!big || !small) return;
    const a = RB.mint(s, big.id, 0);
    const d1 = RB.mint(s, small.id, 1), d2 = RB.mint(s, small.id, 1);
    s.bf[0].units.push(a, d1, d2);
    RB.obj(s, a).buffs = 5 - big.might;                          // exactly 5 might
    s.bf[0].contestedBy = 0;
    s.showdown = { bf: 0, attacker: 0, defender: 1, combat: true };
    RB.closeShowdown(s);
    // 5 among two 2-might units: one dies outright, the rest lands on the other, which
    // also dies. Spreading 2/1/1/1 would be illegal — lethal must be assigned in full first.
    t.ok(!s.bf[0].units.includes(d1) && !s.bf[0].units.includes(d2),
      'both defenders took lethal damage from a single 5-might attacker');
  });

  t.test('legalActions never returns an empty list while the game is live', () => {
    let s = game('fuzz1', 2, 5);
    for (let i = 0; i < 300 && !RB.isTerminal(s); i++) {
      const acts = RB.legalActions(s);
      t.ok(acts.length > 0, 'actions available at ' + s.phase);
      s = RB.apply(s, acts[RB.peekInt(s, acts.length, i)]);
    }
  });

  t.test('apply does not mutate the state it was given', () => {
    const s = game();
    const snap = JSON.stringify(s);
    RB.apply(s, RB.legalActions(s)[0]);
    t.eq(JSON.stringify(s), snap, 'the input state is untouched');
  });

  // --- choosing from a hand (D-2) --------------------------------------------
  // Sabotage (ogn-156) reads: "Choose an opponent. They reveal their hand. Choose a
  // non-unit card from it, and recycle that card." Three verbs, and the middle one is a
  // decision the CASTER makes. For a while the op took the biggest non-unit silently,
  // which a player reads as the spell doing nothing at all.
  const handChoice = (cardId, tag) => {
    const s = RB.newGame({ seed: 'sab', decks: [decks[0], decks[1]], humanSeat: 0 });
    let st = s;
    while (st.queue.length && st.queue[0].kind === 'mulligan') st = RB.apply(st, { t: 'mulligan', toss: [] });
    const me = st.active, them = RB.opponentOf(me);
    st.humanSeat = me;
    // Two legal answers, or there is no choice to be asked about: offerChoice only parks a
    // question when the pool is bigger than the number being taken.
    const spells = RB.allCards().filter(c => c.type === 'Spell').slice(0, 2);
    st.players[them].hand = spells.map(c => { const i = RB.mint(st, c.id, them); return i; });
    const iid = RB.mint(st, cardId, me);
    st.players[me].hand.push(iid);
    st.players[me].pool.energy = 99; st.players[me].pool.any = 99;
    const play = RB.legalActions(st).find(a => a.t === 'play' && a.iid === iid);
    t.ok(play, cardId + ' is playable');
    let after = RB.apply(st, play);
    // A Spell goes on the chain and resolves when both sides pass (D-4), so drain it.
    for (let i = 0; i < 6 && after.chain.length; i++) {
      const pass = RB.legalActions(after).find(a => a.t === 'pass');
      if (!pass) break;
      after = RB.apply(after, pass);
    }
    return { after: after, me: me, them: them, pool: st.players[them].hand.slice() };
  };

  t.test('a card that chooses from a revealed hand ASKS the caster, it does not pick for them', () => {
    const r = handChoice('ogn-156');
    const q = r.after.queue[0];
    t.ok(q && q.kind === 'target', 'Sabotage parked a target question, got ' +
      (q ? q.kind : 'an empty queue'));
    t.eq(q.who, r.me, 'the question goes to the CASTER, not the player whose hand it is');
    t.ok(q.options.length > 1, 'more than one answer was offered');
    for (const iid of q.options)
      t.ok(r.pool.includes(iid), 'every answer is a card in their hand');
    // And nothing has left the hand yet: the spell has not resolved.
    t.eq(r.after.players[r.them].hand.length, r.pool.length,
      'no card was recycled before the caster answered');
  });

  t.test('answering that question is what recycles the chosen card, and only that card', () => {
    const r = handChoice('ogn-156');
    const q = r.after.queue[0];
    // Pick the one the old auto-pick would NOT have taken, so a silent regression to
    // "biggest first" fails here rather than passing by coincidence.
    const want = q.options[q.options.length - 1];
    const done = RB.apply(r.after, { t: 'choose', selection: [want] });
    t.ok(!done.players[r.them].hand.includes(want), 'the chosen card left their hand');
    t.eq(done.players[r.them].hand.length, r.pool.length - 1, 'exactly one card left');
    t.ok(done.players[r.them].deck.includes(want), 'and it was recycled into their deck');
  });

  // --- choosing from a pile the board cannot draw (D-2) ------------------------
  // Stacked Deck (ogn-183): "Look at the top 3 cards of your Main Deck. Put 1 into your
  // hand and recycle the rest." LOOK is a printed verb and PUT is a printed decision. The
  // op used to sort the three by Energy, take the most expensive, and never show the
  // player the cards it had just told them to look at — which is what was reported.
  const deckChoice = (cardId, tag) => {
    const s = RB.newGame({ seed: 'dig', decks: [decks[0], decks[1]], humanSeat: 0 });
    let st = s;
    while (st.queue.length && st.queue[0].kind === 'mulligan') st = RB.apply(st, { t: 'mulligan', toss: [] });
    const me = st.active;
    st.humanSeat = me;
    const iid = RB.mint(st, cardId, me);
    st.players[me].hand.push(iid);
    st.players[me].pool.energy = 99; st.players[me].pool.any = 99;
    const top = st.players[me].deck.slice(0, 3);
    // legalActions offers ONE play per distinct card id in hand, so a copy already dealt
    // owns the action — match on the card, not on the instance this test minted.
    const play = RB.legalActions(st).find(a => a.t === 'play' && !a.pay &&
      RB.obj(st, a.iid).cardId === cardId);
    t.ok(play, cardId + ' is playable');
    void iid;
    let after = RB.apply(st, play);
    for (let i = 0; i < 6 && after.chain.length; i++) {          // D-4: drain the chain
      const pass = RB.legalActions(after).find(a => a.t === 'pass');
      if (!pass) break;
      after = RB.apply(after, pass);
    }
    return { after: after, me: me, top: top, tag: tag };
  };

  t.test('a card that looks at the top of a deck ASKS which card to keep, it does not pick one', () => {
    const r = deckChoice('ogn-183');
    const q = r.after.queue[0];
    t.ok(q && q.kind === 'target', 'Stacked Deck parked a target question, got ' +
      (q ? q.kind : 'an empty queue'));
    t.eq(q.who, r.me, 'the question goes to the player who looked');
    t.eq(q.options.length, 3, 'all three cards it looked at are offered');
    t.eq(q.options.slice().sort(), r.top.slice().sort(),
      'the three offered are the three that were on top');
    t.eq(q.n, 1, 'exactly one of them is kept');
    // Nothing has moved yet: the spell has not finished resolving.
    t.eq(r.after.players[r.me].hand.length,
      r.after.players[r.me].hand.length, 'sanity');
    for (const iid of r.top)
      t.ok(!r.after.players[r.me].hand.includes(iid), 'no card reached the hand before the answer');
  });

  t.test('answering it puts the CHOSEN card in hand and recycles exactly the other two', () => {
    const r = deckChoice('ogn-183');
    const q = r.after.queue[0];
    // Pick the one the old auto-pick would NOT have taken — the cheapest — so a silent
    // regression to "most expensive first" fails here instead of passing by coincidence.
    const want = q.options.slice().sort((a, b) =>
      (RB.cardOf(r.after, a).energy || 0) - (RB.cardOf(r.after, b).energy || 0))[0];
    const done = RB.apply(r.after, { t: 'choose', selection: [want] });
    const P = done.players[r.me];
    t.ok(P.hand.includes(want), 'the chosen card is in hand');
    for (const iid of r.top)
      if (iid !== want) {
        t.ok(!P.hand.includes(iid), 'a card that was not chosen did not reach the hand');
        t.ok(P.deck.includes(iid), 'and it was recycled into the deck');
      }
    t.eq(P.deck.slice(0, 3).filter(i => r.top.includes(i)).length, 0,
      'the recycled cards went to the BOTTOM, not back on top');
  });

  t.test('a card that plays out of a trash ASKS which card, and plays the one chosen', () => {
    const s = RB.newGame({ seed: 'harrow', decks: [decks[0], decks[1]], humanSeat: 0 });
    let st = s;
    while (st.queue.length && st.queue[0].kind === 'mulligan') st = RB.apply(st, { t: 'mulligan', toss: [] });
    const me = st.active;
    st.humanSeat = me;
    // Three units in the trash, so there is a real question. The Harrowing (ogn-198) reads
    // "Play a unit from your trash, ignoring its Energy cost"; it used to take the biggest.
    const buried = ['ogn-087', 'unl-152', 'ogn-216'].map(id => {
      const i = RB.mint(st, id, me); st.players[me].trash.push(i); return i;
    });
    st.players[me].hand.push(RB.mint(st, 'ogn-198', me));
    st.players[me].pool.energy = 99; st.players[me].pool.any = 99;
    const play = RB.legalActions(st).find(a => a.t === 'play' && !a.pay &&
      RB.obj(st, a.iid).cardId === 'ogn-198');
    t.ok(play, 'The Harrowing is playable');
    let after = RB.apply(st, play);
    for (let i = 0; i < 6 && after.chain.length; i++) {
      const pass = RB.legalActions(after).find(a => a.t === 'pass');
      if (!pass) break;
      after = RB.apply(after, pass);
    }
    const q = after.queue[0];
    t.ok(q && q.kind === 'target', 'it parked a target question');
    t.eq(q.options.slice().sort(), buried.slice().sort(), 'every unit in the trash is offered');
    // Answer with the SMALLEST, which is the one the old auto-pick would never have taken.
    const want = q.options.slice().sort((a, b) =>
      (RB.cardOf(after, a).energy || 0) - (RB.cardOf(after, b).energy || 0))[0];
    const done = RB.apply(after, { t: 'choose', selection: [want] });
    t.ok(done.players[me].base.includes(want), 'the CHOSEN unit is on the board');
    for (const iid of buried)
      if (iid !== want) t.ok(done.players[me].trash.includes(iid), 'the others stayed in the trash');
  });

  t.test('"ready another unit" asks which one', () => {
    const s = RB.newGame({ seed: 'mate', decks: [decks[0], decks[1]], humanSeat: 0 });
    let st = s;
    while (st.queue.length && st.queue[0].kind === 'mulligan') st = RB.apply(st, { t: 'mulligan', toss: [] });
    const me = st.active;
    st.humanSeat = me;
    const tired = ['ogn-087', 'unl-152'].map(id => {
      const i = RB.mint(st, id, me); st.players[me].base.push(i);
      RB.obj(st, i).exhausted = true; return i;
    });
    st.players[me].hand.push(RB.mint(st, 'ogn-132', me));       // First Mate
    st.players[me].pool.energy = 99; st.players[me].pool.any = 99;
    const play = RB.legalActions(st).find(a => a.t === 'play' && !a.pay &&
      RB.obj(st, a.iid).cardId === 'ogn-132');
    t.ok(play, 'First Mate is playable');
    const after = RB.apply(st, play);
    const q = after.queue[0];
    t.ok(q && q.kind === 'target', 'it parked a target question');
    t.eq(q.options.slice().sort(), tired.slice().sort(), 'both exhausted units are offered');
    const want = q.options[q.options.length - 1];
    const done = RB.apply(after, { t: 'choose', selection: [want] });
    t.ok(!RB.obj(done, want).exhausted, 'the chosen unit readied');
    for (const iid of tired)
      if (iid !== want) t.ok(RB.obj(done, iid).exhausted, 'and no other unit did');
  });

  // The seat that CHOOSES is not always the seat that is resolving. Atakhan (unl-170) reads
  // "the defender must kill one of their units here" — it is the defender's unit and the
  // defender's decision, and asking the attacker would be the wrong player entirely.
  t.test('a clause that makes the OPPONENT choose parks the question at their seat', () => {
    const s = game('atakhan');
    const attacker = s.active, defender = RB.opponentOf(attacker);
    s.humanSeat = defender;                       // the human is the one being asked
    const theirs = ['ogn-087', 'unl-152'].map(id => {
      const i = RB.mint(s, id, defender); s.bf[0].units.push(i); return i;
    });
    const src = RB.mint(s, 'unl-170', attacker);
    s.bf[0].units.push(src);
    const ctx = { p: attacker, source: src, event: { bf: 0 } };
    RB.resolveAsking(s, { kind: 'ability', iid: src, controller: attacker },
      st => RB.runEffects(st, [{ op: 'defenderKillsHere' }], ctx));
    const q = s.queue[0];
    t.ok(q && q.kind === 'target', 'it parked a target question');
    t.eq(q.who, defender, 'the question goes to the DEFENDER, not the attacker');
    t.eq(q.options.slice().sort(), theirs.slice().sort(), 'the answers are the defender\'s units');
    t.ok(theirs.every(i => s.bf[0].units.includes(i)), 'nothing died before the answer');
  });

  // [Ambush] reads "You may play me as a [Reaction] to a battlefield where you have units."
  // The engine honoured the play LOCATION half and judged SPEED from the card's keyword
  // list alone, so an Ambush unit was illegal in the showdown that its own friendly unit
  // opened by moving in — the one moment the keyword exists for.
  //
  // unl-120 proves both halves at once: it carries [Ambush] and a second, wider
  // play-location permission ("even if you don't have units there"), and that second
  // clause grants the location only.
  const ambushSetup = () => {
    let s = game('ambush', 0, 1);
    const me = s.active, them = RB.opponentOf(me);
    // Both battlefields theirs, each held by a unit of theirs. I will move onto bf0 only.
    for (const i of [0, 1]) {
      s.bf[i].units.push(RB.mint(s, 'unl-113', them));
      s.bf[i].controller = them;
    }
    const yi = RB.mint(s, 'unl-113', me);
    RB.obj(s, yi).exhausted = false;
    s.players[me].base.push(yi);
    const rengar = RB.mint(s, 'unl-120', me);
    s.players[me].hand.push(rengar);
    s.players[me].pool.energy = 20;
    for (const d of RB.DOMAINS) s.players[me].pool.power[d] = 5;
    return { s, me, yi, rengar };
  };

  t.test('[Ambush] lets a unit be played during a showdown at a battlefield where you have units', () => {
    const { s, me, yi, rengar } = ambushSetup();
    const move = RB.legalActions(s).find(a => a.t === 'move' && (a.iids || []).includes(yi) && a.to === 'bf0');
    t.ok(move, 'the standard move onto bf0 is offered');
    const after = RB.apply(s, move);
    t.ok(after.showdown, 'moving in contested bf0 and opened a showdown');
    t.eq(RB.whoActs(after), me, 'I hold priority in the showdown I opened');
    const plays = RB.legalActions(after).filter(a => a.t === 'play' && a.iid === rengar);
    t.ok(plays.some(a => a.to === 'bf0'),
      'the Ambush unit may be played to the battlefield where my unit now stands');
  });

  t.test('[Ambush] grants Reaction speed only where you have units, not at every legal destination', () => {
    const { s, yi, rengar } = ambushSetup();
    const move = RB.legalActions(s).find(a => a.t === 'move' && (a.iids || []).includes(yi) && a.to === 'bf0');
    const after = RB.apply(s, move);
    const plays = RB.legalActions(after).filter(a => a.t === 'play' && a.iid === rengar);
    // bf1 holds only enemy units, so unl-120's second permission makes it a legal LOCATION
    // at main speed — but Ambush's Reaction is scoped to where you have units, and bf1 is
    // not one of those. Offering it there would invent a speed the card does not have.
    t.ok(!plays.some(a => a.to === 'bf1'),
      'the enemy-units permission does not carry Reaction speed with it');
    t.ok(!plays.some(a => a.to === 'base'),
      'and the ordinary base play is still main-phase only');
  });

  t.test('a bug trace carries the seed, both deck ids and every action applied', () => {
    const s = game('blackbox', 2, 5);
    RB.recordStart(s);
    const a1 = RB.legalActions(s)[0];
    RB.recordAction(a1);
    const trace = JSON.parse(RB.bugReport('what looked wrong'));
    t.eq(trace.seed, s.seed);
    t.eq(trace.decks, s.players.map(p => p.deckId));
    t.eq(trace.actions, [a1]);
    t.eq(trace.note, 'what looked wrong');
    t.ok(trace.at, 'the trace is stamped with a time');
  });

  t.test('the same seed and action list reproduce the same game', () => {
    const run = () => {
      let s = game('deterministic', 3, 7);
      for (let i = 0; i < 80 && !RB.isTerminal(s); i++)
        s = RB.apply(s, RB.legalActions(s)[RB.peekInt(s, RB.legalActions(s).length, i)]);
      return JSON.stringify([s.turn, s.players[0].points, s.players[1].points, s.log.length]);
    };
    t.eq(run(), run());
  });
}
