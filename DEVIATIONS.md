# Deviations

What is **not yet implemented as printed**. Each entry is a standing bug with an owner, not a
design choice, and it is retired in the commit that makes it untrue. Anything that plays
differently from the printed card and is not listed here is a defect to report.

Ids that do not play as they read at all live in `data/defects.js`, which takes their decks out
of circulation entirely. This file is for divergences in content that *is* offered.

---

**D-1 — Multi-domain power costs are inferred, not printed.**
The card source records a power cost as a count plus a domain list, having flattened the printed
row of domain symbols. `RB.costOf` infers: when the count equals the number of domains and there
is more than one, one power of each is required; otherwise any listed domain pays. Sixteen cards
in the pool are multi-domain and six of them carry a power cost, so this is the whole exposure.
*Fix:* source the per-symbol cost and delete the inference. A test should fail the moment a real
per-domain cost lands.
Owner: unassigned.

**D-2 — RETIRED in the core 2026-09-20; RETIRED for every resolution op 2026-09-21. What is
left is the PAYMENT path and two variable-count clauses.**
The human seat is asked to choose its targets: the question is parked on the state as a `target`
queue step, the resolution restarts with the answer pre-filled, and the player answers by clicking
the real card. `RB.offerChoice` is the one door, and everything the core resolves goes through it.

Routed through the door 2026-09-20, after a player reported Sabotage (ogn-156) appearing to do
nothing at all: `ogn.recycleFromHand` and `ogn.discardChosen`. Both choose a card out of a hand
the card has just revealed, so both pass `{ quiet: true }` — Deflect and the `chosen` trigger are
about objects on the board and firing them for a card in hand would be a rule invented here.
Their reveal surface is `revealedToMe` in `js/board.js`.

Routed 2026-09-21, after a player reported Stacked Deck (ogn-183) looking at three cards, showing
none of them and keeping one by itself: `ogn.digTop`, `unl.digUnit`, `ogn.eachBanishTopAndPlay`,
`ogn.returnSpellFromTrash`, `ogn.recycleFromTrash`, `ogn.playSpellFromTrashUnderPoints`,
`core.playFromZone`, `unl.resurrectWithin`, `unl.playFromHand`, `unl.banishFromHand`,
`ogn.readyOther`, `ogn.spendBuff`, `ogn.swapPlaces`, `ogn.eachKillsUnit`,
`unl.defenderKillsHere` and the second half of `unl.eachPlayerKills`. Half of those answer out of
a deck or a trash, which the board does not draw — the surface for those is the choice modal,
`js/choice.js`, chosen automatically by asking the DOM which options the board just painted
(CARD-LOG-AND-TARGETING-SPEC.md §10). The last two send the question to the seat that is
CHOOSING rather than the seat that is resolving, so a human defender answers for their own unit.

Routed 2026-09-27, after a card-by-card audit of every registered id: the branch a `may` or
`choose` answer picks, and every triggered, Deathknell and delayed ability, resolve through
`RB.runAsking` — they ran bare, so every choice inside them was the engine's first candidate.
A spell or ability's own choices are now DECLARED as it is played (`RB.declareChoices`,
§349 step 2) and ride the chain item, which is what lets "counter a spell that chooses X"
read what it chose. `ogn.eachKillsUnit`, `ogn.killGear` (each), `ogn.eachBanishTopAndPlay`
and `unl.discardByType` ask each seat for its own card.

**What remains, and why each one is not the same one-line change:**

1. *The payment path.* `RB.defineExtraCost`'s `pay` runs inside `apply`, not inside
   `RB.resolveAsking`, so there is nowhere for it to stop and ask. `killFriendly` and
   `discountsByKilled`/`killFriendlyRecord` (`js/cost.js`, `js/ops-unl.js`) take the cheapest
   friendly unit; the `discard` extra cost takes the last card in hand; the `spendBuff` extra cost
   takes the first buffed unit. Each is a printed decision the player does not make.
   *Fix:* make the payment solver restartable the way resolution is, then route these four.
2. *Variable-count clauses.* A `target` queue step carries a fixed `n` and `legalActions`
   enumerates combinations of exactly that many, so "you may recycle one or both" (`ogn.
   lookAndRecycle`, ogn-291), "recycle up to 4" (`ogn.recycleFromTrash` with `upTo`, ogn-212) and
   "move any number with a total Might of 8 or less" (`unl.gatherEnemies`, under
   `unl.moveEnemyGroup`, unl-054) cannot be asked. WHICH cards is now the player's in the second
   of those; HOW MANY is still the maximum, and the third still gathers greedily smallest-first.
   *Fix:* a `min`/`max` on the target step instead of a single `n`, and a Confirm button on the
   panel — CARD-LOG-AND-TARGETING-SPEC.md §9 and §12 describe both.
   Since 2026-09-27 ogn-105 Singularity, ogs-011 Flash, sfd-080 Bellows Breath and unl-054's
   gathering ask one pick at a time with a "you may" before each further one, so a player
   can stop early — but the FIRST pick is still required, so choosing none is not offered.
