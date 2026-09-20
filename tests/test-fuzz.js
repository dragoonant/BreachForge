// The fuzzer is a CRASH gate, never a balance readout. It asserts the properties that hold
// in every legal position: no dead state, no throw, and the game terminates.
export function run(t) {
  const RB = t.RB;
  RB.registerCards();
  const decks = RB.deckData.map(d => d.id);
  const games = t.full ? 200 : 30;

  t.test(games + ' random games terminate with no dead state and no throw', () => {
    const failures = [];
    for (let g = 0; g < games; g++) {
      let s;
      try {
        s = RB.newGame({ seed: 'fz' + g, decks: [decks[g % 10], decks[(g * 7 + 3) % 10]] });
        let n = 0;
        while (!RB.isTerminal(s) && n < 4000) {
          const acts = RB.legalActions(s);
          if (!acts.length) { failures.push('g' + g + ': zero legal actions in ' + s.phase); break; }
          s = RB.apply(s, acts[RB.peekInt(s, acts.length, n)]);
          n++;
        }
        if (!RB.isTerminal(s) && n >= 4000) failures.push('g' + g + ': no termination in 4000 actions');
      } catch (e) {
        failures.push('g' + g + ': ' + e.message.split('\n')[0]);
      }
    }
    t.eq(failures.length, 0, failures.slice(0, 5).join(' | '));
  });

  t.test('a game with a human seat survives a full soak of targeting restarts', () => {
    // The restartable resolution is the riskiest thing in the engine: every card that
    // asks a question re-runs its whole resolution from the top. This asserts that a
    // game where every such question is actually raised still terminates, never offers
    // zero actions, and never leaves a question un-answerable.
    const games = t.full ? 40 : 12;
    let asked = 0;
    const failures = [];
    for (let g = 0; g < games; g++) {
      try {
        let s = RB.newGame({ seed: 'hs' + g, decks: [decks[g % decks.length],
          decks[(g * 5 + 2) % decks.length]], humanSeat: 0 });
        let n = 0;
        while (!RB.isTerminal(s) && n < 4000) {
          if (s.queue[0] && s.queue[0].kind === 'target') asked++;
          const acts = RB.legalActions(s);
          if (!acts.length) { failures.push('g' + g + ': zero legal actions in ' + s.phase); break; }
          s = RB.apply(s, acts[RB.peekInt(s, acts.length, n)]);
          n++;
        }
        if (!RB.isTerminal(s) && n >= 4000) failures.push('g' + g + ': no termination');
      } catch (e) { failures.push('g' + g + ': ' + e.message.split('\n')[0]); }
    }
    t.eq(failures.length, 0, failures.slice(0, 4).join(' | '));
    t.ok(asked > 0, 'the soak actually exercised targeting — it raised ' + asked + ' questions');
  });

  t.test('the AI produces a legal action in every position it is asked about', () => {
    let s = RB.newGame({ seed: 'ai1', decks: [decks[0], decks[4]] });
    const bad = [];
    for (let n = 0; n < 400 && !RB.isTerminal(s); n++) {
      const acts = RB.legalActions(s);
      const a = RB.aiChoose(s, 'hard');
      if (!acts.some(x => JSON.stringify(x) === JSON.stringify(a)))
        bad.push('illegal AI action at ' + s.phase + ': ' + JSON.stringify(a));
      s = RB.apply(s, a);
    }
    t.eq(bad.length, 0, bad.slice(0, 3).join(' | '));
  });

  t.test('the AI beats random play over a short match set', () => {
    let wins = 0, played = 0;
    // Six games is inside the noise band for a one-ply evaluator: a 24-game run measures 71%
    // and a 6-game run has swung to 50%. Sixteen is the smallest honest sample.
    const n = t.full ? 40 : 16;
    for (let g = 0; g < n; g++) {
      let s = RB.newGame({ seed: 'vs' + g, decks: [decks[g % 10], decks[(g + 5) % 10]] });
      let steps = 0;
      while (!RB.isTerminal(s) && steps < 4000) {
        s = RB.apply(s, RB.aiChoose(s, RB.whoActs(s) === 0 ? 'hard' : 'random'));
        steps++;
      }
      if (s.winner !== null) { played++; if (s.winner === 0) wins++; }
    }
    t.ok(played > 0, 'games finished');
    t.ok(wins / played >= 0.62, 'the evaluator beats random: ' + wins + '/' + played);
  });
}
