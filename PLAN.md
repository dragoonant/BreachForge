# BreachForge — plan and status

## Status — 2026-09-20, end of the overnight build

**What plays:** a complete 1v1 game, start to finish, against an AI, with generated art on every
card and sound on every event. Title → deck picker (ten tournament-winning lists, one per legend,
each with a readable decklist) → mulligan → turns → victory or defeat. Two battlefields, the
two-currency economy, standard moves, contested battlefields, showdowns, combat with lethal-first
damage assignment and the attacker recall, conquer and hold scoring, and the winning-point
restriction. Verified by driving a full game to a win through the real click handlers in a
browser, not only in the suite.

| | |
|---|---|
| Cards registered | 166 across 10 decks — **116 play fully as printed**, 3 have no printed ability, **47 are marked partial** |
| Effect grammar | 86 ops, 86 describers (1:1 — every op can be audited against printed text) |
| Tests | 30, green, ~9s including 200 fuzzed games and 40 AI games |
| Art | 166 generated renders, 15 MB, plus a procedural painter for anything missing |
| Audio | 27 sound tags (15 ElevenLabs one-shots, 12 synthesized) + 4 CC0 music tracks, 5.4 MB |
| AI | one-ply evaluator, beats random play 21/24 |

**What the previous version of this section got wrong:** it said the ability packs were "being
authored" and listed targeting as the largest gap. The packs landed; targeting is still the
largest gap, and the partial-card count is the number that now matters most.

### Known gaps, in the order they matter

1. **47 of 166 cards are partial** — they play as their printed body, and say so with an amber
   `!` on the card face, the missing clause in the tooltip, and a count on the deck-picker tile.
   The recurring reasons, which is where the next session's leverage is: **Hidden/facedown cards**
   (D-5, no engine support at all), **a spell-played event** and **a defend event** (several cards
   each, both cheap to add), **Accelerate and other optional additional costs at play time** (no
   cost hook), and **conditional continuous modifiers** ("while defending alone") — the statics
   layer carries fixed numbers with no condition.
2. **Targeting does not ask the player** (D-2). A "choose a unit" clause auto-picks the highest
   might. `may` and `choose` DO ask; a target does not. This is the largest interface gap.
3. **Three ability packs wrap core functions** (`RB.kill`, `RB.apply`, `RB.score`, `RB.autoPick`,
   `RB.cardText`) from their own ops files, each reading only its own prefixed data so they
   compose rather than double-fire. It works and it is tested, but it is three copies of a hook
   the core should own. Debt, logged as D-8.
4. **Focus is not separated from Priority** (D-4).
5. **No animation layer** (D-7).

### Deliberate scope decisions

- **1v1 only.** More than two seats breaks the zero-sum identity the evaluator relies on.
- **Printed text on the card face**, from a switchable pack; the describer is the auditor.
- **Not deployed.** This runs from a local server (`node tools/serve.mjs`) or `file://`.
  Publishing is a separate, deliberate decision, made later, with its own commit.

---

## Architecture

No build step. Plain browser JS, IIFEs on one `window.RB`, script order declared in
`index.html`; `tools/check-pages.mjs` asserts `tests.html` loads the same engine files in the
same order.

**The engine surface is exactly three functions** — `RB.legalActions(state)`,
`RB.apply(state, action)` (immutable; it deep-copies), `RB.isTerminal(state)` — plus
`RB.whoActs(state)`, the one answer to whose input is needed. Every UI affordance and every AI
move derives from `legalActions`; neither can invent a rule.

**The cleanup loop is the state machine.** Riftbound never *declares* a showdown: moving a unit
onto a battlefield you do not control applies Contested, and a cleanup — which runs after every
action until the state stops changing — stages the showdown and opens it. Combat, deaths, control
changes, and the victory check all live there too.

| file | what it owns |
|---|---|
| `js/rng.js` | seeded RNG; `peekRandom` for callers outside `apply` |
| `js/cards.js` | registry, load-time validation, the defects gate |
| `js/state.js` | state shape, setup, zones, the derived predicates |
| `js/cost.js` | the two-currency payment solver |
| `js/abilities.js` | the effect interpreter and the core ops |
| `js/combat.js` | showdown close, damage assignment, combat result |
| `js/engine.js` | legalActions / apply / turn structure / cleanup |
| `js/text.js` | the describer — the **auditor**, not the card face |
| `js/ai.js` | one-ply evaluator |
| `js/procart.js` `js/render.js` `js/board.js` `js/ui.js` `js/screens.js` | interface |
| `js/audio.js` | every audio decision, one `AudioContext` |
| `js/bugreport.js` | the black box |

## Tools

```bash
node tools/serve.mjs            # play it: http://localhost:8777
node tools/test.mjs             # the suite; --quiet --filter <name> --full
node tools/check-pages.mjs      # the deploy gate
node tools/import-cards.mjs     # regenerate data/ from scratch/
node tools/replay-report.mjs --selftest        # the black box, proven
node tools/replay-report.mjs <trace.json>      # ILLEGAL / THREW / DIVERGED
node tools/gen-art.mjs --dry-run               # the art plan, free
```

## Next session

Close the ability packs, then build the targeting UIs (D-2) — that is the difference between a
game that plays and a game that plays *as printed*. After that, Focus (D-4) and the animation
layer (D-7).
