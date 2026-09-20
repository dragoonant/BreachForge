// Ops added for the Origins set. Handlers and describers only — js/abilities.js and
// js/text.js are never edited. Four things are worth knowing before reading on:
//
// 1. NAMESPACED OP NAMES. Every op defined here is `ogn.<name>`. Three sets are authored
//    in parallel into three ops files that all write into the same RB.ops table, and the
//    last file loaded silently wins a name collision. A prefix makes that impossible.
//
// 2. WHAT IS *NOT* HERE. Optionality is the core's `may`; a death trigger is the core's
//    `deathknell`; "at the end of this turn" is the core's `delayed`; a condition or a
//    computed number on a continuous modifier goes into RB.defineStaticWhen /
//    RB.defineStaticAmount, never into a wrapper of RB.staticsOn. What is left here is
//    only what the core has no primitive for.
//
// 3. CHOICES. Where a choice is still resolved by a stated rule rather than a prompt
//    (which gear, which destination), the describer says which branch it takes, so the
//    narrowing shows up in the audit instead of hiding in a handler. The POOL is always
//    exactly what the card prints: `prefer` orders a pool, it never trims one.
//
// 4. THREE CORE FUNCTIONS ARE STILL WRAPPED, and only these:
//      * RB.mightOf — the Buff counter, "-N this turn to a minimum of M", and Assault /
//        Shield, none of which anything in the core reads. A static cannot carry them:
//        a Buff is a counter on an arbitrary unit and Assault is granted by a spell that
//        is in the trash by the time it matters.
//      * RB.kill — a Buff must vanish when its unit leaves play, a card that says "when
//        THIS leaves the board" needs a self-dispatch (the core's `leftBoard` walks the
//        board, so the leaving card, already lifted out of its zone, never hears its own
//        event), and a Deathknell that recycles itself has to finish after the core has
//        put the card in the trash.
//      * RB.legalActions — "opponents can't play cards this turn". Legality here is
//        whatever legalActions offers, so a play restriction has nowhere else to live.
//    Each reads only `ogn`-prefixed fields plus `o.counters`, which is the core's own Buff
//    representation (RB.defineExtraCost('spendBuff') spends exactly that). The wrapper of
//    RB.runTriggers that used to carry "at the end of this turn" is gone: that is the
//    core's `delayed` now.
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
  function facedownOf(s, p) {
    const out = [];
    for (const bf of s.bf) for (const h of bf.hidden) if (h.owner === p) out.push(h.iid);
    return out;
  }

  function poolNamed(s, name, ctx) {
    if (name === 'gear') return allGear(s);
    if (name === 'myGear') return allGear(s).filter(i => RB.obj(s, i).controller === ctx.p);
    if (name === 'enemyGear') return allGear(s).filter(i => RB.obj(s, i).controller !== ctx.p);
    if (name === 'myUnitsAndGear')
      return unitsOf(s, ctx.p).concat(allGear(s).filter(i => RB.obj(s, i).controller === ctx.p));
    if (name === 'myUnitsGearOrFacedown')
      return unitsOf(s, ctx.p).concat(allGear(s).filter(i => RB.obj(s, i).controller === ctx.p))
        .concat(facedownOf(s, ctx.p));
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
    if (spec.noBuff) pool = pool.filter(i => !RB.obj(s, i).counters);
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

  // [singular, plural]. A bare selector name means every member of that pool ("give enemy
  // units -3"); a { pick } spec means one of them is chosen.
  const NAMES = {
    self: ['me', 'me'], eventUnit: ['that unit', 'those units'],
    myUnits: ['a friendly unit', 'friendly units'], enemyUnits: ['an enemy unit', 'enemy units'],
    allUnits: ['a unit', 'all units'], hereMine: ['a friendly unit there', 'your units there'],
    hereEnemy: ['an enemy unit there', 'enemy units there'],
    gear: ['a gear', 'all gear'], myGear: ['a friendly gear', 'your gear'],
    enemyGear: ['an enemy gear', 'enemy gear'],
    myUnitsAndGear: ['a friendly gear or unit', 'your gear and units'],
    myUnitsGearOrFacedown: ['a friendly gear, unit, or facedown card', 'your cards on the board'],
  };
  function selText(spec) {
    if (!spec || typeof spec === 'string') {
      const pair = NAMES[spec] || ['me', 'me'];
      return spec === 'self' || spec === 'eventUnit' ? pair[0] : pair[1];
    }
    const n = spec.n || 1;
    const pair = NAMES[spec.pick] || [String(spec.pick), String(spec.pick)];
    let t = n > 1 ? 'up to ' + n + ' ' + pluralOf(pair[0]) : pair[0];
    if (spec.other) t = t.replace(/^an? /, 'another ').replace(/^up to (\d+) /, 'up to $1 other ');
    if (spec.at === 'battlefield') t += ' at a battlefield';
    if (spec.at === 'base') t += ' in a base';
    if (spec.maxMight !== undefined) t += ' with ' + spec.maxMight + ' Might or less';
    return t;
  }
  function pluralOf(singular) { return singular.replace(/^an? /, '') + 's'; }
  RB.ognSelText = selText;

  // --- the Might layer ------------------------------------------------------
  // "This turn" records are stamped with the turn they were made, so they expire without
  // anything having to sweep them. A "this combat" record is stamped with the point in
  // the log it was made at instead, and stops applying the moment a later showdown opens.
  function stamp(s, o, key, rec) {
    o[key] = (o[key] || []).filter(x => live(s, x));
    o[key].push(rec);
  }
  function live(s, rec) {
    if (!rec.sd) return rec.turn === s.turn;
    if (!s.showdown) return false;
    for (let i = s.log.length - 1; i >= 0; i--)
      if (s.log[i].kind === 'showdownOpen') return rec.at > i;
    return false;
  }
  function clearLayers(o) { o.counters = 0; o.ognMods = []; o.ognKw = []; }
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

  // Assault X / Shield X granted for a duration. Nothing in the core reads either keyword,
  // so the Might wrapper below is where they are read.
  def('grantKeyword', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) {
      stamp(s, RB.obj(s, iid), 'ognKw', e.duration === 'combat'
        ? { k: e.keyword, v: num(e, 'value', 1), sd: true, at: s.log.length }
        : { k: e.keyword, v: num(e, 'value', 1), turn: s.turn });
      RB.log(s, 'grant', { iid: iid, keyword: e.keyword, value: num(e, 'value', 1) });
    }
  });
  say('grantKeyword', e => 'Give ' + selText(e.target) + ' ' + e.keyword + ' ' +
    num(e, 'value', 1) + (e.duration === 'combat' ? ' this combat.' : ' this turn.'));

  // The Buff game action: a counter worth +1 Might, at most one per unit, gone when the
  // unit leaves play. It is kept in `o.counters`, which is what the core's `spendBuff`
  // additional cost spends — one representation, so a buff placed here can pay for a
  // card that asks for one. Buffing an already-buffed unit does nothing and is not a
  // choice, so an already-buffed unit is not a candidate.
  def('buffCounter', (s, e, ctx) => {
    const n = num(e, 'n', 1);
    const spec = e.target === 'self' ? 'self'
      : { pick: 'myUnits', n: n, other: !!e.other, noBuff: true };
    for (const iid of targets(s, spec, ctx)) {
      const o = RB.obj(s, iid);
      if (o.counters) continue;
      o.counters = 1;
      RB.log(s, 'buff', { p: ctx.p, iid: iid });
    }
  });
  say('buffCounter', e => e.target === 'self' ? 'Buff me.'
    : 'Buff ' + selText({ pick: 'myUnits', n: num(e, 'n', 1), other: !!e.other }) + '.');

  def('spendBuff', (s, e, ctx) => {
    void e;
    const got = unitsOf(s, ctx.p).filter(i => RB.obj(s, i).counters > 0);
    if (!got.length) return;
    const iid = got.sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b))[0];   // the cheapest to lose
    RB.obj(s, iid).counters--;
    RB.log(s, 'spendBuff', { p: ctx.p, iid: iid });
  });
  say('spendBuff', () => 'Spend a buff.');

  // --- damage and removal ---------------------------------------------------
  // The core's `damage`/`kill` take the core's selectors, which cannot say "a unit"
  // (either side's) while still picking the one a player would pick.
  def('damage', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) RB.obj(s, iid).damage += num(e, 'n', 1);
  });
  say('damage', e => 'Deal ' + num(e, 'n', 1) + ' to ' +
    ((e.target && e.target.n > 1) ? 'each of ' : '') + selText(e.target) + '.');

  def('kill', (s, e, ctx) => {
    for (const iid of targets(s, e.target, ctx)) {
      const owner = RB.obj(s, iid).controller;
      RB.kill(s, iid);
      for (let i = 0; i < (e.ownerDraws || 0); i++) RB.draw(s, owner);
    }
  });
  say('kill', e => 'Kill ' + selText(e.target) + '.' +
    (e.ownerDraws ? ' Its controller draws ' + e.ownerDraws + '.' : ''));

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
    for (const g of targets(s, { pick: 'gear', n: num(e, 'n', 1), prefer: e.prefer }, ctx))
      killGear(s, g);
  });
  say('killGear', e => e.scope === 'all' ? 'Kill all gear.'
    : e.scope === 'each' ? 'Each player kills one of their gear.'
      : 'Kill ' + selText({ pick: 'gear', n: num(e, 'n', 1) }) + '.');

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
      let facedown = false;
      for (const bf of s.bf) {
        const h = bf.hidden.find(x => x.iid === iid);
        if (h) { bf.hidden.splice(bf.hidden.indexOf(h), 1); facedown = true; }
      }
      if (!facedown) {
        if (loc.kind === 'bf') RB.removeFrom(s.bf[loc.bf].units, iid);
        else if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, iid);
        else if (loc.kind === 'bfGear') RB.removeFrom(s.bf[loc.bf].gear, iid);
        else if (o.attachedTo) { RB.removeFrom(RB.obj(s, o.attachedTo).attached, iid); o.attachedTo = null; }
        else continue;
      }
      for (const g of (o.attached || []).slice()) {           // attachments fall to their base
        const go = RB.obj(s, g);
        go.attachedTo = null;
        s.players[go.owner].base.push(g);
      }
      o.attached = [];
      o.damage = 0; o.buffs = 0; o.permBuffs = 0; o.granted = []; o.exhausted = false;
      o.stunned = false; o.temporary = false; o.movedThisTurn = 0;
      delete o.role;
      clearLayers(o);
      if (!o.token) s.players[o.owner].hand.push(iid);        // a token ceases to exist
      RB.log(s, 'bounce', { p: o.controller, iid: iid }, 'unit.move');
      RB.runTriggers(s, 'leftBoard', { p: o.controller, iid: iid,
        bf: loc.kind === 'bf' ? loc.bf : undefined });
      fireLeave(s, iid, o.controller);
    }
  });
  say('bounce', e => e.target === 'self' ? "Return me to my owner's hand."
    : 'Return ' + selText(e.target) + " to its owner's hand.");

  def('makeTemporary', (s, e, ctx) => {
    void e;
    const iid = targets(s, { pick: 'allUnits', at: 'battlefield', prefer: 'enemy' }, ctx)[0]
      || targets(s, { pick: 'gear', prefer: 'enemy' }, ctx)[0];
    if (!iid) return;
    RB.obj(s, iid).temporary = true;
    RB.log(s, 'temporary', { iid: iid, p: RB.obj(s, iid).controller });
  });
  say('makeTemporary', () => 'Give a unit at a battlefield or a gear Temporary.');

  // A Deathknell whose base cost is "recycle me" (§13.3): the card is in no zone while
  // its death trigger runs, and the core puts it in the trash straight afterwards, so the
  // move to the bottom of the deck is finished by the kill hook.
  def('recycleSelfToReadyRunes', (s, e, ctx) => {
    void e;
    RB.obj(s, ctx.source).ognRecycle = true;
    for (const i of s.players[ctx.p].runes) {
      const o = RB.obj(s, i);
      if (!o.exhausted) continue;
      o.exhausted = false;
      RB.log(s, 'runeReady', { p: ctx.p, iid: i }, 'rune.ready');
    }
  });
  say('recycleSelfToReadyRunes', () => 'Recycle me to ready your runes.');

  // --- movement -------------------------------------------------------------
  // An effect's move: no exhaust cost (that is the Standard Move's cost, not a move's),
  // and it raises `moved` exactly as the Standard Move does.
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
  const placeOf = loc => (loc.kind === 'bf' ? loc.bf : loc.kind === 'base' ? 'base' : null);
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
    (e.to === 'base' ? ' to base' : e.to === 'here' ? ' here' : ' to a battlefield') +
    (e.ready ? ' and ready it' : '') + '.');

  // "Move me to its location and it to my original location." Both places are read before
  // either unit moves, or the second move would chase the first.
  def('swapPlaces', (s, e, ctx) => {
    void e;
    const me = ctx.source;
    const mine = placeOf(RB.locationOf(s, me));
    if (mine === null) return;
    const pool = unitsOf(s, ctx.p)
      .filter(i => i !== me && placeOf(RB.locationOf(s, i)) !== null)
      .filter(i => placeOf(RB.locationOf(s, i)) !== mine)
      .sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    if (!pool.length) return;
    const other = pool[0];
    const theirs = placeOf(RB.locationOf(s, other));
    relocate(s, me, theirs);
    relocate(s, other, mine);
  });
  say('swapPlaces', () => 'Choose a unit you control at another location: move me to its ' +
    'location and it to my original location.');

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
    (num(e, 'n', 1) === 1 ? 'a' : num(e, 'n', 1)) + ' card from it, and they discard that card.');

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
  // Counter, but only a spell inside a printed cost bound. The core's `counterIf` reads
  // an Energy bound; this card's bound is on both halves of the cost, and a head outside
  // it is not something this card may choose, so it is simply not countered.
  def('counterSpell', (s, e, ctx) => {
    const item = RB.chainTop(s);
    if (!item) return;
    const card = RB.cardOf(s, item.iid);
    if (item.kind !== 'card' || card.type !== 'Spell') return;
    if (e.maxEnergy !== undefined && (card.energy || 0) > e.maxEnergy) return;
    if (e.maxPower !== undefined && (card.power || 0) > e.maxPower) return;
    RB.ops.counter(s, {}, ctx);
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
    isSelf: (s, ctx) => !!ctx.event && ctx.event.iid === ctx.source,
    nthCardPlayed: (s, ctx, e) => !!ctx.event && ctx.event.nth === num(e, 'n', 2),
    anyGear: s => allGear(s).length > 0,
    myBuff: (s, ctx) => unitsOf(s, ctx.p).some(i => RB.obj(s, i).counters > 0),
  };
  const ORDINAL = { 1: 'first', 2: 'second', 3: 'third' };
  const TEST_WORDS = {
    here: () => 'If it is this battlefield, ',
    atBattlefield: () => "While I'm at a battlefield, ",
    isSelf: () => 'If it is me, ',
    nthCardPlayed: e => 'If it is your ' + (ORDINAL[num(e, 'n', 2)] || num(e, 'n', 2) + 'th') +
      ' card this turn, ',
    anyGear: () => 'If there is a gear on the board, ',
    myBuff: () => 'If you control a buffed unit, ',
  };
  def('when', (s, e, ctx) => {
    const t = TESTS[e.test];
    if (!t) throw new Error('ogn.when: unknown test ' + e.test);
    if (t(s, ctx, e)) RB.runEffects(s, e.effects, ctx);
  });
  say('when', e => {
    if (!TEST_WORDS[e.test]) throw new Error('ogn.when: unknown test ' + e.test);
    return TEST_WORDS[e.test](e) + lower(lines(e.effects));
  });

  def('onceEachPlayer', (s, e, ctx) => {
    const o = RB.obj(s, ctx.source);
    o.ognSeen = o.ognSeen || [];
    if (o.ognSeen.includes(ctx.p)) return;
    o.ognSeen.push(ctx.p);
    RB.runEffects(s, e.effects, ctx);
  });
  say('onceEachPlayer', e => 'The first time each player does so, ' + lower(lines(e.effects)));

  def('raiseVictoryScore', (s, e, ctx) => {
    const o = RB.obj(s, ctx.source);
    if (o.ognRaised) return;
    o.ognRaised = true;
    s.victoryScore += num(e, 'n', 1);
    RB.log(s, 'victoryScore', { n: s.victoryScore });
  });
  say('raiseVictoryScore', e => 'Increase the points needed to win the game by ' +
    num(e, 'n', 1) + ' (once per game).');

  def('lockOpponentPlays', (s, e, ctx) => {
    void e;
    s.ognNoPlay = { p: RB.opponentOf(ctx.p), turn: s.turn };
    RB.log(s, 'noPlay', { p: RB.opponentOf(ctx.p) });
  });
  say('lockOpponentPlays', () => "Opponents can't play cards this turn.");

  // --- hook tables ----------------------------------------------------------
  // "I cost [2] less" and its condition. Cost modification has exactly one home
  // (RB.totalCost), and this is the Origins entry in it: a card declares `ognCostLess`
  // and this reads it. The field is namespaced so a second pack's modifier, reading its
  // own field, cannot apply this one twice.
  const COST_WHEN = {
    // [Legion]: satisfied by any other card you have finalized this turn. The card being
    // priced is still in hand, so anything in the list is another card.
    legion: (s, p) => (s.players[p].playedThisTurn || []).length > 0,
  };
  RB.defineCostModifier((s, p, iid, cost) => {
    const ab = RB.cardOf(s, iid).abilities;
    const r = ab && ab.ognCostLess;
    if (!r) return;
    if (r.when && !COST_WHEN[r.when](s, p)) return;
    cost.energy -= r.energy || 0;
    cost.power -= r.power || 0;
  });

  // ==========================================================================
  // The three core wrappers. Each reads only `ogn`-prefixed fields plus `o.counters`.
  // ==========================================================================

  // 1. Might. The core reads printed Might, buffs, statics and attached gear. This adds
  //    the Buff counter, this-turn modifiers with their own floors, and Assault/Shield —
  //    keywords nothing in the core reads, whether printed, granted by a static, or
  //    granted for a turn by ogn.grantKeyword. The depth guard is because asking
  //    hasKeyword re-enters the continuous layer, which may ask about Might again.
  let mightDepth = 0;
  const baseMight = RB.mightOf;
  RB.mightOf = function (s, iid) {
    let m = baseMight(s, iid);
    const o = s.objects[iid];
    if (!o) return m;
    m += o.counters || 0;                                    // Buff counters: +1 Might each
    for (const mod of o.ognMods || []) {
      if (!live(s, mod)) continue;
      m += mod.n;
      if (mod.min != null && m < mod.min) m = mod.min;
    }
    if (o.role && mightDepth === 0) {
      mightDepth++;
      try {
        m += roleKeyword(s, iid, o, o.role === 'attacker' ? 'Assault' : 'Shield');
      } finally { mightDepth--; }
    }
    return Math.max(0, m);
  };
  function roleKeyword(s, iid, o, kw) {
    let v = 0;
    for (const k of o.ognKw || []) if (k.k === kw && live(s, k)) v += k.v;
    if (RB.hasKeyword(s, iid, kw)) v += Math.max(1, RB.keywordValue(s, iid, kw));
    return v;
  }

  // 2. Leaving the board. The core's `leftBoard` is an OBSERVER event: RB.runTriggers
  //    walks the board, and the leaving card has already been lifted out of its zone, so
  //    it never hears its own. A card that says "when THIS leaves the board" is authored
  //    `on: 'leftBoard'` with an `isSelf` guard — the guard is what keeps the core's
  //    observer firing from answering for it — and this dispatches the card's own copy.
  //    The same hook finishes a Deathknell that recycled itself and clears a Buff, which
  //    vanishes when its unit leaves play.
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
    if (o.ognRecycle) {
      o.ognRecycle = false;
      RB.removeFrom(s.players[o.owner].trash, iid);
      s.players[o.owner].deck.push(iid);
      RB.log(s, 'recycle', { p: o.owner, iid: iid, n: 1 });
    }
    clearLayers(o);
    fireLeave(s, iid, p);
  };

  // 3. "Opponents can't play cards this turn." Legality in this engine is whatever
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
