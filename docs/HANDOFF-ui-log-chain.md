# Handoff — UI pass: log drawer, card hovers, clearer prompts, chain viewer, opponent hand

Written 2026-09-20 by the session that built and deployed the game. **Nothing in this
document has been implemented.** It exists so the next chat can start cutting code in its
first minute instead of re-reading 9,800 lines of engine.

The requests came from the first real human playtest. That matters: every one of them is a
legibility complaint, not a rules complaint. The engine is right and the player cannot see
it. Treat "the player can now see X" as the acceptance test, not "X is in the DOM".

Read `docs/grammar.md` and `CLAUDE.md` before starting. Do not start a rewrite.

---

## 0. Ground rules that will bite you

These are the five things that have broken UI work in this codebase before.

**0.1 There is no build step.** Plain browser JS, one IIFE per file onto `window.RB`, script
order declared in `index.html`. A new file must be added to that list, and `tools/check-pages.mjs`
asserts `index.html` and `tests.html` agree about the script list. It will fail the deploy gate
if you forget.

**0.2 `RB.paintBoard` rebuilds every card element on every repaint** (`js/board.js:11`). It is
called after every single action. Any UI state you store *in the DOM* inside the board is
destroyed on the next click. Store open/closed, scroll position and hover state in module
variables on `RB.ui` (see `U.sel`, `U.picks` in `js/ui.js:7-9`) or on a container that
`paintBoard` does not rebuild. `#log`, `#prompt`, `#preview` and `#spotlight` are outside the
rebuilt subtree — only their `innerHTML` is replaced — which is why `#log.open` currently
survives. Keep it that way.

**0.3 One door per rule.** This is the lesson the whole project was built on, and it applies
to UI too. If you find yourself computing "what is on the chain" from the log entries, stop —
`state.chain` is the door. Read it. You may *delay* clearing your view of it; you may not
reconstruct it from a second source. A rule with two homes is worse than a rule with none,
because one home is always subtly wrong and nothing points at it.

**0.4 The UI may not invent a rule.** Every affordance is derived from `RB.legalActions`.
None of the five items below needs a new engine rule. Item 3 needs one *optional* engine
field and item 4 needs none at all. If you find yourself adding a rule, you have misread the
task.

**0.5 Escape everything.** Card names go into `innerHTML` in several places. `js/render.js`
has a local `esc()`; `js/ui.js` does not, and `RB.paintLog` currently interpolates card names
raw. Card names are project data, not user input, so this is not a live security hole — but
item 2 adds a `data-` attribute built from a card name and that is the moment to add an
`esc()` to `js/ui.js` rather than the moment to skip it.

**Naming, since you asked:** the two contested areas in the middle are **Battlefields** in
Riftbound. "Site" is not the game's term. The code calls them `state.bf[]`, the CSS class is
`.bf`, the row is `#bfrow`. Use "battlefield" in any new player-facing string.

---

## 1. The log becomes a drawer that pulls from the right

**The complaint:** the log sits in the top-right corner, it is always there, and it cannot be
put away.

**Where it lives now**
- markup: `index.html` — `<div id="log"></div>`, inside `#boardwrap`
- style: `css/style.css:165-176` — `#log` collapsed (`max-height:6.4rem`, a CSS mask fading
  the top edge) and `#log.open` expanded (`max-height:62vh`)
- toggle: `js/board.js:65` — the `Log` button in the topbar does `classList.toggle('open')`
- content: `RB.paintLog` at the end of `js/ui.js`

**What to build.** Three states collapse to two. Kill the current half-open "battle line"
mask and make it a real drawer:

- **Closed** — nothing on screen but a pull tab on the right edge, vertically centred,
  reading `LOG` rotated 90°, about 1.6rem wide. The board gets the full width back.
- **Open** — a panel sliding in from the right edge, full board height, ~19rem wide,
  `transform: translateX(0)` from `translateX(100%)`, `transition: transform .22s ease`.

Keep the topbar `Log` button working — it toggles the same state. Add the tab as a second
way in, because a player who has closed the drawer needs an obvious way back and the topbar
button is small.

**Do not let the drawer cover the battlefields while the player is being asked to click one.**
The existing comment at `css/style.css:163` states this rule and it is a real one: `#game`
gets a `.choosing` class during a targeting prompt (`js/board.js:15-17`). Either auto-close
the drawer while `.choosing` is set, or shrink the board to make room. Auto-closing is simpler
and correct — remember the player's preference in a module variable and restore it after.

**Persist the preference across games** in `localStorage` under a key like `bf.logOpen`.
One line, and it stops the drawer re-opening every match.

**Fix the autoscroll while you are here.** `RB.paintLog` ends with
`box.scrollTop = box.scrollHeight` unconditionally. In a 6rem strip nobody noticed. In a
full-height drawer a player scrolling back to read what happened will be yanked to the bottom
on the opponent's next action. Capture `atBottom` *before* replacing the content and only
scroll if it was true:

```js
const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
box.innerHTML = lines.join('');
if (atBottom) box.scrollTop = box.scrollHeight;
```

**Also raise the entry cap.** `state.log.slice(-60)` is tuned for a strip. A drawer can show
the whole game; `-400` is fine and a full game does not reach it.

---

## 2. Hovering a card name in the log shows the card

**The complaint:** the log says a card was played and there is no way to find out what it was.

**The good news:** the preview machinery already exists and is already correct.
`RB.showPreview(anchorEl, card)` at `js/ui.js:~300` renders a `size:'preview'` card into
`#preview`, positions it beside the anchor, flips to the other side when it would run off the
right edge, and clamps to the viewport. `RB.hidePreview()` closes it. `#preview` is
`position:fixed; z-index:100; pointer-events:none` — it will float above the drawer (z-index 30)
without stealing the mouse. Board and hand cards already call it from `U.bindCard`
(`js/ui.js:~92`). Reuse it verbatim. Do not write a second preview.

**The work is in `RB.paintLog`.** It builds a `switch` of HTML strings, using
`const nm = iid => RB.cardOf(state, iid).name` to drop a bare `<b>Name</b>` in. Change `nm`
to emit a referenceable span:

```js
const nm = iid => {
  const c = RB.cardOf(state, iid);
  return '<b class="cardref" data-def="' + esc(c.id) + '">' + esc(c.name) + '</b>';
};
```

Battlefield names in the log go through `RB.card(state.bf[d.bf].cardId).name` rather than
`nm` — give those the same treatment (a small helper taking a card id) so hovering a
battlefield name in the log previews the battlefield too. There is no reason for those to be
the one dead name on the line.

**Then bind once, by delegation, not per entry.** `paintLog` runs on every repaint and
per-element listeners on rebuilt innerHTML leak. Attach two listeners to `#log` itself, once,
at startup (`RB.startGame` is the natural place, or a small `RB.initLogHover()` called from
`js/main.js`):

```js
box.addEventListener('mouseover', ev => {
  const t = ev.target.closest('.cardref');
  if (t) RB.showPreview(t, RB.card(t.dataset.def));
});
box.addEventListener('mouseout', ev => {
  if (ev.target.closest('.cardref')) RB.hidePreview();
});
```

`RB.card(id)` takes a definition id and never throws for a registered card — which is why the
attribute carries `c.id` and not the instance `iid`. An instance can be in the trash, or gone;
the *card* is always knowable. This matters: the log outlives the objects it names.

**Style `.cardref`** with a dotted underline and `cursor: help` so the player can tell which
words are hoverable. An affordance nobody can see is not an affordance.

**Touch devices:** hover does not exist. A tap on `.cardref` should show the preview and the
next tap anywhere should hide it. Cheap to add, and the game is now on the web where phones
will find it.

---

## 3. Prompts must say what the player is agreeing to

**The complaint, verbatim:** Fiora's deck shows *"Grand Duelist — Pay exhaust me?"* and that is
not enough information to answer.

**Why it reads that way.** Two separate shortfalls stack.

*First*, `js/ops-sfd.js:~208`, the `sfd.mayPay` op, builds its prompt from the **cost only**:

```js
prompt: e.prompt || ('Pay ' + costPhrase(e).replace(/^pay /, '') + '?'),
```

`costPhrase()` (`js/ops-sfd.js:~243`) returns `'exhaust me'` when the only cost is
`exhaustSelf`. So the question becomes "Pay exhaust me?" — ungrammatical, and silent about
what the player *gets*. The effect (`{op:'channel', n:1, exhausted:true}`) is never mentioned.

*Second*, `RB.paintPrompt` in `js/ui.js:~234` only falls back to the card's printed text when
`q.prompt` is **null**:

```js
(q.prompt || (src ? RB.iconHTML(RB.printedText(src.id)) : 'Choose.'))
```

So supplying a bad prompt actively suppresses the good context that was already available.

**The fix, in the project's own idiom.** There is already a describer registry —
`RB.describers[op]`, `RB.defineDescriber(op, fn)` in `js/text.js:14` — and `sfd.mayPay`
already registers one via the local `say()` helper:

```js
say('mayPay', e => 'You may ' + costPhrase(e) + ' to ' + lower(join(e.effects)));
```

That sentence is exactly what the player needs and it is already written. **Build the prompt
from the describer instead of re-deriving it from the cost.** One door. Turn "You may exhaust
me to channel 1 rune exhausted" into a direct question — "Exhaust Grand Duelist to channel 1
rune exhausted?" — by substituting the source card's name for "me" and dropping the "You may"
opener. Put that transformation in **one** helper (`RB.promptFromEffect(s, e, ctx)` in
`js/text.js`) and have `sfd.mayPay`, `ogn`'s equivalents at `js/ops-ogn.js:~815`, and the
core `may` op at `js/abilities.js:507` all call it. There are at least three places generating
these questions today and they will drift apart otherwise.

