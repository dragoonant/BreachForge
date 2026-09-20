// The engine surface is exactly legalActions / apply (immutable) / isTerminal, plus
// whoActs — the one answer to "whose input is needed". Every UI affordance and every AI
// move derives from legalActions; neither may invent a rule.
(function (RB) {
  'use strict';

  RB.clone = function (s) { return JSON.parse(JSON.stringify(s)); };

  RB.isTerminal = function (state) { return state.winner !== null; };

  RB.whoActs = function (state) {
    if (state.winner !== null) return null;
    if (state.queue.length) return state.queue[0].who;
    if (state.showdown) return state.priority;
    if (state.chain.length) return state.priority;
    return state.active;
  };

  // --------------------------------------------------------------- legal actions
  RB.legalActions = function (state) {
    if (state.winner !== null) return [];
    const who = RB.whoActs(state);
    const out = [];

    if (state.queue.length) {
      const step = state.queue[0];
      const acts = RB.queueActions(state, step);
      if (!acts.length) throw new Error('queue head offers nothing: ' + step.kind);
      return acts;
    }

    // Closed state: a chain is resolving. Only reactions and passing.
    if (state.chain.length) {
      for (const a of playableFrom(state, who, 'reaction')) out.push(a);
      out.push({ t: 'pass' });
      return out;
    }

    if (state.showdown) {
      // Showdown Open State: the player with Focus (and priority) may take Action- or
      // Reaction-tagged discretionary actions only. Rule 315.4.
      for (const a of playableFrom(state, who, 'showdown')) out.push(a);
      out.push({ t: 'pass' });
      return out;
    }

    // Neutral Open State — only the turn player acts. Rule 316.5.
    if (who !== state.active) return [{ t: 'pass' }];
    for (const a of playableFrom(state, who, 'main')) out.push(a);
    for (const a of moveActions(state, who)) out.push(a);
    out.push({ t: 'endTurn' });
    return out;
  };

  function timingOk(state, card, mode) {
    const kws = (card.abilities && card.abilities.keywords) || [];
    const has = n => kws.some(k => k === n || k.name === n);
    if (mode === 'main') return true;
    if (mode === 'showdown') return has('Action') || has('Reaction');
    if (mode === 'reaction') return has('Reaction');
    return false;
  }

  function playableFrom(state, p, mode) {
    const out = [];
    const P = state.players[p];
    const seen = new Set();
    for (const iid of P.hand) {
      const card = RB.cardOf(state, iid);
      if (seen.has(card.id)) continue;               // one action per distinct card in hand
      if (!timingOk(state, card, mode)) continue;
      const cost = RB.costOf(state, iid);
      if (!RB.canPay(state, p, cost)) continue;
      seen.add(card.id);
      for (const dest of playDestinations(state, p, card)) out.push({ t: 'play', iid: iid, to: dest });
    }
    // The legend's activated abilities and the units' own, in the same shape.
    const sources = [P.legend].concat(P.base, state.bf.flatMap(b => b.units))
      .filter(i => i && RB.obj(state, i).controller === p);
    for (const iid of sources) {
      const ab = RB.cardOf(state, iid).abilities;
      if (!ab || !ab.activated) continue;
      ab.activated.forEach((a, ix) => {
        if (mode !== 'main' && !(a.tags || []).some(t => t === 'Action' || t === 'Reaction')) return;
        if (a.exhaustSelf && RB.obj(state, iid).exhausted) return;
        const cost = { energy: a.energy || 0, power: a.power || 0, domains: a.domains || [], each: false };
        if (!RB.canPay(state, p, cost)) return;
        out.push({ t: 'activate', iid: iid, ix: ix });
      });
    }
    return out;
  }

  function playDestinations(state, p, card) {
    if (card.type === 'Unit') {
      const d = ['base'];
      // Units are played to your base unless an ability says otherwise. Rule 1495.
      if (card.abilities && card.abilities.playTo === 'battlefield')
        return state.bf.map((_, i) => 'bf' + i);
      return d;
    }
    if (card.type === 'Gear') {
      const targets = [];
      for (let p2 = 0; p2 < 2; p2++) for (const u of state.players[p2].base) targets.push('unit:' + u);
      for (let i = 0; i < state.bf.length; i++) for (const u of state.bf[i].units) targets.push('unit:' + u);
      return targets.length ? targets : ['base'];
    }
    return ['-'];   // spells: targets are chosen by the resolution queue
  }

  function moveActions(state, p) {
    const out = [];
    for (const iid of state.players[p].base) {
      if (RB.obj(state, iid).exhausted) continue;
      for (let i = 0; i < state.bf.length; i++) out.push({ t: 'move', iid: iid, to: 'bf' + i });
    }
    for (let i = 0; i < state.bf.length; i++) {
      for (const iid of RB.unitsAt(state, i, p)) {
        if (RB.obj(state, iid).exhausted) continue;
        out.push({ t: 'move', iid: iid, to: 'base' });
        if (RB.hasKeyword(state, iid, 'Ganking') || RB.bfGrantsGanking(state, i))
          for (let j = 0; j < state.bf.length; j++) if (j !== i) out.push({ t: 'move', iid: iid, to: 'bf' + j });
      }
    }
    return out;
  }
  RB.bfGrantsGanking = function (state, i) {
    return RB.battlefieldStatics(state, i).some(s => s.grant === 'Ganking');
  };

  RB.queueActions = function (state, step) {
    if (step.kind === 'mulligan') {
      // Up to two cards set aside, drawn back, then recycled. Rule 121.
      const hand = state.players[step.who].hand;
      const out = [{ t: 'mulligan', toss: [] }];
      for (const a of hand) out.push({ t: 'mulligan', toss: [a] });
      for (let i = 0; i < hand.length; i++)
        for (let j = i + 1; j < hand.length; j++) out.push({ t: 'mulligan', toss: [hand[i], hand[j]] });
      return out;
    }
    if (step.kind === 'chooseShowdown')
      return step.options.map(i => ({ t: 'chooseShowdown', bf: i }));
    if (step.kind === 'choose')
      return step.options.map((o, i) => ({ t: 'choose', ix: i }));
    if (step.kind === 'may')
      return [{ t: 'choose', ix: 0 }, { t: 'choose', ix: 1 }];
    throw new Error('unknown queue step: ' + step.kind);
  };

  // --------------------------------------------------------------------- apply
  RB.apply = function (state, action) {
    const s = RB.clone(state);
    s.via = null;
    dispatch(s, action);
    advance(s);
    return s;
  };

  function dispatch(s, a) {
    const who = RB.whoActs(s);
    switch (a.t) {
      case 'mulligan': return doMulligan(s, who, a.toss);
      case 'play': return doPlay(s, who, a);
      case 'move': return doMove(s, who, a);
      case 'activate': return doActivate(s, who, a);
      case 'pass': return doPass(s, who);
      case 'endTurn': return endTurn(s);
      case 'chooseShowdown': return openShowdown(s, a.bf);
      case 'choose': return RB.answerQueue(s, a);
      default: throw new Error('unknown action ' + a.t);
    }
  }

  function doMulligan(s, p, toss) {
    const P = s.players[p];
    for (const iid of toss) RB.removeFrom(P.hand, iid);
    for (let i = 0; i < toss.length; i++) RB.draw(s, p);
    for (const iid of toss) P.deck.push(iid);       // recycle to the bottom
    RB.shuffle(s, P.deck);
    RB.log(s, 'mulligan', { p: p, n: toss.length });
    s.queue.shift();
    if (!s.queue.length) startTurn(s, s.firstPlayer, true);
  }

  function doPlay(s, p, a) {
    const iid = a.iid;
    const card = RB.cardOf(s, iid);
    const plan = RB.planPayment(s, p, RB.costOf(s, iid));
    if (!plan) throw new Error('cannot pay for ' + card.id);
    RB.pay(s, p, plan);
    RB.removeFrom(s.players[p].hand, iid);
    RB.log(s, 'play', { p: p, iid: iid, card: card.id, to: a.to }, soundFor(card));
    // Playing a card opens a chain; with no responses it resolves immediately. The first
    // pass keeps the chain model honest without making every unit a two-click affair.
    s.chain.push({ iid: iid, controller: p, to: a.to, kind: 'card' });
    s.priority = RB.opponentOf(p);
    s.passes = 0;
  }

  function soundFor(card) {
    return card.type === 'Unit' ? 'unit.deploy' : card.type === 'Spell' ? 'spell.cast'
      : card.type === 'Gear' ? 'gear.equip' : 'card.play';
  }

  function doMove(s, p, a) {
    const iid = a.iid;
    RB.obj(s, iid).exhausted = true;                // exhausting is the cost. Rule 1525.
    const from = RB.locationOf(s, iid);
    if (from.kind === 'base') RB.removeFrom(s.players[p].base, iid);
    else if (from.kind === 'bf') RB.removeFrom(s.bf[from.bf].units, iid);
    if (a.to === 'base') s.players[p].base.push(iid);
    else {
      const i = +a.to.slice(2);
      s.bf[i].units.push(iid);
      RB.obj(s, iid).movedThisTurn++;
      applyContested(s, i, p);
    }
    RB.log(s, 'move', { p: p, iid: iid, to: a.to }, 'unit.move');
  }

  // Contested is applied when a unit of a player who does not control the battlefield
  // becomes present there. Rule 186.
  RB.applyContested = applyContested;
  function applyContested(s, i, p) {
    const bf = s.bf[i];
    if (bf.controller === p) return;
    if (bf.contestedBy !== null) return;
    bf.contestedBy = p;
    RB.log(s, 'contested', { bf: i, p: p });
  }

  function doActivate(s, p, a) {
    const ab = RB.cardOf(s, a.iid).abilities.activated[a.ix];
    const cost = { energy: ab.energy || 0, power: ab.power || 0, domains: ab.domains || [], each: false };
    const plan = RB.planPayment(s, p, cost);
    if (!plan) throw new Error('cannot pay activated ability');
    RB.pay(s, p, plan);
    if (ab.exhaustSelf) RB.obj(s, a.iid).exhausted = true;
    RB.log(s, 'activate', { p: p, iid: a.iid, ix: a.ix }, 'legend.activate');
    s.chain.push({ iid: a.iid, controller: p, kind: 'ability', ix: a.ix });
    s.priority = RB.opponentOf(p);
    s.passes = 0;
  }

  function doPass(s, p) {
    s.passes++;
    if (s.chain.length) {
      if (s.passes >= 2) { resolveTop(s); s.passes = 0; s.priority = s.chain.length ? RB.opponentOf(s.chain[s.chain.length - 1].controller) : s.active; }
      else s.priority = RB.opponentOf(p);
      return;
    }
    if (s.showdown) {
      if (s.passes >= 2) return RB.closeShowdown(s);
      s.priority = RB.opponentOf(p);
      return;
    }
    s.priority = s.active;
  }

  function resolveTop(s) {
    const item = s.chain.pop();
    s.via = { iid: item.iid };
    if (item.kind === 'card') RB.resolveCard(s, item);
    else RB.resolveAbility(s, item);
    RB.log(s, 'resolve', { iid: item.iid }, 'chain.resolve');
    s.via = null;
  }

  // --------------------------------------------------------------- turn structure
  function endTurn(s) {
    RB.log(s, 'endTurn', { p: s.active }, 'turn.end');
    RB.runTriggers(s, 'endOfTurn', { p: s.active });
    // Temporary units leave; "this turn" effects expire.
    for (const iid of Object.keys(s.objects)) {
      const o = s.objects[iid];
      if (o.temporary) RB.kill(s, iid);
      o.buffs = 0; o.movedThisTurn = 0;
    }
    startTurn(s, RB.opponentOf(s.active), false);
  }

  function startTurn(s, p, isFirst) {
    s.active = p; s.turn++; s.priority = p; s.passes = 0;
    s.players[p].scoredThisTurn = [];
    RB.log(s, 'turnStart', { p: p, turn: s.turn }, 'turn.start');

    // Awaken Phase — ready everything you control. Rule 316.2.
    s.phase = 'awaken';
    for (const iid of s.players[p].runes) RB.obj(s, iid).exhausted = false;
    for (const iid of s.players[p].base) RB.obj(s, iid).exhausted = false;
    for (let i = 0; i < s.bf.length; i++) for (const iid of RB.unitsAt(s, i, p)) RB.obj(s, iid).exhausted = false;
    if (s.players[p].legend) RB.obj(s, s.players[p].legend).exhausted = false;

    // Beginning Phase — start-of-turn effects, then the Scoring Step: the turn player
    // HOLDS every battlefield they control. Rule 316.3.
    s.phase = 'beginning';
    RB.runTriggers(s, 'beginningPhase', { p: p });
    for (let i = 0; i < s.bf.length; i++)
      if (s.bf[i].controller === p) RB.score(s, p, i, 'hold');

    // Channel Phase — 2 runes; the player going second channels an extra on their first
    // Channel Phase of the game. Rule 481.
    s.phase = 'channel';
    const extra = (!s.players[p].firstTurnDone && p !== s.firstPlayer) ? 1 : 0;
    RB.channel(s, p, 2 + extra, false);
    s.players[p].firstTurnDone = true;

    // Draw Phase, then both rune pools empty. Rule 316.5.
    s.phase = 'draw';
    RB.draw(s, p);
    for (let q = 0; q < 2; q++) {
      s.players[q].pool.energy = 0;
      for (const d of RB.DOMAINS) s.players[q].pool.power[d] = 0;
    }
    s.phase = 'main';
  }

  // Scoring. A player scores at most once per battlefield per turn, and the WINNING point
  // may only be taken by Hold, or by a Conquer in a turn where every battlefield was
  // scored — otherwise a Conquer at match point draws a card instead. Rule 462.
  RB.score = function (s, p, i, how) {
    const P = s.players[p];
    if (P.scoredThisTurn.includes(i)) return;
    P.scoredThisTurn.push(i);
    if (P.points >= s.victoryScore - 1) {
      const all = s.bf.every((_, j) => P.scoredThisTurn.includes(j));
      if (how === 'conquer' && !all) {
        RB.log(s, 'scoreDenied', { p: p, bf: i, how: how }, 'card.draw');
        RB.draw(s, p);
        return;
      }
    }
    P.points++;
    RB.log(s, 'score', { p: p, bf: i, how: how, points: P.points }, 'point.score');
    if (how === 'conquer') RB.runTriggers(s, 'conquer', { p: p, bf: i });
    else RB.runTriggers(s, 'hold', { p: p, bf: i });
  };

  RB.kill = function (s, iid) {
    const loc = RB.locationOf(s, iid);
    const o = RB.obj(s, iid);
    if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, iid);
    else if (loc.kind === 'bf') RB.removeFrom(s.bf[loc.bf].units, iid);
    else if (loc.kind === 'bfGear') RB.removeFrom(s.bf[loc.bf].gear, iid);
    else return;
    o.damage = 0; o.buffs = 0; o.granted = []; o.exhausted = false; o.temporary = false;
    if (!o.token) s.players[o.owner].trash.push(iid);
    RB.log(s, 'die', { iid: iid, p: o.controller }, 'unit.die');
  };

  // ------------------------------------------------------------------- advance
  // The cleanup loop (rule 323): win check, deaths, control, staging. It runs after every
  // action until the state stops changing, which is what makes triggers and chained
  // showdowns work without a second control flow.
  function advance(s) {
    for (let guard = 0; guard < 64; guard++) {
      if (s.winner !== null) return;
      if (cleanup(s)) continue;
      if (s.chain.length && s.passes >= 2) { resolveTop(s); s.passes = 0; continue; }
      return;
    }
    throw new Error('cleanup did not settle');
  }

  function cleanup(s) {
    let changed = false;
    // 1. Victory.
    for (let p = 0; p < 2; p++)
      if (s.players[p].points >= s.victoryScore && s.players[p].points > s.players[1 - p].points) {
        s.winner = p;
        RB.log(s, 'gameOver', { winner: p }, 'game.win');
        return false;
      }
    // 3. Lethal damage.
    for (let i = 0; i < s.bf.length; i++)
      for (const iid of s.bf[i].units.slice())
        if (RB.obj(s, iid).damage > 0 && RB.obj(s, iid).damage >= RB.mightOf(s, iid)) { RB.kill(s, iid); changed = true; }
    for (let p = 0; p < 2; p++)
      for (const iid of s.players[p].base.slice())
        if (RB.obj(s, iid).damage > 0 && RB.obj(s, iid).damage >= RB.mightOf(s, iid)) { RB.kill(s, iid); changed = true; }
    // 4. An open battlefield with nobody on it and no fight pending becomes uncontrolled.
    if (!s.showdown && !s.chain.length)
      for (const bf of s.bf)
        if (!bf.units.length && !bf.showdownStaged && !bf.combatStaged && bf.controller !== null) {
          bf.controller = null; changed = true;
        }
    // 6/7. Stage showdowns and combats where Contested was applied.
    for (let i = 0; i < s.bf.length; i++) {
      const bf = s.bf[i];
      if (bf.contestedBy === null) continue;
      const mine = RB.unitsAt(s, i, bf.contestedBy).length;
      const theirs = RB.unitsAt(s, i, RB.opponentOf(bf.contestedBy)).length;
      const stage = mine > 0;
      if (bf.showdownStaged !== stage) { bf.showdownStaged = stage; changed = true; }
      const cstage = mine > 0 && theirs > 0;
      if (bf.combatStaged !== cstage) { bf.combatStaged = cstage; changed = true; }
      if (!stage) { bf.contestedBy = null; changed = true; }
    }
    // 8. In a neutral open state, a staged showdown opens now.
    if (!s.showdown && !s.chain.length && !s.queue.length) {
      const staged = s.bf.map((b, i) => b.showdownStaged ? i : -1).filter(i => i >= 0);
      if (staged.length === 1) { openShowdown(s, staged[0]); return true; }
      if (staged.length > 1) { s.queue.push({ kind: 'chooseShowdown', who: s.active, options: staged }); return true; }
    }
    return changed;
  }

  function openShowdown(s, i) {
    if (s.queue.length && s.queue[0].kind === 'chooseShowdown') s.queue.shift();
    const bf = s.bf[i];
    const attacker = bf.contestedBy;
    const defender = RB.opponentOf(attacker);
    bf.showdownStaged = false;
    s.showdown = { bf: i, attacker: attacker, defender: defender, combat: bf.combatStaged };
    // The Attacker gains Focus, and a player who gains Focus also gains Priority. Rule 315.4.
    s.focus = attacker; s.priority = attacker; s.passes = 0;
    for (const iid of RB.unitsAt(s, i, attacker)) RB.obj(s, iid).role = 'attacker';
    for (const iid of RB.unitsAt(s, i, defender)) RB.obj(s, iid).role = 'defender';
    RB.log(s, 'showdownOpen', { bf: i, attacker: attacker, defender: defender, combat: s.showdown.combat }, 'showdown.start');
  }
  RB.openShowdown = openShowdown;
})(window.RB = window.RB || {});
