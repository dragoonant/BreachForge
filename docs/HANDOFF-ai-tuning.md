# Handoff — AI tuning: sweep the evaluator weights, then build the opponent model

Written 2026-09-20 by the session that added the simultaneous move, the three difficulty
tiers and `tools/arena.mjs`.

**Next chat does two things, in this order:** sweep the existing weights (task A), then
build the opponent model (task B). A first because it is cheap and it tells you how much
headroom is left in the current evaluator before you rebuild anything.

Read `CLAUDE.md` first — rules 9, 10, 12 and 13 all bite in this work, and 12 and 13 are
newer than most of the code. Do not start a rewrite of `js/ai.js`.

---

## 0. Before you write a line: get your own worktree

**This is not optional and it is not paperwork.** This session spent a real fraction of its
budget recovering from sharing a checkout with another agent. Hard rule 12 exists because of
that afternoon.

```
git worktree add ../BreachForge-ai-tuning
```

Own index, own HEAD, shared history and object store. Put it **outside** the OneDrive folder
so it does not sync. The dev server sorts itself out — `.claude/launch.json` sets
`autoPort: true` and `tools/serve.mjs` reads `PORT` from the environment
(`tools/serve.mjs:14`), so every worktree gets its own port. Do not put a port back into
`runtimeArgs`.

What went wrong when this session shared a tree, so you can recognise it early:

- `git add js/ai.js` staged the *whole file*, including the other agent's half-finished
  hunk, and shipped a commit that threw on load.
- Their `git commit --amend` swallowed five of my files into their commit; their next amend
  spat them back out. My work was committed under their message, then uncommitted, twice,
  while I was measuring against it.
- A working copy showed **81 tests green** while the commit built from it was **69 of 81 and
  dead**. The green came from someone else's uncommitted engine.

If you are ever forced to share a tree anyway, build the commit in an isolated
`GIT_INDEX_FILE` and move the branch with `git update-ref <branch> <new> <expected-old>`,
which refuses when someone else moved it. `git reset` has no such guard and will silently
orphan their commit.

---

## 1. What exists today

### The tiers — `js/ai.js`

`RB.WEIGHTS` (`js/ai.js:19`) is one table per tier and it is the one door for how hard the
opponent plays.

| tier | what it may look at |
|---|---|
| `random` | nothing — uniform over `RB.legalActions`. The control. |
| `hard` | the board, one ply, plus the showdown that ply opens. No model of the opponent's hand. |
| `competition` | `hard` + `sandbag` (`js/ai.js:34`). |

```js
hard: {
  bfHeld: 9, bfSafety: 5, safetyScale: 5, reserveWeight: 0.55,
  unitOnBf: 1.6, unitInBase: 1.0, unitFlat: 1.5,
  hand: 2.2, rune: 1.1, energy: 0.15,
  held: 0,        // option value of a card kept for the opponent's turn — INERT, see §4
  sandbag: 0,     // what it costs to spend an answer at main-phase speed
  endTurnBar: 6, passBar: 4,
}
competition = hard + { sandbag: 40 }
```

Two functions matter beyond the table:

- **`settled(s)`** (`js/ai.js:102`) — moving onto a defended battlefield *opens* a showdown,
  it does not resolve one, so a raw one-ply evaluation sees the attackers alive on enemy
  ground and prices the arrival as a gain. `settled` runs the fight out through `RB.apply`
  before scoring. **Do not replace this with combat maths in the evaluator** — that is a
  second copy of the rules (hard rule 4) and it will drift.
- **`sandbag`** (`js/ai.js:157`) — penalises playing an `Action`/`Reaction` card in your own
  neutral open state. Zero on the chain or in a showdown, which is the whole point: the
  penalty is on the **timing**, not on the card.

### The instrument — `tools/arena.mjs`

```
node tools/arena.mjs <A> <B> [--games N] [--seedbase S] [--set k=v] [--setb k=v] [--verbose] [--cap N]
```

