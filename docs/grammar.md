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

## Additional costs (chosen as the card is played)

An additional cost is part of a card's **total cost** (§349 step 3), not an effect that happens
afterwards. A cost that gates legality — "kill a friendly Mighty unit" — authored as an effect
makes the card castable with nothing to sacrifice, which is a different card.

```js
additionalCosts: [
  { id: 'accelerate', energy: 1, power: 1, entersReady: true },        // optional by default
  { id: 'sac', optional: false, pays: 'killFriendly', mighty: true },  // gates legality
  { id: 'glory', pays: 'spendBuff', n: 1, waivesBaseCost: true },
]
```

`pays` kinds: `killFriendly` (`mighty`, `tag`) · `discard` (`n`) · `spendBuff` (`n`) ·
`recycleFromTrash` (`n`). An additional cost may also carry `effects` that run on resolution.
Every combination the player can afford becomes its own `play` action, so `a.pay` says which
were chosen; `ctx.paid` carries them into resolution.

## Play-location permissions

A unit is played to your base. `playAlso` names the battlefields it may ALSO go to — narrow, not
the blanket `playTo: 'battlefield'`:
`whereIHaveUnits` (what `[Ambush]` grants) · `whereEnemyUnits` · `whereIAmAttacking` ·
`whereIControl` · `anyBattlefield`.

## Conditions on effects

`{ op: 'when', test: <condition>, then: [...], otherwise: [...] }`. Conditions:
`beginningPhase` · `myTurn` · `inShowdown` · `eventIsUnit` · `eventIsOpponents` ·
`sourceAtBattlefield` · `{ powerSpentAtLeast: 2 }` · `{ playedThisTurnAtLeast: 2 }` ·
`{ kind: 'all', tests: [...] }`. Add your own with `RB.defineCondition`.

Per-turn state a condition or a card can read, on the player:
`playedThisTurn` (the card ids finalized this turn, in order) · `drawsThisTurn` ·
`powerSpentThisTurn` · `turnFlags.equipment` · `xp`.

## Targeting — the one door

**Every targeting decision goes through `RB.offerChoice(state, pool, n, ctx, tag, label)`.**
A pack builds its own pool — it knows what its card may legally choose — and then hands the
*ordered* pool here instead of slicing it itself:

```js
// was:  return pool.slice(0, spec.n || 1);
return RB.offerChoice(s, pool, spec.n || 1, ctx, spec.pick, spec.prompt);
```

Order the pool best-first yourself: that ordering is the card's own policy (a removal spell wants
the biggest, a sacrifice the smallest) and the core does not override it. `offerChoice` decides
only **how many** and **whether to ask**, and it is where four things happen that a picker slicing
its own pool silently skips:

1. **The human seat is asked.** The question is parked on the state as a `target` queue step and
   the resolution restarts with the answer pre-filled — so the AI answers targeting through the
   same path, a replayed game resumes mid-prompt, and a test can assert on targeting without a DOM.
2. **An answer already given is honoured**, which is what makes the restart work.
3. **Deflect is charged** to the chooser.
4. **The `chosen` trigger fires**, which several printed cards read.

## Damage — the one door

**`RB.dealDamage(state, iid, n, ctx, kind)`.** Every op that damages a unit calls this; an op that
writes `obj.damage` directly bypasses every effect that sits between a source and a unit, and the
card reading those effects plays wrong without ever looking broken. `kind` is `'effect'` for spell
and ability damage and `'combat'` for the Combat Damage Step, because several cards care which.

Statics read on the way through: `bonusDamage: 1` (effect damage only) · `preventEffectDamage`.
`RB.defineDamageLayer(fn)` adds a pack-local layer.

## Restrictions

`{ op: 'restrict', what: 'play', type: 'Spell', opponent: true }` — legality is not only cost and
timing. Checked in `legalActions`, so a restricted card is genuinely not offered; cleared with
everything else in the Ending Cleanup. `RB.restricted(state, p, what, type)` reads it.
`obj.noMoveToBase` restricts one destination rather than all movement.

## Restricted resources

`{ op: 'addRestrictedEnergy', n: 2, only: 'Spell' }` — its own bucket in `pool.tagged`, spent
**before** general Energy so it is never wasted, and unreachable by anything it does not name. One
untagged pool would make a restricted resource strictly better than the printed card.

