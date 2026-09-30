// Add abilities (rules §695): "Triggered/activated Add abilities resolve immediately on
// finalization and do not pass priority or focus. Add abilities with [Reaction] can be used
// any time resources must be paid, even mid-resolution and with no priority."
// Gold (tok-gold, "Kill this, [E]: Add [A]") is the one every Gold-making card leans on.
export function run(t) {
  const RB = t.RB;
  RB.registerCards();
  const decks = RB.deckData.map(d => d.id);

  // A cleared board, p0 active in its main phase, every rune exhausted and the pool empty,
  // so the only resources are the ones a test puts there.
  const game = () => {
    let s = RB.newGame({ seed: 'add-abilities', decks: [decks[0], decks[1]] });
    while (s.queue.length && s.queue[0].kind === 'mulligan') s = RB.apply(s, { t: 'mulligan', toss: [] });
    s.humanSeat = null;
    for (const P of s.players) { P.deck.push(...P.hand); P.hand = []; P.base = []; }
    for (const b of s.bf) { b.units = []; b.controller = null; b.contestedBy = null; }
    for (const P of s.players) for (const r of P.runes) RB.obj(s, r).exhausted = true;
    s.active = 0; s.priority = 0; s.phase = 'main';
    return s;
  };
  const put = (s, id, p, where = 'base') => {
    const iid = RB.mint(s, id, p);
    if (where === 'hand') s.players[p].hand.push(iid); else s.players[p].base.push(iid);
    return iid;
  };
  const gold = (s, p) => { const g = put(s, 'tok-gold', p); Object.assign(RB.obj(s, g), { token: true, exhausted: false }); return g; };
  const alive = (s, iid) => ['base', 'bf', 'bfGear'].includes(RB.locationOf(s, iid).kind);
  // A unit whose whole cost is 1 Power of one domain and no Energy would be ideal; the
  // pool has none, so take any unit with a Power cost and hand over its Energy.
  const powerUnit = RB.allCards().find(c => c.type === 'Unit' && c.set !== 'Token' &&
    (c.power || 0) === 1 && (c.domains || []).length === 1);

  t.test('cracking a Gold adds at once: nothing on the chain, priority stays, the Gold is gone', () => {
    let s = game();
    const g = gold(s, 0);
    const act = RB.legalActions(s).find(a => a.t === 'activate' && a.iid === g);
    t.ok(act, 'the Gold is offered');
    s = RB.apply(s, act);
    t.eq(s.chain.length, 0, 'an Add ability never uses the chain');
    t.eq(s.priority, 0, 'and does not pass priority');
    t.eq(s.players[0].pool.any, 1, '1 Power of any domain is in the pool already');
    t.ok(!alive(s, g), 'killing it was the cost');
  });

  t.test('a Gold pays for a card it was never activated for — as part of paying', () => {
    const s = game();
    const u = put(s, powerUnit.id, 0, 'hand');
    s.players[0].pool.energy = powerUnit.energy || 0;
    t.eq(RB.legalActions(s).filter(a => a.t === 'play' && a.iid === u).length, 0,
      'without the Gold, ' + powerUnit.id + ' cannot be paid for');
    const g = gold(s, 0);
    const play = RB.legalActions(s).find(a => a.t === 'play' && a.iid === u);
    t.ok(play, 'with a ready Gold it can');
    const s2 = RB.apply(s, play);
    t.ok(!alive(s2, g), 'the Gold was spent paying for it');
    t.eq(s2.players[0].pool.any, 0, 'and nothing is left floating');
    t.ok(s2.players[0].base.includes(u), 'the unit is on the board');
  });

  t.test('a gear that only exhausts is spent before a Gold that dies', () => {
    const s = game();
    const mind = put(s, 'ogn-120', 0);            // "[T]: [Reaction] — [Add] [C]", Mind
    RB.obj(s, mind).exhausted = false;
    const g = gold(s, 0);
    const plan = RB.planPayment(s, 0, { energy: 0, power: 1, domains: ['Mind'], each: false });
    t.ok(plan, 'payable');
    t.eq((plan.adds || []).map(u => u.iid).join(), mind, 'ogn-120 pays, the Gold is kept');
    RB.pay(s, 0, plan);
    t.ok(alive(s, g), 'the Gold survives');
    t.ok(RB.obj(s, mind).exhausted, 'ogn-120 exhausted to pay');
  });

  t.test('a payment probe changes nothing', () => {
    const s = game();
    const g = gold(s, 0);
    const before = JSON.stringify(s);
    t.ok(RB.canPay(s, 0, { energy: 0, power: 1, domains: ['Fury'], each: false }), 'Gold can pay it');
    t.eq(JSON.stringify(s), before, 'canPay left the Gold, the pool and the log alone');
    t.ok(alive(s, g), 'the Gold is still there');
  });

  t.test('the AI does not crack a Gold for a pool that empties at end of turn', () => {
    const s = game();
    const g = gold(s, 0);
    for (const tier of ['hard', 'competition']) {
      const a = RB.aiChoose(s, tier);
      t.ok(!(a.t === 'activate' && a.iid === g), tier + ' chose ' + JSON.stringify(a));
    }
  });
}