Plays A against B over `N` matched pairings. Each pairing is **one shuffle played twice with
the seats swapped** — same seed both times, so deck order and every draw are identical and
the only difference is which tier sat where.

**Its self-test, which you must run before trusting any number:**

```
node tools/arena.mjs hard hard --games 20
```

Two identical tiers must produce **0 shuffles won from both seats and 20 splits**. If it
shows anything else the instrument is broken, not the AI. It has been broken twice already
(see §4.1).

**How to read the output.** Ignore the game-level win rate when deciding whether a change
worked; it is padded with shuffles where going first decided the game. The line that matters
is:

```
shuffles won from BOTH seats — competition: 34   hard: 8   split: 158
paired signal 81% of 42 decisive shuffles  (a real difference needs |81 - 50| > 15)
```

A shuffle one tier won from *both* seats is a shuffle it genuinely handled better. The bar is
a two-sigma sign test over those decisive pairs and the tool prints it for you. **A result
that does not clear its own printed bar has not measured anything.**

### Where the bar currently sits

`sandbag` was held to this and you should hold task A to the same:

| seed set | games | won from both seats | signal |
|---|---|---|---|
| holdout (200) | 226–174 | 34–8 | 81% |
| confirmA (300) | 328–272 | 38–10 | 79% |
| confirmB (300) | 317–283 | 37–20 | 65% |
| ladder (80) | 81–79 | 8–7 | 53% (15 decisive — underpowered) |
| **pooled** | **952–808** | **117–45** | **72.2% ±7.9** |

Game level: **54.1% ±2.4**. Chosen on 220 shuffles, confirmed on 880 pairings it had never
seen. The `ladder` row is in the table on purpose — it disagrees, it is underpowered rather
than contradictory, and dropping it would have been cherry-picking.

---

## 2. Task A — sweep the existing weights

**Goal:** find out how much is left in the current evaluator before deciding whether task B
needs a new one.

The eleven live knobs in `RB.WEIGHTS.hard`, in the order worth trying:

1. **`unitOnBf` / `unitInBase`** (1.6 / 1.0) — the ratio is the AI's whole appetite for
   committing units. Most likely to matter, most likely to interact with the group move.
2. **`endTurnBar`** (6) — how much better than passing an action must be. Controls whether
   it wrings out a turn or bails early.
3. **`reserveWeight`** (0.55) — how much of the enemy's base it counts as able to retake a
   battlefield. This is the closest thing `hard` has to an opponent model, which makes it
   the natural bridge to task B.
4. **`bfHeld` / `bfSafety` / `safetyScale`** (9 / 5 / 5) — what a held battlefield is worth
   against how defensible it is.
5. **`hand`** (2.2) — card advantage against tempo.

**Protocol — follow it or the numbers are worthless:**

- Sweep against `hard` with `--set`, never by editing `js/ai.js`:
  `node tools/arena.mjs competition hard --games 120 --set unitOnBf=1.9`
- Sweep on **one** seedbase. Pick the winner. Then confirm it on **at least two fresh
  seedbases** with `--seedbase`, at 200+ pairings. A weight chosen and reported on the same
  shuffles is a weight fitted to those shuffles.
- Sweep knobs **one at a time** first. Only pair two once each has a confirmed solo effect.
- If a knob shows nothing, **probe whether it can reach a decision at all** before sweeping
  harder — that is what turned the dead `held` knob into the working `sandbag` one (§4.2).
- Run 4–5 arena processes in parallel; they are independent. Expect ~440 plies/s for one
  process and much less under contention — that is CPU contention, not a slow AI.

**Done when** each surviving weight change clears its printed bar on holdout seedbases it was
not chosen on, the pooled result is in the commit message as a table, and
`node tools/arena.mjs hard hard --games 20` still self-tests clean.

---

## 3. Task B — the opponent model

`competition` is 54% against `hard`: a real edge, but it is one knob on `hard`'s evaluator.
The tier is specified as "like playing a real human opponent — understands the decks, knows
how to hold back the right cards to play at the right time". Holding back is done. Two pieces
are not:

