// Unleashed, card by card. Each test reads one printed clause literally and asks the real
// engine — legalActions / apply — whether a game plays it. Each names the rule, and each
// was watched failing on the code before its fix (CLAUDE.md rule 10).
export function run(t) {
  const RB = t.RB;
  RB.registerCards();
  const decks = RB.deckData.map(d => d.id);

  // A cleared board: no hands, no units, p0 active in its main phase.
  const game = (opts = {}) => {
    let s = RB.newGame({ seed: opts.seed || 'cards-unl', decks: [decks[0], decks[1]] });
    while (s.queue.length && s.queue[0].kind === 'mulligan') s = RB.apply(s, { t: 'mulligan', toss: [] });
    s.humanSeat = opts.human === undefined ? null : opts.human;
    for (const P of s.players) { P.deck.push(...P.hand); P.hand = []; P.base = []; }
    for (const b of s.bf) { b.units = []; b.controller = null; b.contestedBy = null; }
    s.active = 0; s.priority = 0; s.phase = 'main';
    return s;
  };
  const rich = (s, p, n = 20) => { s.players[p].pool.energy = n; s.players[p].pool.any = n; };
  const put = (s, id, p, where = 'base') => {
    const iid = RB.mint(s, id, p);
    if (where === 'hand') s.players[p].hand.push(iid);
    else if (where === 'trash') s.players[p].trash.push(iid);
    else if (where === 'deck') s.players[p].deck.unshift(iid);
    else if (where === 'base') s.players[p].base.push(iid);
    else s.bf[where].units.push(iid);
    return iid;
  };
  // A plain unit of the given Might.
  const sized = (s, m, p, where) => {
    const iid = put(s, vanilla, p, where);
    RB.obj(s, iid).permBuffs = m - RB.card(vanilla).might;
    return iid;
  };
  const plays = (s, iid) => RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid);
  const vanilla = 'tok-mech';                   // a 3 Might unit with no text
  const aSpell = RB.allCards().find(c => c.type === 'Spell' && c.set !== 'Token').id;
  // Pass until the chain is empty or a question is waiting — never answers one.
  const passChain = s => {
    for (let k = 0; k < 20 && s.chain.length && !s.queue.length; k++) s = RB.apply(s, { t: 'pass' });
    return s;
  };
  const passAll = s => {
    for (let k = 0; k < 20 && (s.chain.length || s.queue.length); k++)
      s = s.queue.length ? RB.apply(s, RB.legalActions(s)[0]) : RB.apply(s, { t: 'pass' });
    return s;
  };
  // Run a list of effects as a resolution of its own, as a trigger would.
  const resolve = (s, effects, ctx) => { RB.runAsking(s, effects, ctx, ctx.source); return s; };

  // --- unl-081 Keeper of Masks ---------------------------------------------------
  t.test('Keeper of Masks: the copies are copies of a [Temporary] card, so they are Temporary', () => {
    let s = game();
    rich(s, 0);
    const k = put(s, 'unl-081', 0, 'hand');
    s = passAll(RB.apply(s, plays(s, k).find(a => a.to === 'base')));
    const copies = s.players[0].base.filter(i => i !== k && RB.obj(s, i).cardId === 'unl-081');
    t.eq(copies.length, 2, 'two Reflection copies');
    t.ok(copies.every(i => RB.obj(s, i).temporary), 'each copy is Temporary');
  });

  // --- unl-118 Elder Dragon ------------------------------------------------------
  t.test('Elder Dragon: only YOUR damage is always enough — an enemy hurt by its own side lives', () => {
    const s = game();
    put(s, 'unl-118', 0, 'base');
    const a = sized(s, 3, 1, 'base'), b = sized(s, 3, 1, 'base');
    RB.dealDamage(s, a, 1, { p: 1 }, 'effect');       // their own damage
    RB.dealDamage(s, b, 1, { p: 0 }, 'effect');       // mine
    RB.settle(s);
    t.ok(s.players[1].base.includes(a), 'the unit damaged by its own controller survives');
    t.ok(!s.players[1].base.includes(b), 'the unit I damaged dies');
  });

  // --- unl-198 Moonfall ----------------------------------------------------------
  t.test('Moonfall moves an enemy unit TO the battlefield — never one already there', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    put(s, vanilla, 0, 0);
    const there = sized(s, 5, 1, 0);
    const away = sized(s, 2, 1, 'base');
    const m = put(s, 'unl-198', 0, 'hand');
    s = passChain(RB.apply(s, plays(s, m)[0]));
    t.eq(s.queue[0] && s.queue[0].kind, 'choose');
    s = RB.apply(s, { t: 'choose', ix: 0 });
    // The only legal enemy is in its base: nothing to ask, and it arrives.
    t.ok(!s.queue.length || !s.queue[0].options.includes(there), 'the unit already there is no option');
    t.ok(s.bf[0].units.includes(away), 'the unit from elsewhere was moved there');
  });

  // --- unl-179 Rift Herald -------------------------------------------------------
  t.test('Rift Herald looks at the three cards first, then asks which unit (if any) to draw', () => {
    let s = game({ human: 0 });
    const h = put(s, 'unl-179', 0, 'base');
    const u1 = put(s, 'unl-145', 0, 'deck');              // Pyke
    const sp = put(s, aSpell, 0, 'deck');
    const u2 = put(s, 'unl-150', 0, 'deck');              // Vex — deck top: u2, sp, u1
    resolve(s, [{ op: 'moveUnit', target: 'self', to: 'here' }],
      { p: 0, source: h, event: { bf: 0 } });
    const q = s.queue[0];
    t.ok(q && q.kind === 'choose', 'one question, after looking: ' + JSON.stringify(q && q.kind));
    t.eq(q.options.length, 3, 'draw the first unit, draw the second, or draw none: ' + JSON.stringify(q.options));
    t.ok(q.options[1].includes('Pyke'), 'the options name the units seen');
    s = RB.apply(s, { t: 'choose', ix: 1 });
    t.ok(s.players[0].hand.includes(u1), 'the named unit was drawn');
    t.eq(s.players[0].deck.slice(-2).sort(), [u2, sp].sort(), 'the rest recycled to the bottom');
  });

  t.test('Rift Herald draws nothing when the player says no, and recycles all three', () => {
    let s = game({ human: 0 });
    const h = put(s, 'unl-179', 0, 'base');
    const look = [sized(s, 2, 0, 'deck'), put(s, aSpell, 0, 'deck'), sized(s, 3, 0, 'deck')];
    resolve(s, [{ op: 'moveUnit', target: 'self', to: 'here' }], { p: 0, source: h, event: { bf: 0 } });
    s = RB.apply(s, { t: 'choose', ix: s.queue[0].options.length - 1 });
    t.eq(s.players[0].hand, []);
    t.eq(s.players[0].deck.slice(-3).sort(), look.slice().sort());
  });
}
