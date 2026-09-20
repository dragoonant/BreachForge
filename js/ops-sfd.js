// Ops, conditions and event hooks for the Spiritforged set. Nothing here edits the core:
// handlers go in through RB.defineOp, describers through RB.defineDescriber, and the four
// core functions that are wrapped at the bottom all delegate to what they replaced.
//
// Three things are worth knowing before reading on.
//
// 1. NAMESPACED OP NAMES. Every op defined here is `sfd.<name>`. Three sets are authored in
//    parallel into three ops files that share one RB.ops table, and the last file loaded
//    wins a collision SILENTLY (js/ops-unl.js already defines a bare `attach`). A prefix
//    makes that impossible.
//
// 2. LOAD ORDER. index.html loads the ops files before js/engine.js and js/text.js, so
//    RB.defineDescriber, RB.kill, RB.score, RB.apply and RB.cardText do not exist yet when
//    this file runs. Everything that needs them is deferred into install(), which runs on
//    the first RB.registerCards() — by which time every script has loaded. install() is
//    idempotent, and the file also tries it immediately in case it is ever loaded last.
//
// 3. SET-LOCAL TRIGGERS. Four printed triggers in this set have no core event: Deathknell,
//    "when one or more enemy units die", "when I move" and "when you recycle a rune". The
//    hooks below re-broadcast those into `abilities.sfdTriggers`, a table read only off
//    cards whose id starts with `sfd-`. A second pack's wrapper therefore cannot fire this
//    pack's data, and this one cannot fire theirs — the double-fire hazard of three
//    independent wrappers over one RB.kill.
//
//    sfdTriggers events (the event data arrives on ctx.event):
//      death        — this permanent was killed (fires on the dying card only)
//      anyDeath     — any permanent was killed   (filters: `enemy: true`, `unit: true`)
//      move         — this unit completed a standard move
//      runeRecycle  — a player recycled a rune   (filter: `mine: true`)
//    Filters `mine` / `enemy` compare the event's player with the source's controller.
(function (RB) {
  'use strict';

  const def = (name, fn) => RB.defineOp('sfd.' + name, fn);
  const SAY = [];                                   // describers, registered by install()
  const say = (name, fn) => SAY.push(['sfd.' + name, fn]);

  // --- small shared helpers -------------------------------------------------
  const n_ = e => (e.n == null ? 1 : e.n);
  const isSfd = (s, iid) => String(RB.obj(s, iid).cardId).startsWith('sfd-');
  const abOf = (s, iid) => RB.cardOf(s, iid).abilities || null;
  const lower = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const join = fx => (fx || []).map(e => {
    const d = RB.describers[e.op];
    if (!d) throw new Error('no describer for op: ' + e.op);
    return d(e);
  }).filter(Boolean).join(' ');

  function unitsOf(s, p) {
    return RB.allUnits(s).filter(i => RB.obj(s, i).controller === p && RB.cardOf(s, i).type === 'Unit');
  }
  function allGear(s) {
    const out = [];
    for (const iid of Object.keys(s.objects)) {
      if (RB.card(s.objects[iid].cardId).type !== 'Gear') continue;
      if (s.objects[iid].attachedTo) { out.push(iid); continue; }
      const loc = RB.locationOf(s, iid);
      if (loc.kind === 'base' || loc.kind === 'bfGear') out.push(iid);
    }
    return out;
  }
  // The battlefield an ability speaks from: a battlefield's own iid, or the location of the
  // unit or gear that carries it. The core's `t.here` trigger filter reads locationOf, which
  // answers "nowhere" for a battlefield — so battlefield cards use the `here` condition.
  function sourceBf(s, ctx) {
    for (let i = 0; i < s.bf.length; i++) if (s.bf[i].iid === ctx.source) return i;
    const loc = RB.locationOf(s, ctx.source);
    return loc.kind === 'bf' ? loc.bf : -1;
  }
  function eventBf(s, ctx) {
    if (ctx.event && ctx.event.bf !== undefined && ctx.event.bf !== null) return ctx.event.bf;
    return sourceBf(s, ctx);
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

  // --- ops ------------------------------------------------------------------
  // "You may …" goes through the engine's own queue, so it is a real choice and not an
  // assumed yes. ix 0 is yes, ix 1 is no (RB.queueActions offers exactly those two).
  def('may', (s, e, ctx) => {
    s.queue.push({ kind: 'may', who: ctx.p, onAnswer: [e.effects || [], []], ctx: plainCtx(ctx) });
  });
  say('may', e => 'You may ' + lower(join(e.effects)));

  // "You may pay [Cost] to …". The cost is checked before the question is asked and paid on
  // the yes branch, through sfd.payThen.
  def('mayPay', (s, e, ctx) => {
    if (!canPay(s, e, ctx)) return;
    const pay = {
      op: 'sfd.payThen', energy: e.energy, power: e.power, domains: e.domains,
      exhaustSelf: e.exhaustSelf, bounceHere: e.bounceHere, effects: e.effects || [],
    };
    s.queue.push({ kind: 'may', who: ctx.p, onAnswer: [[pay], []], ctx: plainCtx(ctx) });
  });
  say('mayPay', e => 'You may ' + costPhrase(e) + ' to ' + lower(join(e.effects)));

  def('payThen', (s, e, ctx) => {
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
  say('payThen', e => costPhrase(e).replace(/^pay/, 'Pay') + ': ' + join(e.effects));

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
    if (e.bounceHere) out += (out ? ' and ' : '') + "return a unit you control here to its owner's hand";
    return out || 'do nothing';
  }
  function cheapestHere(s, ctx) {
    const here = eventBf(s, ctx);
    if (here < 0) return null;
    const us = RB.unitsAt(s, here, ctx.p);
    if (!us.length) return null;
    return us.slice().sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b))[0];
  }

  // A conditional clause, checked when the effect resolves — where a conditional that is not
  // part of a trigger's own condition belongs (rules §13.1).
  const CONDS = {
    here: (s, ctx) => !!ctx.event && ctx.event.bf === sourceBf(s, ctx),
    diedAlone: (s, ctx) => !!ctx.event && ctx.event.alone === true,
    wasMighty: (s, ctx) => !!ctx.event && (ctx.event.might || 0) >= 5,
    wonCombat: (s, ctx) => !!ctx.event && ctx.event.winner === ctx.p,
    unattached: (s, ctx) => !RB.obj(s, ctx.source).attachedTo,
    mightyHere: (s, ctx) => {
      const here = eventBf(s, ctx);
      return here >= 0 && RB.unitsAt(s, here, ctx.p).some(i => RB.mightOf(s, i) >= 5);
    },
  };
  const COND_TEXT = {
    here: 'it happened here', diedAlone: 'I died alone', wasMighty: 'I was Mighty',
    wonCombat: 'you won it', unattached: 'I am unattached',
    mightyHere: 'you had one or more Mighty units here',
  };
  def('when', (s, e, ctx) => {
    const c = CONDS[e.cond];
    if (!c) throw new Error('no such condition: ' + e.cond);
    if (c(s, ctx)) RB.runEffects(s, e.effects || [], ctx);
  });
  say('when', e => 'If ' + (COND_TEXT[e.cond] || e.cond) + ', ' + lower(join(e.effects)));

  // Equip / Quick-Draw. Attaching is how this engine models Equipment: RB.mightOf already
  // adds an attached gear's printed Might Bonus, so the bonus itself needs no data.
  def('attach', (s, e, ctx) => {
    const gear = ctx.source;
    const g = RB.obj(s, gear);
    if (g.attachedTo) return;                        // already placed by the play destination
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
  say('attach', () => 'Attach me to a unit you control.');

  def('killGear', (s, e, ctx) => {
    const g = pickGear(s, e, ctx);
    if (g === null) return;
    detach(s, g);
    RB.kill(s, g);
  });
  say('killGear', () => 'Kill a gear.');

  def('bounceGear', (s, e, ctx) => {
    const g = pickGear(s, e, ctx);
    if (g === null) return;
    detach(s, g);
    toHand(s, g);
  });
  say('bounceGear', () => "Return a gear to its owner's hand.");

  // Auto-resolution for "a gear": the opponent's biggest, else your own smallest. The POOL
  // is every gear the card may legally choose; this only orders it, the way RB.autoPick
  // orders units, because there is no prompt yet.
  function pickGear(s, e, ctx) {
    const all = allGear(s);
    const theirs = all.filter(i => RB.obj(s, i).controller !== ctx.p);
    if (theirs.length) return theirs.sort((a, b) => bonusOf(s, b) - bonusOf(s, a))[0];
    if (e.side === 'enemy') return null;
    const mine = all.filter(i => RB.obj(s, i).controller === ctx.p);
    return mine.length ? mine.sort((a, b) => bonusOf(s, a) - bonusOf(s, b))[0] : null;
  }
  const bonusOf = (s, iid) => RB.cardOf(s, iid).might || 0;
  function detach(s, gid) {
    const o = RB.obj(s, gid);
    if (!o.attachedTo) return;
    RB.removeFrom(RB.obj(s, o.attachedTo).attached, gid);
    o.attachedTo = null;
    s.players[o.controller].base.push(gid);
  }
  // A permanent leaving the board for its owner's hand. A token put into any non-board zone
  // ceases to exist (§185.3), so it is dropped rather than handed over.
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

  // Named tokens (data/tokens.js). Delegates to the core `token` op per copy and remembers
  // what it made, so a following clause ("Ready up to two of them") can speak about them.
  def('playToken', (s, e, ctx) => { for (let i = 0; i < n_(e); i++) mintToken(s, e, ctx); });
  say('playToken', e => tokenPhrase(e, n_(e)));

  def('playTokenPer', (s, e, ctx) => {
    let k = 0;
    for (const iid of ownedCards(s, ctx.p)) if ((RB.cardOf(s, iid).tags || []).includes(e.per)) k++;
    for (let i = 0; i < k; i++) mintToken(s, e, ctx);
  });
  say('playTokenPer', e => tokenPhrase(e, 1).replace(/\.$/, '') + ' for each ' + e.per + ' you control.');

  def('readyMade', (s, e, ctx) => {
    for (const iid of (ctx.made || []).slice(0, n_(e))) if (s.objects[iid]) RB.obj(s, iid).exhausted = false;
  });
  say('readyMade', e => 'Ready up to ' + (NUMWORD[n_(e)] || n_(e)) + ' of them.');

  function mintToken(s, e, ctx) {
    const before = s.nextIid;
    RB.ops.token(s, {
      op: 'token', cardId: e.cardId, might: e.might, ready: e.ready, to: e.to, temporary: e.temporary,
    }, ctx);
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
  const NUMWORD = { 1: 'a', 2: 'two', 3: 'three', 4: 'four' };
  function tokenName(id) {
    try { return RB.card(id); } catch (err) { return (RB.tokenData || []).find(t => t.id === id) || null; }
  }
  function tokenPhrase(e, n) {
    const t = tokenName(e.cardId) || { name: e.cardId, type: 'Unit', might: null };
    const might = e.might != null ? e.might : t.might;
    const dest = e.to === 'here' ? ' there' : e.to === 'base' ? ' to your base' : '';
    return 'Play ' + (n === 1 ? 'a' : (NUMWORD[n] || n)) + ' ' + (might != null ? might + ' Might ' : '') +
      t.name + ' ' + (t.type === 'Gear' ? 'gear' : 'unit') + ' token' + (n > 1 ? 's' : '') +
      dest + (e.exhausted ? ' exhausted' : '') + '.';
  }

  // The core `buff` op is the same mechanic, but its describer reads "a chosen your units
  // gets +5 Might" — and the describer is the auditor, so these two carry the printed
  // phrasing instead. Buffs already expire in the Ending Phase, hence "this turn".
  def('giveMight', (s, e, ctx) => {
    for (const iid of RB.select(s, e.target, ctx)) RB.obj(s, iid).buffs += n_(e);
  });
  say('giveMight', e => 'Give ' + selPhrase(e.target) + ' +' + n_(e) + ' Might this turn.');

  def('weaken', (s, e, ctx) => {
    for (const iid of RB.select(s, e.target, ctx)) RB.obj(s, iid).buffs -= n_(e);
  });
  say('weaken', e => 'Give ' + selPhrase(e.target) + ' -' + n_(e) + ' Might this turn.');

  function selPhrase(sel) {
    if (sel && typeof sel === 'object' && sel.pick) return 'a chosen ' + selPhrase(sel.pick);
    return ({
      myUnits: 'friendly unit', enemyUnits: 'enemy unit', allUnits: 'unit',
      hereMine: 'friendly unit there', hereEnemy: 'enemy unit there',
    })[sel] || 'unit';
  }

  // "+N Might for each enemy unit there" — the choice is over units standing at a
  // battlefield only, and resolves to the one the clause actually rewards.
  def('buffPerEnemyAt', (s, e, ctx) => {
    const cands = [];
    for (let i = 0; i < s.bf.length; i++)
      for (const u of RB.unitsAt(s, i, ctx.p)) cands.push([u, RB.unitsAt(s, i, RB.opponentOf(ctx.p)).length]);
    if (!cands.length) return;
    cands.sort((a, b) => b[1] - a[1] || RB.mightOf(s, b[0]) - RB.mightOf(s, a[0]));
    RB.obj(s, cands[0][0]).buffs += n_(e) * cands[0][1];
  });
  say('buffPerEnemyAt', e =>
    'Give a friendly unit at a battlefield +' + n_(e) + ' Might this turn for each enemy unit there.');

  // Kill a friendly unit and move its Might onto another. Auto-resolution: give up the
  // smallest, hand the Might to the biggest of the rest.
  def('killAndTransferMight', (s, e, ctx) => {
    const mine = unitsOf(s, ctx.p);
    if (!mine.length) return;
    mine.sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b));
    const victim = mine[0];
    const m = RB.mightOf(s, victim);
    const rest = mine.slice(1).sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    RB.kill(s, victim);
    if (rest.length) RB.obj(s, rest[0]).buffs += m;
  });
  say('killAndTransferMight', () =>
    'Kill a friendly unit. If you do, give +Might equal to its Might to another friendly unit this turn.');

  def('readyLegend', (s, e, ctx) => {
    const l = s.players[ctx.p].legend;
    if (l) RB.obj(s, l).exhausted = false;
  });
  say('readyLegend', () => 'Ready your legend.');

  def('drawPerOtherBattlefield', (s, e, ctx) => {
    const here = sourceBf(s, ctx);
    let k = 0;
    for (let i = 0; i < s.bf.length; i++) if (i !== here && s.bf[i].controller === ctx.p) k++;
    for (let i = 0; i < k * n_(e); i++) RB.draw(s, ctx.p);
  });
  say('drawPerOtherBattlefield', e => 'Draw ' + n_(e) + ' for each other battlefield you control.');

  // --- install: describers and the four wrappers ----------------------------
  // Deferred because index.html loads the ops files before js/engine.js and js/text.js.
  let installed = false;
  function ready() {
    return !!(RB.defineDescriber && RB.cardText && RB.kill && RB.score && RB.apply && RB.recycleRune && RB.autoPick);
  }
  function install() {
    if (installed || !ready()) return;
    installed = true;
    for (const [name, fn] of SAY) RB.defineDescriber(name, fn);

    // Death. The rules put a Deathknell trigger on the chain before the card reaches the
    // trash, so what its effect needs to know — where it stood, its Might, whether it stood
    // alone — is snapshotted first and travels on ctx.event.
    const baseKill = RB.kill;
    RB.kill = function (s, iid) {
      const loc = RB.locationOf(s, iid);
      if (loc.kind !== 'base' && loc.kind !== 'bf' && loc.kind !== 'bfGear') return baseKill(s, iid);
      const o = RB.obj(s, iid);
      const peers = loc.kind === 'bf'
        ? RB.unitsAt(s, loc.bf, o.controller).filter(i => i !== iid)
        : s.players[o.controller].base.filter(i => i !== iid && RB.cardOf(s, i).type === 'Unit');
      const data = {
        iid: iid, p: o.controller, type: RB.cardOf(s, iid).type,
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
    // surface. DEVIATION: a move trigger therefore resolves just after the post-action
    // cleanup instead of just before it — the effect is exact, the moment is one beat late.
    // Only a card whose data names a `move` sfdTrigger does any work here.
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
    // so an enemy card takes the next-best unit rather than taking nothing.
    const baseAutoPick = RB.autoPick;
    RB.autoPick = function (s, sel, ctx) {
      const pool = baseAutoPick(s, Object.assign({}, sel, { n: 999 }), ctx)
        .filter(i => !unchoosableBy(s, i, ctx.p));
      return pool.slice(0, sel.n || 1);
    };

    // A battlefield that locks scoring. Blocking the call blocks the point and the
    // Conquer/Hold triggers with it, which is the rule: the scoring never happens, so there
    // is nothing for them to fire on.
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

    // js/text.js is the auditor: a clause with no prose is a clause that can go missing. The
    // core describer knows nothing about sfdTriggers or these statics, so this wrapper adds
    // their lines and delegates everything else.
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
  }
  function unchoosableBy(s, iid, p) {
    if (RB.obj(s, iid).controller === p) return false;
    const ab = abOf(s, iid);
    return !!(ab && ab.statics && ab.statics.some(x => x.unchoosableByEnemies));
  }
  const SFD_WORDS = {
    death: 'When I die',
    anyDeath: t => 'When ' + (t.enemy ? 'an enemy' : 'a') + ' unit dies',
    move: 'When I move',
    runeRecycle: 'When you recycle a rune',
  };
  const ORDINAL = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };

  RB.sfdInstall = install;
  if (RB.registerCards) {
    const baseRegisterCards = RB.registerCards;
    RB.registerCards = function () { install(); return baseRegisterCards.apply(this, arguments); };
  }
  install();                                        // in case this file is ever loaded last
})(window.RB = window.RB || {});
