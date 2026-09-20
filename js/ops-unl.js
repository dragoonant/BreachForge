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
//  * RB.staticsOn is wrapped ADDITIVELY, only to honour a `when:` key. A static with no
//    `when` is passed through untouched, so the other packs' statics are unaffected.
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
    o.damage = 0; o.buffs = 0; o.granted = []; o.exhausted = false;
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
  };
  function testAll(s, test, ctx) {
    for (const k of Object.keys(test)) {
      const fn = TESTS[k];
      if (!fn) throw new Error('unl cond: unknown test ' + k);
      if (!fn(s, ctx, test[k])) return false;
    }
    return true;
  }
  RB.defineOp('cond', (s, e, ctx) => {
    RB.runEffects(s, testAll(s, e.test, ctx) ? (e.effects || []) : (e.else || []), ctx);
  });
  RB.defineDescriber('cond', e => {
    const parts = Object.keys(e.test).map(k => (TEST_TEXT[k] || (v => k + ' ' + v))(e.test[k]));
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
    P.deck.push(...recycle);
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
      if (e.might != null) o.buffs = e.might - (RB.card(e.cardId).might || 0);
      if (e.temporary) o.temporary = true;
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
  RB.defineOp('stunOrReturn', (s, e, ctx) => {
    const iid = targets(s, e.target, ctx)[0];
    if (!iid) return;
    const o = RB.obj(s, iid);
    if (o.stunned) { toHand(s, iid); return; }
    o.exhausted = true; o.stunned = true;
    RB.log(s, 'stun', { iid: iid }, 'ui.invalid');
  });
  RB.defineDescriber('stunOrReturn', e => 'Stun ' + selText(e.target) +
    ". If it's already stunned, return it to its owner's hand instead.");

  // --- payEnergy / spendXP --------------------------------------------------
  RB.defineOp('payEnergy', (s, e, ctx) => {
    s.players[ctx.p].pool.energy = Math.max(0, s.players[ctx.p].pool.energy - n_(e));
  });
  RB.defineDescriber('payEnergy', e => 'Pay ' + n_(e) + ' Energy.');

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

  // The battlefield card's own index — a battlefield's triggers fire with no location.
  RB.defineOp('atThisBattlefield', (s, e, ctx) => {
    const i = s.bf.findIndex(b => b.iid === ctx.source);
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

  // --- conditional statics --------------------------------------------------
  // RB.staticsOn is wrapped, not replaced: a static with no `when` passes straight
  // through, so the other packs' continuous modifiers are untouched. The guard mirrors the
  // core's own reentrancy guard — a predicate that asks about might sees no statics.
  const STATIC_WHEN = {
    // "While a unit here is defending alone" — it is the only unit its controller has here.
    defendingAlone: (s, iid) => {
      const o = RB.obj(s, iid);
      if (o.role !== 'defender') return false;
      const loc = RB.locationOf(s, iid);
      if (loc.kind !== 'bf') return false;
      return RB.unitsAt(s, loc.bf, o.controller).length === 1;
    },
    // "While you have N or more XP" — read against the affected card's controller.
    xpAtLeast: (s, iid, v) => (s.players[RB.obj(s, iid).controller].xp || 0) >= v,
  };
  let whenDepth = 0;
  const baseStaticsOn = RB.staticsOn;
  RB.staticsOn = function (state, iid) {
    const all = baseStaticsOn(state, iid);
    if (!all.some(st => st.when)) return all;
    if (whenDepth > 0) return all.filter(st => !st.when);
    whenDepth++;
    try {
      return all.filter(st => {
        if (!st.when) return true;
        const key = typeof st.when === 'string' ? st.when : Object.keys(st.when)[0];
        const val = typeof st.when === 'string' ? true : st.when[key];
        const fn = STATIC_WHEN[key];
        if (!fn) throw new Error('unl static: unknown when ' + key);
        return fn(state, iid, val);
      });
    } finally { whenDepth--; }
  };
  RB.unlStaticWhen = STATIC_WHEN;   // the check harness reads this

})(window.RB = window.RB || {});
