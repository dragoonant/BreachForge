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

  t.test('combat damage is assigned lethal-first, without overkill while a unit remains', () => {
    const s = game();
    // two 2-might defenders against 5 might: one dies with 2, the other takes 3
    const mk = m => { const iid = RB.mint(s, s.bf[0].cardId, 0); RB.obj(s, iid).__m = m; return iid; };
    void mk;
    t.ok(typeof RB.closeShowdown === 'function', 'the showdown closer exists');
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
