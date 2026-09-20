# Lessons from Crystal Wars — starter guide for the next game

Distilled from building Crystal Wars: a browser reproduction of the Final Fantasy Trading Card
Game's mechanics, played against an AI, with original art and sound. This is the **third**
document in the series. `CARD-GAME-LESSONS.md` (MegaRobotWar) came first, `CARD-GAME-LESSONS-2.md`
(Starbound Legions / Star Wars: Unlimited) second. Every rule in both still applies; this file
records what the third project confirmed, what it reversed, and — the part worth reading twice —
**what it got wrong that the second project got right**. Where the three disagree, the later
document wins, because it is the later evidence.

The next project is a reproduction of **Riftbound**, Riot Games' League of Legends trading card
game, under the same posture. §11 says what changes for it, and §10 says what changes because the
rights holder is **Riot** — which is the one genuinely new variable in this series, because Riot,
unlike the previous two publishers, has *published* a fan-content policy that speaks directly to
projects like ours. Read §10.1 before you form an opinion, and §10.2 before you argue with the
owner about it.

The good news for the engineering: Riftbound is a TCG, so more transfers than usual — hand, deck,
stack-like chain, priority, card-as-data, the whole content loop. The new shapes are **locations
you fight over**, **two resources with different payment mechanics**, and **a score race rather
than a damage race**.

Copy into the new repo root on commit one, and point `CLAUDE.md` at all of them:
`CARD-GAME-LESSONS.md`, `CARD-GAME-LESSONS-2.md`, this file, plus the three binding UI specs
(`CARD-PRESENTATION-SPEC.md`, `CARD-LOG-AND-TARGETING-SPEC.md`, `CARD-FANNING-SPEC.md`), which are
written game-agnostically and were binding for both of the last two projects.

Nothing here is legal advice. It is the record of the posture one hobby project took, the
reasoning behind it, and the engineering that makes the posture cheap to keep.

---

## 1. What the project became, and the calibration numbers

