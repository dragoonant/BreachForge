// Ops added for the Unleashed set. Everything here is wired through RB.defineOp /
// RB.defineDescriber so js/abilities.js and js/text.js never need editing. One handler,
// one describer, each named by the clause it exists to say.
//
// Selection note: the core's RB.autoPick always takes the BIGGEST candidate, which is the
// right policy for a removal spell and the wrong one for "choose a friendly unit" on a
// card that harms what it chooses. The helper below keeps the *pool* exactly as printed
// and only varies which legal member of it is taken (`low`, `prefer`), so no card here
// chooses outside what its text allows.
(function (RB) {
  'use strict';

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
    if (name === 'here') {
      return (ctx.event && ctx.event.bf !== undefined) ? s.bf[ctx.event.bf].units.slice() : [];
    }
    return RB.select(s, name, ctx);
  }

  // A pick spec: { pick:<selector>, n:1, at:'battlefield'|'base',
  //                notTemporary:true, filter:'damaged', maxMight:N,
  //                low:true (take the smallest), prefer:'enemy'|'mine' }
  function targets(s, spec, ctx) {
    if (!spec || typeof spec === 'string') return base(s, spec, ctx);
    let pool = base(s, spec.pick, ctx);
    if (spec.at === 'battlefield') pool = pool.filter(i => RB.locationOf(s, i).kind === 'bf');
    if (spec.at === 'base') pool = pool.filter(i => RB.locationOf(s, i).kind === 'base');
    if (spec.notTemporary) pool = pool.filter(i => !RB.obj(s, i).temporary);
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

  // --- describing selections ------------------------------------------------
  const NAMES = {
    self: 'me', eventUnit: 'that unit', myUnits: 'a friendly unit', enemyUnits: 'an enemy unit',
    allUnits: 'a unit', hereMine: 'a friendly unit there', hereEnemy: 'an enemy unit there',
    here: 'a unit there', gear: 'a gear',
  };
  function selText(spec) {
    if (!spec) return 'me';
    if (typeof spec === 'string') return NAMES[spec] || spec;
    let t = NAMES[spec.pick] || String(spec.pick);
    if (spec.notTemporary) t += ' without Temporary';
    if (spec.at === 'battlefield') t += ' at a battlefield';
    if (spec.at === 'base') t += ' in a base';
    return t;
  }
  RB.unlSelText = selText;

  // --- returnToHand ---------------------------------------------------------
  // "Return [X] to its owner's hand." A token ceases to exist instead; gear riding a
  // returned unit is detached and falls back to its owner's base.
  RB.defineOp('returnToHand', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) {
      const o = RB.obj(s, iid);
      const loc = RB.locationOf(s, iid);
      if (loc.kind === 'bf') RB.removeFrom(s.bf[loc.bf].units, iid);
      else if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, iid);
      else if (loc.kind === 'bfGear') RB.removeFrom(s.bf[loc.bf].gear, iid);
      else if (o.attachedTo) RB.removeFrom(RB.obj(s, o.attachedTo).attached, iid);
      else continue;
      for (const g of (o.attached || []).slice()) {
        const go = RB.obj(s, g);
        go.attachedTo = null;
        s.players[go.owner].base.push(g);
      }
      o.attached = [];
      o.damage = 0; o.buffs = 0; o.granted = []; o.exhausted = false;
      o.temporary = false; o.attachedTo = null; o.movedThisTurn = 0;
      delete o.role;
      if (!o.token) s.players[o.owner].hand.push(iid);
      RB.log(s, 'returnToHand', { p: o.controller, iid: iid }, 'unit.move');
    }
  });
  RB.defineDescriber('returnToHand', e =>
    'Return ' + selText(e.target) + " to its owner's hand.");

  // --- giveTemporary --------------------------------------------------------
  // "Give [X] Temporary." The engine's own Temporary flag (js/engine.js endTurn) is what
  // the token op sets, so this is the same status, not a lookalike.
  RB.defineOp('giveTemporary', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) {
      RB.obj(s, iid).temporary = true;
      RB.log(s, 'temporary', { iid: iid, p: RB.obj(s, iid).controller });
    }
  });
  RB.defineDescriber('giveTemporary', e => 'Give ' + selText(e.target) + ' Temporary.');

  // --- attach ---------------------------------------------------------------
  // The Equip keyword's ability: "Attach this to a unit you control."
  RB.defineOp('attach', (s, e, ctx) => {
    const host = targets(s, e.target, ctx)[0];
    if (!host) return;
    const g = ctx.source;
    const o = RB.obj(s, g);
    if (o.attachedTo === host) return;
    const loc = RB.locationOf(s, g);
    if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, g);
    else if (loc.kind === 'bfGear') RB.removeFrom(s.bf[loc.bf].gear, g);
    else if (o.attachedTo) RB.removeFrom(RB.obj(s, o.attachedTo).attached, g);
    else return;
    RB.obj(s, host).attached.push(g);
    o.attachedTo = host;
    RB.log(s, 'attach', { p: ctx.p, iid: g, host: host }, 'gear.equip');
  });
  RB.defineDescriber('attach', e => 'Attach me to ' + selText(e.target) + '.');

  // --- gainXP ---------------------------------------------------------------
  // XP is a per-player counter; nothing in the core reads it yet, so every card that
  // SPENDS xp or gates on it (Level N, "Spend 1 XP") is marked unimplemented instead.
  RB.defineOp('gainXP', (s, e, ctx) => {
    const P = s.players[ctx.p];
    P.xp = (P.xp || 0) + (e.n == null ? 1 : e.n);
    RB.log(s, 'xp', { p: ctx.p, xp: P.xp });
  });
  RB.defineDescriber('gainXP', e => 'Gain ' + (e.n == null ? 1 : e.n) + ' XP.');

  // --- cond -----------------------------------------------------------------
  // "…, if [condition], [effect]". Only the tests actually printed on Unleashed cards
  // exist; an unknown test throws rather than quietly reading as false.
  function testOf(s, t, ctx) {
    if (t.opponentScoreWithin !== undefined)
      return s.players[RB.opponentOf(ctx.p)].points >= s.victoryScore - t.opponentScoreWithin;
    if (t.selfReady) return !RB.obj(s, ctx.source).exhausted;
    throw new Error('unl cond: unknown test ' + JSON.stringify(t));
  }
  RB.defineOp('cond', (s, e, ctx) => {
    RB.runEffects(s, testOf(s, e.test, ctx) ? (e.effects || []) : (e.else || []), ctx);
  });
  RB.defineDescriber('cond', e => {
    const t = e.test.opponentScoreWithin !== undefined
      ? "an opponent's score is within " + e.test.opponentScoreWithin + ' points of the Victory Score'
      : e.test.selfReady ? "I'm ready" : JSON.stringify(e.test);
    const body = (e.effects || []).map(x => RB.describers[x.op](x)).join(' ');
    const alt = (e.else || []).map(x => RB.describers[x.op](x)).join(' ');
    return 'If ' + t + ', ' + body.charAt(0).toLowerCase() + body.slice(1) +
      (alt ? ' Otherwise, ' + alt.charAt(0).toLowerCase() + alt.slice(1) : '');
  });

  // --- predict --------------------------------------------------------------
  // Predict X (rules §412): look at the top X, recycle any number, put the rest back on
  // top in any order. Every branch is legal, so the choice is made by a stated rule
  // rather than a prompt: recycle what you could not pay for right now.
  RB.defineOp('predict', (s, e, ctx) => {
    const P = s.players[ctx.p];
    const n = Math.min(e.n == null ? 1 : e.n, P.deck.length);
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
  RB.defineDescriber('predict', e => 'Predict ' + (e.n == null ? 1 : e.n) + '.');

  // --- copyToken ------------------------------------------------------------
  // "Play a Reflection unit token … It becomes a copy of that unit." A copy has the
  // copied card's printed characteristics, so the token is minted on that card id; it is
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
  RB.defineDescriber('copyToken', e =>
    'Play a' + (e.ready ? ' ready' : 'n exhausted') + ' token copy of ' + selText(e.target) +
    (e.to === 'here' ? ' there' : ' to your base') + (e.temporary ? ', Temporary' : '') + '.');

})(window.RB = window.RB || {});
