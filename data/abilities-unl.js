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
// NOT IN THIS PACK: unl-150 (Vex) and unl-172 (LeBlanc). They arrived in data/cards.js
// after this packet was cut and are authored in data/abilities-core.js, which registers
// them first — RB.registerAbilities throws on a duplicate id, so a second copy here would
// crash the load rather than override it.
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

  'unl-053': { unimplemented: 'Its Deathknell lets you read an OPPONENT\'S FACEDOWN CARDS for the turn. Hidden exists now, but there is no way to grant one player visibility of another\'s facedown cards.' },

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

  // Black Rose Dignitary — [Assault] (X omitted is 1); Deathknell channels a rune exhausted.
  'unl-152': {
    keywords: [{ name: 'Assault', value: 1 }],
    triggers: [{ on: 'deathknell', effects: [{ op: 'channel', n: 1, exhausted: true }] }],
  },

  // Shepherd's Heirloom — "When you play this, gain 1 XP."; "[Equip] — Spend 1 XP".
  // DEVIATION, still standing: `additionalCosts` gates a CARD being played, and this price
  // is on an activated ability, whose cost shape is energy/power/exhaustSelf/killSelf. So
  // the XP is enforced on resolution: with no XP the ability is still offered, but it does
  // nothing and costs nothing. It is never free to actually equip.
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

});
