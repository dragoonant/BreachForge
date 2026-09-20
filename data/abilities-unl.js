// Ability data for the Unleashed set (43 cards). Keyed by card id; the shape is
// docs/grammar.md. New ops live in js/ops-unl.js, which loads before this file.
//
// Two standing decisions, both taken so a clause is never silently dropped:
//
//  * KEYWORDS ARE DECLARED, NOT EXPANDED. `[Assault 2]`, `[Ambush]`, `[Deflect]` and the
//    rest go in `keywords` in the documented shape (docs/grammar.md ships `Assault 2` as
//    its own example). Whether js/state.js and js/combat.js honour each one is core
//    engine work; hand-expanding a keyword into triggers here would double-apply the day
//    the core learns it.
//
//  * OPTIONALITY IS NOT APPROXIMATED. The core has `may`/`choose` queue steps, but no UI
//    path renders them (js/ui.js knows only `mulligan` and `chooseShowdown`), so a card
//    that queued one would hang a human seat. A printed "you may" is therefore only
//    authored where DECLINING CANNOT HELP the controller — unl-193, whose whole cost is
//    exhausting a legend that has no other use. Every other "you may" is unimplemented,
//    because taking it always is a different card from choosing.
RB.registerAbilities({

  // Inferna — [Ambush] [Assault 2]
  'unl-002': { keywords: ['Ambush', { name: 'Assault', value: 2 }] },

  // Grim Apothecary — the play effect is "you MAY return a friendly unit"; returning
  // your own unit is a real cost, so forcing it is a different card and there is no way
  // to put the choice to the player.
  'unl-021': { unimplemented: 'Play effect is an optional "you may return a friendly unit at a battlefield to its owner\'s hand"; the grammar has no optional-effect wrapper, and the queue step that would ask is unrenderable, so the clause can only be authored as compulsory — which it is not.' },

  // Mutated Mouser — [Shield 2] [Tank]
  'unl-036': { keywords: [{ name: 'Shield', value: 2 }, 'Tank'] },

  // Soul Sword — [Equip] [C]. Equip is an activated ability keyword, so it is authored as
  // the activated ability it is; the +1 Might bonus while attached is already RB.mightOf.
  'unl-039': {
    activated: [{ power: 1, domains: ['Calm'], effects: [{ op: 'attach', target: { pick: 'myUnits' } }] }],
  },

  'unl-041': { unimplemented: 'Second clause grants [Deflect] to your other units at this battlefield — a continuous ability-granting layer emitted by a unit. RB.battlefieldStatics is the only continuous layer in the engine and it reads battlefield cards only.' },

  'unl-042': { unimplemented: 'Needs the Stun status (no engine concept: RB.mightOf and combat.js have no way to zero a unit\'s combat contribution) and "if you played this from your hand", which requires distinguishing a hand play from a Hidden facedown play.' },

  'unl-044': { unimplemented: 'Modal ("choose one") with a Counter branch — the chain\'s internals are not reachable from an op — and a four-token branch; there is no Bird token card id in RB.cardData for the token op to mint.' },

  'unl-053': { unimplemented: 'Deathknell: there is no death trigger event. RB.kill in js/engine.js never calls RB.runTriggers, and the effect also reveals an opponent\'s hand and reads their facedown cards, neither of which the engine models.' },

  'unl-060': { unimplemented: '"Enemy units here with less Might than me don\'t deal combat damage" is a continuous, comparative suppression of combat damage; js/combat.js sums RB.mightOf with no hook for exempting a unit.' },

  'unl-067': { unimplemented: 'Deathknell only: there is no death trigger event — RB.kill in js/engine.js never calls RB.runTriggers, and a trigger on an event that never fires would drop the whole card silently.' },

  // Turn to Dust — "Give a gear Temporary." The pool is every gear as printed; only which
  // legal gear is taken is a heuristic (an opponent's first, then the biggest bonus).
  'unl-070': {
    effects: [{ op: 'giveTemporary', target: { pick: 'gear', prefer: 'enemy' } }],
  },

  'unl-074': { unimplemented: 'Triggers on drawing your SECOND card each turn; the engine has no draw event and no per-turn draw counter, and RB.draw is core.' },

  'unl-078': { unimplemented: 'Deathknell (no death trigger event), plus a Sprite token that has no card id in RB.cardData, plus [Temporary] on a gear that the engine only ever sets through the token op.' },

  'unl-079': { unimplemented: 'Triggers when a showdown begins at this battlefield — RB.openShowdown runs no triggers — and then asks the controller to pay [1] mid-resolution, which the grammar has no shape for.' },

  'unl-080': { unimplemented: 'Triggers on moving (no move event; js/engine.js doMove runs no triggers) and then branches on the TYPE OF THE CARD JUST DISCARDED, which the discard op does not report.' },

  'unl-106': { unimplemented: 'Counters an enemy spell or ability conditioned on what it chose — both the chain\'s internals and targeting data are outside anything an op can reach.' },

  'unl-113': { unimplemented: '[Level 6] is a dependent keyword granting [Deflect] and [Ganking] while you have 6+ XP: a conditional, continuous keyword-granting layer, and nothing in the core reads the XP counter.' },

  // Poppy — [Deflect]; "When you play me, if an opponent's score is within 3 points of
  // the Victory Score, ready me and gain 3 XP."
  'unl-116': {
    keywords: ['Deflect'],
    triggers: [{
      on: 'played',
      effects: [{
        op: 'cond', test: { opponentScoreWithin: 3 },
        effects: [{ op: 'ready', target: 'self' }, { op: 'gainXP', n: 3 }],
      }],
    }],
  },

  'unl-118': { unimplemented: '"Any amount of your damage is enough to kill enemy units" rewrites the lethal-damage rule for one player\'s damage — a replacement layer in RB.cleanup and js/combat.js, not an effect.' },

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

  'unl-131': { unimplemented: 'Counters a spell and redirects it to its owner\'s hand — the chain\'s internals are not reachable from an op.' },

  'unl-134': { unimplemented: 'Needs the Stun status (no engine concept) including a "already stunned" branch, and [Repeat] [2], an optional additional cost that re-executes the chain item.' },

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
        { op: 'gainXP', n: 1 },
      ],
    }],
  },

  'unl-141': { unimplemented: 'The play effect fires only when played FROM FACE DOWN, which needs the Hidden facedown zone; the engine has no hidden cards and cannot tell the two plays apart.' },

  'unl-142': { unimplemented: 'Killing a friendly unit is an ADDITIONAL COST — it gates whether the spell can be played at all, which the grammar\'s cost shape (energy/power/exhaustSelf) cannot say — and the payoff plays a unit from the trash bounded by the killed unit\'s cost.' },

  'unl-147': { unimplemented: 'Creates a Baron Pit battlefield token (no battlefield-creation op and no such card id), is untargetable by enemy spells, and gives other friendly units +2 Might — two continuous layers on top.' },

  'unl-152': { unimplemented: 'Deathknell: there is no death trigger event — RB.kill in js/engine.js never calls RB.runTriggers — so the channel clause would never fire.' },

  'unl-158': { unimplemented: 'Its Equip ability is paid by SPENDING 1 XP. An activated ability\'s cost may only be energy, power or exhausting itself, so the ability would be free and always legal — strictly better than the card.' },

  // Shadow's Call — choose a friendly unit without Temporary, give it Temporary, draw 2.
  // Compulsory as printed; the unit taken is the smallest legal one.
  'unl-165': {
    effects: [
      { op: 'giveTemporary', target: { pick: 'myUnits', notTemporary: true, low: true } },
      { op: 'draw', n: 2 },
    ],
  },

  'unl-169': { unimplemented: 'Reveals an opponent\'s hand, banishes a card chosen from it, and sets a delayed ability that returns it when THEY hold — hidden-zone selection plus a delayed effect that outlives its source.' },

  'unl-173': { unimplemented: 'Killing a friendly Mighty unit is an ADDITIONAL COST that gates legality; authored as an effect the spell would be playable with no Mighty unit in play, which is a different card.' },

  'unl-179': { unimplemented: 'Triggers on moving to a battlefield (no move event) and carries a Deathknell (no death trigger event); it also looks at the top 3 and reveals from among them.' },

  // Gloomist — "When you or an ally hold, you may exhaust me to draw 1." 1v1: "you or an
  // ally" is you. The option is authored compulsory: the whole cost is exhausting a
  // legend with no other ability, so declining can never help. See the header note.
  'unl-193': {
    triggers: [{
      on: 'hold', mine: true,
      effects: [{
        op: 'cond', test: { selfReady: true },
        effects: [{ op: 'exhaust', target: 'self' }, { op: 'draw', n: 1 }],
      }],
    }],
  },

  'unl-198': { unimplemented: 'Chooses a battlefield, then "you MAY move up to one enemy unit" there — pulling an enemy into your own battlefield can hand them the showdown, so compelling it is a different card, and the grammar has no optional-effect wrapper.' },

  'unl-199': { unimplemented: 'The trigger costs a DISCARD, which is a real price, so its "you may" cannot be authored compulsory; the grammar also has no optional-effect wrapper for it.' },

  // Mirror Image — choose a unit, play a ready token copy of it to your base, Temporary.
  // A copy carries the copied card's printed characteristics, so the token is minted on
  // that card id rather than on a Reflection card that does not exist in RB.cardData.
  'unl-200': {
    effects: [{ op: 'copyToken', target: { pick: 'allUnits' }, to: 'base', ready: true, temporary: true }],
  },

  'unl-205': { unimplemented: 'Triggers when a player plays a SPELL; the engine has no spell-played event, and the reward is an optional +1 Might the controller may decline.' },

  'unl-209': { unimplemented: 'The beginningPhase trigger exists, but the reward is an optional "you may KILL a unit you control here to draw 1" — killing your own unit is a real price, so it cannot be authored compulsory.' },

  'unl-210': { unimplemented: '"While a unit here is defending alone, it has -2 Might" is a conditional continuous modifier on one unit; a battlefield static applies its might to every unit standing there, unconditionally.' },

  'unl-215': { unimplemented: 'Needs a per-turn, per-player "first time a NON-TOKEN unit is played HERE" trigger — unitPlayed carries no battlefield and no token flag, and there is no once-per-turn tracking — then an optional move.' },

  'unl-234': { unimplemented: 'Adds Energy that may only be spent during showdowns. The rune pool is a single untagged number in js/cost.js, so the ability would produce unrestricted Energy — strictly better than the card.' },

});
