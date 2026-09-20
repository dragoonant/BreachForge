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

  'ogn-012': { unimplemented: '[Legion] — "I cost [2] less" is a conditional cost reduction. ' +
    'RB.costOf has no hook for a card-driven cost modifier, and nothing counts the cards you ' +
    'have finalized this turn, which is what Legion asks.' },

  // [Action] Kill all gear.
  'ogn-022': { keywords: ['Action'], effects: [{ op: 'ogn.killGear', scope: 'all' }] },

  // When you play me, opponents can't play cards this turn.
  'ogn-026': { triggers: [{ on: 'played', effects: [{ op: 'ogn.lockOpponentPlays' }] }] },

  'ogn-027': { unimplemented: 'Triggers on playing your SECOND card in a turn. The engine ' +
    'raises no event for a card being played (only `unitPlayed`, for units) and keeps no ' +
    'count of the cards a player has played this turn.' },

  'ogn-028': { unimplemented: 'My Might is increased by your points — a continuous modifier ' +
    'whose value is read from the game state each time Might is asked for. `statics` carry ' +
    'fixed numbers only, so there is nowhere to put a computed one.' },

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

  'ogn-077': { unimplemented: '[Hidden], and a replacement effect: "if a friendly unit would ' +
    'die, kill this instead". There is no facedown zone, and no replacement layer — an ' +
    'effect cannot stand in front of a death and take its place.' },

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

  'ogn-103': { unimplemented: 'Triggers when you play a SPELL. The engine raises `unitPlayed` ' +
    'for units and nothing at all for a spell being played, and a spell resolving is a ' +
    'different moment from a spell being played.' },

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

  'ogn-110': { unimplemented: '[Accelerate] is an optional additional cost paid as the unit is ' +
    'played ("pay [1][C] and I enter ready"). Playing a card is one action with one cost in ' +
    'this engine; there is no step at which a player chooses to pay more.' },

  'ogn-116': { unimplemented: '[Accelerate] is an optional additional cost paid as the unit is ' +
    'played. Playing a card is one action with one cost here, so the choice to pay it has ' +
    'nowhere to be made — the play trigger below it is expressible, the keyword is not.' },

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
  // ("or facedown card" is vacuous here: [Hidden] is unimplemented set-wide, so no card
  // can ever be facedown, and the option can never be taken.)
  'ogn-181': {
    activated: [{ exhaustSelf: true, effects: [
      { op: 'ogn.bounce', target: { pick: 'myUnitsAndGear', other: true } }] }],
  },

  // [Action] Look at the top 3 cards of your Main Deck. Put 1 into your hand and recycle the rest.
  'ogn-183': { keywords: ['Action'], effects: [{ op: 'ogn.digTop', n: 3, take: 1 }] },

  // When I move, discard 1, then draw 1.
  'ogn-185': {
    triggers: [{ on: 'moved', effects: [
      { op: 'ogn.when', test: 'selfMoved', effects: [
        { op: 'discard', n: 1 }, { op: 'draw', n: 1 }] }] }],
  },

  // When this leaves the board, draw 1 and channel 1 rune exhausted. · [C],[T]: Kill this.
  'ogn-186': {
    triggers: [{ on: 'leftBoard', effects: [
      { op: 'draw', n: 1 }, { op: 'channel', n: 1, exhausted: true }] }],
    activated: [{ power: 1, domains: ['Chaos'], exhaustSelf: true,
      effects: [{ op: 'kill', target: 'self' }] }],
  },

  // When you play me, choose an opponent. They reveal their hand. Choose a card from it,
  // and they discard that card.
  'ogn-192': {
    triggers: [{ on: 'played', effects: [{ op: 'ogn.discardChosen', opponent: true, n: 1 }] }],
  },

  // Play a unit from your trash, ignoring its Energy cost.
  'ogn-198': { effects: [{ op: 'ogn.playUnitFromTrash' }] },

  'ogn-199': { unimplemented: '[Hidden] — hide this facedown at a battlefield you control and ' +
    'play it later for [0]. There is no facedown zone, no hide action and no cost ' +
    'replacement for playing from one, so the keyword cannot be said at all.' },

  // ---------------------------------------------------------------- Order
  'ogn-207': { unimplemented: 'An optional additional cost chosen as the spell is played ' +
    '("you may spend a buff; if you do, ignore this spell\'s cost"). Cost is computed once, ' +
    'before the action, with no step at which the player may add to or waive it.' },

  // Each player kills one of their units.
  'ogn-209': { effects: [{ op: 'ogn.eachKillsUnit' }] },

  'ogn-213': { unimplemented: '[Hidden] — hide this facedown at a battlefield you control and ' +
    'play it later for [0]. There is no facedown zone and no hide action; the kill clause ' +
    'below it is expressible, the keyword is not.' },

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

  'ogn-232': { unimplemented: 'While I\'m [Mighty] I have [Deflect], [Ganking] and [Shield] — a ' +
    'conditional grant of keywords. `statics` have no condition, and [Deflect] (an ' +
    'additional Power cost on an opponent targeting me) has no reader anywhere: spells do ' +
    'not pay per target here.' },

  // When you play me, kill an enemy unit.
  'ogn-234': {
    triggers: [{ on: 'played', effects: [{ op: 'ogn.kill', target: { pick: 'enemyUnits' } }] }],
  },

  'ogn-236': { unimplemented: 'Your [Deathknell] effects trigger an additional time — a ' +
    'continuous modification of how often other cards\' triggers fire. Triggers are ' +
    'dispatched by the core one per matching entry; nothing can multiply them.' },

  // ---------------------------------------------------------------- Battlefields
  // Increase the points needed to win the game by 1.
  'ogn-276': {
    triggers: [{ on: 'beginningPhase', effects: [{ op: 'ogn.raiseVictoryScore', n: 1 }] }],
  },

  'ogn-279': { unimplemented: 'A Defend trigger ("when you defend here") — the moment a unit ' +
    'takes the Defender designation. Showdowns stamp the roles but raise no event, so there ' +
    'is nothing to hang this on; [Shield 2] itself is sayable, the trigger is not.' },

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
      { op: 'ogn.when', test: 'here', effects: [{ op: 'ogn.readyRunesAtEndOfTurn', n: 2 }] }] }],
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

  'ogs-019': { unimplemented: 'While a friendly unit defends ALONE, it gets +2 [S] — a ' +
    'continuous modifier with a condition. `statics` apply unconditionally within their ' +
    'scope, and no scope means "the only unit its controller has at that battlefield, ' +
    'while it is a defender".' },

});