Six days, 2026-09-07 to 2026-09-12. 71 commits, 12 merged pull requests (numbered to #13).

| | Starbound Legions (project 2) | Crystal Wars (project 3) |
|---|---|---|
| Days / commits | 10 / 149 | 6 / 71 |
| Content | 2,277 registered cards, 212+200 authored | 406 cards, **all 406 authored**, 20 tournament decks |
| Tests | 252 | 444 |
| Code | ~43,000 lines | ~12,200 js + 7,700 data + 8,000 tests |
| Art | 800+ card renders, drawn SVG board | 406 card renders, 8 board paintings, 3 screen backdrops |
| Audio | generated SFX + 5 music tiers | 4 CC0 music tracks, **no SFX at all** |
| Shipped | GitHub Pages, live | **never deployed** |
| AI | full measurement harness, 760-game profile runs | harness built, **matrix never completed once** |

Read that table as the scheduling lesson. Project 3 authored a *higher proportion* of its pool and
proved it card-by-card against printed text — which is where the six days went — and paid for it
by never reaching deploy, sound effects, animation, or a single trustworthy AI measurement. That
was the right trade for the owner's stated priority (fidelity first), but it has to be a **stated**
trade in PLAN.md, not a discovery at handoff.

**The PR arc**, because the next project will follow a similar one: AI defers to the engine's
`whoActs` (#1) → title-screen and board interaction fixes (#2) → **cards show their printed text,
plus 27 card fixes** (#3) → **the fidelity backlog closed: 65 real defects** (#4) → How-to-play
(#5) → board layout rebuilt (#6) → prompts/inspector/card back/rename (#7) → **the AI was never
loaded in the live page** (#8) → four Summons play as printed + action-choice labels (#9, #10) →
playmat art, card zoom, pre-picked deck (#12) → screen music (#13).

Note what that arc is mostly made of: **presentation and fidelity, not engine**. The engine core
(stack, priority, CP, combat, damage zone, EX Burst, Limit Break, Warp) landed in two days and
needed comparatively little rework. Budget accordingly: the engine is the part you know how to
build now; the interface and the card-by-card fidelity are the part that consumes the project.

---

## 2. The owner's standing instructions

These are drawn from what was actually asked for during the project, not invented. Treat them as
defaults for the next one, and re-confirm anything marked **decide again**.

1. **"Make absolutely sure the cards read and play exactly like the real game."** Fidelity is the
   product. A divergence from printed behaviour is a **defect to fix**, never a design choice and
   never a deviation to document. DEVIATIONS.md records only what is not yet implemented, each
   entry a standing bug with an owner.
2. **"I don't want anything playable that contains content that doesn't work correctly."** This
   produced `data/defects.js`: a list of ids that do not yet play as they read, and the deck picker
   hides any deck containing one. At its worst only 1 of 20 decks was offered. Deleting an entry is
   the whole of putting its decks back. **Build this gate on day one** — it converts "we have bugs"
   into "these are out of circulation until fixed", which is both honest and shippable. Keep it
   after it empties.
3. **Show the player the real thing.** Printed text verbatim, printed icons rendered as icons, and
   never generated paraphrase on a card face (see §3.1 — this reversed a rule from the earlier
   projects).
4. **Verify in the real app, not just in the suite.** Every UI commit message in this repo ends
   with what was checked in a browser on the real code path. Green tests plus a broken page
   happened twice (§3.2) and both times the suite was green throughout.
5. **The interface should be beautiful and explained.** Painted art for every area of the playmat,
   screen backdrops, music on every screen, a How-to-play sheet, a zoom that puts the rules text
   *beside* the card instead of under it. Owner reports about the interface are frequent and
   specific; they are symptom reports, and the root cause is usually two layouts disagreeing.
6. **Commit messages describe the mechanism, by id.** The history reads as a bug diary. That is
   what made this file writable — and it is the cheapest documentation you will ever write.
7. **Art direction is the owner's call, recorded, and not re-litigated** (§8.1). For Crystal Wars
   he explicitly overrode the predecessor's rule and asked for each character's signature features
   in an original chibi style. **Decide again for Riftbound** before the art pass.
8. **State a concern once, in writing, then build what was asked.** This is the standing rule for
   the whole IP conversation (§10.1). A concern belongs in a sentence or two and in the file that
   exists to hold it — NOTICE.md, DEVIATIONS.md, the art-rules header. It does not belong in the
   middle of the work, twice, or in quietly delivering less than was asked. Scaling the project
   down is the owner's call, never a unilateral one.

---

## 3. The five things project 3 got wrong that project 2 got right

This is the section the next project needs most.

### 3.1 Generated rules text on the card face was the wrong call — for a *reproduction*

Both earlier projects generated the card's rules text from its effect data and showed the player
that. It is a beautiful property: it is the copyright firewall (nowhere to paste published
wording) and a consistency guarantee (a card cannot say one thing and do another).

It is also, on a faithful reproduction, **a lie the player cannot check**. At the point this was
caught: 361 of 406 cards referred to themselves as "this card" where the real card says its name;
several stated wrong numbers outright (one card whose printed text draws two rendered as drawing
one); some leaked raw boolean logic out of the generator ("and not (your opponent's hand has no
cards)"); 16 dropped printed abilities from the face entirely. Every one of those is a describer
gap, not an engine gap — the cards *played* correctly — but a player practising a tournament deck
was reading paraphrases of rules they need to know verbatim.

**The reversal (CLAUDE.md hard rule 2):** the card face renders the PRINTED text, verbatim, from
the generated pack. `FF.cardText` survives as (a) the cross-check that `tools/audit-card-text.mjs`
diffs against the printed text and (b) the fallback for the test harness, which never loads the
pack. Every describer still carries a comment naming its engine counterpart.

**What this buys, and it is large:** the audit tool becomes a real fidelity instrument. Printed
text on one side, prose generated from the ability data on the other, diffed by id, running
offline because the pack is committed. That is what found 65 real defects (§3.5).

**Rule for the next project:** if you are reproducing a published game, ship printed text on the
face and keep the generator as the auditor. If you are shipping an original theme with invented
names (project 2's posture), keep the generator on the face. **Decide which on day one, because it
decides what the audit tool compares.** Two dependencies come with the printed-text route: a
machine-readable source of printed text (§10.4 — likely available for Riftbound, but confirm it
before planning around it), and a rights holder whose published position you have actually read
(§10.2 — for Riot, that reading may itself argue for the generated-text route). If either is
missing you are on generated text, the audit has nothing to diff against, and the fidelity
guarantee has to come from per-card tests plus a human reading the generated prose against the
real card.

### 3.2 Two script lists drifted, twice, and the tests could not see it

`index.html` never loaded `js/text.js`: `js/render.js` skips the detail block when `FF.cardText`
is undefined, so **every card in play rendered with no abilities** and nothing failed loudly.
Later, `index.html` never loaded `js/ai.js`: `FF.ai` was undefined in the browser, `js/ui.js`'s
defensive fallback made the opponent play a **uniformly random legal action** every turn, and the
difficulty selector did nothing. The AI test suite stayed green the whole time.

Both times, `tests.html` loaded the file and `index.html` did not. CLAUDE.md hard rule 3 says both
lists must match; nothing enforced it.

**Fix to build on day one:** a test (or a `check-pages`-style tool, since the test runner has no
filesystem) that parses both HTML files and asserts the **shared engine script list is identical
and in the same order**, allowing only a declared UI-only and test-only tail. Also delete every
defensive `if (!FF.x) { fallback }` in UI code: a missing module must throw on the first frame.
A silent fallback is how a headline feature ran dead for two days.

### 3.3 Tests that encode the bug pass forever

`tests/test-layout.js` carried "a lone Forward is never smaller than a full row's card" — which
asserted *precisely* the height-borrowing that produced 300px cards spilling past the mat edge.
Five separate owner reports of overflowing cards arrived while that test was green. It was replaced
by two checks that fail on the old solve at every viewport: card size is independent of row counts,
and a slot never exceeds either row's height.

Same class on the content side: two tests encoded a card's *forced* second hit where the printed
card says "up to 2", so the mistranscription was pinned rather than caught.

**Rules:** (a) when a report contradicts a green test, suspect the test first; (b) every engine fix
reports having reverted the fix and watched the test fail — project 2's "prove a test bites" habit,
which was followed here for engine fixes and not for layout; (c) a test's name should state the
rule, not the current behaviour.

### 3.4 Parallel agents in one working copy cost more than they saved

Two commits in this history are literally titled `WIP: ... (agents stopped)` — "captured as-is at
suspension; not verified against the suite; review before merging". At the same time, `docs/ai.md`
records a machine running double-digit `node` processes with load average 14–20, an AI balance
matrix that **could not be completed even once**, and measurements taken against an engine another
agent was concurrently repairing. That doc's Status section is still, at handoff, a record of a
measurement that did not happen.

Project 2 had already written the rule ("one cheap agent at a time on the dev machine"; "one audit
per commit range at a time") and project 3 broke it.

**Rules:** one agent per working copy. Slice bulk authoring by disjoint id ranges *with disjoint
files* — the per-wave `data/abilities-w*.js` / `js/ops-w*.js` split exists exactly so two slices
never touch one file. Never measure against a tree someone else is fixing. Never commit an
unverified WIP to a shared branch; a worktree or a branch of its own costs nothing.

### 3.5 The fidelity review: what a card-by-card audit actually finds

On 2026-09-10 all 406 cards were compared against their printed text. 126 were flagged; ~60 were
describer gaps whose mechanics were already right (`FF.cardText` never described a Summon's
top-level `effects` field at all, which made the "bare skeleton" class look alarming). **65 were
real defects**, and all 65 were fixed before handoff.

The shapes they took — expect every one of these again:

- **Clauses silently dropped for want of a primitive.** By far the biggest class. The card was
  authored with the half of its text the grammar could express, and the other half simply was not
  there. Six cards had *no mechanical data at all* and did nothing when played, while looking
  structurally valid. Each of the 40-odd new primitives added in the closing PR exists because a
  printed sentence had no way to be said: "leave the battle without leaving the field", "cancel any
  number", "redirect a break to the removed zone", "grant an ability continuously to whatever
  currently matches", "remember what my own ability removed", "reduce the cost of the *next* one
  this turn", "this source may pay in any element", "protection scoped to whose effect is choosing".
  **Lesson: an ability the grammar cannot express must fail authoring loudly** — author it as an
  explicit `unimplemented` marker that validation rejects from any registered deck, rather than as
  a partial card that plays wrong quietly.
- **Approximations that are strictly stronger or weaker than print.** "Look at the top N and take a
  match" authored where the card says "turn cards over until a match appears and take that one";
  "reveal the whole hand" where the card says "reveal three at random"; a blanket protection where
  the card protects only from a named class; "per one at half the amount" where the card pays per
  two. All play. All are the wrong card.
- **Defaults that survive to play.** Project 2's rule, confirmed again: *a default that a real
  value would replace must fail validation.* Add the invariant tests at import time.
- **Systemic engine bugs that hide behind single-card symptoms.** Four surfaced, each affecting
  cards far beyond the one being fixed: every *filtered* `discard` cost and every filtered `remove`
  cost was unpayable (the filter reached a matcher that defaults an unspecified zone to `field`);
  `chooser: 'opponent'` was ignored at every call site, so on seven cards the wrong player chose
  which of their own characters died; `breakOther`/`dullOther` costs counted the paying card itself,
  so a card could be half of its own cost; and a divide-damage helper recursed forever on an empty
  attacking party. **When a card fix touches a shared helper, stop and ask which other cards ride
  it** — then grep, and fix the helper, not the card.
- **Recursion through the statics layer.** `FF.statics(state)` is recomputed on every call and is
  not a pure function of already-known state: evaluating one static's condition can query element
  or power of a candidate card, which calls `FF.statics` again. Any condition filtering by element
  reliably blew the stack. A reentrancy guard (nested call returns `[]`) is deviation D-13. Design
  the layer system with an explicit evaluation order from day one; a guard is a patch, not a model.

---

## 4. What to repeat verbatim

Everything in `CARD-GAME-LESSONS.md` §1 and `CARD-GAME-LESSONS-2.md` §3 held for a third time. In
short, and without re-arguing any of it:

- **No build step.** Plain browser JS, IIFEs on one namespace, script order in the HTML.
- **Engine surface is exactly `legalActions` / `apply` (immutable) / `isTerminal`.** `apply` bought
  its immutability with a deep copy and nobody ever regretted it.
- **Every UI affordance derives from `legalActions`.** The UI cannot invent a rule.
- **One resolution queue is the whole control flow.** Multi-step abilities, targeting, mulligan,
  payment, combat, nested triggers. A pending queue item owns the turn; only its choices are legal.
  `legalActions` throws on a queue head that offers nothing.
- **`FF.whoActs(state)` is the one answer to "whose input is needed".** The AI had a second copy of
  that rule for exactly one PR before it was deleted (PR #1).
- **Structured log entries with `data`**, one `FF.log` entry point, `via` attribution stamped
  automatically while a trigger drains.
- **Cards are pure data; abilities are data.** New vocabulary goes into extension files wired
  through hook tables (`FF.extraConditions`, `FF.extraAmounts`, `FF.extraSelector`), never by
  editing the core. New op = handler + describer + test, enforced by validation.
- **One home per rule.** This project's own additions to the list of rules that had two copies:
  `discardCostPool`, `removeCostPool`, `otherCostPool`, `FF.targetChooser`, `FF.produceElements`,
  `FF.chooseOneBounds`, `FF.breakBecomesRemove`, `FF.playerDamageAmount`, plus `tools/lib/hf-image.mjs`
  when the second art generator appeared. Every one of them was extracted *after* a bug proved the
  copy existed. Extract on the first duplication, not the second.
- **Load-time validation, seeded RNG, one names file, deck registry decides the pool.**
- **The black box** (`js/bugreport.js` + `tools/replay-report.mjs` reporting ILLEGAL / THREW /
  DIVERGED, with `--selftest`). Built before the first playtest, as instructed. It works.
- **The gates:** `data/defects.js` (content), `tools/check-pages.mjs` (deploy), CI running the
  headless suite on push and PR.
- **Test layers:** engine/combat, text quality, per-card regression by wave, suspects (fed by
  `tools/coverage.mjs`), layout geometry, AI pinned decisions under a noiseless mode, fuzz
  (200 random games + deck matrix; crash gate, never a balance readout). Slow suites behind
  `--full`, which CI runs; `--quiet` and `--filter` for iteration.
- **Layout is a headless test suite.** Pure geometry, no DOM, across a spread of real viewport
  sizes: zones never overlap, nothing escapes its mat, reserves plus mats plus chrome account for
  the viewport exactly, cards hold a size floor. This is the only reason the board survived five rounds of
  rework. Extend it before changing geometry, and make the new assertion fail on the old code
  first (§3.3).

---

## 5. Token economy — how to do this cheaply

Project 2 hit the usage limit twice and wrote the first version of these rules. Project 3 added
teeth. In rough order of how much they save:

1. **Never read a generated pack.** `data/names-source.js` is a handful of lines each thousands of
   characters wide. One `head` of it costs more context than the entire engine. Query it with
   `node -e` or a tool that prints one id, never `cat`, `head` or Read.
2. **Read large files by range or grep, never whole.** `sed -n '400,640p'`, `grep -n '^#\+ '` for a
   doc's shape before its contents. The same applies to your own suite output: `--quiet` prints two
   lines, the verbose run prints hundreds.
3. **Tools print findings; they do not print material.** The audit tool was explicitly reworked to
   "kill the diagnosed false positives, emit compact findings" (248 → 178) — the point is that a
   findings count you can act on beats a dump you must read. Reports go to gitignored `scratch/`
   and you read the summary.
4. **Never view full-size renders in the main context.** Contact sheets (16 thumbnails per sheet),
   handed to a cheap model with the QC checklist; you look only at flagged tiles. 406 renders were
   QC'd over 26 sheets this way. (One caveat learned here: a downscaled thumbnail can hide a faint
   signature, so a borderline tile gets one native-size look, not the whole set.)
5. **Match the model to the work.** The early bulk phases of this project — importers, skeleton
   authoring, the first engine pass, rules-text polish — ran on a cheaper model; the fidelity
   review, the systemic engine fixes, the merges and the UI rework ran on the strongest one. The
   split is visible in the commits' co-author trailers. Bulk authoring from a pattern script kept
   in `scratch/` is cheap-model work by design; the reviewer reads the *generated text*, not the
   work packet.
6. **One agent per working copy** (§3.4). If a cheap agent underperforms, fix its brief and rerun;
   do not take over its bulk work yourself.
7. **Commit at checkpoints and report.** A long autonomous run that ends in a context wall loses
   everything it had not committed. Both WIP commits in this history exist because of that.
8. **Let the black box replace re-play.** "The card did something weird" becomes a file with a
   seed, two deck ids and every action; the replayer tells you which of three failure kinds it is.
   That is one tool call instead of a conversation.
9. **Screenshots are expensive and often unavailable; read the DOM and drive the real code path.**
   Several "bugs" in this project's history were test artifacts found that way.
10. **Measure, do not argue.** Luminance sampling settled text legibility in project 1; pixel
    geometry settled the board in project 3. A measurement is a few lines of Node and ends the
    discussion; an argument costs a session.

---

## 6. Process and git discipline

- **A dated Status section in every plan document, rewritten when reality changes, recording what
  the previous version got wrong.** `PLAN.md` here has one dated 2026-09-08 claiming 178 tests and
  four known gaps; at handoff the suite is at 444 and the gaps are closed. **It went stale on day
  two of six.** Rewrite it at the end of every working session, or delete the claim.
- **Docs that claim a code state are checked against the diff.** `docs/architecture.md` still lists
  a `js/anim.js` with a pure `plan()` and a DOM `run()`. There is no such file; the animation layer
  was never built. A fresh session reading that doc will look for it. Grep the doc's file list
  against `ls` as part of the doc's own review.
- **Deviations are logged, never silent, and retired in the commit that makes them untrue.** Four
  entries were retired in this project the moment the capability they recorded as missing existed.
  This file is where a new session learns what is intentional before "fixing" it.
- **Any behaviour change affecting NOTICE.md's claims updates NOTICE.md in the same commit.** Held
  this time, including when the CC0 music landed.
- **Branch per concern; hand a shared surface to whichever PR owns it.** When two branches both
  touched the board, one explicitly dropped its layout changes and said so in the commit
  ("Hand board layout to #6"). That is cheaper than a merge fight, and the commit says which side
  won each overlap — project 2's merge rule, followed.
- **A branch older than a day is a list of findings to re-verify, not a diff to merge.** One fix in
  this history explicitly supersedes an older unmerged branch that made the same fix against a much
  older file.
- **Commit messages: the mechanism, by id, never a card name and never a printed sentence.**

---

## 7. Interface — what the third project added to the specs

The three specs remain binding and mostly unchanged. What this project learned on top:

- **Reserve heights, not fractions of width.** The hand's reserve was a fraction of board *width*,
  so a wide window gave the hand a height it never earned: at 1950×1100 the hand took 373px and
  left each mat 281px — a hand taller than the board. Any reserve must answer to the dimension it
  consumes, and every clamp that reads the old term must be recomputed from the same expression, or
  it goes stale and silently stops clamping.
- **Never let a layout input depend on content that changes mid-game.** The prompt panel measured
  its own height into `--chrome-bottom`, which fed the board height, the mats and every card on
  them — so the board resized whenever the prompt's text changed. The fix moved the panel onto the
  seam between the mats as an overlay and made the reserve a constant. Overlays may cover cards;
  layout inputs may not breathe.
- **A card size that depends on how many cards are out is a bug.** Height borrowing from an empty
  sibling row produced 300px cards. Solve size from the fixed geometry, then overlap to fit.
- **One redraw path.** `FF.renderBoard` rebuilds every card element, and both the targeting role
  rings and the drag handlers are attached to those elements — so any bare re-render stripped both
  off every card. `paintBoard()` is now the only way the board may be redrawn and always repaints
  roles and re-wires drag. The symptom was "drag stops working in Main Phase 1 but not Main Phase
  2", which reads as a phase rule bug and is not.
- **Overlays eat clicks.** Three of them did simultaneously (a zone container spanning the hand
  strip, an art layer above its own card, an always-open prompt bar over the backup row). Every
  decorative layer gets `pointer-events: none` by default; only real hit targets opt in.
- **Read the rules text *beside* the card, never under it.** A 19rem-wide preview with a 26rem card
  puts everything explanatory below the fold. Two columns, stacking only below 560px. (And
  `grid-row: 1 / -1` does not span implicit rows — that is how the buttons ended up under the card.)
- **A dulled/exhausted card tilts ~8°, it does not turn 90°.** The quarter-turn threw the card's
  long side across its neighbours and laid the printed rules text on its side at preview size —
  unreadable exactly when the player zoomed in to read it. Deviation D-23; presentation only.
- **Printed icons must render as icons.** 146 cards carried 318 bracketed icon tokens straight from
  the dump; showing the player the raw CJK bracket text is not fidelity, it is an untranslated
  dump. Every meaning in the translation table was **confirmed against the ability data of a card
  that uses it**, never guessed, and an unknown token keeps its literal text so a gap is visible
  rather than invisible.
- **Prompts name the card and show its printed text.** Card-driven queue steps carry a `source`;
  a "may" reads as a question about a named card with its printed text beneath, and modal options
  are the card's own printed action clauses pulled out in printed order — not authored paraphrases
  and never "0" / "1". A modal that can select more than one must actually allow it (this one
  answered with a single option for its whole life, so "select up to 2" could never select two).
- **Say why a disabled control is disabled, next to it, before the first click.**
- **Pre-pick a starting choice.** The title screen opened with Start greyed out and a picker to
  walk; it now derives a deck for the human seat from the displayed seed (same seed, same deck),
  with a hint that it can be changed.
- **Deck choice is a screen, one seat button at a time** — not 40 tiles before the first decision.

---

## 8. Art direction

### 8.1 The direction decision, and that it is the owner's

Projects 1 and 2 used a wholly invented visual identity: original theme, original names, subjects
described in original terms, "do not reproduce recognisable third-party costume design" as a QC
failure. For Crystal Wars **the owner explicitly decided the opposite**: card art uses each
character's own signature features — recognisable weapon, hairstyle, outfit silhouette; for
creatures, their known silhouette — rendered in an original chibi style. It is recorded at the top
of `docs/ART-PROMPT-RULES.md` as a deliberate decision and marked "do not re-litigate".

What did not change under that decision, and should not change under any: **no on-image text**, no
reproduction of a specific piece of official artwork (prompts describe a visual identity in
original prose; they never ask for "the art of card X"), and the rendering style itself stays
original.

**For Riftbound: ask, and record the answer before the art pass.** The considerations are harder
than FFTCG's in both directions. Against the signature-features route: League champions are a
single publisher's own creations, still in active commercial use, with a house art style that an
imitation would obviously be imitating, and Riot's own fan-content policy is the most explicit of
the three publishers (§10.2). For it: the champion *is* the card, exactly as the FF character was,
and a deck of anonymous figures is not the tool the owner asked for. My recommendation, to be
overridden the moment he says otherwise: **a champion is identified by silhouette, palette and
weapon class in an original chibi style — recognisable at 34px, not a copy at 512px** — and the
theme carries original names, so the identity lives in the art rather than in the text. Either way
the three constants hold: no on-image text, no reproduction of a specific official illustration, and
an original rendering style.

**Coverage is honest, not exhaustive.** 302 unique subjects across 406 cards; 151 got a
hand-curated signature descriptor, weighted toward the names that repeat across the most printings;
the ~240 that appear once — many from spin-offs with no design this author could describe
accurately — fall back to a **job-archetype** descriptor rather than a guessed-at "signature" that
might just be wrong. Extending either dictionary is an edit to the builder in `scratch/` and a
rerun, never a hand-edit of the committed JSON.

### 8.2 The style block is the product

One `STYLE` string, **byte-identical across every generation**, appended to a one-line per-card
subject. That constant is what makes 400+ independently generated images read as one set. It lives
in the generator; if it changes, it is pasted back into the art-rules doc in the same commit.

Crystal Wars' block, for reference: chibi super-deformed (oversized head, small compact body), bold
cel shading with crisp highlights and confident linework, saturated palette, wordless, a single
full-bleed painted environment filling the frame edge to edge with real depth and atmosphere, the
figure grounded *within* it, dynamic rim light, vertical portrait.

The style was chosen for function, not taste, and the reasons still hold: chibi reads at 34px,
forgives generation anatomy errors, and is a genre tradition rather than anyone's property.

### 8.3 The prompt rules that generalise

1. **Full-bleed environment, always.** The renderer covers the whole card face. The very first test
   render came back as a white-background sticker with a drop shadow — unusable.
2. **Never render text.** Avoid text-magnet nouns (sign, banner, flag, insignia, label, nameplate);
   the single biggest source is a crowded public setting (market, plaza, concourse, street) —
   describe the physical space instead. This is why every environment phrase in the pool is a
   landscape.
3. **Never name the printed card.** (Under the signature-features decision the *character's* name
   is fine and expected — a name described visually is a subject, not text on the image. It still
   leaks: the full-set QC caught one card with the character's name lettered into the scene and one
   with an all-caps job label rendered onto a sash like a patch. **A short, common, easily-typeset
   word is the highest-risk case** — watch those specifically.)
4. **Never negate.** "A cloak with no writing on it" produces ghost lettering. Describe positively;
   let the style block's own positive phrasing carry the intent.
5. **Exact counts above two are unreliable** — write "a group of".
6. **Front-load the proportion anchor.** The first sample batch put the chibi cue *after* the
   signature phrase: every humanoid held the style and **every creature drifted into realistic
   concept art**, because there was no "person" to hang the proportions on. Moving a strong chibi
   clause to immediately follow the name — ahead of everything else, for humanoids and creatures
   alike — fixed it on regeneration.
7. **Crop the bottom ~4%, and expect QC regenerations anyway.** The model signs its work in a
   bottom corner some of the time; wording does not stop it and the crop is a mitigation, not a
   guarantee (5 of 406 still needed a forced regeneration, one of them three attempts).
8. **Regeneration is not monotonic.** Only regenerate what failed; archive the previous file first
   so a good render can be restored.

### 8.4 Board art, and the line between painting and drawing

A second, smaller pipeline paints the *areas* of the playmat — eight zone images plus three screen
backdrops — sharing the router, model, token resolution and WebP step with the card generator
through one extracted `tools/lib/hf-image.mjs`.

Two rules specific to it:

- **A board style block asks for an empty place**: no people, no creatures, no lettering, muted and
  desaturated, detail fading toward the edges so the centre stays calm. These images sit *under*
  cards; anything with a silhouette competes with the art on top of it.
- **How strongly each paints is a CSS decision, in two knobs per zone** (art opacity and scrim
  fill), deliberately low. The first wiring at 50% art / 55% scrim was visibly too loud against the
  cards. A missing image simply does not paint and the board reads exactly as before.

And the durable lesson from project 2, confirmed: **generate art for things that are pictures; draw
things that are geometry.** The board's outlines, labels and hitboxes come from one geometry table
in board space, drawn as SVG, so the painted outline and the DOM hitbox are the same numbers by
construction. A photographed or painted *board* means two sets of numbers that will drift.

### 8.5 Pipeline conventions (unchanged, all three projects)

Idempotent; `--dry-run` free and printing the whole plan; `--only` exact-match (a substring filter
once regenerated a wide background at portrait size); `--force` archives first; `--limit` caps a
paid run; key resolution flag → env → gitignored file; back off on 429. Masters never enter the
repo, delivery formats only (PNG → crop → WebP q90 measured at ~47 KB/card vs ~363 KB). Commit an
art batch once, after QC — every regenerated file stays in history forever. Screen backdrops
supplied as JPEG masters got the same treatment: 3.7 MB down to ~300 KB each, masters gitignored.

---

## 9. Sound direction

**What shipped:** four background tracks — deck picker, battle, victory, defeat — crossfaded, with
one module (`js/audio.js`) owning every audio decision so the UI has exactly one call to make and
nothing there touches game state.

The decisions worth repeating:

- **CC0 only, and credited anyway.** All four tracks are CC0 1.0 public-domain dedications from
  OpenGameArt, re-encoded unchanged. CC0 waives attribution; NOTICE.md and `docs/sources.md` credit
  them and record the exact re-encode commands regardless. This is the cheapest possible music
  solution and it sounds like a real game.
- **Two encodes per track: Opus-in-Ogg plus AAC/m4a.** Opus in Ogg is gapless, which a seamless
  loop needs; AAC covers the browsers that will not take it. 22 MB of source became 7.7 MB, of
  which a browser fetches one format.
- **Looping is per track.** A 15-second defeat sting on repeat nags instead of landing, so it plays
  once and leaves the screen quiet — which means a finished one-shot must be **rewound** before it
  can play again, or losing twice in a row is silent the second time.
- **A draw keeps the battle track.** A victory or defeat theme would state an outcome that did not
  happen. Same reasoning as the neutral end overlay.
- **Autoplay refusal is "wait", not an error.** The first pointer or key event starts the track.
- **Mute persists, and a muted reload creates no audio element at all**, so it fetches nothing.
- **One `AudioContext` for everything** if you add Web Audio — project 2's iPadOS lesson: SFX
  through cloned `<audio>` elements while the score ran on Web Audio left the context parked and
  silent with no error. That class cannot be reproduced headlessly; test on the device.

**What did not ship, and should on the next project:** sound effects. The log-and-targeting spec
already specifies a log-driven audio layer — structured entries carry a sound tag, the sound is
voiced at the moment of the picture rather than at apply time, and tags with no clip are simply
ignored so the engine may tag sounds that do not exist yet. The engine emits the structured data;
nobody wired a player to it. **It is perhaps a day's work and it is the single largest perceived
quality gain still on the table.** Do it before the second art pass, not after.

For Riftbound specifically, the structured log hands you the tag set for free: deploy a unit,
move to a battlefield, showdown won and lost, a unit destroyed, a chain link added and resolved,
runes channelled and recycled, a champion levelled, **a point scored** and a battlefield taken. The
score tags are the ones to get right — the whole game is a race to eight, and a distinct, escalating
sound per point is the cheapest possible way to make the clock felt. Music tiers keyed to the score
line (early / contested / match point on either side), sharing **one byte-identical musical brief**
across prompts so the tiers read as one piece intensifying — the same trick as the art style block.
Trim loops to the sustained body by RMS envelope, not by silence detection: a generated fade-out is
loud enough to pass a silence test and makes the loop sound like the piece ending and restarting.

One sourcing note specific to Riot: they publish "creator safe" music guidelines for their own
catalogue. That is written for video and streaming, not for shipping audio inside a game, so do
not assume it covers this use — but it is worth reading alongside the fan-content policy (§10.2)
and recording what it does and does not permit, rather than guessing in either direction. The CC0
route needs no permission at all and sounded like a real game for four tracks and zero dollars; it
remains the default.

---

## 10. IP posture — and the argument we have every time

### 10.1 How we argue about this, and how it has always ended

Worth writing down plainly, because it has happened on all three projects and it will happen on
the fourth.

**The pattern.** The owner asks for a faithful reproduction of a published game. I raise a
copyright or trademark concern. He pushes back — usually because the concern, followed to its
conclusion, would produce a worse tool than the one he asked for. We end up building **exactly
what he asked for**, and the reason that works is not that either of us won the argument: it is
that the *engineering* absorbed it. Published words live in one generated file that can be
switched off in the UI and deleted in one commit. Rules text is generated from effect data, so
there is nowhere to paste published wording by accident. No official image ever enters the repo.
Nothing is sold, nothing is advertised. NOTICE.md says what the project is and gives a takedown
address. The posture is not a compromise bolted on at the end; it is the architecture, and it
costs nothing to keep.

**The three times it actually came up, and how each resolved:**

- **Art direction (project 3).** The predecessor's rule was "never reproduce recognisable
  third-party costume design". He overrode it: the characters *are* the product, and a card game
  about characters rendered as generic figures is not the practice tool he wanted. Resolution: the
  override is recorded at the top of `docs/ART-PROMPT-RULES.md`, marked *do not re-litigate*, with
  the three constants that did not move (no on-image text, no copying a specific official
  illustration, original rendering style). It has not come up since, because it is written down.
- **Printed rules text (project 3).** I had inherited a rule that the player must never see
  published wording. Following it produced 361 of 406 card faces that misdescribed their own
  cards (§3.1). He asked for the real text. Resolution: hard rule 2 was **reversed** — the face
  shows printed text verbatim from the switchable pack, and the generator became the auditor. That
  decision *increased* the published-text surface and simultaneously made the project far more
  honest. The caution was right in the abstract and wrong for this project.
- **Which decks are playable (project 3).** He asked that nothing be offered that does not play
  correctly. That is not an IP argument at all, but it is the same shape: he set the standard,
  the engineering met it (`data/defects.js`), and the standard turned out to be the thing that
  made the project good.

**So: the standing rule for the next session.** State the concern once, in a sentence or two, in
writing, in the file that exists to hold it. Then build what was asked, in full. Do not re-open a
recorded decision; do not deliver a quietly narrowed version "to be safe" — a paraphrase where
printed text was asked for, a generic figure where a champion was asked for, a feature dropped
without saying so. If the answer is no, say so plainly in one sentence, say what you *can* do, and
move on. The few things I will not do are short and fixed, and they have never once been the thing
he was asking for: no official art or audio assets in the repo, nothing sold or monetised, nothing
presented as official or affiliated, and no circumvention of a rights holder's technical measures.
Everything else is his call.

### 10.2 What is different this time: Riot has written its policy down

Square Enix never said anything specific about simulators; Fantasy Flight and Disney never did
either. **Riot has.** Riot publishes a fan-content policy (the "Legal Jibber Jabber") that grants a
revocable, non-commercial, non-transferable licence for community fan projects — and public
summaries of it consistently report that it **excludes making games with Riot IP**, naming
simulators and recreations specifically, and that the licence is revocable at Riot's discretion for
any reason. There is also a Riot developer portal with a Riftbound page and its own API terms.

I could not fetch either document from this environment (egress blocked), so the above is from
secondary sources. **Read both yourself on day one, from the primary pages, before writing a line
of code, and record what they actually say in `docs/sources.md` and NOTICE.md.** That is the one
piece of work in this whole file I would not let anyone skip, and it is not because I think the
project should not exist — it is because *this is the argument we always have, and for the first
time it can be had once, against a real document, with the answer written down*. After that it is
settled and nobody re-opens it.

What I would do with that reading, as a recommendation the owner may overrule:

1. **Flip the default to project 2's posture.** Original theme, original names, original subjects,
   rules text generated from effect data — with the published-name pack as an optional, switchable,
   deletable convenience layer rather than the default display mode. Crystal Wars shipped the pack
   on by default because FFTCG's characters span decades of cross-media use and no publisher
   statement addressed it. Riot's does address it, so the cheap default should be the quiet one.
   The switch is one constant; the decision is reversible in either direction.
2. **Treat publication as a separate, deliberate decision, made late.** Projects 1–3 all assumed a
   public GitHub Pages deploy. For this one, build it as a private practice tool that runs from
   `file://` and a local dev server, and decide about a public URL — and a public repo — as its own
   commit, with its own note in PLAN.md. A private tool for one player is a different thing from a
   published site, both practically and in how any rights holder would ever encounter it.
3. **Keep every other structural guarantee exactly as it is.** They are what make the posture
   cheap, and they cost nothing.

If he reads the policy and wants it built anyway, with names, printed text and a public URL: that
is his call, it is recorded in PLAN.md with the date, and I build it without raising it again.

### 10.3 The posture that works, unchanged

- **Two places for published words only:** gitignored `scratch/` and one generated names file.
  Card data, engine, tests, docs, commit messages, PR bodies and bug traces use ids and mechanical
  descriptions. The one carve-out project 3 added: a card's `nameId` (a slug of the printed name)
  is allowed in card data, selectors and tests, **because rules text refers to cards by name** and
  a selector meaning "a card named X" has to say so. Printed sentences are still never allowed.
- The pack is loaded by `index.html` only, never by the test page, **and a test asserts that** —
  otherwise every text test silently starts checking printed text instead of the describers.
- Both name sets stay in memory; the toggle is a display mode, remembered in `localStorage`, with
  ids the pack misses falling back to the original names. Without the file the game is unchanged
  and the toggle is hidden. That is also the one-commit withdrawal lever.
- `.gitignore` committed alone, before the first tool exists.
- NOTICE.md names the published game once to identify what is implemented, states non-affiliation
  and non-commercial status by name, credits any third-party audio, gives a takedown contact, and
  carries the same-commit maintenance rule. The same disclaimer sentence renders on a screen the
  player actually sees, not only in a repo file.
- Three tiers, decided per tier and re-decided per publisher: **names**, **printed rules text**,
  **official images** (always out of scope — every image is the project's own).
- **Check the working title against the source material** before it reaches a filename, a URL or a
  repo name. Project 2 renamed across eight files, a package name, a repo and a published URL
  because an invented word turned out to be franchise vocabulary; project 3 renamed from its
  working title in one commit. For Riftbound, grep candidate titles against the card dump *and*
  against the wider franchise's vocabulary — the setting has a large published glossary and its
  words are exactly the evocative ones a title wants.
- Sweep history for secrets and scratch paths before any visibility flip.

### 10.4 Sourcing the mechanical data

FFTCG had an official JSON card endpoint and a community deck API, which is why 406 skeletons and
20 tournament decks were a day's work. For Riftbound, check in this order and record the answer in
`docs/sources.md`:

1. **Riot's own developer portal has a Riftbound page.** If it exposes card data, that is the
   authoritative source — and using it puts you under **API terms**, which are a contract, separate
   from and additional to copyright. Read them before the first request, and record which side of
   that line every source sits on. An official source with terms attached may be a worse deal than
   a community mirror, or a better one; decide deliberately.
2. **Community card databases and deck sites**, the same way project 3 used them: browser user
   agent, dumps to `scratch/`, only mechanical fields cross into the repo, and **numbers
   cross-checked against a second source whenever two disagree** — printed numbers over inferred
   ones, always, with the inference rule stated in DEVIATIONS.md and a test that fails when the
   real number arrives.
3. **The official rules document**, by version and date, read into `docs/rules.md` **by rule
   number** as project 3 did. That file is the engine's citation index and it pays for itself every
   time a card argues with the engine.

Two Riftbound-specific data notes to expect: the card pool carries **six domains** as its colour
axis, and a deck is built from **several distinct lists** (a Legend, a main deck, a battlefield
set and a rune deck). The importer's skeleton shape and the deck registry both need to model that
from the first import — retrofitting a second and third deck list is the same miserable
retrofit as the names file.

---

## 11. Applying this to Riftbound

Same posture, same architecture, same three-function surface. Riftbound is a TCG, so far more
transfers than a board game would have. The rules below come from a first pass over public rules
summaries, not from the official rulebook — **every one of them must be checked against the
official rules before the engine skeleton is written**. The point of listing them is to show where
the FFTCG-shaped engine has to change.

### 11.1 What transfers without change

The three-function surface; immutable `apply`; the resolution queue and `whoActs`; `pendingChoice`
targeting and its three automatically-chosen UIs; the effect grammar with hook-table extensions;
structured logging with `via` attribution; the names file with a `terms` table; load-time
validation and the skeleton-default invariants; the printed-vs-generated audit and the coverage
tool; the test harness, the two-entry-point script list and the Node runner; the fuzzer and the
deck matrix; the black box and its replayer; the card renderer and all three UI specs; the defects
gate; the art and audio pipelines; the AI machine and its measurement harness. A hand is a hand, a
deck is a deck, and a LIFO chain of effects is the stack this engine already models.

**The first week's work is the battlefields, the two-resource economy, and the score clock.**
Everything else is a copy.

### 11.2 The five shapes that are new

1. **Locations are the board.** Units are deployed *to* battlefields and contest control there.
   That is the first spatial state in this series, but it is finite, named and small — a handful of
   locations, not a map — so it is a **zone list**, not geometry. Model a battlefield as a zone
   with an owner-of-record and an occupancy list; "control" is a derived predicate with exactly one
   home (`controllerOf(battlefield)`), because it will be read by scoring, by combat, by card
   conditions and by the AI, and four copies of that rule is precisely the §3.5 bug class. Movement
   between locations is an action with a cost, so `legalActions` grows a destination dimension;
   enumerate destinations, not paths.
2. **Two resources with different payment mechanics, and a second deck.** Energy is paid by
   exhausting runes; power is paid by recycling matching-domain runes to the bottom of the rune
   deck; runes are channelled from a separate rune deck each turn. That is two currencies, one of
   which is *the deck itself being cycled*, plus a colour requirement on the second. Consequences:
   the payment solver from project 3 (produce sources until cost and element requirements are
   covered, with a full rewind on cancel) is the right starting point and needs a second axis;
   `FF.produceElements`' descendant — "what can this source pay, and in what" — must be one
   function from day one; and the rune deck is a second ordered, seeded zone that validation, the
   fuzzer and the trace format all have to know about.
3. **A score race, not a damage race, and the clock ticks on your own turn.** First to 8 points
   (11 in multiplayer), scored by controlling battlefields — points accrue at the start of your
   turn for what you still hold, with conquest as the other route. **This is the single most
   important thing for the AI evaluator**, and it inverts project 3's model: the damage-zone table
   priced *harm already taken*; here the analogue is *progress on a clock*, superlinear near the
   threshold (the 7th point is categorically worse to concede than the 1st), and — the subtle part
   — what the position is worth is **expected control at your next upkeep**, not control right now.
   A battlefield you hold that the opponent can take back before your turn begins is worth close to
   nothing. That makes the one-ply reply search from project 3 not an optimisation but a
   requirement: "can they retake it before I score" is the central question of the game and does
   not exist at zero plies.
4. **A free-form action phase with a LIFO chain.** Players take actions in the action phase and
   respond to each other on a chain that resolves last-in-first-out. That is closer to FFTCG's
   stack and priority than to SWU's strict alternation, which is good news: the queue, the stack,
   the priority holder and the "both pass resolves the top" loop already exist in project 3's
   engine and are the part that took a week to get right. Carry them over rather than rebuilding.
   What is new is that the action economy is not one-action-per-turn: budget for a much larger
   `legalActions` in the action phase, and cap or sample it for the AI search (project 3's
   deterministic even-stride sampling, never truncation from the front).
5. **Combat is scoped to a location and happens many times a turn.** A showdown resolves between
   the units at one battlefield, with might compared and losers destroyed. Combat is therefore a
   **sub-procedure parameterised by a battlefield**, not a global combat phase with one attacker
   and one blocker. Project 3's combat module assumes a single global battle (`state.combat`) and
   discovered, via the fuzzer, that emptying it mid-resolution leaves the phase in an impossible
   state. Design it as a scoped object from the start, and keep the fuzz assertion that found that
   bug: no dead states, no zero-legal-action positions, a termination bound.

**Also decide up front:** the Legend and champion-levelling model (a persistent identity card with
state is closest to SWU's leader, which project 2 handled and project 3 did not have); deck
construction validation across all four lists, including the copy limit and the domain restriction
the Legend imposes; and **how many seats the simulator supports**. Riftbound supports multiplayer,
and more than two seats breaks `sideValue(me) − sideValue(them)` and the zero-sum identity the
queue-step chooser relies on. **Scope to 1v1 and say so in PLAN.md** unless the owner wants
otherwise; if he does, the cheapest honest model is `me − max(others)` with a documented paranoia
term, and the whole measurement harness needs re-validating before any number from it is trusted.

### 11.3 Vocabulary to decide before writing any prose

The `terms` table needs the project's own words for whatever the theme renames: the two
resources, the rune/channel vocabulary, the locations, the score, the recycle and trash zones, the
six domains, and the Legend and champion vocabulary. Everything generated — rules text, log lines,
prompts, keyword help — reads these at render time; the pack swaps them together with the names.
Decide once; renaming later touches every describer. And per §10.2, decide *which set is the
default display mode* at the same time.

---

## 12. Day-one checklist

The ten items in `CARD-GAME-LESSONS.md` §10 and the thirteen in `CARD-GAME-LESSONS-2.md` §12 still
apply in full. What this project adds, in the order to do them:

1. **`.gitignore` committed alone**, before the first tool: `scratch/`, key files, art masters and
   archives, traces, third-party rules PDFs, editor lock files.
2. **Read Riot's fan-content policy and the developer-portal Riftbound terms, from the primary
   pages, and write down what they say** — in `docs/sources.md` and NOTICE.md, with the date and
   the version you read. Before any code. This is the argument settled once instead of every
   session (§10.2).
3. **`CLAUDE.md` on commit one**, pointing at all three lessons files and the three specs, and
   stating the three regime decisions explicitly: **printed text or generated text on the face**
   (§3.1), **published names or theme names as the default display mode** (§10.2), and **how many
   seats the simulator supports** (§11.2).
4. **The script-list equality check** — one test or tool asserting `index.html` and the test page
   load the same engine files in the same order — plus a ban on defensive `if (!FF.x)` fallbacks in
   UI code (§3.2).
5. **The defects gate** (`data/defects.js` + a registry filter that hides anything containing a
   defective id), empty, wired, and documented as the mechanism for taking content out of
   circulation while it is fixed.
6. **Engine skeleton**: `legalActions` / `apply` (immutable) / `isTerminal`, seeded RNG with
   **every shuffle, channel and hidden reveal performed inside `apply`**, structured log, the
   resolution queue, `whoActs`.
7. **Load-time validation** including the skeleton-default invariants (no cost-bearing keyword at
   zero, no empty ability list on registered content, no default that a real value would replace).
8. **An explicit `unimplemented` marker** in the grammar that validation rejects from any
   registered deck — so a clause the grammar cannot yet express fails loudly instead of
   shipping as a partial card (§3.5).
9. **The test harness and Node runner**, `--quiet`/`--filter`/`--full`, plus the geometry suite
   before the first board pixel.
10. **The black box and its replayer with `--selftest`**, before the first playtest.
11. **CI on push and PR** running the headless suite.
12. **The audit tool and the coverage tool**, and re-run both after every authoring pass.
13. **`docs/ai.md` with the weight table, a cited reason per weight, and the random-play control
    the first time the matrix runs** — and actually run it, on a quiet machine, once (§3.4).
14. **NOTICE.md, the disclaimer string on a screen the player sees, and the title check against the
    source material.**
15. **A dated Status in PLAN.md, rewritten at the end of every session** (§6).

---

## 13. Files to copy into the next repo

```
CARD-GAME-LESSONS.md          CARD-GAME-LESSONS-2.md        CARD-GAME-LESSONS-3.md (this file)
CARD-PRESENTATION-SPEC.md     CARD-LOG-AND-TARGETING-SPEC.md  CARD-FANNING-SPEC.md
```

Worth reading in this repo before starting, rather than copying: `CLAUDE.md` (the ten hard rules in
their final form), `DEVIATIONS.md` (the shape of an honest divergence register),
`docs/grammar.md` (the effect grammar as it ended up after 406 cards), `docs/architecture.md` (file
layout, id schemes, state shape, queue steps — minus its stale `js/anim.js` line), `docs/ai.md`
(the weight table format and the honest "known gaps" section), `docs/ART-PROMPT-RULES.md`,
`docs/sources.md`, `tools/` in full, and the CI workflow.

---

*Written at the Crystal Wars handoff, 2026-09-20, for the Riftbound project that follows it.
Suite green at 444 tests; `data/defects.js` empty; all 20 decks offered; DEVIATIONS.md current. Not
deployed, no sound effects, no animation layer, and the AI matrix never measured — those are the
four things the next project should not leave until day six.*

*And one line for whoever picks this up: the owner has been right about the shape of these projects
every time, including the two times I argued. Build what he asks for, write the concern down once
where it belongs, and keep the engineering honest enough that the posture costs nothing.*
