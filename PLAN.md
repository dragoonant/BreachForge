# BreachForge — plan and status

## Status — 2026-09-20, third session

**Twenty decks, twenty distinct legends, across all six domains.** A complete 1v1 game start to
finish against an AI, with generated art on every card and on every area of the board, sound on
every event, and the player choosing their own targets.

| | |
|---|---|
| Decks | **20**, all legal — one legend each, 12 runes, 3 battlefields, a Chosen Champion in a public zone |
| Cards | **264 registered** (256 + 8 tokens); **all 264 have art**, nothing falls back |
| Authoring | 237 authored at the start of this session; the last 16 are being closed against ten new primitives |
| Effect grammar | 150+ ops, one describer each, and no authored card the auditor renders nothing for |
| Tests | 69, green in ~10s including 200 fuzzed games and 40 AI games |
| AI | one-ply evaluator; 40 games across all 20 decks complete with no failures, and it beats random play 19/20 |

**What the previous version of this section got wrong:** it described ten decks and 170 cards, and
listed targeting as the largest remaining gap. There are twenty decks now, and targeting is done.

### The two things a session should know about how this code is shaped

**One door per rule, and the door is the point.** The recurring failure in this project has not
been a wrong card — it has been a *second path around a rule*. Damage written directly to
`obj.damage` skips prevention and bonus layers. A target pool sliced in a pack skips the player,
Deflect, and the `chosen` trigger. A token pushed into `RB.tokenData` skips whatever builds a work
list from `data/tokens.js`. Each of those looked fine and played wrong. The doors that now exist:
`RB.dealDamage`, `RB.offerChoice`, `RB.defineToken`, `RB.staticsOn`, `RB.totalCost`,
`RB.isLethalDamage`, `RB.combatMightOf`, `RB.keywordValue`, `RB.settle`.

**Primitives, not card fixes.** Twice now a large block of cards has been stuck — 47, then 16 —
and both times the answer was roughly ten missing engine concepts, not N card problems. When a
pack reports a card it cannot author, the reason it gives is usually the name of the primitive.

### Known gaps, in the order they matter

1. **Combat damage is assigned by the engine** (D-10), within the printed constraints — lethal
   first, no overkill, Tank first. A player who would spread damage differently cannot.
2. **Five wrappers remain across two packs** (D-8), each naming the hook that would close it.
3. **Focus is not separated from Priority** (D-4).
4. **No animation layer** (D-7). The structured log carries everything one would need.
5. **Eleven of twenty decks have a reconstructed Chosen Champion** (D-11) and seventeen have a
   reconstructed rune split (D-3), because the decklist source records neither in full.

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
