// State shape, setup, zone helpers and the derived predicates. Every rule with more than
// one reader lives here exactly once — controllerOf, mightOf, canPay — because four copies
// of "who controls this battlefield" is the bug class that ate a previous project.
(function (RB) {
  'use strict';

  const EMPTY_POWER = () => ({ Fury: 0, Calm: 0, Mind: 0, Body: 0, Order: 0, Chaos: 0 });

  function newPlayer(deckId) {
    return {
      deckId: deckId, hand: [], deck: [], runeDeck: [], trash: [], banished: [],
      runes: [], base: [], points: 0, legend: null, champion: null,
      pool: { energy: 0, power: EMPTY_POWER(), any: 0, showdownOnly: 0 },
      scoredThisTurn: [], firstTurnDone: false,
      // Per-turn counters. Several printed cards count what you have already done this
      // turn ("your second card", "if you've played an Equipment this turn"), and a card
      // cannot count something nobody records. Reset in startTurn, one place.
      playedThisTurn: [], drawsThisTurn: 0, xp: 0, turnFlags: {},
    };
  }

  // Every card in play is an object with an instance id; zones hold iids.
  function mint(state, cardId, owner) {
    const iid = 'o' + (state.nextIid++);
    state.objects[iid] = {
      iid: iid, cardId: cardId, owner: owner, controller: owner,
      exhausted: false, damage: 0, buffs: 0, permBuffs: 0, granted: [], attached: [],
      attachedTo: null, temporary: false, movedThisTurn: 0, enteredTurn: -1,
      wasMighty: false, wasReady: false, counters: 0, untargetable: false,
    };
    return iid;
  }
  RB.mint = mint;

  RB.newGame = function (opts) {
    const state = {
      rngSeed: RB.seedFromString(String(opts.seed || 'breachforge')),
      seed: String(opts.seed || 'breachforge'),
      turn: 0, active: 0, phase: 'setup',
      victoryScore: RB.VICTORY_SCORE,
      players: [newPlayer(opts.decks[0]), newPlayer(opts.decks[1])],
      bf: [], objects: {}, nextIid: 1,
      chain: [], priority: 0, focus: null, passes: 0,
      showdown: null, queue: [], log: [], winner: null, via: null, delayed: [],
      firstPlayer: 0,
    };

    for (let p = 0; p < 2; p++) {
      const d = RB.deck(state.players[p].deckId);
      const P = state.players[p];
      P.legend = mint(state, d.legend, p);
      for (const e of d.main) for (let i = 0; i < e.qty; i++) P.deck.push(mint(state, e.id, p));
      for (const e of d.runes) for (let i = 0; i < e.qty; i++) P.runeDeck.push(mint(state, e.id, p));
      // The Chosen Champion is taken OUT of the main deck at setup and starts in the
      // public Champion Zone, playable from there (§1.1). Leaving it in the deck makes the
      // deck's single most important card something you have to draw.
      P.champion = null;
      if (d.champion) {
        const i = P.deck.findIndex(iid => state.objects[iid].cardId === d.champion);
        if (i >= 0) P.champion = P.deck.splice(i, 1)[0];
      }
      RB.shuffle(state, P.deck);
      RB.shuffle(state, P.runeDeck);
      // 1v1 Duel, rule 481: each player randomly selects 1 of their 3 battlefields;
      // the other two are removed. Two battlefields are in play, one from each player.
      const pick = d.battlefields[RB.rngInt(state, d.battlefields.length)];
      state.bf.push({
        iid: mint(state, pick.id, p), cardId: pick.id, provider: p,
        controller: null, units: [], gear: [], hidden: [], contestedBy: null,
        showdownStaged: false, combatStaged: false,
      });
    }

    state.firstPlayer = RB.rngInt(state, 2);
    state.active = state.firstPlayer;
    for (let p = 0; p < 2; p++) for (let i = 0; i < 4; i++) RB.draw(state, p);
    state.phase = 'mulligan';
    state.queue.push({ kind: 'mulligan', who: state.firstPlayer });
    state.queue.push({ kind: 'mulligan', who: 1 - state.firstPlayer });
    RB.log(state, 'gameStart', { seed: state.seed, first: state.firstPlayer });
    return state;
  };

  // --- zones ----------------------------------------------------------------
  // Burn Out (rule 431). Drawing from an empty deck does NOT simply fail: the player
  // recycles their trash into their main deck, randomised, then chooses an opponent to
  // GAIN A POINT, and then completes the draw. With an empty trash it repeats every turn
  // until the opponent reaches the victory score — decking out is a real loss condition,
  // and a draw that quietly returned null hid it entirely.
  RB.burnOut = function (state, p) {
    RB.log(state, 'burnOut', { p: p });
    const P = state.players[p];
    while (P.trash.length) P.deck.push(P.trash.pop());
    RB.shuffle(state, P.deck);
    const them = RB.opponentOf(p);
    state.players[them].points++;
    // A point from a Burn Out is not a Score, so the winning-point restriction — which
    // applies only to Conquer and Hold — does not hold it back (§471.2.c).
    RB.log(state, 'score', { p: them, how: 'burnOut', points: state.players[them].points }, 'point.score');
  };

  RB.draw = function (state, p) {
    const P = state.players[p];
    if (!P.deck.length) {
      RB.burnOut(state, p);
      if (!P.deck.length) return null;         // trash was empty too; nothing to draw
    }
    const iid = P.deck.shift();
    P.hand.push(iid);
    P.drawsThisTurn = (P.drawsThisTurn || 0) + 1;
    RB.log(state, 'draw', { p: p, iid: iid, nth: P.drawsThisTurn }, 'card.draw');
    // Cards that count draws ("the second card you draw each turn") need the event, and
    // a trigger that fires while a draw is mid-flight is why this comes after the push.
    if (RB.runTriggers) RB.runTriggers(state, 'drew', { p: p, iid: iid, nth: P.drawsThisTurn });
    return iid;
  };
  RB.obj = function (state, iid) {
    const o = state.objects[iid];
    if (!o) throw new Error('no such object: ' + iid);
    return o;
  };
  RB.cardOf = function (state, iid) { return RB.card(RB.obj(state, iid).cardId); };

  RB.locationOf = function (state, iid) {
    for (let p = 0; p < 2; p++) {
      const P = state.players[p];
      if (P.base.includes(iid)) return { kind: 'base', p: p };
      if (P.hand.includes(iid)) return { kind: 'hand', p: p };
      if (P.trash.includes(iid)) return { kind: 'trash', p: p };
      if (P.runes.includes(iid)) return { kind: 'runes', p: p };
      if (P.legend === iid) return { kind: 'legend', p: p };
      if (P.champion === iid) return { kind: 'championZone', p: p };
    }
    for (let i = 0; i < state.bf.length; i++) {
      if (state.bf[i].units.includes(iid)) return { kind: 'bf', bf: i };
      if (state.bf[i].gear.includes(iid)) return { kind: 'bfGear', bf: i };
    }
    return { kind: 'nowhere' };
  };

  RB.removeFrom = function (arr, iid) {
    const i = arr.indexOf(iid);
    if (i >= 0) arr.splice(i, 1);
    return i >= 0;
  };

  // --- derived predicates: one home each ------------------------------------
  RB.mightOf = function (state, iid) {
    const o = RB.obj(state, iid);
    const c = RB.card(o.cardId);
    let m = (c.might || 0) + (o.buffs || 0) + (o.permBuffs || 0);
    for (const st of RB.staticsOn(state, iid)) m += RB.staticValue(state, iid, st.might);
    for (const g of o.attached) m += (RB.card(RB.obj(state, g).cardId).might || 0);
    return Math.max(0, m);
  };

  // The continuous layer. Every static in play is asked whether it applies to this card,
  // in one place — scoring, combat, card conditions and the AI all read might through
  // RB.mightOf, and four copies of "does this modifier reach me" is the bug class that ate
  // a previous project. A reentrancy guard keeps a static whose scope asks about might
  // from recursing: a nested call sees no statics rather than blowing the stack.
  // Two hook tables so a card pack never has to wrap this function. `staticWhen` answers
  // "does this condition hold for the affected card"; `staticAmount` answers "what number
  // does this modifier carry right now", which is what a Might read from the game state
  // (your points, your XP) needs and a fixed number cannot say.
  RB.staticWhen = Object.create(null);
  RB.staticAmount = Object.create(null);
  RB.defineStaticWhen = function (name, fn) { RB.staticWhen[name] = fn; };
  RB.defineStaticAmount = function (name, fn) { RB.staticAmount[name] = fn; };

  // Resolve a modifier's value: a plain number, or { from: '<name>', n } read through the
  // amount table. Used for `might` and for any other numeric key a static carries.
  RB.staticValue = function (state, iid, v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    const fn = RB.staticAmount[v.from];
    if (!fn) throw new Error('no staticAmount named ' + v.from);
    return fn(state, iid, v) * (v.per == null ? 1 : v.per);
  };

  let staticsDepth = 0;
  RB.staticsOn = function (state, iid) {
    if (staticsDepth > 0) return [];
    staticsDepth++;
    try {
      const out = [];
      const target = RB.obj(state, iid);
      const loc = RB.locationOf(state, iid);
      const consider = (ab, sourceIid, sourceBf, sourceP) => {
        if (!ab || !ab.statics) return;
        for (const st of ab.statics) {
          if (sourceIid === iid && !st.includeSelf && st.scope !== 'self') continue;
          if (!inScope(st, sourceBf, sourceP, sourceIid)) continue;
          if (st.tag && !(RB.card(target.cardId).tags || []).includes(st.tag)) continue;
          if (st.when && !whenHolds(state, iid, st.when, sourceIid)) continue;
          out.push(st);
        }
      };
      const inScope = (st, sourceBf, sourceP, sourceIid) => {
        const sc = st.scope || 'here';
        // `self` means the source and nothing else. Returning true for every card made a
        // second copy of the same card apply its modifier to the first — two 'self'
        // statics on the board stacked on one unit.
        if (sc === 'self') return sourceIid === iid;
        if (sc === 'here') return loc.kind === 'bf' && loc.bf === sourceBf;
        if (sc === 'mine') return target.controller === sourceP;
        if (sc === 'hereMine') return loc.kind === 'bf' && loc.bf === sourceBf && target.controller === sourceP;
        if (sc === 'all') return true;
        return false;
      };
      for (let i = 0; i < state.bf.length; i++) {
        consider(RB.card(state.bf[i].cardId).abilities, state.bf[i].iid, i, target.controller);
        for (const u of state.bf[i].units) consider(RB.card(RB.obj(state, u).cardId).abilities, u, i, RB.obj(state, u).controller);
      }
      for (let p = 0; p < 2; p++) {
        for (const u of state.players[p].base) consider(RB.card(RB.obj(state, u).cardId).abilities, u, null, p);
        if (state.players[p].legend) consider(RB.card(RB.obj(state, state.players[p].legend).cardId).abilities, state.players[p].legend, null, p);
      }
      return out;
    } finally { staticsDepth--; }
  };

  // A condition is written either as a bare name — `when: 'defendingAlone'` — or as a
  // single-key object carrying its argument — `when: { xpAtLeast: 6 }`. Both read the same
  // predicate table; the object form's value arrives as `w.n`.
  function whenHolds(state, iid, when, sourceIid) {
    let name, arg = {};
    if (typeof when === 'string') name = when;
    else if (when.kind) { name = when.kind; arg = when; }
    else {
      name = Object.keys(when)[0];
      arg = { n: when[name] };
    }
    const fn = RB.staticWhen[name];
    if (!fn) throw new Error('no staticWhen named ' + name);
    return !!fn(state, iid, arg, sourceIid);
  }

  // Might now reads its modifier through staticValue, so a static may carry a computed
  // number ("my Might is increased by your points") as well as a printed one.
  // Kept as the narrow question the movement rules ask: what does THIS battlefield grant?
  RB.battlefieldStatics = function (state, bfIndex) {
    const ab = RB.card(state.bf[bfIndex].cardId).abilities;
    return (ab && ab.statics) ? ab.statics : [];
  };

  RB.controllerOf = function (state, bfIndex) { return state.bf[bfIndex].controller; };

  RB.unitsAt = function (state, bfIndex, p) {
    return state.bf[bfIndex].units.filter(i => RB.obj(state, i).controller === p);
  };
  RB.opponentOf = function (p) { return 1 - p; };

  // The default predicates and amounts. A pack adds its own through the same tables
  // rather than wrapping RB.staticsOn — that is the hook-table rule, and three packs
  // wrapping one function is how a continuous layer starts double-counting.
  RB.defineStaticWhen('defendingAlone', function (state, iid) {
    const o = RB.obj(state, iid);
    if (o.role !== 'defender') return false;
    const loc = RB.locationOf(state, iid);
    return loc.kind === 'bf' && RB.unitsAt(state, loc.bf, o.controller).length === 1;
  });
  RB.defineStaticWhen('attacking', (state, iid) => RB.obj(state, iid).role === 'attacker');
  RB.defineStaticWhen('defending', (state, iid) => RB.obj(state, iid).role === 'defender');
  RB.defineStaticWhen('mighty', (state, iid) => RB.isMighty(state, iid));
  RB.defineStaticWhen('xpAtLeast', (state, iid, w) =>
    (state.players[RB.obj(state, iid).controller].xp || 0) >= (w.n || 0));
  RB.defineStaticWhen('sourceMighty', (state, iid, w, src) => RB.isMighty(state, src));
  // Conditions a card reads about its controller's turn so far. These are also available
  // as effect conditions (RB.defineCondition); the two tables answer the same questions
  // for different callers, so a name that exists in one should exist in the other.
  RB.defineStaticWhen('powerSpentAtLeast', (state, iid, w) =>
    (state.players[RB.obj(state, iid).controller].powerSpentThisTurn || 0) >= (w.n || 1));
  RB.defineStaticWhen('playedThisTurnAtLeast', (state, iid, w) =>
    state.players[RB.obj(state, iid).controller].playedThisTurn.length >= (w.n || 1));
  RB.defineStaticWhen('attackingOrDefending', (state, iid) => !!RB.obj(state, iid).role);

  RB.defineStaticAmount('points', (state, iid) => state.players[RB.obj(state, iid).controller].points);
  RB.defineStaticAmount('xp', (state, iid) => state.players[RB.obj(state, iid).controller].xp || 0);
  RB.defineStaticAmount('counters', (state, iid) => RB.obj(state, iid).counters || 0);

  // "A unit is Mighty while it has 5+ Might" — printed reminder text on several cards, so
  // it is a rule with exactly one home rather than a 5 written in six places.
  RB.MIGHTY_AT = 5;
  RB.isMighty = function (state, iid) { return RB.mightOf(state, iid) >= RB.MIGHTY_AT; };

  RB.hasKeyword = function (state, iid, kw) {
    const o = RB.obj(state, iid);
    const c = RB.card(o.cardId);
    if ((o.granted || []).includes(kw)) return true;
    if (c.abilities && c.abilities.keywords && c.abilities.keywords.some(k => k === kw || k.name === kw)) return true;
    return RB.staticsOn(state, iid).some(st => st.grant === kw);
  };
  RB.keywordValue = function (state, iid, kw) {
    const c = RB.cardOf(state, iid);
    const k = c.abilities && c.abilities.keywords && c.abilities.keywords.find(x => x.name === kw);
    return k ? (k.value || 0) : 0;
  };
})(window.RB = window.RB || {});
