// DEVIATIONS.md D-13 … D-20, the entries the card-by-card audit of 2026-09-27 left open.
// Each test states the printed rule the deviation broke; each was watched failing with its
// fix reverted (CLAUDE.md rule 10).
export function run(t) {
  const RB = t.RB;
  RB.registerCards();
  const decks = RB.deckData.map(d => d.id);

  const game = (opts = {}) => {
    let s = RB.newGame({ seed: opts.seed || 'deviations', decks: [decks[0], decks[1]] });
    while (s.queue.length && s.queue[0].kind === 'mulligan') s = RB.apply(s, { t: 'mulligan', toss: [] });
    s.humanSeat = opts.human === undefined ? null : opts.human;
    for (const P of s.players) { P.deck.push(...P.hand); P.hand = []; P.base = []; P.trash = []; }
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
  const vanilla = 'tok-mech';                   // a 3 Might unit with no text
  const sized = (s, m, p, where) => {
    const iid = put(s, vanilla, p, where);
    RB.obj(s, iid).permBuffs = m - RB.card(vanilla).might;
    return iid;
  };
  const plays = (s, iid) => RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid);
  const acts = (s, iid) => RB.legalActions(s).filter(a => a.t === 'activate' && a.iid === iid);
  const passAll = s => {
    for (let k = 0; k < 30 && (s.chain.length || s.queue.length); k++)
      s = s.queue.length ? RB.apply(s, RB.legalActions(s)[0]) : RB.apply(s, { t: 'pass' });
    return s;
  };
  const resolve = (s, effects, ctx) => { RB.runAsking(s, effects, ctx, ctx.source); return s; };
  // A spell of the given player sitting on the chain, as if just played.
  const onChain = (s, id, p, owner = p) => {
    const iid = RB.mint(s, id, owner);
    RB.obj(s, iid).controller = p;
    s.chainSeq = (s.chainSeq || 0) + 1;
    s.chain.push({ iid: iid, controller: p, kind: 'card', cardId: id, uid: 'c' + s.chainSeq,
      energy: RB.card(id).energy || 0, targets: [] });
    return iid;
  };
  const aSpell = 'unl-190';                     // Lilting Lullaby: any plain spell will do

  // --- D-20 ------------------------------------------------------------------------
  t.test('D-20 unl-118 Elder Dragon: a fully prevented hit is not "your damage"', () => {
    let s = game();
    put(s, 'unl-118', 0, 'base');
    const foe = sized(s, 4, 1, 0);
    RB.dealDamage(s, foe, 2, { p: 1 }, 'effect');     // hurt by its own side
    s.preventEffectDamage = true;
    RB.dealDamage(s, foe, 1, { p: 0 }, 'effect');     // prevented entirely
    RB.settle(s);
    t.ok(s.bf[0].units.includes(foe), 'the enemy unit is still alive');
  });

  t.test("D-20 unl-131 Abandon: the countered spell goes to its OWNER's hand", () => {
    let s = game();
    const spell = onChain(s, aSpell, 0, 1);           // p0 cast a card p1 owns
    resolve(s, [{ op: 'counterToHand' }], { p: 1, source: null });
    t.ok(s.players[1].hand.includes(spell), "in the owner's hand");
    t.ok(!s.players[0].hand.includes(spell), "not in the caster's");
  });

  t.test("D-20 counter: a countered card goes to its OWNER's trash", () => {
    let s = game();
    const spell = onChain(s, aSpell, 0, 1);
    resolve(s, [{ op: 'counter' }], { p: 1, source: null });
    t.ok(s.players[1].trash.includes(spell), "in the owner's trash");
  });
}
