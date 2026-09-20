// Ops added for the Unleashed set. Everything here is wired through RB.defineOp /
// RB.defineDescriber so js/abilities.js and js/text.js never need editing.
//
// Three house rules, all of them about not stepping on the other packs:
//
//  * NOTHING HERE REDEFINES AN OP ANOTHER FILE OWNS. js/ops-unl.js loads last, so a name
//    collision would silently replace another set's handler, and `may`, `choose`, `stun`,
//    `counter` and `xp` are the core's. The Equip ability is `equipSelf` rather than
//    `attach` for the same reason.
//  * A DECISION WHOSE BOTH BRANCHES ACT USES `choose`, NOT `may`. `may` queues a step and
//    returns, so any effect written after it in the same list resolves BEFORE the answer.
//    Where a card says "you may X, then Y" the two options are spelled out instead, so Y
//    lands after the decision either way.
//  * NOTHING HERE WRAPS A CORE FUNCTION. The `RB.staticsOn` wrapper this file used to
//    carry (debt D-8) is gone: the core evaluates `when` itself, and this pack's two extra
//    predicates are registered through `RB.defineStaticWhen` like every other.
//
// Selection note: the core's RB.autoPick always takes the BIGGEST candidate, which is the
// right policy for a removal spell and the wrong one for "choose a friendly unit" on a
// card that harms what it chooses. The helper below keeps the *pool* exactly as printed
// and only varies the ORDER it is offered in (`low`, `prefer`), so no card here chooses
// outside what its text allows.
//
// It does not decide how many to take. Every narrowing ends at RB.offerChoice — the one
// door — because that is where the human seat is asked, an answer already given is
// honoured, Deflect is charged to the chooser, and the `chosen` trigger fires. A picker
// that slices its own pool skips all four silently. This pack builds and orders the pool;
// the door decides how many and whether to ask.
(function (RB) {
  'use strict';

  const n_ = e => (e.n == null ? 1 : e.n);

  // --- selection -----------------------------------------------------------
  // All gear on the board: in a base, unattached at a battlefield, or attached to a unit.
  function allGear(s) {
    const out = [];
    for (const iid of Object.keys(s.objects)) {
      const o = s.objects[iid];
      if (RB.card(o.cardId).type !== 'Gear') continue;
      if (o.attachedTo) { out.push(iid); continue; }
      const loc = RB.locationOf(s, iid);
      if (loc.kind === 'base' || loc.kind === 'bfGear') out.push(iid);
    }
    return out;
  }

  function base(s, name, ctx) {
    if (name === 'gear') return allGear(s);
    if (name === 'here')
      return (ctx.event && ctx.event.bf !== undefined) ? s.bf[ctx.event.bf].units.slice() : [];
    return RB.select(s, name, ctx);
  }

  // A pick spec: { pick:<selector>, n:1, at:'battlefield'|'base', role:'attacker',
  //                notTemporary:true, notEventUnit:true, notSelf:true, exhausted:true,
  //                filter:'damaged', maxMight:N, notHere:true, tag:'<Tag>',
  //                n:'all' (every match, not one), low:true, prefer:'enemy'|'mine' }
  // `tag` may be built at resolution time rather than printed in the data — The List names
  // its tag as it is played, and the ability that reads it is a pool like any other.
  function targets(s, spec, ctx) {
    if (!spec || typeof spec === 'string') return base(s, spec, ctx);
    let pool = base(s, spec.pick, ctx);
    if (spec.at === 'battlefield') pool = pool.filter(i => RB.locationOf(s, i).kind === 'bf');
    if (spec.at === 'base') pool = pool.filter(i => RB.locationOf(s, i).kind === 'base');
    if (spec.role) pool = pool.filter(i => RB.obj(s, i).role === spec.role);
    if (spec.notTemporary) pool = pool.filter(i => !RB.obj(s, i).temporary);
    if (spec.notEventUnit && ctx.event) pool = pool.filter(i => i !== ctx.event.iid);
    if (spec.notSelf) pool = pool.filter(i => i !== ctx.source);
    if (spec.exhausted) pool = pool.filter(i => RB.obj(s, i).exhausted);
    if (spec.notHere && ctx.event && ctx.event.bf !== undefined)
      pool = pool.filter(i => RB.locationOf(s, i).bf !== ctx.event.bf);
    if (spec.tag) pool = pool.filter(i =>
      (RB.card(RB.obj(s, i).cardId).tags || []).includes(spec.tag));
    if (spec.filter === 'damaged') pool = pool.filter(i => RB.obj(s, i).damage > 0);
    if (spec.maxMight !== undefined) pool = pool.filter(i => RB.mightOf(s, i) <= spec.maxMight);
    if (!pool.length) return [];
    const cost = i => RB.card(RB.obj(s, i).cardId).energy || 0;
    pool = pool.slice().sort((a, b) => {
      const d = RB.mightOf(s, b) - RB.mightOf(s, a);
      return d !== 0 ? d : cost(b) - cost(a);
    });
    if (spec.low) pool.reverse();
    if (spec.prefer) {
      const want = spec.prefer === 'enemy' ? RB.opponentOf(ctx.p) : ctx.p;
      const yes = pool.filter(i => RB.obj(s, i).controller === want);
      const no = pool.filter(i => RB.obj(s, i).controller !== want);
      pool = yes.concat(no);
    }
    // `n:'all'` is not a choice — "return ALL units with 2 Might or less" chooses nothing,
    // so it must not toll Deflect or fire `chosen`. Everything else goes through the door.
    if (spec.n === 'all') return pool;
    return RB.offerChoice(s, pool, spec.n || 1, ctx, String(spec.pick), spec.prompt);
  }
  RB.unlTargets = targets;      // the check harness reads this

  const NAMES = {
    self: 'me', eventUnit: 'that unit', myUnits: 'a friendly unit', enemyUnits: 'an enemy unit',
    allUnits: 'a unit', hereMine: 'a friendly unit there', hereEnemy: 'enemy units there',
    here: 'a unit there', gear: 'a gear',
  };
  // The plural reading of each pool, for `n:'all'` — "all friendly unit theres" is not a
  // sentence, and a describer nobody can read is a clause nobody can check.
  const PLURAL = {
    myUnits: 'your units', enemyUnits: 'enemy units', allUnits: 'all units',
    hereMine: 'your units there', hereEnemy: 'enemy units there',
    here: 'the units there', gear: 'gear',
  };
  function selText(spec) {
    if (!spec) return 'me';
    if (typeof spec === 'string') return NAMES[spec] || spec;
    if (spec.n === 'all') {
      let a = PLURAL[spec.pick] || String(spec.pick);
      if (spec.notSelf || spec.notEventUnit) a = a.replace(/^your /, 'your other ');
      if (spec.notTemporary) a += " without Temporary";
      if (spec.at === 'battlefield') a += ' at a battlefield';
      if (spec.maxMight !== undefined) a += ' with ' + spec.maxMight + ' Might or less';
      return a;
    }
    let t = NAMES[spec.pick] || String(spec.pick);
    if (spec.tag) t += ' with the ' + spec.tag + ' tag';
    if (spec.role) t = 'an ' + (spec.role === 'attacker' ? 'attacking' : 'defending') + ' ' +
      t.replace(/^an? /, '');
    if (spec.notTemporary) t += " that isn't Temporary";
    if (spec.notEventUnit || spec.notSelf) t = 'another ' + t.replace(/^an? /, '');
    if (spec.exhausted) t = 'an exhausted ' + t.replace(/^an? /, '');
    if (spec.maxMight !== undefined) t += ' with ' + spec.maxMight + ' Might or less';
    if (spec.notHere) t += ' at a different location';
    if (spec.at === 'battlefield') t += ' at a battlefield';
    if (spec.at === 'base') t += ' in a base';
    return t;
  }
  RB.unlSelText = selText;

  const join = list => (list || []).map(e => {
    const d = RB.describers[e.op];
    if (!d) throw new Error('no describer for op: ' + e.op);
    return d(e);
  }).filter(Boolean).join(' ');
  const lower = t => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

  // --- moving a card between zones ------------------------------------------
  function pluck(s, iid) {
    const o = RB.obj(s, iid);
    const loc = RB.locationOf(s, iid);
    if (loc.kind === 'bf') RB.removeFrom(s.bf[loc.bf].units, iid);
    else if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, iid);
    else if (loc.kind === 'bfGear') RB.removeFrom(s.bf[loc.bf].gear, iid);
    else if (o.attachedTo) RB.removeFrom(RB.obj(s, o.attachedTo).attached, iid);
    else return false;
    return true;
  }

  // Off the board and into the owner's hand. A token ceases to exist instead; gear riding
  // a returned unit is detached and falls back to its owner's base.
  function toHand(s, iid) {
    const o = RB.obj(s, iid);
    if (!pluck(s, iid)) return false;
    for (const g of (o.attached || []).slice()) {
      const go = RB.obj(s, g);
      go.attachedTo = null;
      s.players[go.owner].base.push(g);
    }
    o.attached = [];
    // RB.kill clears permBuffs and counters; this path lifts the card out of its zone
    // directly and never reaches kill, so it has to clear the same fields itself.
    o.damage = 0; o.buffs = 0; o.permBuffs = 0; o.counters = 0; o.granted = [];
    o.exhausted = false; o.cantMove = false;
    o.stunned = false; o.temporary = false; o.attachedTo = null; o.movedThisTurn = 0;
    delete o.role;
    if (!o.token) s.players[o.owner].hand.push(iid);
    RB.log(s, 'returnToHand', { p: o.controller, iid: iid }, 'unit.move');
    return true;
  }

  // --- returnToHand ---------------------------------------------------------
  RB.defineOp('returnToHand', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) toHand(s, iid);
  });
  RB.defineDescriber('returnToHand', e =>
    'Return ' + selText(e.target) + " to its owner's hand.");

  // --- giveTemporary --------------------------------------------------------
  // The engine models Temporary as o.temporary (js/engine.js sweeps it), and only an op
  // ever sets that flag — so a printed [Temporary] is EXPANDED here rather than declared
  // as a keyword, or the clause would be inert.
  RB.defineOp('giveTemporary', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) {
      RB.obj(s, iid).temporary = true;
      RB.log(s, 'temporary', { iid: iid, p: RB.obj(s, iid).controller });
    }
  });
  RB.defineDescriber('giveTemporary', e => 'Give Temporary to ' + selText(e.target) + '.');

  // --- equipSelf ------------------------------------------------------------
  // The Equip keyword's ability: "Attach this to a unit you control." Named `equipSelf`
  // and not `attach` because js/ops-sfd.js owns `attach`.
  RB.defineOp('equipSelf', (s, e, ctx) => {
    const host = targets(s, e.target || { pick: 'myUnits' }, ctx)[0];
    if (!host) return;
    const g = ctx.source;
    const o = RB.obj(s, g);
    if (o.attachedTo === host) return;
    if (!pluck(s, g)) return;
    RB.obj(s, host).attached.push(g);
    o.attachedTo = host;
    RB.log(s, 'attach', { p: ctx.p, iid: g, host: host }, 'gear.equip');
  });
  RB.defineDescriber('equipSelf', e => 'Attach me to ' + selText(e.target || { pick: 'myUnits' }) + '.');

  // --- cond -----------------------------------------------------------------
  // "…, if [condition], [effect]". Every key in `test` must hold. Only the conditions
  // actually printed on Unleashed cards exist; an unknown one throws rather than quietly
  // reading as false.
  const TESTS = {
    opponentScoreWithin: (s, ctx, v) => s.players[RB.opponentOf(ctx.p)].points >= s.victoryScore - v,
    selfReady: (s, ctx) => !RB.obj(s, ctx.source).exhausted,
    eventIsSelf: (s, ctx) => !!(ctx.event && ctx.event.iid === ctx.source),
    toBattlefield: (s, ctx) => !!(ctx.event && ctx.event.bf !== undefined),
    handMin: (s, ctx, v) => s.players[ctx.p].hand.length >= v,
    xpAtLeast: (s, ctx, v) => (s.players[ctx.p].xp || 0) >= v,
    energyAtLeast: (s, ctx, v) => s.players[ctx.p].pool.energy >= v,
    nonEmpty: (s, ctx, v) => targets(s, v, ctx).length > 0,
    eventUnitHere: (s, ctx) => !!(ctx.event && ctx.event.iid && ctx.event.bf !== undefined &&
      RB.locationOf(s, ctx.event.iid).bf === ctx.event.bf),
    eventUnitIsToken: (s, ctx, v) => !!(ctx.event && ctx.event.iid) &&
      !!RB.obj(s, ctx.event.iid).token === v,
    fromHidden: (s, ctx) => !!ctx.fromHidden,
    fromHand: (s, ctx) => !ctx.fromHidden,
    eventNth: (s, ctx, v) => !!ctx.event && ctx.event.nth === v,
    // Not the pool alone: a cost is payable if a rune could still be exhausted for it.
    canPayEnergy: (s, ctx, v) => RB.canPay(s, ctx.p, { energy: v, power: 0, domains: [], each: false }),
    noBattlefield: (s, ctx, v) => !s.bf.some(b => b.cardId === v),
    paid: (s, ctx, v) => (ctx.paid || []).includes(v),
    otherUnitsMightAtLeast: (s, ctx, v) => RB.allUnits(s)
      .filter(i => RB.obj(s, i).controller === ctx.p && i !== ctx.source)
      .reduce((n, i) => n + RB.mightOf(s, i), 0) >= v,
    enemyAloneHere: (s, ctx) => !!ctx.event && ctx.event.bf !== undefined &&
      RB.unitsAt(s, ctx.event.bf, RB.opponentOf(ctx.p)).length === 1,
    eventWinnerIsMe: (s, ctx) => !!ctx.event && ctx.event.winner === ctx.p,
    selfHere: (s, ctx) => !!ctx.event && ctx.event.bf !== undefined &&
      RB.locationOf(s, ctx.source).bf === ctx.event.bf,
  };
  const TEST_TEXT = {
    opponentScoreWithin: v => "an opponent's score is within " + v + ' points of the Victory Score',
    selfReady: () => "I'm ready",
    eventIsSelf: () => 'it was me',
    toBattlefield: () => 'the destination is a battlefield',
    handMin: v => 'you have ' + v + ' card' + (v === 1 ? '' : 's') + ' in hand',
    xpAtLeast: v => 'you have ' + v + '+ XP',
    energyAtLeast: v => 'you have ' + v + ' Energy',
    nonEmpty: v => 'there is ' + selText(v),
    eventUnitHere: () => 'it is here',
    eventUnitIsToken: v => 'it is ' + (v ? 'a token' : 'not a token'),
    fromHidden: () => 'you played me from face down',
    fromHand: () => 'you played me from your hand',
    myTurn: () => "it's your turn",
    beginningPhase: () => "it's the Beginning Phase",
    eventIsOpponents: () => 'an opponent did it',
    sourceAtBattlefield: () => "I'm at a battlefield",
    eventNth: v => 'it is the ' + (v === 2 ? 'second' : v === 3 ? 'third' : v + 'th') + ' this turn',
    canPayEnergy: v => 'you can pay ' + v + ' Energy',
    noBattlefield: v => RB.card(v).name + ' is not on the board',
    paid: () => 'you paid the additional cost',
    otherUnitsMightAtLeast: v => 'your other units have total Might ' + v + ' or more',
    enemyAloneHere: () => 'an enemy unit is alone here',
    eventWinnerIsMe: () => 'you won',
    selfHere: () => "I'm there",
  };
  // A test is looked up in this pack's table first, then in the CORE's shared condition
  // table (RB.defineCondition) — so `beginningPhase`, `myTurn`, `eventIsOpponents` and the
  // rest are the engine's single copy, not a second one living here. What this op adds
  // over the core's `when` is the conjunction and a describer that names every condition:
  // the core's prints only `test.kind`, which hides the other half of a compound clause.
  function testAll(s, test, ctx) {
    for (const k of Object.keys(test)) {
      const fn = TESTS[k];
      if (fn) { if (!fn(s, ctx, test[k])) return false; continue; }
      if (!RB.conditions[k]) throw new Error('unl cond: unknown test ' + k);
      const arg = test[k] === true ? k : Object.assign({ kind: k }, test[k]);
      if (!RB.testCondition(s, arg, ctx)) return false;
    }
    return true;
  }
  RB.defineOp('cond', (s, e, ctx) => {
    RB.runEffects(s, testAll(s, e.test, ctx) ? (e.effects || []) : (e.else || []), ctx);
  });
  RB.defineDescriber('cond', e => {
    const parts = Object.keys(e.test).map(k => (TEST_TEXT[k] ||
      (() => k.replace(/([A-Z])/g, ' $1').toLowerCase().trim()))(e.test[k]));
    const alt = join(e.else);
    return 'If ' + parts.join(' and ') + ', ' + lower(join(e.effects)) +
      (alt ? ' Otherwise, ' + lower(alt) : '');
  });

  // --- predict --------------------------------------------------------------
  // Predict X (rules §412): look at the top X, recycle any number, put the rest back on
  // top in any order. Every branch is legal, so the choice is made by a stated rule
  // rather than a prompt: recycle what you could not pay for right now.
  RB.defineOp('predict', (s, e, ctx) => {
    const P = s.players[ctx.p];
    const n = Math.min(n_(e), P.deck.length);
    if (!n) return;
    const look = P.deck.splice(0, n);
    const keep = [], recycle = [];
    for (const iid of look) {
      const c = RB.cardOf(s, iid);
      ((c.energy || 0) > P.runes.length ? recycle : keep).push(iid);
    }
    P.deck.unshift(...keep);
    P.deck.push(...recycle);        // recycle is to the BOTTOM, never a reshuffle
    RB.log(s, 'predict', { p: ctx.p, n: n, recycled: recycle.length });
  });
  RB.defineDescriber('predict', e => 'Predict ' + n_(e) + '.');

  // --- copyToken ------------------------------------------------------------
  // "Play a Reflection unit token … It becomes a copy of that unit." A copy carries the
  // copied card's printed characteristics, so the token is minted on THAT card id; it is
  // still a token (o.token), so it ceases to exist rather than going to a trash.
  RB.defineOp('copyToken', (s, e, ctx) => {
    const src = targets(s, e.target, ctx)[0];
    if (!src) return;
    for (let k = 0; k < n_(e); k++) {
      const iid = RB.mint(s, RB.obj(s, src).cardId, ctx.p);
      const o = RB.obj(s, iid);
      o.token = true;
      o.exhausted = !e.ready;
      o.enteredTurn = s.turn;
      // A copy takes printed characteristics, not statuses — a copy of a Temporary unit is
      // not itself Temporary unless the card making it says so.
      if (e.temporary) o.temporary = true;
      if (e.to === 'here' && ctx.event && ctx.event.bf !== undefined) {
        s.bf[ctx.event.bf].units.push(iid);
        RB.applyContested(s, ctx.event.bf, ctx.p);
      } else s.players[ctx.p].base.push(iid);
      RB.log(s, 'token', { p: ctx.p, iid: iid, card: o.cardId }, 'unit.deploy');
      RB.runTriggers(s, 'unitPlayed', { p: ctx.p, iid: iid });
    }
  });
  RB.defineDescriber('copyToken', e => {
    const many = n_(e) > 1 ? (n_(e) === 2 ? 'two ' : n_(e) + ' ') : '';
    const of = selText(e.target);
    const where = e.to === 'here' ? (/ there$/.test(of) ? '' : ' there') : ' to your base';
    return 'Play ' + (many ? many + (e.ready ? 'ready ' : 'exhausted ') + 'token copies of '
      : 'a' + (e.ready ? ' ready' : 'n exhausted') + ' token copy of ') + of +
      where + (e.temporary ? ', with Temporary' : '') + '.';
  });

  // --- keywordToken ---------------------------------------------------------
  // The core token op makes one token and grants nothing; this makes N of them and hands
  // each the keywords the creating card prints on them.
  RB.defineOp('keywordToken', (s, e, ctx) => {
    for (let i = 0; i < n_(e); i++) {
      const iid = RB.mint(s, e.cardId, ctx.p);
      const o = RB.obj(s, iid);
      o.token = true;
      o.exhausted = !e.ready;
      o.enteredTurn = s.turn;
      // A token's SIZE is what it is, not a this-turn effect, so the override rides
      // permBuffs — `buffs` expires in the Ending Cleanup and would shrink it.
      if (e.might != null) o.permBuffs = e.might - (RB.card(e.cardId).might || 0);
      if (e.temporary) o.temporary = true;
      // NOTE: o.granted is the this-turn channel and is cleared in the Ending Cleanup, so
      // a keyword printed ON the token ("Bird tokens with [Deflect]") lasts the turn it is
      // made. There is no permanent granted-keyword channel to write instead; flagged.
      for (const k of e.keywords || []) o.granted.push(k);
      if (e.to === 'here' && ctx.event && ctx.event.bf !== undefined) {
        s.bf[ctx.event.bf].units.push(iid);
        RB.applyContested(s, ctx.event.bf, ctx.p);
      } else s.players[ctx.p].base.push(iid);
      RB.log(s, 'token', { p: ctx.p, iid: iid, card: e.cardId }, 'unit.deploy');
      // "Play a token" is playing it, so a unit token raises unitPlayed — which is what a
      // card like Lillia ("when you play a token unit") reads. NOTE: the core `token` op
      // does not raise it, so tokens made by other packs do not reach those triggers.
      if (RB.card(e.cardId).type === 'Unit') RB.runTriggers(s, 'unitPlayed', { p: ctx.p, iid: iid });
    }
  });
  const COUNT = ['no', 'a', 'two', 'three', 'four', 'five', 'six'];
  RB.defineDescriber('keywordToken', e => {
    const c = RB.card(e.cardId);
    const k = n_(e);
    const might = e.might != null ? e.might : c.might;
    // A token's READINESS is printed on several cards that make one ("play a Gold gear
    // token exhausted"), and the handler decides it either way — o.exhausted = !e.ready —
    // so the describer names both states rather than only the one it was asked for. The
    // article follows the word it precedes: "an exhausted", "a ready".
    const many = k === 1 ? (e.ready ? 'a ready ' : 'an exhausted ')
      : (COUNT[k] || k) + ' ' + (e.ready ? 'ready ' : 'exhausted ');
    return 'Play ' + many +
      (might != null ? might + ' Might ' : '') + c.name + ' ' +
      c.type.toLowerCase() + ' token' + (k === 1 ? '' : 's') +
      ((e.keywords || []).length ? ' with ' + e.keywords.join(' and ') : '') +
      (e.temporary ? ' with Temporary' : '') +
      (e.to === 'here' ? ' there' : ' to your base') + '.';
  });

  // --- counterToHand --------------------------------------------------------
  // "Counter a spell. Return it to its owner's hand instead of putting it in their trash."
  // Only a SPELL on the chain qualifies, so an ability on the chain is left alone.
  RB.defineOp('counterToHand', (s, e, ctx) => {
    const item = s.chain[s.chain.length - 1];
    if (!item || item.kind !== 'card') return;
    if (RB.cardOf(s, item.iid).type !== 'Spell') return;
    s.chain.pop();
    s.players[item.controller].hand.push(item.iid);
    RB.log(s, 'counter', { p: ctx.p, iid: item.iid }, 'chain.resolve');
  });
  RB.defineDescriber('counterToHand', () =>
    "Counter a spell. Return it to its owner's hand instead of putting it in their trash.");

  // --- stunOrReturn ---------------------------------------------------------
  // "Stun it. If it's already stunned, return it to its owner's hand instead." Stun is a
  // binary status, NOT an exhaustion: RB.combatMightOf is the one place that reads it, the
  // unit still needs its full Might in damage to die, and it cannot be stunned twice —
  // which is exactly the branch this card prints.
  RB.defineOp('stunOrReturn', (s, e, ctx) => {
    const iid = targets(s, e.target, ctx)[0];
    if (!iid) return;
    const o = RB.obj(s, iid);
    if (o.stunned) { toHand(s, iid); return; }
    o.stunned = true;               // a status, not an exhaustion — see js/combat.js
    RB.log(s, 'stun', { iid: iid }, 'ui.invalid');
  });
  RB.defineDescriber('stunOrReturn', e => 'Stun ' + selText(e.target) +
    ". If it's already stunned, return it to its owner's hand instead.");

  // --- spendXP --------------------------------------------------------------
  // (This pack's old `payEnergy` is gone; the core's `payCost` does it properly, through
  // the payment solver, so a rune can be exhausted for it rather than only the pool.)
  RB.defineOp('spendXP', (s, e, ctx) => {
    const P = s.players[ctx.p];
    P.xp = Math.max(0, (P.xp || 0) - n_(e));
    RB.log(s, 'xp', { p: ctx.p, xp: P.xp });
  });
  RB.defineDescriber('spendXP', e => 'Spend ' + n_(e) + ' XP.');

  // --- discardByType --------------------------------------------------------
  // "Discard 1. Then, do the following based on the discarded card's type." The core
  // discard op reports nothing back, so the branch needs its own handler. Which card is
  // discarded follows the core op's own rule — the last card in hand, which after a draw
  // is the card just drawn.
  RB.defineOp('discardByType', (s, e, ctx) => {
    const P = s.players[ctx.p];
    if (!P.hand.length) return;
    const iid = P.hand.pop();
    P.trash.push(iid);
    const type = RB.cardOf(s, iid).type;
    RB.log(s, 'discard', { p: ctx.p, iid: iid, type: type });
    const branch = type === 'Spell' ? e.spell : type === 'Gear' ? e.gear : type === 'Unit' ? e.unit : null;
    RB.runEffects(s, branch || [], ctx);
  });
  RB.defineDescriber('discardByType', e => 'Discard 1. Then, based on its type: Spell — ' +
    lower(join(e.spell)) + ' Gear — ' + lower(join(e.gear)) + ' Unit — ' + lower(join(e.unit)));

  // --- debuff ---------------------------------------------------------------
  // "-N Might this turn". The engine clears o.buffs in its Ending Phase, which is what
  // makes the duration right without a timer.
  RB.defineOp('debuff', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) RB.obj(s, iid).buffs -= n_(e);
  });
  RB.defineDescriber('debuff', e => 'Give ' + selText(e.target) + ' -' + n_(e) + ' Might this turn.');

  // --- sacrifice ------------------------------------------------------------
  // Kill via this file's chooser so a self-directed kill can take the SMALLEST candidate;
  // the core kill op routes through RB.autoPick, which always takes the biggest.
  RB.defineOp('sacrifice', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) RB.kill(s, iid);
  });
  RB.defineDescriber('sacrifice', e => 'Kill ' + selText(e.target) + '.');

  // --- moveUnit -------------------------------------------------------------
  // An effect-driven move: it is a Move (move triggers fire) but it is not the Standard
  // Move, so it costs no exhaustion. `to:'here'` is the battlefield bound by the context.
  RB.defineOp('moveUnit', (s, e, ctx) => {
    const dest = e.to === 'base' ? 'base'
      : (ctx.event && ctx.event.bf !== undefined ? ctx.event.bf : null);
    if (dest === null) return;
    for (const iid of targets(s, e.target, ctx)) {
      const o = RB.obj(s, iid);
      const from = RB.locationOf(s, iid);
      if (dest !== 'base' && from.kind === 'bf' && from.bf === dest) continue;
      if (dest === 'base' && from.kind === 'base') continue;
      if (!pluck(s, iid)) continue;
      if (dest === 'base') s.players[o.controller].base.push(iid);
      else {
        s.bf[dest].units.push(iid);
        o.movedThisTurn++;
        RB.applyContested(s, dest, o.controller);
      }
      RB.log(s, 'move', { p: o.controller, iid: iid, to: dest === 'base' ? 'base' : 'bf' + dest }, 'unit.move');
      RB.runTriggers(s, 'moved', { p: o.controller, iid: iid,
        bf: dest === 'base' ? undefined : dest,
        fromBf: from.kind === 'bf' ? from.bf : undefined });
    }
  });
  RB.defineDescriber('moveUnit', e => 'Move ' + selText(e.target) +
    (e.to === 'base' ? ' to its base' : ' there') + '.');

  // --- battlefield binding --------------------------------------------------
  // `here` in a selector reads ctx.event.bf. These three ops are the only way to put a
  // battlefield there when the triggering event did not carry one.
  function withBf(ctx, bf) {
    return { p: ctx.p, source: ctx.source, targets: ctx.targets,
      event: Object.assign({}, ctx.event || {}, { bf: bf }) };
  }
  RB.defineOp('atBf', (s, e, ctx) => RB.runEffects(s, e.effects || [], withBf(ctx, e.bf)));
  RB.defineDescriber('atBf', e => join(e.effects));

  // "Here", for a source that knows where it is but whose trigger did not say. A
  // battlefield's own triggers fire with no location at all; a unit's play trigger fires
  // before any event carries one. Both answer the same question.
  function myBattlefield(s, iid) {
    const i = s.bf.findIndex(b => b.iid === iid);
    if (i >= 0) return i;
    const loc = RB.locationOf(s, iid);
    return loc.kind === 'bf' ? loc.bf : -1;
  }
  RB.defineOp('atThisBattlefield', (s, e, ctx) => {
    const i = myBattlefield(s, ctx.source);
    // `orBase`: a card that says "here" while standing in a base still means somewhere.
    // With no battlefield the effects run on the unchanged context, where `to:'here'`
    // falls back to the base — the right reading for a unit played to one.
    if (i < 0) { if (e.orBase) RB.runEffects(s, e.effects || [], ctx); return; }
    RB.runEffects(s, e.effects || [], withBf(ctx, i));
  });
  RB.defineDescriber('atThisBattlefield', e => join(e.effects));

  // "Choose a battlefield [where you have units / where an enemy unit is]." A real choice
  // when more than one qualifies, and no prompt at all when there is nothing to decide.
  const BF_WHERE = {
    mine: (s, i, p) => RB.unitsAt(s, i, p).length > 0,
    enemy: (s, i, p) => RB.unitsAt(s, i, RB.opponentOf(p)).length > 0,
    any: () => true,
  };
  RB.defineOp('chooseBattlefield', (s, e, ctx) => {
    const ok = BF_WHERE[e.where || 'mine'];
    const opts = s.bf.map((b, i) => i).filter(i => ok(s, i, ctx.p));
    if (!opts.length) return;
    if (opts.length === 1) { RB.runEffects(s, e.effects || [], withBf(ctx, opts[0])); return; }
    s.queue.push({
      kind: 'choose', who: ctx.p, source: ctx.source,
      options: opts.map(i => RB.card(s.bf[i].cardId).name),
      ctx: { p: ctx.p, source: ctx.source, event: ctx.event, targets: ctx.targets },
      onAnswer: opts.map(i => [{ op: 'atBf', bf: i, effects: e.effects || [] }]),
    });
  });
  const BF_WHERE_TEXT = { mine: 'where you have units', enemy: 'where an enemy unit is', any: '' };
  RB.defineDescriber('chooseBattlefield', e =>
    ('Choose a battlefield ' + (BF_WHERE_TEXT[e.where || 'mine'] || '')).trim() + '. ' +
    join(e.effects));

  // --- firstEachTurn --------------------------------------------------------
  // "The first time … each turn". Tracked on the source's own object, per player, so a
  // battlefield answers the question separately for each side.
  RB.defineOp('firstEachTurn', (s, e, ctx) => {
    const o = RB.obj(s, ctx.source);
    const who = (e.per === 'me' || !ctx.event || ctx.event.p === undefined) ? ctx.p : ctx.event.p;
    const key = (e.key || 'once') + ':' + who;
    o.unlOnce = o.unlOnce || {};
    if (o.unlOnce[key] === s.turn) return;
    o.unlOnce[key] = s.turn;
    RB.runEffects(s, e.effects || [], ctx);
  });
  RB.defineDescriber('firstEachTurn', e => 'The first time each turn, ' + lower(join(e.effects)));

  // --- digUnit --------------------------------------------------------------
  // "Look at the top N of your Main Deck. [You may] reveal a unit from among them and draw
  // it. Recycle the rest." Both branches recycle, which is why the card asks with `choose`
  // rather than `may`.
  RB.defineOp('digUnit', (s, e, ctx) => {
    const P = s.players[ctx.p];
    const n = Math.min(n_(e), P.deck.length);
    if (!n) return;
    const look = P.deck.splice(0, n);
    let taken = null;
    if (e.take) {
      const units = look.filter(i => RB.cardOf(s, i).type === 'Unit');
      if (units.length) {
        units.sort((a, b) => (RB.cardOf(s, b).might || 0) - (RB.cardOf(s, a).might || 0));
        taken = units[0];
        P.hand.push(taken);
        RB.log(s, 'draw', { p: ctx.p, iid: taken }, 'card.draw');
      }
    }
    for (const iid of look) if (iid !== taken) P.deck.push(iid);
    RB.log(s, 'dig', { p: ctx.p, n: n, took: taken ? 1 : 0 });
  });
  RB.defineDescriber('digUnit', e => 'Look at the top ' + n_(e) + ' cards of your Main Deck. ' +
    (e.take ? 'Reveal a unit from among them and draw it. ' : '') + 'Recycle the rest.');

  // --- playFromHand ---------------------------------------------------------
  // "Play a unit from your hand to your base, ignoring its Energy cost." The Power cost is
  // still paid, so only a unit whose Power is payable is a legal choice.
  RB.defineOp('playFromHand', (s, e, ctx) => {
    const P = s.players[ctx.p];
    const want = e.type || 'Unit';
    const options = P.hand.filter(i => RB.cardOf(s, i).type === want);
    options.sort((a, b) => (RB.cardOf(s, b).might || 0) - (RB.cardOf(s, a).might || 0));
    for (const iid of options) {
      const c = RB.cardOf(s, iid);
      const doms = (c.domains && c.domains.length ? c.domains : [c.domain]).filter(d => d && d !== 'Colorless');
      const power = c.power || 0;
      const cost = { energy: e.ignoreEnergy ? 0 : (c.energy || 0), power: power,
        domains: doms, each: power > 0 && doms.length > 1 && power === doms.length };
      const plan = RB.planPayment(s, ctx.p, cost);
      if (!plan) continue;
      RB.pay(s, ctx.p, plan);
      RB.removeFrom(P.hand, iid);
      RB.log(s, 'play', { p: ctx.p, iid: iid, card: c.id, to: 'base' }, 'unit.deploy');
      RB.resolveCard(s, { iid: iid, controller: ctx.p, to: 'base', kind: 'card', targets: [] });
      return;
    }
  });
  RB.defineDescriber('playFromHand', e => 'Play a ' + (e.type || 'Unit').toLowerCase() +
    ' from your hand to your base' + (e.ignoreEnergy ? ', ignoring its Energy cost' : '') + '.');

  // --- revealTopSpell -------------------------------------------------------
  // "Reveal the top card of your Main Deck. If it's a spell, draw it." A reveal leaves the
  // card where it is (§Reveal), so a non-spell simply stays on top.
  RB.defineOp('revealTopSpell', (s, e, ctx) => {
    const P = s.players[ctx.p];
    if (!P.deck.length) return;
    const iid = P.deck[0];
    const isSpell = RB.cardOf(s, iid).type === 'Spell';
    RB.log(s, 'reveal', { p: ctx.p, iid: iid, drew: isSpell });
    if (!isSpell) return;
    P.deck.shift();
    P.hand.push(iid);
    RB.log(s, 'draw', { p: ctx.p, iid: iid }, 'card.draw');
  });
  RB.defineDescriber('revealTopSpell', () =>
    "Reveal the top card of your Main Deck. If it's a spell, draw it.");

  // --- counterIfChoseOnlyMine -----------------------------------------------
  // "Counter an enemy spell or ability that chooses it and no other friendly unit." The
  // core's counterIf/`onlyMineOne` also requires the item to have chosen NOTHING else,
  // which this card does not say — a spell that took one of mine and one of theirs is
  // still counterable here. The unit it chose must be at a battlefield, which is where the
  // printed card's own choice comes from.
  RB.defineOp('counterIfChoseOnlyMine', (s, e, ctx) => {
    const item = RB.chainTop(s);
    if (!item || item.controller === ctx.p) return;
    const mine = (item.targets || []).filter(i => s.objects[i] && RB.obj(s, i).controller === ctx.p);
    if (mine.length !== 1) return;
    if (RB.locationOf(s, mine[0]).kind !== 'bf') return;
    RB.ops.counter(s, {}, ctx);
  });
  RB.defineDescriber('counterIfChoseOnlyMine', () =>
    'Choose a friendly unit at a battlefield. Counter an enemy spell or ability that ' +
    'chooses it and no other friendly unit.');

  // --- damageEachLocation ---------------------------------------------------
  // "Choose up to one enemy unit at each location. Deal N to them." A location is every
  // battlefield plus the bases; taking none at a location is legal but never better, so
  // the one taken is simply the best target there.
  RB.defineOp('damageEachLocation', (s, e, ctx) => {
    const foe = RB.opponentOf(ctx.p);
    const spots = s.bf.map((b, i) => RB.unitsAt(s, i, foe)).concat([s.players[foe].base.slice()]);
    spots.forEach((here, ix) => {
      if (!here.length) return;
      const ordered = here.slice().sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
      // One choice per location, and each is a real one — so each goes through the door
      // under its own tag, or they would share an answer.
      const taken = RB.offerChoice(s, ordered, 1, ctx, 'eachLocation' + ix,
        'Choose an enemy unit to damage');
      // THE ONE DOOR: a direct write to obj.damage skips "prevent all spell and ability
      // damage this turn" and "spells deal 1 bonus damage here", and the card reading
      // either plays wrong without ever looking broken.
      for (const iid of taken) {
        const n = RB.dealDamage(s, iid, n_(e), ctx, 'effect');
        if (n) RB.log(s, 'damage', { iid: iid, n: n });
      }
    });
  });
  RB.defineDescriber('damageEachLocation', e =>
    'Choose up to one enemy unit at each location. Deal ' + n_(e) + ' to them.');

  // --- addBattlefieldAndEnter -----------------------------------------------
  // "Add the [X] battlefield token to the board if it's not there already. If you do, I
  // enter there." Both halves in one op because the second depends on the first.
  RB.defineOp('addBattlefieldAndEnter', (s, e, ctx) => {
    if (s.bf.some(b => b.cardId === e.cardId)) return;
    RB.ops.addBattlefield(s, { cardId: e.cardId }, ctx);
    const i = s.bf.length - 1;
    const o = RB.obj(s, ctx.source);
    if (!pluck(s, ctx.source)) return;
    s.bf[i].units.push(ctx.source);
    RB.applyContested(s, i, o.controller);
    RB.log(s, 'move', { p: o.controller, iid: ctx.source, to: 'bf' + i }, 'unit.move');
  });
  RB.defineDescriber('addBattlefieldAndEnter', e =>
    'Add the ' + RB.card(e.cardId).name + " battlefield token to the board if it's not " +
    'there already. If you do, I enter there.');

  // --- killFriendlyRecord + resurrectWithin ---------------------------------
  // "As an additional cost, kill a friendly unit" whose COST the payoff then reads. The
  // core's killFriendly does the gating correctly but keeps no record of what died, so
  // this kind is the same cost that also remembers the price.
  // A pack that defines its own `pays` kind supplies its own prose for it, or the auditor
  // reads back "nothing" where a real cost stands — which is exactly the clause a reader
  // would never think to check.
  if (RB.defineExtraCostText)
    RB.defineExtraCostText('killFriendlyRecord', () => 'kill a friendly unit');
  RB.defineExtraCost('killFriendlyRecord', {
    available: (s, p, iid) => candidates(s, p, iid).length > 0,
    pay: (s, p, iid) => {
      const c = candidates(s, p, iid);
      if (!c.length) return;
      const victim = c[0];
      const card = RB.cardOf(s, victim);
      RB.obj(s, iid).unlPaidCost = { energy: card.energy || 0, power: card.power || 0 };
      RB.kill(s, victim);
    },
  });
  function candidates(s, p, iid) {
    return RB.allUnits(s).filter(u => RB.obj(s, u).controller === p && u !== iid)
      .sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b));   // cheapest first
  }

  RB.defineOp('resurrectWithin', (s, e, ctx) => {
    const bound = RB.obj(s, ctx.source).unlPaidCost;
    if (!bound) return;
    const P = s.players[ctx.p];
    const pool = P.trash.filter(iid => {
      const c = RB.cardOf(s, iid);
      return c.type === 'Unit' && (c.energy || 0) <= bound.energy && (c.power || 0) <= bound.power;
    });
    if (!pool.length) return;
    pool.sort((a, b) => (RB.cardOf(s, b).energy || 0) - (RB.cardOf(s, a).energy || 0));
    const iid = pool[0];
    RB.removeFrom(P.trash, iid);
    RB.log(s, 'play', { p: ctx.p, iid: iid, card: RB.obj(s, iid).cardId, to: 'base' }, 'unit.deploy');
    RB.resolveCard(s, { iid: iid, controller: ctx.p, to: 'base', kind: 'card', targets: [] });
  });
  RB.defineDescriber('resurrectWithin', () =>
    'Play a unit from your trash that costs no more Energy and no more Power than the ' +
    'killed unit, ignoring its cost.');

  // --- revealHand -----------------------------------------------------------
  // "Choose an opponent. They reveal their hand." A reveal leaves every card in its zone
  // and grants no lasting visibility on its own, so this is the whole instruction: the
  // clause that DOES last ("look at their facedown cards this turn") is the core's
  // revealHidden, and the two are printed as separate sentences for that reason.
  RB.defineOp('revealHand', (s, e, ctx) => {
    const foe = RB.opponentOf(ctx.p);
    RB.log(s, 'reveal', { p: foe, to: ctx.p, n: s.players[foe].hand.length });
  });
  RB.defineDescriber('revealHand', () => 'Choose an opponent. They reveal their hand.');

  // --- banishFromHand + returnBanished --------------------------------------
  // Ashe: banish a card out of an opponent's revealed hand, and promise it back. The
  // promise outlives her, so which card it was is remembered on her own object — that
  // survives her leaving the board, because objects do.
  RB.defineOp('banishFromHand', (s, e, ctx) => {
    const foe = RB.opponentOf(ctx.p);
    const P = s.players[foe];
    if (!P.hand.length) return;
    RB.log(s, 'reveal', { p: foe, n: P.hand.length });
    const pick = P.hand.slice().sort((a, b) =>
      (RB.cardOf(s, b).energy || 0) - (RB.cardOf(s, a).energy || 0))[0];
    RB.removeFrom(P.hand, pick);
    P.banished.push(pick);
    RB.obj(s, ctx.source).unlBanished = pick;
    RB.log(s, 'banish', { p: foe, iid: pick });
  });
  RB.defineDescriber('banishFromHand', () =>
    'Choose an opponent. They reveal their hand. Choose a card revealed this way and banish it.');

  RB.defineOp('returnBanished', (s, e, ctx) => {
    const o = RB.obj(s, ctx.source);
    const iid = o.unlBanished;
    if (!iid) return;                       // already given back: the promise is spent
    const owner = RB.obj(s, iid).owner;
    if (!RB.removeFrom(s.players[owner].banished, iid)) { o.unlBanished = null; return; }
    s.players[owner].hand.push(iid);
    o.unlBanished = null;
    RB.log(s, 'returnToHand', { p: owner, iid: iid }, 'card.draw');
  });
  RB.defineDescriber('returnBanished', () => 'Return it to their hand.');

  // --- buffTo / grantTo -----------------------------------------------------
  // The mirror of `debuff`, and a keyword grant, both through this pack's chooser: the
  // core's buff and grant read RB.select, which cannot say "your OTHER units here" or
  // "prefer one of mine".
  RB.defineOp('buffTo', (s, e, ctx) => {
    const key = e.permanent ? 'permBuffs' : 'buffs';
    for (const iid of targets(s, e.target, ctx)) RB.obj(s, iid)[key] += n_(e);
  });
  RB.defineDescriber('buffTo', e => 'Give ' + selText(e.target) + ' +' + n_(e) + ' Might' +
    (e.permanent ? '.' : ' this turn.'));

  // --- placeBuffTo ----------------------------------------------------------
  // "[Buff] a unit." A Buff is ONE thing in the core — a counter that is both the +1 Might
  // and the resource a "spend a buff" cost spends — and `placeBuff` is where that rule
  // lives. This op does not re-implement it: it only orders the pool, because the core's
  // RB.select cannot say "any unit, but reach for one of mine first", and buffing whatever
  // happens to be biggest hands the Might to the opponent as often as not.
  //
  // The chosen unit is handed to the core op as its own `self`, the same way
  // counterSpellRestricting hands `restrict` a context whose player is the victim. The
  // pool stays exactly as printed — "a unit" is any unit — and only the ORDER is this
  // card's policy.
  RB.defineOp('placeBuffTo', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx))
      RB.ops.placeBuff(s, { target: 'self' }, Object.assign({}, ctx, { source: iid }));
  });
  RB.defineDescriber('placeBuffTo', e => 'Buff ' + selText(e.target) +
    ". (If it doesn't have a buff, it gets a +1 Might buff.)");

  RB.defineOp('grantTo', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) RB.obj(s, iid).granted.push(e.keyword);
  });
  RB.defineDescriber('grantTo', e =>
    'Give ' + selText(e.target) + ' ' + e.keyword + ' this turn.');

  // --- damageHereSplit ------------------------------------------------------
  // "Deal N to that unit and M to each other enemy unit there." One clause, one op,
  // because the two halves have to agree on which unit was chosen.
  RB.defineOp('damageHereSplit', (s, e, ctx) => {
    const chosen = targets(s, { pick: 'hereEnemy', prompt: e.prompt }, ctx)[0];
    if (!chosen) return;
    // Both halves go through the one door, so a prevention or a bonus-damage static sees
    // the splash exactly as it sees the main hit.
    const hit = RB.dealDamage(s, chosen, n_(e), ctx, 'effect');
    if (hit) RB.log(s, 'damage', { iid: chosen, n: hit });
    if (!e.others) return;
    for (const iid of base(s, 'hereEnemy', ctx)) {
      if (iid === chosen) continue;
      const n = RB.dealDamage(s, iid, e.others, ctx, 'effect');
      if (n) RB.log(s, 'damage', { iid: iid, n: n });
    }
  });
  RB.defineDescriber('damageHereSplit', e =>
    'Choose an enemy unit there. Deal ' + n_(e) + ' to that unit' +
    (e.others ? ' and ' + e.others + ' to each other enemy unit there' : '') + '.');

  // --- watching one unit ----------------------------------------------------
  // "Deal 3 to an enemy unit. WHEN IT DIES this turn, …" and "give a unit +3 this turn.
  // WHEN IT WINS a combat this turn, …". The promise has to remember WHICH unit, and a
  // delayed ability's data is the only place that travels with it.
  function watch(s, ctx, iid, on, kind, then) {
    s.delayed = s.delayed || [];
    s.delayed.push({ on: on, p: ctx.p, source: ctx.source, once: false,
      effects: [{ op: 'watchFire', kind: kind, then: then || [] }],
      data: { watch: iid, turn: s.turn } });
  }
  RB.defineOp('watchFire', (s, e, ctx) => {
    const d = ctx.delayed;
    if (!d || !d.watch || d.turn !== s.turn) return;      // the window was this turn only
    if (e.kind === 'died' && !(ctx.event && ctx.event.iid === d.watch)) return;
    if (e.kind === 'wonCombat') {
      if (!ctx.event || ctx.event.winner !== ctx.p) return;
      const loc = RB.locationOf(s, d.watch);
      if (loc.kind !== 'bf' || loc.bf !== ctx.event.bf) return;
    }
    d.watch = null;                                        // fires once
    RB.runEffects(s, e.then || [], ctx);
  });
  RB.defineDescriber('watchFire', e => join(e.then));

  RB.defineOp('damageWatch', (s, e, ctx) => {
    const iid = targets(s, e.target, ctx)[0];
    if (!iid) return;
    const n = RB.dealDamage(s, iid, n_(e), ctx, 'effect');   // the one door
    if (n) RB.log(s, 'damage', { iid: iid, n: n });
    // The promise is made whether or not the damage landed: "when it dies this turn" does
    // not depend on this card's damage being what kills it.
    watch(s, ctx, iid, 'died', 'died', e.then);
  });
  RB.defineDescriber('damageWatch', e => 'Deal ' + n_(e) + ' to ' + selText(e.target) +
    '. When it dies this turn, ' + lower(join(e.then)));

  RB.defineOp('buffWatchCombat', (s, e, ctx) => {
    const iid = targets(s, e.target, ctx)[0];
    if (!iid) return;
    RB.obj(s, iid).buffs += n_(e);
    watch(s, ctx, iid, 'combatEnd', 'wonCombat', e.then);
  });
  RB.defineDescriber('buffWatchCombat', e => 'Give ' + selText(e.target) + ' +' + n_(e) +
    ' Might this turn. When it wins a combat this turn, ' + lower(join(e.then)));

  // --- destinations ---------------------------------------------------------
  // Every location a unit could be moved to, as a choose step: each battlefield, then the
  // base. `then` runs after the move, inside the chosen battlefield's context.
  function destinationOptions(s) {
    return s.bf.map((b, i) => ({ label: 'To ' + RB.card(b.cardId).name, bf: i }))
      .concat([{ label: 'To its base', bf: null }]);
  }
  function askDestination(s, ctx, opts, effectsFor) {
    if (opts.length === 1) { RB.runEffects(s, effectsFor(opts[0]), ctx); return; }
    s.queue.push({
      kind: 'choose', who: ctx.p, source: ctx.source,
      options: opts.map(o => o.label),
      ctx: { p: ctx.p, source: ctx.source, event: ctx.event, targets: ctx.targets, paid: ctx.paid },
      onAnswer: opts.map(effectsFor),
    });
  }
  RB.defineOp('moveChoosingDestination', (s, e, ctx) => {
    if (!targets(s, e.target, ctx).length) { RB.runEffects(s, e.then || [], ctx); return; }
    askDestination(s, ctx, destinationOptions(s), o => o.bf === null
      ? [{ op: 'moveUnit', target: e.target, to: 'base' }].concat(e.then || [])
      : [{ op: 'atBf', bf: o.bf, effects: [{ op: 'moveUnit', target: e.target, to: 'here' }]
            .concat(e.then || []) }]);
  });
  RB.defineDescriber('moveChoosingDestination', e => 'Move ' + selText(e.target) +
    ' to a location of your choice.' + (e.then && e.then.length ? ' ' + join(e.then) : ''));

  // --- moveEnemyGroup -------------------------------------------------------
  // "Move any number of enemy units with the same controller and a total Might of N or
  // less to a single location." In a duel every enemy unit shares a controller, so the
  // decision left is the destination and how many fit under the cap.
  RB.defineOp('moveEnemyGroup', (s, e, ctx) => {
    const foe = RB.opponentOf(ctx.p);
    if (!RB.allUnits(s).some(i => RB.obj(s, i).controller === foe)) return;
    askDestination(s, ctx, destinationOptions(s),
      o => [{ op: 'gatherEnemies', maxMight: e.maxMight, bf: o.bf }]);
  });
  RB.defineDescriber('moveEnemyGroup', e =>
    'Move any number of enemy units with the same controller and a total Might of ' +
    e.maxMight + ' or less to a single location.');

  RB.defineOp('gatherEnemies', (s, e, ctx) => {
    const foe = RB.opponentOf(ctx.p);
    const dest = e.bf;
    const cand = RB.allUnits(s)
      .filter(i => RB.obj(s, i).controller === foe)
      .filter(i => {
        const l = RB.locationOf(s, i);
        return dest === null ? l.kind !== 'base' : !(l.kind === 'bf' && l.bf === dest);
      })
      // Smallest first: "any number" wants as many as the cap allows.
      .sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b));
    let total = 0;
    for (const iid of cand) {
      const m = RB.mightOf(s, iid);
      if (total + m > e.maxMight) continue;
      total += m;
      const o = RB.obj(s, iid);
      const from = RB.locationOf(s, iid);
      if (!pluck(s, iid)) continue;
      if (dest === null) s.players[o.controller].base.push(iid);
      else { s.bf[dest].units.push(iid); RB.applyContested(s, dest, o.controller); }
      RB.log(s, 'move', { p: o.controller, iid: iid, to: dest === null ? 'base' : 'bf' + dest }, 'unit.move');
      RB.runTriggers(s, 'moved', { p: o.controller, iid: iid,
        bf: dest === null ? undefined : dest, fromBf: from.kind === 'bf' ? from.bf : undefined });
    }
  });
  RB.defineDescriber('gatherEnemies', () => '');

  // --- swapMyUnits ----------------------------------------------------------
  // "Choose a unit you control and another unit you control at a different location. If at
  // least one has Temporary, move each to the other's location." A pair with no Temporary
  // member does nothing, so the Temporary one is what is chosen first.
  RB.defineOp('swapMyUnits', (s, e, ctx) => {
    const mine = RB.allUnits(s).filter(i => RB.obj(s, i).controller === ctx.p);
    const where = i => { const l = RB.locationOf(s, i); return l.kind === 'bf' ? 'bf' + l.bf : 'base'; };
    const temps = mine.filter(i => RB.obj(s, i).temporary)
      .sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    const a = RB.offerChoice(s, temps, 1, ctx, 'swapTemporary', 'Choose a unit with Temporary')[0];
    if (!a) return;
    const others = mine.filter(i => i !== a && where(i) !== where(a))
      .sort((x, y) => RB.mightOf(s, y) - RB.mightOf(s, x));
    const b = RB.offerChoice(s, others, 1, ctx, 'swapWith', 'Choose a unit at a different location')[0];
    if (!b) return;
    const la = RB.locationOf(s, a), lb = RB.locationOf(s, b);
    if (!pluck(s, a) || !pluck(s, b)) return;
    const place = (iid, loc) => {
      if (loc.kind === 'bf') { s.bf[loc.bf].units.push(iid); RB.applyContested(s, loc.bf, ctx.p); }
      else s.players[ctx.p].base.push(iid);
      RB.log(s, 'move', { p: ctx.p, iid: iid, to: loc.kind === 'bf' ? 'bf' + loc.bf : 'base' }, 'unit.move');
    };
    place(a, lb); place(b, la);
  });
  RB.defineDescriber('swapMyUnits', () =>
    'Choose a unit you control and another unit you control at a different location. ' +
    'If at least one of them has Temporary, move each to the other\'s location.');

  // --- eachPlayerKills ------------------------------------------------------
  // "Each player must kill one of their units." Mine is a choice and goes through the
  // door; theirs is THEIR choice, which this engine has no way to ask for, so it takes
  // their cheapest — the same rule the core's own killFriendly cost uses.
  RB.defineOp('eachPlayerKills', (s, e, ctx) => {
    for (let p = 0; p < 2; p++) {
      if (p === ctx.p && e.exceptIfPaid && (ctx.paid || []).includes(e.exceptIfPaid)) continue;
      const pool = RB.allUnits(s).filter(i => RB.obj(s, i).controller === p)
        .sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b));
      if (!pool.length) continue;
      const taken = p === ctx.p
        ? RB.offerChoice(s, pool, 1, ctx, 'sacrificeMine', 'Choose one of your units to kill')
        : [pool[0]];
      if (taken[0]) RB.kill(s, taken[0]);
    }
  });
  RB.defineDescriber('eachPlayerKills', e => 'Each player must kill one of their units.' +
    (e.exceptIfPaid ? " If you paid the additional cost, you don't kill a unit this way." : ''));

  // --- blinkUnit / landBanished ---------------------------------------------
  // "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its
  // cost." It is played again, so its play effects fire again — which is the card.
  RB.defineOp('blinkUnit', (s, e, ctx) => {
    const iid = targets(s, e.target, ctx)[0];
    if (!iid) return;
    const o = RB.obj(s, iid);
    if (!pluck(s, iid)) return;
    o.damage = 0; o.buffs = 0; o.permBuffs = 0; o.counters = 0; o.granted = [];
    o.stunned = false; o.cantMove = false; delete o.role;
    s.players[o.owner].banished.push(iid);
    RB.obj(s, ctx.source).unlBlink = iid;
    RB.log(s, 'banish', { p: o.owner, iid: iid });
    if (!s.bf.length) return;
    askDestination(s, ctx, s.bf.map((b, i) => ({ label: 'To ' + RB.card(b.cardId).name, bf: i })),
      o2 => [{ op: 'atBf', bf: o2.bf, effects: [{ op: 'landBanished' }] }]);
  });
  RB.defineDescriber('blinkUnit', e => 'Banish ' + selText(e.target) +
    ', then its owner plays it to any battlefield, ignoring its cost.');

  RB.defineOp('landBanished', (s, e, ctx) => {
    const src = RB.obj(s, ctx.source);
    const iid = src.unlBlink;
    if (!iid || ctx.event === undefined || ctx.event.bf === undefined) return;
    const owner = RB.obj(s, iid).owner;
    if (!RB.removeFrom(s.players[owner].banished, iid)) { src.unlBlink = null; return; }
    src.unlBlink = null;
    RB.log(s, 'play', { p: owner, iid: iid, card: RB.obj(s, iid).cardId, to: 'bf' + ctx.event.bf }, 'unit.deploy');
    RB.resolveCard(s, { iid: iid, controller: owner, to: 'bf' + ctx.event.bf, kind: 'card', targets: [] });
  });
  RB.defineDescriber('landBanished', () => '');

  // --- spendXP as an additional cost ----------------------------------------
  // The core has killFriendly / discard / spendBuff / recycleFromTrash; XP is this pack's.
  if (RB.defineExtraCostText)
    RB.defineExtraCostText('spendXP', x => 'spend ' + (x.n || 1) + ' XP');
  RB.defineExtraCost('spendXP', {
    available: (s, p, iid, x) => (s.players[p].xp || 0) >= (x.n || 1),
    pay: (s, p, iid, x) => {
      s.players[p].xp = Math.max(0, (s.players[p].xp || 0) - (x.n || 1));
      RB.log(s, 'xp', { p: p, xp: s.players[p].xp });
    },
  });

  // --- damageReplacingDeath -------------------------------------------------
  // "Deal N to a unit at a battlefield. If it would die this turn, banish it instead."
  // One op because the two halves have to land on the SAME unit: two clauses each going
  // through the door under their own tag would be two questions, and a Smite that damaged
  // one unit and protected another is not the printed card.
  //
  // The replacement is placed BEFORE the damage. Deaths are swept in the cleanup that
  // follows this resolution, so either order works today — but the card's promise is about
  // the unit, not about this damage, and placing it first keeps that true if the sweep
  // ever moves earlier.
  RB.defineOp('damageReplacingDeath', (s, e, ctx) => {
    const iid = targets(s, e.target, ctx)[0];
    if (!iid) return;
    const o = RB.obj(s, iid);
    o.replaces = o.replaces || [];        // minted null, and cleared in the Ending Cleanup
    o.replaces.push({ event: e.event || 'death', kind: e.kind, byP: ctx.p });
    RB.log(s, 'replaceOn', { iid: iid, kind: e.kind });
    const n = RB.dealDamage(s, iid, n_(e), ctx, 'effect');     // the one door
    if (n) RB.log(s, 'damage', { iid: iid, n: n });
  });
  const REPLACE_TEXT = { banishInstead: 'banish it instead' };
  RB.defineDescriber('damageReplacingDeath', e => 'Deal ' + n_(e) + ' to ' +
    selText(e.target) + '. If it would die this turn, ' +
    (REPLACE_TEXT[e.kind] || e.kind) + '.');

  // --- cantMoveToBase -------------------------------------------------------
  // "I can't move to base." A restriction on ONE destination, which is exactly what
  // o.noMoveToBase is: moveActions offers every other move and withholds only that one.
  // The flag is not swept by the Ending Cleanup (unlike o.cantMove), so a printed,
  // permanent restriction is written once — on the play that put the card on the board.
  // Every route into play resolves through RB.resolveCard, so every route runs it.
  RB.defineOp('cantMoveToBase', (s, e, ctx) => {
    for (const iid of targets(s, e.target || 'self', ctx)) {
      RB.obj(s, iid).noMoveToBase = true;
      RB.log(s, 'noMoveToBase', { iid: iid, p: RB.obj(s, iid).controller });
    }
  });
  // "It", not "I": cardText lower-cases the first letter of a trigger's clause, and the
  // core's own `cantMove` describer names a self target the same way for the same reason.
  RB.defineDescriber('cantMoveToBase', e => (e.target
    ? selText(e.target).replace(/^./, c => c.toUpperCase()) : 'It') + " can't move to base.");

  // --- the named tag --------------------------------------------------------
  // "As you play this, name a tag … [T]: Give a unit with the named tag -2 Might."
  // The core's `nameTag` computes the option list from every tag printed in the game and
  // hands the answer down as ctx.namedTag; it lives for that one resolution, so a card
  // whose ability reads the tag for the rest of the game has to keep it. It is kept on
  // the naming card's own object, which is where it belongs — two copies of The List name
  // two different tags.
  RB.defineOp('rememberNamedTag', (s, e, ctx) => {
    RB.obj(s, ctx.source).unlNamedTag = ctx.namedTag || null;
    RB.log(s, 'nameTag', { p: ctx.p, iid: ctx.source, tag: ctx.namedTag || null });
  });
  RB.defineDescriber('rememberNamedTag', () => 'Remember it.');

  RB.defineOp('debuffNamedTag', (s, e, ctx) => {
    const tag = RB.obj(s, ctx.source).unlNamedTag;
    if (!tag) return;                    // nothing was named: the ability has no subject
    // "A unit" is any unit, mine included; the pool is built as printed and only the ORDER
    // says which one a card that harms what it chooses should reach for first.
    for (const iid of targets(s, { pick: 'allUnits', tag: tag, prefer: 'enemy',
      prompt: 'Choose a unit with the named tag' }, ctx))
      RB.obj(s, iid).buffs -= n_(e);
  });
  RB.defineDescriber('debuffNamedTag', e =>
    'Give a unit with the named tag -' + n_(e) + ' Might this turn.');

  // --- counterSpellRestricting ----------------------------------------------
  // "Counter a spell. Its controller can't play spells this turn." ITS controller, not
  // the opponent: countering your own spell in response to something is legal, and
  // `restrict` with opponent:true would then gag the wrong player. The core op does the
  // restricting — it is handed a context whose player IS the victim, so there is still
  // exactly one place that writes s.restrictions.
  RB.defineOp('counterSpellRestricting', (s, e, ctx) => {
    const item = RB.chainTop(s);
    if (!item || item.kind !== 'card') return;          // an ability is not a spell
    if (RB.cardOf(s, item.iid).type !== 'Spell') return;
    const victim = item.controller;
    RB.ops.counter(s, {}, ctx);
    RB.runEffects(s, [{ op: 'restrict', what: 'play', type: e.type || 'Spell' }],
      Object.assign({}, ctx, { p: victim }));
  });
  RB.defineDescriber('counterSpellRestricting', e => 'Counter a spell. Its controller ' +
    "can't play " + (e.type || 'Spell').toLowerCase() + 's this turn.');

  // --- defenderKillsHere ----------------------------------------------------
  // "When I attack, the defender must kill one of their units here." Which of their units
  // is THEIR choice, and this engine can only ask the one seat that is resolving — the
  // same wall `eachPlayerKills` meets. It takes their cheapest, which is what they would
  // pick, and is never a choice of mine: nothing is chosen, so no Deflect is tolled and
  // no `chosen` trigger fires.
  RB.defineOp('defenderKillsHere', (s, e, ctx) => {
    const bf = ctx.event && ctx.event.bf;
    if (bf === undefined || bf === null) return;
    const pool = RB.unitsAt(s, bf, RB.opponentOf(ctx.p))
      .slice().sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b));
    if (!pool.length) return;
    RB.kill(s, pool[0]);
  });
  RB.defineDescriber('defenderKillsHere', () =>
    'The defender must kill one of their units here.');

  // --- a discount computed from what the additional cost killed -------------
  // "You may kill a friendly unit as an additional cost to play me. If you do, I cost [1]
  // less for each Energy it costs and [Y] less for each Power it costs."
  //
  // A cost modifier now sees the chosen additional costs, so the discount has somewhere to
  // live. The catch is that it runs BEFORE the cost is paid, so it cannot read what died —
  // it has to name the same victim the payment will. It asks the pool the core's
  // `killFriendly` asks, in the same order (every unit this player controls but the card
  // being played, cheapest Might first), so the two cannot disagree.
  //
  // It touches only a cost that opted in with `discountsByKilled`, so no other card in any
  // pack changes price.
  function wouldKill(s, p, iid, x) {
    return RB.allUnits(s)
      .filter(u => RB.obj(s, u).controller === p && u !== iid)
      .filter(u => (!x.mighty || RB.isMighty(s, u)) &&
        (!x.tag || (RB.card(RB.obj(s, u).cardId).tags || []).includes(x.tag)))
      .sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b))[0] || null;
  }
  RB.unlWouldKill = wouldKill;           // the check harness reads this
  // The clause belongs to the COST, not to the card — "if you do, I cost [1] less for each
  // Energy it costs" is only true of a play that chose this cost — so it renders through
  // the note hook rather than as a card-level cost modifier. `ab.costModifier` would have
  // been the wrong home twice over: another pack's modifier applies that field, so writing
  // it would have produced a real discount on top of this one.
  if (RB.defineExtraCostNote)
    RB.defineExtraCostNote('discountsByKilled', () => 'if you do, I cost 1 Energy less ' +
      'for each Energy it costs and 1 Power less for each Power it costs');
  RB.defineCostModifier((s, p, iid, cost, extras) => {
    for (const x of extras || []) {
      if (!x.discountsByKilled) continue;
      const victim = wouldKill(s, p, iid, x);
      if (!victim) continue;
      const c = RB.cardOf(s, victim);
      cost.energy -= c.energy || 0;
      cost.power -= c.power || 0;        // RB.totalCost clamps both at zero
    }
  });

  // --- conditions this pack adds to the core's table ------------------------
  // Registered, not wrapped. Both take the affected card and the static's SOURCE, which is
  // what lets one card say something about units that are not its own.
  RB.defineStaticWhen('enemyOfSource', (state, iid, w, src) =>
    RB.obj(state, iid).controller !== RB.obj(state, src).controller);
  RB.defineStaticWhen('weakerEnemyThanSource', (state, iid, w, src) =>
    RB.obj(state, iid).controller !== RB.obj(state, src).controller &&
    RB.mightOf(state, iid) < RB.mightOf(state, src));
  RB.defineStaticWhen('isToken', (state, iid) => !!RB.obj(state, iid).token);
  RB.defineStaticWhen('isTemporary', (state, iid) => !!RB.obj(state, iid).temporary);
  // "+1 Might for each of your units with Temporary at my battlefield." Reads no Might, so
  // it cannot recurse through the statics guard — and it names what it counts, because a
  // computed amount the auditor reads back as its own key is a clause nobody can check.
  // Add a hook, add its twin: defineStaticAmount is to defineStaticAmountText as
  // defineStaticWhen is to defineWhenText.
  if (RB.defineStaticAmountText)
    RB.defineStaticAmountText('temporaryUnitsHere',
      () => 'your units with Temporary at my battlefield');
  RB.defineStaticAmount('temporaryUnitsHere', (state, iid) => {
    const o = RB.obj(state, iid);
    const loc = RB.locationOf(state, iid);
    if (loc.kind !== 'bf') return 0;
    return state.bf[loc.bf].units
      .filter(i => RB.obj(state, i).controller === o.controller && RB.obj(state, i).temporary).length;
  });
  // "This ability costs [1] less for each friendly unit with [Temporary]." RB.abilityCost
  // is the one place an activated ability's cost is computed, and this is a modifier on
  // it — registered, not wrapped. It touches only an ability that opted in by carrying
  // `cheaperPerFriendlyTemporary`, so no other ability in any pack changes price, and
  // RB.abilityCost clamps at nothing so the discount never goes past free.
  RB.defineAbilityCostModifier((s, p, iid, ab, cost) => {
    const per = ab.cheaperPerFriendlyTemporary;
    if (!per) return;
    cost.energy -= per * RB.allUnits(s)
      .filter(i => RB.obj(s, i).controller === p && RB.obj(s, i).temporary).length;
  });
  // …and the prose for it, against the same flag. The discount is a clause of the ABILITY
  // — "this ability costs [1] less" — so it renders beside the ability's cost rather than
  // as a card-level one, and the auditor reads the whole printed line instead of half of it.
  if (RB.defineAbilityCostNote)
    RB.defineAbilityCostNote('cheaperPerFriendlyTemporary', a => 'costs ' +
      a.cheaperPerFriendlyTemporary + ' Energy less for each friendly unit with Temporary');

  // …and the prose for each, so the auditor names the condition instead of reading back a
  // camelCase identifier. A condition nobody can read is a clause nobody can check.
  if (RB.defineWhenText) {
    RB.defineWhenText('enemyOfSource', () => 'for enemy units');
    RB.defineWhenText('weakerEnemyThanSource', () => 'for enemy units with less Might than me');
    RB.defineWhenText('isToken', () => 'while they are tokens');
    RB.defineWhenText('isTemporary', () => 'while they have Temporary');
  }

})(window.RB = window.RB || {});