**Then show the context regardless of the prompt.** In `paintPrompt`, render the source card's
printed text *as well as* the question, not instead of it:

```
Grand Duelist
When one of your units becomes [Mighty], you may exhaust me to channel 1 rune exhausted.
→ Exhaust Grand Duelist to channel 1 rune exhausted?          [ Yes ]  [ No ]
```

The printed line answers "why am I being asked this right now?" for free, because the card's
own trigger clause *is* the reason. That covers the user's request without any engine change.
Style the printed line small and grey, the question in the existing `#cfe6ff`, buttons unchanged.

**Optional, only if a card turns up where the printed text is not enough:** add an optional
`because` field to the queue item where the trigger fires (`RB.runTriggers`), carrying e.g.
`'Kled became Mighty'`. Do not add it speculatively. Printed text covers Grand Duelist and
almost certainly covers the rest.

**Also widen the prompt box.** `#prompt` is `max-width:56rem` (`css/style.css:157`) and about
to hold three lines instead of one. Check it does not collide with the hand at 1280×800; give
it `flex-wrap` and let the buttons drop to their own line.

**Sweep for other bad prompts once the helper exists.** Grand Duelist is the one the playtest
hit; it will not be the only one. Grep for `prompt:` across `js/ops-*.js` and `js/abilities.js`
— there are roughly half a dozen — and check each one reads as a complete question. A quick
script that walks every card with a `may`-shaped effect and prints the generated prompt is
worth twenty minutes and will find the rest in one pass.

---

## 4. A chain viewer between the battlefields

**The complaint:** the chain is invisible. The prompt says "A card is on the chain. Respond,
or pass to let it resolve" (`js/ui.js:~262`) and never says *what* is on it.

**The engine side, which needs no changes.** `state.chain` is an array of items pushed at
`js/engine.js:432` (a played card), `:466` (a facedown play) and `:522` (an activated
ability). Item shape:

```js
{ iid, controller, kind: 'card' | 'ability', cardId, energy,
  to, targets, paid, fromZone, xPaid,        // cards
  ix }                                        // abilities: index into card.abilities.activated
```

`RB.chainTop(s)` (`js/abilities.js:563`) returns the last element. Items are popped by
`resolveTop` (`js/engine.js:542`) and by counters (`js/abilities.js:583`, `js/ops-unl.js:404`).

**⚠ The chain is LIFO. `chain[length-1]` resolves FIRST.** The user asked for cards "in order
for the stack, from left to right so we can see the cards resolving in order" — so the array
must be rendered **reversed**: last element leftmost. Getting this backwards produces a viewer
that is confidently wrong about the single thing it exists to show. Write the comment next to
the `.slice().reverse()` explaining why it is there, or someone will "simplify" it away.

**The hard part is that the chain is usually empty by the time you paint.** When both players
pass, `doPass` (`js/engine.js:529`) calls `resolveTop` and keeps going *inside the same
`RB.apply`*. The UI only paints between actions, so a chain built and resolved within one
apply is never seen. Against the AI you get a partial view — the AI acts on a 420ms beat
(`RB.step`, `js/ui.js:~28`), so each of its passes is a separate paint — but the final
collapse still resolves the whole chain at once.

**The right shape:** a UI-side mirror that is *slower to clear* than the engine, never a
different source of truth.

```js
// U.chainView mirrors state.chain. It is set from the live chain and is allowed to
// linger after the engine's chain empties — long enough to see the last item resolve.
// It is never built from the log: state.chain is the door (docs/grammar.md).
```

- when `state.chain.length` — set `U.chainView = state.chain.slice()`, clear any pending timer
- when it empties and `U.chainView` is non-empty — mark the view `resolving`, start a ~900ms
  timer, then clear and repaint
- new `resolve` / `counter` log entries in `soundFor` (`js/ui.js:~50`) are the natural place to
  flash the item that just left. `soundFor` already walks new log entries; add the hook there
  rather than writing a second log walker.

**Placement.** `#bfrow` is a flex row of `.bf` children (`css/style.css:138`). With exactly two
battlefields "between them" is the centre; with a third — the count is data-driven, do not
assume two — a flex child injected between siblings would shove the board around. Use an
absolutely-positioned overlay centred on `#bfrow` inside `#boardwrap` (which is already
`position:relative`, `css/style.css:120`):

```css
#chain{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:45;
  display:flex;gap:.4rem;align-items:center;padding:.5rem .7rem;border-radius:.6rem;
  background:rgba(6,9,16,.93);border:1px solid #ffca63;pointer-events:none}
```

