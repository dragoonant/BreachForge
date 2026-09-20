# BreachForge — TODO

Work that is wanted but not started. Another agent should be able to pick an entry up cold,
so each one says what exists today, what must not break, and how you know it is done.

**This is not `DEVIATIONS.md`.** That file records printed behaviour the engine does not yet
reproduce — every entry there is a standing *bug* (hard rule 1). Entries here are wanted
*improvements* to a thing that is already correct. If a card plays differently from how it
reads, it belongs in `DEVIATIONS.md`, not here.

Add entries to the bottom. Delete one in the commit that makes it true.

---

## T-1 — The competition AI should play around what it has legitimately seen

**Status:** not started · **Wanted by:** owner, 2026-09-20

Several cards let their controller look at hidden information — the opponent's facedown
cards, the top of a deck, cards in hand. The AI plays those cards and then throws the
answer away. A competitive human does the opposite: what you saw is the whole reason you
paid for the look, and it changes what you hold, what you play around, and what you keep
up for the other player's turn.

**What exists today**

- `RB.aiChoose` / `RB.evaluate` (`js/ai.js`) are one ply and stateless. The evaluator reads
  `s.players[them].hand.length` — a *count* — and nothing about its contents. Nothing in the
  AI remembers anything between decisions.
- `RB.WEIGHTS.competition` (`js/ai.js:34`) is the level this is for: `hard` plus `sandbag`,
  the option value of holding an answer for the opponent's turn. That knob is exactly the
  one revealed information should be informing, and right now it is a constant.
- The reveal family to enumerate properly when starting: `revealHidden` (`js/abilities.js`,
  "look at your opponents' facedown cards for the rest of the turn"), `predict`
  (`js/ops-ogn.js`, `js/ops-unl.js`), `revealTop` (`js/ops-sfd.js`, `js/ops-unl.js`), and
  the discard effects that show a hand on the way past. Do not guess this list — grep it.

**Constraints — read these before designing anything**

1. **The AI must not become a cheater.** It is handed the whole `state`, so every hidden
   card is already sitting in reach; the work is not *access*, it is *restraint*. Build an
   explicit record of what this seat legitimately learned and when, and let the planner read
   only that. An AI that consults `s.players[them].hand` directly is not a better opponent,
   it is a broken one — and it will look identical in every test that only checks it wins
   more.
2. **Information expires.** `revealHidden` is "for the rest of the turn"; a card seen in
   hand can be played, discarded or shuffled away. A memory that never forgets is a
   different kind of cheating. Tie each fact to how long the card that bought it says it
   lasts.
3. **Competition and above only.** `RB.WEIGHTS[difficulty]` is the one door for how hard the
   opponent plays; casual must not start reading minds.
4. **No second copy of the rules** (hard rule 4). Whatever the AI concludes, the move it
   makes still comes from `RB.legalActions` and still goes through `RB.apply`. Reasoning
   about a card it saw must not become an engine that decides what that card *would* do.
5. **1v1 only** (regime decision 3). "The opponent" is one seat; do not generalise.

**Done when**

- `tools/arena.mjs` shows the change beating the current `competition` weights over holdout
  pairings the tuning never saw — the same bar `sandbag` was held to (81% of 42 decisive
  shuffles across 200 pairings). A change that does not measure is not done.
- A test proves the restraint, not just the strength: with nothing revealed, the AI's chosen
  action is unchanged from today's; after a legitimate reveal, it differs. That test is the
  one that catches the cheating version, because the cheating version also wins more.
- Playing the deck that carries the reveal card against it, a human can *see* the AI act on
  what it saw — it holds the counter, or plays around the card it knows is coming.

---

## T-2 — The card the opponent just played should be shown full size, and linger longer

**Status:** not started · **Wanted by:** owner, 2026-09-20

`RB.spotlight` (`js/ui.js`) shows the card the opponent just played, large, for a beat — it
is the only chance the player gets to read a card that is played off-screen on the AI's
420ms action beat. It is currently shown smaller than the card the player sees when they
hover anything, which is backwards: this is the one card they did *not* choose to look at.

**What exists today**

- `css/style.css:266` — `#spotlight .card-preview{width:clamp(13rem,19vw,17rem);min-height:0}`.
  Two separate shrinks, and the second is the one that bites: the base rule is
  `.card-preview{width:var(--card-preview-w);min-height:25rem}` with
  `--card-preview-w: clamp(15rem,23vw,21rem)`, so the override makes it ~19% narrower **and**
  drops the minimum height that keeps the printed-text block open. That is why it reads as
  "cut down" rather than merely small.
- `js/ui.js`, `RB.spotlight` — visible for **1500ms**, then `.in` is removed and it fades
  over **260ms** before being hidden.

**What is wanted**

Full preview size — the same card the hover preview shows — and a longer linger. Start by
deleting the `#spotlight .card-preview` override entirely and seeing whether anything
actually needs it, rather than by picking new numbers.

**Constraints**

1. **It must never take a click.** `#spotlight` is `pointer-events:none` and that is load
   bearing — it sits over the board at `top:44%`, and a bigger card covers more of it.
2. **It has to outlive the AI's beat without stacking up.** The AI acts every 420ms
   (`RB.step`), so a longer linger means more overlap with the next action. `clearTimeout`
   already makes a second play replace the first — check what a run of three quick plays
   looks like before settling on a duration.
3. Check it at 1280x800 with the log drawer open, where the board is narrowest.

**Done when** the player can read the full printed text of a card the AI played without
pausing the game, and say so after a real match — not after a screenshot.
