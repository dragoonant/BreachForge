// Decisions the opponent got wrong in a real game, pinned to the position it got them in.
// Each position is the recorded game itself (seed, decks, every action up to the decision),
// so the test is the report, not a reconstruction of it.
export function run(t) {
  const RB = t.RB;
  RB.registerCards();

  // breachforge-trace-1790558636409: master-yi-calm (human, seat 0) vs reksai-fury, seed
  // 4692. Turn 8, the AI's: the human holds both battlefields, Master Yi at 6 Might on bf0.
  // The AI walked a 2 Might Sand Soldier into Yi, lost it, then cast Blood Rush on Rek'Sai
  // in its base, where [Assault] does nothing. endTurn was scored after the human's upkeep
  // — two Hold points — so both of those losing plays outscored ending the turn.
  //
  // The recording is no longer the game as it was played, in two places, because the game
  // as it was played is no longer legal. The human cast ogn-045 Defy into an empty chain
  // on turn 3 (D-13: a counter with nothing to counter cannot be played) — that play and
  // the two passes that resolved it are gone, and Defy stays in the human's hand. And the
  // ogn-029 the AI played by an effect on turn 4 now goes on the chain (D-18), so two
  // passes resolve it before the turn can end. Every remaining action is checked legal
  // below, and the position the AI decides from is the same board at the same score.
  const trace = {
    seed: '4692', decks: ['master-yi-calm', 'reksai-fury'],
    actions: [
      { t: 'mulligan', toss: ['o46', 'o17'] }, { t: 'mulligan', toss: [] },
      { t: 'play', iid: 'o5', to: 'base' }, { t: 'endTurn' },
      { t: 'play', iid: 'o62', to: 'base', from: 'champion' }, { t: 'endTurn' },
      { t: 'move', iids: ['o5'], to: 'bf1' }, { t: 'pass' }, { t: 'pass' },
      { t: 'choose', selection: ['o10'] }, { t: 'play', iid: 'o3', to: 'base' }, { t: 'endTurn' },
      { t: 'move', iids: ['o62'], to: 'bf0' }, { t: 'pass' }, { t: 'pass' },
      { t: 'choose', ix: 0 }, { t: 'choose', ix: 0 }, { t: 'choose', ix: 0 },
      { t: 'pass' }, { t: 'pass' }, { t: 'endTurn' },
      { t: 'play', iid: 'o2', to: 'base', from: 'champion' }, { t: 'endTurn' },
      { t: 'play', iid: 'o81', to: 'bf0' }, { t: 'move', iids: ['o118'], to: 'base' }, { t: 'endTurn' },
      { t: 'move', iids: ['o2'], to: 'bf0' }, { t: 'play', iid: 'o33', to: '-' },
      { t: 'choose', selection: ['o2'] }, { t: 'pass' }, { t: 'pass' }, { t: 'pass' }, { t: 'pass' },
      { t: 'choose', ix: 1 }, { t: 'play', iid: 'o14', to: 'base' }, { t: 'choose', ix: 0 },
      { t: 'endTurn' },
      { t: 'play', iid: 'o75', to: 'base' }, { t: 'play', iid: 'o62', to: 'base' },
      // 39: the move into Yi. 40-41: the showdown. 42: Blood Rush on nothing.
      { t: 'move', iids: ['o118'], to: 'bf0' }, { t: 'pass' }, { t: 'pass' },
    ],
  };
  function at(n) {
    let s = RB.newGame({ seed: trace.seed, decks: trace.decks, humanSeat: 0 });
    for (let i = 0; i < n; i++) {
      // apply does not check legality, and a recording that has stopped being a legal game
      // replays into a position no game can reach — which is how this one went stale.
      const a = JSON.stringify(trace.actions[i]);
      t.ok(RB.legalActions(s).some(l => JSON.stringify(l) === a), 'action ' + i + ' is not legal: ' + a);
      s = RB.apply(s, trace.actions[i]);
    }
    return s;
  }

  for (const tier of ['hard', 'competition']) {
    t.test(tier + ': does not walk a 2 Might Sand Soldier into a 6 Might Master Yi to avoid ending the turn', () => {
      const s = at(39);
      t.eq(RB.whoActs(s), 1, 'the position is the AI\'s decision');
      const a = RB.aiChoose(s, tier);
      t.ok(!(a.t === 'move' && a.to === 'bf0'), 'chose ' + JSON.stringify(a));
    });
    t.test(tier + ': does not cast Blood Rush on a unit in base with no attack left in the turn', () => {
      const s = at(42);
      t.eq(RB.whoActs(s), 1, 'the position is the AI\'s decision');
      const a = RB.aiChoose(s, tier);
      t.eq(JSON.stringify(a), JSON.stringify({ t: 'endTurn' }), 'chose ' + JSON.stringify(a));
    });
  }
}
