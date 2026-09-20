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
// unl-150 (Vex) and unl-172 (LeBlanc) arrived in data/cards.js after this packet was cut.
// They are claimed here: data/abilities-core.js now loads after the set packs, so its
// fallback fills gaps rather than winning the id.
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

  // Back Off — [Hidden] [Action]; stun a unit, and draw only on a play from hand. The
  // engine owns Hidden outright now, and ctx.fromHidden is the half this card turns on.
  'unl-042': {
    keywords: ['Hidden', 'Action'],
    effects: [
      { op: 'stun', target: { pick: 'allUnits' } },
      { op: 'cond', test: { fromHand: true }, effects: [{ op: 'draw', n: 1 }] },
    ],
  },

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

  // Scuttle Crab — the parenthesis about 0 Might conquering is reminder text, not a
  // clause. Play effect draws; the Deathknell is three instructions, and `revealHidden` is
  // the one that used to be out of reach.
  'unl-053': {
    triggers: [
      { on: 'played', effects: [{ op: 'draw', n: 1 }] },
      { on: 'deathknell', effects: [
        { op: 'revealHand' },
        { op: 'revealHidden' },
        { op: 'xp', n: 1 },
      ] },
    ],
  },

  // Vilemaw — [Ambush]; enemy units here below my Might deal no combat damage; draw on a
  // hold. `noCombatDamage` exempts them from their side's damage SUM without making them
  // any easier to kill, which is why a Might penalty was the wrong shape.
  'unl-060': {
    keywords: ['Ambush'],
    statics: [{ noCombatDamage: true, scope: 'here', when: 'weakerEnemyThanSource' }],
    triggers: [{ on: 'hold', mine: true, here: true, effects: [{ op: 'draw', n: 1 }] }],
  },

  // Ruined Rex — [Deathknell][>] Deal 4 to an enemy unit.
  'unl-067': {
    triggers: [{ on: 'deathknell', effects: [{ op: 'damage', n: 4, target: { pick: 'enemyUnits' } }] }],
  },

  // Turn to Dust — "Give a gear Temporary." The pool is every gear as printed; only which
  // legal gear is taken is a heuristic (an opponent's first, then the biggest bonus).
  'unl-070': {
    effects: [{ op: 'giveTemporary', target: { pick: 'gear', prefer: 'enemy' } }],
  },

  // Frigid Jewel — "When you draw your second card each turn, give a friendly unit +2 [S]
  // this turn." event.nth is which draw this is, so the condition is the printed one.
  'unl-074': {
    triggers: [{
      on: 'drew', mine: true,
      effects: [{
        op: 'cond', test: { eventNth: 2 },
        effects: [{ op: 'buff', n: 2, target: { pick: 'myUnits' } }],
      }],
    }],
  },

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

  // Diana — "When a showdown begins here, you may pay [1]. If you do, Predict, then reveal
  // the top card of your Main Deck. If it's a spell, draw it." The cond is the cost check,
  // so the question is only asked when the Energy can actually be found.
  'unl-079': {
    triggers: [{
      on: 'showdownBegins', here: true,
      effects: [{
        op: 'cond', test: { canPayEnergy: 1 },
        effects: [{
          op: 'may', prompt: 'Pay 1 Energy to Predict and reveal the top card?',
          effects: [
            { op: 'payCost', energy: 1 },
            { op: 'predict', n: 1 },
            { op: 'revealTopSpell' },
          ],
        }],
      }],
    }],
  },

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

  // Repulse — [Reaction]; the whole card is the condition, and the chain's top now carries
  // what it chose. Authored with this pack's own op rather than the core's
  // counterIf/`onlyMineOne`, which additionally demands the spell chose nothing else at
  // all — this card only forbids a SECOND FRIENDLY unit.
  'unl-106': {
    keywords: ['Reaction'],
    effects: [{ op: 'counterIfChoseOnlyMine' }],
  },

  // Master Yi — [Hunt 2] expanded (see the header: nothing in the core reads the Hunt
  // keyword, so declaring it would leave it inert); [Level 6] as two conditional statics
  // that read the controller's XP.
  'unl-113': {
    triggers: [
      { on: 'conquer', mine: true, here: true, effects: [{ op: 'xp', n: 2 }] },
      { on: 'hold', mine: true, here: true, effects: [{ op: 'xp', n: 2 }] },
    ],
    // The `kind` form of the condition, not the shorthand: both reach the same predicate,
    // but only this one is a shape js/text.js can name, and a condition the auditor prints
    // as "[object Object]" is a clause nobody can check.
    statics: [
      { grant: 'Deflect', scope: 'self', when: { kind: 'xpAtLeast', n: 6 } },
      { grant: 'Ganking', scope: 'self', when: { kind: 'xpAtLeast', n: 6 } },
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

  // Elder Dragon — any damage kills enemy units, and a ping at every location on the way
  // in. `anyDamageKills` is read by RB.isLethalDamage, the one home for lethality; the
  // scope is every unit that is not mine, which is what `enemyOfSource` asks.
  'unl-118': {
    statics: [{ anyDamageKills: true, scope: 'all', when: 'enemyOfSource' }],
    triggers: [{ on: 'played', effects: [{ op: 'damageEachLocation', n: 1 }] }],
  },

  // Rengar — [Ambush] carries "where you have units" on its own now, and the second clause
  // is the other named permission. Narrow both ways, never the blanket.
  'unl-120': {
    keywords: ['Ambush'],
    playAlso: ['whereEnemyUnits'],
  },

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
  // if it is already stunned. Repeat is now what it is printed as: an optional additional
  // cost, chosen and paid AS THE SPELL IS PLAYED, whose effects run once more on
  // resolution. The earlier resolution-time deviation is gone.
  'unl-134': {
    keywords: ['Action'],
    additionalCosts: [{
      id: 'repeat', energy: 2,
      effects: [{ op: 'stunOrReturn', target: { pick: 'enemyUnits', role: 'attacker' } }],
    }],
    effects: [{ op: 'stunOrReturn', target: { pick: 'enemyUnits', role: 'attacker' } }],
  },

  // Scryer's Bloom — enters exhausted; then "Kill this, [1], [T]: Predict 2, then draw 1.
  // Gain 1 XP." All three halves of the cost are costs: killSelf is paid before the
  // ability resolves, exactly as printed.
  'unl-136': {
    triggers: [{ on: 'played', effects: [{ op: 'exhaust', target: 'self' }] }],
    activated: [{
      energy: 1, exhaustSelf: true, killSelf: true,
      effects: [
        { op: 'predict', n: 2 },
        { op: 'draw', n: 1 },
        { op: 'xp', n: 1 },
      ],
    }],
  },

  // Evelynn — [Hidden] [Backline]; the play effect fires only on a play FROM FACE DOWN, on
  // your own turn, and pulls an enemy unit from elsewhere to her battlefield.
  'unl-141': {
    keywords: ['Hidden', 'Backline'],
    triggers: [{
      on: 'played',
      effects: [{
        op: 'cond', test: { fromHidden: true, myTurn: true },
        effects: [{
          op: 'atThisBattlefield',
          effects: [{
            op: 'may', prompt: 'Move an enemy unit at a different location to my battlefield?',
            effects: [{ op: 'moveUnit', to: 'here',
              target: { pick: 'enemyUnits', notHere: true } }],
          }],
        }],
      }],
    }],
  },

  // Heedless Resurrection — [Reaction]; the sacrifice is a mandatory additional cost, so
  // the spell is genuinely unplayable with nothing to kill, and the payoff is bounded by
  // what died. `killFriendlyRecord` is the core's killFriendly plus the price it paid.
  'unl-142': {
    keywords: ['Reaction'],
    additionalCosts: [{ id: 'sac', optional: false, pays: 'killFriendlyRecord' }],
    effects: [{ op: 'resurrectWithin' }],
  },

  // Baron Nashor — brings his own battlefield, cannot be chosen by the enemy, and lifts
  // every OTHER friendly unit. A static never reaches its own source unless it says so,
  // which is what makes "other friendly units" exact.
  'unl-147': {
    triggers: [{ on: 'played', effects: [{ op: 'addBattlefieldAndEnter', cardId: 'tok-baron-pit' }] }],
    statics: [
      { untargetableByEnemies: true, scope: 'self', includeSelf: true },
      { might: 2, scope: 'mine' },
    ],
  },

  // Vex — [Deflect]; "When an opponent plays a unit while I'm at a battlefield, Stun it.
  // They can't move it this turn." Two separate effects, and the card prints both because
  // Stun is not an exhaustion: it zeroes combat damage and nothing else, so stopping the
  // move takes cantMove.
  'unl-150': {
    keywords: ['Deflect'],
    triggers: [{
      on: 'unitPlayed',
      effects: [{
        op: 'cond', test: { eventIsOpponents: true, sourceAtBattlefield: true },
        effects: [
          { op: 'stun', target: 'eventUnit' },
          { op: 'cantMove', target: 'eventUnit' },
        ],
      }],
    }],
  },

  // Black Rose Dignitary — [Assault] (X omitted is 1); Deathknell channels a rune exhausted.
  'unl-152': {
    keywords: [{ name: 'Assault', value: 1 }],
    triggers: [{ on: 'deathknell', effects: [{ op: 'channel', n: 1, exhausted: true }] }],
  },

  // Shepherd's Heirloom — "When you play this, gain 1 XP."; "[Equip] — Spend 1 XP".
  // The `when` gate on an activated ability is checked in legalActions, so with no XP the
  // Equip is not offered at all — which is what a cost means. The earlier resolution-time
  // deviation is gone.
  'unl-158': {
    triggers: [{ on: 'played', effects: [{ op: 'xp', n: 1 }] }],
    activated: [{
      when: { kind: 'haveXP', n: 1 },
      effects: [{ op: 'spendXP', n: 1 }, { op: 'equipSelf' }],
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

  // Ashe — banish a card out of an opponent's revealed hand, and promise it back when THEY
  // hold. `delayed` is the promise, and it fires from s.delayed rather than from the board,
  // which is what "even if I'm no longer on the board" asks for. once:false because a
  // delayed promise is consumed by the first matching event of EITHER player's hold; the
  // return op is idempotent and the condition picks out the opponent's.
  'unl-169': {
    triggers: [{
      on: 'played',
      effects: [
        { op: 'banishFromHand' },
        { op: 'delayed', on: 'hold', once: false, effects: [{
          op: 'cond', test: { eventIsOpponents: true },
          effects: [{ op: 'returnBanished' }],
        }] },
      ],
    }],
  },

  // LeBlanc — [Assault]; "Deathknell: Draw 1. If it's YOUR Beginning Phase, draw 2
  // instead." Both halves of the condition: the Beginning Phase happens on either
  // player's turn, and she dies in the opponent's start-of-turn sweep as often as in
  // combat, where the card says she draws one.
  'unl-172': {
    keywords: [{ name: 'Assault', value: 1 }],
    triggers: [{
      on: 'deathknell',
      effects: [{
        op: 'cond', test: { beginningPhase: true, myTurn: true },
        effects: [{ op: 'draw', n: 2 }],
        else: [{ op: 'draw', n: 1 }],
      }],
    }],
  },

  // Sacrifice — [Reaction]; killing a friendly Mighty unit is a mandatory additional cost,
  // so legalActions will not offer the spell at all with nothing Mighty to give up.
  'unl-173': {
    keywords: ['Reaction'],
    additionalCosts: [{ id: 'sac', optional: false, pays: 'killFriendly', mighty: true }],
    effects: [{ op: 'draw', n: 2 }, { op: 'channel', n: 1, exhausted: true }],
  },

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
      op: 'chooseBattlefield',
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

  // Abandoned Hall — "When a player plays a spell, they may give a unit they control here
  // +1 [S] this turn." A battlefield's trigger runs as the event's player, so "they" is
  // whoever cast, on either turn.
  'unl-205': {
    triggers: [{
      on: 'spellPlayed',
      effects: [{
        op: 'atThisBattlefield',
        effects: [{
          op: 'cond', test: { nonEmpty: 'hereMine' },
          effects: [{
            op: 'may', prompt: 'Give a unit you control here +1 Might this turn?',
            effects: [{ op: 'buff', n: 1, target: { pick: 'hereMine' } }],
          }],
        }],
      }],
    }],
  },

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

  // Scorn of the Moon — "[Reaction][>] [T]: [Add] [1]. Spend this Energy only during
  // showdowns." Its own pool bucket, so the restriction is real rather than ignored.
  'unl-234': {
    activated: [{ exhaustSelf: true, tags: ['Reaction'], effects: [{ op: 'addShowdownEnergy', n: 1 }] }],
  },

  // ==========================================================================
  // WAVE TWO — the 39 cards that arrived with the second batch of decks. Same
  // rules as above: keywords the core honours are declared, a keyword it cannot
  // honour but the grammar can say exactly is expanded, and optionality is never
  // approximated.
  // ==========================================================================

  // Mischievous Marai — [Hidden]; the play effect only fires on a play TO A BATTLEFIELD,
  // which is where a facedown card is always played from.
  'unl-003': {
    keywords: ['Hidden'],
    triggers: [{ on: 'played', effects: [{
      op: 'cond', test: { sourceAtBattlefield: true },
      effects: [{ op: 'atThisBattlefield',
        effects: [{ op: 'damage', n: 2, target: { pick: 'hereEnemy' } }] }],
    }] }],
  },

  // Smite — [Action]; damage and a replacement placed on the unit it hit. RB.kill asks a
  // dying unit's OWN replacements first, so the promise sits on that unit rather than on
  // Smite, which is already in the trash by the time the unit dies. One op, because both
  // halves must land on the same unit — see js/ops-unl.js.
  'unl-007': {
    keywords: ['Action'],
    effects: [{ op: 'damageReplacingDeath', n: 3, kind: 'banishInstead',
      target: { pick: 'allUnits', at: 'battlefield' } }],
  },

  // Pyke (Fury) — [Hidden] [Ganking]; an optional Fury Power buys the ready-and-grow.
  'unl-028': {
    keywords: ['Hidden', 'Ganking'],
    additionalCosts: [{ id: 'boon', power: 1, domains: ['Fury'] }],
    triggers: [{ on: 'played', effects: [{
      op: 'cond', test: { paid: 'boon' },
      effects: [{ op: 'ready', target: 'self' }, { op: 'buff', n: 2, target: 'self' }],
    }] }],
  },

  // Tricksy Tentacles — in a duel every enemy unit shares a controller, so what is left to
  // decide is the single destination and which units fit under the cap.
  'unl-054': { effects: [{ op: 'moveEnemyGroup', maxMight: 8 }] },

  // Lillia — grows on each token unit you play, and hands them all Tank. `isToken` reads
  // the object, not the card's tags, so a token copy of a real unit counts too.
  'unl-058': {
    triggers: [{ on: 'unitPlayed', mine: true, effects: [{
      op: 'cond', test: { eventUnitIsToken: true },
      effects: [{ op: 'buff', n: 1, target: 'self' }],
    }] }],
    statics: [{ grant: 'Tank', scope: 'mine', when: 'isToken' }],
  },

  // Downstage Dramatics — [Reaction]; [Repeat] [2] is an optional additional cost whose
  // effects run once more on resolution.
  'unl-061': {
    keywords: ['Reaction'],
    additionalCosts: [{ id: 'repeat', energy: 2, effects: [{ op: 'draw', n: 1 }] }],
    effects: [{ op: 'draw', n: 1 }],
  },

  // Eclipse — [Reaction]; "a unit" is any unit, and an enemy is simply the one taken.
  'unl-063': {
    keywords: ['Reaction'],
    effects: [
      { op: 'debuff', n: 4, target: { pick: 'allUnits', prefer: 'enemy' } },
      { op: 'predict', n: 1 },
    ],
  },

  // Sprite Burst — two of them, at the printed size, with Temporary.
  'unl-069': {
    effects: [{ op: 'keywordToken', cardId: 'tok-sprite', n: 2, might: 3,
      ready: true, temporary: true }],
  },

  // Chakram Dancer — [Ambush]; "your OTHER units here", so the grant skips its own source.
  'unl-071': {
    keywords: ['Ambush'],
    triggers: [{ on: 'played', effects: [{ op: 'atThisBattlefield', effects: [
      { op: 'grantTo', keyword: 'Shield', target: { pick: 'hereMine', notSelf: true, n: 'all' } },
    ] }] }],
  },

  // Crescent Strike — [Action]; the battlefield and the unit are two choices, and the
  // splash has to agree with the second one, which is why it is a single op.
  'unl-072': {
    keywords: ['Action'],
    effects: [{ op: 'chooseBattlefield', where: 'enemy', effects: [
      { op: 'damageHereSplit', n: 4, others: 1 },
    ] }],
  },

  // Deadly Flourish — the Gold is promised on THAT unit dying, this turn, so the promise
  // has to remember which unit it was.
  'unl-073': {
    effects: [{ op: 'damageWatch', n: 3, target: { pick: 'enemyUnits' },
      then: [{ op: 'keywordToken', cardId: 'tok-gold' }] }],
  },

  // Petal Pixie — a computed modifier, recounted every time her Might is read.
  'unl-076': {
    statics: [{ might: { from: 'temporaryUnitsHere' }, scope: 'self', includeSelf: true }],
  },

  // Keeper of Masks — [Hidden]; [Temporary] is expanded because the engine's sweep reads
  // o.temporary, which only an op sets. The copies take her printed characteristics, not
  // her Temporary status, which is what "become copies of me" means.
  'unl-081': {
    keywords: ['Hidden'],
    triggers: [{ on: 'played', effects: [
      { op: 'giveTemporary', target: 'self' },
      { op: 'atThisBattlefield', orBase: true, effects: [
        { op: 'copyToken', n: 2, target: 'self', to: 'here' },
      ] },
    ] }],
  },

  // Smoke and Mirrors — [Hidden] [Action]; the draw is a separate sentence and happens
  // whether or not a legal pair existed.
  'unl-083': {
    keywords: ['Hidden', 'Action'],
    effects: [{ op: 'swapMyUnits' }, { op: 'draw', n: 1 }],
  },

  // Sumpworks Map — [Reaction]; [Temporary] expanded as above. "When an opponent scores"
  // is both scoring paths, filtered to the opponent.
  'unl-085': {
    keywords: ['Reaction'],
    triggers: [
      { on: 'played', effects: [{ op: 'giveTemporary', target: 'self' }] },
      { on: 'conquer', effects: [{ op: 'cond', test: { eventIsOpponents: true },
        effects: [{ op: 'draw', n: 1 }] }] },
      { on: 'hold', effects: [{ op: 'cond', test: { eventIsOpponents: true },
        effects: [{ op: 'draw', n: 1 }] }] },
    ],
  },

  // Grim Resolve — [Action]; the XP is promised on that unit winning a combat this turn.
  'unl-095': {
    keywords: ['Action'],
    effects: [{ op: 'buffWatchCombat', n: 3, target: { pick: 'myUnits' },
      then: [{ op: 'xp', n: 2 }] }],
  },

  // Kinkou Initiate — "your OTHER units", so the condition excludes her own Might.
  'unl-097': {
    triggers: [{ on: 'played', effects: [{
      op: 'cond', test: { otherUnitsMightAtLeast: 5 },
      effects: [{ op: 'draw', n: 1 }],
    }] }],
  },

  // Determined Sentry — "I can't move to base." A restriction on one destination, not on
  // moving, so it is o.noMoveToBase and not o.cantMove. The flag survives the Ending
  // Cleanup, so the play trigger writes it once and it holds for as long as she is on the
  // board; every way a card reaches the board resolves through RB.resolveCard.
  'unl-111': {
    triggers: [{ on: 'played', effects: [{ op: 'cantMoveToBase' }] }],
  },

  // Irresistible Faefolk — a pull on arrival, and a real "you may".
  'unl-112': {
    triggers: [{ on: 'moved', effects: [{
      op: 'cond', test: { eventIsSelf: true, toBattlefield: true },
      effects: [{ op: 'may', prompt: 'Move an enemy unit to that battlefield?',
        effects: [{ op: 'moveUnit', to: 'here',
          target: { pick: 'enemyUnits', notHere: true } }] }],
    }] }],
  },

  // Nidalee — [Ambush]; `here` is the combat she was in, and a unit that died in it is no
  // longer asked, which is exactly "I win if I remain after combat".
  'unl-114': {
    keywords: ['Ambush'],
    triggers: [{ on: 'combatEnd', here: true, effects: [{
      op: 'cond', test: { eventWinnerIsMe: true },
      effects: [{ op: 'draw', n: 1 }],
    }] }],
  },

  // Bewitching Spirit — "choose a player" is a real choice, including choosing yourself.
  'unl-121': {
    triggers: [{ on: 'played', effects: [{ op: 'choose', options: [
      { label: 'Your opponent discards 1', effects: [{ op: 'discard', n: 1, opponent: true }] },
      { label: 'You discard 1', effects: [{ op: 'discard', n: 1 }] },
    ] }] }],
  },

  // Mister Root — [Accelerate] at its printed price, and XP on arrival.
  'unl-127': {
    additionalCosts: [{ id: 'accelerate', energy: 1, power: 1, domains: ['Chaos'],
      entersReady: true }],
    triggers: [{ on: 'moved', effects: [{
      op: 'cond', test: { eventIsSelf: true, toBattlefield: true },
      effects: [{ op: 'xp', n: 2 }],
    }] }],
  },

  // Angler Beast — "all units", friendly ones included, so nothing is chosen and nothing
  // tolls Deflect.
  'unl-132': {
    triggers: [{ on: 'played', effects: [
      { op: 'returnToHand', target: { pick: 'allUnits', maxMight: 2, n: 'all' } },
    ] }],
  },

  // The List — the tag is named as it is played, from every tag printed in the game (the
  // core's `nameTag` computes that list), and it governs the ability for the rest of the
  // game, so it is kept on this gear's own object rather than in the resolution that
  // named it. [T] with no Energy is `exhaustSelf` alone.
  'unl-138': {
    triggers: [{ on: 'played', effects: [
      { op: 'nameTag', effects: [{ op: 'rememberNamedTag' }] },
    ] }],
    activated: [{ exhaustSelf: true, effects: [{ op: 'debuffNamedTag', n: 2 }] }],
  },

  // Kha'Zix — [Ambush]; `mine` keeps the attack trigger to the attacking side and the
  // defend trigger to the defending one, and `here` to the battlefield in question.
  'unl-143': {
    keywords: ['Ambush'],
    triggers: [
      { on: 'attack', mine: true, here: true, effects: [{
        op: 'cond', test: { enemyAloneHere: true },
        effects: [{ op: 'buff', n: 2, target: 'self' }, { op: 'xp', n: 2 }] }] },
      { on: 'defend', mine: true, here: true, effects: [{
        op: 'cond', test: { enemyAloneHere: true },
        effects: [{ op: 'buff', n: 2, target: 'self' }, { op: 'xp', n: 2 }] }] },
    ],
  },

  // Pyke (Chaos) — [Hidden] [Backline]; once each turn, keyed to Pyke rather than to
  // whoever's unit died.
  'unl-145': {
    keywords: ['Hidden', 'Backline'],
    triggers: [{ on: 'died', effects: [{
      op: 'cond', test: { eventIsOpponents: true, sourceAtBattlefield: true },
      effects: [{ op: 'firstEachTurn', key: 'pyke', per: 'me',
        effects: [{ op: 'keywordToken', cardId: 'tok-gold' }] }],
    }] }],
  },

  // Carrion Dredger — a Bird with the keyword it is printed with.
  'unl-153': {
    triggers: [{ on: 'deathknell', effects: [
      { op: 'keywordToken', cardId: 'tok-bird', might: 1, keywords: ['Deflect'] },
    ] }],
  },

  // Safety Inspector — the XP is an optional additional cost, so paying it is decided as
  // he is played and the play effect reads what was paid.
  'unl-164': {
    additionalCosts: [{ id: 'xp3', pays: 'spendXP', n: 3 }],
    triggers: [{ on: 'played', effects: [{ op: 'eachPlayerKills', exceptIfPaid: 'xp3' }] }],
  },

  // Atakhan — an optional sacrifice that pays for itself. `discountsByKilled` is read by
  // this pack's cost modifier, which now sees the chosen additional costs: it names the
  // same unit the core's killFriendly will kill and takes that unit's own Energy and Power
  // off the price. Optional, so the plain 10-Energy play is still offered.
  'unl-170': {
    keywords: ['Ganking'],
    additionalCosts: [{ id: 'devour', pays: 'killFriendly', discountsByKilled: true }],
    triggers: [{ on: 'attack', mine: true, here: true,
      effects: [{ op: 'defenderKillsHere' }] }],
  },

  // The Ruination — nothing is chosen, so nothing tolls Deflect.
  'unl-180': { effects: [{ op: 'kill', target: 'allUnits' }] },

  // Pridestalker — "a unit" is any unit; one of yours is simply the one taken.
  'unl-183': {
    triggers: [{ on: 'unitPlayed', mine: true, effects: [
      { op: 'buffTo', n: 1, target: { pick: 'allUnits', prefer: 'mine' } },
    ] }],
  },

  // Thrill of the Hunt — [Reaction]; it is PLAYED again, so its play effects fire again.
  'unl-184': {
    keywords: ['Reaction'],
    effects: [{ op: 'blinkUnit', target: { pick: 'myUnits' } }],
  },

  // Lilting Lullaby — [Reaction]; the counter and the gag are one op because the gag is
  // aimed at the countered spell's OWN controller, which is only read off the chain item
  // before it is popped. `restrict` is checked in legalActions, so the gagged player is
  // genuinely not offered a spell rather than merely discouraged from one.
  'unl-190': {
    keywords: ['Reaction'],
    effects: [{ op: 'counterSpellRestricting', type: 'Spell' }],
  },

  // Void Assault — two moves, each to a location of your choosing; the second is asked
  // after the first is answered.
  'unl-202': {
    effects: [{ op: 'moveChoosingDestination', target: { pick: 'myUnits' }, then: [
      { op: 'moveChoosingDestination', target: { pick: 'enemyUnits' } },
    ] }],
  },

  // Amateur Recital — "a unit at a battlefield" is any of them, anywhere, not just here.
  'unl-207': {
    triggers: [{ on: 'hold', here: true, effects: [{ op: 'atThisBattlefield', effects: [{
      op: 'cond', test: { nonEmpty: { pick: 'allUnits', at: 'battlefield' } },
      effects: [{ op: 'may', prompt: 'Move a unit at a battlefield to its base?',
        effects: [{ op: 'moveUnit', to: 'base',
          target: { pick: 'allUnits', at: 'battlefield', prefer: 'enemy' } }] }],
    }] }] }],
  },

  // Black Flame Altar — only the units here that carry the status.
  'unl-208': { statics: [{ grant: 'Shield', scope: 'here', when: 'isTemporary' }] },

  // Frozen Fortress — each player's Beginning Phase, and every unit here, both sides.
  'unl-212': {
    triggers: [{ on: 'beginningPhase', effects: [{ op: 'atThisBattlefield', effects: [
      { op: 'damage', n: 1, target: 'hereMine' },
      { op: 'damage', n: 1, target: 'hereEnemy' },
    ] }] }],
  },

  // Bashful Bloom — a legend, and so in a public zone all game. One printed ability, one
  // entry: RB.abilityCost is now the single place an ability's cost is computed, so the
  // discount is a modifier on that cost (js/ops-unl.js) rather than several gated copies
  // of the same ability. `cheaperPerFriendlyTemporary` is what opts this ability in; no
  // other ability in any pack carries it, so none of them changes price.
  'unl-230': {
    activated: [{
      energy: 4, exhaustSelf: true, cheaperPerFriendlyTemporary: 1,
      effects: [{ op: 'keywordToken', cardId: 'tok-sprite', might: 3, ready: true, temporary: true }],
    }],
  },

  // Voidreaver — XP on winning a combat, and two abilities gated on spending it. The gate
  // is checked in legalActions, so neither is offered without the XP to pay.
  'unl-236': {
    triggers: [{ on: 'combatEnd', effects: [{
      op: 'cond', test: { eventWinnerIsMe: true }, effects: [{ op: 'xp', n: 1 }] }] }],
    activated: [
      { when: { kind: 'haveXP', n: 1 }, exhaustSelf: true, effects: [
        { op: 'spendXP', n: 1 },
        { op: 'buffTo', n: 1, permanent: true, target: { pick: 'allUnits', prefer: 'mine' } },
      ] },
      { when: { kind: 'haveXP', n: 2 }, exhaustSelf: true, effects: [
        { op: 'spendXP', n: 2 },
        { op: 'moveUnit', to: 'base',
          target: { pick: 'myUnits', at: 'battlefield', exhausted: true } },
      ] },
    ],
  },

});