3. *Non-object choices are made at resolution, not declared.* A move destination (ogn-043,
   ogn-173, ogn-270, unl `moveChoosingDestination`) and a battlefield (ogn-268 Bullet Time)
   are asked as a `choose` step when the card resolves. §349 step 2 lists both among the
   choices made as the card is played. The target step's options are card ids, and a base
   has none. *Fix:* labelled, non-object options on the target step.
Owner: unassigned.

**D-3 — Rune decks are reconstructed to twelve.**
Several posted decklists record only part of the rune deck (one records none at all). A legal
deck has exactly twelve runes matching the legend's domains, so `tools/import-cards.mjs` tops the
shortfall up with basic runes of the deck's under-represented domain. The main deck, battlefields
and legend are exactly as posted. Affects seven of the ten decks; the domain split is a
reconstruction, not the list the player registered.
*Fix:* a decklist source that records the rune deck in full.
Owner: unassigned.

**D-4 — The chain is two-pass, not full priority.**
A spell goes on the chain and resolves when both players have passed once. Units and Gear resolve
immediately without touching the chain, which is correct (§356). What is missing is Focus as
distinct from priority: Focus does not pass when the chain was opened by a triggered or Add
ability.
*Add abilities — RETIRED 2026-09-29.* An activated ability made only of Add effects
(`RB.addVariants`, js/abilities.js) resolves at once, off the chain, with priority unmoved
(`RB.useAddAbility`, js/engine.js); a `[Reaction]` one is used by the payment solver when runes
and pool fall short (js/cost.js), so it pays mid-resolution and with no priority at all. Gold
(`tok-gold`), ogn-120, ogn-299, ogs-014, unl-234. tests/test-add-abilities.js.
*Fix (what remains):* separate Focus from Priority in `js/engine.js`.
Owner: unassigned.

**D-5 — RETIRED 2026-09-20.** Hidden is implemented end to end: the Hide action, the facedown
zone, playing from it at Reaction speed from the following turn ignoring base cost, losing the
card with the battlefield, and revealing an opponent's facedown cards for a turn.

**D-10 — Combat damage is assigned by the engine, not by the assigning player.**
Rule 460.2 lets the assigning player choose the order, subject to lethal-first, no overkill while
a unit remains, and Tank's "assign to me first". The engine obeys all three constraints and then
takes the cheapest kills first. A player who would rather spread damage differently cannot.
*Fix:* a queue step for damage assignment when more than one legal assignment exists.
Owner: unassigned.

**D-6 — A dulled card tilts, it does not turn ninety degrees.**
An exhausted card rotates about 7°. A quarter-turn throws the card's long side across its
neighbours and lays the printed rules text on its side at preview size — unreadable exactly when
the player zoomed in to read it. Presentation only; deliberate.

**D-7 — No animation layer.**
Cards appear and disappear between renders. The structured log already carries everything an
animation layer would need.
Owner: unassigned.

**D-8 — Mostly retired. Three wrappers remain, all load-bearing.** (2026-09-27: sfd-216
Rockfall Path added a third, over `RB.legalActions`, installed after every pack so it sits
outside ogn's — it strips a unit play to a battlefield marked "units can't be played here",
including ogn-193 Miss Fortune's open-battlefield play. The missing hook is a play-action
filter table.)
Unleashed wraps nothing; Origins keeps three (`RB.mightOf` for Buff counters and the
Assault/Shield keywords, `RB.isLethalDamage`, and `RB.legalActions` for one play restriction —
its `RB.kill` wrapper became a leave hook with D-16); Spiritforged keeps two (`RB.recycleRune`, because no
event exists for a recycled rune, and `RB.score`, because the score lock has no hook table). Each
reads only its own prefixed data. The two Spiritforged ones name the missing hook exactly, and
that is the fix. The original entry read:
`js/ops-ogn.js`, `js/ops-sfd.js` and `js/ops-unl.js` each wrap `RB.kill`, `RB.apply`,
`RB.score`, `RB.autoPick` and/or `RB.cardText` to add set-local behaviour. Each wrapper reads
only its own prefixed state fields, so three of them compose rather than double-firing, and the
suite covers it — but it is three copies of a hook the core should own, and the next pack makes
it four. The lessons' rule is "new vocabulary goes into extension files wired through hook
tables, never by editing the core"; wrapping the core is the other failure of that rule.
*Fix:* name the extension points the packs actually needed — a leaves-the-board event, a might
layer, an end-of-turn flush, a play restriction — and give each one a hook table.
Owner: unassigned.

