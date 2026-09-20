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
    const ctx = { p: p, source: iid, to: item.to, targets: item.targets || [],
      fromHidden: !!item.fromHidden, paid: item.paid || [] };

    // An additional cost may change how the card enters or add its own clause —
    // [Accelerate] is "pay more and I enter ready", which is a property of the play, not
    // an effect that happens to it afterwards.
    const extras = (item.paid || []).map(id => RB.additionalCost(s, iid, id));
    const entersReady = extras.some(x => x.entersReady);

    if (card.type === 'Unit') {
      RB.obj(s, iid).exhausted = !entersReady;     // units enter the board exhausted
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
    for (const x of extras) if (x.effects) RB.runEffects(s, x.effects, ctx);
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
    // "Your Deathknell effects trigger an additional time" is a continuous modification of
    // how often another card's trigger fires, so the count is asked here rather than
    // written into the trigger.
    let times = 1;
    for (const u of RB.allUnits(s).concat([s.players[o.controller].legend]))
      if (u && RB.obj(s, u).controller === o.controller)
        for (const st of (RB.cardOf(s, u).abilities || {}).statics || [])
          if (st.deathknellExtra) times += st.deathknellExtra;
    for (const t of ab.triggers) {
      if (t.on !== 'deathknell') continue;
      for (let k = 0; k < times; k++) {
        const prev = s.via;
        s.via = { iid: iid };
        RB.runEffects(s, t.effects, { p: o.controller, source: iid,
          event: { p: o.controller, iid: iid, bf: loc.kind === 'bf' ? loc.bf : undefined } });
        s.via = prev;
      }
    }
  };

  // Triggered abilities. Every permanent in play plus both legends is asked; a trigger that
  // fires stamps `via` on everything it logs, so a consequence never reads as a turn.
  // A delayed ability outlives its source: "return it when they hold, even if I'm no
  // longer on the board". Every trigger in the table is asked of a card still in play, so
  // these live on the state instead and are drained by the same dispatcher.
  RB.defineOp('delayed', (s, e, ctx) => {
    s.delayed = s.delayed || [];
    s.delayed.push({ on: e.on, p: ctx.p, source: ctx.source, effects: e.effects,
      once: e.once !== false, data: e.data || {} });
    RB.log(s, 'delayed', { p: ctx.p, on: e.on });
  });

  RB.runTriggers = function (s, event, data) {
    // Delayed abilities first: they were promised earlier and do not depend on their
    // source still existing.
    if (s.delayed && s.delayed.length) {
      for (const d of s.delayed.slice()) {
        if (d.on !== event) continue;
        if (d.mine !== false && d.watch === 'mine' && data.p !== d.p) continue;
        if (d.once) s.delayed.splice(s.delayed.indexOf(d), 1);
        const prev = s.via;
        s.via = { iid: d.source };
        RB.runEffects(s, d.effects, { p: d.p, source: d.source, event: data, delayed: d.data });
        s.via = prev;
      }
    }
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

  // Play a card out of a zone that is not your hand. Playing is otherwise a core action
  // from hand only, which is why "play a unit from your trash" had nowhere to live.
  RB.defineOp('playFromZone', (s, e, ctx) => {
    const P = s.players[ctx.p];
    const zone = e.zone === 'deck' ? P.deck : P.trash;
    const pool = zone.filter(iid => {
      const c = RB.cardOf(s, iid);
      if (e.type && c.type !== e.type) return false;
      if (e.maxEnergy != null && (c.energy || 0) > e.maxEnergy) return false;
      return true;
    });
    if (!pool.length) return;
    // Biggest first: a card that lets you replay something from the trash means the best
    // thing there, and an op that takes the worst is a weaker card than the printed one.
    pool.sort((a, b) => (RB.cardOf(s, b).energy || 0) - (RB.cardOf(s, a).energy || 0));
    const iid = pool[0];
    RB.removeFrom(zone, iid);
    // The cost is ignored where the card says so; where it is not, the power half is
    // still owed and is solved through the ordinary payment path.
    if (!e.ignoreCost) {
      const cost = RB.costOf(s, iid);
      if (e.ignoreEnergy) cost.energy = 0;
      const plan = RB.planPayment(s, ctx.p, cost);
      if (!plan) { zone.push(iid); return; }
      RB.pay(s, ctx.p, plan);
    }
    RB.log(s, 'play', { p: ctx.p, iid: iid, card: RB.cardOf(s, iid).id,
      from: e.zone || 'trash' }, 'card.play');
    RB.resolveCard(s, { iid: iid, controller: ctx.p, to: e.to || 'base', kind: 'card' });
  });

  // A unit's Might is swapped, held for the turn. RB.mightOf derives Might on demand, so
  // a swap is expressed as the buff that makes the derivation come out right.
  RB.defineOp('swapMight', (s, e, ctx) => {
    const list = asList(s, e.target, ctx);
    if (list.length < 2) return;
    const [a, b] = list;
    const ma = RB.mightOf(s, a), mb = RB.mightOf(s, b);
    RB.obj(s, a).buffs += mb - ma;
    RB.obj(s, b).buffs += ma - mb;
    RB.log(s, 'swapMight', { a: a, b: b });
  });

  // "Play a battlefield token." The board is a fixed list of two in 1v1, so a card that
  // adds one adds a third — provider null, controlled by nobody until someone takes it.
  RB.defineOp('addBattlefield', (s, e, ctx) => {
    const iid = RB.mint(s, e.cardId, ctx.p);
    RB.obj(s, iid).token = true;
    s.bf.push({ iid: iid, cardId: e.cardId, provider: ctx.p, controller: null,
      units: [], gear: [], hidden: [], contestedBy: null,
      showdownStaged: false, combatStaged: false, token: true });
    RB.log(s, 'addBattlefield', { p: ctx.p, card: e.cardId });
  });

  RB.defineOp('addShowdownEnergy', (s, e, ctx) => {
    // Energy that may only be spent during showdowns. It is a separate bucket because the
    // rune pool is one untagged number, and adding it there would be strictly better than
    // the printed card.
    s.players[ctx.p].pool.showdownOnly = (s.players[ctx.p].pool.showdownOnly || 0) + (e.n || 1);
  });

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
  //
  // Choosing is not free. [Deflect] is a mandatory additional Power cost on a spell or
  // ability that chooses the unit (§809), so a candidate whose Deflect the chooser cannot
  // pay is not a legal choice at all — and one they can pay costs them the Power. And
  // every choice is ANNOUNCED, because "when you choose a friendly unit" is a printed
  // trigger that has nothing to fire on otherwise.
  RB.autoPick = function (s, sel, ctx) {
    let pool = RB.select(s, sel.pick, ctx);
    if (sel.filter === 'damaged') pool = pool.filter(i => RB.obj(s, i).damage > 0);
    if (sel.maxMight !== undefined) pool = pool.filter(i => RB.mightOf(s, i) <= sel.maxMight);
    if (sel.mighty) pool = pool.filter(i => RB.isMighty(s, i));
    pool = pool.filter(i => RB.canChoose(s, ctx.p, i));
    if (!pool.length) return [];
    const low = sel.smallest;
    pool = pool.slice().sort((a, b) => low ? RB.mightOf(s, a) - RB.mightOf(s, b)
                                           : RB.mightOf(s, b) - RB.mightOf(s, a));
    const taken = pool.slice(0, sel.n || 1);
    for (const iid of taken) RB.announceChoice(s, ctx.p, iid, ctx.source);
    return taken;
  };

  // The Deflect toll: what an opposing chooser must pay to choose this unit, in Power of
  // any domain. Zero for your own units and for units without the keyword.
  RB.deflectCost = function (s, chooser, iid) {
    const o = RB.obj(s, iid);
    if (o.controller === chooser) return 0;
    let n = 0;
    if (RB.hasKeyword(s, iid, 'Deflect')) n += Math.max(1, RB.keywordValue(s, iid, 'Deflect'));
    for (const st of RB.staticsOn(s, iid)) if (st.grant === 'Deflect') n += 1;
    return n;
  };
  RB.canChoose = function (s, chooser, iid) {
    if (RB.obj(s, iid).untargetable && RB.obj(s, iid).controller !== chooser) return false;
    for (const st of RB.staticsOn(s, iid))
      if (st.untargetableByEnemies && RB.obj(s, iid).controller !== chooser) return false;
    const n = RB.deflectCost(s, chooser, iid);
    if (!n) return true;
    return RB.canPay(s, chooser, { energy: 0, power: n, domains: RB.DOMAINS.slice(), each: false });
  };
  RB.announceChoice = function (s, chooser, iid, source) {
    const n = RB.deflectCost(s, chooser, iid);
    if (n) {
      const plan = RB.planPayment(s, chooser, { energy: 0, power: n, domains: RB.DOMAINS.slice(), each: false });
      if (plan) { RB.pay(s, chooser, plan); RB.log(s, 'deflectPaid', { p: chooser, iid: iid, n: n }); }
    }
    RB.runTriggers(s, 'chosen', { p: RB.obj(s, iid).controller, chooser: chooser,
      iid: iid, source: source });
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
