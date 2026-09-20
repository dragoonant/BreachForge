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

`played` · `unitPlayed` · `conquer` · `hold` · `beginningPhase` · `endOfTurn` · `combatEnd` ·
`died` (any unit dies, from anywhere on the board) · `moved` (a unit finishes a move;
`event.bf` is the destination, `event.fromBf` the origin) · `deathknell` (**this** card dies —
it runs while the card is still where it died, before it reaches the trash)

A trigger may carry `mine: true` (only when the event's player is this card's controller) and
`here: true` (only when the event's battlefield is this card's location).

## Selectors

`self` · `eventUnit` · `myUnits` · `enemyUnits` · `allUnits` · `hereMine` · `hereEnemy`,
or `{ pick: <selector>, n: 1, filter: 'damaged', maxMight: 3 }` for "choose a …".

## Ops in the core (js/abilities.js)

`draw` `damage` `kill` `buff` `grant` `ready` `exhaust` `channel` `addEnergy` `addPower`
`gainPoint` `discard` `recycleRune` `heal` `token` `stun` `counter` `xp` `counters` `nothing`

Each takes `n` (default 1), most take `target`, `draw`/`discard` take `opponent: true`.

### Optionality and modes — never approximate these

```js
{ op: 'may', prompt: 'Ready me?', effects: [ … ], otherwise: [ … ] }
{ op: 'choose', options: [ { label: 'Draw 1', effects: [ … ] },
                           { label: 'Deal 2 damage', effects: [ … ] } ] }
```

Both open a queue step that the human answers on the prompt line and the AI answers through
`legalActions`, so there is exactly one place that knows what "may" means. A printed "you may"
authored as a compulsion is the wrong card; use `may`.

### Tokens

`{ op: 'token', cardId: 'tok-sand-soldier', might: 2, to: 'here' | 'base', ready: true,
   temporary: true }`. Token ids: `tok-sand-soldier` `tok-gold` `tok-reflection` `tok-bird`
`tok-sprite` `tok-mech`. `might` overrides the token's own, because several cards make the same
token at different sizes.

## Continuous modifiers (`statics`)

Any permanent may carry them, not just battlefields. `RB.staticsOn(state, iid)` asks every
static in play whether it reaches that card, in one place, with a reentrancy guard.

```js
statics: [ { might: 1, scope: 'here' },              // units standing on this battlefield
           { might: 2, scope: 'hereMine' },          // …that I control
           { grant: 'Ganking', scope: 'mine' },      // every unit I control, anywhere
           { might: -2, scope: 'here', tag: 'Mech' } // only cards with that tag
         ]
```

`scope` is `here` (default) · `hereMine` · `mine` · `all` · `self`. A static never applies to its
own source unless it says `includeSelf: true` or `scope: 'self'`.

## Adding an op

Put the handler in your set's own `js/ops-<set>.js` and the describer beside it, both wired
through the hook tables so the core never needs editing:

```js
RB.defineOp('bounce', (s, e, ctx) => { /* … */ });
RB.defineDescriber('bounce', e => 'Return ' + e.target + ' to its owner\'s hand.');   // ops.bounce
```

`js/ops-<set>.js` is loaded by both `index.html` and `tests.html`, in set order, before
`data/abilities-<set>.js`.