## X costs

An `additionalCosts` entry with `x: true` and `powerEach` / `energyEach` is "pay any amount":
every affordable amount becomes its own play action, and `ctx.xPaid` is what was paid. Ops
`perX` and `damageX` read it.

## Granted keywords carry values

`obj.granted` entries may be `'Assault'` or `{ name: 'Assault', value: 2 }`, and a static may
carry `grant` plus `grantValue`. `RB.keywordValue` SUMS every instance — a unit printed with
Assault 1 and granted Assault 2 has Assault 3.

## Statics that reach the play step

`{ grantsExtra: { id, energy, power, entersReady }, tag, type, fromZone }` gives a card being
played an additional cost it does not print — "your Shurima units have Accelerate" is an option at
their play step, not a keyword they carry. `fromZone` is `'hand'` · `'champion'` · `'hidden'`, for
a clause that grants the option only to plays out of one zone; without it the grant would reach
exactly the plays some printed cards exclude.

## Replacement effects

A replacement stands **in front of** an event and takes its place — the event never happens, so
it cannot be a trigger:

```js
replaces: [{ event: 'death', kind: 'dieInstead' }]   // "if a friendly unit would die, kill me instead"
```

The first replacement that applies consumes the event, and a replacement's own kill is never
itself replaced. Add kinds with `RB.defineReplacement`.

## Costs that vary

Two modifier layers, one per kind of cost, and **both are hooks — never wrap the cost functions**:

- `RB.defineCostModifier(fn)` → `fn(state, p, iid, cost, extras)` runs inside `RB.totalCost`,
  which prices **playing a card**. It receives the additional costs the player chose, because
  several cards discount *those* rather than the printed cost.
- `RB.defineAbilityCostModifier(fn)` → `fn(state, p, iid, ab, cost)` runs inside
  `RB.abilityCost`, which prices **activating an ability**. Without it, "my ability costs 1 less
  for each …" has to be faked as several copies of the ability gated on a count — mechanically
  exact, but the auditor reads five lines where the card prints one.

`cost.forType` and `cost.forKind` (`'card'` / `'ability'`) say what is being paid for, which is
also what a restricted resource pool reads.

## Describing your own costs

`RB.defineExtraCostText(payKind, fn)` gives prose to a `pays` kind your pack defined, and
`RB.defineExtraCostNote(flag, fn)` adds a clause the cost itself carries — "and I cost 1 less for
each Energy it costs" belongs to the cost, not to the card. `RB.defineAbilityCostNote(flag, fn)`
is the same thing for an activated ability's cost, and pairs with
`RB.defineAbilityCostModifier`. A cost the auditor renders as its raw key is a clause nobody can
check.

## Gates on activated abilities

An ability's legality is not only its cost. `{ energy, power, exhaustSelf, killSelf, when }` —
`when` is a condition, and an ability whose gate does not hold is **not offered**, rather than
offered and fizzling for full price.

## The Champion Zone

Every deck names a **Chosen Champion** — a champion unit whose tag matches the legend's. It is
taken out of the main deck at setup, starts in the **public** Champion Zone, and is playable from
there all game at ordinary cost and timing. `deck.champion` is its card id;
`player.champion` is the instance while it waits.

## Hidden

`[Hidden]` in `keywords` is enough — the engine owns the whole keyword. It offers the **hide**
action (pay 1 Power, at a battlefield you control with no facedown card there), plays the card
from face down at Reaction speed **from the next turn, ignoring its base cost**, and trashes it if
you lose the battlefield. `ctx.fromHidden` tells a play from face down from a play from hand.

## Trigger events

`played` · `unitPlayed` · `cardPlayed` (any card; `event.nth` is which card this is for that
player this turn, `event.type` its type, `event.fromHidden` whether it came from face down) ·
`spellPlayed` · `drew` (`event.nth` is which draw this is this turn) · `conquer` · `hold` ·
`beginningPhase` · `endOfTurn` · `combatEnd` · `died` (any unit dies) · `leftBoard` ·
`moved` (`event.bf` destination, `event.fromBf` origin) · `deathknell` (**this** card dies — it
runs while the card is still where it died, before it reaches the trash) ·
`showdownBegins` · `attack` · `defend` (all three carry `event.bf`) ·
`becameMighty` · `becameReady` (crossings, raised once each time the value actually changes) ·
`chosen` (a spell or ability chose this unit; `event.chooser` is who chose)