**B1 — price a position by what the opponent can still answer with. TRIED IN BOTH AIMINGS,
MEASURED WORSE, REVERTED — do not re-run it as written.** The idea was: `RB.evaluate` reads
`s.players[them].hand.length`, a *count*, and their open resources not at all, where a human
reads "they have three cards and four open power, so this attack gets punished".

The capacity itself is cheap and legitimate — how many cards they hold and how many of their
runes are unexhausted are both PUBLIC (exhausting the rune is the cost, Rule 1525), so this
needs none of the restraint machinery B2 needs. Two aimings were built and measured:

| aiming | what it did | result |
|---|---|---|
| their outs join the THREAT side of every held battlefield | discounts ground it controls | 35/36/32/32% at outs 1/2/4/8 |
| their outs discount an action that OPENS a showdown | the blind spot in `settled()` | 44/38/27/12/7% at outs 8/16/30/45/70 |

Both had reach (7.4% and 3.8% of decisions), so neither failed the §4.2 way — they failed by
working exactly as designed. The second is a clean monotone dose-response in the WRONG
direction, which is about as unambiguous as this instrument gets.

**Why, and this is the part worth keeping.** Penalising an attack by the opponent's *generic*
capacity is not what a human does. A human discounts by the chance they hold a *relevant*
answer. A scalar "they have three cards, so don't attack" just makes the AI timid, and
declining attacks means not taking battlefields, which means not scoring. Do not reach for
`reserveWeight` as the hook either — it is independently flat (0.2 → 48%, 0.9 → 49%).

The reading this leaves: a *count* of the opponent's outs is not informative enough to help at
all, and the thing that would help is knowing WHICH answers — which is B2, not B1. If you want
B1 to work, it needs the archetype or the revealed card, not the cardinality.

**B2 — play around what it has legitimately seen.** This is already written up as **T-1 in
`TODO.md`** and that entry is the spec — read it before designing anything. The constraint
that will catch you: the AI is handed the whole `state`, so every hidden card is already in
reach. The work is *restraint*, not access, and the cheating version wins more in every test
that only checks that it wins more.

Both must stay inside `RB.WEIGHTS[difficulty]` (hard rule: `casual`/`hard` must not start
reading minds) and both must still choose from `RB.legalActions` and go through `RB.apply`.

---

## 4. Traps that have already cost this codebase time

**4.1 The arena has been wrong twice, and both times it looked fine.** First it gave each
seating its own seed, so a "pairing" was two unrelated games — identical tiers scored 60/40.
Then it counted games rather than shuffles, so first-player bias counted as evidence. Run the
`hard hard` self-test at the start of every session. It is the only thing standing between you
and a confident, wrong number.

**4.2 A weight that changes nothing may be aimed wrong, not unused.** `held` moved nothing at
1/2/3/5/8. A probe showed 828 of 1,346 decisions had a playable answer and `hard` played one
202 times — so the knob had plenty of reach. It was penalising spending an answer *at all*,
including in the showdown where spending it is correct. Re-aiming it at the timing produced
the whole 72% effect. **Probe before you sweep harder.**

**4.3 A knob can saturate.** `sandbag` 40 and 70 choose byte-identically. Always test a value
well above your candidate; if it gives the same answer you are on a plateau and should take
the low end, not the edge of your sweep.

**4.4 zsh does not word-split unquoted parameters.** `for m in "competition hard"; do node
tools/arena.mjs $m; done` passes **one** argument. This silently ran a whole ladder against a
tier named `"competition hard"` — caught only because unknown tiers now throw
(`js/ai.js:119`). Pass arena arguments literally.

**4.5 Rule 13 — re-stamp after touching anything `index.html` loads.** `js/ai.js` counts.

```
node tools/stamp-assets.mjs
```

`--check` is in CI right after `check-pages`; a stale stamp fails the gate.

**4.6 Watch the latency budget.** The opponent acts on a 420 ms beat (`RB.step`, `js/ui.js`).
Current cost is **2.8 ms mean / 58 ms worst** per decision, so there is room — but task B adds
per-decision work and `settled()` already spends applies. Measure before and after; a tier
that thinks for 500 ms is a tier that feels broken.

