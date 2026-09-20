# BreachForge — plan and status

## Status — 2026-09-19, overnight build

**What plays right now:** a complete 1v1 game, start to finish, against an AI. Title screen →
deck picker (ten tournament-winning lists, one per legend) → mulligan → turns → victory or
defeat. Two battlefields, the two-currency economy, standard moves, contested battlefields,
showdowns, combat, conquer and hold scoring, and the winning-point restriction. Verified in a
browser on the real code path, not only in the suite.

**Numbers:** 166 cards registered across 10 decks · 25 tests · engine ~1,400 lines · AI beats
random play 21 of 24 games · 30 random games terminate with no dead state.

**What the previous version of this section got wrong:** nothing yet — this is the first.

### Known gaps, in the order they matter

1. **Card abilities are being authored** (three packs, by set). Until a pack lands, its cards are
   vanilla bodies: a unit's might works, its printed ability does not. `data/defects.js` plus
   load-time validation is the gate that keeps a half-authored card out of circulation.
2. **Targeting does not ask the player** (D-2). A "choose a unit" clause auto-picks. This is the
   largest interface gap and the three targeting UIs are specified but unbuilt.
3. **Generated card art** is running; `js/procart.js` paints every card until a render exists,
   and `art/manifest.js` is the switch, so a partial run is safe.
4. **Focus is not separated from Priority** (D-4).
5. **No animation layer** (D-7). The structured log already carries what one would need.

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
