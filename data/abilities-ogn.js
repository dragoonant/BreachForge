// Ability data for the Origins set (71 ids), keyed by card id. Authored against the
// printed text in scratch/packet-origins.json, clause by clause.
//
// Conventions, so that what is NOT here is as legible as what is:
//   * `{ vanilla: true }` is a card with no printed abilities — never an empty object,
//     which is indistinguishable from a card nobody reached.
//   * `{ unimplemented: '…' }` is a clause the grammar cannot say. The card plays as its
//     printed body and is marked; the marker names the clause and why, because a clause
//     quietly dropped for want of a primitive is the wrong card being played.
//   * Ops named `ogn.*` live in js/ops-ogn.js. Everything else is the core's.
//   * A pool is exactly what the card prints. `prefer` only orders the pool the card
//     allows — "a unit" stays any unit, and the stand-in for the player's choice takes
//     the one a player would take.
window.RB = window.RB || {};
RB.registerAbilities({

  // ---------------------------------------------------------------- Fury
  // [Action] Give a unit [Assault 3] this turn.
  'ogn-004': {
    keywords: ['Action'],
    effects: [{ op: 'ogn.grantKeyword', keyword: 'Assault', value: 3,
      target: { pick: 'allUnits', prefer: 'mine' } }],
  },

  // [Legion] — I cost [2] less. The discount lives in the cost-modifier layer
  // (js/ops-ogn.js reads `ognCostLess`), which is the one home for anything that changes
  // what a card costs; [Legion]'s condition is "another card finalized this turn".
  'ogn-012': { keywords: ['Legion'], ognCostLess: { energy: 2, when: 'legion' } },

  // [Action] Kill all gear.
  'ogn-022': { keywords: ['Action'], effects: [{ op: 'ogn.killGear', scope: 'all' }] },

  // When you play me, opponents can't play cards this turn.
  'ogn-026': { triggers: [{ on: 'played', effects: [{ op: 'ogn.lockOpponentPlays' }] }] },

  // When you play your second card in a turn, give me +2 [S] this turn and ready me.
  'ogn-027': {
    triggers: [{ on: 'cardPlayed', mine: true, effects: [
      { op: 'ogn.when', test: 'nthCardPlayed', n: 2, effects: [
        { op: 'ogn.mightThisTurn', n: 2, target: 'self' },
        { op: 'ready', target: 'self' }] }] }],
  },

  // My Might is increased by your points.
  'ogn-028': { statics: [{ might: { from: 'points' }, scope: 'self', includeSelf: true }] },

  // Deal 3 to a unit.
  'ogn-029': { effects: [{ op: 'ogn.damage', n: 3, target: { pick: 'allUnits', prefer: 'enemy' } }] },

  // ---------------------------------------------------------------- Calm
  'ogn-042': { vanilla: true },

  // Move an enemy unit.
  'ogn-043': { effects: [{ op: 'ogn.moveUnit', target: { pick: 'enemyUnits' }, to: 'base' }] },

  // [Reaction] Counter a spell that costs no more than [4] and no more than [A].
  'ogn-045': {
    keywords: ['Reaction'],
    effects: [{ op: 'ogn.counterSpell', maxEnergy: 4, maxPower: 1 }],
  },

  // [Reaction] Give a friendly unit +1 [S] this turn, then an additional +1 [S] this turn
  // if it is the only unit you control there.
  'ogn-046': {
    keywords: ['Reaction'],
    effects: [{ op: 'ogn.mightThisTurn', n: 1, aloneBonus: 1, target: { pick: 'myUnits' } }],
  },

  // When I conquer, you may kill a gear. If you do, buff me.
  'ogn-056': {
    triggers: [{ on: 'conquer', mine: true, here: true, effects: [
      { op: 'ogn.when', test: 'anyGear', effects: [
        { op: 'may', prompt: 'Kill a gear to buff Adaptatron?', effects: [
          { op: 'ogn.killGear', prefer: 'enemy' },
          { op: 'ogn.buffCounter', target: 'self' }] }] }] }],
  },

  // [Reaction] Give a unit +2 [S] this turn. Draw 1.
  'ogn-058': {
    keywords: ['Reaction'],
    effects: [
      { op: 'ogn.mightThisTurn', n: 2, target: { pick: 'allUnits', prefer: 'mine' } },
      { op: 'draw', n: 1 }],
  },

  // [Tank] · When you play me to a battlefield, you may move an enemy unit to here.
  // When I hold, return me to my owner's hand.
  'ogn-067': {
    keywords: ['Tank'],
    triggers: [
      { on: 'played', effects: [
        { op: 'ogn.when', test: 'atBattlefield', effects: [
          { op: 'may', prompt: 'Move an enemy unit here?', effects: [
            { op: 'ogn.moveUnit', target: { pick: 'enemyUnits' }, to: 'here' }] }] }] },
      { on: 'hold', mine: true, here: true, effects: [{ op: 'ogn.bounce', target: 'self' }] }],
  },

  // While I'm at a battlefield, ready 4 friendly runes at the end of your turn.
  'ogn-073': {
    triggers: [{ on: 'endOfTurn', mine: true, effects: [
      { op: 'ogn.when', test: 'atBattlefield', effects: [{ op: 'ready', what: 'runes', n: 4 }] }] }],
  },

  'ogn-077': { unimplemented: 'A replacement effect: "if a friendly unit would die, kill ' +
    'this instead". There is no replacement layer — an effect cannot stand in front of a ' +
    'death and take its place. ([Hidden] itself is now expressible; this clause is not.)' },

  // When you play me, give a unit +8 [S] this turn.
  'ogn-082': {
    triggers: [{ on: 'played', effects: [
      { op: 'ogn.mightThisTurn', n: 8, target: { pick: 'allUnits', prefer: 'mine' } }] }],
  },

  // ---------------------------------------------------------------- Mind
  // [Reaction] Give a unit -4 [S] this turn, to a minimum of 1 [S].
  'ogn-093': {
    keywords: ['Reaction'],
    effects: [{ op: 'ogn.mightThisTurn', n: -4, min: 1,
      target: { pick: 'allUnits', prefer: 'enemy' } }],
  },

  // [Reaction] Give a unit -1 [S] this turn, to a minimum of 1 [S]. Draw 1.
  'ogn-095': {
    keywords: ['Reaction'],
    effects: [
      { op: 'ogn.mightThisTurn', n: -1, min: 1, target: { pick: 'allUnits', prefer: 'enemy' } },
      { op: 'draw', n: 1 }],
  },

  // [Deathknell] — Draw 1.
  'ogn-096': { triggers: [{ on: 'deathknell', effects: [{ op: 'draw', n: 1 }] }] },

  // When you play a spell, give me +1 [S] this turn.
  'ogn-103': {
    triggers: [{ on: 'spellPlayed', mine: true, effects: [
      { op: 'ogn.mightThisTurn', n: 1, target: 'self' }] }],
  },

  // [Reaction] Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted.
  'ogn-104': {
    keywords: ['Reaction'],
    effects: [
      { op: 'ogn.bounce', target: { pick: 'myUnits' } },
      { op: 'channel', n: 1, exhausted: true }],
  },

  // Deal 6 to each of up to two units.
  'ogn-105': {
    effects: [{ op: 'ogn.damage', n: 6, target: { pick: 'allUnits', n: 2, prefer: 'enemy' } }],
  },

  // [Accelerate] · [Deathknell] — Recycle me to ready your runes.
  // "Recycle me" is the trigger's base cost (§13.3), so it is part of the one op rather
  // than an effect that could happen without it.
  'ogn-110': {
    additionalCosts: [{ id: 'accelerate', energy: 1, power: 1, entersReady: true }],
    triggers: [{ on: 'deathknell', effects: [{ op: 'ogn.recycleSelfToReadyRunes' }] }],
  },

  // [Accelerate] · When you play me, give enemy units -3 [S] this turn, to a minimum of 1 [S].
  'ogn-116': {
    additionalCosts: [{ id: 'accelerate', energy: 1, power: 1, entersReady: true }],
    triggers: [{ on: 'played', effects: [
      { op: 'ogn.mightThisTurn', n: -3, min: 1, target: 'enemyUnits' }] }],
  },

  // ---------------------------------------------------------------- Body
  'ogn-126': { vanilla: true },

  // [Action] Choose a friendly unit and an enemy unit. They deal damage equal to their
  // Mights to each other.
  'ogn-128': { keywords: ['Action'], effects: [{ op: 'ogn.duel' }] },

  // When you play me, ready another unit.
  'ogn-132': { triggers: [{ on: 'played', effects: [{ op: 'ogn.readyOther' }] }] },

  // [Reaction] Deal 1 to all units at battlefields.
  'ogn-133': { keywords: ['Reaction'], effects: [{ op: 'ogn.damageAll', n: 1 }] },

  // Channel 1 rune exhausted. If you can't, draw 1.
  'ogn-134': { effects: [{ op: 'ogn.channelElseDraw', n: 1, draw: 1 }] },

  // When you play me, buff another friendly unit.
  'ogn-136': { triggers: [{ on: 'played', effects: [{ op: 'ogn.buffCounter', n: 1, other: true }] }] },

  // Channel 2 runes exhausted. If you couldn't channel 2 runes this way, draw 1.
  'ogn-138': { effects: [{ op: 'ogn.channelElseDraw', n: 2, draw: 1 }] },

  // When you play me, buff up to two other friendly units.
  'ogn-141': { triggers: [{ on: 'played', effects: [{ op: 'ogn.buffCounter', n: 2, other: true }] }] },

  // Choose an opponent. They reveal their hand. Choose a non-unit card from it, and
  // recycle that card.
  'ogn-156': { effects: [{ op: 'ogn.recycleFromHand', opponent: true, filter: 'nonUnit' }] },

  // At the end of your turn, reveal cards from the top of your Main Deck until you reveal
  // a unit and banish it. Play it, ignoring its cost, and recycle the rest.
  'ogn-160': {
    triggers: [{ on: 'endOfTurn', mine: true, effects: [{ op: 'ogn.playUnitFromDeck' }] }],
  },

  // ---------------------------------------------------------------- Chaos
  'ogn-166': { vanilla: true },

  // [Reaction] Return a unit at a battlefield with 3 [S] or less to its owner's hand.
  'ogn-169': {
    keywords: ['Reaction'],
    effects: [{ op: 'ogn.bounce',
      target: { pick: 'allUnits', at: 'battlefield', maxMight: 3, prefer: 'enemy' } }],
  },

  // [Action] Return a unit at a battlefield to its owner's hand.
  'ogn-172': {
    keywords: ['Action'],
    effects: [{ op: 'ogn.bounce', target: { pick: 'allUnits', at: 'battlefield', prefer: 'enemy' } }],
  },

  // [Action] Move a friendly unit and ready it.
  'ogn-173': {
    keywords: ['Action'],
    effects: [{ op: 'ogn.moveUnit', target: { pick: 'myUnits' }, to: 'battlefield', ready: true }],
  },

  // [Action] Each player kills one of their gear.
  'ogn-179': { keywords: ['Action'], effects: [{ op: 'ogn.killGear', scope: 'each' }] },

  // Give a unit at a battlefield or a gear [Temporary].
  'ogn-180': { effects: [{ op: 'ogn.makeTemporary' }] },

  // [E]: Return another friendly gear, unit, or facedown card to its owner's hand.
  'ogn-181': {
    activated: [{ exhaustSelf: true, effects: [
      { op: 'ogn.bounce', target: { pick: 'myUnitsGearOrFacedown', other: true } }] }],
  },

  // [Action] Look at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest.
  'ogn-183': { keywords: ['Action'], effects: [{ op: 'ogn.digTop', n: 3, take: 1 }] },

  // When I move, discard 1, then draw 1.
  'ogn-185': {
    triggers: [{ on: 'moved', effects: [
      { op: 'ogn.when', test: 'isSelf', effects: [
        { op: 'discard', n: 1 }, { op: 'draw', n: 1 }] }] }],
  },

  // When this leaves the board, draw 1 and channel 1 rune exhausted. · [C],[T]: Kill this.
  'ogn-186': {
    triggers: [{ on: 'leftBoard', effects: [
      { op: 'ogn.when', test: 'isSelf', effects: [
        { op: 'draw', n: 1 }, { op: 'channel', n: 1, exhausted: true }] }] }],
    activated: [{ power: 1, domains: ['Chaos'], exhaustSelf: true,
      effects: [{ op: 'kill', target: 'self' }] }],
  },

  // When you play me, choose an opponent. They reveal their hand. Choose a card from it,
  // and they discard that card.
  'ogn-192': {
    triggers: [{ on: 'played', effects: [{ op: 'ogn.discardChosen', opponent: true, n: 1 }] }],
  },

  // Play a unit from your trash, ignoring its Energy cost.
  'ogn-198': { effects: [{ op: 'playFromZone', zone: 'trash', type: 'Unit', ignoreEnergy: true }] },

  // [Hidden] · When you play me, you may choose a unit you control at another location.
  // Move me to its location and it to my original location.
  'ogn-199': {
    keywords: ['Hidden'],
    triggers: [{ on: 'played', effects: [
      { op: 'may', prompt: 'Swap places with a unit you control elsewhere?',
        effects: [{ op: 'ogn.swapPlaces' }] }] }],
  },

  // ---------------------------------------------------------------- Order
  // [Reaction] As you play this, you may spend a buff as an additional cost. If you do,
  // ignore this spell's cost. Give a unit +3 [S] this turn.
  'ogn-207': {
    keywords: ['Reaction'],
    additionalCosts: [{ id: 'glory', pays: 'spendBuff', n: 1, waivesBaseCost: true }],
    effects: [{ op: 'ogn.mightThisTurn', n: 3, target: { pick: 'allUnits', prefer: 'mine' } }],
  },

  // Each player kills one of their units.
  'ogn-209': { effects: [{ op: 'ogn.eachKillsUnit' }] },

  // [Hidden] · [Action] Kill a unit at a battlefield. Its controller draws 2.
  'ogn-213': {
    keywords: ['Hidden', 'Action'],
    effects: [{ op: 'ogn.kill', ownerDraws: 2,
      target: { pick: 'allUnits', at: 'battlefield', prefer: 'enemy' } }],
  },

  // [Deathknell] — Channel 1 rune exhausted.
  'ogn-216': {
    triggers: [{ on: 'deathknell', effects: [{ op: 'channel', n: 1, exhausted: true }] }],
  },

  // [Action] You may kill up to one gear. Draw 1.
  'ogn-224': {
    keywords: ['Action'],
    effects: [
      { op: 'ogn.when', test: 'anyGear', effects: [
        { op: 'may', prompt: 'Kill a gear?', effects: [{ op: 'ogn.killGear', prefer: 'enemy' }] }] },
      { op: 'draw', n: 1 }],
  },

  // While I'm [Mighty], I have [Deflect], [Ganking], and [Shield].
  // Three granted keywords under one condition. [Shield]'s +1 Might while defending is
  // read by the Might layer in js/ops-ogn.js, so the keyword is the whole declaration.
  'ogn-232': {
    statics: [
      { grant: 'Deflect', scope: 'self', includeSelf: true, when: 'mighty' },
      { grant: 'Ganking', scope: 'self', includeSelf: true, when: 'mighty' },
      { grant: 'Shield', scope: 'self', includeSelf: true, when: 'mighty' }],
  },

  // When you play me, kill an enemy unit.
  'ogn-234': {
    triggers: [{ on: 'played', effects: [{ op: 'ogn.kill', target: { pick: 'enemyUnits' } }] }],
  },

  // Your [Deathknell] effects trigger an additional time.
  'ogn-236': { statics: [{ deathknellExtra: 1, scope: 'mine' }] },

  // ---------------------------------------------------------------- Battlefields
  // Increase the points needed to win the game by 1.
  'ogn-276': {
    triggers: [{ on: 'beginningPhase', effects: [{ op: 'ogn.raiseVictoryScore', n: 1 }] }],
  },

  // When you defend here, choose a unit. It gains [Shield 2] this combat.
  // The chosen unit is one of the defenders standing here: [Shield] is "+X while I am a
  // defender", so it is the only choice that does anything.
  'ogn-279': {
    triggers: [{ on: 'defend', effects: [
      { op: 'ogn.when', test: 'here', effects: [
        { op: 'ogn.grantKeyword', keyword: 'Shield', value: 2, duration: 'combat',
          target: { pick: 'hereMine' } }] }] }],
  },

  // When you hold here, draw 1.
  'ogn-280': {
    triggers: [{ on: 'hold', effects: [
      { op: 'ogn.when', test: 'here', effects: [{ op: 'draw', n: 1 }] }] }],
  },

  // When you conquer here, you may spend a buff to draw 1.
  'ogn-282': {
    triggers: [{ on: 'conquer', effects: [
      { op: 'ogn.when', test: 'here', effects: [
        { op: 'ogn.when', test: 'myBuff', effects: [
          { op: 'may', prompt: 'Spend a buff to draw 1?', effects: [
            { op: 'ogn.spendBuff' }, { op: 'draw', n: 1 }] }] }] }] }],
  },

  // When you conquer here, you must recycle one of your runes. (This doesn't choose anything.)
  'ogn-287': {
    triggers: [{ on: 'conquer', effects: [
      { op: 'ogn.when', test: 'here', effects: [{ op: 'recycleRune', n: 1 }] }] }],
  },

  // When you hold here, you may channel 1 rune exhausted.
  'ogn-288': {
    triggers: [{ on: 'hold', effects: [
      { op: 'ogn.when', test: 'here', effects: [
        { op: 'may', prompt: 'Channel 1 rune exhausted?', effects: [
          { op: 'channel', n: 1, exhausted: true }] }] }] }],
  },

  // When you conquer here, ready up to 2 runes at the end of this turn.
  'ogn-289': {
    triggers: [{ on: 'conquer', effects: [
      { op: 'ogn.when', test: 'here', effects: [
        { op: 'delayed', on: 'endOfTurn', effects: [{ op: 'ready', what: 'runes', n: 2 }] }] }] }],
  },

  // At the start of each player's first Beginning Phase, that player gains 1 point.
  'ogn-290': {
    triggers: [{ on: 'beginningPhase', effects: [
      { op: 'ogn.onceEachPlayer', effects: [{ op: 'gainPoint', n: 1 }] }] }],
  },

  // Units here have +1 [S].
  'ogn-294': { statics: [{ might: 1, scope: 'here' }] },

  // Units here have [Ganking].
  'ogn-297': { statics: [{ grant: 'Ganking', scope: 'here' }] },

  // When you conquer here, discard 1, then draw 1.
  'ogn-298': {
    triggers: [{ on: 'conquer', effects: [
      { op: 'ogn.when', test: 'here', effects: [
        { op: 'discard', n: 1 }, { op: 'draw', n: 1 }] }] }],
  },

  // ---------------------------------------------------------------- Origins: Starter
  // When you play me, return a spell from your trash to your hand.
  'ogs-010': {
    triggers: [{ on: 'played', effects: [{ op: 'ogn.returnSpellFromTrash' }] }],
  },

  // [Reaction] Move up to 2 friendly units to base.
  'ogs-011': {
    keywords: ['Reaction'],
    effects: [{ op: 'ogn.moveUnit',
      target: { pick: 'myUnits', at: 'battlefield', n: 2 }, to: 'base' }],
  },

  // At the end of your turn, ready 2 runes.
  'ogs-017': {
    triggers: [{ on: 'endOfTurn', mine: true, effects: [{ op: 'ready', what: 'runes', n: 2 }] }],
  },

  // While a friendly unit defends alone, it gets +2 [S].
  'ogs-019': { statics: [{ might: 2, scope: 'mine', when: 'defendingAlone' }] },

});
