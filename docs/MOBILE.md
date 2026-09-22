# The phone

Drawn for an **iPhone 16 Pro**: 402x874 points, of which **402x681** is left once Safari's own
chrome is on screen, a Dynamic Island above and a home indicator below.

Everything here lives in two files — `css/mobile.css` (last in the cascade, every rule inside a
media query) and `js/touch.js` — plus class hooks in the modules that had been styling
themselves inline. **No affordance is invented here.** `RB.legalActions` still decides what can
be tapped and `RB.apply` still decides what it does; this layer changes *size*, *place* and
*gesture*, and nothing else. `RB.whoActs` is still the one answer to whose input is needed.

---

## 1. Portrait is the supported orientation

The board is a vertical stack — their hand, their side, the battlefields, your side, your hand —
and a phone on its side has room for four of the five. Landscape shows a **dismissible** rotate
notice and, behind it, the same rules at tighter sizes with a scrolling middle. The drawer that
would make landscape a real surface is `TODO.md` T-2, with the measurements that say why.

This is a product decision, not a limitation: portrait is what the board's shape asks for.

## 2. The three things a phone does not have

### No hover
The board's whole read is `RB.showPreview`, bound to `mouseenter`. On iOS a **tap fires
`mouseenter` before the click**, so on a phone that flyout is not merely absent — it opens on
every tap and hangs over the board until the next one.

`RB.touch.coarse` (the primary-pointer media query, upgraded to `true` by the first real
`touchstart`) decides which read a card gets. On a coarse pointer `U.bindCard` binds no mouse
listeners at all and binds `RB.touch.longPress` instead: **press and hold any card anywhere** —
hand, board, battlefield, champion zone, chain, log, pile, deck list — and it opens full size in
`RB.inspect`. A laptop with a touchscreen reports a fine pointer and keeps its flyout.

The press cancels on 12px of drift (so the hand still scrolls) and on `pointerup` before 340ms
(so a tap is still a tap). When it fires it eats exactly one click, because the browser sends one
anyway and it would otherwise play the card the player only wanted to read.

### No tooltip
`title` is where the board says *why* a card cannot be played. A finger never sees it, so
`U.noteFor` puts that sentence — from `RB.whyCannotPay`, the same one home the desktop tooltip
asks — under the card in the inspector.

### No width
402px against a desktop's 1280. Every fixed column in the side rows had to narrow, and a
**48px board card cannot carry a name, a subtitle, a type line and two keyword names**. It keeps
what *locates* a card: art, name (2 lines, clamped), cost, might and keywords. Everything else is
one press away — which is the trade the inspector exists to make. The hand keeps its type line,
because a hand card is being *chosen* rather than located.

## 3. Tap, and what claims it

`U.bindCard` splits into two jobs. `bindAction` returns whether a tap now **commits or selects**
something; when it returns false on a coarse pointer, the tap goes to the inspector instead.

> **Tap an actionable card to act. Tap anything else to read it. Press and hold to read
> anything, including what you could act with.**

Reading changes no game state, so this is still `CARD-PRESENTATION-SPEC` §0.5 — tapping a card
never changes the game. Without it most of the board is dead to a finger, and a card you cannot
act on is exactly the card you most want to read.

## 4. What measurement decided

Numbers that were found by measuring the real page under the real viewport, not by eye. Each one
was a visible fault first.

| Symptom | Cause |
|---|---|
| Mute, **Log** and the bug button rendered at x=375..503 — unreachable, not merely clipped | Mobile font boosting rendered `.7rem` labels at ~2.5x. Fixed by `text-size-adjust: 100%`; the board solves its own type from the viewport already. |
| The **base row drawn as nothing at all** | Four fixed side columns over-subscribed 402px and `minmax(0,1fr)` solved to zero. The columns are all narrower now, and the base scrolls sideways. |
| 17px of pile clipped off, counts and all | A two-row rail wants 139px of side against the legend's 104, and the board then asks for **505px of the 448 it has** — so the grid shrank the auto rows. One row costs the base 45px of width, which it scrolls, and nothing else. |
| The piles solved to 45px and the base to 152 | `.side` children are `legend, piles, base, runes` in DOM order, and auto-placement follows the DOM. Naming the columns in any other order puts the *piles* in the flexible track. |
| The last two hand cards simply gone | `overflow: hidden` on a row 483px wide in a 402px screen. It scrolls now, with `justify-content: safe center` — plain `center` overflows in **both** directions and the first card cannot be scrolled back to. |
| The **Play** button off the right edge of the screen whose only job is to start a game | The deck-picker header was one `nowrap` flex row. |
| "BREACHFORGE" 63px wider than the screen | 4.2rem at .12em of tracking. |
| The power cost `◈◈◈` clipped off the card face | `3 ◈◈◈` is 56px of a 54px card. The pip shrinks; the glyphs are **not** counted instead, because one renderer draws all three sizes. |
| The spotlight covering the whole screen in landscape, every time the opponent played | A preview card is 304x400 and a phone on its side is 352 tall. Scaled with a transform, never resized — the card's 25rem minimum is what holds its plate at the bottom of the face. |

## 5. The rules this layer is bound by

- **Hard rule 3.** `js/touch.js` is in `tools/ui-only.json`, so `tests.html` does not load it and
  `check-pages` still asserts the two pages carry the same engine in the same order. It contains
  no `if (!RB.x)` fallback: `RB.touch.coarse` is read on the first paint and a missing module
  throws there.
- **Hard rule 13.** `css/mobile.css` is a declared asset and carries the hash of its own
  contents. `stamp-assets.mjs --check` is the gate.
- **Inline styles are the enemy of a media query.** An inline style outranks one, so every
  control this layer has to resize — the topbar buttons, the prompt buttons, the score labels,
  the turn line, the rune pool, the deck-picker List button — moved out of `style.cssText` and
  into a class. That extraction is a pure refactor: the desktop board is **pixel-identical**.

## 6. How to verify a change here

Rule 9 means a browser, and for this layer it means a phone-shaped one. Drive the real page under
an `iPhone 16 Pro` viewport (Playwright's device descriptor, both orientations) through title →
deck picker → mulligan → a played game, and assert three things on every screen:

1. nothing wider than the viewport that no ancestor can scroll to — ignoring a drawer parked off
   the edge by a transform, and ignoring vertical scroll, which is not a fault;
2. no button under 44px, which is Apple's minimum touch target;
3. zero page errors.

Then check the gestures themselves, because they are the part that has no CSS to inspect: a long
press opens the inspector, a tap dismisses it, and a tap on a card with no legal action reads it.
