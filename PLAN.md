# BreachForge — plan and status

## Status — 2026-09-20, fourth session

**Every card in all twenty decks plays as printed, and the audit agrees.**

| | |
|---|---|
| Decks | **20**, twenty distinct legends, all six domains, every one legal |
| Cards | **264 registered** (256 + 8 tokens); **all have art**; **0 partial** |
| Authoring | Origins 96 · Spiritforged 68 · Unleashed 84 · 3 vanilla (the basic runes) |
| Audit | `tools/audit-card-text.mjs`: **0 findings across 250 cards** |
| Grammar | ~180 ops, one describer each, every hook with a prose twin |
| Tests | 76, green; `--full` 25s including 200 fuzzed games and the targeting soak |
| AI | beats random 22/24 across all twenty decks |

**What the previous version of this section got wrong:** it listed sixteen partial cards and
five wrappers. The partials are gone, and the wrappers are down to the two that name the hook
that would close them.

### The lesson this session taught, three times over

**A rule with two homes is worse than a rule with none**, because one home is always subtly
wrong and nothing points at it. Each of these was found by a card pack, not by a test, and each
had been shipping:

- A **Buff** was a Might modifier in one field and a spendable counter in another, with the rule
  tying them together in a *pack wrapper* — so a unit buffed by one pack granted Might that a
  cost printed by another could not see.
- **Damage** was written straight to the object in eleven places, each one stepping over damage
  prevention and the bonus-damage layer.
- A **target pool** was sliced inside each pack, skipping the player, Deflect and the `chosen`
  trigger — which is why targeting did not ask until all three packs routed through one door.
- A **pack wrapper** around `RB.additionalCost` dropped an argument the core later added, and
  broke zone-scoped grants for the whole project.

`tools/check-pages.mjs` now greps for the two bypasses that have actually happened. The rest is
convention, written into `docs/grammar.md`.

### Known gaps, in the order they matter

1. **Combat damage is assigned by the engine** (D-10), within the printed constraints.
2. **Two pack wrappers remain** (D-8): `RB.recycleRune` (no event exists for a recycled rune) and
   `RB.score` (the score lock has no hook table). Both name their own fix.
3. **Focus is not separated from Priority** (D-4).
4. **No animation layer** (D-7).
5. **Eleven of twenty decks have a reconstructed Chosen Champion** (D-11) and seventeen a
   reconstructed rune split (D-3) — the decklist source records neither in full.

### The publication decision — owner, 2026-09-20

Both of Riot's policies were read and recorded in `docs/sources.md` before this was decided, and
what they say is written there plainly, including the three prohibitions this project sits
against. **With that in front of him, the owner chose to deploy publicly**, on the stated basis
that if Riot asks for it to come down, it comes down.

Recorded here with the date so nobody re-opens it. `docs/takedown.md` holds the contact and the
two commands that end the deployment, so the undertaking is a ten-second operation rather than a
good intention.

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
