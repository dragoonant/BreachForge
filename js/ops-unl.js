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
// and only varies which legal member of it is taken (`low`, `prefer`), so no card here
// chooses outside what its text allows.
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
  //                notTemporary:true, notEventUnit:true, filter:'damaged', maxMight:N,
  //                low:true (take the smallest), prefer:'enemy'|'mine' }
  function targets(s, spec, ctx) {
    if (!spec || typeof spec === 'string') return base(s, spec, ctx);
    let pool = base(s, spec.pick, ctx);
    if (spec.at === 'battlefield') pool = pool.filter(i => RB.locationOf(s, i).kind === 'bf');
    if (spec.at === 'base') pool = pool.filter(i => RB.locationOf(s, i).kind === 'base');
    if (spec.role) pool = pool.filter(i => RB.obj(s, i).role === spec.role);
    if (spec.notTemporary) pool = pool.filter(i => !RB.obj(s, i).temporary);
    if (spec.notEventUnit && ctx.event) pool = pool.filter(i => i !== ctx.event.iid);
    if (spec.notHere && ctx.event && ctx.event.bf !== undefined)
      pool = pool.filter(i => RB.locationOf(s, i).bf !== ctx.event.bf);
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
    return pool.slice(0, spec.n || 1);
  }
  RB.unlTargets = targets;      // the check harness reads this

  const NAMES = {
    self: 'me', eventUnit: 'that unit', myUnits: 'a friendly unit', enemyUnits: 'an enemy unit',
    allUnits: 'a unit', hereMine: 'a friendly unit there', hereEnemy: 'enemy units there',
    here: 'a unit there', gear: 'a gear',
  };
  function selText(spec) {
    if (!spec) return 'me';
    if (typeof spec === 'string') return NAMES[spec] || spec;
    let t = NAMES[spec.pick] || String(spec.pick);
    if (spec.role) t = 'an ' + (spec.role === 'attacker' ? 'attacking' : 'defending') + ' ' +
      t.replace(/^an? /, '');
    if (spec.notTemporary) t += " that isn't Temporary";
    if (spec.notEventUnit) t = 'another ' + t.replace(/^an? /, '');
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
    o.damage = 0; o.buffs = 0; o.permBuffs = 0; o.granted = []; o.exhausted = false;
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
    const iid = RB.mint(s, RB.obj(s, src).cardId, ctx.p);
    const o = RB.obj(s, iid);
    o.token = true;
    o.exhausted = !e.ready;
    o.enteredTurn = s.turn;
    if (e.temporary) o.temporary = true;
    if (e.to === 'here' && ctx.event && ctx.event.bf !== undefined) {
      s.bf[ctx.event.bf].units.push(iid);
      RB.applyContested(s, ctx.event.bf, ctx.p);
    } else s.players[ctx.p].base.push(iid);
    RB.log(s, 'token', { p: ctx.p, iid: iid, card: o.cardId }, 'unit.deploy');
  });
  RB.defineDescriber('copyToken', e => {
    const of = selText(e.target);
    const where = e.to === 'here' ? (/ there$/.test(of) ? '' : ' there') : ' to your base';
    return 'Play a' + (e.ready ? ' ready' : 'n exhausted') + ' token copy of ' + of +
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
    }
  });
  const COUNT = ['no', 'a', 'two', 'three', 'four', 'five', 'six'];
  RB.defineDescriber('keywordToken', e => {
    const c = RB.card(e.cardId);
    const k = n_(e);
    return 'Play ' + (COUNT[k] || k) + ' ' + (e.ready ? 'ready ' : '') +
      (e.might != null ? e.might : c.might) + ' Might ' + c.name +
      ' unit token' + (k === 1 ? '' : 's') +
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
    if (i < 0) return;
    RB.runEffects(s, e.effects || [], withBf(ctx, i));
  });
  RB.defineDescriber('atThisBattlefield', e => join(e.effects));

  // "Choose a battlefield where you have units." A real choice when more than one
  // qualifies, and no prompt at all when there is nothing to decide.
  RB.defineOp('chooseMyBattlefield', (s, e, ctx) => {
    const opts = s.bf.map((b, i) => i).filter(i => RB.unitsAt(s, i, ctx.p).length);
    if (!opts.length) return;
    if (opts.length === 1) { RB.runEffects(s, e.effects || [], withBf(ctx, opts[0])); return; }
    s.queue.push({
      kind: 'choose', who: ctx.p, source: ctx.source,
      options: opts.map(i => RB.card(s.bf[i].cardId).name),
      ctx: { p: ctx.p, source: ctx.source, event: ctx.event, targets: ctx.targets },
      onAnswer: opts.map(i => [{ op: 'atBf', bf: i, effects: e.effects || [] }]),
    });
  });
  RB.defineDescriber('chooseMyBattlefield', e =>
    'Choose a battlefield where you have units. ' + join(e.effects));

  // --- firstEachTurn --------------------------------------------------------
  // "The first time … each turn". Tracked on the source's own object, per player, so a
  // battlefield answers the question separately for each side.
  RB.defineOp('firstEachTurn', (s, e, ctx) => {
    const o = RB.obj(s, ctx.source);
    const who = (ctx.event && ctx.event.p !== undefined) ? ctx.event.p : ctx.p;
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
    for (const here of spots) {
      if (!here.length) continue;
      const best = here.slice().sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a))[0];
      RB.obj(s, best).damage += n_(e);
      RB.log(s, 'damage', { iid: best, n: n_(e) });
    }
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

  // --- conditions this pack adds to the core's table ------------------------
  // Registered, not wrapped. Both take the affected card and the static's SOURCE, which is
  // what lets one card say something about units that are not its own.
  RB.defineStaticWhen('enemyOfSource', (state, iid, w, src) =>
    RB.obj(state, iid).controller !== RB.obj(state, src).controller);
  RB.defineStaticWhen('weakerEnemyThanSource', (state, iid, w, src) =>
    RB.obj(state, iid).controller !== RB.obj(state, src).controller &&
    RB.mightOf(state, iid) < RB.mightOf(state, src));

})(window.RB = window.RB || {});
