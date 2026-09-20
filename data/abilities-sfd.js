// Spiritforged (sfd) ability data. Keyed by card id; the shape is docs/grammar.md. The ops
// and hooks this pack leans on that the core does not ship live in js/ops-sfd.js, which is
// loaded first. A card whose printed text this grammar cannot say exactly carries
// `unimplemented`, naming the clause that is missing: it then plays as its printed body
// and is MARKED as partial on its own face (js/cards.js RB.isPartial). Half-authoring a
// card instead — dropping the clause and shipping the rest unmarked — is the defect this
// marker exists to prevent.
//
// Two conventions used throughout:
//   * `sfdTriggers` are the set-local events js/ops-sfd.js broadcasts (death, anyDeath,
//     move, runeRecycle) for printed triggers the core has no hook for.
//   * "choose a unit" resolves through RB.autoPick (D-2: the player does not pick yet), so a
//     beneficial clause is pointed at `myUnits` and a harmful one at `enemyUnits`. That is
//     the auto-resolution rule, not a narrowing of what the card may legally target.
(function (RB) {
  'use strict';

  RB.registerAbilities({

    // ---------------------------------------------------------------- Fury
    // "Give a friendly unit at a battlefield +2 [S] this turn for each enemy unit there."
    'sfd-001': {
      keywords: ['Reaction'],
      effects: [{ op: 'sfd.buffPerEnemyAt', n: 2 }],
    },

    // "[Deathknell] — Play two 3 [S] Mech unit tokens to your base."
    'sfd-021': {
      keywords: ['Deathknell'],
      sfdTriggers: [{ on: 'death', effects: [{ op: 'sfd.playToken', cardId: 'tok-mech', might: 3, n: 2, to: 'base' }] }],
    },

    // "[Quick-Draw] … [Equip] [C]". Quick-Draw's reminder grants Reaction and attaches on
    // play; the printed Might Bonus (+2) is already read off the card by RB.mightOf.
    'sfd-022': {
      keywords: ['Reaction', 'Quick-Draw'],
      triggers: [{ on: 'played', effects: [{ op: 'sfd.attach' }] }],
      activated: [{ power: 1, domains: ['Fury'], effects: [{ op: 'sfd.attach' }] }],
    },

    'sfd-025': {
      unimplemented: '"I can be played to a battlefield you\'re attacking" is a play-location permission, and the only lever the grammar has is playTo:\'battlefield\', which offers EVERY battlefield and takes the base away — a blanket where the card is narrow.',
    },

    // ---------------------------------------------------------------- Calm
    // "[Repeat] [2] … Play a 2 [M] Sand Soldier unit token."
    // DEVIATION: the engine has no optional-additional-cost step when a card is played, so
    // Repeat is offered as the same choice for the same cost at resolution instead. The
    // option, the price and the result are the printed ones; only the moment moves.
    'sfd-031': {
      effects: [
        { op: 'sfd.playToken', cardId: 'tok-sand-soldier', might: 2 },
        { op: 'sfd.mayPay', energy: 2, effects: [{ op: 'sfd.playToken', cardId: 'tok-sand-soldier', might: 2 }] },
      ],
    },

    // "When you play me, you may kill a gear."
    'sfd-032': {
      triggers: [{ on: 'played', effects: [{ op: 'sfd.may', effects: [{ op: 'sfd.killGear', side: 'enemy' }] }] }],
    },

    // "[Equip] [C]"
    'sfd-033': {
      activated: [{ power: 1, domains: ['Calm'], effects: [{ op: 'sfd.attach' }] }],
    },

    // "[Deathknell] — If I died alone, draw 1."
    'sfd-036': {
      keywords: ['Deathknell'],
      sfdTriggers: [{ on: 'death', effects: [{ op: 'sfd.when', cond: 'diedAlone', effects: [{ op: 'draw', n: 1 }] }] }],
    },

    // "[Equip] [C]"
    'sfd-042': {
      activated: [{ power: 1, domains: ['Calm'], effects: [{ op: 'sfd.attach' }] }],
    },

    'sfd-045': {
      unimplemented: 'Counters an enemy spell or ability conditioned on what it chose: the chain\'s internals are not reachable from an op, and nothing records the objects a pending item picked.',
    },

    // "When I move, draw 1."
    'sfd-048': {
      sfdTriggers: [{ on: 'move', effects: [{ op: 'draw', n: 1 }] }],
    },

    // "[Equip] [C]"
    'sfd-051': {
      activated: [{ power: 1, domains: ['Calm'], effects: [{ op: 'sfd.attach' }] }],
    },

    // ---------------------------------------------------------------- Mind
    // "When I conquer, play a Gold gear token exhausted."
    'sfd-069': {
      triggers: [{
        on: 'conquer', mine: true, here: true,
        effects: [{ op: 'sfd.playToken', cardId: 'tok-gold', exhausted: true }],
      }],
    },

    'sfd-070': {
      unimplemented: '[Hidden]: there is no facedown space at a battlefield and no way to play a card from one, so the card\'s first line has no shape in the grammar.',
    },

    // ---------------------------------------------------------------- Body
    // "Give a unit +5 [S] this turn." Buffs already expire at end of turn.
    'sfd-097': {
      keywords: ['Action'],
      effects: [{ op: 'sfd.giveMight', n: 5, target: { pick: 'myUnits' } }],
    },

    // "I can't be chosen by enemy spells and abilities."
    'sfd-105': {
      statics: [{ unchoosableByEnemies: true }],
    },

    'sfd-109': {
      unimplemented: '[Weaponmaster], an optional additional cost paid while playing, and taking control of an enemy gear until I leave the board — three concepts the engine does not have.',
    },

    // ---------------------------------------------------------------- Chaos
    'sfd-128': {
      unimplemented: 'Triggers when I become a defender; showdowns open inside js/engine.js\'s own closure and run no triggers, so the event never reaches ability data.',
    },

    // "When I move, play a Gold gear token exhausted."
    'sfd-130': {
      sfdTriggers: [{ on: 'move', effects: [{ op: 'sfd.playToken', cardId: 'tok-gold', exhausted: true }] }],
    },

    // "[Equip] [C]"
    'sfd-133': {
      activated: [{ power: 1, domains: ['Chaos'], effects: [{ op: 'sfd.attach' }] }],
    },

    // "Return a gear to its owner's hand."
    'sfd-135': {
      keywords: ['Action'],
      effects: [{ op: 'sfd.bounceGear', side: 'enemy' }],
    },

    'sfd-136': {
      unimplemented: 'Counters a spell unless its controller pays [2], plus [Repeat]: the chain\'s internals are not reachable from an op, and there is no window in which to offer the ransom.',
    },

    'sfd-140': {
      unimplemented: 'Plays a spell out of your trash ignoring its Energy cost; playing is a core action from hand only and no op can start one from another zone.',
    },

    'sfd-145': {
      unimplemented: '[Hidden] (no facedown space), and swapping two units\' Might — RB.mightOf derives Might on demand, with no layer that can hold a swapped value for a turn.',
    },

    'sfd-146': {
      unimplemented: 'A continuous cost-modification layer over both players\' spells while I am in combat; RB.costOf reads the printed cost and has no modifier layer.',
    },

    'sfd-150': {
      unimplemented: 'The Equip cost includes recycling 2 cards from your trash; an activated ability\'s cost in this grammar is Energy, Power and exhausting the source, so it can be neither checked nor paid.',
    },

    // ---------------------------------------------------------------- Order
    // "[Equip] [C]"
    'sfd-153': {
      activated: [{ power: 1, domains: ['Order'], effects: [{ op: 'sfd.attach' }] }],
    },

    'sfd-154': {
      unimplemented: '[Hidden]: there is no facedown space at a battlefield and no way to play a card from one, so the card\'s first line has no shape in the grammar.',
    },

    // "[Equip] [C]"
    'sfd-161': {
      activated: [{ power: 1, domains: ['Order'], effects: [{ op: 'sfd.attach' }] }],
    },

    // "Kill a friendly unit. If you do, give +[M] equal to its Might to another friendly unit
    //  this turn. Draw 1."
    'sfd-163': {
      keywords: ['Reaction'],
      effects: [{ op: 'sfd.killAndTransferMight' }, { op: 'draw', n: 1 }],
    },

    'sfd-165': {
      unimplemented: 'Deathknell that plays a unit out of your trash ignoring its cost; playing is a core action from hand only, which is also why the cost filter cannot be honoured.',
    },

    // "[Deathknell] — If I was [Mighty], draw 2." Mighty is Might 5 or more.
    'sfd-167': {
      keywords: ['Deathknell'],
      sfdTriggers: [{ on: 'death', effects: [{ op: 'sfd.when', cond: 'wasMighty', effects: [{ op: 'draw', n: 2 }] }] }],
    },

    // ------------------------------------------------------- Legends and pairs
    // "When you win a combat, draw 1." combatEnd carries the winner; `mine` cannot be used
    // here because that event has no player field for the core filter to compare.
    'sfd-185': {
      triggers: [{ on: 'combatEnd', effects: [{ op: 'sfd.when', cond: 'wonCombat', effects: [{ op: 'draw', n: 1 }] }] }],
    },

    // "[Quick-Draw] … [Equip] [C] … [Temporary]". Temporary here is the conditional printed
    // form: killed at the start of its controller's Beginning Phase while unattached. An
    // attached gear is not a trigger source at all, so the condition is doubly honoured.
    'sfd-186': {
      keywords: ['Reaction', 'Quick-Draw', 'Temporary'],
      triggers: [
        { on: 'played', effects: [{ op: 'sfd.attach' }] },
        { on: 'beginningPhase', mine: true, effects: [{ op: 'sfd.when', cond: 'unattached', effects: [{ op: 'kill', target: 'self' }] }] },
      ],
      activated: [{ power: 1, domains: ['Fury', 'Chaos'], effects: [{ op: 'sfd.attach' }] }],
    },

    'sfd-195': {
      unimplemented: 'First clause is a Targeting Effect ("when you choose a friendly unit"); nothing announces that a spell or ability chose an object, so the trigger can never fire.',
    },

    // "Give a unit +2 [S] this turn and another unit -2 [S] this turn."
    'sfd-196': {
      keywords: ['Reaction'],
      effects: [
        { op: 'sfd.giveMight', n: 2, target: { pick: 'myUnits' } },
        { op: 'sfd.weaken', n: 2, target: { pick: 'enemyUnits' } },
      ],
    },

    'sfd-197': {
      unimplemented: 'Grants [Weaponmaster] to your Sand Soldiers — a continuous ability-granting layer, which the engine has for battlefield cards only — and the activated ability is gated on having played an Equipment this turn, which nothing tracks.',
    },

    // "Play a 2 [M] Sand Soldier unit token for each Equipment you control. Then do this:
    //  Ready up to two of them."
    'sfd-198': {
      effects: [
        { op: 'sfd.playTokenPer', cardId: 'tok-sand-soldier', might: 2, per: 'Equipment' },
        { op: 'sfd.readyMade', n: 2 },
      ],
    },

    // "When you recycle a rune, you may exhaust me to play a Gold gear token exhausted."
    // "When one or more enemy units die, ready me." (readying twice is a no-op, so firing per
    //  death is indistinguishable from firing once per simultaneous batch)
    'sfd-203': {
      sfdTriggers: [
        {
          on: 'runeRecycle', mine: true,
          effects: [{ op: 'sfd.mayPay', exhaustSelf: true, effects: [{ op: 'sfd.playToken', cardId: 'tok-gold', exhausted: true }] }],
        },
        { on: 'anyDeath', enemy: true, unit: true, effects: [{ op: 'ready', target: 'self' }] },
      ],
    },

    'sfd-205': {
      unimplemented: 'Triggers when one of your units BECOMES [Mighty]; Might is derived on demand and nothing records its previous value, so the crossing cannot be detected.',
    },

    'sfd-206': {
      unimplemented: 'Counters a spell and buffs by that spell\'s Energy cost — the chain\'s internals are not reachable from an op.',
    },

    // ------------------------------------------------------------ Battlefields
    // "When you conquer here, you may pay [1] and return a unit you control here to its
    //  owner's hand to play a 2 [M] Sand Soldier unit token here."
    // A battlefield's own trigger cannot use the core `here` filter (a battlefield has no
    // location), so the `here` condition on the effect is what scopes it.
    'sfd-207': {
      triggers: [{
        on: 'conquer',
        effects: [{
          op: 'sfd.when', cond: 'here',
          effects: [{
            op: 'sfd.mayPay', energy: 1, bounceHere: true,
            effects: [{ op: 'sfd.playToken', cardId: 'tok-sand-soldier', might: 2, to: 'here' }],
          }],
        }],
      }],
    },

    // "Players can't score here until their third turn."
    'sfd-209': {
      statics: [{ scoreLockUntilTurn: 3 }],
    },

    // "When you conquer here, you may pay [1] to ready your legend."
    'sfd-210': {
      triggers: [{
        on: 'conquer',
        effects: [{ op: 'sfd.when', cond: 'here', effects: [{ op: 'sfd.mayPay', energy: 1, effects: [{ op: 'sfd.readyLegend' }] }] }],
      }],
    },

    'sfd-215': {
      unimplemented: 'Triggers when you defend here; showdowns open inside js/engine.js\'s own closure and run no triggers, so the event never reaches ability data.',
    },

    // "When you conquer here, draw 1 for each other battlefield you or allies control."
    // (1v1 has no allies, so "you or allies" is you.)
    'sfd-217': {
      triggers: [{
        on: 'conquer',
        effects: [{ op: 'sfd.when', cond: 'here', effects: [{ op: 'sfd.drawPerOtherBattlefield', n: 1 }] }],
      }],
    },

    // "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1."
    'sfd-218': {
      triggers: [{
        on: 'conquer',
        effects: [{
          op: 'sfd.when', cond: 'here',
          effects: [{
            op: 'sfd.when', cond: 'mightyHere',
            effects: [{ op: 'sfd.mayPay', energy: 1, effects: [{ op: 'draw', n: 1 }] }],
          }],
        }],
      }],
    },

    // "When you conquer here, you may pay [1] to play a Gold gear token exhausted."
    'sfd-220': {
      triggers: [{
        on: 'conquer',
        effects: [{
          op: 'sfd.when', cond: 'here',
          effects: [{ op: 'sfd.mayPay', energy: 1, effects: [{ op: 'sfd.playToken', cardId: 'tok-gold', exhausted: true }] }],
        }],
      }],
    },

    'sfd-225': {
      unimplemented: '[Deflect] is a mandatory additional Power cost on enemy spells and abilities that choose me, and there is no cost layer for it; "when you choose or ready me" also needs a Targeting Effect and a became-ready event, neither of which the engine announces.',
    },

  });
})(window.RB = window.RB || {});
