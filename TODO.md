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

**Status:** half built (commit 18cacf8) · **Wanted by:** owner, 2026-09-20

> **The hand half is built; the facedown half is not, and the first "done when" below is
> unreachable.** `state.players[p].seen` + `RB.remember` + `RB.knownHeld` (js/state.js) are
> the record and its only door, written by `revealHand` and `banishFromHand`, and
> `competition` uses them to price `sandbag` by the biggest card it knows they still hold.
> The restraint is tested, and the test fails against the cheating version.
>
> What is NOT done, and why it is not a matter of trying harder: **the arena cannot see this
> feature.** 2400 pairings changed 4 shuffles, 2-2. In 40 games `revealHand` fires 5 times and
> `banishFromHand` sees a hand 14 more — about half a reveal per game — so there is not enough
> information flowing to move a win rate. `revealHidden` is worse: 5 fires in 40 games and, in
> 2932 decisions, ZERO where a seat could legitimately see an enemy facedown card. Only
> `unl-053`'s deathknell grants it.
>
> So this entry stays open, but **criterion 1 below should be struck rather than attempted**.
> Whoever picks it up: either judge it done on criteria 2 and 3, or make the reveal family
> reachable first (more cards granting it, or a deck built around one) so there is something
> to measure. Do not sweep `sandbagKnown` hoping for a number — it is not there.

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

## T-2 — Landscape on a phone needs a hand drawer, or it will never fit

**Status:** not started · **Wanted by:** owner, 2026-09-22 (opened by the phone layout work)

Portrait on an iPhone 16 Pro is done and measured (`docs/MOBILE.md`). Landscape is not: it
shows a dismissible rotate notice, and behind it a coherent-but-cramped board whose middle
scrolls. That is an honest degradation, not a finished surface.

**Why it does not fit, in numbers**

Landscape on that device is **756x352**, and the board is a vertical stack of five bands.
Measured at the landscape sizes in `css/mobile.css`:

| band | px |
|---|---|
| topbar | 34 |
| their hand | 22 |
| their side | 58 |
| battlefields (two lanes at `--card-board-w` 2.8rem + the name) | 126 |
| your side | 58 |
| your hand | 92 |
| prompt bar | 39 |
| padding + gaps | 14 |
| **total** | **443 of 352** |

Every band is already at the smallest size worth rendering, so there is no 91px to find by
shrinking. The hand is the only band that does not have to be on screen all the time.

**What to build**

The hand becomes a pull-up drawer in landscape only, the way Hearthstone's hand peeks above
the bottom edge: cards sit mostly below the fold, a tap or a swipe raises them, and playing
one drops it again. That frees 92px and the remaining 351 fits 352 with a pixel to spare.

**What must not break**

1. `#hand` is a grid row of `#game` today. Taking it out of flow is what buys the height —
   but `--chrome-bottom` is the variable the grid solves from, and `#prompt` is a real grid
   row on a phone. Move both together or the prompt bar lands under the hand.
2. **No second copy of the rules** (hard rule 4). A raised hand is a view state, like the
   chain's collapse and the choice panel's peek — it lives in `RB.ui`, never on `state`, and
   undo must never bring it back.
3. The long press must still read a card while the hand is lowered. `RB.touch.longPress` is
   bound per card in `U.bindCard` and does not care where the card is, but a drawer that
   eats `pointermove` for its own swipe will cancel the press at 12px of drift — the same
   SLOP the horizontal scroll already relies on. Decide which gesture owns the finger.
4. The rotate notice is CSS-only (`@media (orientation: landscape) and (max-height: 480px)`)
   plus one dismiss listener in `js/touch.js`. It comes out in the same commit, not before.

**Done when**

- `tools/`-side or scratch harness under an `iPhone 16 Pro landscape` viewport reports the
  same clean audit portrait does today: nothing wider than the screen that cannot be
  scrolled to, no tap target under 44px, no page errors — with the rotate notice gone.
- A hand of seven is reachable, readable and playable without the board scrolling.
- Portrait is byte-identical. The landscape rules are their own media query; portrait must
  not move by a pixel, and the desktop must not move at all.