`pointer-events:none` matters — the chain sits over the battlefields and must never eat a click
meant for one. Add it to `index.html` next to `#spotlight`, and paint it from `paintBoard` so
it stays in step with everything else.

**What each entry shows:** the card at `size:'board'`, the controller (a blue/red edge — reuse
`--accent` and the `.ctrl-them` red already in the stylesheet), and a small caption. Number
them `1.` `2.` `3.` left to right so the resolution order is stated and not merely implied.
An ability item should render its source card with a marker showing it is the *ability*, not
the card — `kind === 'ability'` with `ix` into `card.abilities.activated`. Label it
"ability" rather than silently showing the card, because a player who sees Grand Duelist on
the chain will reasonably think Grand Duelist was played.

Header line: `THE CHAIN — resolves left to right`. Say it in words. The whole feature is a
teaching aid.

**Hovering a chain entry should preview it** — `RB.showPreview` again — which means the
overlay needs `pointer-events:none` on the container but `pointer-events:auto` on the entries.
Weigh that against clicks passing through to battlefields; if it conflicts, drop the hover
rather than the click-through.

---

## 5. Show how many cards the opponent is holding

**The complaint:** no way to see the opponent's hand size.

**It already exists and is too quiet to find.** `paintSide` (`js/board.js:~120`) builds
`#them-hand` — one `.card-tiny.card-back` per card in the opponent's hand — and tucks it
*inside the rune zone*, overlapped by `-0.7rem` margins (`css/style.css:189-191`). The
playtester did not see it. That is the bug.

**What to do.** Move it out of the rune zone and give it its own place at the top of the board,
above `#side-them`, as a proper fanned row of card backs. The user asked for "at the top of the
screen" and that is also where it belongs physically: the opponent's hand is across the table
from yours.

- keep one back per card — the count is the point, and a row of five backs is read at a glance
  in a way the numeral "5" is not
- add the numeral too, small, beside the fan: `HAND 5`
- scale the fan so a large hand does not run off — tighten the negative margin as the count
  grows, or cap the drawn backs at ~10 and let the numeral carry the rest
- a slight rotation across the fan (±6°) makes it read as held cards rather than a stack
- **animate a draw if it is cheap** — a back sliding in makes "they drew" visible. If it is not
  cheap, skip it; do not build an animation layer for this (see `DEVIATIONS.md` D-7).

**Do not reveal anything.** The backs carry no identity, no tooltip naming a card, no `data-`
attribute with a card id. The opponent's hand is hidden information and the DOM is readable by
anyone with devtools. The existing code is careful about this — `paintBattlefields` only tells
the *owner* what a facedown card is (`js/board.js:~210`). Match that care.

While you are in there: the deck/trash/rune counts are currently crammed into one label as
`12R · 28D · 3T` with a `title` attribute explaining it. If the top strip is being reorganised
anyway, that is worth making legible for both players too — but it is a nice-to-have and item 5
is the request.

---

## 6. Verify, then ship

Run all of these. They are fast and they are the deploy gate:

```bash
node tools/test.mjs && node tools/check-pages.mjs && node tools/audit-card-text.mjs
```

Expect: 77 tests green, check-pages clean, audit **0 findings / 250 cards**. If the audit count
moves, you changed a describer — item 3 touches `js/text.js`, so this is a live risk. The audit
is the only automated thing that can catch a prompt change that silently altered what a card
claims to do.

Then **open the game and play a real turn.** None of these five items is testable by script;
all five are "can a human see it". Specifically:

1. Open and close the drawer. Start a targeting prompt with it open and confirm it gets out of
   the way. Reload and confirm it remembered.
2. Hover a card name in the log, and a battlefield name, and a card that has since been
   destroyed.
3. Play Fiora's deck (`sfd-205`, "Fiora, Grand Duelist" in `data/decks.js:490`), get a unit to
   5 Might, and read the prompt. It must name the trigger, the cost and the effect.
4. Play any spell and hold priority so the chain viewer is on screen. Then play two spells in
   response to each other and check the left-to-right order matches the order they actually
   resolve in the log.
5. Count the backs against the opponent's real hand size — `RB.ui.state.players[1].hand.length`
   in the console.

Ship it the usual way: commit, `git push`, Pages rebuilds on its own within a minute or two.
Live at https://dragoonant.github.io/BreachForge/ — check the console is still clean there,
because a missing script tag only fails on the deployed copy.

---

## 7. Things deliberately NOT in scope

Do not drift into these. They are known, they are recorded, and they are not what was asked:

- drag-and-drop for playing cards (D-7)
- an animation layer
- player-controlled combat damage assignment (D-10)
- separating Focus from Priority (D-4)
- the two remaining pack wrappers (D-8)
- reconstructed rune splits and champions (D-3, D-11)

If one of the five items above turns out to need one of these, say so and stop — do not
quietly expand the job.
