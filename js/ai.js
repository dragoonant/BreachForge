// The opponent. It defers entirely to RB.whoActs and RB.legalActions — there is no second
// copy of the rules here. One ply with a greedy evaluator; the evaluator is the part worth
// arguing about, and every weight below has a reason.
(function (RB) {
  'use strict';

  // The game is a race to 8 and the 7th point is categorically worse to concede than the
  // 1st, so points are priced superlinearly rather than one-for-one.
  function pointValue(n, victory) {
    let v = 0;
    for (let i = 1; i <= n; i++) v += 10 + 3.2 * i * (i / victory);
    return v;
  }

  // Every weight the evaluator reads, in one table per tier, so a tuning pass is a diff of
  // numbers and the arena can tell whether it helped. `hard` is the shipped behaviour and is
  // the baseline every experiment is measured against; `competition` starts as its clone so
  // that a change to it is the ONLY difference between the two sides of a match.
  RB.WEIGHTS = {
    hard: {
      bfHeld: 9, bfSafety: 5, safetyScale: 5, reserveWeight: 0.55,
      unitOnBf: 1.6, unitInBase: 1.0, unitFlat: 1.5,
      hand: 2.2, rune: 1.1, energy: 0.15,
      held: 0,              // option value of a card kept for the opponent's turn
      sandbag: 0,           // what it costs to spend an answer at main-phase speed
      endTurnBar: 6, passBar: 4,
    },
  };
  // competition is hard, plus one thing hard is forbidden to think about: what the card in
  // its hand is worth on the OPPONENT'S turn. Measured at 81% of 42 decisive shuffles on
  // 200 holdout pairings the weight had never seen (tools/arena.mjs). The knob saturates
  // above ~40 — 40 and 70 choose byte-identically — so this sits on the plateau rather than
  // at the edge of the sweep.
  RB.WEIGHTS.competition = Object.assign({}, RB.WEIGHTS.hard, { sandbag: 40 });

  RB.evaluate = function (s, me, w) {
    w = w || RB.WEIGHTS.hard;
    if (s.winner !== null) return s.winner === me ? 1e6 : -1e6;
    const them = RB.opponentOf(me);
    let v = pointValue(s.players[me].points, s.victoryScore)
          - pointValue(s.players[them].points, s.victoryScore);

    for (let i = 0; i < s.bf.length; i++) {
      const bf = s.bf[i];
      if (bf.controller === null) continue;
      const sign = bf.controller === me ? 1 : -1;
      // What a held battlefield is worth is expected control at your NEXT upkeep, not
      // control right now — a battlefield the opponent can retake before your turn begins
      // is worth close to nothing. Approximated by how defended it is.
      const mine = RB.unitsAt(s, i, bf.controller).reduce((n, u) => n + RB.mightOf(s, u), 0);
      const theirs = RB.unitsAt(s, i, RB.opponentOf(bf.controller)).reduce((n, u) => n + RB.mightOf(s, u), 0);
      const reserve = s.players[RB.opponentOf(bf.controller)].base
        .reduce((n, u) => n + RB.mightOf(s, u), 0);
      const safety = mine + 0.5 - Math.max(theirs, reserve * w.reserveWeight);
      v += sign * (w.bfHeld + w.bfSafety * Math.max(-1, Math.min(1, safety / w.safetyScale)));
    }

    for (const u of RB.allUnits(s)) {
      const o = RB.obj(s, u);
      const sign = o.controller === me ? 1 : -1;
      const loc = RB.locationOf(s, u);
      // A unit standing on a battlefield is doing work; one idling in the base is potential.
      v += sign * (RB.mightOf(s, u) * (loc.kind === 'bf' ? w.unitOnBf : w.unitInBase) + w.unitFlat);
    }
    v += (s.players[me].hand.length - s.players[them].hand.length) * w.hand;
    v += (s.players[me].runes.length - s.players[them].runes.length) * w.rune;
    // Unspent resources at end of turn are lost, so holding them is worth almost nothing.
    v += (s.players[me].pool.energy - s.players[them].pool.energy) * w.energy;
    // A card that can be played on the OPPONENT'S turn is not the same card as one that can
    // only be played on yours: keeping it is keeping an answer. Worth nothing to a tier that
    // never plans past its own turn, which is why `hard` prices it at zero.
    if (w.held) v += (heldAnswers(s, me) - heldAnswers(s, them)) * w.held;
    return v;
  };

  // A card that can be played on the opponent's turn. The same shape timingOk reads:
  // Action and Reaction are KEYWORDS, and a keyword is either a bare string or an object
  // with a name.
  function isAnswer(s, iid) {
    const kws = (RB.cardOf(s, iid).abilities && RB.cardOf(s, iid).abilities.keywords) || [];
    return kws.some(k => k === 'Reaction' || k.name === 'Reaction'
                      || k === 'Action' || k.name === 'Action');
  }

  // Cards in hand playable at instant speed — the ones worth not spending on your own turn.
  function heldAnswers(s, p) {
    let n = 0;
    for (const iid of s.players[p].hand) if (isAnswer(s, iid)) n++;
    return n;
  }

  // Moving onto a defended battlefield OPENS a showdown; it does not resolve one. Both
  // sides still hold priority, so a one-ply evaluation of the state right after the move
  // sees the attackers alive, standing on enemy ground, and scores the arrival as a gain —
  // the death that follows is one ply past where it was looking. That is why the opponent
  // would feed units into a battlefield one at a time and lose each of them: every one of
  // those suicides evaluated as progress.
  //
  // So the evaluation runs the fight out first. Passing through the engine rather than
  // predicting the damage here is the point: combat maths written into the evaluator would
  // be a second copy of the rules, and it would drift.
  function settled(s) {
    let n = 0;
    while (s.showdown && s.winner === null && n++ < 8) {
      const acts = RB.legalActions(s);
      const pass = acts.find(a => a.t === 'pass');
      if (!pass) break;
      s = RB.apply(s, pass);
    }
    return s;
  }

  // Three opponents, and the difference between them is what they are allowed to look at.
  //   random      — picks uniformly from the legal actions. The control, and the tier the
  //                 arena measures everything else against.
  //   hard        — reads the board and plays to win, one ply plus the showdown it opens.
  //                 It does not model the opponent's hand at all.
  //   competition — hard, plus what the opponent can still answer with.
  RB.aiChoose = function (s, difficulty) {
    const me = RB.whoActs(s);
    const acts = RB.legalActions(s);
    if (acts.length === 1) return acts[0];
    if (difficulty === 'random') return acts[RB.peekInt(s, acts.length, 1)];
    const w = RB.WEIGHTS[difficulty];
    if (!w) throw new Error('unknown difficulty: ' + difficulty);

    // A large action space in the main phase is sampled at an even stride, never truncated
    // from the front — the front of the list is all one card type. Group moves made the
    // space an order of magnitude larger, and they are exactly the actions worth reading,
    // so moves are all kept and only the plays are sampled.
    const moves = acts.filter(a => a.t === 'move');
    const rest = acts.filter(a => a.t !== 'move');
    let pool = rest;
    const CAP = 48;
    if (pool.length > CAP) {
      const stride = pool.length / CAP;
      pool = [];
      for (let i = 0; i < CAP; i++) pool.push(rest[Math.floor(i * stride)]);
      if (!pool.includes(rest[rest.length - 1])) pool.push(rest[rest.length - 1]);
    }
    pool = pool.concat(moves);

    let best = null, bestV = -Infinity;
    for (const a of pool) {
      let v;
      try { v = RB.evaluate(settled(RB.apply(s, a)), me, w); }
      catch (e) { continue; }
      // Ending the turn hands the opponent a scoring step, so it must clear a bar rather
      // than win ties — otherwise the AI passes with playable cards in hand.
      if (a.t === 'endTurn') v -= w.endTurnBar;
      if (a.t === 'pass' && !s.chain.length && !s.showdown) v -= w.passBar;
      // Holding the right card for the right moment. An Action or Reaction spent in your
      // own neutral open state buys whatever it does; spent on the opponent's turn it buys
      // that AND the information about what they committed to first. The penalty is on the
      // TIMING, not on the card — during a showdown or with a chain to answer, the same
      // play is the whole reason the card was kept, and costs nothing here.
      if (w.sandbag && a.t === 'play' && !s.chain.length && !s.showdown && isAnswer(s, a.iid))
        v -= w.sandbag;
      if (v > bestV) { bestV = v; best = a; }
    }
    return best || acts[0];
  };
})(window.RB = window.RB || {});