**4.7 Never measure against a tree someone else is fixing** (rule 12). If the suite is red,
find out whose change did it *before* concluding anything about yours — build the tree you
actually mean to test with `git worktree add --detach <sha>`.

---

## 5. State as of this handoff

- `main` is green: **82 tests**, `check-pages` clean, `stamp-assets --check` clean.
- Three commits from this work: `396a1c8` (arena fixes), `2dc5aeb` (sandbag), plus the
  earlier `b98215e` (simultaneous move) and `e329c4d` (tiers + arena).
- The picker offers **Random / Hard / Competition**; `competition` is the default
  (`js/screens.js`, `index.html`).
- `DEVIATIONS.md` **D-12** records the one known limit of the group move (`MAX_GROUP = 10`).
- `TODO.md` **T-1** is task B2 and is the spec for it.

## 6. What task A settled (2026-09-20, commit 1c6472b)

**The positional weights are at a plateau and there is very little left in them.** Two knobs
moved and both are now shipped — `unitOnBf` 1.6 → 1.2 and `endTurnBar` 6 → 16, together 64.7%
±7.1 over 1600 holdout pairings against `hard`, 58.4% ±6.8 against the shipped `competition`.
The commit carries the full table. Everything else measured flat: `hand` is worse in both
directions, `reserveWeight` is flat both ways, `bfHeld` barely reaches, and `CAP = 48` is not
a lever at all (it truncates the pool in 1 decision in 647).

**Why so little is left, structurally.** The mean non-move action pool at a real decision is
**4.5**. Most of the time the AI is choosing among a handful of options with an obvious best
one, so a weight can only matter where two options are already close — which is why every
knob probes at 1–4% reach and why decisive shuffles are so rare (7–15 per 120 pairings, against
sandbag's 42 per 200). The ceiling here is one-ply depth, not the numbers in the table.

**So the remaining headroom is task B, and specifically B2.** Do not spend another session
sweeping. Two pieces of B2 are already built and were not known to be:

- `h.revealedTo` on facedown battlefield cards (`js/abilities.js:390`) is already an explicit,
  engine-maintained record of which seat legitimately saw what — exactly the record T-1
  constraint 1 asks you to build.
- It already expires correctly: `js/engine.js:649` clears it in the Ending Cleanup alongside
  every other "this turn" effect, which is T-1 constraint 2 for free.

So T-1 is mostly a matter of letting the planner read that record and nothing else. Grep the
reveal family before designing: `revealHidden` (`js/abilities.js:387`), `predict`
(`js/ops-unl.js:300`, `js/ops-ogn.js:682`), `revealTop` (`js/ops-sfd.js:617`),
`revealTopSpell` (`js/ops-unl.js:620`). Note that `predict` and `revealTop` look at your OWN
deck — they inform your draws, not their hand — so the opponent-model work hangs off
`revealHidden` and the discard effects.

**Two instruments were built for this and are worth keeping** (they live in the session
scratchpad, reproduce them in `tools/` if you want them permanently):

- a *reach probe* that walks the baseline line and computes the argmax under two weight tables
  at every decision, reporting how often the override changes the choice and on what action
  type. This is §4.2 as a tool, and it is what caught both B1 aimings being live-but-wrong
  before any arena time was spent on the second one.
- a parallel sweep driver that runs N arena jobs at a concurrency limit and prints one table
  with the printed bar already applied per row.

**One trap this session hit that is not in §4.** `preview_start` pins to the PRIMARY
checkout's `.claude/launch.json` no matter what directory the session is in, so the first
browser "verification" of this work was served `unitOnBf: 1.6` from the main tree. Serve your
own worktree explicitly (`PORT=<n> node tools/serve.mjs` from inside it) and confirm what is
actually being served before believing a browser check. Rule 9 and rule 12 meet here.

---

Start with the worktree, then the `hard hard` self-test, then **T-1**. Task A is done and
task B1 is closed; the live work is B2.
