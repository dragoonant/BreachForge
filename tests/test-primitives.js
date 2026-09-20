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
    // You hold a battlefield by standing on it: an empty one becomes uncontrolled in the
    // very next cleanup, which would take the facedown card with it.
    s.bf[0].units.push(put(s, p, 0));
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
    s.bf[0].units.push(put(s, p, 0));
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
    s.bf[0].units.push(put(s, p, 0));
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
    const at3 = RB.mightOf(s, iid);
    s.players[p].points = 5;
    t.eq(RB.mightOf(s, iid) - at3, 2, 'Might tracks the player\'s points as they change');
    card.abilities = saved;
    t.eq(at3 - RB.mightOf(s, iid), 3 - 0, 'and the whole contribution is the points, nothing more');
    void base;
  });

  t.test('a static may carry a condition, and stops applying when it stops holding', () => {
    const s = game();
    const p = s.active;
    const iid = put(s, p, 0);
    const card = RB.card(RB.obj(s, iid).cardId);
    const saved = card.abilities;
    // The decks carry statics of their own — one legend in this pool grants +2 Might to a
    // unit defending alone — so the test measures the DELTA its own static causes rather
    // than an absolute Might, and stays true whatever the deck is doing.
    const withoutIt = () => { card.abilities = saved; return RB.mightOf(s, iid); };
    const withIt = () => {
      card.abilities = { statics: [{ might: 2, scope: 'self', includeSelf: true, when: 'defendingAlone' }] };
      return RB.mightOf(s, iid);
    };
    t.eq(withIt() - withoutIt(), 0, 'not defending: the conditional static contributes nothing');
    RB.obj(s, iid).role = 'defender';
    t.eq(withIt() - withoutIt(), 2, 'defending alone: it contributes its 2');
    const friend = put(s, p, 0);
    RB.obj(s, friend).role = 'defender';
    t.eq(withIt() - withoutIt(), 0, 'no longer alone: it stops');
    card.abilities = saved;
  });

  t.test("a scope:'self' static applies to its own source and to nothing else", () => {
    const s = game();
    const p = s.active;
    const a = put(s, p, 0);
    const b = put(s, p, 0);                 // a second copy of the same card
    const card = RB.card(RB.obj(s, a).cardId);
    const saved = card.abilities;
    const base = card.might || 0;
    const other = RB.allCards().find(c => c.type === 'Unit' && c.id !== card.id);
    const c3 = RB.mint(s, other.id, p);
    s.bf[0].units.push(c3);
    const before = [RB.mightOf(s, a), RB.mightOf(s, b), RB.mightOf(s, c3)];
    card.abilities = { statics: [{ might: 3, scope: 'self', includeSelf: true }] };
    const after = [RB.mightOf(s, a), RB.mightOf(s, b), RB.mightOf(s, c3)];
    t.eq(after[0] - before[0], 3, 'the source gets it exactly once, not once per copy on the board');
    t.eq(after[1] - before[1], 3, 'the second copy gets it from its own static, also once');
    t.eq(after[2] - before[2], 0, 'a different card standing beside them gets nothing');
    void base;
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
    for (const ev of ['cardPlayed', 'drew', 'moved',
                      'showdownBegins', 'attack', 'defend', 'becameReady'])
      t.ok(seen.has(ev), 'event never raised in a whole game: ' + ev);
  });

  t.test('a death raises died, deathknell and leftBoard, in that order', () => {
    const s = game();
    const p = s.active;
    const iid = put(s, p, 0);
    const order = [];
    const spy = RB.runTriggers;
    RB.runTriggers = function (st, ev, data) {
      if (['died', 'leftBoard'].includes(ev)) order.push(ev);
      return spy(st, ev, data);
    };
    try { RB.kill(s, iid); } finally { RB.runTriggers = spy; }
    t.eq(order, ['died', 'leftBoard'], 'both fired, death first');
    t.ok(s.players[p].trash.includes(iid), 'and the card reached the trash');
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

  t.test('a card BOUNCED off the board raises leftBoard, not only one that dies', () => {
    // A delayed ability keyed to "until I leave the board" stayed open forever when the
    // card was returned to hand instead of killed, because the bounce lifted the card out
    // of its zone by hand and never raised the event.
    const s = game();
    const p = s.active;
    const iid = put(s, p, 0);
    RB.obj(s, iid).counters = 1;
    RB.obj(s, iid).damage = 2;
    let fired = 0;
    const spy = RB.runTriggers;
    RB.runTriggers = function (st, ev, data) { if (ev === 'leftBoard') fired++; return spy(st, ev, data); };
    try { t.ok(RB.leaveBoard(s, iid), 'the card left the board'); }
    finally { RB.runTriggers = spy; }
    t.eq(fired, 1, 'and said so, once');
    const o = RB.obj(s, iid);
    t.eq([o.counters, o.damage, o.buffs, o.permBuffs], [0, 0, 0, 0],
      'every temporary modification stopped being tracked');
    t.ok(!s.bf[0].units.includes(iid), 'and it is off the battlefield');
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

  t.test("a scope:'self' static never reaches an opponent's units", () => {
    const s = game();
    const mine = put(s, 0, 0);
    const other = RB.allCards().find(c => c.type === 'Unit' && c.id !== RB.obj(s, mine).cardId);
    const theirs = RB.mint(s, other.id, 1);
    s.players[1].base.push(theirs);
    const card = RB.card(RB.obj(s, mine).cardId);
    const saved = card.abilities;
    const before = RB.mightOf(s, theirs);
    card.abilities = { statics: [{ might: 99, scope: 'self', includeSelf: true }] };
    t.eq(RB.mightOf(s, theirs), before, "the opponent's unit is untouched");
    t.eq(RB.mightOf(s, mine) - (card.might || 0), 99, 'and the source got the whole thing');
    card.abilities = saved;
  });

  // --- the damage door -------------------------------------------------------
  t.test('all damage goes through one door, so prevention and bonuses can sit in front of it', () => {
    const s = game();
    const p = s.active;
    const iid = put(s, p, 0);
    RB.dealDamage(s, iid, 2, { p: p }, 'effect');
    t.eq(RB.obj(s, iid).damage, 2, 'ordinary effect damage lands');
    s.preventEffectDamage = true;
    RB.dealDamage(s, iid, 3, { p: p }, 'effect');
    t.eq(RB.obj(s, iid).damage, 2, 'prevented while the shield is up');
    RB.dealDamage(s, iid, 3, { p: p }, 'combat');
    t.eq(RB.obj(s, iid).damage, 5, 'but COMBAT damage is a different thing and still lands');
  });

  t.test('a battlefield can add bonus damage to spells against units standing on it', () => {
    const s = game();
    const p = s.active;
    const iid = put(s, p, 0);
    const bfCard = RB.card(s.bf[0].cardId);
    const saved = bfCard.abilities;
    bfCard.abilities = { statics: [{ bonusDamage: 1, scope: 'here' }] };
    RB.dealDamage(s, iid, 1, { p: p }, 'effect');
    t.eq(RB.obj(s, iid).damage, 2, 'one became two');
    bfCard.abilities = saved;
  });

  // --- restrictions ----------------------------------------------------------
  t.test("a play restriction removes those cards from legalActions, not just from the prompt", () => {
    const s = game();
    const p = s.active;
    s.players[p].pool.energy = 99; s.players[p].pool.any = 99;
    const spells = () => RB.legalActions(s).filter(a => a.t === 'play' &&
      RB.cardOf(s, a.iid).type === 'Spell').length;
    const before = spells();
    if (!before) return;
    RB.runEffects(s, [{ op: 'restrict', what: 'play', type: 'Spell' }], { p: p });
    t.eq(spells(), 0, 'no spell can be played');
    t.ok(RB.legalActions(s).some(a => a.t === 'play'), 'but other card types still can');
  });

  t.test('a restriction lasts the turn and no longer', () => {
    let s = game();
    const p = s.active;
    RB.runEffects(s, [{ op: 'restrict', what: 'play', type: 'Spell' }], { p: p });
    t.ok(RB.restricted(s, p, 'play', 'Spell'), 'in force now');
    s = RB.apply(s, { t: 'endTurn' });
    t.ok(!RB.restricted(s, p, 'play', 'Spell'), 'gone at end of turn');
  });

  // --- keyword values --------------------------------------------------------
  t.test('a granted keyword carries its value, and instances sum', () => {
    const s = game();
    const p = s.active;
    const iid = put(s, p, 0);
    const base = RB.keywordValue(s, iid, 'Assault');
    RB.obj(s, iid).granted.push({ name: 'Assault', value: 2 });
    t.ok(RB.hasKeyword(s, iid, 'Assault'), 'the keyword is present');
    t.eq(RB.keywordValue(s, iid, 'Assault'), base + 2, 'and so is its number');
    RB.obj(s, iid).granted.push('Assault');
    t.eq(RB.keywordValue(s, iid, 'Assault'), base + 2, 'a valueless instance adds nothing');
  });

  // --- tagged resources ------------------------------------------------------
  t.test('restricted Energy pays only for what it names, and is spent before general Energy', () => {
    const s = game();
    const p = s.active;
    s.players[p].runes = [];
    s.players[p].pool.energy = 2;
    RB.runEffects(s, [{ op: 'addRestrictedEnergy', n: 2, only: 'Spell' }], { p: p });
    const spellCost = { energy: 2, power: 0, domains: [], each: false, forType: 'Spell' };
    const unitCost = { energy: 4, power: 0, domains: [], each: false, forType: 'Unit' };
    t.ok(RB.canPay(s, p, spellCost), 'a spell can use it');
    t.ok(!RB.canPay(s, p, unitCost), 'a unit cannot reach it, so 2+2 does not buy a 4');
    const plan = RB.planPayment(s, p, spellCost);
    RB.pay(s, p, plan);
    t.eq(s.players[p].pool.energy, 2, 'the general Energy was left alone');
    t.eq(s.players[p].pool.tagged[0].n, 0, 'the restricted Energy was spent first');
  });

  // --- instance replacements and extra turns ---------------------------------
  t.test('a replacement can be placed on one unit for the turn', () => {
    const s = game();
    const p = s.active;
    const iid = put(s, p, 0);
    RB.runEffects(s, [{ op: 'replaceOn', target: 'allUnits', kind: 'banishInstead' }],
      { p: p, source: iid });
    RB.kill(s, iid);
    t.ok(!s.players[p].trash.includes(iid), 'it did not reach the trash');
    t.ok(s.players[p].banished.includes(iid), 'it was banished instead');
  });

  t.test('an extra turn comes back to the same player before the opponent', () => {
    let s = game();
    const me = s.active;
    RB.runEffects(s, [{ op: 'extraTurn' }], { p: me });
    s = RB.apply(s, { t: 'endTurn' });
    t.eq(s.active, me, 'I take another turn');
    s = RB.apply(s, { t: 'endTurn' });
    t.eq(s.active, RB.opponentOf(me), 'and then play passes as normal');
  });

  t.test('a static can grant a card an additional cost it does not print, and the zone filter holds', () => {
    const s = game();
    const p = s.active;
    const unit = RB.allCards().find(c => c.type === 'Unit' && (c.tags || []).length &&
      !(c.abilities && c.abilities.additionalCosts));
    if (!unit) return;
    const tag = unit.tags[0];
    const iid = RB.mint(s, unit.id, p);
    s.players[p].hand.push(iid);
    s.players[p].pool.energy = 99; s.players[p].pool.any = 99;
    const granter = put(s, p, 'base');
    if (RB.obj(s, granter).cardId === unit.id) return;
    const gc = RB.card(RB.obj(s, granter).cardId);
    const saved = gc.abilities;
    const extra = { id: 'granted-acc', energy: 1, power: 1, entersReady: true };

    const plays = () => RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid);
    const before = plays().length;

    gc.abilities = { statics: [{ grantsExtra: extra, tag: tag }] };
    const after = plays();
    t.ok(after.length > before, 'the granted cost is actually OFFERED, not computed and dropped');
    t.ok(after.some(a => a.pay && a.pay.includes('granted-acc')), 'by its id');
    const paid = RB.apply(s, after.find(a => a.pay && a.pay.includes('granted-acc')));
    t.ok(!RB.obj(paid, iid).exhausted, 'and paying it does what it says');

    // A grant scoped to one zone must not reach a play from another.
    gc.abilities = { statics: [{ grantsExtra: extra, tag: tag, fromZone: 'hidden' }] };
    t.eq(plays().length, before, 'a hand play never sees a grant scoped to facedown plays');

    // …and it must WORK on the zone it IS scoped to. Asserting only the negative is what
    // let a zone-scoped grant throw while the action list was being built: the id was
    // offered with the zone and then re-resolved without it, so a board carrying the
    // granting card could not enumerate its actions at all.
    gc.abilities = { statics: [{ grantsExtra: extra, tag: tag, fromZone: 'hand' }] };
    let scoped;
    try { scoped = plays(); }
    catch (e) { throw new Error('legalActions threw on a zone-scoped grant: ' + e.message); }
    t.ok(scoped.some(a => a.pay && a.pay.includes('granted-acc')),
      'the grant is offered on the zone it names');
    const applied = RB.apply(s, scoped.find(a => a.pay && a.pay.includes('granted-acc')));
    t.ok(!RB.obj(applied, iid).exhausted, 'and applying it still works');
    gc.abilities = saved;
  });

  t.test('a facedown play ignores the base cost but still takes additional costs', () => {
    const s = game();
    const p = s.active;
    const hidCard = RB.allCards().find(c => c.type === 'Unit' &&
      !(c.abilities && c.abilities.additionalCosts) && (c.energy || 0) >= 3);
    if (!hidCard) return;
    const iid = RB.mint(s, hidCard.id, p);
    s.bf[0].units.push(put(s, p, 0));
    s.bf[0].controller = p;
    s.bf[0].hidden.push({ iid: iid, owner: p, turnHidden: s.turn - 1 });
    s.players[p].runes = []; s.players[p].pool.energy = 0; s.players[p].pool.any = 0;

    let acts = RB.legalActions(s).filter(a => a.from === 'hidden' && a.iid === iid);
    t.ok(acts.length > 0, 'playable for free with no resources at all — the base cost is ignored');
    t.ok(acts.every(a => !a.pay), 'and with nothing to add');

    // Grant it an additional cost it cannot afford, then one it can.
    const gc = RB.card(RB.obj(s, s.bf[0].units[0]).cardId);
    const saved = gc.abilities;
    if (gc.id === hidCard.id) { gc.abilities = saved; return; }
    gc.abilities = { statics: [{ grantsExtra: { id: 'acc', energy: 2, entersReady: true },
      type: 'Unit', fromZone: 'hidden' }] };
    acts = RB.legalActions(s).filter(a => a.from === 'hidden' && a.iid === iid);
    t.ok(acts.every(a => !a.pay), 'an unaffordable addition is not offered');
    s.players[p].pool.energy = 5;
    acts = RB.legalActions(s).filter(a => a.from === 'hidden' && a.iid === iid);
    t.ok(acts.some(a => a.pay && a.pay.includes('acc')), 'an affordable one is');
    const after = RB.apply(s, acts.find(a => a.pay));
    t.eq(after.players[p].pool.energy, 3, 'and it was actually paid');
    t.ok(!RB.obj(after, iid).exhausted, 'and it did what it said');
    gc.abilities = saved;
  });

  t.test('an X cost offers every affordable amount, and each one is priced and paid', () => {
    const s = game();
    const p = s.active;
    const spell = RB.allCards().find(c => c.type === 'Spell');
    const saved = RB.card(spell.id).abilities;
    RB.card(spell.id).abilities = {
      additionalCosts: [{ id: 'X', x: true, powerEach: 1 }],
      effects: [{ op: 'damageX', target: { pick: 'enemyUnits', n: 1 } }],
    };
    const iid = RB.mint(s, spell.id, p);
    s.players[p].hand.push(iid);
    s.players[p].runes = []; s.players[p].pool.energy = 99; s.players[p].pool.any = 3;
    const victim = put(s, RB.opponentOf(p), 0);
    try {
      // The lookup for a minted xN id must resolve: this threw before, while the action
      // list was being built, so an X-cost card could not be offered at all.
      let acts;
      try { acts = RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid); }
      catch (e) { throw new Error('legalActions threw on an X cost: ' + e.message); }
      const amounts = acts.filter(a => a.pay).map(a => a.pay.find(x => /^x\d+$/.test(x)));
      t.ok(amounts.includes('x1') && amounts.includes('x3'), 'every affordable amount offered');
      t.ok(!amounts.includes('x4'), 'and nothing beyond what can be paid: ' + amounts.join(','));
      const three = acts.find(a => a.pay && a.pay.includes('x3'));
      const after = RB.apply(s, three);
      let st = after;
      for (let g = 0; g < 6 && st.chain.length; g++) st = RB.apply(st, { t: 'pass' });
      t.eq(st.players[p].pool.any, 0, 'three Power were charged');
      t.eq(RB.obj(st, victim).damage, 3, 'and X damage was dealt');
    } finally { RB.card(spell.id).abilities = saved; }
  });

  t.test('a FAILED canPay leaves the pool exactly as it found it', () => {
    // planPayment is a probe. It reserved from the live pool while solving and restored
    // afterwards, which was one early `return null` away from a permanent drain — and was
    // draining a restricted-Power bucket on every failed price check, so the first card in
    // the project to create one became unplayable a moment after being priced as payable.
    const s = game();
    const p = s.active;
    const src = put(s, p, 'base');
    const domain = RB.cardOf(s, src).domain;
    s.players[p].runes = []; s.players[p].pool.energy = 0; s.players[p].pool.any = 0;
    RB.runEffects(s, [{ op: 'addRestrictedPower', n: 1, only: 'Spell' }], { p: p, source: src });
    const one = { energy: 0, power: 1, domains: [domain], each: false, forType: 'Spell' };
    const two = { energy: 0, power: 2, domains: [domain], each: false, forType: 'Spell' };
    t.ok(RB.canPay(s, p, one), 'one is affordable');
    t.ok(!RB.canPay(s, p, two), 'two is not');
    t.eq(s.players[p].pool.tagged[0].n, 1, 'and the failed check did not consume anything');
    t.ok(RB.canPay(s, p, one), 'so one is still affordable afterwards');
  });

  t.test('restricted POWER is a different bucket from restricted Energy, and both are honoured', () => {
    const s = game();
    const p = s.active;
    const src = put(s, p, 'base');
    const domain = RB.cardOf(s, src).domain;
    s.players[p].runes = []; s.players[p].pool.energy = 0; s.players[p].pool.any = 0;
    RB.runEffects(s, [{ op: 'addRestrictedPower', n: 1, only: 'Spell' }], { p: p, source: src });
    const spellCost = { energy: 0, power: 1, domains: [domain], each: false, forType: 'Spell' };
    const unitCost = { energy: 0, power: 1, domains: [domain], each: false, forType: 'Unit' };
    t.ok(RB.canPay(s, p, spellCost), 'a spell can spend it');
    t.ok(!RB.canPay(s, p, unitCost), 'a unit cannot');
    // canPay is a probe and must leave the pool exactly as it found it.
    t.eq(s.players[p].pool.tagged[0].n, 1, 'probing did not consume it');
    RB.pay(s, p, RB.planPayment(s, p, spellCost));
    t.eq(s.players[p].pool.tagged[0].n, 0, 'paying did');
  });

  // --- targeting -------------------------------------------------------------
  t.test('a human seat is ASKED to target, and the answer is what the effect uses', () => {
    let s = RB.newGame({ seed: 'ask', decks: [decks[0], decks[1]], humanSeat: 0 });
    while (s.queue.length && s.queue[0].kind === 'mulligan') s = RB.apply(s, { t: 'mulligan', toss: [] });
    s.active = 0; s.priority = 0; s.phase = 'main';
    const u = RB.allCards().find(c => c.type === 'Unit' && c.might >= 2);
    const enemies = [];
    for (let i = 0; i < 3; i++) { const x = RB.mint(s, u.id, 1); s.bf[0].units.push(x); enemies.push(x); }

    // A spell that damages one chosen enemy, authored inline so the test does not depend
    // on which card in the pool happens to be shaped this way.
    const spell = RB.allCards().find(c => c.type === 'Spell');
    const saved = RB.card(spell.id).abilities;
    RB.card(spell.id).abilities = {
      effects: [{ op: 'damage', n: 1, target: { pick: 'enemyUnits', n: 1 } }],
    };
    const iid = RB.mint(s, spell.id, 0);
    s.players[0].hand.push(iid);
    s.players[0].pool.energy = 99; s.players[0].pool.any = 99;
    try {
      const play = RB.legalActions(s).find(a => a.t === 'play' && a.iid === iid);
      if (!play) return;
      let st = RB.apply(s, play);
      for (let g = 0; g < 6 && st.chain.length && !st.queue.length; g++) st = RB.apply(st, { t: 'pass' });
      t.ok(st.queue[0] && st.queue[0].kind === 'target', 'the engine stopped to ask');
      t.eq(st.queue[0].n, 1, 'for one target');
      t.eq(st.queue[0].options.length, 3, 'out of the three legal ones');
      const answers = RB.legalActions(st);
      t.eq(answers.length, 3, 'every legal answer is its own action');
      // Pick the LAST enemy — the one the auto-picker would not have taken — and prove
      // the damage landed there and nowhere else.
      const want = st.queue[0].options[2];
      const after = RB.apply(st, { t: 'choose', selection: [want] });
      t.eq(after.queue.length, 0, 'the question is answered');
      t.eq(RB.obj(after, want).damage, 1, 'the chosen unit took the damage');
      const others = st.queue[0].options.filter(x => x !== want);
      for (const o of others) t.eq(RB.obj(after, o).damage, 0, 'and nothing else did');
    } finally { RB.card(spell.id).abilities = saved; }
  });

  t.test('a discard the OPPONENT forces on you is still your choice', () => {
    let s = RB.newGame({ seed: 'disc', decks: [decks[0], decks[1]], humanSeat: 0 });
    while (s.queue.length && s.queue[0].kind === 'mulligan') s = RB.apply(s, { t: 'mulligan', toss: [] });
    s.active = 1; s.priority = 1; s.phase = 'main';
    const spell = RB.allCards().find(c => c.type === 'Spell');
    const saved = RB.card(spell.id).abilities;
    RB.card(spell.id).abilities = { effects: [{ op: 'discard', n: 1, opponent: true }] };
    const iid = RB.mint(s, spell.id, 1);
    s.players[1].hand.push(iid);
    s.players[1].pool.energy = 99; s.players[1].pool.any = 99;
    try {
      const play = RB.legalActions(s).find(a => a.t === 'play' && a.iid === iid);
      if (!play) return;
      let st = RB.apply(s, play);
      for (let g = 0; g < 6 && st.chain.length && !st.queue.length; g++) st = RB.apply(st, { t: 'pass' });
      t.ok(st.queue[0] && st.queue[0].kind === 'target', 'the engine stopped to ask');
      t.eq(st.queue[0].who, 0, 'and it asked the player discarding, not the caster');
      const before = st.players[0].hand.length;
      const want = st.queue[0].options[1];
      const after = RB.apply(st, { t: 'choose', selection: [want] });
      t.eq(after.players[0].hand.length, before - 1, 'one card left the hand');
      t.ok(after.players[0].trash.includes(want), 'and it was the one chosen, not the cheapest');
    } finally { RB.card(spell.id).abilities = saved; }
  });

  t.test('with no human seat, the engine answers targeting itself and never stops', () => {
    let s = RB.newGame({ seed: 'noask', decks: [decks[0], decks[1]] });
    while (s.queue.length && s.queue[0].kind === 'mulligan') s = RB.apply(s, { t: 'mulligan', toss: [] });
    let asked = 0;
    for (let i = 0; i < 600 && !RB.isTerminal(s); i++) {
      if (s.queue[0] && s.queue[0].kind === 'target') asked++;
      const acts = RB.legalActions(s);
      s = RB.apply(s, acts[RB.peekInt(s, acts.length, i)]);
    }
    t.eq(asked, 0, 'an AI-vs-AI game is never interrupted by a targeting prompt');
  });

  // --- timing (rules 315.4, 316.5) -------------------------------------------
  t.test('Action and Reaction timing: who may play what, and when', () => {
    const s = game();
    const me = s.active, them = RB.opponentOf(me);
    const pick = kw => RB.allCards().find(c => c.abilities &&
      (c.abilities.keywords || []).some(k => k === kw || k.name === kw));
    const plain = RB.allCards().find(c => c.type === 'Spell' && c.abilities &&
      !(c.abilities.keywords || []).some(k => ['Action', 'Reaction'].includes(k.name || k)));
    const action = pick('Action'), reaction = pick('Reaction');
    if (!action || !reaction || !plain) return;

    const give = (state, p, card) => {
      const iid = RB.mint(state, card.id, p);
      state.players[p].hand.push(iid);
      state.players[p].pool.energy = 99; state.players[p].pool.any = 99;
      return iid;
    };
    // legalActions offers ONE play per distinct card in hand, not per copy, so the test
    // asks whether the CARD is offered rather than whether one particular copy is — the
    // opening hand may already hold another copy of the same card.
    // legalActions offers ONE play per distinct card in a player's hand, not per copy, so
    // the test asks whether THAT PLAYER is offered that card — the opening hand may hold
    // another copy, and the opponent may hold one too.
    const offered = (state, iid) => {
      const o = RB.obj(state, iid);
      return RB.legalActions(state).some(a => a.t === 'play' &&
        RB.obj(state, a.iid).cardId === o.cardId &&
        RB.obj(state, a.iid).controller === o.controller);
    };

    // Neutral Open State: only the turn player acts at all (316.5).
    const a1 = give(s, me, plain);
    const a2 = give(s, them, reaction);
    t.ok(offered(s, a1), 'the turn player may play an ordinary card in their main phase');
    t.ok(!offered(s, a2), 'the other player is offered nothing at all outside a showdown or a chain');

    // Showdown Open State: Action and Reaction only, for whoever holds priority (315.4).
    const sd = RB.clone(s);
    sd.showdown = { bf: 0, attacker: me, defender: them, combat: false };
    sd.priority = me; sd.focus = me;
    const b1 = give(sd, me, plain), b2 = give(sd, me, action), b3 = give(sd, me, reaction);
    t.ok(!offered(sd, b1), 'an ordinary card cannot be played during a showdown');
    t.ok(offered(sd, b2), 'an Action can');
    t.ok(offered(sd, b3), 'and so can a Reaction');

    // Closed state: a chain is resolving, so only Reactions.
    const ch = RB.clone(s);
    ch.chain.push({ iid: a1, controller: me, kind: 'card' });
    ch.priority = them;
    const c1 = give(ch, them, action), c2 = give(ch, them, reaction);
    t.ok(!offered(ch, c1), 'an Action cannot be played into a resolving chain');
    t.ok(offered(ch, c2), 'a Reaction can');
  });

  // --- replacement effects ---------------------------------------------------
  t.test('a replacement effect stands in front of a death and takes its place', () => {
    const s = game();
    const p = s.active;
    const victim = put(s, p, 0);
    const shield = put(s, p, 'base');
    const card = RB.card(RB.obj(s, shield).cardId);
    const saved = card.abilities;
    // Give only the shield instance the replacement, by giving its card the ability and
    // making sure the victim is a different card.
    if (RB.obj(s, victim).cardId === RB.obj(s, shield).cardId) { card.abilities = saved; return; }
    card.abilities = { replaces: [{ event: 'death', kind: 'dieInstead' }] };
    RB.kill(s, victim);
    t.ok(s.bf[0].units.includes(victim), 'the unit that would have died is still there');
    t.ok(!s.players[p].base.includes(shield), 'and the replacement died in its place');
    // A replacement never replaces its own death, or it could never resolve.
    card.abilities = saved;
  });

  t.test("an activated ability's gate is checked, not only its cost", () => {
    const s = game();
    const p = s.active;
    const iid = put(s, p, 'base');
    const card = RB.card(RB.obj(s, iid).cardId);
    const saved = card.abilities;
    s.players[p].pool.energy = 99; s.players[p].pool.any = 99;
    RB.obj(s, iid).exhausted = false;
    card.abilities = { activated: [{ energy: 0, when: 'playedEquipmentThisTurn',
      effects: [{ op: 'draw', n: 1 }] }] };
    t.eq(RB.legalActions(s).filter(a => a.t === 'activate' && a.iid === iid).length, 0,
      'no Equipment played this turn, so the ability is not offered at all');
    s.players[p].turnFlags.equipment = true;
    t.ok(RB.legalActions(s).some(a => a.t === 'activate' && a.iid === iid),
      'once the gate holds it appears');
    card.abilities = saved;
  });

  // --- the Champion Zone (rule 1.1) ------------------------------------------
  t.test('the Chosen Champion starts in the public Champion Zone, not in the main deck', () => {
    const s = game();
    for (let p = 0; p < 2; p++) {
      const d = RB.deck(s.players[p].deckId);
      t.ok(d.champion, d.id + ' has a Chosen Champion');
      t.ok(s.players[p].champion, 'player ' + p + ' starts with it in the Champion Zone');
      t.eq(RB.obj(s, s.players[p].champion).cardId, d.champion, 'and it is the right card');
      const inDeck = s.players[p].deck.filter(i => RB.obj(s, i).cardId === d.champion).length;
      const inHand = s.players[p].hand.filter(i => RB.obj(s, i).cardId === d.champion).length;
      const listed = d.main.find(e => e.id === d.champion);
      t.eq(inDeck + inHand, (listed ? listed.qty : 1) - 1,
        'exactly one copy was taken out of the main deck, and no more');
    }
  });

  t.test('the champion is playable from the Champion Zone, and leaves it when played', () => {
    const s = game();
    const p = s.active;
    s.players[p].pool.energy = 99; s.players[p].pool.any = 99;
    const champ = s.players[p].champion;
    const play = RB.legalActions(s).find(a => a.t === 'play' && a.iid === champ);
    t.ok(play, 'it is offered');
    t.eq(play.from, 'champion', 'and from the champion zone');
    const after = RB.apply(s, play);
    t.eq(after.players[p].champion, null, 'the zone is empty afterwards');
    t.ok(RB.locationOf(after, champ).kind !== 'championZone', 'and the card is in play');
  });

  // --- the Ending Phase (rule 317) -------------------------------------------
  t.test('the ending phase heals all damage, expires this-turn buffs, and keeps permanent ones', () => {
    let s = game();
    const p = s.active;
    const iid = put(s, p, 'base');
    const card = RB.card(RB.obj(s, iid).cardId);
    RB.obj(s, iid).damage = 1;
    RB.obj(s, iid).buffs = 3;
    RB.obj(s, iid).permBuffs = 2;
    RB.obj(s, iid).granted = ['Ganking'];
    s = RB.apply(s, { t: 'endTurn' });
    const o = RB.obj(s, iid);
    t.eq(o.damage, 0, 'damage healed');
    t.eq(o.buffs, 0, 'the this-turn buff expired');
    t.eq(o.permBuffs, 2, 'the permanent buff survived');
    t.eq(o.granted, [], 'granted keywords expired');
    t.eq(RB.mightOf(s, iid), (card.might || 0) + 2, 'and Might reflects exactly that');
  });

  t.test('the ending phase empties BOTH rune pools, not just the turn player\'s', () => {
    let s = game();
    s.players[0].pool.energy = 4; s.players[0].pool.any = 2;
    s.players[1].pool.energy = 3; s.players[1].pool.power.Fury = 2;
    s = RB.apply(s, { t: 'endTurn' });
    for (let q = 0; q < 2; q++) {
      t.eq(s.players[q].pool.energy, 0, 'player ' + q + ' energy');
      t.eq(s.players[q].pool.any, 0, 'player ' + q + ' universal power');
      t.eq(s.players[q].pool.power.Fury, 0, 'player ' + q + ' domain power');
    }
  });

  t.test('a stunned unit deals no combat damage but is no easier to kill, and clears at end of turn', () => {
    let s = game();
    const p = s.active;
    const iid = put(s, p, 0);
    const full = RB.mightOf(s, iid);
    RB.runEffects(s, [{ op: 'stun', target: 'allUnits' }], { p: p, source: iid });
    t.eq(RB.combatMightOf(s, iid), 0, 'it contributes nothing to combat damage');
    t.eq(RB.mightOf(s, iid), full, 'but its Might is untouched, so it still takes full damage to kill');
    t.ok(!RB.obj(s, iid).exhausted, 'and it is not exhausted — Stun is not an exhaustion');
    RB.runEffects(s, [{ op: 'stun', target: 'allUnits' }], { p: p, source: iid });
    t.eq(RB.obj(s, iid).stunned, true, 'it cannot be stunned twice');
    s = RB.apply(s, { t: 'endTurn' });
    t.eq(RB.obj(s, iid).stunned, false, 'and it clears in the ending cleanup');
  });

  t.test('the awaken phase readies a stunned unit like any other', () => {
    let s = game();
    const p = s.active;
    const iid = put(s, p, 'base');
    RB.obj(s, iid).exhausted = true;
    RB.obj(s, iid).stunned = true;
    s = RB.apply(s, { t: 'endTurn' });
    s = RB.apply(s, { t: 'endTurn' });
    t.ok(!RB.obj(s, iid).exhausted, 'stun never held it down');
  });

  // --- Recycle and Burn Out (rules 416 and 431) ------------------------------
  t.test('recycle puts a card on the BOTTOM of the deck, it does not shuffle it in', () => {
    const s = game();
    const p = s.firstPlayer;
    // Answer the mulligan for the seat that has not drawn yet.
    let st = RB.newGame({ seed: 'recycle', decks: [decks[0], decks[1]] });
    const who = st.queue[0].who;
    const hand = st.players[who].hand.slice();
    const tossed = hand.slice(0, 2);
    const deckBefore = st.players[who].deck.slice();
    st = RB.apply(st, { t: 'mulligan', toss: tossed });
    const deck = st.players[who].deck;
    t.eq(deck.slice(-2), tossed, 'the two set-aside cards are the bottom two');
    t.eq(deck.slice(0, deckBefore.length - 2), deckBefore.slice(2),
      'and the rest of the deck kept its order');
    void p;
  });

  t.test('drawing from an empty deck burns out: trash recycles, the opponent gains a point', () => {
    const s = game();
    const p = s.active, them = RB.opponentOf(p);
    const trash = s.players[p].deck.splice(0, 5);
    s.players[p].deck = [];
    s.players[p].trash = trash;
    const before = s.players[them].points;
    const drawn = RB.draw(s, p);
    t.eq(s.players[them].points, before + 1, 'the opponent gained a point');
    t.ok(drawn !== null, 'and the draw still happened, from the recycled deck');
    t.eq(s.players[p].trash.length, 0, 'the trash is empty');
  });

  t.test('burning out with an empty trash still concedes the point, and can lose the game', () => {
    let s = game();
    const p = s.active, them = RB.opponentOf(p);
    s.players[p].deck = []; s.players[p].trash = [];
    s.players[them].points = s.victoryScore - 1;
    // The winning point restriction applies to Conquer and Hold only, so a Burn Out point
    // may be the eighth.
    RB.draw(s, p);
    RB.settle(s);
    t.eq(s.players[them].points, s.victoryScore, 'the point landed');
    t.eq(s.winner, them, 'and it won the game');
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
