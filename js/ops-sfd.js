// Ops, hooks and token cards for the Spiritforged set. Everything here is additive: the
// core (js/abilities.js, js/engine.js, js/text.js) is never edited. Where the core has no
// event for a printed trigger, this file wraps the one exported chokepoint that already
// knows about it (RB.kill, RB.recycleRune, RB.apply) and re-broadcasts it into a
// SET-LOCAL trigger table, `abilities.sfdTriggers`.
//
// Why a set-local trigger table instead of pushing new names through RB.runTriggers:
// three sets are authored in parallel and each may install its own wrapper. A wrapper that
// only ever reads `sfdTriggers` off cards whose id starts with `sfd-` cannot double-fire
// another pack's data, and another pack's wrapper cannot fire ours. Every wrapper below
// delegates to the previous implementation, so the chain composes in any load order.
//
// sfdTriggers events (all carry `event` data on ctx):
//   death        — this permanent was killed (fires on the dying card only)
//   anyDeath     — any permanent was killed (filters: `enemy: true`, `unit: true`)
//   move         — this unit completed a standard move
//   runeRecycle  — a player recycled a rune (filter: `mine: true`)
// Filters `mine` / `enemy` compare the event's player against the source's controller.
(function (RB) {
  'use strict';

  // --- token cards ----------------------------------------------------------
  // data/cards.js is generated and carries no tokens, and the core `token` op mints a real
  // card id (RB.cardOf would throw on an invented one). The named tokens this set needs are
  // registered here, before RB.registerCards() runs, with the same field shape as a printed
  // card. Ability data for them ships in data/abilities-sfd.js like any other card.
  const TOKENS = {
    'sfd-t-gold': { name: 'Gold', type: 'Gear', might: null, tags: ['Token'] },
    'sfd-t-sand': { name: 'Sand Soldier', type: 'Unit', might: 2, tags: ['Token', 'Shurima'] },
    'sfd-t-mech': { name: 'Mech', type: 'Unit', might: 3, tags: ['Token', 'Mech'] },
  };
  RB.sfdTokens = TOKENS;
  RB.cardData = RB.cardData || [];
  for (const id of Object.keys(TOKENS)) {
    if (RB.cardData.some(c => c.id === id)) continue;
    const t = TOKENS[id];
    RB.cardData.push({
      id: id, name: t.name, nameId: id, type: t.type,
      domain: 'Colorless', domains: ['Colorless'], tags: t.tags.slice(),
      energy: null, power: null, might: t.might,
      rarity: 'Token', set: 'Spiritforged', artist: 'BreachForge',
    });
  }

  // --- small shared helpers -------------------------------------------------
  const isSfd = (s, iid) => String(RB.obj(s, iid).cardId).startsWith('sfd-');
  const abOf = (s, iid) => RB.cardOf(s, iid).abilities || null;
  const opp = p => RB.opponentOf(p);

  function unitsOf(s, p) {
    return RB.allUnits(s).filter(i => RB.obj(s, i).controller === p && RB.cardOf(s, i).type === 'Unit');
  }
  function allGear(s) {
    const out = [];
    for (let p = 0; p < 2; p++) for (const i of s.players[p].base) if (RB.cardOf(s, i).type === 'Gear') out.push(i);
    for (const bf of s.bf) for (const i of bf.gear) out.push(i);
    for (const i of RB.allUnits(s)) for (const g of RB.obj(s, i).attached) out.push(g);
    return out;
  }
  // The battlefield this ability speaks from: a battlefield's own iid, or the location of
  // the unit/gear that carries it. Used by the `here` condition, which is what battlefield
  // cards need because the core's `t.here` filter reads locationOf (battlefields are nowhere).
  function sourceBf(s, ctx) {
    for (let i = 0; i < s.bf.length; i++) if (s.bf[i].iid === ctx.source) return i;
    const loc = RB.locationOf(s, ctx.source);
    return loc.kind === 'bf' ? loc.bf : -1;
  }
  function plainCtx(ctx) {
    return { p: ctx.p, source: ctx.source, event: ctx.event || null, targets: ctx.targets || [] };
  }
  function turnsTaken(s, p) {
    return p === s.firstPlayer ? Math.ceil(s.turn / 2) : Math.floor(s.turn / 2);
  }

  // --- set-local trigger dispatch -------------------------------------------
  function sfdSources(s) {
    const out = [];
    for (let p = 0; p < 2; p++) {
      if (s.players[p].legend) out.push([s.players[p].legend, p]);
      for (const iid of s.players[p].base) out.push([iid, p]);
    }
    for (const bf of s.bf) {
      for (const iid of bf.units) out.push([iid, RB.obj(s, iid).controller]);
      for (const iid of bf.gear) out.push([iid, RB.obj(s, iid).controller]);
    }
    return out;
  }

  function fire(s, event, data, selfIid) {
    const sources = selfIid ? [[selfIid, RB.obj(s, selfIid).controller]] : sfdSources(s);
    for (const [iid, p] of sources) {
      if (!isSfd(s, iid)) continue;
      const ab = abOf(s, iid);
      if (!ab || !ab.sfdTriggers) continue;
      for (const t of ab.sfdTriggers) {
        if (t.on !== event) continue;
        if (t.mine && data.p !== p) continue;
        if (t.enemy && data.p === p) continue;
        if (t.unit && data.type !== 'Unit') continue;
        const prev = s.via;
        s.via = { iid: iid };
        RB.runEffects(s, t.effects, { p: p, source: iid, event: data });
        s.via = prev;
      }
    }
  }

  // --- hooks ----------------------------------------------------------------
  // Death. The rules put a Deathknell trigger on the chain before the card reaches the
  // trash, so everything the effect needs to know (where it stood, its Might, whether it
  // stood alone) is snapshotted first and travels on ctx.event.
  const baseKill = RB.kill;
  RB.kill = function (s, iid) {
    const loc = RB.locationOf(s, iid);
    if (loc.kind !== 'base' && loc.kind !== 'bf' && loc.kind !== 'bfGear') return baseKill(s, iid);
    const o = RB.obj(s, iid);
    const card = RB.cardOf(s, iid);
    const peers = loc.kind === 'bf'
      ? RB.unitsAt(s, loc.bf, o.controller).filter(i => i !== iid)
      : s.players[o.controller].base.filter(i => i !== iid && RB.cardOf(s, i).type === 'Unit');
    const data = {
      iid: iid, p: o.controller, type: card.type,
      bf: loc.kind === 'bf' ? loc.bf : undefined,
      might: RB.mightOf(s, iid),
      alone: peers.length === 0,
    };
    const r = baseKill(s, iid);
    fire(s, 'death', data, iid);
    fire(s, 'anyDeath', data, null);
    return r;
  };

  // Rune recycling — the payment solver and the recycleRune op both route through here.
  const baseRecycleRune = RB.recycleRune;
  RB.recycleRune = function (s, p, iid) {
    const r = baseRecycleRune(s, p, iid);
    fire(s, 'runeRecycle', { p: p, iid: iid }, null);
    return r;
  };

  // Movement. doMove lives inside the engine's closure, so the only seam is the engine
  // surface itself. DEVIATION: a move trigger therefore resolves after the post-action
  // cleanup rather than before it — the effect is exact, the moment is one beat late. Only
  // cards whose data names a `move` sfdTrigger do any work here.
  const baseApply = RB.apply;
  RB.apply = function (state, action) {
    const s = baseApply(state, action);
    if (action && action.t === 'move' && s.objects[action.iid] && isSfd(s, action.iid)) {
      const ab = abOf(s, action.iid);
      if (ab && ab.sfdTriggers && ab.sfdTriggers.some(t => t.on === 'move')) {
        const loc = RB.locationOf(s, action.iid);
        if (loc.kind === 'bf' || loc.kind === 'base')
          fire(s, 'move', {
            iid: action.iid, p: RB.obj(s, action.iid).controller, type: 'Unit',
            bf: loc.kind === 'bf' ? loc.bf : undefined,
          }, action.iid);
      }
    }
    return s;
  };

  // "I can't be chosen by enemy spells and abilities" is a targeting-legality layer, and
  // RB.autoPick is the one place a "choose a …" clause resolves. The base picker is asked
  // for the whole sorted pool, the unchoosable are dropped, and the slice happens after —
  // so an enemy card picks the next-best unit rather than picking nothing.
  const baseAutoPick = RB.autoPick;
  RB.autoPick = function (s, sel, ctx) {
    const wide = Object.assign({}, sel, { n: 999 });
    const pool = baseAutoPick(s, wide, ctx).filter(i => !unchoosableBy(s, i, ctx.p));
    return pool.slice(0, sel.n || 1);
  };
  function unchoosableBy(s, iid, p) {
    if (RB.obj(s, iid).controller === p) return false;
    const ab = abOf(s, iid);
    return !!(ab && ab.statics && ab.statics.some(x => x.unchoosableByEnemies));
  }

  // A battlefield that locks scoring ("Players can't score here until their third turn").
  // Blocking the call blocks the point and the Conquer/Hold triggers with it, which is the
  // rule: the scoring never happens, so there is nothing for them to fire on.
  const baseScore = RB.score;
  RB.score = function (s, p, i, how) {
    const ab = RB.card(s.bf[i].cardId).abilities;
    const lock = ab && ab.statics && ab.statics.find(x => x.scoreLockUntilTurn);
    if (lock && turnsTaken(s, p) < lock.scoreLockUntilTurn) {
      RB.log(s, 'scoreDenied', { p: p, bf: i, how: how });
      return;
    }
    return baseScore(s, p, i, how);
  };

  // --- ops ------------------------------------------------------------------
  const n_ = e => (e.n == null ? 1 : e.n);
  const D = () => RB.describers;
  const join = fx => (fx || []).map(e => {
    const d = D()[e.op];
    if (!d) throw new Error('no describer for op: ' + e.op);
    return d(e);
  }).filter(Boolean).join(' ');
  const lower = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

  // "You may …" — the decision goes through the engine's own queue, so it is a real
  // player choice and not an assumed yes.
  RB.defineOp('may', (s, e, ctx) => {
    s.queue.push({ kind: 'may', who: ctx.p, onAnswer: [e.effects || [], []], ctx: plainCtx(ctx) });
  });
  RB.defineDescriber('may', e => 'You may ' + lower(join(e.effects)));

  // "You may pay [Cost] to …". The cost is checked before the question is asked, and paid
  // on the yes branch through payThen.
  RB.defineOp('mayPay', (s, e, ctx) => {
    if (!canPay(s, e, ctx)) return;
    const pay = { op: 'payThen', energy: e.energy, power: e.power, domains: e.domains,
      exhaustSelf: e.exhaustSelf, bounceHere: e.bounceHere, effects: e.effects || [] };
    s.queue.push({ kind: 'may', who: ctx.p, onAnswer: [[pay], []], ctx: plainCtx(ctx) });
  });
  RB.defineDescriber('mayPay', e => 'You may ' + costPhrase(e) + ' to ' + lower(join(e.effects)));

  RB.defineOp('payThen', (s, e, ctx) => {
    if (!canPay(s, e, ctx)) return;
    const plan = RB.planPayment(s, ctx.p, resourceCost(e));
    if (!plan) return;
    RB.pay(s, ctx.p, plan);
    if (e.exhaustSelf) RB.obj(s, ctx.source).exhausted = true;
    if (e.bounceHere) {
      const u = cheapestHere(s, ctx);
      if (u === null) return;
      toHand(s, u);
    }
    RB.runEffects(s, e.effects || [], ctx);
  });
  RB.defineDescriber('payThen', e => costPhrase(e).replace(/^pay/, 'Pay') + ': ' + join(e.effects));

  function resourceCost(e) {
    return { energy: e.energy || 0, power: e.power || 0, domains: e.domains || [], each: false };
  }
  function canPay(s, e, ctx) {
    if (!RB.canPay(s, ctx.p, resourceCost(e))) return false;
    if (e.exhaustSelf && RB.obj(s, ctx.source).exhausted) return false;
    if (e.bounceHere && cheapestHere(s, ctx) === null) return false;
    return true;
  }
  function costPhrase(e) {
    const bits = [];
    if (e.energy) bits.push(e.energy + ' Energy');
    if (e.power) bits.push(e.power + ' Power');
    let out = bits.length ? 'pay ' + bits.join(' and ') : '';
    if (e.exhaustSelf) out = out ? out + ' and exhaust me' : 'exhaust me';
    if (e.bounceHere) out += (out ? ' and ' : '') + "return a unit you control there to its owner's hand";
    return out || 'do nothing';
  }
  function cheapestHere(s, ctx) {
    const here = ctx.event && ctx.event.bf !== undefined && ctx.event.bf !== null ? ctx.event.bf : sourceBf(s, ctx);
    if (here < 0) return null;
    const us = RB.unitsAt(s, here, ctx.p);
    if (!us.length) return null;
    return us.slice().sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b))[0];
  }

  // A conditional clause. The condition is checked when the effect resolves, which is where
  // a conditional that is not part of a trigger's condition belongs (rules §13.1).
  const CONDS = {
    here: (s, ctx) => !!ctx.event && ctx.event.bf === sourceBf(s, ctx),
    diedAlone: (s, ctx) => !!ctx.event && ctx.event.alone === true,
    wasMighty: (s, ctx) => !!ctx.event && (ctx.event.might || 0) >= 5,
    wonCombat: (s, ctx) => !!ctx.event && ctx.event.winner === ctx.p,
    unattached: (s, ctx) => !RB.obj(s, ctx.source).attachedTo,
    mightyHere: (s, ctx) => {
      const here = ctx.event && ctx.event.bf !== undefined ? ctx.event.bf : sourceBf(s, ctx);
      return here >= 0 && RB.unitsAt(s, here, ctx.p).some(i => RB.mightOf(s, i) >= 5);
    },
  };
  const COND_TEXT = {
    here: 'it happened here', diedAlone: 'I died alone', wasMighty: 'I was Mighty',
    wonCombat: 'you won it', unattached: 'I am unattached',
    mightyHere: 'you had one or more Mighty units here',
  };
  RB.defineOp('when', (s, e, ctx) => {
    const c = CONDS[e.cond];
    if (!c) throw new Error('no such condition: ' + e.cond);
    if (c(s, ctx)) RB.runEffects(s, e.effects || [], ctx);
  });
  RB.defineDescriber('when', e => 'If ' + (COND_TEXT[e.cond] || e.cond) + ', ' + lower(join(e.effects)));

  // Equip / Quick-Draw. Attaching is how this engine models Equipment: mightOf already adds
  // an attached gear's printed Might Bonus, so the bonus needs no data of its own.
  RB.defineOp('attach', (s, e, ctx) => {
    const gear = ctx.source;
    const g = RB.obj(s, gear);
    if (g.attachedTo) return;                        // already placed (played onto a unit)
    const hosts = unitsOf(s, ctx.p);
    if (!hosts.length) return;
    hosts.sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    const host = hosts[0];
    const loc = RB.locationOf(s, gear);
    if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, gear);
    else if (loc.kind === 'bfGear') RB.removeFrom(s.bf[loc.bf].gear, gear);
    else return;
    RB.obj(s, host).attached.push(gear);
    g.attachedTo = host;
    RB.log(s, 'attach', { p: ctx.p, iid: gear, host: host }, 'gear.equip');
  });
  RB.defineDescriber('attach', () => 'Attach me to a unit you control.');

  RB.defineOp('killGear', (s, e, ctx) => {
    const g = pickGear(s, e, ctx);
    if (g === null) return;
    detach(s, g);
    RB.kill(s, g);
  });
  RB.defineDescriber('killGear', () => 'Kill a gear.');

  RB.defineOp('bounceGear', (s, e, ctx) => {
    const g = pickGear(s, e, ctx);
    if (g === null) return;
    detach(s, g);
    toHand(s, g);
  });
  RB.defineDescriber('bounceGear', () => "Return a gear to its owner's hand.");

  // Auto-resolution rule for "a gear": the opponent's biggest, else your own smallest —
  // the same spirit as RB.autoPick, which resolves "choose a …" without a modal.
  function pickGear(s, e, ctx) {
    const all = allGear(s);
    const theirs = all.filter(i => RB.obj(s, i).controller !== ctx.p);
    if (theirs.length) return theirs.sort((a, b) => bonus(s, b) - bonus(s, a))[0];
    if (e.side === 'enemy') return null;
    const mine = all.filter(i => RB.obj(s, i).controller === ctx.p);
    return mine.length ? mine.sort((a, b) => bonus(s, a) - bonus(s, b))[0] : null;
  }
  const bonus = (s, iid) => RB.cardOf(s, iid).might || 0;
  function detach(s, gid) {
    const o = RB.obj(s, gid);
    if (!o.attachedTo) return;
    RB.removeFrom(RB.obj(s, o.attachedTo).attached, gid);
    o.attachedTo = null;
    s.players[o.controller].base.push(gid);
  }
  // A permanent leaving the board for its owner's hand. A token put into a non-board zone
  // ceases to exist (§185), so it is dropped rather than handed over.
  function toHand(s, iid) {
    const o = RB.obj(s, iid);
    const loc = RB.locationOf(s, iid);
    if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, iid);
    else if (loc.kind === 'bf') RB.removeFrom(s.bf[loc.bf].units, iid);
    else if (loc.kind === 'bfGear') RB.removeFrom(s.bf[loc.bf].gear, iid);
    else return;
    o.damage = 0; o.buffs = 0; o.granted = []; o.exhausted = false;
    if (!o.token) s.players[o.owner].hand.push(iid);
    RB.log(s, 'bounce', { iid: iid, p: o.controller }, 'unit.move');
  }

  // Named tokens. Delegates to the core `token` op per copy and remembers what it made, so
  // a following clause ("Ready up to two of them") can speak about them.
  RB.defineOp('playToken', (s, e, ctx) => {
    for (let i = 0; i < n_(e); i++) mintToken(s, e, ctx);
  });
  RB.defineDescriber('playToken', e => tokenPhrase(e, n_(e)));

  RB.defineOp('playTokenPer', (s, e, ctx) => {
    let k = 0;
    for (const iid of ownedCards(s, ctx.p))
      if ((RB.cardOf(s, iid).tags || []).includes(e.per)) k++;
    for (let i = 0; i < k; i++) mintToken(s, e, ctx);
  });
  RB.defineDescriber('playTokenPer', e =>
    tokenPhrase(e, 1).replace(/\.$/, '') + ' for each ' + e.per + ' you control.');

  RB.defineOp('readyMade', (s, e, ctx) => {
    for (const iid of (ctx.made || []).slice(0, n_(e))) if (s.objects[iid]) RB.obj(s, iid).exhausted = false;
  });
  RB.defineDescriber('readyMade', e => 'Ready up to ' + n_(e) + ' of them.');

  function mintToken(s, e, ctx) {
    const before = s.nextIid;
    RB.ops.token(s, { op: 'token', cardId: e.cardId, ready: e.ready, to: e.to, temporary: e.temporary }, ctx);
    const iid = 'o' + before;
    if (s.objects[iid]) (ctx.made = ctx.made || []).push(iid);
  }
  function ownedCards(s, p) {
    const out = [];
    for (const iid of s.players[p].base) out.push(iid);
    for (const bf of s.bf) {
      for (const iid of bf.units) if (RB.obj(s, iid).controller === p) out.push(iid);
      for (const iid of bf.gear) if (RB.obj(s, iid).controller === p) out.push(iid);
    }
    for (const iid of out.slice()) for (const g of RB.obj(s, iid).attached) out.push(g);
    return out;
  }
  function tokenPhrase(e, n) {
    const t = TOKENS[e.cardId] || { name: '?', type: 'Unit', might: null };
    const NUM = { 1: 'a', 2: 'two', 3: 'three', 4: 'four' };
    const dest = e.to === 'here' ? ' there' : e.to === 'base' ? ' to your base' : '';
    return 'Play ' + (NUM[n] || n) + ' ' + (t.might != null ? t.might + ' Might ' : '') + t.name + ' ' +
      (t.type === 'Gear' ? 'gear' : 'unit') + ' token' + (n > 1 ? 's' : '') +
      dest + (e.exhausted ? ' exhausted' : '') + '.';
  }

  // "+N Might for each enemy unit there". Resolves the choice over units standing at a
  // battlefield only, preferring the one the clause actually rewards.
  RB.defineOp('buffPerEnemyAt', (s, e, ctx) => {
    const cands = [];
    for (let i = 0; i < s.bf.length; i++)
      for (const u of RB.unitsAt(s, i, ctx.p)) cands.push([u, RB.unitsAt(s, i, opp(ctx.p)).length]);
    if (!cands.length) return;
    cands.sort((a, b) => b[1] - a[1] || RB.mightOf(s, b[0]) - RB.mightOf(s, a[0]));
    RB.obj(s, cands[0][0]).buffs += n_(e) * cands[0][1];
  });
  RB.defineDescriber('buffPerEnemyAt', e =>
    'Give a friendly unit at a battlefield +' + n_(e) + ' Might this turn for each enemy unit there.');

  RB.defineOp('weaken', (s, e, ctx) => {
    for (const iid of RB.select(s, e.target, ctx)) RB.obj(s, iid).buffs -= n_(e);
  });
  RB.defineDescriber('weaken', e => 'Give ' + selPhrase(e.target) + ' -' + n_(e) + ' Might this turn.');
  function selPhrase(sel) {
    if (sel && typeof sel === 'object' && sel.pick) return 'a chosen ' + selPhrase(sel.pick);
    return ({ myUnits: 'friendly unit', enemyUnits: 'enemy unit', allUnits: 'unit',
      hereMine: 'friendly unit there', hereEnemy: 'enemy unit there' })[sel] || 'unit';
  }

  // Kill a friendly unit, move its Might onto another. Auto-resolution: give up the
  // smallest unit, hand the Might to the biggest of the rest.
  RB.defineOp('killAndTransferMight', (s, e, ctx) => {
    const mine = unitsOf(s, ctx.p);
    if (!mine.length) return;
    mine.sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b));
    const victim = mine[0];
    const m = RB.mightOf(s, victim);
    const rest = mine.slice(1).sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    RB.kill(s, victim);
    if (rest.length) RB.obj(s, rest[0]).buffs += m;
  });
  RB.defineDescriber('killAndTransferMight', () =>
    'Kill a friendly unit. If you do, give +Might equal to its Might to another friendly unit this turn.');

  RB.defineOp('readyLegend', (s, e, ctx) => {
    const l = s.players[ctx.p].legend;
    if (l) RB.obj(s, l).exhausted = false;
  });
  RB.defineDescriber('readyLegend', () => 'Ready your legend.');

  RB.defineOp('drawPerOtherBattlefield', (s, e, ctx) => {
    const here = sourceBf(s, ctx);
    let k = 0;
    for (let i = 0; i < s.bf.length; i++) if (i !== here && s.bf[i].controller === ctx.p) k++;
    for (let i = 0; i < k * n_(e); i++) RB.draw(s, ctx.p);
  });
  RB.defineDescriber('drawPerOtherBattlefield', e =>
    'Draw ' + n_(e) + ' for each other battlefield you control.');

  // [A] — Power of any domain. The engine has no "choose a domain" step, so the choice is
  // resolved to the controller's legend's own domain, which is the one their deck can spend.
  RB.defineOp('addAnyPower', (s, e, ctx) => {
    const l = s.players[ctx.p].legend;
    const c = l ? RB.cardOf(s, l) : null;
    const d = (c && ((c.domains && c.domains[0]) || c.domain)) || RB.DOMAINS[0];
    s.players[ctx.p].pool.power[d] = (s.players[ctx.p].pool.power[d] || 0) + n_(e);
  });
  RB.defineDescriber('addAnyPower', e => 'Add ' + n_(e) + ' Power of any domain.');

  // --- the describer half of the set-local triggers and statics --------------
  // js/text.js is the auditor: a clause with no prose is a clause that can go missing. The
  // core describer knows nothing about sfdTriggers or these statics, so this wrapper adds
  // their lines and delegates everything else.
  const SFD_WORDS = {
    death: 'When I die', anyDeath: t => 'When ' + (t.enemy ? 'an enemy' : 'a') + ' unit dies',
    move: 'When I move', runeRecycle: 'When you recycle a rune',
  };
  const ORDINAL = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };
  const baseCardText = RB.cardText;
  RB.cardText = function (id) {
    const out = [];
    const base = baseCardText(id);
    if (base) out.push(base);
    const ab = RB.card(id).abilities;
    if (ab) {
      for (const t of ab.sfdTriggers || []) {
        const w = SFD_WORDS[t.on];
        out.push((typeof w === 'function' ? w(t) : (w || t.on)) + ', ' + lower(join(t.effects)));
      }
      for (const st of ab.statics || []) {
        if (st.unchoosableByEnemies) out.push("I can't be chosen by enemy spells and abilities.");
        if (st.scoreLockUntilTurn)
          out.push("Players can't score here until their " +
            (ORDINAL[st.scoreLockUntilTurn] || st.scoreLockUntilTurn) + ' turn.');
      }
    }
    return out.filter(Boolean).join('\n');
  };
})(window.RB = window.RB || {});