**Delayed abilities** outlive their source — `{ op: 'delayed', on: '<event>', effects: [...] }`
promises a future trigger that fires even after the card that made the promise has left the board.

A trigger may carry `mine: true` (only when the event's player is this card's controller) and
`here: true` (only when the event's battlefield is this card's location).

## Selectors

`self` · `eventUnit` · `myUnits` · `enemyUnits` · `allUnits` · `hereMine` · `hereEnemy`,
or `{ pick: <selector>, n: 1, filter: 'damaged', maxMight: 3 }` for "choose a …".

## Ops in the core (js/abilities.js)

`draw` `damage` `kill` `buff` `grant` `ready` `exhaust` `channel` `addEnergy` `addPower`
`gainPoint` `discard` `recycleRune` `heal` `token` `stun` `counter` `xp` `counters` `nothing`
`playFromZone` (play a card out of your trash or deck) `swapMight` `addBattlefield`
`addShowdownEnergy` `delayed` `ransom` (counter it unless its controller pays) `counterIf`
(counter only when the chain's top matches) `payCost` `buffByCounteredCost`
`preventEffectDamage` `restrict` `replaceOn` `nameTag` (a choice over every tag printed in the
game) `withTag` `addRestrictedEnergy` `extraTurn` `perX` `damageX`

### The chain, from an op

`RB.chainTop(state)` is the item being responded to. It carries `controller`, `cardId`,
`energy` (its printed Energy cost) and `targets` — what it chose. A card that chooses at play
time declares it with `chooses: <selector>` at the top of its ability data; that is what lets a
counter read "a spell that chose exactly one of my units and no other" instead of countering
anything at all.

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

A modifier may carry a **condition** and a **computed value**:

```js
{ might: 2, scope: 'self', includeSelf: true, when: 'defendingAlone' }
{ might: { from: 'points' }, scope: 'self', includeSelf: true }   // "+1 Might per point you have"
```

**Durations.** `{ op: 'buff', n: 2 }` is **this turn** and expires in the Ending Cleanup;
`{ op: 'buff', n: 1, permanent: true }` survives. A printed "+2 Might this turn" and a printed
"+1 Might" are different cards. Granted keywords also expire at end of turn.

**Stun** is a binary status, not an exhaustion and not a Might reduction: a stunned unit
contributes **0 Might in the Combat Damage Step** but still takes damage equal to its **full**
Might to die, cannot be stunned twice, and clears in the Ending Cleanup.

**Every hook in this family has a prose twin, and a hook without one makes the auditor read back
an identifier**: `RB.defineStaticWhen` ↔ `RB.defineWhenText`, `RB.defineStaticAmount` ↔
`RB.defineStaticAmountText`, `RB.defineReplacement` ↔ `RB.defineReplacementText`,
`RB.defineExtraCost` ↔ `RB.defineExtraCostText` / `RB.defineExtraCostNote`,
`RB.defineAbilityCostModifier` ↔ `RB.defineAbilityCostNote`. If you add a hook, add its twin.

`when`: `defendingAlone` · `attacking` · `defending` · `mighty` · `{ xpAtLeast: 6 }` ·
`sourceMighty`. `from`: `points` · `xp` · `counters`. Add your own with
`RB.defineStaticWhen` / `RB.defineStaticAmount` — **never by wrapping `RB.staticsOn`**.

Other static keys the engine reads: `grant: '<Keyword>'` · `noCombatDamage` (contributes nothing
to its side's combat damage, but is no easier to kill) · `anyDamageKills` · `untargetableByEnemies`
· `deathknellExtra: 1`.

## Adding an op

Put the handler in your set's own `js/ops-<set>.js` and the describer beside it, both wired
through the hook tables so the core never needs editing:

```js
RB.defineOp('bounce', (s, e, ctx) => { /* … */ });
RB.defineDescriber('bounce', e => 'Return ' + e.target + ' to its owner\'s hand.');   // ops.bounce
```

`js/ops-<set>.js` is loaded by both `index.html` and `tests.html`, in set order, before
`data/abilities-<set>.js`.
