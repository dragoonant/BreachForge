// Spiritforged (sfd) ability data. Keyed by card id; the shape is docs/grammar.md. The ops
// and hooks this pack leans on that the core does not ship live in js/ops-sfd.js, which is
// loaded first. A card whose printed text this grammar cannot say exactly carries
// `unimplemented` and is rejected from any registered deck — deliberately, because a card
// that plays with a clause missing is the wrong card.
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
      effects: [{ op: 'buffPerEnemyAt', n: 2 }],
    },

    // "[Deathknell] — Play two 3 [S] Mech unit tokens to your base."
    'sfd-021': {
      keywords: ['Deathknell'],
      sfdTriggers: [{ on: 'death', effects: [{ op: 'playToken', cardId: 'sfd-t-mech', n: 2, to: 'base' }] }],
    },

    // "[Quick-Draw] … [Equip] [C]". Quick-Draw's reminder grants Reaction and attaches on
    // play; the printed Might Bonus (+2) is already read off the card by RB.mightOf.
    'sfd-022': {
      keywords: ['Reaction', 'Quick-Draw'],
      triggers: [{ on: 'played', effects: [{ op: 'attach' }] }],
      activated: [{ power: 1, domains: ['Fury'], effects: [{ op: 'attach' }] }],
    },

    'sfd-025': {
      unimplemented: "Rengar's \"I can be played to a battlefield you're attacking\" is a " +
        'play-destination permission, and destinations are decided by the core engine: the only ' +
        "lever the grammar has is playTo: 'battlefield', which offers every battlefield (too many) " +
        'and forbids the base (too few). The permission cannot be widened to an attacked ' +
        'battlefield nor narrowed to one, so Assault 2 and Reaction are held back with it.',
    },

    // ---------------------------------------------------------------- Calm
    // "[Repeat] [2] … Play a 2 [M] Sand Soldier unit token."
    // DEVIATION: the engine has no optional-additional-cost step when a card is played, so
    // Repeat is offered as the same choice for the same cost at resolution instead. The
    // option, the price and the result are the printed ones; only the moment moves.
    'sfd-031': {
      effects: [
        { op: 'playToken', cardId: 'sfd-t-sand' },
        { op: 'mayPay', energy: 2, effects: [{ op: 'playToken', cardId: 'sfd-t-sand' }] },
      ],
    },

    // "When you play me, you may kill a gear."
    'sfd-032': {
      triggers: [{ on: 'played', effects: [{ op: 'may', effects: [{ op: 'killGear', side: 'enemy' }] }] }],
    },

    // "[Equip] [C]"
    'sfd-033': {
      activated: [{ power: 1, domains: ['Calm'], effects: [{ op: 'attach' }] }],
    },

    // "[Deathknell] — If I died alone, draw 1."
    'sfd-036': {
      keywords: ['Deathknell'],
      sfdTriggers: [{ on: 'death', effects: [{ op: 'when', cond: 'diedAlone', effects: [{ op: 'draw', n: 1 }] }] }],
    },

    // "[Equip] [C]"
    'sfd-042': {
      activated: [{ power: 1, domains: ['Calm'], effects: [{ op: 'attach' }] }],
    },

    'sfd-045': {
      unimplemented: 'Counter an enemy spell or ability that chooses a friendly unit or gear. ' +
        'Countering is the chain\'s own internals — a chain item cannot be negated through the ' +
        'grammar — and nothing records which objects a pending item chose, so the condition ' +
        'cannot be tested either.',
    },

    // "When I move, draw 1."
    'sfd-048': {
      sfdTriggers: [{ on: 'move', effects: [{ op: 'draw', n: 1 }] }],
    },

    // "[Equip] [C]"
    'sfd-051': {
      activated: [{ power: 1, domains: ['Calm'], effects: [{ op: 'attach' }] }],
    },

    // ---------------------------------------------------------------- Mind
    // "When I conquer, play a Gold gear token exhausted."
    'sfd-069': {
      triggers: [{
        on: 'conquer', mine: true, here: true,
        effects: [{ op: 'playToken', cardId: 'sfd-t-gold', exhausted: true }],
      }],
    },

    'sfd-070': {
      unimplemented: 'Hidden. There is no facedown space at a battlefield and no way to play a ' +
        'card from one, so the whole first line would have to be dropped; the engine has no ' +
        'hidden-card concept to extend.',
    },

    // ---------------------------------------------------------------- Body
    // "Give a unit +5 [S] this turn." Buffs already expire at end of turn.
    'sfd-097': {
      keywords: ['Action'],
      effects: [{ op: 'giveMight', n: 5, target: { pick: 'myUnits' } }],
    },

    // "I can't be chosen by enemy spells and abilities."
    'sfd-105': {
      statics: [{ unchoosableByEnemies: true }],
    },

    'sfd-109': {
      unimplemented: 'Akshan needs three things the engine does not have: Weaponmaster (attach an ' +
        'Equipment by paying its Equip cost as a play effect), an optional additional cost paid ' +
        'while playing, and taking control of an enemy gear until this unit leaves the board — a ' +
        'duration-scoped control change with no home in the state.',
    },

    // ---------------------------------------------------------------- Chaos
    'sfd-128': {
      unimplemented: 'A Defend trigger. Showdowns are opened inside the engine\'s closure (the ' +
        'exported RB.openShowdown is not the one cleanup calls), so the moment a unit gains the ' +
        'Defender designation cannot be observed; killing me as a cost and recalling an attacker ' +
        'would both be reachable, the trigger is not.',
    },

    // "When I move, play a Gold gear token exhausted."
    'sfd-130': {
      sfdTriggers: [{ on: 'move', effects: [{ op: 'playToken', cardId: 'sfd-t-gold', exhausted: true }] }],
    },

    // "[Equip] [C]"
    'sfd-133': {
      activated: [{ power: 1, domains: ['Chaos'], effects: [{ op: 'attach' }] }],
    },

    // "Return a gear to its owner's hand."
    'sfd-135': {
      keywords: ['Action'],
      effects: [{ op: 'bounceGear', side: 'enemy' }],
    },

    'sfd-136': {
      unimplemented: 'Counter a spell unless its controller pays [2], plus [Repeat]. Countering a ' +
        'chain item and offering its controller a ransom are both chain internals, and the ' +
        'ransom has no window to be offered in.',
    },

    'sfd-140': {
      unimplemented: 'Play a spell from your trash ignoring its Energy cost, then recycle it. ' +
        'Playing runs through the engine\'s own play action from hand only; there is no way for ' +
        'ability data to start a play from another zone, let alone with a modified cost.',
    },

    'sfd-145': {
      unimplemented: 'Hidden, and swapping the Might of two units. Neither exists: there is no ' +
        'facedown space, and Might is derived on demand from printed value plus buffs, with no ' +
        'layer that can hold a swapped value for a turn.',
    },

    'sfd-146': {
      unimplemented: 'A continuous cost-modification layer ("while I\'m in combat, friendly spells ' +
        'cost [1][A] less to a minimum of [1], and enemy spells cost [1][A] more"). RB.costOf reads ' +
        'the printed cost with no modifier layer, and "while I\'m in combat" has no representation.',
    },

    'sfd-150': {
      unimplemented: 'The Equip cost includes "Recycle 2 cards from your trash". An activated ' +
        "ability's cost in this grammar is Energy, Power and exhausting the source; a " +
        'non-standard cost can neither be checked for legality nor paid.',
    },

    // ---------------------------------------------------------------- Order
    // "[Equip] [C]"
    'sfd-153': {
      activated: [{ power: 1, domains: ['Order'], effects: [{ op: 'attach' }] }],
    },

    'sfd-154': {
      unimplemented: 'Hidden. The token and the "you may pay [C] to ready it" follow-up are both ' +
        'sayable, but the first line is not, and the card is played from the facedown space.',
    },

    // "[Equip] [C]"
    'sfd-161': {
      activated: [{ power: 1, domains: ['Order'], effects: [{ op: 'attach' }] }],
    },

    // "Kill a friendly unit. If you do, give +[M] equal to its Might to another friendly unit
    //  this turn. Draw 1."
    'sfd-163': {
      keywords: ['Reaction'],
      effects: [{ op: 'killAndTransferMight' }, { op: 'draw', n: 1 }],
    },

    'sfd-165': {
      unimplemented: 'Deathknell that plays a unit from your trash ignoring its cost. The death ' +
        'trigger itself is fine; playing a card out of the trash is not reachable from ability ' +
        'data, which is also why the cost filter cannot be honoured.',
    },

    // "[Deathknell] — If I was [Mighty], draw 2." Mighty is Might 5 or more.
    'sfd-167': {
      keywords: ['Deathknell'],
      sfdTriggers: [{ on: 'death', effects: [{ op: 'when', cond: 'wasMighty', effects: [{ op: 'draw', n: 2 }] }] }],
    },

    // ------------------------------------------------------- Legends and pairs
    // "When you win a combat, draw 1." combatEnd carries the winner; `mine` cannot be used
    // here because that event has no player field for the core filter to compare.
    'sfd-185': {
      triggers: [{ on: 'combatEnd', effects: [{ op: 'when', cond: 'wonCombat', effects: [{ op: 'draw', n: 1 }] }] }],
    },

    // "[Quick-Draw] … [Equip] [C] … [Temporary]". Temporary here is the conditional printed
    // form: killed at the start of its controller's Beginning Phase while unattached. An
    // attached gear is not a trigger source at all, so the condition is doubly honoured.
    'sfd-186': {
      keywords: ['Reaction', 'Quick-Draw', 'Temporary'],
      triggers: [
        { on: 'played', effects: [{ op: 'attach' }] },
        { on: 'beginningPhase', mine: true, effects: [{ op: 'when', cond: 'unattached', effects: [{ op: 'kill', target: 'self' }] }] },
      ],
      activated: [{ power: 1, domains: ['Fury', 'Chaos'], effects: [{ op: 'attach' }] }],
    },

    'sfd-195': {
      unimplemented: 'Blade Dancer\'s first line is a Targeting Effect ("when you choose a friendly ' +
        'unit"). Nothing in the engine announces that a spell or ability chose an object — targets ' +
        'are resolved inside RB.select at resolution — so the trigger can never fire.',
    },

    // "Give a unit +2 [S] this turn and another unit -2 [S] this turn."
    'sfd-196': {
      keywords: ['Reaction'],
      effects: [
        { op: 'giveMight', n: 2, target: { pick: 'myUnits' } },
        { op: 'weaken', n: 2, target: { pick: 'enemyUnits' } },
      ],
    },

    'sfd-197': {
      unimplemented: 'Grants Weaponmaster to your Sand Soldiers — a continuous ability-granting ' +
        'layer over a tag, which the engine has only for battlefield statics, and Weaponmaster ' +
        'itself is not implemented. The activated ability is also gated on "if you\'ve played an ' +
        'Equipment this turn", which nothing tracks.',
    },

    // "Play a 2 [M] Sand Soldier unit token for each Equipment you control. Then do this:
    //  Ready up to two of them."
    'sfd-198': {
      effects: [
        { op: 'playTokenPer', cardId: 'sfd-t-sand', per: 'Equipment' },
        { op: 'readyMade', n: 2 },
      ],
    },

    // "When you recycle a rune, you may exhaust me to play a Gold gear token exhausted."
    // "When one or more enemy units die, ready me." (readying twice is a no-op, so firing per
    //  death is indistinguishable from firing once per simultaneous batch)
    'sfd-203': {
      sfdTriggers: [
        {
          on: 'runeRecycle', mine: true,
          effects: [{ op: 'mayPay', exhaustSelf: true, effects: [{ op: 'playToken', cardId: 'sfd-t-gold', exhausted: true }] }],
        },
        { on: 'anyDeath', enemy: true, unit: true, effects: [{ op: 'ready', target: 'self' }] },
      ],
    },

    'sfd-205': {
      unimplemented: '"When one of your units becomes [Mighty]" is a state-change event on a ' +
        'derived characteristic. Might is computed on demand and nothing records its previous ' +
        'value, so the moment a unit crosses 5 Might cannot be detected.',
    },

    'sfd-206': {
      unimplemented: 'Counter a spell and buff by that spell\'s Energy cost. Countering is chain ' +
        'internals; the grammar cannot name a pending chain item, let alone remove it.',
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
          op: 'when', cond: 'here',
          effects: [{
            op: 'mayPay', energy: 1, bounceHere: true,
            effects: [{ op: 'playToken', cardId: 'sfd-t-sand', to: 'here' }],
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
        effects: [{ op: 'when', cond: 'here', effects: [{ op: 'mayPay', energy: 1, effects: [{ op: 'readyLegend' }] }] }],
      }],
    },

    'sfd-215': {
      unimplemented: 'A Defend trigger (see sfd-128) plus revealing the top of the Main Deck and ' +
        'sorting it by type. The reveal is expressible; the trigger is not, because showdowns open ' +
        'inside the engine\'s closure.',
    },

    // "When you conquer here, draw 1 for each other battlefield you or allies control."
    // (1v1 has no allies, so "you or allies" is you.)
    'sfd-217': {
      triggers: [{
        on: 'conquer',
        effects: [{ op: 'when', cond: 'here', effects: [{ op: 'drawPerOtherBattlefield', n: 1 }] }],
      }],
    },

    // "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1."
    'sfd-218': {
      triggers: [{
        on: 'conquer',
        effects: [{
          op: 'when', cond: 'here',
          effects: [{
            op: 'when', cond: 'mightyHere',
            effects: [{ op: 'mayPay', energy: 1, effects: [{ op: 'draw', n: 1 }] }],
          }],
        }],
      }],
    },

    // "When you conquer here, you may pay [1] to play a Gold gear token exhausted."
    'sfd-220': {
      triggers: [{
        on: 'conquer',
        effects: [{
          op: 'when', cond: 'here',
          effects: [{ op: 'mayPay', energy: 1, effects: [{ op: 'playToken', cardId: 'sfd-t-gold', exhausted: true }] }],
        }],
      }],
    },

    'sfd-225': {
      unimplemented: 'Deflect (a mandatory additional Power cost on enemy spells and abilities that ' +
        'choose me) has no cost layer to live in, and "when you choose or ready me" needs both a ' +
        'Targeting Effect and a became-ready event, neither of which the engine announces.',
    },

    // ----------------------------------------------------------------- Tokens
    // The named tokens this set creates (§185.3). Their card entries are registered by
    // js/ops-sfd.js, because data/cards.js is generated and carries no tokens.
    // Gold: "[Reaction][>] Kill this, [E]: Add [A]". The kill rides the effect rather than
    // the cost — the engine's activated-ability costs are Energy, Power and exhaust — which
    // is indistinguishable in play, since the token is exhausted and gone either way.
    'sfd-t-gold': {
      keywords: ['Reaction'],
      activated: [{
        exhaustSelf: true, tags: ['Reaction'],
        effects: [{ op: 'addAnyPower', n: 1 }, { op: 'kill', target: 'self' }],
      }],
    },
    'sfd-t-sand': { vanilla: true },
    'sfd-t-mech': { vanilla: true },

  });
})(window.RB = window.RB || {});
