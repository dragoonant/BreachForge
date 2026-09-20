# BreachForge — plan and status

## Status — 2026-09-20, second session

**Every card in the game now plays as it reads.** A complete 1v1 game start to finish against an
AI, with generated art on every card and on every area of the board, and sound on every event.

| | |
|---|---|
| Cards | 170 registered — **167 authored**, 3 with no printed ability (the basic runes, whose two abilities are the engine's payment rules), **0 partial** |
| Decks | 10 of 10 offered, each with its Chosen Champion in a public Champion Zone |
| Effect grammar | 116 ops, 116 describers, and **no authored card the auditor renders nothing for** |
| Tests | 59, green in ~9s including 200 fuzzed games and 40 AI games |
| Art | 170 card renders + 4 painted board areas; battlefields paint from their own cards |
| Audio | 27 tags (15 ElevenLabs one-shots, 12 synthesized) + 4 CC0 tracks |
| AI | one-ply evaluator, beats random 21/24; its action mix includes hiding cards and answering ~150 card-driven choices per 24 games |

**What the previous version of this section got wrong:** it listed 47 partial cards and called
targeting the largest gap. The partials are gone — the fix was ten core primitives, not ten
card fixes. Targeting is still the largest gap, and is now clearly the largest.

### Primitives added this session, and what each unblocked

Hidden end to end (9 cards) · additional costs at play time, including ones that gate legality
(8) · a replacement layer (1) · Deflect as a real toll on the chooser, and every choice announced
(4) · conditions and computed values on statics through hook tables (5) · `cardPlayed`,
`spellPlayed`, `drew`, `leftBoard`, `showdownBegins`, `attack`, `defend`, `chosen`,
`becameMighty`, `becameReady` (9) · per-turn counters (3) · narrow play-location permissions (2)
· play-from-trash (2) · delayed abilities that outlive their source (1) · gates on activated
abilities (2) · combat-damage exemption and lethality hooks (2) · the Champion Zone (all 10 decks).

### Rules the audit found the engine had wrong

- **Burn Out** was logged and ignored. It is a loss condition: recycle the trash in, the opponent
  gains a point, then the draw completes — repeating until they reach the victory score.
- **The Ending Phase** was missing three of its inserted cleanup steps: all damage heals, every
  "this turn" effect expires, and *both* rune pools empty.
- **Stun** was modelled as "skip your ready step". It is 0 Might in the Combat Damage Step, full
  Might to kill, cleared in the Ending Cleanup — both stronger and weaker than what was built.
- **Recycle** shuffled instead of going to the bottom of the deck.
- **The attacker recall** was written as a comment, so a failed attack restaged forever.
- **Buffs had no duration**, so every printed permanent buff was a temporary one.
- **`scope: 'self'`** applied to every card rather than its source.

### Known gaps, in the order they matter

1. **Targeting does not ask the player** (D-2). `may` and `choose` do ask; a *target* does not —
   "choose a unit" auto-picks. This is now the largest gap by a wide margin.
2. **Combat damage is assigned by the engine** (D-10), within the printed constraints.
3. **Five wrappers remain across two packs** (D-8), each naming the hook that would close it.
4. **Focus is not separated from Priority** (D-4); **no animation layer** (D-7).

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
