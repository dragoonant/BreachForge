// Ops added for the Origins set. Handlers and describers only — js/abilities.js and
// js/text.js are never edited. Three things are worth knowing before reading on:
//
// 1. NAMESPACED OP NAMES. Every op defined here is `ogn.<name>`. Three sets are authored
//    in parallel into three ops files that all write into the same RB.ops table, and the
//    last file loaded wins a name collision SILENTLY. A prefix makes that impossible.
//
// 2. CHOICES. The core resolves "choose a unit" against the best candidate by a stated
//    rule (RB.autoPick, D-2) because there is no prompt yet, and the UI renders no queue
//    step other than the mulligan — so nothing here opens one. The same stand-in is
//    extended to the other choices these cards ask for (which gear, which destination,
//    whether to take a "you may"), and every describer below says which branch it takes,
//    so the narrowing is visible in the audit instead of hiding in a handler. The POOL is
//    always exactly what the card prints: `prefer` only orders a pool, never trims it.
//
// 3. FOUR CORE FUNCTIONS ARE WRAPPED (bottom of this file), because a Might layer, a
//    death trigger, a delayed end-of-turn effect and a play restriction are all concepts
//    the core does not have and an op alone cannot add. Each wrapper reads ONLY fields
//    prefixed `ogn`, so a second set's wrapper cannot double-count this set's data.
//    The one event another pack might also raise is the death trigger; `ogn.once` guards
//    every death effect against a second, foreign firing of the same death.
(function (RB) {
  'use strict';

  const def = (name, fn) => RB.defineOp('ogn.' + name, fn);
  const say = (name, fn) => RB.defineDescriber('ogn.' + name, fn);
  const num = (e, k, d) => (e[k] == null ? d : e[k]);
  const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
  const lines = list => (list || []).map(x => {
    const d = RB.describers[x.op];
    if (!d) throw new Error('no describer for op: ' + x.op);
    return d(x);
  }).filter(Boolean).join(' ');

  // --- selection ------------------------------------------------------------
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
  function unitsOf(s, p) { return RB.allUnits(s).filter(i => RB.obj(s, i).controller === p); }

  function poolNamed(s, name, ctx) {
    if (name === 'gear') return allGear(s);
    if (name === 'myGear') return allGear(s).filter(i => RB.obj(s, i).controller === ctx.p);
    if (name === 'enemyGear') return allGear(s).filter(i => RB.obj(s, i).controller !== ctx.p);
    if (name === 'myUnitsAndGear')
      return unitsOf(s, ctx.p).concat(allGear(s).filter(i => RB.obj(s, i).controller === ctx.p));
    return RB.select(s, name, ctx);
  }

  // { pick, n, at:'battlefield'|'base', maxMight, other:true, noBuff:true,
  //   prefer:'enemy'|'mine', low:true }
  function targets(s, spec, ctx) {
    if (!spec || typeof spec === 'string') return poolNamed(s, spec, ctx);
    let pool = poolNamed(s, spec.pick, ctx);
    if (spec.other) pool = pool.filter(i => i !== ctx.source);
    if (spec.at === 'battlefield') pool = pool.filter(i => RB.locationOf(s, i).kind === 'bf');
    if (spec.at === 'base') pool = pool.filter(i => RB.locationOf(s, i).kind === 'base');
    if (spec.maxMight !== undefined) pool = pool.filter(i => RB.mightOf(s, i) <= spec.maxMight);
    if (spec.noBuff) pool = pool.filter(i => !RB.obj(s, i).ognBuff);
    if (!pool.length) return [];
    pool = pool.slice().sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    if (spec.low) pool.reverse();
    if (spec.prefer) {
      const want = spec.prefer === 'enemy' ? RB.opponentOf(ctx.p) : ctx.p;
      pool = pool.filter(i => RB.obj(s, i).controller === want)
        .concat(pool.filter(i => RB.obj(s, i).controller !== want));
    }
    return pool.slice(0, spec.n || 1);
  }
  RB.ognTargets = targets;

  const NAMES = {
    self: ['me', 'me'], eventUnit: ['that unit', 'those units'],
    myUnits: ['a friendly unit', 'friendly units'], enemyUnits: ['an enemy unit', 'enemy units'],
    allUnits: ['a unit', 'units'], hereMine: ['a friendly unit there', 'friendly units there'],
    hereEnemy: ['an enemy unit there', 'enemy units there'],
    gear: ['a gear', 'gear'], myGear: ['a friendly gear', 'friendly gear'],
    enemyGear: ['an enemy gear', 'enemy gear'],
    myUnitsAndGear: ['a friendly gear or unit', 'friendly gear or units'],
  };
  function selText(spec) {
    if (!spec || typeof spec === 'string') return (NAMES[spec] || ['me'])[0];
    const n = spec.n || 1;
    const pair = NAMES[spec.pick] || [String(spec.pick), String(spec.pick)];
    let t = n > 1 ? 'up to ' + n + ' ' + pair[1] : pair[0];
    if (spec.other) t = t.replace(/^(a|an) /, 'another ').replace(/^up to (\d+) /, 'up to $1 other ');
    if (spec.at === 'battlefield') t += ' at a battlefield';
    if (spec.at === 'base') t += ' in a base';
    if (spec.maxMight !== undefined) t += ' with ' + spec.maxMight + ' Might or less';
    return t;
  }
  RB.ognSelText = selText;

  // --- Might layer ----------------------------------------------------------
  // Everything this set does to a unit's Might that the core cannot express: a Buff
  // counter (persistent, max one, spendable), "+N/-N this turn to a minimum of M", and a
  // granted Assault/Shield. Stamped with the turn they were made, so "this turn" expires
  // without anything having to sweep them.
  function stamp(o, key, rec, s) {
    o[key] = (o[key] || []).filter(x => x.turn === s.turn);
    o[key].push(rec);
  }
  function clearLayers(o) { o.ognBuff = false; o.ognMods = []; o.ognKw = []; }
  function aloneThere(s, iid) {
    const o = RB.obj(s, iid), loc = RB.locationOf(s, iid);
    if (loc.kind === 'bf') return RB.unitsAt(s, loc.bf, o.controller).length === 1;
    if (loc.kind === 'base') return s.players[loc.p].base
      .filter(i => RB.card(RB.obj(s, i).cardId).type === 'Unit').length === 1;
    return false;
  }

  def('mightThisTurn', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) {
      let n = e.n;
      if (e.aloneBonus && aloneThere(s, iid)) n += e.aloneBonus;
      stamp(RB.obj(s, iid), 'ognMods', { n: n, min: e.min == null ? null : e.min, turn: s.turn }, s);
      RB.log(s, 'mightMod', { iid: iid, n: n, min: e.min == null ? null : e.min });
    }
  });
  say('mightThisTurn', e => 'Give ' + selText(e.target) + ' ' + (e.n < 0 ? '' : '+') + e.n +
    ' Might this turn' + (e.min != null ? ', to a minimum of ' + e.min + ' Might' : '') +
    (e.aloneBonus ? ', then an additional +' + e.aloneBonus +
      ' this turn if it is the only unit you control there' : '') + '.');

  def('grantKeyword', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) {
      stamp(RB.obj(s, iid), 'ognKw', { k: e.keyword, v: num(e, 'value', 1), turn: s.turn }, s);
      RB.log(s, 'grant', { iid: iid, keyword: e.keyword, value: num(e, 'value', 1) });
    }
  });
  say('grantKeyword', e => 'Give ' + selText(e.target) + ' ' + e.keyword + ' ' +
    num(e, 'value', 1) + ' this turn.');

  // The Buff game action (§Buff): a counter worth +1 Might, at most one per unit, gone
  // when the unit leaves play. Buffing an already-buffed unit does nothing, so an
  // already-buffed unit is not a candidate.
  def('buffCounter', (s, e, ctx) => {
    const n = num(e, 'n', 1);
    const spec = e.target === 'self' ? 'self'
      : { pick: 'myUnits', n: n, other: !!e.other, noBuff: true };
    for (const iid of targets(s, spec, ctx)) {
      const o = RB.obj(s, iid);
      if (o.ognBuff) continue;
      o.ognBuff = true;
      RB.log(s, 'buff', { p: ctx.p, iid: iid });
    }
  });
  say('buffCounter', e => e.target === 'self' ? 'Buff me.'
    : 'Buff ' + selText({ pick: 'myUnits', n: num(e, 'n', 1), other: !!e.other }) + '.');

  def('spendBuff', (s, e, ctx) => {
    const got = unitsOf(s, ctx.p).filter(i => RB.obj(s, i).ognBuff);
    if (!got.length) return;
    const iid = got.sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b))[0];
    RB.obj(s, iid).ognBuff = false;
    RB.log(s, 'spendBuff', { p: ctx.p, iid: iid });
  });
  say('spendBuff', () => 'Spend a buff.');

  // --- removal and damage ---------------------------------------------------
  def('damage', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) RB.obj(s, iid).damage += num(e, 'n', 1);
  });
  say('damage', e => 'Deal ' + num(e, 'n', 1) + ' to ' +
    ((e.target && e.target.n > 1) ? 'each of ' : '') + selText(e.target) + '.');

  def('kill', (s, e, ctx) => { for (const iid of targets(s, e.target, ctx)) RB.kill(s, iid); });
  say('kill', e => 'Kill ' + selText(e.target) + '.');

  def('damageAll', (s, e, ctx) => {
    void ctx;
    for (const bf of s.bf) for (const iid of bf.units.slice()) RB.obj(s, iid).damage += num(e, 'n', 1);
  });
  say('damageAll', e => 'Deal ' + num(e, 'n', 1) + ' to all units at battlefields.');

  // Gear that is attached is not in any zone RB.kill knows about, so it is detached and
  // trashed here; everything else goes through RB.kill (and so through the leave hook).
  function killGear(s, iid) {
    const o = RB.obj(s, iid);
    if (!o.attachedTo) return RB.kill(s, iid);
    RB.removeFrom(RB.obj(s, o.attachedTo).attached, iid);
    o.attachedTo = null;
    s.players[o.owner].trash.push(iid);
    RB.log(s, 'die', { iid: iid, p: o.controller }, 'unit.die');
    fireLeave(s, iid, o.controller);
  }
  def('killGear', (s, e, ctx) => {
    if (e.scope === 'all') { for (const g of allGear(s)) killGear(s, g); return; }
    if (e.scope === 'each') {
      for (let q = 0; q < 2; q++) {
        const p = (s.active + q) % 2;                       // turn player chooses first
        const mine = allGear(s).filter(i => RB.obj(s, i).controller === p);
        if (mine.length) killGear(s, mine[0]);              // the oldest gear they control
      }
      return;
    }
    const pool = targets(s, { pick: e.side === 'enemy' ? 'enemyGear' : 'gear', n: num(e, 'n', 1) }, ctx);
    for (const g of pool) killGear(s, g);
  });
  say('killGear', e => e.scope === 'all' ? 'Kill all gear.'
    : e.scope === 'each' ? 'Each player kills one of their gear.'
      : 'Kill ' + selText({ pick: e.side === 'enemy' ? 'enemyGear' : 'gear', n: num(e, 'n', 1) }) + '.');

  def('eachKillsUnit', (s, e, ctx) => {
    void e; void ctx;
    for (let q = 0; q < 2; q++) {
      const p = (s.active + q) % 2;
      const mine = unitsOf(s, p).sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b));
      if (mine.length) RB.kill(s, mine[0]);                 // each player keeps their best
    }
  });
  say('eachKillsUnit', () => 'Each player kills one of their units.');

  // "They deal damage equal to their Mights to each other" — simultaneous, so both
  // amounts are read before either is applied.
  def('duel', (s, e, ctx) => {
    void e;
    const mine = targets(s, { pick: 'myUnits' }, ctx)[0];
    const theirs = targets(s, { pick: 'enemyUnits' }, ctx)[0];
    if (!mine || !theirs) return;
    const a = RB.mightOf(s, mine), b = RB.mightOf(s, theirs);
    RB.obj(s, mine).damage += b;
    RB.obj(s, theirs).damage += a;
    RB.log(s, 'duel', { a: mine, b: theirs, amine: a, atheirs: b });
  });
  say('duel', () => 'Choose a friendly unit and an enemy unit. They deal damage equal to ' +
    'their Mights to each other.');

  // --- leaving the board ----------------------------------------------------
  def('bounce', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) {
      const o = RB.obj(s, iid), loc = RB.locationOf(s, iid);
      if (loc.kind === 'bf') RB.removeFrom(s.bf[loc.bf].units, iid);
      else if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, iid);
      else if (loc.kind === 'bfGear') RB.removeFrom(s.bf[loc.bf].gear, iid);
      else if (o.attachedTo) { RB.removeFrom(RB.obj(s, o.attachedTo).attached, iid); o.attachedTo = null; }
      else continue;
      for (const g of (o.attached || []).slice()) {         // attachments fall to their base
        const go = RB.obj(s, g);
        go.attachedTo = null;
        s.players[go.owner].base.push(g);
      }
      o.attached = [];
      o.damage = 0; o.buffs = 0; o.granted = []; o.exhausted = false;
      o.temporary = false; o.movedThisTurn = 0;
      delete o.role;
      clearLayers(o);
      if (!o.token) s.players[o.owner].hand.push(iid);      // a token ceases to exist
      RB.log(s, 'bounce', { p: o.controller, iid: iid }, 'unit.move');
      fireLeave(s, iid, o.controller);
    }
  });
  say('bounce', e => 'Return ' + selText(e.target) + " to its owner's hand.");

  def('makeTemporary', (s, e, ctx) => {
    void e;
    const iid = targets(s, { pick: 'allUnits', at: 'battlefield', prefer: 'enemy' }, ctx)[0]
      || targets(s, { pick: 'gear', prefer: 'enemy' }, ctx)[0];
    if (!iid) return;
    RB.obj(s, iid).temporary = true;
    RB.log(s, 'temporary', { iid: iid, p: RB.obj(s, iid).controller });
  });
  say('makeTemporary', () => 'Give a unit at a battlefield, or a gear, Temporary.');

  // --- movement -------------------------------------------------------------
  // Effect-driven movement: no exhaust cost, and the destination is the one the stated
  // rule picks. `to:'here'` is the battlefield this card is standing on.
  function relocate(s, iid, dest) {
    const o = RB.obj(s, iid), loc = RB.locationOf(s, iid);
    if (loc.kind === 'bf') RB.removeFrom(s.bf[loc.bf].units, iid);
    else if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, iid);
    else return false;
    if (dest === 'base') s.players[o.controller].base.push(iid);
    else {
      s.bf[dest].units.push(iid);
      o.movedThisTurn++;
      RB.applyContested(s, dest, o.controller);
    }
    RB.log(s, 'move', { p: o.controller, iid: iid, to: dest === 'base' ? 'base' : 'bf' + dest }, 'unit.move');
    return true;
  }
  function destinationFor(s, iid, to, ctx) {
    if (to === 'base') return RB.locationOf(s, iid).kind === 'base' ? null : 'base';
    if (to === 'here') {
      const here = RB.locationOf(s, ctx.source);
      if (here.kind !== 'bf') return null;
      return RB.locationOf(s, iid).bf === here.bf ? null : here.bf;
    }
    // 'battlefield': the one where its controller already stands, else the first one.
    const p = RB.obj(s, iid).controller, from = RB.locationOf(s, iid);
    let best = -1, bestN = -1;
    for (let i = 0; i < s.bf.length; i++) {
      if (from.kind === 'bf' && from.bf === i) continue;
      const n = RB.unitsAt(s, i, p).length;
      if (n > bestN) { bestN = n; best = i; }
    }
    return best < 0 ? null : best;
  }
  def('moveUnit', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) {
      const dest = destinationFor(s, iid, e.to, ctx);
      if (dest === null) continue;
      if (!relocate(s, iid, dest)) continue;
      if (e.ready) RB.obj(s, iid).exhausted = false;
    }
  });
  say('moveUnit', e => 'Move ' + selText(e.target) +
    (e.to === 'base' ? ' to its base' : e.to === 'here' ? ' here' :
      ' to a battlefield') + (e.ready ? ' and ready it' : '') + '.');

  def('readyOther', (s, e, ctx) => {
    void e;
    const pool = targets(s, { pick: 'myUnits', other: true }, ctx)
      .filter(i => RB.obj(s, i).exhausted);
    const iid = pool[0] || targets(s, { pick: 'myUnits', other: true }, ctx)[0];
    if (iid) RB.obj(s, iid).exhausted = false;
  });
  say('readyOther', () => 'Ready another unit you control.');

  // --- cards, decks and hands ----------------------------------------------
  def('channelElseDraw', (s, e, ctx) => {
    const P = s.players[ctx.p], n = num(e, 'n', 1), before = P.runes.length;
    RB.channel(s, ctx.p, n, true);
    if (P.runes.length - before < n) for (let i = 0; i < num(e, 'draw', 1); i++) RB.draw(s, ctx.p);
  });
  say('channelElseDraw', e => 'Channel ' + num(e, 'n', 1) + ' rune' + (num(e, 'n', 1) === 1 ? '' : 's') +
    ' exhausted. If you couldn\'t channel ' + num(e, 'n', 1) + ' rune' + (num(e, 'n', 1) === 1 ? '' : 's') +
    ' this way, draw ' + num(e, 'draw', 1) + '.');

  // Look at the top N and keep `take`: the stated rule keeps the most expensive, which is
  // the card you were least likely to be able to cast off the top anyway.
  def('digTop', (s, e, ctx) => {
    const P = s.players[ctx.p];
    const look = P.deck.splice(0, Math.min(num(e, 'n', 3), P.deck.length));
    if (!look.length) return;
    const order = look.slice().sort((a, b) => (RB.cardOf(s, b).energy || 0) - (RB.cardOf(s, a).energy || 0));
    for (const iid of order.slice(0, num(e, 'take', 1))) {
      RB.removeFrom(look, iid);
      P.hand.push(iid);
      RB.log(s, 'draw', { p: ctx.p, iid: iid }, 'card.draw');
    }
    RB.shuffle(s, look);                                    // simultaneous recycles: random order
    P.deck.push(...look);
    RB.log(s, 'recycle', { p: ctx.p, n: look.length });
  });
  say('digTop', e => 'Look at the top ' + num(e, 'n', 3) + ' cards of your Main Deck. Put ' +
    num(e, 'take', 1) + ' into your hand and recycle the rest.');

  def('returnSpellFromTrash', (s, e, ctx) => {
    void e;
    const P = s.players[ctx.p];
    const pool = P.trash.filter(i => RB.cardOf(s, i).type === 'Spell')
      .sort((a, b) => (RB.cardOf(s, b).energy || 0) - (RB.cardOf(s, a).energy || 0));
    if (!pool.length) return;
    RB.removeFrom(P.trash, pool[0]);
    P.hand.push(pool[0]);
    RB.log(s, 'returnFromTrash', { p: ctx.p, iid: pool[0] }, 'card.draw');
  });
  say('returnSpellFromTrash', () => 'Return a spell from your trash to your hand.');

  // "Play a unit from your trash, ignoring its Energy cost" — the Power cost is still
  // paid, so a unit whose Power cannot be paid right now is not a legal choice.
  def('playUnitFromTrash', (s, e, ctx) => {
    void e;
    const P = s.players[ctx.p];
    const pool = P.trash.filter(i => RB.cardOf(s, i).type === 'Unit')
      .sort((a, b) => (RB.card(RB.obj(s, b).cardId).might || 0) - (RB.card(RB.obj(s, a).cardId).might || 0));
    for (const iid of pool) {
      const cost = RB.costOf(s, iid);
      cost.energy = 0;
      const plan = RB.planPayment(s, ctx.p, cost);
      if (!plan) continue;
      RB.pay(s, ctx.p, plan);
      RB.removeFrom(P.trash, iid);
      RB.log(s, 'play', { p: ctx.p, iid: iid, card: RB.obj(s, iid).cardId, to: 'base' }, 'unit.deploy');
      RB.resolveCard(s, { iid: iid, controller: ctx.p, to: 'base', kind: 'card', targets: [] });
      return;
    }
  });
  say('playUnitFromTrash', () => 'Play a unit from your trash, ignoring its Energy cost.');

  // Reveal from the top UNTIL a unit turns up — not "look at the top N": the whole deck
  // is walked if it has to be, which is the difference between this card and a cantrip.
  def('playUnitFromDeck', (s, e, ctx) => {
    void e;
    const P = s.players[ctx.p];
    const at = P.deck.findIndex(i => RB.cardOf(s, i).type === 'Unit');
    if (at < 0) return;
    const revealed = P.deck.splice(0, at + 1);
    const unit = revealed.pop();
    RB.log(s, 'reveal', { p: ctx.p, n: revealed.length + 1 });
    P.banished.push(unit);
    RB.log(s, 'banish', { p: ctx.p, iid: unit });
    RB.shuffle(s, revealed);
    P.deck.push(...revealed);
    RB.removeFrom(P.banished, unit);
    RB.log(s, 'play', { p: ctx.p, iid: unit, card: RB.obj(s, unit).cardId, to: 'base' }, 'unit.deploy');
    RB.resolveCard(s, { iid: unit, controller: ctx.p, to: 'base', kind: 'card', targets: [] });
  });
  say('playUnitFromDeck', () => 'Reveal cards from the top of your Main Deck until you reveal ' +
    'a unit and banish it. Play it, ignoring its cost, and recycle the rest.');

  def('discardChosen', (s, e, ctx) => {
    const P = s.players[e.opponent ? RB.opponentOf(ctx.p) : ctx.p];
    const pool = P.hand.slice().sort((a, b) => (RB.cardOf(s, b).energy || 0) - (RB.cardOf(s, a).energy || 0));
    for (const iid of pool.slice(0, num(e, 'n', 1))) {
      RB.removeFrom(P.hand, iid);
      P.trash.push(iid);
      RB.log(s, 'discard', { p: e.opponent ? RB.opponentOf(ctx.p) : ctx.p, iid: iid });
    }
  });
  say('discardChosen', e => 'Choose an opponent. They reveal their hand. Choose ' +
    num(e, 'n', 1) + ' card from it, and they discard that card.');

  def('recycleFromHand', (s, e, ctx) => {
    const who = e.opponent ? RB.opponentOf(ctx.p) : ctx.p;
    const P = s.players[who];
    const pool = P.hand.filter(i => e.filter !== 'nonUnit' || RB.cardOf(s, i).type !== 'Unit')
      .sort((a, b) => (RB.cardOf(s, b).energy || 0) - (RB.cardOf(s, a).energy || 0));
    if (!pool.length) return;
    RB.removeFrom(P.hand, pool[0]);
    P.deck.push(pool[0]);
    RB.log(s, 'recycle', { p: who, iid: pool[0], n: 1 });
  });
  say('recycleFromHand', e => 'Choose an opponent. They reveal their hand. Choose a ' +
    (e.filter === 'nonUnit' ? 'non-unit ' : '') + 'card from it, and recycle that card.');

  // --- conditionals and modifiers ------------------------------------------
  // "You may": taken by the stated rule rather than a prompt. `when` is the condition
  // under which taking it is the play — a "may" whose condition fails is simply declined.
  def('may', (s, e, ctx) => {
    const when = e.when || 'always';
    const ok = when === 'always'
      || (when === 'enemyGear' && targets(s, { pick: 'enemyGear' }, ctx).length)
      || (when === 'enemyUnit' && targets(s, { pick: 'enemyUnits' }, ctx).length)
      || (when === 'myBuff' && unitsOf(s, ctx.p).some(i => RB.obj(s, i).ognBuff));
    if (!ok) return;
    RB.runEffects(s, e.effects, ctx);
  });
  say('may', e => {
    const all = (e.effects || []).map(x => RB.describers[x.op](x)).filter(Boolean);
    const head = all.shift() || '';
    return 'You may ' + lower(head) + (all.length ? ' If you do, ' + lower(all.join(' ')) : '');
  });

  // A battlefield's own trigger cannot use the core's `here:true` — RB.locationOf has no
  // answer for a battlefield card, so the flag would silently drop every firing. This is
  // the same test asked the other way round: is the event's battlefield this card's?
  def('ifHere', (s, e, ctx) => {
    if (!ctx.event || ctx.event.bf === undefined) return;
    const mine = s.bf.findIndex(b => b.iid === ctx.source);
    const at = mine >= 0 ? mine : RB.locationOf(s, ctx.source).bf;
    if (at !== ctx.event.bf) return;
    RB.runEffects(s, e.effects, ctx);
  });
  say('ifHere', e => 'if it is this battlefield, ' + lower(lines(e.effects)));

  def('ifAtBattlefield', (s, e, ctx) => {
    if (RB.locationOf(s, ctx.source).kind !== 'bf') return;
    RB.runEffects(s, e.effects, ctx);
  });
  say('ifAtBattlefield', e => "while I'm at a battlefield, " + lower(lines(e.effects)));

  def('onceEachPlayer', (s, e, ctx) => {
    const o = RB.obj(s, ctx.source);
    o.ognSeen = o.ognSeen || [];
    if (o.ognSeen.includes(ctx.p)) return;
    o.ognSeen.push(ctx.p);
    RB.runEffects(s, e.effects, ctx);
  });
  say('onceEachPlayer', e => 'the first time each player does so, ' + lower(lines(e.effects)));

  // The guard that makes a death effect fire exactly once even if another pack's ops file
  // also wraps RB.kill and fires this card's death trigger a second time.
  def('once', (s, e, ctx) => {
    const o = s.objects[ctx.source];
    if (!o || !o.ognDeath) return;
    o.ognDeath = 0;
    RB.runEffects(s, e.effects, ctx);
  });
  say('once', e => lines(e.effects));

  def('raiseVictoryScore', (s, e, ctx) => {
    const o = RB.obj(s, ctx.source);
    if (o.ognRaised) return;
    o.ognRaised = true;
    s.victoryScore += num(e, 'n', 1);
    RB.log(s, 'victoryScore', { n: s.victoryScore });
  });
  say('raiseVictoryScore', e => 'Increase the points needed to win the game by ' +
    num(e, 'n', 1) + ' (once per game).');

  def('readyRunesAtEndOfTurn', (s, e, ctx) => {
    s.ognDelayed = (s.ognDelayed || []).filter(d => d.turn === s.turn);
    s.ognDelayed.push({ p: ctx.p, n: num(e, 'n', 1), turn: s.turn });
    RB.log(s, 'delayed', { p: ctx.p, n: num(e, 'n', 1) });
  });
  say('readyRunesAtEndOfTurn', e => 'Ready up to ' + num(e, 'n', 1) +
    ' runes at the end of this turn.');

  def('lockOpponentPlays', (s, e, ctx) => {
    void e;
    s.ognNoPlay = { p: RB.opponentOf(ctx.p), turn: s.turn };
    RB.log(s, 'noPlay', { p: RB.opponentOf(ctx.p) });
  });
  say('lockOpponentPlays', () => "Opponents can't play cards this turn.");

  // ==========================================================================
  // Core wrappers. Each reads only `ogn`-prefixed fields, so a second set's wrapper on
  // the same function composes instead of double-counting.
  // ==========================================================================

  // 1. Might. The core knows a printed Might, buffs, battlefield statics and attached
  //    gear; this adds the Buff counter, this-turn modifiers with their own floors, and
  //    granted Assault/Shield (which the core has no reader for at all).
  const baseMight = RB.mightOf;
  RB.mightOf = function (s, iid) {
    let m = baseMight(s, iid);
    const o = s.objects[iid];
    if (!o) return m;
    if (o.ognBuff) m += 1;
    for (const mod of o.ognMods || []) {
      if (mod.turn !== s.turn) continue;
      m += mod.n;
      if (mod.min != null && m < mod.min) m = mod.min;
    }
    if (o.role) for (const k of o.ognKw || []) {
      if (k.turn !== s.turn) continue;
      if (k.k === 'Assault' && o.role === 'attacker') m += k.v;
      if (k.k === 'Shield' && o.role === 'defender') m += k.v;
    }
    return Math.max(0, m);
  };

  // 2. Leaving the board. The core raises no event when a permanent dies, so Deathknell
  //    and "when this leaves the board" have nowhere to hang. `ogn.once` inside every one
  //    of those effects keeps a second, foreign firing of the same death from repeating it.
  function fireLeave(s, iid, p) {
    const ab = RB.cardOf(s, iid).abilities;
    if (!ab || !ab.triggers) return;
    const o = s.objects[iid];
    const prev = s.via;
    for (const t of ab.triggers) {
      if (t.on !== 'deathknell' && t.on !== 'leftBoard') continue;
      o.ognDeath = 1;
      s.via = { iid: iid };
      RB.runEffects(s, t.effects, { p: p, source: iid, event: { p: p, iid: iid } });
      s.via = prev;
    }
    o.ognDeath = 0;
  }

  const baseKill = RB.kill;
  RB.kill = function (s, iid) {
    const loc = RB.locationOf(s, iid);
    const onBoard = loc.kind === 'base' || loc.kind === 'bf' || loc.kind === 'bfGear';
    const o = s.objects[iid];
    const p = o ? o.controller : null;
    baseKill(s, iid);
    if (!onBoard || !o) return;
    clearLayers(o);
    fireLeave(s, iid, p);
  };

  // 3. Delayed end-of-turn effects ("… at the end of this turn"). Flushed after the
  //    core's own endOfTurn triggers, while it is still this turn.
  const baseRunTriggers = RB.runTriggers;
  RB.runTriggers = function (s, event, data) {
    baseRunTriggers(s, event, data);
    if (event !== 'endOfTurn') return;
    const pending = s.ognDelayed || [];
    s.ognDelayed = [];
    for (const d of pending) {
      if (d.turn !== s.turn) continue;
      const rs = s.players[d.p].runes.filter(i => RB.obj(s, i).exhausted).slice(0, d.n);
      for (const i of rs) { RB.obj(s, i).exhausted = false; RB.log(s, 'runeReady', { p: d.p, iid: i }, 'rune.ready'); }
    }
  };

  // 4. "Opponents can't play cards this turn." Legality in this engine is whatever
  //    RB.legalActions offers, so that is where a play restriction has to live.
  const baseLegal = RB.legalActions;
  RB.legalActions = function (s) {
    const acts = baseLegal(s);
    const lock = s.ognNoPlay;
    if (!lock || lock.turn !== s.turn) return acts;
    if (RB.whoActs(s) !== lock.p) return acts;
    const out = acts.filter(a => a.t !== 'play');
    return out.length ? out : [{ t: 'pass' }];
  };

})(window.RB = window.RB || {});
