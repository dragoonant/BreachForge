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

**D-2 — "Choose a unit" does not ask the player.**
A clause that chooses a target resolves against the best candidate by a stated rule
(`RB.autoPick`: highest might among the filtered pool) instead of opening a targeting prompt.
The engine already models `pendingChoice` as a queue step; the three targeting UIs from
`CARD-LOG-AND-TARGETING-SPEC.md` are not built yet.
*Fix:* build the targeting UIs and route every `{ pick: … }` selector through a queue step.
Owner: unassigned. This is the largest single gap in the interface.

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
immediately without touching the chain, which is correct (§356). What is missing is Focus's
distinct behaviour: Focus does not pass when the chain was opened by a triggered or Add ability,
and `[Reaction]` Add abilities may be used mid-resolution with no priority at all.
*Fix:* separate Focus from Priority in `js/engine.js` and add the Add-ability window to the
payment path.
Owner: unassigned.

**D-5 — Hidden cards are implemented; reading an opponent's facedown cards is not.** *(retired
in part, 2026-09-20.)* The Hide action, the facedown zone, playing from it at Reaction speed from
the following turn ignoring base cost, and losing the card with the battlefield all work. What
remains missing is granting a player visibility of an *opponent's* facedown cards, which one card
asks for; it stays `unimplemented` and says so on its own face.
Owner: unassigned.

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

**D-8 — Ability packs wrap core functions instead of extending a hook table.**
`js/ops-ogn.js`, `js/ops-sfd.js` and `js/ops-unl.js` each wrap `RB.kill`, `RB.apply`,
`RB.score`, `RB.autoPick` and/or `RB.cardText` to add set-local behaviour. Each wrapper reads
only its own prefixed state fields, so three of them compose rather than double-firing, and the
suite covers it — but it is three copies of a hook the core should own, and the next pack makes
it four. The lessons' rule is "new vocabulary goes into extension files wired through hook
tables, never by editing the core"; wrapping the core is the other failure of that rule.
*Fix:* name the extension points the packs actually needed — a leaves-the-board event, a might
layer, an end-of-turn flush, a play restriction — and give each one a hook table.
Owner: unassigned.

**D-9 — Forty-seven cards are partial, and say so.**
A card whose printed clause the grammar cannot yet express plays as its printed body and is
marked: an amber `!` on its face with the missing clause in the tooltip, the clause spelled out
at preview size, and a count on its deck's picker tile. The earlier projects in this series hid
every deck containing such a card; here that would hide all ten. `data/defects.js` is unchanged
and still hides decks containing a card that plays *wrong* rather than incompletely.
*Fix:* the five recurring blockers, in order of cards unblocked — Hidden/facedown cards; a
spell-played event; a defend event; optional additional costs at play time (Accelerate); and
conditions on continuous modifiers.
Owner: unassigned.
