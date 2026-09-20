// Ability data for the Unleashed set (43 cards). Keyed by card id; the shape is
// docs/grammar.md. New ops live in js/ops-unl.js, which loads before this file.
//
// Three standing decisions, all of them about not dropping a clause quietly:
//
//  * KEYWORDS THE CORE CAN HONOUR ARE DECLARED, NOT EXPANDED. `[Assault 2]`, `[Ambush]`,
//    `[Deflect]`, `[Shield 2]`, `[Tank]` go in `keywords` in the documented shape, so the
//    day js/combat.js learns one, it applies once rather than twice.
//  * A KEYWORD THE CORE CANNOT HONOUR, BUT THE GRAMMAR CAN SAY EXACTLY, IS EXPANDED.
//    `[Temporary]` is the engine's o.temporary flag, which only an op ever sets, and
//    `[Hunt 2]` is precisely a conquer/hold trigger that adds XP. Declaring either as a
//    bare keyword would leave it inert, which is the defect this file exists to avoid.
//    Each expansion says so at the card.
//  * OPTIONALITY IS NEVER APPROXIMATED. A printed "you may" is `may`, and declining is a
//    legal answer. A decision whose *both* branches act is `choose` instead: `may` queues
//    its step and returns, so anything written after it in the same list would resolve
//    before the player answered.
RB.registerAbilities({

  // Inferna — [Ambush] [Assault 2]
  'unl-002': { keywords: ['Ambush', { name: 'Assault', value: 2 }] },

  // Grim Apothecary — [Ambush]; "When you play me, you may return a friendly unit at a
  // battlefield to its owner's hand."
  'unl-021': {
    keywords: ['Ambush'],
    triggers: [{
      on: 'played',
      effects: [{
        op: 'may', prompt: "Return a friendly unit at a battlefield to its owner's hand?",
        effects: [{ op: 'returnToHand', target: { pick: 'myUnits', at: 'battlefield', low: true } }],
      }],
    }],
  },

  // Mutated Mouser — [Shield 2] [Tank]
  'unl-036': { keywords: [{ name: 'Shield', value: 2 }, 'Tank'] },

  // Soul Sword — [Equip] [C]. Equip is an activated ability keyword, so it is authored as
  // the activated ability it is; the +1 Might bonus while attached is already RB.mightOf.
  'unl-039': {
    activated: [{ power: 1, domains: ['Calm'], effects: [{ op: 'equipSelf' }] }],
  },

  // Allay — [Deflect]; "While I'm at a battlefield, your other units here have [Deflect]."
  // scope 'hereMine' is exactly that: it reaches only while this card is itself at a
  // battlefield, only that battlefield, only its controller's units, and never itself.
  'unl-041': {
    keywords: ['Deflect'],
    statics: [{ grant: 'Deflect', scope: 'hereMine' }],
  },

  'unl-042': { unimplemented: '"If you played this from your hand, draw 1" needs the Hidden facedown zone to tell a hand play from a facedown play; the Hide action has no engine support (D-5).' },

  // Flurry of Feathers — [Reaction]; "Choose one — Counter a spell. / Play four 1 [S] Bird
  // unit tokens with [Deflect]."
  'unl-044': {
    keywords: ['Reaction'],
    effects: [{
      op: 'choose',
      options: [
        { label: 'Counter a spell', effects: [{ op: 'counter' }] },
        { label: 'Play four 1 Might Bird unit tokens with Deflect',
          effects: [{ op: 'keywordToken', cardId: 'tok-bird', n: 4, might: 1, keywords: ['Deflect'] }] },
      ],
    }],
  },

  'unl-053': { unimplemented: 'Its Deathknell reveals an opponent\'s hand and then lets you READ THEIR FACEDOWN CARDS for the turn; facedown cards have no engine support (D-5), and dropping that half would leave the wrong card.' },

  'unl-060': { unimplemented: '"Enemy units here with less Might than me don\'t deal combat damage" suppresses a unit\'s combat contribution. js/combat.js sums RB.mightOf with no exemption hook, and zeroing their Might instead would also make them die to any damage.' },

  // Ruined Rex — [Deathknell][>] Deal 4 to an enemy unit.
  'unl-067': {
    triggers: [{ on: 'deathknell', effects: [{ op: 'damage', n: 4, target: { pick: 'enemyUnits' } }] }],
  },

  // Turn to Dust — "Give a gear Temporary." The pool is every gear as printed; only which
  // legal gear is taken is a heuristic (an opponent's first, then the biggest bonus).
  'unl-070': {
    effects: [{ op: 'giveTemporary', target: { pick: 'gear', prefer: 'enemy' } }],
  },

  'unl-074': { unimplemented: 'Triggers on drawing your SECOND card each turn; there is no draw event and no per-turn draw counter, and RB.draw is core.' },

  // Sprite Fountain — [Temporary]; play effect makes a 3 Might Sprite; Deathknell repeats
  // that play effect. [Temporary] is expanded (see the header): the engine's sweep reads
  // o.temporary, which only an op sets, so the keyword alone would be inert.
  'unl-078': {
    triggers: [
      { on: 'played', effects: [
        { op: 'giveTemporary', target: 'self' },
        { op: 'keywordToken', cardId: 'tok-sprite', might: 3, ready: true, temporary: true },
      ] },
      { on: 'deathknell', effects: [
        { op: 'keywordToken', cardId: 'tok-sprite', might: 3, ready: true, temporary: true },
      ] },
    ],
  },

  'unl-079': { unimplemented: 'Triggers when a showdown BEGINS at this battlefield — RB.openShowdown runs no triggers — and then asks the controller to pay [1] mid-resolution, which no cost shape in the grammar covers.' },

  // Hwei — "When I move, draw 1, then discard 1. Then, do the following based on the
  // discarded card's type." The branch needs the discarded card's type, which the core
  // discard op does not report, so discardByType does both halves.
  'unl-080': {
    triggers: [{
      on: 'moved',
      effects: [{
        op: 'cond', test: { eventIsSelf: true },
        effects: [
          { op: 'draw', n: 1 },
          { op: 'discardByType',
            spell: [{ op: 'draw', n: 1 }],
            gear: [{ op: 'ready', what: 'runes', n: 2 }],
            unit: [{ op: 'buff', n: 3, target: 'self' }] },
        ],
      }],
    }],
  },

  'unl-106': { unimplemented: 'It counters only a spell "that chooses it and no other friendly unit", and chain items carry no targeting data — nothing populates item.targets — so the condition is unverifiable and an unconditional counter is far broader than the card.' },

  // Master Yi — [Hunt 2] expanded (see the header: nothing in the core reads the Hunt
  // keyword, so declaring it would leave it inert); [Level 6] as two conditional statics
  // that read the controller's XP.
  'unl-113': {
    triggers: [
      { on: 'conquer', mine: true, here: true, effects: [{ op: 'xp', n: 2 }] },
      { on: 'hold', mine: true, here: true, effects: [{ op: 'xp', n: 2 }] },
    ],
    statics: [
      { grant: 'Deflect', scope: 'self', when: { xpAtLeast: 6 } },
      { grant: 'Ganking', scope: 'self', when: { xpAtLeast: 6 } },
    ],
  },

  // Poppy — [Deflect]; "When you play me, if an opponent's score is within 3 points of
  // the Victory Score, ready me and gain 3 XP."
  'unl-116': {
    keywords: ['Deflect'],
    triggers: [{
      on: 'played',
      effects: [{
        op: 'cond', test: { opponentScoreWithin: 3 },
        effects: [{ op: 'ready', target: 'self' }, { op: 'xp', n: 3 }],
      }],
    }],
  },

  'unl-118': { unimplemented: '"Any amount of your damage is enough to kill enemy units" rewrites the lethal-damage rule for one player\'s damage. Statics carry might and grant only; the lethality test lives in RB.cleanup and js/combat.js.' },

  'unl-120': { unimplemented: 'Both clauses are play-location permissions (Ambush\'s "where you have units" plus "where there are enemy units"). The only lever is playTo:\'battlefield\', which offers EVERY battlefield — a blanket where the card is narrow.' },

  // Lunar Boon — [Reaction]; discard 1, then draw 2.
  'unl-125': {
    keywords: ['Reaction'],
    effects: [{ op: 'discard', n: 1 }, { op: 'draw', n: 2 }],
  },

  // Star-Crossed — [Reaction]; return a friendly unit and an enemy unit to hand. Both are
  // compulsory as printed. The friendly one is taken small, the enemy one big; every
  // candidate in each pool is a legal choice.
  'unl-128': {
    keywords: ['Reaction'],
    effects: [
      { op: 'returnToHand', target: { pick: 'myUnits', low: true } },
      { op: 'returnToHand', target: { pick: 'enemyUnits' } },
    ],
  },

  // Abandon — [Reaction]; counter a spell, returning it to hand rather than to the trash;
  // then Predict.
  'unl-131': {
    keywords: ['Reaction'],
    effects: [{ op: 'counterToHand' }, { op: 'predict', n: 1 }],
  },

  // Existential Dread — [Action]; [Repeat] [2]; stun an attacking enemy unit, or bounce it
  // if it is already stunned. DEVIATION: Repeat is printed as an optional additional cost
  // paid as you play; there is no additional-cost shape, so it is asked and paid at
  // resolution instead — the same 2 Energy for the same second execution, decided later.
  'unl-134': {
    keywords: ['Action'],
    effects: [
      { op: 'stunOrReturn', target: { pick: 'enemyUnits', role: 'attacker' } },
      { op: 'cond', test: { energyAtLeast: 2 }, effects: [{
        op: 'may', prompt: "Repeat: pay 2 Energy to execute this spell's effect one more time?",
        effects: [
          { op: 'payEnergy', n: 2 },
          { op: 'stunOrReturn', target: { pick: 'enemyUnits', role: 'attacker' } },
        ],
      }] },
    ],
  },

  // Scryer's Bloom — enters exhausted; then "Kill this, [1], [T]: Predict 2, then draw 1.
  // Gain 1 XP." The self-kill is a cost on the card and the first instruction here; the
  // engine has no counters, so the two are indistinguishable in play.
  'unl-136': {
    triggers: [{ on: 'played', effects: [{ op: 'exhaust', target: 'self' }] }],
    activated: [{
      energy: 1, exhaustSelf: true,
      effects: [
        { op: 'kill', target: 'self' },
        { op: 'predict', n: 2 },
        { op: 'draw', n: 1 },
        { op: 'xp', n: 1 },
      ],
    }],
  },

  'unl-141': { unimplemented: 'Its play effect fires only when played FROM FACE DOWN; facedown cards have no engine support (D-5) and the two plays cannot be told apart.' },

  'unl-142': { unimplemented: 'Killing a friendly unit is an ADDITIONAL COST — it decides whether the spell can be played at all, which the grammar\'s cost shape (energy/power/exhaustSelf) cannot say — so authored as an effect the spell would be castable as a blank.' },

  'unl-147': { unimplemented: 'Adds the Baron Pit BATTLEFIELD token (no battlefield token id in data/tokens.js and no op that adds a battlefield to s.bf) and is untargetable by enemy spells, which has no engine concept. The "+2 Might to other friendly units" half is a plain static and would be fine alone.' },

  // Black Rose Dignitary — [Assault] (X omitted is 1); Deathknell channels a rune exhausted.
  'unl-152': {
    keywords: [{ name: 'Assault', value: 1 }],
    triggers: [{ on: 'deathknell', effects: [{ op: 'channel', n: 1, exhausted: true }] }],
  },

  // Shepherd's Heirloom — "When you play this, gain 1 XP."; "[Equip] — Spend 1 XP".
  // DEVIATION: an activated ability's cost may only be energy, power or exhausting itself,
  // so the XP price is enforced on resolution instead. With no XP the ability is still
  // offered but does nothing, which costs nothing — it is never free to actually equip.
  'unl-158': {
    triggers: [{ on: 'played', effects: [{ op: 'xp', n: 1 }] }],
    activated: [{
      effects: [{
        op: 'cond', test: { xpAtLeast: 1 },
        effects: [{ op: 'spendXP', n: 1 }, { op: 'equipSelf' }],
      }],
    }],
  },

  // Shadow's Call — choose a friendly unit without Temporary, give it Temporary, draw 2.
  // Compulsory as printed; the unit taken is the smallest legal one.
  'unl-165': {
    effects: [
      { op: 'giveTemporary', target: { pick: 'myUnits', notTemporary: true, low: true } },
      { op: 'draw', n: 2 },
    ],
  },

  'unl-169': { unimplemented: 'Banishes a card from an opponent\'s hand and returns it "when they hold, even if I\'m no longer on the board" — a delayed ability that outlives its source, which the trigger table cannot express because every trigger is asked of cards still in play.' },

  'unl-173': { unimplemented: 'Killing a friendly [Mighty] unit is an ADDITIONAL COST that gates legality; authored as an effect the spell would be playable with no Mighty unit in play, which is a different card.' },

  // Rift Herald — a move trigger that digs 3 for a unit, and a Deathknell that puts a unit
  // out of hand for free. The dig is `choose` and not `may` because BOTH answers recycle
  // the cards that were looked at.
  'unl-179': {
    triggers: [
      { on: 'moved', effects: [{
        op: 'cond', test: { eventIsSelf: true, toBattlefield: true },
        effects: [{
          op: 'choose',
          options: [
            { label: 'Reveal a unit from the top 3, draw it, recycle the rest',
              effects: [{ op: 'digUnit', n: 3, take: true }] },
            { label: 'Recycle all three', effects: [{ op: 'digUnit', n: 3, take: false }] },
          ],
        }],
      }] },
      { on: 'deathknell', effects: [{ op: 'playFromHand', type: 'Unit', to: 'base', ignoreEnergy: true }] },
    ],
  },

  // Gloomist — "When you or an ally hold, you may exhaust me to draw 1." 1v1: "you or an
  // ally" is you. The cond gate is the cost check — an exhausted legend cannot pay — and
  // the may is the printed option.
  'unl-193': {
    triggers: [{
      on: 'hold', mine: true,
      effects: [{
        op: 'cond', test: { selfReady: true },
        effects: [{
          op: 'may', prompt: 'Exhaust Gloomist to draw 1?',
          effects: [{ op: 'exhaust', target: 'self' }, { op: 'draw', n: 1 }],
        }],
      }],
    }],
  },

  // Moonfall — [Action]; choose a battlefield where you have units, optionally pull one
  // enemy unit there, then weaken the enemy units there. `choose` and not `may`, because
  // the weaken happens on both answers and a queued `may` would run it before the answer.
  'unl-198': {
    keywords: ['Action'],
    effects: [{
      op: 'chooseMyBattlefield',
      effects: [{
        op: 'choose',
        options: [
          { label: 'Move an enemy unit there, then give enemy units there -2 Might this turn',
            effects: [
              { op: 'moveUnit', target: { pick: 'enemyUnits' }, to: 'here' },
              { op: 'debuff', n: 2, target: 'hereEnemy' },
            ] },
          { label: 'Move no one; give enemy units there -2 Might this turn',
            effects: [{ op: 'debuff', n: 2, target: 'hereEnemy' }] },
        ],
      }],
    }],
  },

  // Deceiver — on conquer or hold, you may discard 1 and exhaust this legend to copy a
  // unit at that battlefield. The cond is the cost check: a ready legend, a card to
  // discard, and a unit there to copy.
  'unl-199': {
    triggers: [
      { on: 'conquer', mine: true, effects: [{
        op: 'cond', test: { selfReady: true, handMin: 1, nonEmpty: 'here' },
        effects: [{
          op: 'may', prompt: 'Discard 1 and exhaust Deceiver to copy a unit there?',
          effects: [
            { op: 'discard', n: 1 },
            { op: 'exhaust', target: 'self' },
            { op: 'copyToken', target: { pick: 'here' }, to: 'here', ready: true, temporary: true },
          ],
        }],
      }] },
      { on: 'hold', mine: true, effects: [{
        op: 'cond', test: { selfReady: true, handMin: 1, nonEmpty: 'here' },
        effects: [{
          op: 'may', prompt: 'Discard 1 and exhaust Deceiver to copy a unit there?',
          effects: [
            { op: 'discard', n: 1 },
            { op: 'exhaust', target: 'self' },
            { op: 'copyToken', target: { pick: 'here' }, to: 'here', ready: true, temporary: true },
          ],
        }],
      }] },
    ],
  },

  // Mirror Image — choose a unit, play a ready token copy of it to your base, Temporary.
  // A copy carries the copied card's printed characteristics, so the token is minted on
  // that card id rather than on a blank Reflection that would copy nothing.
  'unl-200': {
    effects: [{ op: 'copyToken', target: { pick: 'allUnits' }, to: 'base', ready: true, temporary: true }],
  },

  'unl-205': { unimplemented: 'Triggers when a player plays a SPELL. The trigger table has played · unitPlayed · conquer · hold · beginningPhase · endOfTurn · combatEnd · died · moved · deathknell, and a spell\'s own `played` trigger only ever fires for that spell.' },

  // Dusk Rose Lab — "At the start of your Beginning Phase, you may kill a unit you control
  // here to draw 1." A battlefield's triggers fire with no location, so atThisBattlefield
  // supplies it before `hereMine` is asked.
  'unl-209': {
    triggers: [{
      on: 'beginningPhase',
      effects: [{
        op: 'atThisBattlefield',
        effects: [{
          op: 'cond', test: { nonEmpty: 'hereMine' },
          effects: [{
            op: 'may', prompt: 'Kill a unit you control here to draw 1?',
            effects: [
              { op: 'sacrifice', target: { pick: 'hereMine', low: true } },
              { op: 'draw', n: 1 },
            ],
          }],
        }],
      }],
    }],
  },

  // Forbidding Waste — "While a unit here is defending alone, it has -2 [S]."
  'unl-210': {
    statics: [{ might: -2, scope: 'here', when: 'defendingAlone' }],
  },

  // Star Spring — "The first time a player plays a non-token unit here each turn, they may
  // move another unit they control here to its base." unitPlayed carries no battlefield,
  // so the location is supplied and then checked against where the played unit landed.
  'unl-215': {
    triggers: [{
      on: 'unitPlayed',
      effects: [{
        op: 'atThisBattlefield',
        effects: [{
          op: 'cond', test: { eventUnitHere: true, eventUnitIsToken: false },
          effects: [{
            op: 'firstEachTurn', key: 'starSpring',
            effects: [{
              op: 'cond', test: { nonEmpty: { pick: 'hereMine', notEventUnit: true } },
              effects: [{
                op: 'may', prompt: 'Move another unit you control here to its base?',
                effects: [{ op: 'moveUnit', to: 'base',
                  target: { pick: 'hereMine', notEventUnit: true, low: true } }],
              }],
            }],
          }],
        }],
      }],
    }],
  },

  'unl-234': { unimplemented: 'Adds Energy that may only be spent during showdowns. The rune pool is a single untagged number in js/cost.js, so the ability would produce unrestricted Energy — strictly better than the card.' },

});
