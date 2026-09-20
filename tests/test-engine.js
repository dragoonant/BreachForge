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
    const mv = RB.legalActions(s).find(a => a.t === 'move' && a.iid === play.iid);
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