**D-9 — RETIRED 2026-09-20. No card is partial.**
All 170 registered cards play as printed; 3 have no printed ability at all (the basic runes,
whose two abilities are the engine's payment rules). The marking machinery stays — the amber `!`,
the tooltip, the deck-tile count — because the next unauthored card should still say so on its
own face rather than play wrong quietly. The original entry read:
A card whose printed clause the grammar cannot yet express plays as its printed body and is
marked: an amber `!` on its face with the missing clause in the tooltip, the clause spelled out
at preview size, and a count on its deck's picker tile. The earlier projects in this series hid
every deck containing such a card; here that would hide all ten. `data/defects.js` is unchanged
and still hides decks containing a card that plays *wrong* rather than incompletely.
*Fix:* the five recurring blockers, in order of cards unblocked — Hidden/facedown cards; a
spell-played event; a defend event; optional additional costs at play time (Accelerate); and
conditions on continuous modifiers.
Owner: unassigned.

**D-11 — Four Chosen Champions are reconstructed.**
A legal deck names a Chosen Champion: a champion unit whose champion tag matches the legend's,
taken out of the main deck at setup and started in the public Champion Zone. The posted lists for
LeBlanc, Vex, Azir and Sivir do not record one — the deck source's payload omits it — and a deck
without a champion is both illegal and materially weaker. `tools/import-cards.mjs` fills the gap
with a champion of the legend's own name in the deck's domains (`unl-172`, `unl-150`, `sfd-177`,
`sfd-143`), and `data/abilities-core.js` authors those four. Unlike the rune reconstruction
(D-3), where the legend's domains determine the answer, **which** champion a player ran is a real
deckbuilding decision and this is a guess at it.
*Fix:* a decklist source that records the Champion Zone.
Owner: unassigned.

**D-12 — The simultaneous standard move is bounded at ten units.**
Rule 144.4 lets any number of units standard-move as one action, so the legal action space is
every non-empty subset of the units sharing a destination. `moveActions` generates that powerset
exactly, up to `MAX_GROUP = 10` movers per destination. Beyond it the powerset is abandoned for
the sets a player would actually weigh — each unit alone, and the heaviest N for every N — which
is a real, if unlikely, loss of legal actions. The bound is far outside anything observed: across
3,236 sampled main phases the most units ever ready at once was five, and 1v1 has only two
battlefields, so the worst case measured is 31 subsets per destination against a ceiling of 1,023.
*Fix:* generate the subsets lazily, so the bound can be removed without the action list growing.
Owner: unassigned.

---

The entries below were found by the card-by-card audit of 2026-09-27 (every registered id read
literally against `data/printed.js` and run on the engine) and are not yet fixed. Everything
else that audit found is fixed, by commit, on the branch that carries this text.

**D-13 — RETIRED 2026-09-27.** An op whose choice is mandatory registers a requirement
(`RB.defineRequirement`); `legalActions` withholds a spell or activated ability whose top-level
requirement fails (`RB.canDeclare`; a "choose one" needs one live mode, and only live modes are
offered), and so do the effects that play a spell out of a trash. Every counter is a predicate
over chain items (`RB.defineCounter`) and chooses among ALL matching items, top-first, declared
as the counter is played. [Equip] needs a unit to attach to; Repulse needs a friendly unit at a
battlefield. Printed choices outside these ops ("deal 3 to a unit" with no unit) are not yet
gated — each is a requirement away. The original entry read:
§13.4 step 5: a card whose required targets do not exist cannot be played. `legalActions` asks
only cost and timing, so ogn-045 Defy, unl-131 Abandon and unl-190 Lilting Lullaby ("counter a
spell") are playable with nothing on the chain, unl-106 Repulse with no friendly unit at a
battlefield, and an [Equip] ability with no unit to attach to — each spends its cost for
nothing. Related: the counters only ever consider the TOP of the chain, where "a spell" may be
any spell on it. *Fix:* legalActions probes the declaration (`RB.declareChoices` already runs
it) and withholds a play whose mandatory choice has an empty pool.

**D-14 — RETIRED 2026-09-27.** An activated ability carries `extra` additional costs:
`legalActions` checks them (`RB.extrasAvailable`), `doActivate` pays them before the ability goes
on the chain — as a restartable resolution, so `recycleFromTrash` asks which cards — and
Weaponmaster pays them too. sfd-150 and unl-158 are authored that way. The original entry read:
sfd-150 Last Rites' "[Equip] — [C], Recycle 2 cards from your trash": the recycle is an effect
of the ability, gated on two cards being there, not a cost paid on activation — so it could be
countered after the [C] was spent and before the recycle. unl-158 Shepherd's Heirloom's
"Spend 1 XP" is not spent on the Weaponmaster path. *Fix:* `ab.extra` checked in
`legalActions` and paid in `doActivate` through `RB.payExtra`, with the `recycleFromTrash`
extra cost asking which cards.

**D-15 — RETIRED 2026-09-27.** Confirmed by Core Rules §185.2.a — a token is played "following
all the applicable steps for playing a card plus any restrictions … from the effect that created
the token" — so a bare "play a … token" offers what playing a unit offers: your base or a
battlefield you control (`RB.tokenLocation`, asked on the prompt line). "To your base" and
"here" narrow it, a Hidden card played face down plays its token at that battlefield (§811, the
Origins FAQ's hidden-play answer), and a battlefield where "units can't be played" is never a
destination — a token named for one is not played. All four token ops go through it. The
original entry read: sfd-154 Guards!, sfd-198 Arise! and the ogn Recruit tokens print "play a … token" with no
location, while sfd-197 prints "to your base" — which suggests the bare form lets the player
choose any location a unit could be played to. Unconfirmed against a ruling. The core `token`
op with `to:'here'` also ignores sfd-216 Rockfall Path's "units can't be played here".

**D-16 — RETIRED 2026-09-27.** `RB.leaveBoard` and `RB.kill` both end in a core leave-hook
table (`RB.defineLeaveHook`), and ops-ogn's layers, its self-dispatched "when I leave" and its
self-recycling Deathknell moved there — so ogn's `RB.kill` wrapper is gone. The original entry
read: `RB.leaveBoard` clears the core's modifications and raises `leftBoard`, but not ops-ogn's own
layers (`ognMods`, `ognKw`) nor the leaving card's own "when I leave" (`fireLeave`), which run
only on ogn's own kill and bounce. A unit carrying an ogn might modifier that is bounced by an
unl or sfd op keeps it into its hand. *Fix:* a leave-hook table called from `RB.leaveBoard`.

**D-17 — RETIRED 2026-09-27.** A cost carries `anyPower` — Power of any domain — beside its
domain-bound `power`, and `RB.planPayment` solves it separately, so sfd-146 Vex's [A] surcharge
on a spell that already costs Power is payable in any domain. The original entry read:
sfd-146 Vex: the extra [A] follows the spell's domain when the spell already costs Power. A cost
carries one domain list for all of its Power, so on a spell that already costs Power the extra
[A] can only be paid in that spell's domains. On a spell with no Power cost it is exact (any
domain).

**D-18 — RETIRED 2026-09-27.** `RB.playCard` puts every spell on the chain, whoever played it;
one played by an effect (`byEffect`) hands priority to the other player, and "recycle it after"
happens as it resolves (`recycleAfter`). The original entry read: sfd-140 Fizz, ogn Kai'Sa's
play-from-trash and the core `playFromZone` resolve the played spell immediately
(`immediate: true`), so no player gets priority to respond to it.

**D-19 — RETIRED 2026-09-27: both readings stand, with sources.** *Open battlefield* (ogn-193
Miss Fortune, and sfd-116 Yone's `conqueredOpen`, which already agreed): the Core Rules define a
battlefield only as Controlled or Uncontrolled (§190.2.a; §184.2.b "controlled by no one") — there
is no third "open" state for rules.md's "(both)" to name — and RiftJudge's ruling on Yone played
"to an open battlefield using Miss Fortune, Buccaneer" and then conquering it only makes sense if
open means uncontrolled. *Chosen twice* (sfd-248 Ezreal, Prodigal Explorer): the published reading
is that one spell choosing two enemy units is enough, and that gear abilities do not count — which
is what `sfd.countChoice` already does (per object chosen; Spell and Unit sources only). Neither is
an official FAQ entry; if one ever contradicts either, that is a new defect.
The original entry read: ogn-193 Miss Fortune's "open battlefield" is read as *uncontrolled*
(rules.md's Battlefield row says "open (both)", which is ambiguous; the official page could not be
reached from here). sfd-248 Prodigal Explorer's "chosen enemy units and/or gear twice this turn"
counts each object chosen, so one spell choosing two counts as twice.

**D-20 — RETIRED 2026-09-27.** unl-118 Elder Dragon now records "your damage" from the core's
damage-DEALT hook (`RB.defineDamageDealt`), after prevention, so a fully prevented hit no longer
counts. `counterToHand`, the core `counter` and a resolved spell all go to the card's OWNER.
The original entry read: unl-118 Elder Dragon records "your damage" before prevention, so
a fully prevented hit still counts as yours on a unit holding other damage. `counterToHand`
and the core `counter` return or trash to the CONTROLLER, where the cards say owner.
