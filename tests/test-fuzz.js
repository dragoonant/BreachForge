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

  t.test('competition keeps its answers for the opponent\'s turn; hard spends them on its own', () => {
    // The one thing competition is allowed to know that hard is not. Measured, not asserted
    // by eye: over eight games hard spends roughly as many Action/Reaction cards in its own
    // neutral open state as it does in showdowns, and competition almost none — which is
    // what lets it spend MORE of them at the moment they are worth something.
    const isAnswer = (st, iid) => {
      const k = (RB.cardOf(st, iid).abilities && RB.cardOf(st, iid).abilities.keywords) || [];
      return k.some(x => x === 'Reaction' || x.name === 'Reaction'
                      || x === 'Action' || x.name === 'Action');
    };
    const count = tier => {
      let own = 0, theirs = 0;
      for (let g = 0; g < 8; g++) {
        let st = RB.newGame({ seed: 'sb' + g, decks: [decks[g % 10], decks[(g * 7 + 3) % 10]] });
        for (let n = 0; n < 1200 && !RB.isTerminal(st); n++) {
          const a = RB.aiChoose(st, tier);
          if (a.t === 'play' && isAnswer(st, a.iid)) {
            if (!st.chain.length && !st.showdown) own++; else theirs++;
          }
          st = RB.apply(st, a);
        }
      }
      return { own: own, theirs: theirs };
    };
    const h = count('hard'), c = count('competition');
    // Asserted as a RATIO per tier, not as a margin between the two raw counts. The first
    // version of this test said `c.own * 4 < h.own`, which was calibrated when competition
    // spent almost no answers at main-phase speed (7 against hard's 50) — and it broke on the
    // unitOnBf retune, which left the rule in the name completely intact: competition still
    // spent 5:1 toward the opponent's turn (14 own / 70 theirs) while hard still spent the
    // majority on its own (46 own / 32 theirs). A weight pass moving a raw count is not this
    // rule being violated, so the rule is what gets asserted.
    t.ok(h.own > 10, 'hard spends answers at main-phase speed: ' + JSON.stringify(h));
    t.ok(h.own > h.theirs, 'hard spends more on its own turn than the opponent\'s: ' + JSON.stringify(h));
    t.ok(c.theirs > c.own * 3, 'competition holds them for the opponent\'s turn: ' + JSON.stringify(c));
    t.ok(c.theirs > h.theirs, 'and spends more of them there than hard does: ' + c.theirs + ' vs ' + h.theirs);
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
