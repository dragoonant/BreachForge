window.RB = window.RB || {};
// Cards the engine owns rather than a set pack: the four Chosen Champions reconstructed
// for decks whose posted list omitted one (D-11). They are authored here because their
// ids fall in set namespaces whose packs were built from a packet that predates them.
RB.registerAbilitiesFallback({

  // Vex — Deflect, and a punish on the opponent deploying into a battlefield she holds.
  // The Stun is the printed keyword: no combat damage this turn, still full Might to kill.
  'unl-150': {
    keywords: ['Deflect'],
    triggers: [{
      on: 'cardPlayed',
      effects: [{
        op: 'when',
        test: { kind: 'all', tests: ['eventIsUnit', 'eventIsOpponents', 'sourceAtBattlefield'] },
        then: [{ op: 'stun', target: 'eventUnit' }, { op: 'cantMove', target: 'eventUnit' }],
      }],
    }],
  },

  // LeBlanc — Assault, and a Deathknell that pays double during your Beginning Phase,
  // which is when the Scoring Step kills things.
  'unl-172': {
    keywords: [{ name: 'Assault', value: 1 }],
    triggers: [{
      on: 'deathknell',
      // "If it's YOUR Beginning Phase" — a Deathknell resolving during the opponent's
      // Beginning Phase (their Temporary sweep, a start-of-turn kill) must draw 1, not 2.
      effects: [{ op: 'when', test: { kind: 'all', tests: ['beginningPhase', 'myTurn'] },
        then: [{ op: 'draw', n: 2 }], otherwise: [{ op: 'draw', n: 1 }] }],
    }],
  },

  // Sivir — Accelerate, and a conditional pair of statics keyed to the Power you have
  // already spent this turn. RB.pay keeps that meter, so the condition reads one number.
  'sfd-143': {
    additionalCosts: [{ id: 'accelerate', energy: 1, power: 1, entersReady: true }],
    statics: [
      { might: 2, scope: 'self', includeSelf: true, when: { powerSpentAtLeast: 2 } },
      { grant: 'Ganking', scope: 'self', includeSelf: true, when: { powerSpentAtLeast: 2 } },
    ],
  },

  // Azir — Accelerate, and an attack trigger that gathers his Sand Soldiers. Moving this
  // way is an effect, not a standard move, so the tokens are not exhausted for it.
  'sfd-177': {
    additionalCosts: [{ id: 'accelerate', energy: 1, power: 1, entersReady: true }],
    triggers: [{
      on: 'attack', here: true,
      effects: [{ op: 'may', prompt: 'Move your token units to this battlefield?',
        effects: [{ op: 'moveTokensHere' }] }],
    }],
  },
});
