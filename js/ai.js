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

  RB.evaluate = function (s, me) {
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
      const safety = mine + 0.5 - Math.max(theirs, reserve * 0.55);
      v += sign * (9 + 5 * Math.max(-1, Math.min(1, safety / 5)));
    }

    for (const u of RB.allUnits(s)) {
      const o = RB.obj(s, u);
      const sign = o.controller === me ? 1 : -1;
      const loc = RB.locationOf(s, u);
      // A unit standing on a battlefield is doing work; one idling in the base is potential.
      v += sign * (RB.mightOf(s, u) * (loc.kind === 'bf' ? 1.6 : 1.0) + 1.5);
    }
    v += (s.players[me].hand.length - s.players[them].hand.length) * 2.2;
    v += (s.players[me].runes.length - s.players[them].runes.length) * 1.1;
    // Unspent resources at end of turn are lost, so holding them is worth almost nothing.
    v += (s.players[me].pool.energy - s.players[them].pool.energy) * 0.15;
    return v;
  };

  RB.aiChoose = function (s, difficulty) {
    const me = RB.whoActs(s);
    const acts = RB.legalActions(s);
    if (acts.length === 1) return acts[0];
    if (difficulty === 'random') return acts[RB.peekInt(s, acts.length, 1)];

    // A large action space in the main phase is sampled at an even stride, never truncated
    // from the front — the front of the list is all one card type.
    let pool = acts;
    const CAP = 48;
    if (pool.length > CAP) {
      const stride = pool.length / CAP;
      pool = [];
      for (let i = 0; i < CAP; i++) pool.push(acts[Math.floor(i * stride)]);
      if (!pool.includes(acts[acts.length - 1])) pool.push(acts[acts.length - 1]);
    }

    let best = null, bestV = -Infinity;
    for (const a of pool) {
      let v;
      try { v = RB.evaluate(RB.apply(s, a), me); }
      catch (e) { continue; }
      // Ending the turn hands the opponent a scoring step, so it must clear a bar rather
      // than win ties — otherwise the AI passes with playable cards in hand.
      if (a.t === 'endTurn') v -= 6;
      if (a.t === 'pass' && !s.chain.length && !s.showdown) v -= 4;
      if (v > bestV) { bestV = v; best = a; }
    }
    if (difficulty === 'easy' && RB.peekRandom(s, 2) < 0.35) return pool[RB.peekInt(s, pool.length, 3)];
    return best || acts[0];
  };
})(window.RB = window.RB || {});
