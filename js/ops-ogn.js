// Ops added for the Origins set. Handlers and describers only — js/abilities.js and
// js/text.js are never edited. Three things are worth knowing before reading on:
//
// 1. NAMESPACED OP NAMES. Every op defined here is `ogn.<name>`. Three sets are authored
//    in parallel into three ops files that all write into the same RB.ops table, and the
//    last file loaded silently wins a name collision. A prefix makes that impossible.
//
// 2. WHAT IS *NOT* HERE. Optionality is the core's `may` (a real queue step the human
//    answers and the AI answers through legalActions) and death triggers are the core's
//    `deathknell`; neither is re-invented here. What remains are the clauses the core has
//    no primitive for. The POOL a clause may choose from is always exactly what the card
//    prints — `prefer` only orders a pool, it never trims one — and where a choice is
//    still resolved by a stated rule rather than a prompt (which gear, which destination),
//    the describer says which branch it takes, so the narrowing shows up in the audit
//    instead of hiding in a handler.
//
// 3. FOUR CORE FUNCTIONS ARE WRAPPED (bottom of this file): a Might layer the core has no
//    reader for (Buff counters, "-N to a minimum of M", granted Assault/Shield), a
//    "leaves the board" event, delayed end-of-turn effects, and a play restriction. Each
//    wrapper reads ONLY fields prefixed `ogn`, so a second set's wrapper on the same
//    function composes with this one instead of double-counting its data.
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

  // A pick spec: { pick, n, at:'battlefield'|'base', maxMight, other:true, noBuff:true,
  //                prefer:'enemy'|'mine', low:true }
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
    if (spec.other) t = t.replace(/^an? /, 'another ').replace(/^up to (\d+) /, 'up to $1 other ');
    if (spec.at === 'battlefield') t += ' at a battlefield';
    if (spec.at === 'base') t += ' in a base';
    if (spec.maxMight !== undefined) t += ' with ' + spec.maxMight + ' Might or less';
    return t;
  }
  RB.ognSelText = selText;

  // --- the Might layer ------------------------------------------------------
  // Everything this set does to a Might that the core has no reader for: the Buff counter
  // (persistent, at most one, spendable), "+N/-N this turn" with its own floor, and a
  // granted Assault/Shield. Each record is stamped with the turn it was made, so "this
  // turn" expires without anything having to sweep it up.
  function stamp(s, o, key, rec) {
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
      stamp(s, RB.obj(s, iid), 'ognMods', { n: n, min: e.min == null ? null : e.min, turn: s.turn });
      RB.log(s, 'mightMod', { iid: iid, n: n, min: e.min == null ? null : e.min });
    }
  });
  say('mightThisTurn', e => 'Give ' + selText(e.target) + ' ' + (e.n < 0 ? '' : '+') + e.n +
    ' Might this turn' + (e.min != null ? ', to a minimum of ' + e.min + ' Might' : '') +
    (e.aloneBonus ? ', then an additional +' + e.aloneBonus +
      ' Might this turn if it is the only unit you control there' : '') + '.');

  def('grantKeyword', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) {
      stamp(s, RB.obj(s, iid), 'ognKw', { k: e.keyword, v: num(e, 'value', 1), turn: s.turn });
      RB.log(s, 'grant', { iid: iid, keyword: e.keyword, value: num(e, 'value', 1) });
    }
  });
  say('grantKeyword', e => 'Give ' + selText(e.target) + ' ' + e.keyword + ' ' +
    num(e, 'value', 1) + ' this turn.');

  // The Buff game action: a counter worth +1 Might, at most one per unit, gone when the
  // unit leaves play. Buffing an already-buffed unit does nothing and is not a choice, so
  // an already-buffed unit is not a candidate.
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
    void e;
    const got = unitsOf(s, ctx.p).filter(i => RB.obj(s, i).ognBuff);
    if (!got.length) return;
    const iid = got.sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b))[0];   // the cheapest to lose
    RB.obj(s, iid).ognBuff = false;
    RB.log(s, 'spendBuff', { p: ctx.p, iid: iid });
  });
  say('spendBuff', () => 'Spend a buff.');

  // --- damage and removal ---------------------------------------------------
  // The core's `damage`/`kill` take the core's selectors, which cannot say "a unit"
  // (either side's) while still picking the one a player would pick. These keep the
  // printed pool and order it with `prefer`.
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

  // Attached gear is in no zone RB.kill knows about, so it is detached and trashed here;
  // everything else goes through RB.kill and so through the leave hook.
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
        const p = (s.active + q) % 2;                        // the turn player chooses first
        const mine = allGear(s).filter(i => RB.obj(s, i).controller === p);
        if (mine.length) killGear(s, mine[0]);               // the oldest gear they control
      }
      return;
    }
    for (const g of targets(s, { pick: e.side === 'enemy' ? 'enemyGear' : 'gear', n: num(e, 'n', 1) }, ctx))
      killGear(s, g);
  });
  say('killGear', e => e.scope === 'all' ? 'Kill all gear.'
    : e.scope === 'each' ? 'Each player kills one of their gear.'
      : 'Kill ' + selText({ pick: e.side === 'enemy' ? 'enemyGear' : 'gear', n: num(e, 'n', 1) }) + '.');

  def('eachKillsUnit', (s, e, ctx) => {
    void e; void ctx;
    for (let q = 0; q < 2; q++) {
      const p = (s.active + q) % 2;
      const mine = unitsOf(s, p).sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b));
      if (mine.length) RB.kill(s, mine[0]);                  // each player keeps their best
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
    RB.log(s, 'duel', { a: mine, b: theirs });
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
      for (const g of (o.attached || []).slice()) {           // attachments fall to their base
        const go = RB.obj(s, g);
        go.attachedTo = null;
        s.players[go.owner].base.push(g);
      }
      o.attached = [];
      o.damage = 0; o.buffs = 0; o.granted = []; o.exhausted = false;
      o.stunned = false; o.temporary = false; o.movedThisTurn = 0;
      delete o.role;
      clearLayers(o);
      if (!o.token) s.players[o.owner].hand.push(iid);        // a token ceases to exist
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
  say('makeTemporary', () => 'Give a unit at a battlefield or a gear Temporary.');

  // --- movement -------------------------------------------------------------
  // An effect's move: no exhaust cost (that is the Standard Move's cost, not a move's),
  // and it raises `moved` exactly as the Standard Move does. `to:'here'` is the
  // battlefield the card whose ability this is stands on.
  function relocate(s, iid, dest) {
    const o = RB.obj(s, iid), from = RB.locationOf(s, iid);
    if (from.kind === 'bf') RB.removeFrom(s.bf[from.bf].units, iid);
    else if (from.kind === 'base') RB.removeFrom(s.players[from.p].base, iid);
    else return;
    if (dest === 'base') s.players[o.controller].base.push(iid);
    else {
      s.bf[dest].units.push(iid);
      o.movedThisTurn++;
      RB.applyContested(s, dest, o.controller);
    }
    RB.log(s, 'move', { p: o.controller, iid: iid, to: dest === 'base' ? 'base' : 'bf' + dest }, 'unit.move');
    RB.runTriggers(s, 'moved', { p: o.controller, iid: iid,
      bf: dest === 'base' ? undefined : dest, fromBf: from.kind === 'bf' ? from.bf : undefined });
  }
  function destinationFor(s, iid, to, ctx) {
    if (to === 'base') return RB.locationOf(s, iid).kind === 'base' ? null : 'base';
    if (to === 'here') {
      const here = RB.locationOf(s, ctx.source);
      if (here.kind !== 'bf') return null;
      return RB.locationOf(s, iid).bf === here.bf ? null : here.bf;
    }
    // 'battlefield': the one where its controller already stands, else the first.
    const p = RB.obj(s, iid).controller, from = RB.locationOf(s, iid);
    let best = null, bestN = -1;
    for (let i = 0; i < s.bf.length; i++) {
      if (from.kind === 'bf' && from.bf === i) continue;
      const n = RB.unitsAt(s, i, p).length;
      if (n > bestN) { bestN = n; best = i; }
    }
    return best;
  }
  def('moveUnit', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) {
      const dest = destinationFor(s, iid, e.to, ctx);
      if (dest === null) continue;
      relocate(s, iid, dest);
      if (e.ready && RB.locationOf(s, iid).kind !== 'nowhere') RB.obj(s, iid).exhausted = false;
    }
  });
  say('moveUnit', e => 'Move ' + selText(e.target) +
    (e.to === 'base' ? ' to its base' : e.to === 'here' ? ' here' : ' to a battlefield') +
    (e.ready ? ' and ready it' : '') + '.');

  def('readyOther', (s, e, ctx) => {
    void e;
    const pool = targets(s, { pick: 'myUnits', other: true, n: 99 }, ctx);
    const iid = pool.filter(i => RB.obj(s, i).exhausted)[0];
    if (iid) { RB.obj(s, iid).exhausted = false; RB.log(s, 'ready', { p: ctx.p, iid: iid }); }
  });
  say('readyOther', () => 'Ready another unit you control.');

  // --- decks, hands and trashes --------------------------------------------
  def('channelElseDraw', (s, e, ctx) => {
    const P = s.players[ctx.p], n = num(e, 'n', 1), before = P.runes.length;
    RB.channel(s, ctx.p, n, true);
    if (P.runes.length - before < n) for (let i = 0; i < num(e, 'draw', 1); i++) RB.draw(s, ctx.p);
  });
  say('channelElseDraw', e => {
    const n = num(e, 'n', 1), r = ' rune' + (n === 1 ? '' : 's');
    return 'Channel ' + n + r + ' exhausted. If you couldn\'t channel ' + n + r +
      ' this way, draw ' + num(e, 'draw', 1) + '.';
  });

  // Look at the top N and keep one: the stated rule keeps the most expensive, the card
  // you were least likely to be able to play off the top anyway.
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
    RB.shuffle(s, look);                                     // simultaneous recycles: random order
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

  // "Play a unit from your trash, ignoring its Energy cost." The Power cost is still
  // paid, so a unit whose Power cannot be paid right now is not a legal choice.
  def('playUnitFromTrash', (s, e, ctx) => {
    void e;
    const P = s.players[ctx.p];
    const pool = P.trash.filter(i => RB.cardOf(s, i).type === 'Unit')
      .sort((a, b) => (RB.cardOf(s, b).might || 0) - (RB.cardOf(s, a).might || 0));
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
    const who = e.opponent ? RB.opponentOf(ctx.p) : ctx.p;
    const P = s.players[who];
    const pool = P.hand.slice().sort((a, b) => (RB.cardOf(s, b).energy || 0) - (RB.cardOf(s, a).energy || 0));
    for (const iid of pool.slice(0, num(e, 'n', 1))) {
      RB.removeFrom(P.hand, iid);
      P.trash.push(iid);
      RB.log(s, 'discard', { p: who, iid: iid });
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
    P.deck.push(pool[0]);                                    // recycle: the bottom of their deck
    RB.log(s, 'recycle', { p: who, iid: pool[0], n: 1 });
  });
  say('recycleFromHand', e => 'Choose an opponent. They reveal their hand. Choose a ' +
    (e.filter === 'nonUnit' ? 'non-unit ' : '') + 'card from it, and recycle that card.');

  // --- the chain ------------------------------------------------------------
  // Counter, but only a spell inside a printed cost bound. The core's `counter` takes the
  // chain's head unconditionally; the bound is the whole of what this card may choose, so
  // a head outside it is simply not countered.
  def('counterSpell', (s, e, ctx) => {
    const item = s.chain[s.chain.length - 1];
    if (!item) return;
    const card = RB.cardOf(s, item.iid);
    if (item.kind !== 'card' || card.type !== 'Spell') return;
    if (e.maxEnergy !== undefined && (card.energy || 0) > e.maxEnergy) return;
    if (e.maxPower !== undefined && (card.power || 0) > e.maxPower) return;
    s.chain.pop();
    s.players[item.controller].trash.push(item.iid);
    RB.log(s, 'counter', { p: ctx.p, iid: item.iid }, 'chain.resolve');
  });
  say('counterSpell', e => 'Counter a spell that costs no more than ' + e.maxEnergy +
    ' and no more than ' + e.maxPower + ' Power.');

  // --- conditions -----------------------------------------------------------
  // One guard op with a named test, because a condition that reads as false when it is
  // really "unknown" is how a clause goes missing. An unknown test throws.
  const TESTS = {
    // A battlefield's own trigger cannot use the core's `here:true`: RB.locationOf has no
    // answer for a battlefield card, so the flag would skip every firing instead. This is
    // that question asked the other way round.
    here: (s, ctx) => {
      if (!ctx.event || ctx.event.bf === undefined) return false;
      const own = s.bf.findIndex(b => b.iid === ctx.source);
      const at = own >= 0 ? own : RB.locationOf(s, ctx.source).bf;
      return at === ctx.event.bf;
    },
    atBattlefield: (s, ctx) => RB.locationOf(s, ctx.source).kind === 'bf',
    selfMoved: (s, ctx) => !!ctx.event && ctx.event.iid === ctx.source,
    anyGear: s => allGear(s).length > 0,
    myBuff: (s, ctx) => unitsOf(s, ctx.p).some(i => RB.obj(s, i).ognBuff),
  };
  const TEST_WORDS = {
    here: 'if it is this battlefield, ',
    atBattlefield: "while I'm at a battlefield, ",
    selfMoved: 'if it is me, ',
    anyGear: 'if there is a gear on the board, ',
    myBuff: 'if you control a buffed unit, ',
  };
  def('when', (s, e, ctx) => {
    const t = TESTS[e.test];
    if (!t) throw new Error('ogn.when: unknown test ' + e.test);
    if (t(s, ctx)) RB.runEffects(s, e.effects, ctx);
  });
  say('when', e => {
    if (!TEST_WORDS[e.test]) throw new Error('ogn.when: unknown test ' + e.test);
    return TEST_WORDS[e.test] + lower(lines(e.effects));
  });

  def('onceEachPlayer', (s, e, ctx) => {
    const o = RB.obj(s, ctx.source);
    o.ognSeen = o.ognSeen || [];
    if (o.ognSeen.includes(ctx.p)) return;
    o.ognSeen.push(ctx.p);
    RB.runEffects(s, e.effects, ctx);
  });
  say('onceEachPlayer', e => 'the first time each player does so, ' + lower(lines(e.effects)));

  // --- game-level modifiers -------------------------------------------------
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
  // the same function composes with this one instead of double-counting its data.
  // ==========================================================================

  // 1. Might. The core reads printed Might, buffs, statics and attached gear; this adds
  //    the Buff counter, this-turn modifiers with their own floors, and granted
  //    Assault/Shield, which nothing in the core reads at all.
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

  // 2. Leaving the board. The core raises `deathknell` and `died` for a kill, but a card
  //    that says "when this LEAVES THE BOARD" also means a return to hand, so that event
  //    is raised here from both exits, and the layer fields above are cleared on the way
  //    out (a Buff vanishes when its unit leaves play, and this object can come back).
  function fireLeave(s, iid, p) {
    const ab = RB.cardOf(s, iid).abilities;
    if (!ab || !ab.triggers) return;
    const prev = s.via;
    for (const t of ab.triggers) {
      if (t.on !== 'leftBoard') continue;
      s.via = { iid: iid };
      RB.runEffects(s, t.effects, { p: p, source: iid, event: { p: p, iid: iid } });
      s.via = prev;
    }
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
  //    RB.legalActions offers, so a play restriction has nowhere else to live.
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
