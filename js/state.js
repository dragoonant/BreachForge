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
      pool: { energy: 0, power: EMPTY_POWER() },
      scoredThisTurn: [], firstTurnDone: false,
    };
  }

  // Every card in play is an object with an instance id; zones hold iids.
  function mint(state, cardId, owner) {
    const iid = 'o' + (state.nextIid++);
    state.objects[iid] = {
      iid: iid, cardId: cardId, owner: owner, controller: owner,
      exhausted: false, damage: 0, buffs: 0, granted: [], attached: [],
      attachedTo: null, temporary: false, movedThisTurn: 0, enteredTurn: -1,
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
      showdown: null, queue: [], log: [], winner: null, via: null,
      firstPlayer: 0,
    };

    for (let p = 0; p < 2; p++) {
      const d = RB.deck(state.players[p].deckId);
      const P = state.players[p];
      P.legend = mint(state, d.legend, p);
      for (const e of d.main) for (let i = 0; i < e.qty; i++) P.deck.push(mint(state, e.id, p));
      for (const e of d.runes) for (let i = 0; i < e.qty; i++) P.runeDeck.push(mint(state, e.id, p));
      // The Chosen Champion sits in the Champion Zone, playable from there.
      const champ = d.main.map(e => RB.card(e.id)).find(c => (c.tags || []).includes('Champion'));
      P.championCardId = champ ? champ.id : null;
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
  RB.draw = function (state, p) {
    const P = state.players[p];
    if (!P.deck.length) { RB.log(state, 'burnOut', { p: p }); return null; }
    const iid = P.deck.shift();
    P.hand.push(iid);
    RB.log(state, 'draw', { p: p, iid: iid }, 'card.draw');
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
    let m = (c.might || 0) + (o.buffs || 0);
    const loc = RB.locationOf(state, iid);
    if (loc.kind === 'bf') {
      for (const s of RB.battlefieldStatics(state, loc.bf)) m += s.might || 0;
    }
    for (const g of o.attached) m += (RB.card(RB.obj(state, g).cardId).might || 0);
    return Math.max(0, m);
  };

  // Static might modifiers a battlefield applies to the units standing on it. Battlefield
  // abilities are the only continuous layer in the first pass; unit statics ride the same
  // table when they land, so this is the one place that answers "what is my might here".
  RB.battlefieldStatics = function (state, bfIndex) {
    const out = [];
    const ab = RB.card(state.bf[bfIndex].cardId).abilities;
    if (ab && ab.statics) for (const s of ab.statics) out.push(s);
    return out;
  };

  RB.controllerOf = function (state, bfIndex) { return state.bf[bfIndex].controller; };

  RB.unitsAt = function (state, bfIndex, p) {
    return state.bf[bfIndex].units.filter(i => RB.obj(state, i).controller === p);
  };
  RB.opponentOf = function (p) { return 1 - p; };

  RB.hasKeyword = function (state, iid, kw) {
    const o = RB.obj(state, iid);
    const c = RB.card(o.cardId);
    if ((o.granted || []).includes(kw)) return true;
    return !!(c.abilities && c.abilities.keywords && c.abilities.keywords.some(k => k === kw || k.name === kw));
  };
  RB.keywordValue = function (state, iid, kw) {
    const c = RB.cardOf(state, iid);
    const k = c.abilities && c.abilities.keywords && c.abilities.keywords.find(x => x.name === kw);
    return k ? (k.value || 0) : 0;
  };
})(window.RB = window.RB || {});
