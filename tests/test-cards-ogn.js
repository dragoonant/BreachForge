// Origins (ogn / ogs) card fidelity. Each test reads one printed clause literally and asks
// the real engine whether a game plays it; each names the rule and was watched failing on
// the code before its fix. Harness helpers are copied from tests/test-cards.js.
export function run(t) {
  const RB = t.RB;
  RB.registerCards();
  const decks = RB.deckData.map(d => d.id);

  // A cleared board: no hands, no units, p0 active in its main phase.
  const game = (opts = {}) => {
    let s = RB.newGame({ seed: opts.seed || 'cards-ogn', decks: [decks[0], decks[1]] });
    while (s.queue.length && s.queue[0].kind === 'mulligan') s = RB.apply(s, { t: 'mulligan', toss: [] });
    s.humanSeat = opts.human === undefined ? null : opts.human;
    for (const P of s.players) { P.deck.push(...P.hand); P.hand = []; P.base = []; }
    for (const b of s.bf) { b.units = []; b.controller = null; b.contestedBy = null; }
    s.active = 0; s.priority = 0; s.phase = 'main';
    return s;
  };
  const put = (s, id, p, where = 'base') => {
    const iid = RB.mint(s, id, p);
    if (where === 'hand') s.players[p].hand.push(iid);
    else if (where === 'base') s.players[p].base.push(iid);
    else s.bf[where].units.push(iid);
    return iid;
  };
  const plays = (s, iid) => RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid);
  const at = (s, iid) => { const l = RB.locationOf(s, iid); return l.kind === 'bf' ? 'bf' + l.bf : l.kind; };
  // Resolve a card's printed effects as the real resolution does: through RB.runAsking,
  // which parks a question for the human seat.
  const cast = (s, id, p, effects) => {
    const src = RB.mint(s, id, p);
    RB.runAsking(s, effects || RB.card(id).abilities.effects, { p: p, source: src }, src);
    return src;
  };
  const answer = (s, act) => RB.apply(s, act);
  const BIG = 'tok-mech', SMALL = 'tok-bird', ZERO = 'tok-reflection';

  // --- moves: where to is the player's -------------------------------------
  t.test('ogn-043 Charm: an enemy unit in its base is moved to a battlefield of the caster\'s choice', () => {
    let s = game({ human: 0 });
    const foe = put(s, BIG, 1, 'base');
    cast(s, 'ogn-043', 0);
    const q = s.queue[0];
    t.ok(q && q.kind === 'choose' && q.who === 0, 'the caster is asked where: ' + JSON.stringify(q));
    t.eq(q.options.length, 2, 'both battlefields, not its own base');
    s = answer(s, { t: 'choose', ix: 1 });
    t.eq(at(s, foe), 'bf1');
  });

  t.test('ogn-043 Charm: an enemy unit at a battlefield may go to the other battlefield or its base', () => {
    let s = game({ human: 0 });
    const foe = put(s, BIG, 1, 0);
    s.bf[0].controller = 1;
    cast(s, 'ogn-043', 0);
    t.eq(s.queue[0].options.length, 2, 'bf1 and its base');
    s = answer(s, { t: 'choose', ix: 0 });
    t.eq(at(s, foe), 'bf1');
  });

  t.test('ogn-067 Blitzcrank: an enemy unit already here is not a candidate to be moved here', () => {
    const s = game();
    const blitz = put(s, 'ogn-067', 0, 0);
    put(s, BIG, 1, 0);                              // bigger, and already here
    const far = put(s, SMALL, 1, 1);
    const move = RB.card('ogn-067').abilities.triggers[0].effects[0].then[0].effects;
    RB.runEffects(s, move, { p: 0, source: blitz });
    t.eq(at(s, far), 'bf0', 'the enemy from the other battlefield was pulled in');
  });

  t.test('ogn-173 Ride the Wind: the friendly unit may be moved to base, and is readied', () => {
    let s = game({ human: 0 });
    const u = put(s, BIG, 0, 0);
    RB.obj(s, u).exhausted = true;
    cast(s, 'ogn-173', 0);
    const q = s.queue[0];
    t.ok(q && q.kind === 'choose', 'the destination is asked');
    const ix = q.options.findIndex(o => /base/.test(o));
    t.ok(ix >= 0, 'base is on offer: ' + JSON.stringify(q.options));
    s = answer(s, { t: 'choose', ix: ix });
    t.eq(at(s, u), 'base');
    t.eq(RB.obj(s, u).exhausted, false, 'and ready');
  });

  t.test('ogn-270 Showstopper: which battlefield the buffed unit moves to is the player\'s', () => {
    let s = game({ human: 0 });
    const u = put(s, SMALL, 0, 'base');
    put(s, BIG, 0, 0);                              // the old rule sent it to bf0
    cast(s, 'ogn-270', 0);
    t.ok(s.queue[0] && s.queue[0].kind === 'choose', 'the destination is asked');
    s = answer(s, { t: 'choose', ix: 1 });
    t.eq(at(s, u), 'bf1');
    t.eq(RB.obj(s, u).counters, 1, 'buffed');
  });

  // --- "up to" ---------------------------------------------------------------
  t.test('ogn-105 Singularity: "up to two" never forces the second 6 onto your own unit', () => {
    const s = game();
    const foe = put(s, BIG, 1, 0);
    const mine = put(s, BIG, 0, 1);
    cast(s, 'ogn-105', 0);
    t.eq(RB.obj(s, mine).damage || 0, 0, 'own unit untouched');
    t.eq(RB.obj(s, foe).damage, 6);
    t.ok(s.queue[0] && s.queue[0].kind === 'may', 'the second unit is optional');
  });

  t.test('ogs-011 Flash: "up to 2" may move just one', () => {
    let s = game({ human: 0 });
    const a = put(s, BIG, 0, 0), b = put(s, SMALL, 0, 1);
    cast(s, 'ogs-011', 0);
    t.ok(s.queue[0] && s.queue[0].kind === 'target' && s.queue[0].n === 1, 'one unit is chosen');
    s = answer(s, { t: 'choose', selection: [b] });
    t.ok(s.queue[0] && s.queue[0].kind === 'may', 'then a second is offered, not forced');
    s = answer(s, { t: 'choose', ix: 1 });
    t.eq([at(s, a), at(s, b)], ['bf0', 'base']);
  });

  // --- Retreat ---------------------------------------------------------------
  t.test('ogn-104 Retreat: no unit returned, no rune channelled', () => {
    const s = game();
    const before = s.players[0].runes.length;
    cast(s, 'ogn-104', 0);
    t.eq(s.players[0].runes.length, before);
  });

  t.test('ogn-104 Retreat: the returned unit\'s OWNER channels the rune', () => {
    const s = game();
    const u = put(s, BIG, 0, 'base');
    RB.obj(s, u).owner = 1;                          // controlled by p0, owned by p1
    const r0 = s.players[0].runes.length, r1 = s.players[1].runes.length;
    cast(s, 'ogn-104', 0);
    t.ok(s.players[1].hand.includes(u), 'back to its owner\'s hand');
    t.eq([s.players[0].runes.length - r0, s.players[1].runes.length - r1], [0, 1]);
  });

  // --- First Mate ------------------------------------------------------------
  t.test('ogn-132 First Mate: "ready another unit" may ready an enemy unit', () => {
    const s = game();
    const fm = put(s, 'ogn-132', 0, 'base');
    const foe = put(s, BIG, 1, 'base');
    RB.obj(s, foe).exhausted = true;
    RB.runEffects(s, RB.card('ogn-132').abilities.triggers[0].effects, { p: 0, source: fm });
    t.eq(RB.obj(s, foe).exhausted, false);
  });

  t.test('ogn-132 First Mate: only the chosen unit is announced as chosen', () => {
    const s = game();
    const fm = put(s, 'ogn-132', 0, 'base');
    for (let i = 0; i < 3; i++) RB.obj(s, put(s, BIG, 0, 'base')).exhausted = true;
    const seen = [];
    const base = RB.announceChoice;
    RB.announceChoice = function (st, p, iid, src) { seen.push(iid); return base.apply(this, arguments); };
    try { RB.runEffects(s, RB.card('ogn-132').abilities.triggers[0].effects, { p: 0, source: fm }); }
    finally { RB.announceChoice = base; }
    t.eq(seen.length, 1);
  });

  // --- "to a minimum of 1" ---------------------------------------------------
  t.test('ogn-093 Smoke Screen: "to a minimum of 1" does not raise a unit already below 1', () => {
    const s = game();
    const u = put(s, ZERO, 1, 0);
    t.eq(RB.mightOf(s, u), 0);
    cast(s, 'ogn-093', 0);
    t.eq(RB.mightOf(s, u), 0);
  });

  t.test('ogn-095 Stupefy: the floor still stops the reduction at 1', () => {
    const s = game();
    const u = put(s, SMALL, 1, 0);
    cast(s, 'ogn-095', 0);
    t.eq(RB.mightOf(s, u), 1);
  });

  // --- Bullet Time -----------------------------------------------------------
  t.test('ogn-268 Bullet Time: which battlefield is the caster\'s choice', () => {
    let s = game({ human: 0 });
    const a = put(s, SMALL, 1, 0), b = put(s, BIG, 1, 1);
    const src = RB.mint(s, 'ogn-268', 0);
    RB.runAsking(s, RB.card('ogn-268').abilities.effects, { p: 0, source: src, xPaid: 1 }, src);
    const q = s.queue[0];
    t.ok(q && q.kind === 'choose' && q.options.length === 2, 'asked: ' + JSON.stringify(q));
    s = answer(s, { t: 'choose', ix: 1 });           // not the battlefield where it kills
    t.eq([RB.obj(s, a).damage || 0, RB.obj(s, b).damage], [0, 1]);
  });

  // --- Fading Memories -------------------------------------------------------
  t.test('ogn-180 Fading Memories: a gear may be chosen while a unit stands at a battlefield', () => {
    const s = game({ human: 0 });
    const u = put(s, BIG, 1, 0);
    const g = put(s, 'ogn-120', 1, 'base');
    cast(s, 'ogn-180', 0);
    const q = s.queue[0];
    t.ok(q && q.kind === 'target', 'asked');
    t.ok(q.options.includes(u) && q.options.includes(g), 'one pool of units and gear: ' + JSON.stringify(q.options));
  });

  // --- Miss Fortune ----------------------------------------------------------
  t.test('ogn-193 Miss Fortune: an empty, uncontrolled battlefield is open', () => {
    const s = game();
    s.players[0].pool.energy = 20; s.players[0].pool.any = 20;
    const mf = put(s, 'ogn-193', 0, 'hand');
    const dests = [...new Set(plays(s, mf).map(a => a.to))].sort();
    t.eq(dests, ['base', 'bf0', 'bf1']);
  });

  // --- tokens ----------------------------------------------------------------
  t.test('ogn-212 Forge of the Future: playing a Recruit token is playing a unit', () => {
    const s = game();
    const src = put(s, 'ogn-212', 0, 'base');
    s.delayed = [{ on: 'unitPlayed', p: 0, source: src, once: true, data: {},
      effects: [{ op: 'draw', n: 1 }] }];
    const hand = s.players[0].hand.length;
    RB.runEffects(s, RB.card('ogn-212').abilities.triggers[0].effects, { p: 0, source: src });
    t.eq(s.players[0].hand.length, hand + 1, 'the unitPlayed listener heard it');
  });
}
