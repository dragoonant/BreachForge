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

**D-5 — Hidden cards are not implemented.**
The Hide discretionary action (§811) — paying to place a card facedown at a battlefield you
control, then playing it from there at Reaction speed — has no engine support. Cards that rely
on it are marked `unimplemented` in their ability data and validation keeps them out of any
registered deck.
Owner: unassigned.

**D-6 — A dulled card tilts, it does not turn ninety degrees.**
An exhausted card rotates about 7°. A quarter-turn throws the card's long side across its
neighbours and lays the printed rules text on its side at preview size — unreadable exactly when
the player zoomed in to read it. Presentation only; deliberate.

**D-7 — No animation layer.**
Cards appear and disappear between renders. The structured log already carries everything an
animation layer would need.
Owner: unassigned.
