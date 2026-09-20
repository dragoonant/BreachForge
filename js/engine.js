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
    for (const a of hideActions(state, who)) out.push(a);
    out.push({ t: 'endTurn' });
    return out;
  };

  // The empty set first: a card with no additional costs yields exactly one combination,
  // and a card with them still offers the plain play unless one is mandatory.
  function extraCombinations(state, p, iid, fromZone) {
    const ab = RB.cardOf(state, iid).abilities || {};
    // A static may GRANT an additional cost to a card being played — "your units have
    // Accelerate" is not a keyword the unit carries, it is an option at its play step.
    const all = (ab.additionalCosts || []).concat(RB.grantedExtras(state, p, iid, fromZone));
    if (!all.length) return [[]];
    const usable = RB.availableExtras(state, p, iid, fromZone);
    const optional = all.filter(x => x.optional !== false && usable.includes(x.id)).map(x => x.id);
    const required = all.filter(x => x.optional === false).map(x => x.id);
    for (const r of required) if (!usable.includes(r)) return [];   // cannot be paid: unplayable
    const out = [required.slice()];
    for (const id of optional) out.push(required.concat([id]));
    // An X cost is "pay any amount": each affordable amount is its own play, because what
    // the card does depends on how much was paid.
    const x = all.find(c => c.x);
    if (x) {
      const grown = [];
      for (const combo of out)
        for (let n = 1; n <= RB.maxX(state, p, iid, x); n++)
          grown.push(combo.concat(['x' + n]));
      return out.concat(grown);
    }
    return out;
  }

  // How much X could this player pay, on top of everything else the card costs?
  RB.maxX = function (state, p, iid, x) {
    const base = RB.costOf(state, iid);
    let n = 0;
    while (n < 12) {
      const probe = { energy: base.energy + (x.energyEach || 0) * (n + 1),
        power: base.power + (x.powerEach || 1) * (n + 1),
        domains: base.domains.slice(), each: false, forKind: 'card' };
      if (!RB.canPay(state, p, probe)) break;
      n++;
    }
    return n;
  };

  // Additional costs a static grants to a card being played.
  // `fromZone` is where the card is being played FROM — 'hand', 'champion' or 'hidden'.
  // Several cards grant an option only to plays out of one zone, and a grant with no zone
  // filter would hand it to exactly the plays the printed card excludes.
  RB.grantedExtras = function (state, p, iid, fromZone) {
    const out = [];
    const card = RB.cardOf(state, iid);
    for (const src of RB.allUnits(state).concat(state.players.map(P => P.legend)).filter(Boolean)) {
      if (RB.obj(state, src).controller !== p) continue;
      if (src === iid) continue;                    // a card does not grant to itself
      for (const st of (RB.card(RB.obj(state, src).cardId).abilities || {}).statics || []) {
        if (!st.grantsExtra) continue;
        if (st.tag && !(card.tags || []).includes(st.tag)) continue;
        if (st.type && card.type !== st.type) continue;
        if (st.fromZone && fromZone && st.fromZone !== fromZone) continue;
        if (st.fromZone && !fromZone) continue;
        out.push(st.grantsExtra);
      }
    }
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
    // The Chosen Champion is played from the Champion Zone, at ordinary cost and ordinary
    // timing. It cannot be returned there, so once played it lives in the usual zones.
    if (P.champion && mode === 'main') {
      const card = RB.cardOf(state, P.champion);
      for (const pick of extraCombinations(state, p, P.champion, 'champion')) {
        const cost = RB.totalCost(state, P.champion,
          pick.map(id => RB.additionalCost(state, P.champion, id, 'champion')));
        if (!RB.canPay(state, p, cost)) continue;
        for (const dest of playDestinations(state, p, card))
          out.push(pick.length
            ? { t: 'play', iid: P.champion, to: dest, from: 'champion', pay: pick }
            : { t: 'play', iid: P.champion, to: dest, from: 'champion' });
      }
    }

    // A facedown card gains [Reaction] and may be played ignoring its base cost, from the
    // turn after it was hidden (§811). It is offered in every mode a Reaction is.
    for (let i = 0; i < state.bf.length; i++) {
      for (const h of state.bf[i].hidden) {
        if (h.owner !== p || state.bf[i].controller !== p) continue;
        if (h.turnHidden >= state.turn) continue;             // not until the next turn
        const card = RB.cardOf(state, h.iid);
        const dests = playDestinations(state, p, card);
        // A facedown play takes additional costs like any other. It ignores the card's
        // BASE cost, not the costs a player chooses to add on top of it.
        for (const pick of extraCombinations(state, p, h.iid, 'hidden')) {
          if (pick.length) {
            const extra = { energy: 0, power: 0, domains: RB.DOMAINS.slice(), each: false, forKind: 'card' };
            for (const id of pick) {
              const x = RB.additionalCost(state, h.iid, id, 'hidden');
              extra.energy += x.energy || 0; extra.power += x.power || 0;
            }
            if (!RB.canPay(state, p, extra)) continue;
          }
          for (const dest of dests)
            out.push(pick.length
              ? { t: 'play', iid: h.iid, to: dest, from: 'hidden', bf: i, pay: pick }
              : { t: 'play', iid: h.iid, to: dest, from: 'hidden', bf: i });
        }
      }
    }
    for (const iid of P.hand) {
      const card = RB.cardOf(state, iid);
      if (seen.has(card.id)) continue;               // one action per distinct card in hand
      if (!timingOk(state, card, mode)) continue;
      // Every combination of optional additional costs the player could choose is its own
      // action, because paying one changes both what the card costs and what it does —
      // [Accelerate] is a different play, not a decision taken afterwards.
      if (RB.restricted(state, p, 'play', card.type)) continue;
      const dests = playDestinations(state, p, card);
      if (!dests.length) continue;
      let any = false;
      for (const pick of extraCombinations(state, p, iid, 'hand')) {
        const cost = RB.totalCost(state, iid,
          pick.map(id => RB.additionalCost(state, iid, id, 'hand')));
        if (!RB.canPay(state, p, cost)) continue;
        any = true;
        for (const dest of dests)
          out.push(pick.length ? { t: 'play', iid: iid, to: dest, pay: pick }
                               : { t: 'play', iid: iid, to: dest });
      }
      if (any) seen.add(card.id);
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
        if (a.killSelf && RB.locationOf(state, iid).kind === 'nowhere') return;
        // An ability's legality is not only its cost. "Use only if you've played an
        // Equipment this turn" is a gate: without it the ability is either offered and
        // fizzles for full price, or the clause is dropped — both the wrong card.
        if (a.when && !RB.testCondition(state, a.when, { p: p, source: iid })) return;
        const cost = RB.abilityCost(state, iid, a);
        if (!RB.canPay(state, p, cost)) return;
        out.push({ t: 'activate', iid: iid, ix: ix });
      });
    }
    return out;
  }

  function playDestinations(state, p, card) {
    if (card.type === 'Unit') {
      // A unit is played to your base. It cannot be played straight to a battlefield
      // unless something says so — [Ambush] is "I may be played to a battlefield where
      // you control Units" (§811-adjacent), and a card may force a battlefield outright.
      const ab = card.abilities || {};
      const kw = n => (ab.keywords || []).some(k => k === n || k.name === n);
      if (ab.playTo === 'battlefield') return state.bf.map((_, i) => 'bf' + i);
      const out = ['base'];
      if (ab.playTo === 'any')
        for (let i = 0; i < state.bf.length; i++) out.push('bf' + i);
      else {
        // A play-location permission is narrow on most cards — "where you have units",
        // "where there are enemy units", "a battlefield you're attacking". Each is a named
        // predicate, not the blanket playTo:'battlefield'.
        const perms = (ab.playAlso || []).slice();
        if (kw('Ambush')) perms.push('whereIHaveUnits');
        for (let i = 0; i < state.bf.length; i++)
          if (perms.some(name => RB.playWhere(name)(state, p, i))) out.push('bf' + i);
      }
      return out;
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
      if (RB.obj(state, iid).exhausted || RB.obj(state, iid).cantMove) continue;
      for (let i = 0; i < state.bf.length; i++) out.push({ t: 'move', iid: iid, to: 'bf' + i });
    }
    for (let i = 0; i < state.bf.length; i++) {
      for (const iid of RB.unitsAt(state, i, p)) {
        if (RB.obj(state, iid).exhausted || RB.obj(state, iid).cantMove) continue;
        if (!RB.obj(state, iid).noMoveToBase) out.push({ t: 'move', iid: iid, to: 'base' });
        if (RB.hasKeyword(state, iid, 'Ganking') || RB.bfGrantsGanking(state, i))
          for (let j = 0; j < state.bf.length; j++) if (j !== i) out.push({ t: 'move', iid: iid, to: 'bf' + j });
      }
    }
    return out;
  }
  // Where may this card be played, beyond your base? One predicate per printed phrase.
  const PLAY_WHERE = {
    whereIHaveUnits: (s, p, i) => RB.unitsAt(s, i, p).length > 0,
    whereEnemyUnits: (s, p, i) => RB.unitsAt(s, i, RB.opponentOf(p)).length > 0,
    whereIAmAttacking: (s, p, i) => !!(s.showdown && s.showdown.bf === i && s.showdown.attacker === p)
      || s.bf[i].contestedBy === p,
    whereIControl: (s, p, i) => s.bf[i].controller === p,
    anyBattlefield: () => true,
  };
  RB.playWhere = function (name) {
    const fn = PLAY_WHERE[name];
    if (!fn) throw new Error('no play-location permission named ' + name);
    return fn;
  };
  RB.definePlayWhere = function (name, fn) { PLAY_WHERE[name] = fn; };

  RB.bfGrantsGanking = function (state, i) {
    return RB.battlefieldStatics(state, i).some(s => s.grant === 'Ganking');
  };

  // Hide: pay one Power of any domain to put a card facedown at a battlefield you control
  // that has no facedown card there yet, for as long as you control it (§811). Hiding is
  // not a subset of playing — it opens no chain.
  function hideActions(state, p) {
    const out = [];
    const cost = { energy: 0, power: 1, domains: RB.DOMAINS.slice(), each: false };
    if (!RB.canPay(state, p, cost)) return out;
    const spots = [];
    for (let i = 0; i < state.bf.length; i++)
      if (state.bf[i].controller === p && !state.bf[i].hidden.length) spots.push(i);
    if (!spots.length) return out;
    const seen = new Set();
    for (const iid of state.players[p].hand) {
      const card = RB.cardOf(state, iid);
      if (seen.has(card.id)) continue;
      if (!RB.hasKeyword(state, iid, 'Hidden')) continue;
      seen.add(card.id);
      for (const i of spots) out.push({ t: 'hide', iid: iid, to: 'bf' + i });
    }
    return out;
  }

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
    if (step.kind === 'target') {
      // Every legal answer is a distinct action, so the AI answers targeting through the
      // same path the human does and a replayed game resumes mid-prompt.
      const out = [];
      const pick = (chosen, from) => {
        if (chosen.length === step.n) { out.push({ t: 'choose', selection: chosen.slice() }); return; }
        for (let i = from; i < step.options.length; i++) {
          chosen.push(step.options[i]);
          pick(chosen, i + 1);
          chosen.pop();
          if (out.length > 60) return;         // deterministic cap on a very wide choice
        }
      };
      pick([], 0);
      if (!out.length) out.push({ t: 'choose', selection: [] });
      return out;
    }
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
      case 'hide': return doHide(s, who, a);
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
    // Recycle is "put it on the bottom of the corresponding deck" (rule 416) — not a
    // shuffle. Shuffling here would put a mulliganed card back on top a third of the time.
    for (const iid of toss) P.deck.push(iid);
    RB.log(s, 'mulligan', { p: p, n: toss.length });
    s.queue.shift();
    if (!s.queue.length) startTurn(s, s.firstPlayer, true);
  }

  function doHide(s, p, a) {
    const i = +a.to.slice(2);
    const plan = RB.planPayment(s, p, { energy: 0, power: 1, domains: RB.DOMAINS.slice(), each: false });
    if (!plan) throw new Error('cannot pay to hide');
    RB.pay(s, p, plan);
    RB.removeFrom(s.players[p].hand, a.iid);
    s.bf[i].hidden.push({ iid: a.iid, owner: p, turnHidden: s.turn });
    RB.log(s, 'hide', { p: p, iid: a.iid, bf: i }, 'card.play');
  }

  function doPlay(s, p, a) {
    const iid = a.iid;
    const P = s.players[p];
    const card = RB.cardOf(s, iid);
    if (a.from === 'hidden') return doPlayHidden(s, p, a);
    // Optional additional costs are chosen as the card is played and are part of its
    // total cost (§349 step 3), so they are solved and paid together with the base cost —
    // never as an effect afterwards, which would make an unpayable card castable.
    const zone = a.from || 'hand';
    const xPaid = (a.pay || []).filter(id => /^x\d+$/.test(id)).map(id => +id.slice(1))[0] || 0;
    const extras = (a.pay || []).filter(id => !/^x\d+$/.test(id))
      .map(id => RB.additionalCost(s, iid, id, zone));
    const cost = RB.totalCost(s, iid, extras);
    if (xPaid) {
      const x = (RB.cardOf(s, iid).abilities.additionalCosts || []).find(c => c.x);
      cost.energy += (x.energyEach || 0) * xPaid;
      cost.power += (x.powerEach || 1) * xPaid;
      cost.each = false;
    }
    const plan = RB.planPayment(s, p, cost);
    if (!plan) throw new Error('cannot pay for ' + card.id);
    RB.pay(s, p, plan);
    for (const x of extras) RB.payExtra(s, p, iid, x);
    if (a.from === 'champion') P.champion = null; else RB.removeFrom(P.hand, iid);
    // Count it before anything resolves: a card that asks "is this my second card this
    // turn" is asking about itself, and a counter bumped afterwards answers one too low.
    P.playedThisTurn.push(card.id);
    if ((card.tags || []).includes('Equipment') || card.type === 'Gear') P.turnFlags.equipment = true;
    RB.log(s, 'play', { p: p, iid: iid, card: card.id, to: a.to,
      nth: P.playedThisTurn.length }, soundFor(card));
    RB.runTriggers(s, 'cardPlayed', { p: p, iid: iid, nth: P.playedThisTurn.length,
      type: card.type });
    // Units and Gear resolve immediately on finalization and never sit on the chain
    // (rules §356); only spells and non-Add abilities linger there.
    const item = { iid: iid, controller: p, to: a.to, kind: 'card', targets: a.targets,
      paid: (a.pay || []).slice(), fromZone: zone, xPaid: xPaid,
      cardId: card.id, energy: card.energy || 0 };
    // Relevant choices are made as the card is played (§349 step 2), so a card that
    // declares what it chooses records it on the chain item. That is what lets a counter
    // read "a spell that chose exactly one of my units" instead of countering anything.
    if (card.abilities && card.abilities.chooses)
      item.targets = RB.select(s, card.abilities.chooses, { p: p, source: iid });
    if (card.type === 'Unit' || card.type === 'Gear') { RB.resolveCard(s, item); return; }
    s.chain.push(item);
    s.priority = RB.opponentOf(p);
    s.passes = 0;
  }

  // Playing from face down ignores the card's base cost and is a different play from a
  // hand play — several cards read one and not the other, so the distinction is recorded.
  function doPlayHidden(s, p, a) {
    const bf = s.bf[a.bf];
    const h = bf.hidden.find(x => x.iid === a.iid);
    if (!h) throw new Error('no hidden card ' + a.iid);
    bf.hidden.splice(bf.hidden.indexOf(h), 1);
    const card = RB.cardOf(s, a.iid);
    const P = s.players[p];
    P.playedThisTurn.push(card.id);
    RB.log(s, 'play', { p: p, iid: a.iid, card: card.id, to: a.to, from: 'hidden',
      nth: P.playedThisTurn.length }, soundFor(card));
    RB.runTriggers(s, 'cardPlayed', { p: p, iid: a.iid, nth: P.playedThisTurn.length,
      type: card.type, fromHidden: true });
    // A facedown play ignores the BASE cost; additional costs the player chose still get
    // paid, which is why they were offered.
    const extras = (a.pay || []).map(id => RB.additionalCost(s, a.iid, id, 'hidden'));
    if (extras.length) {
      const cost = { energy: 0, power: 0, domains: RB.DOMAINS.slice(), each: false, forKind: 'card' };
      for (const x of extras) { cost.energy += x.energy || 0; cost.power += x.power || 0; }
      const plan = RB.planPayment(s, p, cost);
      if (!plan) throw new Error('cannot pay the additional cost on a facedown play');
      RB.pay(s, p, plan);
      for (const x of extras) RB.payExtra(s, p, a.iid, x);
    }
    const item = { iid: a.iid, controller: p, to: a.to, kind: 'card', fromHidden: true,
      cardId: card.id, energy: card.energy || 0,
      paid: (a.pay || []).slice(), fromZone: 'hidden' };
    if (card.type === 'Unit' || card.type === 'Gear') { RB.resolveCard(s, item); return; }
    s.chain.push(item);
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
    RB.runTriggers(s, 'moved', { p: p, iid: iid,
      bf: a.to === 'base' ? undefined : +a.to.slice(2),
      fromBf: from.kind === 'bf' ? from.bf : undefined });
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
    const cost = RB.abilityCost(s, a.iid, ab);
    const plan = RB.planPayment(s, p, cost);
    if (!plan) throw new Error('cannot pay activated ability');
    RB.pay(s, p, plan);
    if (ab.exhaustSelf) RB.obj(s, a.iid).exhausted = true;
    RB.log(s, 'activate', { p: p, iid: a.iid, ix: a.ix }, 'legend.activate');
    // An ability may cost the source's own life ("Kill this, [E]: …"). Killing it is part
    // of paying, so it happens before the effect, not after.
    if (ab.killSelf) RB.kill(s, a.iid);
    // The item records what it is and what it chose, so a counter can read "a spell OR
    // ABILITY that chose exactly one of my units" rather than matching spells only.
    const item = { iid: a.iid, controller: p, kind: 'ability', ix: a.ix,
      cardId: RB.cardOf(s, a.iid).id, energy: ab.energy || 0 };
    if (ab.chooses) item.targets = RB.select(s, ab.chooses, { p: p, source: a.iid });
    s.chain.push(item);
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
  // The Ending Phase (§317). The Expiration Step is a cleanup with three steps inserted,
  // and each of them is a rule the engine was missing: all damage heals, every "this
  // turn" effect expires — which is where Stun clears, not in the Awaken Phase — and both
  // players' rune pools empty.
  // "Take a turn after this one." The turn loop hands play to the other seat; an extra
  // turn is a queue in front of that, so the same seat comes back before the other does.
  RB.defineExtraTurn = function (s, p) { (s.extraTurns = s.extraTurns || []).push(p); };

  function endTurn(s) {
    RB.log(s, 'endTurn', { p: s.active }, 'turn.end');
    RB.runTriggers(s, 'endOfTurn', { p: s.active });
    for (const iid of Object.keys(s.objects)) {
      const o = s.objects[iid];
      if (o.temporary) { RB.kill(s, iid); continue; }
      o.damage = 0;                // 3c. Heal all Units
      o.buffs = 0;                 // 3d. "this turn" effects expire
      o.granted = [];
      o.stunned = false;           //     …which is where Stun clears
      o.cantMove = false;
      o.movedThisTurn = 0;
    }
    for (const bf of s.bf) for (const h of bf.hidden) h.revealedTo = [];
    s.restrictions = [];
    s.preventEffectDamage = false;
    for (const iid of Object.keys(s.objects)) s.objects[iid].replaces = null;
    for (let q = 0; q < 2; q++) {  // 3e. Rune pools empty; unspent resources are lost
      s.players[q].pool.energy = 0;
      s.players[q].pool.any = 0;
      s.players[q].pool.showdownOnly = 0;
      s.players[q].pool.tagged = [];
      for (const d of RB.DOMAINS) s.players[q].pool.power[d] = 0;
    }
    const extra = (s.extraTurns && s.extraTurns.length) ? s.extraTurns.shift() : null;
    startTurn(s, extra === null ? RB.opponentOf(s.active) : extra, false);
  }

  function startTurn(s, p, isFirst) {
    s.active = p; s.turn++; s.priority = p; s.passes = 0;
    s.players[p].scoredThisTurn = [];
    s.players[p].playedThisTurn = [];
    s.players[p].drawsThisTurn = 0;
    s.players[p].turnFlags = {};
    s.players[p].powerSpentThisTurn = 0;
    RB.log(s, 'turnStart', { p: p, turn: s.turn }, 'turn.start');

    // Awaken Phase — ready everything you control. Rule 316.2.
    s.phase = 'awaken';
    for (const iid of s.players[p].runes) RB.obj(s, iid).exhausted = false;
    // Stun does NOT hold a card exhausted — it makes it contribute 0 Might in the Combat
    // Damage Step, and it clears in the Ending Cleanup, not here. The Awaken Phase readies
    // everything you control, stunned or not.
    const wake = iid => { RB.obj(s, iid).exhausted = false; };
    for (const iid of s.players[p].base) wake(iid);
    for (let i = 0; i < s.bf.length; i++) for (const iid of RB.unitsAt(s, i, p)) wake(iid);
    if (s.players[p].legend) wake(s.players[p].legend);

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
      s.players[q].pool.any = 0;
      s.players[q].pool.showdownOnly = 0;
      s.players[q].pool.tagged = [];
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

  // Replacement effects (the table lives in js/abilities.js, which owns the hook tables):
  // a card may say "if a friendly unit would die, kill me instead", and the death never
  // happens, so it cannot be a trigger. Each replacement is asked whether it applies and
  // the first that does consumes the event. `replacing` guards the recursion — a
  // replacement's own kill is never itself replaced.
  let replacing = false;

  RB.kill = function (s, iid) {
    const loc = RB.locationOf(s, iid);
    const o = RB.obj(s, iid);
    if (!replacing && loc.kind !== 'nowhere') {
      // A replacement may be PRINTED on a card or placed on one object for the turn, and
      // the dying unit's own is asked first — "if it would die this turn, banish it
      // instead" is about that unit, not about whoever is watching.
      const sources = [iid].concat(
        RB.allUnits(s).filter(u => u !== iid),
        s.players.map(P => P.legend)).filter(Boolean);
      for (const src of sources) {
        const ab = RB.card(RB.obj(s, src).cardId).abilities;
        const printed = (ab && ab.replaces) || [];
        const placed = (RB.obj(s, src).replaces) || [];
        for (const r of printed.concat(placed)) {
          if (r.event !== 'death') continue;
          const fn = RB.replacements[r.kind];
          if (!fn) throw new Error('no replacement named ' + r.kind);
          replacing = true;
          let handled = false;
          try { handled = fn(s, { dying: iid, source: src, spec: r }); }
          finally { replacing = false; }
          if (handled) { RB.log(s, 'replaced', { iid: iid, by: src }); return; }
        }
      }
    }
    if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, iid);
    else if (loc.kind === 'bf') RB.removeFrom(s.bf[loc.bf].units, iid);
    else if (loc.kind === 'bfGear') RB.removeFrom(s.bf[loc.bf].gear, iid);
    else return;
    RB.log(s, 'die', { iid: iid, p: o.controller }, 'unit.die');
    // Order matters and is the card's own first: Deathknell belongs to the card that is
    // dying and is noted at the place it died (rule 808), so it runs before the general
    // events and before the card's modifications are cleared — otherwise a death trigger
    // is a silent drop, which is worse than the card being unplayable. `died` then tells
    // the board a unit died; `leftBoard` is the broader zone change and comes last.
    RB.runDeathTriggers(s, iid, loc);
    const where = loc.kind === 'bf' ? loc.bf : undefined;
    RB.runTriggers(s, 'died', { p: o.controller, iid: iid, bf: where });
    RB.runTriggers(s, 'leftBoard', { p: o.controller, iid: iid, bf: where });
    // Every temporary modification stops being tracked when a card changes zones (§104),
    // and permBuffs is no exception: an object keeps its identity into the trash, and
    // cards play units back out of it — a unit that died buffed must not return buffed.
    o.damage = 0; o.buffs = 0; o.permBuffs = 0; o.counters = 0;
    o.granted = []; o.exhausted = false; o.temporary = false;
    o.stunned = false; o.cantMove = false; o.attachedTo = null;
    for (const g of o.attached.slice()) { o.attached = []; RB.kill(s, g); }
    if (!o.token) s.players[o.owner].trash.push(iid);
  };

  // ------------------------------------------------------------------- advance
  // The cleanup loop (rule 323): win check, deaths, control, staging. It runs after every
  // action until the state stops changing, which is what makes triggers and chained
  // showdowns work without a second control flow.
  // The cleanup loop, by name. apply() runs it after every action; a test or a tool that
  // changes state directly needs the same settling, and a second copy of this loop is the
  // last thing this engine should grow.
  RB.settle = function (s) { advance(s); return s; };

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
    // 2b. Crossings. "When one of your units becomes Mighty" and "when I become ready"
    // are about a CHANGE, and Might is derived on demand — so the previous value is
    // remembered on the object and the crossing is detected here, in the one loop that
    // already runs after every state change.
    for (const iid of RB.allUnits(s)) {
      const o = s.objects[iid];
      const mighty = RB.isMighty(s, iid);
      if (mighty && o.wasMighty === false) {
        o.wasMighty = true;
        RB.runTriggers(s, 'becameMighty', { p: o.controller, iid: iid });
        changed = true;
      } else if (o.wasMighty !== mighty) o.wasMighty = mighty;
      const ready = !o.exhausted;
      if (ready && o.wasReady === false) {
        o.wasReady = true;
        RB.runTriggers(s, 'becameReady', { p: o.controller, iid: iid });
        changed = true;
      } else if (o.wasReady !== ready) o.wasReady = ready;
    }
    // 3. Lethal damage.
    for (let i = 0; i < s.bf.length; i++)
      for (const iid of s.bf[i].units.slice())
        if (RB.isLethalDamage(s, iid)) { RB.kill(s, iid); changed = true; }
    for (let p = 0; p < 2; p++)
      for (const iid of s.players[p].base.slice())
        if (RB.isLethalDamage(s, iid)) { RB.kill(s, iid); changed = true; }
    // 4. An open battlefield with nobody on it and no fight pending becomes uncontrolled.
    if (!s.showdown && !s.chain.length)
      for (const bf of s.bf)
        if (!bf.units.length && !bf.showdownStaged && !bf.combatStaged && bf.controller !== null) {
          bf.controller = null; changed = true;
        }
    // 5. Remove all Hidden cards from battlefields not controlled by the same player and
    // place them in their owner's trash (cleanup step 5). A hidden card lives only as
    // long as you hold the ground it is buried under.
    for (const bf of s.bf)
      for (const h of bf.hidden.slice())
        if (bf.controller !== h.owner) {
          bf.hidden.splice(bf.hidden.indexOf(h), 1);
          s.players[h.owner].trash.push(h.iid);
          RB.log(s, 'hiddenLost', { p: h.owner, iid: h.iid });
          changed = true;
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
    // Three events fire here, and cards want all three: the showdown beginning at this
    // battlefield, and each side taking its designation. Roles are stamped above, so a
    // trigger asking "am I a defender" already reads true.
    RB.runTriggers(s, 'showdownBegins', { p: attacker, bf: i, attacker: attacker, defender: defender });
    RB.runTriggers(s, 'attack', { p: attacker, bf: i });
    RB.runTriggers(s, 'defend', { p: defender, bf: i });
  }
  RB.openShowdown = openShowdown;
})(window.RB = window.RB || {});
