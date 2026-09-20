// The effect grammar. Card abilities are pure data (data/abilities*.js); this file is the
// interpreter. A new op is a handler + a describer (js/text.js) + a test, and validation
// rejects an op with no handler, so the grammar cannot silently drop a printed clause.
(function (RB) {
  'use strict';

  const OPS = Object.create(null);
  RB.ops = OPS;
  RB.defineOp = function (name, fn) { OPS[name] = fn; };

  // --- resolution -----------------------------------------------------------
  RB.resolveCard = function (s, item) {
    const iid = item.iid, p = item.controller;
    const card = RB.cardOf(s, iid);
    const ab = card.abilities || {};
    const ctx = { p: p, source: iid, to: item.to, targets: item.targets || [] };

    if (card.type === 'Unit') {
      RB.obj(s, iid).exhausted = true;             // units enter the board exhausted
      RB.obj(s, iid).enteredTurn = s.turn;
      if (item.to && item.to.startsWith('bf')) {
        const i = +item.to.slice(2);
        s.bf[i].units.push(iid);
        RB.applyContested(s, i, p);
      } else s.players[p].base.push(iid);
      RB.runEffects(s, (ab.triggers || []).filter(t => t.on === 'played').flatMap(t => t.effects), ctx);
      RB.runTriggers(s, 'unitPlayed', { p: p, iid: iid });
    } else if (card.type === 'Gear') {
      if (item.to && item.to.startsWith('unit:')) {
        const host = item.to.slice(5);
        RB.obj(s, host).attached.push(iid);
        RB.obj(s, iid).attachedTo = host;
      } else s.players[p].base.push(iid);
      RB.runEffects(s, (ab.triggers || []).filter(t => t.on === 'played').flatMap(t => t.effects), ctx);
    } else {
      RB.runEffects(s, ab.effects || [], ctx);
      s.players[p].trash.push(iid);
      if (card.type === 'Spell') RB.runTriggers(s, 'spellPlayed', { p: p, iid: iid });
    }
  };

  RB.resolveAbility = function (s, item) {
    const ab = RB.cardOf(s, item.iid).abilities.activated[item.ix];
    RB.runEffects(s, ab.effects || [], { p: item.controller, source: item.iid, targets: item.targets || [] });
  };

  // A dying card's own Deathknell, run while it is still where it died. Separated from
  // runTriggers because the card has already left its zone: runTriggers walks the board.
  RB.runDeathTriggers = function (s, iid, loc) {
    const ab = RB.cardOf(s, iid).abilities;
    if (!ab || !ab.triggers) return;
    const o = RB.obj(s, iid);
    for (const t of ab.triggers) {
      if (t.on !== 'deathknell') continue;
      const prev = s.via;
      s.via = { iid: iid };
      RB.runEffects(s, t.effects, { p: o.controller, source: iid,
        event: { p: o.controller, iid: iid, bf: loc.kind === 'bf' ? loc.bf : undefined } });
      s.via = prev;
    }
  };

  // Triggered abilities. Every permanent in play plus both legends is asked; a trigger that
  // fires stamps `via` on everything it logs, so a consequence never reads as a turn.
  RB.runTriggers = function (s, event, data) {
    const sources = [];
    for (let p = 0; p < 2; p++) {
      if (s.players[p].legend) sources.push([s.players[p].legend, p]);
      for (const iid of s.players[p].base) sources.push([iid, p]);
    }
    for (let i = 0; i < s.bf.length; i++) {
      for (const iid of s.bf[i].units) sources.push([iid, RB.obj(s, iid).controller]);
      sources.push([s.bf[i].iid, null]);           // the battlefield's own triggers
    }
    for (const [iid, owner] of sources) {
      const ab = RB.cardOf(s, iid).abilities;
      if (!ab || !ab.triggers) continue;
      for (const t of ab.triggers) {
        if (t.on !== event) continue;
        const p = owner === null ? data.p : owner;
        if (t.mine && p !== data.p) continue;
        if (t.here !== undefined && data.bf !== undefined && t.here && RB.locationOf(s, iid).bf !== data.bf) continue;
        const prev = s.via;
        s.via = { iid: iid };
        RB.runEffects(s, t.effects, { p: p, source: iid, event: data });
        s.via = prev;
      }
    }
  };

  RB.runEffects = function (s, effects, ctx) {
    for (const e of effects || []) {
      const fn = OPS[e.op];
      if (!fn) throw new Error('no handler for op: ' + e.op);
      fn(s, e, ctx);
    }
  };

  RB.answerQueue = function (s, a) {
    const step = s.queue.shift();
    if (step.kind !== 'may' && step.kind !== 'choose') return;
    const prev = s.via;
    if (step.source) s.via = { iid: step.source };
    RB.log(s, 'choice', { p: step.who, ix: a.ix,
      label: step.options ? step.options[a.ix] : (a.ix === 0 ? 'yes' : 'no') });
    if (step.onAnswer) RB.runEffects(s, step.onAnswer[a.ix] || [], step.ctx);
    s.via = prev;
  };

  // --- the ops --------------------------------------------------------------
  const asList = (s, sel, ctx) => RB.select(s, sel, ctx);

  RB.defineOp('draw', (s, e, ctx) => { for (let i = 0; i < (e.n || 1); i++) RB.draw(s, e.opponent ? RB.opponentOf(ctx.p) : ctx.p); });
  RB.defineOp('damage', (s, e, ctx) => { for (const iid of asList(s, e.target, ctx)) RB.obj(s, iid).damage += e.n || 1; });
  RB.defineOp('kill', (s, e, ctx) => { for (const iid of asList(s, e.target, ctx)) RB.kill(s, iid); });
  RB.defineOp('buff', (s, e, ctx) => { for (const iid of asList(s, e.target, ctx)) RB.obj(s, iid).buffs += e.n || 1; });
  RB.defineOp('grant', (s, e, ctx) => { for (const iid of asList(s, e.target, ctx)) RB.obj(s, iid).granted.push(e.keyword); });
  RB.defineOp('ready', (s, e, ctx) => {
    if (e.what === 'runes') {
      const rs = s.players[ctx.p].runes.filter(i => RB.obj(s, i).exhausted).slice(0, e.n || 1);
      for (const i of rs) { RB.obj(s, i).exhausted = false; RB.log(s, 'runeReady', { p: ctx.p, iid: i }, 'rune.ready'); }
      return;
    }
    for (const iid of asList(s, e.target || 'self', ctx)) RB.obj(s, iid).exhausted = false;
  });
  RB.defineOp('exhaust', (s, e, ctx) => { for (const iid of asList(s, e.target || 'self', ctx)) RB.obj(s, iid).exhausted = true; });
  RB.defineOp('channel', (s, e, ctx) => RB.channel(s, ctx.p, e.n || 1, !!e.exhausted));
  RB.defineOp('addEnergy', (s, e, ctx) => { s.players[ctx.p].pool.energy += e.n || 1; });
  RB.defineOp('addPower', (s, e, ctx) => {
    const P = s.players[ctx.p];
    // "[A]" is Power of any domain (rules §135.2.d). Universal power is held in its own
    // bucket so the payment solver can spend it against any domain requirement.
    if (e.domain === 'any') { P.pool.any = (P.pool.any || 0) + (e.n || 1); return; }
    P.pool.power[e.domain] = (P.pool.power[e.domain] || 0) + (e.n || 1);
  });
  RB.defineOp('gainPoint', (s, e, ctx) => { s.players[ctx.p].points += e.n || 1; RB.log(s, 'score', { p: ctx.p, how: 'effect', points: s.players[ctx.p].points }, 'point.score'); });
  RB.defineOp('discard', (s, e, ctx) => {
    const P = s.players[e.opponent ? RB.opponentOf(ctx.p) : ctx.p];
    for (let i = 0; i < (e.n || 1) && P.hand.length; i++) P.trash.push(P.hand.pop());
  });
  RB.defineOp('recycleRune', (s, e, ctx) => {
    const rs = s.players[ctx.p].runes.slice(0, e.n || 1);
    for (const i of rs) RB.recycleRune(s, ctx.p, i);
  });
  RB.defineOp('heal', (s, e, ctx) => { for (const iid of asList(s, e.target, ctx)) RB.obj(s, iid).damage = 0; });
  RB.defineOp('token', (s, e, ctx) => {
    const iid = RB.mint(s, e.cardId, ctx.p);
    const o = RB.obj(s, iid);
    o.token = true; o.exhausted = !e.ready;
    // Several cards make the same token at different sizes, so the creating card's printed
    // might wins over the token's own.
    if (e.might != null) o.buffs = e.might - (RB.card(e.cardId).might || 0);
    if (e.temporary) o.temporary = true;
    if (e.to === 'here' && ctx.event && ctx.event.bf !== undefined) { s.bf[ctx.event.bf].units.push(iid); RB.applyContested(s, ctx.event.bf, ctx.p); }
    else s.players[ctx.p].base.push(iid);
    RB.log(s, 'token', { p: ctx.p, iid: iid, card: e.cardId }, 'unit.deploy');
  });
  RB.defineOp('nothing', () => {});

  // "You may X." A real optional clause: it asks, and declining is a legal answer. The
  // human seat answers on the prompt line; the AI answers through the same queue step, so
  // there is exactly one place that knows what "may" means.
  RB.defineOp('may', (s, e, ctx) => {
    s.queue.push({
      kind: 'may', who: ctx.p, source: ctx.source, prompt: e.prompt || null,
      ctx: { p: ctx.p, source: ctx.source, event: ctx.event, targets: ctx.targets },
      onAnswer: [e.effects || [], e.otherwise || []],
    });
  });

  // "Choose one." The options are the card's own clauses in printed order.
  RB.defineOp('choose', (s, e, ctx) => {
    s.queue.push({
      kind: 'choose', who: ctx.p, source: ctx.source,
      options: e.options.map(o => o.label),
      ctx: { p: ctx.p, source: ctx.source, event: ctx.event, targets: ctx.targets },
      onAnswer: e.options.map(o => o.effects),
    });
  });

  RB.defineOp('stun', (s, e, ctx) => {
    for (const iid of asList(s, e.target, ctx)) {
      const o = RB.obj(s, iid);
      o.exhausted = true; o.stunned = true;
      RB.log(s, 'stun', { iid: iid }, 'ui.invalid');
    }
  });
  RB.defineOp('counter', (s, e, ctx) => {
    // Remove the top card of the chain without resolving it. The chain is LIFO, so "the
    // spell being responded to" is always its head.
    const item = s.chain.pop();
    if (!item) return;
    s.players[item.controller].trash.push(item.iid);
    RB.log(s, 'counter', { p: ctx.p, iid: item.iid }, 'chain.resolve');
  });
  RB.defineOp('xp', (s, e, ctx) => {
    const P = s.players[ctx.p];
    P.xp = (P.xp || 0) + (e.n || 1);
    RB.log(s, 'xp', { p: ctx.p, xp: P.xp });
  });
  RB.defineOp('counters', (s, e, ctx) => {
    for (const iid of asList(s, e.target, ctx)) {
      const o = RB.obj(s, iid);
      o.counters = (o.counters || 0) + (e.n || 1);
    }
  });

  // Selectors. `self` and the event's own subject cover most cards; anything that needs the
  // player to pick opens a pendingChoice instead, and that is one place, not many.
  RB.select = function (s, sel, ctx) {
    if (!sel || sel === 'self') return [ctx.source];
    if (sel === 'eventUnit') return ctx.event && ctx.event.iid ? [ctx.event.iid] : [];
    if (sel === 'myUnits') return allUnits(s).filter(i => RB.obj(s, i).controller === ctx.p);
    if (sel === 'enemyUnits') return allUnits(s).filter(i => RB.obj(s, i).controller !== ctx.p);
    if (sel === 'allUnits') return allUnits(s);
    if (sel === 'hereMine') return ctx.event && ctx.event.bf !== undefined ? RB.unitsAt(s, ctx.event.bf, ctx.p) : [];
    if (sel === 'hereEnemy') return ctx.event && ctx.event.bf !== undefined ? RB.unitsAt(s, ctx.event.bf, RB.opponentOf(ctx.p)) : [];
    if (typeof sel === 'object' && sel.pick) return RB.autoPick(s, sel, ctx);
    return [];
  };
  function allUnits(s) {
    const out = [];
    for (let p = 0; p < 2; p++) for (const i of s.players[p].base) out.push(i);
    for (const bf of s.bf) for (const i of bf.units) out.push(i);
    return out;
  }
  RB.allUnits = allUnits;

  // A "choose a unit" clause resolves against the best candidate by a stated rule rather
  // than opening a modal for every minor effect. D-2: the player does not yet choose.
  RB.autoPick = function (s, sel, ctx) {
    let pool = RB.select(s, sel.pick, ctx);
    if (sel.filter === 'damaged') pool = pool.filter(i => RB.obj(s, i).damage > 0);
    if (sel.maxMight !== undefined) pool = pool.filter(i => RB.mightOf(s, i) <= sel.maxMight);
    if (!pool.length) return [];
    pool = pool.slice().sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    return pool.slice(0, sel.n || 1);
  };
})(window.RB = window.RB || {});

// Ability data arrives per set through this one door so the packs never fight over a
// global, and so validation can name which pack an id came from.
(function (RB) {
  'use strict';
  RB.registerAbilities = function (pack) {
    RB.abilityData = RB.abilityData || {};
    for (const k of Object.keys(pack)) {
      if (RB.abilityData[k]) throw new Error('ability data registered twice for ' + k);
      RB.abilityData[k] = pack[k];
    }
  };
})(window.RB = window.RB || {});
