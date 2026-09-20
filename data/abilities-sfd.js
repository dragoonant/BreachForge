// Spiritforged (sfd) ability data. Keyed by card id; the shape is docs/grammar.md. The ops
// and conditions this pack leans on that the core does not ship live in js/ops-sfd.js,
// which is loaded first.
//
// A card whose printed text this grammar cannot say exactly carries `unimplemented`, naming
// the clause that is missing: it then plays as its printed body and is MARKED as partial on
// its own face (js/cards.js RB.isPartial). Half-authoring a card instead — dropping a
// clause and shipping the rest unmarked — is the defect this marker exists to prevent.
//
// Two conventions used throughout:
//   * "choose a unit" resolves through RB.autoPick (D-2: the player does not pick yet), so a
//     beneficial clause is pointed at `myUnits` and a harmful one at `enemyUnits`. That is
//     the auto-resolution rule, not a narrowing of what the card may legally target.
//   * Every Might change here is printed "this turn", so all of them write the this-turn
//     buff channel; none of them is permanent.
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
      triggers: [{ on: 'deathknell',
        effects: [{ op: 'sfd.playToken', cardId: 'tok-mech', might: 3, n: 2, to: 'base' }] }],
    },

    // "[Quick-Draw] … [Equip] [C]". Quick-Draw's reminder grants Reaction and attaches on
    // play; the printed Might Bonus (+2) is already read off the card by RB.mightOf.
    'sfd-022': {
      keywords: ['Reaction', 'Quick-Draw'],
      triggers: [{ on: 'played', effects: [{ op: 'sfd.attach' }] }],
      activated: [{ power: 1, domains: ['Fury'], effects: [{ op: 'sfd.attach' }] }],
    },

    // "[Reaction] … [Assault 2] … I can be played to a battlefield you're attacking."
    // Nothing in the core reads the Assault keyword, so the +2 is authored as the static it
    // is; the keyword stays because it is printed and referenceable.
    'sfd-025': {
      keywords: ['Reaction', { name: 'Assault', value: 2 }],
      playAlso: ['whereIAmAttacking'],
      statics: [{ might: 2, scope: 'self', when: 'attacking' }],
    },

    // ---------------------------------------------------------------- Calm
    // "[Repeat] [2] … Play a 2 [M] Sand Soldier unit token." Repeat is an optional
    // additional cost paid AS the card is played, and its instructions run once more on
    // resolution — which is exactly what an additional cost carrying `effects` does.
    'sfd-031': {
      additionalCosts: [{ id: 'repeat', energy: 2,
        effects: [{ op: 'sfd.playToken', cardId: 'tok-sand-soldier', might: 2 }] }],
      effects: [{ op: 'sfd.playToken', cardId: 'tok-sand-soldier', might: 2 }],
    },

    // "When you play me, you may kill a gear."
    'sfd-032': {
      triggers: [{ on: 'played',
        effects: [{ op: 'may', effects: [{ op: 'sfd.killGear', side: 'enemy' }] }] }],
    },

    // "[Equip] [C]"
    'sfd-033': {
      activated: [{ power: 1, domains: ['Calm'], effects: [{ op: 'sfd.attach' }] }],
    },

    // "[Deathknell] — If I died alone, draw 1."
    'sfd-036': {
      triggers: [{ on: 'deathknell',
        effects: [{ op: 'sfd.when', cond: 'diedAlone', effects: [{ op: 'draw', n: 1 }] }] }],
    },

    // "[Equip] [C]"
    'sfd-042': {
      activated: [{ power: 1, domains: ['Calm'], effects: [{ op: 'sfd.attach' }] }],
    },

    // "Counter an enemy spell or ability that chooses a friendly unit or gear."
    'sfd-045': {
      keywords: ['Reaction'],
      effects: [{ op: 'sfd.counterSpell', enemy: true, chose: 'mine' }],
    },

    // "When I move, draw 1."
    'sfd-048': {
      triggers: [{ on: 'moved', mine: true,
        effects: [{ op: 'sfd.when', cond: 'isMe', effects: [{ op: 'draw', n: 1 }] }] }],
    },

    // "[Equip] [C]"
    'sfd-051': {
      activated: [{ power: 1, domains: ['Calm'], effects: [{ op: 'sfd.attach' }] }],
    },

    // ---------------------------------------------------------------- Mind
    // "When I conquer, play a Gold gear token exhausted."
    'sfd-069': {
      triggers: [{ on: 'conquer', mine: true, here: true,
        effects: [{ op: 'sfd.playToken', cardId: 'tok-gold', exhausted: true }] }],
    },

    // "[Hidden] [Action] Deal 3 to a unit at a battlefield. Play a Gold gear token exhausted."
    'sfd-070': {
      keywords: ['Hidden', 'Action'],
      effects: [
        { op: 'sfd.damageThere', n: 3 },
        { op: 'sfd.playToken', cardId: 'tok-gold', exhausted: true },
      ],
    },

    // ---------------------------------------------------------------- Body
    // "Give a unit +5 [S] this turn."
    'sfd-097': {
      keywords: ['Action'],
      effects: [{ op: 'sfd.giveMight', n: 5, target: { pick: 'myUnits' } }],
    },

    // "I can't be chosen by enemy spells and abilities." Read by RB.canChoose.
    'sfd-105': {
      statics: [{ untargetableByEnemies: true, scope: 'self' }],
    },

    // "[Weaponmaster] … You may pay [C][C] as an additional cost to play me. When you play
    //  me, if you paid the additional cost, move an enemy gear to your base. You control it
    //  until I leave the board. If it's an Equipment, attach it to me."
    // The loan is a delayed ability keyed to this unit leaving the board, so it outlives the
    // trigger that made it.
    'sfd-109': {
      keywords: ['Weaponmaster'],
      additionalCosts: [{ id: 'reclaim', power: 2, domains: ['Body'] }],
      triggers: [{ on: 'played', effects: [
        { op: 'may', effects: [{ op: 'sfd.weaponmaster' }] },
        { op: 'sfd.when', cond: 'paidExtra', id: 'reclaim', effects: [{ op: 'sfd.stealGear' }] },
      ] }],
    },

    // ---------------------------------------------------------------- Chaos
    // "When I defend, you may kill me to move an attacking unit to its base."
    'sfd-128': {
      triggers: [{ on: 'defend', mine: true, here: true, effects: [{ op: 'may', effects: [
        { op: 'kill', target: 'self' },
        { op: 'sfd.recallAttacker' },
      ] }] }],
    },

    // "When I move, play a Gold gear token exhausted."
    'sfd-130': {
      triggers: [{ on: 'moved', mine: true, effects: [{ op: 'sfd.when', cond: 'isMe',
        effects: [{ op: 'sfd.playToken', cardId: 'tok-gold', exhausted: true }] }] }],
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

    // "[Reaction] [Repeat] [2] Counter a spell unless its controller pays [2]."
    'sfd-136': {
      keywords: ['Reaction'],
      additionalCosts: [{ id: 'repeat', energy: 2,
        effects: [{ op: 'sfd.ransomSpell', energy: 2 }] }],
      effects: [{ op: 'sfd.ransomSpell', energy: 2 }],
    },

    // "When you play me, you may play a spell from your trash with Energy cost no more than
    //  [3], ignoring its Energy cost. Recycle that spell after you play it."
    'sfd-140': {
      triggers: [{ on: 'played', effects: [{ op: 'may', effects: [{
        op: 'sfd.playFromTrash', type: 'Spell', maxEnergy: 3, ignoreEnergy: true, recycleAfter: true,
      }] }] }],
    },

    // "[Hidden] [Action] Swap the Might of two units at the same battlefield this turn."
    'sfd-145': {
      keywords: ['Hidden', 'Action'],
      effects: [{ op: 'sfd.swapMightThere' }],
    },

    // "While I'm in combat, friendly spells cost [1][A] less to a minimum of [1], and enemy
    //  spells cost [1][A] more." Driven through the core's cost-modifier layer; the static
    //  is what the layer reads, so the clause lives in the card data.
    'sfd-146': {
      statics: [{ scope: 'self', spellCost: {
        friendly: { energy: -1, power: -1, minEnergy: 1 },
        enemy: { energy: 1, power: 1 },
      } }],
    },

    // "[Equip] — [C], Recycle 2 cards from your trash".
    // DEVIATION: an activated ability's cost may only be Energy, Power, exhausting or
    // killing the source, so the recycle is enforced on resolution instead. With fewer than
    // two cards in the trash the ability is still offered and does nothing — it is never
    // free to actually equip, but it can waste the [C]. Same shape as unl-158.
    'sfd-150': {
      activated: [{ power: 1, domains: ['Chaos'], effects: [{
        op: 'sfd.when', cond: 'trashAtLeast', n: 2,
        effects: [{ op: 'sfd.recycleFromTrash', n: 2 }, { op: 'sfd.attach' }],
      }] }],
    },

    // ---------------------------------------------------------------- Order
    // "[Equip] [C]"
    'sfd-153': {
      activated: [{ power: 1, domains: ['Order'], effects: [{ op: 'sfd.attach' }] }],
    },

    // "[Hidden] Play a 2 [M] Sand Soldier unit token. Then do this: You may pay [C] to ready it."
    'sfd-154': {
      keywords: ['Hidden'],
      effects: [
        { op: 'sfd.playToken', cardId: 'tok-sand-soldier', might: 2 },
        { op: 'sfd.mayPay', power: 1, domains: ['Order'],
          effects: [{ op: 'sfd.readyMade', n: 1 }] },
      ],
    },

    // "[Equip] [C]"
    'sfd-161': {
      activated: [{ power: 1, domains: ['Order'], effects: [{ op: 'sfd.attach' }] }],
    },

    // "Kill a friendly unit. If you do, give +[M] equal to its Might to another friendly
    //  unit this turn. Draw 1."
    'sfd-163': {
      keywords: ['Reaction'],
      effects: [{ op: 'sfd.killAndTransferMight' }, { op: 'draw', n: 1 }],
    },

    // "[Deathknell] — You may play a unit with cost no more than [3] and no more than [A]
    //  from your trash, ignoring its cost."
    'sfd-165': {
      triggers: [{ on: 'deathknell', effects: [{ op: 'may', effects: [{
        op: 'sfd.playFromTrash', type: 'Unit', maxEnergy: 3, maxPower: 1, ignoreCost: true,
      }] }] }],
    },

    // "[Deathknell] — If I was [Mighty], draw 2." Mighty is Might 5 or more (RB.isMighty).
    'sfd-167': {
      triggers: [{ on: 'deathknell',
        effects: [{ op: 'sfd.when', cond: 'wasMighty', effects: [{ op: 'draw', n: 2 }] }] }],
    },

    // ------------------------------------------------------- Legends and pairs
    // "When you win a combat, draw 1." combatEnd carries the winner; `mine` cannot be used
    // here because that event has no player field for the core filter to compare.
    'sfd-185': {
      triggers: [{ on: 'combatEnd',
        effects: [{ op: 'sfd.when', cond: 'wonCombat', effects: [{ op: 'draw', n: 1 }] }] }],
    },

    // "[Quick-Draw] … [Equip] [C] … [Temporary]". Temporary here is the conditional printed
    // form: killed at the start of its controller's Beginning Phase while unattached. An
    // attached gear is not a trigger source at all, so the condition is doubly honoured.
    'sfd-186': {
      keywords: ['Reaction', 'Quick-Draw', 'Temporary'],
      triggers: [
        { on: 'played', effects: [{ op: 'sfd.attach' }] },
        { on: 'beginningPhase', mine: true, effects: [{ op: 'sfd.when', cond: 'unattached',
          effects: [{ op: 'kill', target: 'self' }] }] },
      ],
      activated: [{ power: 1, domains: ['Fury', 'Chaos'], effects: [{ op: 'sfd.attach' }] }],
    },

    // "When you choose a friendly unit, you may exhaust me and pay [A] to ready it."
    // "When you conquer, you may pay [1] to ready me."
    'sfd-195': {
      triggers: [
        { on: 'chosen', mine: true, effects: [{ op: 'sfd.when', cond: 'iChose', effects: [{
          op: 'sfd.mayPay', exhaustSelf: true, power: 1, anyDomain: true,
          effects: [{ op: 'ready', target: 'eventUnit' }],
        }] }] },
        { on: 'conquer', mine: true, effects: [{ op: 'sfd.mayPay', energy: 1,
          effects: [{ op: 'ready', target: 'self' }] }] },
      ],
    },

    // "Give a unit +2 [S] this turn and another unit -2 [S] this turn."
    'sfd-196': {
      keywords: ['Reaction'],
      effects: [
        { op: 'sfd.giveMight', n: 2, target: { pick: 'myUnits' } },
        { op: 'sfd.weaken', n: 2, target: { pick: 'enemyUnits' } },
      ],
    },

    // "Your Sand Soldiers have [Weaponmaster]."
    // "[1], [T]: Play a 2 [S] Sand Soldier unit token to your base. Use only if you've
    //  played an Equipment this turn."
    // The grant is read by RB.hasKeyword; the keyword's play effect fires when a Sand
    // Soldier is played, which for a token is the moment sfd.playToken creates it. The
    // gate is checked in legalActions, so the ability is never offered without it — it
    // cannot fizzle for full price.
    'sfd-197': {
      statics: [{ grant: 'Weaponmaster', scope: 'mine', when: { kind: 'sandSoldier' } }],
      activated: [{ energy: 1, exhaustSelf: true, when: 'playedEquipmentThisTurn',
        effects: [{ op: 'sfd.playToken', cardId: 'tok-sand-soldier', might: 2, to: 'base' }] }],
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
    // "When one or more enemy units die, ready me." Readying twice is a no-op, so firing
    // per death is indistinguishable from firing once per simultaneous batch.
    'sfd-203': {
      sfdTriggers: [{ on: 'runeRecycle', mine: true, effects: [{ op: 'sfd.mayPay',
        exhaustSelf: true,
        effects: [{ op: 'sfd.playToken', cardId: 'tok-gold', exhausted: true }] }] }],
      triggers: [{ on: 'died', effects: [{ op: 'sfd.when', cond: 'enemyUnitDied',
        effects: [{ op: 'ready', target: 'self' }] }] }],
    },

    // "When one of your units becomes [Mighty], you may exhaust me to channel 1 rune exhausted."
    'sfd-205': {
      triggers: [{ on: 'becameMighty', mine: true, effects: [{ op: 'sfd.mayPay',
        exhaustSelf: true, effects: [{ op: 'channel', n: 1, exhausted: true }] }] }],
    },

    // "Choose a friendly unit and a spell. Counter that spell and give that unit +[S] equal
    //  to that spell's Energy cost this turn."
    'sfd-206': {
      keywords: ['Reaction'],
      effects: [{ op: 'sfd.counterSpell',
        then: [{ op: 'buffByCounteredCost', target: { pick: 'myUnits' } }] }],
    },

    // ------------------------------------------------------------ Battlefields
    // "When you conquer here, you may pay [1] and return a unit you control here to its
    //  owner's hand to play a 2 [M] Sand Soldier unit token here."
    // A battlefield's own trigger cannot use the core `here` filter (a battlefield has no
    // location), so the `here` condition on the effect is what scopes it.
    'sfd-207': {
      triggers: [{ on: 'conquer', effects: [{ op: 'sfd.when', cond: 'here', effects: [{
        op: 'sfd.mayPay', energy: 1, bounceHere: true,
        effects: [{ op: 'sfd.playToken', cardId: 'tok-sand-soldier', might: 2, to: 'here' }],
      }] }] }],
    },

    // "Players can't score here until their third turn."
    'sfd-209': {
      statics: [{ scoreLockUntilTurn: 3 }],
    },

    // "When you conquer here, you may pay [1] to ready your legend."
    'sfd-210': {
      triggers: [{ on: 'conquer', effects: [{ op: 'sfd.when', cond: 'here',
        effects: [{ op: 'sfd.mayPay', energy: 1, effects: [{ op: 'sfd.readyLegend' }] }] }] }],
    },

    // "When you defend here, reveal the top card of your Main Deck. If it's a spell, put it
    //  in your hand. Otherwise, recycle it."
    'sfd-215': {
      triggers: [{ on: 'defend', effects: [{ op: 'sfd.when', cond: 'here',
        effects: [{ op: 'sfd.revealTop' }] }] }],
    },

    // "When you conquer here, draw 1 for each other battlefield you or allies control."
    // (1v1 has no allies, so "you or allies" is you.)
    'sfd-217': {
      triggers: [{ on: 'conquer', effects: [{ op: 'sfd.when', cond: 'here',
        effects: [{ op: 'sfd.drawPerOtherBattlefield', n: 1 }] }] }],
    },

    // "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1."
    'sfd-218': {
      triggers: [{ on: 'conquer', effects: [{ op: 'sfd.when', cond: ['here', 'mightyHere'],
        effects: [{ op: 'sfd.mayPay', energy: 1, effects: [{ op: 'draw', n: 1 }] }] }] }],
    },

    // "When you conquer here, you may pay [1] to play a Gold gear token exhausted."
    'sfd-220': {
      triggers: [{ on: 'conquer', effects: [{ op: 'sfd.when', cond: 'here',
        effects: [{ op: 'sfd.mayPay', energy: 1,
          effects: [{ op: 'sfd.playToken', cardId: 'tok-gold', exhausted: true }] }] }] }],
    },

    // "[Deflect] … When you choose or ready me, give me +1 [S] this turn."
    // Deflect has a reader now (RB.deflectCost / RB.canChoose), so declaring it is enough.
    'sfd-225': {
      keywords: [{ name: 'Deflect', value: 1 }],
      triggers: [
        { on: 'chosen', effects: [{ op: 'sfd.when', cond: ['isMe', 'iChose'],
          effects: [{ op: 'sfd.giveMight', n: 1, target: 'self' }] }] },
        { on: 'becameReady', effects: [{ op: 'sfd.when', cond: 'isMe',
          effects: [{ op: 'sfd.giveMight', n: 1, target: 'self' }] }] },
      ],
    },

  });
})(window.RB = window.RB || {});
