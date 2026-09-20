# The effect grammar

Cards are pure data. `data/cards.js` carries the printed stats (generated, never hand-edited);
`data/abilities-<set>.js` carries the mechanical data that makes a card *play*, keyed by the same
id. `js/abilities.js` is the interpreter, `js/text.js` is the describer — and the describer is the
**auditor**: `tools/audit-card-text.mjs` generates prose from the ability data and diffs it against
the printed text, which is how a clause that was silently dropped becomes visible.

**A new op is three things: a handler, a describer, and a test.** Validation rejects an op with no
handler, and `RB.cardText` throws on an op with no describer, so neither can be forgotten.

## Shape

```js
RB.registerAbilities({
  'ogn-192': {
    keywords: [ 'Action', { name: 'Assault', value: 2 } ],
    playTo: 'battlefield',                 // units only; default is the base
    triggers: [ { on: 'played', effects: [ { op: 'draw', n: 1 } ] } ],
    activated: [ { energy: 1, exhaustSelf: true, tags: ['Reaction'],
                   effects: [ { op: 'addEnergy', n: 1 } ] } ],
    statics:  [ { might: 1 } ],            // battlefields: applies to units standing here
    effects:  [ { op: 'damage', n: 2, target: { pick: 'enemyUnits' } } ],   // spells
  },
});
```

Every registered card needs an entry, even a card with no abilities at all — use
`{ vanilla: true }`. A clause the grammar cannot express is `{ unimplemented: 'why' }`, which
validation rejects from any registered deck, so it fails loudly instead of playing wrong quietly.

## Trigger events

`played` · `unitPlayed` · `conquer` · `hold` · `beginningPhase` · `endOfTurn` · `combatEnd`

A trigger may carry `mine: true` (only when the event's player is this card's controller) and
`here: true` (only when the event's battlefield is this card's location).

## Selectors

`self` · `eventUnit` · `myUnits` · `enemyUnits` · `allUnits` · `hereMine` · `hereEnemy`,
or `{ pick: <selector>, n: 1, filter: 'damaged', maxMight: 3 }` for "choose a …".

## Ops in the core (js/abilities.js)

`draw` `damage` `kill` `buff` `grant` `ready` `exhaust` `channel` `addEnergy` `addPower`
`gainPoint` `discard` `recycleRune` `heal` `token` `nothing`

Each takes `n` (default 1), most take `target`, `draw`/`discard` take `opponent: true`.

## Adding an op

Put the handler in your set's own `js/ops-<set>.js` and the describer beside it, both wired
through the hook tables so the core never needs editing:

```js
RB.defineOp('bounce', (s, e, ctx) => { /* … */ });
RB.defineDescriber('bounce', e => 'Return ' + e.target + ' to its owner\'s hand.');   // ops.bounce
```

`js/ops-<set>.js` is loaded by both `index.html` and `tests.html`, in set order, before
`data/abilities-<set>.js`.
