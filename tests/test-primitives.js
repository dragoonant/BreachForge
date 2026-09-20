// The primitives the card packs sit on. Each test names the RULE and is written so it
// fails on the code that existed before the primitive — these are not descriptions of
// what the engine currently happens to do.
export function run(t) {
  const RB = t.RB;
  RB.registerCards();
  const decks = RB.deckData.map(d => d.id);
  const game = (seed) => {
    let s = RB.newGame({ seed: seed || 'prim', decks: [decks[0], decks[1]] });
    while (s.queue.length && s.queue[0].kind === 'mulligan') s = RB.apply(s, { t: 'mulligan', toss: [] });
    return s;
  };
  const unitCard = () => RB.allCards().find(c => c.type === 'Unit' && c.might >= 3);
  const put = (s, p, where) => {
    const iid = RB.mint(s, unitCard().id, p);
    if (where === 'base') s.players[p].base.push(iid); else s.bf[where].units.push(iid);
    return iid;
  };

  // --- Hidden (rule 811) ----------------------------------------------------
  t.test('Hidden: a card can be hidden only at a battlefield you control, one per battlefield', () => {
    const s = game();
    const p = s.active;
    const card = RB.allCards().find(c => c.abilities &&
      (c.abilities.keywords || []).some(k => k === 'Hidden' || k.name === 'Hidden'));
    if (!card) return;
    const iid = RB.mint(s, card.id, p);
    s.players[p].hand.push(iid);
    s.players[p].pool.any = 5;
    t.eq(RB.legalActions(s).filter(a => a.t === 'hide').length, 0,
      'no battlefield controlled yet, so nothing can be hidden');
    s.bf[0].controller = p;
    const hides = RB.legalActions(s).filter(a => a.t === 'hide');
    t.ok(hides.length > 0, 'a controlled battlefield offers a hide');
    t.ok(hides.every(a => a.to === 'bf0'), 'and only the one you control');
    const after = RB.apply(s, hides[0]);
    t.eq(after.bf[0].hidden.length, 1, 'the card went face down');
    t.eq(RB.legalActions(after).filter(a => a.t === 'hide' && a.to === 'bf0').length, 0,
      'a battlefield holds at most one facedown card');
  });

  t.test('Hidden: a facedown card cannot be played on the turn it was hidden, and is free after', () => {
    const s = game();
    const p = s.active;
    const card = RB.allCards().find(c => c.abilities &&
      (c.abilities.keywords || []).some(k => k === 'Hidden' || k.name === 'Hidden'));
    if (!card) return;
    const iid = RB.mint(s, card.id, p);
    s.bf[0].controller = p;
    s.bf[0].hidden.push({ iid: iid, owner: p, turnHidden: s.turn });
    t.eq(RB.legalActions(s).filter(a => a.from === 'hidden').length, 0, 'not this turn');
    const later = RB.clone(s);
    later.turn++;
    const plays = RB.legalActions(later).filter(a => a.from === 'hidden');
    t.ok(plays.length > 0, 'playable from the next turn');
    // It is free: the player has no runes and no pool at all here.
    later.players[p].runes = []; later.players[p].pool.energy = 0;
    t.ok(RB.legalActions(later).some(a => a.from === 'hidden'),
      'and playing it ignores its base cost');
  });

  t.test('Hidden: losing the battlefield trashes the card hidden under it', () => {
    let s = game();
    const p = s.active;
    const card = RB.allCards().find(c => c.type === 'Spell');
    const iid = RB.mint(s, card.id, p);
    s.bf[0].controller = p;
    s.bf[0].hidden.push({ iid: iid, owner: p, turnHidden: s.turn });
    s.bf[0].controller = RB.opponentOf(p);
    s = RB.apply(s, { t: 'endTurn' });
    t.eq(s.bf[0].hidden.length, 0, 'the facedown card is gone');
    t.ok(s.players[p].trash.includes(iid), 'and it went to its owner\'s trash');
  });

  // --- additional costs (rule 349 step 3) ------------------------------------
  t.test('an optional additional cost is a separate play, priced together with the base cost', () => {
    const s = game();
    const p = s.active;
    const base = RB.allCards().find(c => c.type === 'Unit' && (c.energy || 0) <= 2);
    const iid = RB.mint(s, base.id, p);
    s.players[p].hand.push(iid);
    s.players[p].pool.energy = 99; s.players[p].pool.any = 99;
    const saved = RB.card(base.id).abilities;
    RB.card(base.id).abilities = { additionalCosts: [{ id: 'acc', energy: 1, entersReady: true }] };
    const plays = RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid);
    t.ok(plays.some(a => !a.pay), 'the plain play is still offered');
    t.ok(plays.some(a => a.pay && a.pay.includes('acc')), 'and the surcharged one too');
    const paid = RB.apply(s, plays.find(a => a.pay));
    t.ok(!RB.obj(paid, iid).exhausted, 'paying it made the unit enter ready');
    const plain = RB.apply(s, plays.find(a => !a.pay));
    t.ok(RB.obj(plain, iid).exhausted, 'not paying it left the unit exhausted');
    RB.card(base.id).abilities = saved;
  });

  t.test('a mandatory additional cost that cannot be paid makes the card unplayable', () => {
    const s = game();
    const p = s.active;
    const spell = RB.allCards().find(c => c.type === 'Spell');
    const iid = RB.mint(s, spell.id, p);
    s.players[p].hand.push(iid);
    s.players[p].pool.energy = 99; s.players[p].pool.any = 99;
    const saved = RB.card(spell.id).abilities;
    RB.card(spell.id).abilities = { effects: [],
      additionalCosts: [{ id: 'sac', optional: false, pays: 'killFriendly', mighty: true }] };
    t.eq(RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid).length, 0,
      'no Mighty unit to kill, so the spell cannot be played at all');
    const big = RB.allCards().find(c => c.type === 'Unit' && c.might >= 5);
    if (big) {
      const u = RB.mint(s, big.id, p);
      s.players[p].base.push(u);
      t.ok(RB.legalActions(s).some(a => a.t === 'play' && a.iid === iid),
        'with one in play it becomes playable');
      const after = RB.apply(s, RB.legalActions(s).find(a => a.t === 'play' && a.iid === iid));
      t.ok(!after.players[p].base.includes(u), 'and playing it paid the sacrifice');
    }
    RB.card(spell.id).abilities = saved;
  });

  // --- the continuous layer --------------------------------------------------
  t.test('a static may carry a computed value, not only a printed number', () => {
    const s = game();
    const p = s.active;
    const iid = put(s, p, 0);
    const base = RB.mightOf(s, iid);
    const card = RB.card(RB.obj(s, iid).cardId);
    const saved = card.abilities;
    card.abilities = { statics: [{ might: { from: 'points' }, scope: 'self', includeSelf: true }] };
    s.players[p].points = 3;
    t.eq(RB.mightOf(s, iid), base + 3, 'Might reads the player\'s points');
    s.players[p].points = 5;
    t.eq(RB.mightOf(s, iid), base + 5, 'and tracks them as they change');
    card.abilities = saved;
  });

  t.test('a static may carry a condition, and stops applying when it stops holding', () => {
    const s = game();
    const p = s.active;
    const iid = put(s, p, 0);
    const card = RB.card(RB.obj(s, iid).cardId);
    const saved = card.abilities;
    const base = (card.might || 0);
    card.abilities = { statics: [{ might: 2, scope: 'self', includeSelf: true, when: 'defendingAlone' }] };
    t.eq(RB.mightOf(s, iid), base, 'not defending: no bonus');
    RB.obj(s, iid).role = 'defender';
    t.eq(RB.mightOf(s, iid), base + 2, 'defending alone: the bonus applies');
    const friend = put(s, p, 0);
    RB.obj(s, friend).role = 'defender';
    t.eq(RB.mightOf(s, iid), base, 'no longer alone: the bonus stops');
    card.abilities = saved;
  });

  // --- Deflect (rule 809) ----------------------------------------------------
  t.test('Deflect is a real toll: it is paid when an opponent chooses, and blocks the choice when unpayable', () => {
    const s = game();
    const me = s.active, them = RB.opponentOf(me);
    const iid = put(s, them, 0);
    RB.obj(s, iid).granted.push('Deflect');
    s.players[me].runes = []; s.players[me].pool.any = 0;
    t.ok(!RB.canChoose(s, me, iid), 'with no Power, the unit cannot be chosen');
    s.players[me].pool.any = 1;
    t.ok(RB.canChoose(s, me, iid), 'with Power, it can');
    RB.announceChoice(s, me, iid, null);
    t.eq(s.players[me].pool.any, 0, 'and choosing it spent the Power');
    const mine = put(s, me, 0);
    RB.obj(s, mine).granted.push('Deflect');
    t.eq(RB.deflectCost(s, me, mine), 0, 'your own Deflect never charges you');
  });

  // --- events ----------------------------------------------------------------
  t.test('the events cards need are actually raised during play', () => {
    let s = game('events');
    const seen = new Set();
    const spy = RB.runTriggers;
    RB.runTriggers = function (st, ev, data) { seen.add(ev); return spy(st, ev, data); };
    try {
      for (let i = 0; i < 400 && !RB.isTerminal(s); i++) {
        const acts = RB.legalActions(s);
        s = RB.apply(s, acts[RB.peekInt(s, acts.length, i)]);
      }
    } finally { RB.runTriggers = spy; }
    for (const ev of ['cardPlayed', 'drew', 'moved', 'died', 'leftBoard',
                      'showdownBegins', 'attack', 'defend', 'becameReady'])
      t.ok(seen.has(ev), 'event never raised in a whole game: ' + ev);
  });

  t.test('per-turn counters count this turn only and reset on the next', () => {
    let s = game();
    const p = s.active;
    const play = RB.legalActions(s).find(a => a.t === 'play');
    if (!play) return;
    s = RB.apply(s, play);
    t.eq(s.players[p].playedThisTurn.length, 1, 'one card played');
    t.ok(s.players[p].drawsThisTurn >= 1, 'the draw phase counted');
    s = RB.apply(s, { t: 'endTurn' });
    s = RB.apply(s, { t: 'endTurn' });
    t.eq(s.players[p].playedThisTurn.length, 0, 'and both reset on your next turn');
  });

  t.test('becoming Mighty is a crossing, raised once, not every cleanup', () => {
    let s = game();
    const p = s.active;
    const small = RB.allCards().find(c => c.type === 'Unit' && c.might > 0 && c.might < 5);
    if (!small) return;
    const iid = RB.mint(s, small.id, p);
    s.players[p].base.push(iid);
    let fired = 0;
    const spy = RB.runTriggers;
    RB.runTriggers = function (st, ev, data) { if (ev === 'becameMighty') fired++; return spy(st, ev, data); };
    try {
      RB.settle(s);
      t.eq(fired, 0, 'a small unit never crosses');
      s.objects[iid].buffs = 20;
      RB.settle(s);
      t.eq(fired, 1, 'crossing fires exactly once');
      RB.settle(s);
      t.eq(fired, 1, 'and does not fire again while it stays Mighty');
      s.objects[iid].buffs = 0;
      RB.settle(s);
      s.objects[iid].buffs = 20;
      RB.settle(s);
      t.eq(fired, 2, 'but it fires again after dropping below and crossing back');
    } finally { RB.runTriggers = spy; }
  });

  t.test('a delayed ability fires after its source has left the board', () => {
    let s = game();
    const p = s.active;
    const iid = put(s, p, 0);
    RB.runEffects(s, [{ op: 'delayed', on: 'hold', effects: [{ op: 'draw', n: 1 }] }],
      { p: p, source: iid });
    RB.kill(s, iid);
    t.eq(s.delayed.length, 1, 'the promise outlived its source');
    const before = s.players[p].hand.length;
    RB.runTriggers(s, 'hold', { p: p, bf: 0 });
    t.eq(s.players[p].hand.length, before + 1, 'and it paid out');
    t.eq(s.delayed.length, 0, 'once');
  });

  t.test('showdown-only Energy cannot be spent outside a showdown', () => {
    const s = game();
    const p = s.active;
    s.players[p].runes = [];
    s.players[p].pool.energy = 0;
    s.players[p].pool.showdownOnly = 3;
    const cost = { energy: 2, power: 0, domains: [], each: false };
    t.ok(!RB.canPay(s, p, cost), 'outside a showdown it buys nothing');
    s.showdown = { bf: 0, attacker: p, defender: RB.opponentOf(p), combat: false };
    t.ok(RB.canPay(s, p, cost), 'inside one it pays');
  });

  t.test('a narrow play permission opens only the battlefields the card names', () => {
    const s = game();
    const p = s.active;
    const u = RB.allCards().find(c => c.type === 'Unit');
    const iid = RB.mint(s, u.id, p);
    s.players[p].hand.push(iid);
    s.players[p].pool.energy = 99; s.players[p].pool.any = 99;
    const saved = RB.card(u.id).abilities;
    RB.card(u.id).abilities = { playAlso: ['whereEnemyUnits'] };
    t.eq(RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid).map(a => a.to), ['base'],
      'no enemy units anywhere, so only the base');
    put(s, RB.opponentOf(p), 1);
    const dests = RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid).map(a => a.to);
    t.ok(dests.includes('bf1') && !dests.includes('bf0'),
      'the battlefield with enemies opens, the empty one does not: ' + dests.join(','));
    RB.card(u.id).abilities = saved;
  });
}
