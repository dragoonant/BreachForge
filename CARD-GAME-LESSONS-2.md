# Lessons from Starbound Legions — starter guide for the next card game

Distilled from building Starbound Legions: a browser reproduction of a published trading
card game's mechanics (Star Wars: Unlimited), played against an AI, under an original theme,
with original art and sound, deployed on GitHub Pages. This is the second document in the
series. `CARD-GAME-LESSONS.md` (from MegaRobotWar) came first and every rule in it still
applies; this file records what the second project added, what it changed, and what it
got wrong. Where the two disagree, this one wins, because it is the later evidence.

Drop both files into the new repo root and point `CLAUDE.md` at them from commit one.
The specs that go with them are `CARD-PRESENTATION-SPEC.md`,
`CARD-LOG-AND-TARGETING-SPEC.md` and `CARD-FANNING-SPEC.md`; copy them too. They are
written game-agnostically and were binding for this project.

The next project is a reproduction of the Final Fantasy Trading Card Game under the same
posture. Section 13 says what changes for it. Nothing in this file is legal advice; it is
a record of the posture one hobby project took, the reasoning behind it, and the
engineering that makes the posture cheap to keep.

---

## 1. What the project became, and the one planning lesson

**Plan vs. outcome.** PLAN.md scoped the first set at 2 leaders, 2 bases and ~50 cards.
Ten days and 149 commits later the game held 2,277 registered cards across ten sets, 16
preconstructed decks plus 50 tournament lists, 252 headless tests, ~43,000 lines, and a
live site. The scope did not creep; it jumped, in one decision: *reproduce the published
card pool and its real deck lists rather than design our own set*. Every downstream
consequence in this file follows from that decision, and the plan document had to be
rewritten twice to say so (`PLAN.md` "Status" and "Phase 7").

**Say what the project is on day one, because it decides what "balance" means.** With
original cards, deck win rates are a balance readout and the designer's knob. With
reproduced cards there is no knob: an underperforming deck is the meta, and changing a
printed number is exactly the deviation the project refuses. The fuzz matrix's "win-rate
summary doubles as a balance readout" comment survived for a week after it stopped being
true. Deck win rates in a reproduction measure the AI and the engine's fidelity, nothing
else (docs/ai.md).

**Timeline, for calibration.** Engine, content system, tests and first UI: days 1–2.
Presentation overhaul, log/targeting spec, sound and music: days 2–4. Board and title
screen, competitive expansion (1,119 skeleton cards, 212 authored), art pipeline and QC:
days 5–6. AI measurement and the Competition difficulty: day 7. Pages deploy, source-name
pack, wave-2 expansion (30 more lists, 200 more cards named and drawn): days 8–9.
Transcription audits and the bugs they found: days 9–10. Art is the most expensive and
least reworkable step and it still waited, correctly, until names and pool were stable.

**What got merged, as pull requests.** Twenty PRs; the arc is worth knowing because the
next project will follow it: end-of-match video and art refresh (#1) → drawn board and the
first printed-vs-generated audit (#2) → card-face fixes from play (#3) → the competitive
deck group with the `ops2.js` engine extension (#4) → trigger ordering and the 353 MB →
41 MB payload cut (#5) → Competition difficulty and rules leaks found at the table (#6) →
GitHub Pages with shipped assets and the switchable source-name pack (#7) → board
scaling (#8) → per-card coverage audit and the suspects tests (#9) → wave-2 lists (#10)
→ one name everywhere (#11) → border colours removed, unaffordable mark added (#12) →
bug reports that land in `traces/` (#13) → the transcription audit and its findings
(#14, #15, #16) → iPad audio (#17) → pilot boxes (#18) → two-hit events (#19) → event
conditions and attach legality (#20).

---

## 2. The IP playbook — how the published game's material was handled

This is the section the next project needs most, so it is the longest. The posture:
**mechanics are functional and are implemented faithfully; all expression is original;
the published game's names and printed text exist in exactly one generated file that the
player can switch off and the maintainer can withdraw in one commit.**

### 2.1 Rank the third-party material by kind, and decide per tier

PAGES-PLAN.md ranked it before the site went public, and the ranking held:

1. **Card, deck and trait names — low risk.** Individual card titles are generally not
   copyrightable, and using a name to identify the card it identifies is descriptive use,
   provided the site never presents itself as official. Every community deck builder and
   simulator does this. Decision: ship them, behind a toggle, with the non-affiliation
   notice on the page a visitor actually sees (title screen and How-to-play), not only in
   a repo file.
2. **Printed rules text verbatim — moderate risk.** Short and functional, so weakly
   protected, but it is the publisher's text reproduced for hundreds of cards. The
   generated text already existed and was tested, so printed text is a *convenience*, not
   a requirement. Decision: ship it under the same toggle as the names so it can be
   switched off in one commit if it is ever the thing complained about.
3. **Official card images — high risk, and a different kind of risk.** Scans are
   straightforwardly copyrighted artwork. "Other emulators do it" is true and is not a
   defence: they run at the rights holder's tolerance, which is revocable without notice.
   What changes on GitHub Pages specifically is the *mechanism*: a takedown notice to
   GitHub disables the repository (the whole site, not one file) and repeated notices
   affect the account. Self-hosted emulators do not have that single switch. Decision:
   official images are out of scope entirely; every image is the project's own
   AI-generated art from prompts written in original terms.

The engine, the decks as id lists, and the AI are functional and were never in question.

### 2.2 Where the published words are allowed to exist

Exactly two places, and the rule is in CLAUDE.md as a hard rule:

- **`scratch/` — gitignored.** Database dumps, work packets, audit reports, anything that
  carries printed text. Import tooling reads from here and writes intermediate files here.
  `.gitignore` covers it before the first tool exists.
- **`data/names-source.js` — committed, generated, never hand-edited.** The published
  game's card names, subtitles, deck names, trait names, printed rules text, and its words
  for the vocabulary the theme renames. Built only by `tools/gen-source-names.mjs`. Loaded
  by `index.html` only, never by `tests.html`, and a test asserts that (`SB.names.hasSource()
  === false` under test), because the moment the pack reaches the tests every text test
  silently starts checking the printed text instead of the generated describers.

Everywhere else — card data, engine, tests, art prompts, docs, commit messages, PR bodies,
the trace files a bug report writes — uses stable internal ids and the original theme.
The rule was extended to commit messages and docs after it was noticed that a
description of a bug naturally wants to name the card; use the id (`sec-180`) and a
mechanical description instead. The bug-report recorder was designed so a trace carries
ids only and is safe to paste anywhere.

### 2.3 The four structural decisions that make the posture durable

A scrub is a one-time event; these make the clean state the *default* state:

1. **All display text in one file (`names.js` plus `data/names-*.js`), keyed by id.**
   The board's zone labels were painted into a board image once, which put display text
   outside `names.js` and made it un-themeable; the board is now drawn as SVG with labels
   from `names.ui.zones` (docs/board-art.md). Retrofitting this rule is miserable;
   applying it from commit one is free.
2. **Rules text is generated from effect data, never stored.** This is both the copyright
   firewall (there is nowhere to paste published wording) and the consistency guarantee
   (a card cannot say one thing and do another). When printed text *is* shown, it is
   looked up from the pack under the same toggle (`SB.cardText` prefers the pack's text
   only in source mode).
3. **The vocabulary the theme renames lives in `names.js` `terms` and is read at render
   time.** The published game has a power token and a unique-card insignia; the theme
   calls them something else. No generated sentence stores either word: log lines,
   prompts, keyword help and labels all build from `SB.names.terms` when they render, and
   the pack overrides `terms` together with the names. So "spent the Current" and "spent
   a <published token>" are the same structured log entry read under two name sets. The
   first version stored the theme's word inside prose helpers; that was fixed in one
   commit and the rule added to CLAUDE.md. Decide the `terms` list on day one — it is the
   list of franchise words that would otherwise leak into generated prose.
4. **Both name sets stay in memory; the toggle is a display mode.**
   `SB.names.registerSource(pack)` keeps the original tables it displaces; a HUD button
   flips `SB.namesMode` (`'source' | 'original'`, remembered in `localStorage['sb.names']`,
   default `'source'` when the file is present). Ids the pack misses fall back to the
   original names. Without the file the game is unchanged and the button is hidden. That
   is also the one-commit withdrawal lever: delete the file, or flip one constant.

### 2.4 Trademarks and the working title

- **NOTICE.md names the published game once, to identify what is implemented**, states
  non-affiliation with the publisher and licensor by name, states non-commercial (no
  charge, no advertising, nothing sold), and gives a takedown contact. It also states the
  maintenance rule: *any behaviour change that affects its claims updates NOTICE.md in the
  same commit*. It went stale once in the predecessor when art landed; the same-commit
  rule stopped that here.
- **The same disclaimer sentence lives in `names.js` `ui.disclaimer`** and renders on the
  title screen and in How-to-play, "kept in step with NOTICE.md".
- **Check the working title against the franchise.** The theme was called "The Sundered
  Veil" for a week; the word turned out to be a term from the franchise itself and the
  rename touched eight files, `package.json`, the repo name and the Pages URL (which does
  not redirect). Grep the candidate name against the card dump before using it anywhere.
- **The site names itself as an unofficial fan simulator, never as the game.** Package
  name, `<title>`, README first line.
- **Sweep history before going public.** Two commands, run once before the visibility
  flip, both expected empty:
  ```
  git log --all --diff-filter=A --name-only --pretty=format: | sort -u | grep -Ei 'scratch|source-local|hf_token|elevenlabs|\.key$'
  git log --all -p | grep -c 'hf_[A-Za-z0-9]\{20,\}'
  ```

### 2.5 Sourcing the mechanical data

- **Sources:** two community card databases (one with an indexed JSON endpoint, one with
  per-set dumps that are authoritative for aspects, traits, keywords, stats and front/back
  text) plus a public CC0 card dataset used to check numbers when the two disagreed; deck
  lists from a tournament results hub, cross-checked against official deck-list images.
  Every dump lands in `scratch/`. The fetch tool sets a browser user agent because the
  endpoint rejects the default one.
- **Read only mechanical fields into the repo:** id (set code + zero-padded number, so
  `sor-001`), type, cost, stats, arena, aspects (colour analogue), neutral trait ids,
  parsed keywords with their numbers, deck composition. Never the name, never the text.
- **Traits are mapped to neutral ids through `scratch/trait-map.json`**, and the map is
  the source of truth. A tool once re-derived the map as a sorted union and repointed every
  card's traits one slot off from a certain letter onward. "Read the map; never re-derive
  it."
- **Two importers, by lifecycle.** `convert-cards.mjs` regenerates whole data files and
  must never run once abilities have been hand-authored. `pull-sets.mjs` is the
  incremental path: it appends skeleton lines for ids not yet present, below a marker
  comment, never touching an existing line; writes printed text to
  `scratch/workpackets/<set>.json` for the authoring pass; extends the trait map; registers
  the deck lists; and supports `--dry-run`. A third tiny tool fills two numbers neither
  database records (an upgrade's stat bonus).
- **Skeleton, then author.** A skeleton is a card with stats and keywords and no
  abilities. Abilities are authored by hand from the work packet into the effect grammar,
  and the packet never leaves scratch. This is where transcription errors enter, which is
  what §2.6 is for.
- **Author what a registered deck needs, and nothing else.** ~590 skeletons carry no
  abilities by decision: no implemented deck uses them, so authoring them buys nothing.
  Recorded in PLAN.md under "Not planned" so nobody mistakes it for a backlog.

### 2.6 The transcription audit — the bug class nothing else catches

Load-time validation proves every ability in the data is *implementable*. Nothing proves
it was *transcribed correctly*, and the generated rules text paraphrases the data, so it
describes a mistranscription just as faithfully as a correct card. Tests cannot see this
class of bug. Two tools do:

- `tools/gen-source-names.mjs --diff` puts printed text beside generated text for every
  id and flags a number or keyword present on one side only. Report to scratch.
- `tools/audit-card-text.mjs` does the same for every card a registered deck plays, and it
  runs anywhere the repo does because the printed text comes from the committed pack: no
  dump, no network. It takes a deck range so a new wave can be swept alone.

What the audits found, each of which is a pattern to expect again:

- **Skeleton defaults are silent bugs.** A deploy cost defaulted to 5 when the database
  column was empty (nine leaders arrived two turns early); every imported upgrade was
  stamped "attach to friendly" as a default (twenty were wrong; the printed card only says
  "friendly" when it means it, so a printed word is evidence and its absence is too); every
  smuggle cost and piloting cost came out of the pull as 0, so nineteen cards were playable
  from the resource row for free. **A default that a real value would replace must fail
  validation when it survives to play**; invariant tests now assert no such cost is zero.
- **Presence of a keyword is not evidence the card is right.** Twenty-six cards carried a
  keyword and had lost their abilities; fifteen leaders had a deploy cost and an empty
  ability list, which is structurally valid. The check was rewritten to compare what the
  card *generates* against the printed text, not what fields it carries.
- **The describer can hide a whole ability.** A card was correct in the data and wrong on
  its face because the sentence generator rendered "the opponent draws" as "you draw".
  Every describer carries a comment naming its engine counterpart; the failure mode is
  silent.
- **Printed numbers over inferred ones.** Two sessions audited the same lists in
  parallel; one inferred piloting costs by a rule, the other read them from the CC0
  dataset. The merge took the read numbers and dropped the inferred ones, and the rule is
  stated in the merge commit. When a number cannot be read, state the inference rule in
  DEVIATIONS.md and add the test that fails when the real number arrives.
- **Re-run the audit after every authoring pass.** It found the same class three times.

### 2.7 The original theme

- **THEME.md is the setting bible:** the world, the factions that map onto the published
  game's traits, the recurring named champions and ships, and the two vocabulary words
  the theme renames. Names are invented from each card's own mechanics plus the setting
  guide. 414 names in the first pass, 200 more in the second; a placeholder names file
  covers every skeleton so the game never shows an id.
- **The art prompts describe subjects in original terms**, and that file is committed:
  it is why the art is defensible. The prompt rules (§8) include "never name the card"
  and "do not reproduce recognizable third-party costume design"; the QC checklist
  includes "franchise trooper helmets" and "crossguard blades" as failures.
- **A deck's printed-name mode and its original mode both need to read well.** The
  deck picker shows the tournament lists under the pack's names by default and the
  theme's names when toggled; both sets are registered for every deck.

### 2.8 Deviations are logged, never silent

DEVIATIONS.md records every deliberate divergence from printed behaviour — each a
digital-model simplification, not a missing mechanic — and every divergence from the
binding UI specs, with the reason. Entries are retired in the same commit that makes them
untrue (three were retired when a shield became an attachment). A reproduction project's
credibility rests on this file being honest; it is also where an AI session learns what
is intentional before "fixing" it.

---

## 3. Architecture — what carried over unchanged, and what the second project added

Everything in CARD-GAME-LESSONS §1 was repeated and held: no build step, IIFEs on one
namespace, the three-function engine surface, immutable `apply` (bought crudely with
`JSON.parse(JSON.stringify(state))` and never regretted), every UI affordance derived from
`legalActions`, structured log entries, cards as pure data, load-time validation, one
names file, generated rules text, seeded RNG. Additions:

### 3.1 The resolution queue is the whole game's control flow

Multi-step abilities, targeting, mulligan, setup, combat and nested triggers all run on one
mechanism: the engine pushes `{step, controller, op, ctx}` items onto `state.queue`;
`drainQueue` advances until a player choice is needed, then leaves the item at
`queue[0]` with `candidates` filled in, and `legalActions` turns those candidates into
`{type:'choose'}` actions. **A pending queue item owns the turn: only its choices are
legal.** Consequences that came free: the AI answers prompts through the same path as the
human, undo works mid-prompt, tests assert without a DOM, and the fuzzer exercises every
prompt shape.

- Nested triggers insert at the *front* of the queue, so the newest trigger resolves
  first.
- Per-invocation shared data lives in `state.efx[inv]`, not on the context object,
  because contexts are cloned apart by `apply`.
- **Simultaneous triggers are ordered by their controller as an in-game choice**
  (a `triggerOrder` step that re-batches the remainder after each pick). The first
  version always resolved them in push order, and a leader's "when you play a unit"
  buff landed after the unit's ambush attack had already swung.
- **Who acts is one function.** `SB.whoActs(state)` answers "whose input is needed":
  the queue step's `forcedBy` (an opponent choosing from a revealed hand) beats the step's
  `player`, which beats `state.active`. Before it existed the UI and the AI each took the
  hand's *owner* as the actor for "reveal your hand, opponent picks" and the game hung
  whenever the AI played that card.
- `legalActions` **throws** on a queue head that offers nothing; `processQueue`
  auto-skips steps with no candidates (discard with an empty hand). Failing loudly here is
  what keeps the fuzzer honest.
- **The forced-target deviation.** The log spec says never auto-resolve a sole forced
  target silently. The engine does, because a confirm-only click would tax the AI and
  every fuzz game; the *knowledge* the rule protects is restored by an `autoTarget` log
  entry with `notice: true` that the panel highlights with a card preview. Deviate,
  restore the value the rule protected, and say so at the code site.

### 3.2 The effect grammar grew by extension, not by edit

`ability = {trigger, condition?, effects}`; `op = {op, target?, amount?|amountRef?,
condition?, saveTargetAs?, useTarget?, then?, else?}`. `then` runs after the op; `else`
runs *instead* when it fizzled (no legal target, or an optional target declined). Both
nest. Conditions exist at ability level and op level; negation is `{if:'x', not:true}`.

When the competitive expansion needed ~25 new ops, new triggers, damage hooks, static
discounts and aura-granted abilities, they went into a second file (`js/ops2.js`) wired
through **hook tables** the core consults before it throws on an unknown condition,
amount reference or selector key (`SB.extraConditions`, `SB.extraAmounts`,
`SB.extraSelector`). The engine surface never changed. That file is now the largest in
the repo (2,800 lines), which is the cost; the benefit was that authoring 400 cards never
destabilised the core.

**Rules for a new op, unchanged and enforced:** the handler, a describer in the text
generator, and a test. Validation rejects unknown ops, triggers and keywords at load.
Every describer carries a comment naming its engine counterpart, because the text test
catches structural rot and only discipline keeps meaning in step.

**Saved targets stamp derived facts at save time.** "Deal 3 to a unit, then 2 to another
unit in the same arena" looked the first unit up on the board to find its arena; once the
3 damage killed it the lookup was empty, every candidate was rejected, and the log said
"finds no legal target" with an enemy still standing. `saveTargetAs` now stamps the arena.
Any selector that refers back to a chosen thing must survive that thing being gone.

### 3.3 One home for every rule

The most repeated engine bug in the project's history was a rule with more than one copy:

- Attach legality had four copies (play-from-hand, smuggle, a plot op, and the intended
  `SB.attachAllowed`); the three older ones checked only trait filters and silently
  ignored `uniqueOnly` and `damaged`, so an upgrade restricted to a unique unit offered
  every unit on the board.
- A unit's cost had five call sites reading `card.cost`, and leaders carry `deployCost`
  and no `cost`, so a 5-cost leader was "3 or less" to a removal spell. `SB.costOf()`.
- A pilot's contribution to its ship was read in two places, one of them from the wrong
  side of the card. `SB.upgradeStats()`.
- Shields were granted in several places; centralising into `SB.giveShield()` is what
  let "a shield is an upgrade" fire the attach trigger and retire a deviation.
- A leader-pilot upgrade never recorded its owner, so five call sites read the bearer's
  controller and destroying a stolen ship benched the *wrong* leader for the game.

Whenever a fix touches the second copy of a rule, extract the function and make every
path call it. Extract the predicate `legalActions` already uses rather than writing a
parallel one (the AI's `attackBlocked` term was extracted from the engine's own attack
predicate "so the two cannot drift").

### 3.4 Log attribution

`SB.log(state, entry)` is the only entry point (never `state.log.push`): it stamps
`cardId` for every uid-bearing field so a line stays nameable after the card dies, stamps
the owner as `side` only when both seats field the same name, and stamps `via` with the
card whose *triggered* ability is speaking, set automatically while the queue drains a
trigger so no call site opts in. The `via` rule came from a report of the AI cheating:
an attack, then the attacker's end-of-attack trigger playing a card and banking a
resource, printed as three identical "the opponent did X" lines. Correct engine,
unreadable log. Effects of a card someone *played* are deliberately not attributed; the
"played X" line above them already introduces them.

---

## 4. Content system — the skeleton-author-audit loop

The pipeline for a reproduced card pool, in the order it runs:

1. **Pull** mechanical fields from the dumps into skeleton entries (`pull-sets.mjs`),
   with placeholder names so nothing renders as an id, and work packets to scratch.
2. **Name** the cards a registered deck needs, from their mechanics and THEME.md.
3. **Author** abilities by hand from the packets into the effect grammar, adding ops,
   describers and tests as vocabulary runs out. A cheap agent can do the bulk authoring
   from a pattern script (the project kept one in scratch); the reviewer reads the
   generated text, not the packet.
4. **Audit** printed text against generated text (`audit-card-text.mjs`), fix every real
   finding, pin each with a test.
5. **Cover**: `tools/coverage.mjs` plays many random games with a recorder on the op
   dispatcher and lists cards never played and ops never resolved. Entries marked
   PLAYED (the card reached the board and the ability still never fired) are suspects;
   each gets a deterministic scenario test in `tests/test-suspects.js` that builds the
   exact position the ability wants and drives it through. First run: 97% of op usages
   resolved, 39 never fired, 18 on cards that had reached the board; one was a dead
   trigger (a context field never passed) that no other test could see.
6. **Play**, with the black box recording (§5.1), and fix what the table finds.

Things this loop taught that the day-one checklist should carry:

- **An empty ability list is structurally valid.** Fifteen leaders sat on the table
  doing nothing all game and nothing noticed. Add an invariant test: no leader a
  registered deck uses has an empty leader side; no keyword that carries a cost sits at
  zero.
- **A card can reference another printing of the same character.** Conditions that
  name a character must name every printing; rendering that exposed "control X or X or Y"
  (dedupe on the rendered name, join as prose).
- **Tokens and leaders can share a set number.** Seven leaders displayed under a token's
  name until the generator indexed leaders separately.
- **Inline markup in the dump is data, not text.** Bullets and the unique-insignia tag are
  translated (the tag becomes the theme's word); any *other* tag fails the build. A dump
  that gains a tag you have never seen should stop the generator, not print `</bullet>`
  on a card face.
- **A keyword's bracketed cost is a face stat and may be absent from the text dump.**
  Piloting costs were not recoverable from the printed text and had to come from a
  second dataset.
- **Digital-model simplifications are fine when logged.** "Choose up to N" as repeated
  single picks with a Stop action; "name a card" restricted to cards the opponent has
  already revealed; damage-replacement "you may" decided by the engine (a prompt inside
  the damage routine would stall every combat). Each is in DEVIATIONS.md with the reason.

---

## 5. Testing — what the suite grew into

252 tests at hand-off, up from 50 at the first PR. The layers, and what each is for:

| Layer | What it guards | Notes |
|---|---|---|
| Engine core, combat | rules, immutability, reproducibility | position helpers set state directly; each test states its premise in 2–3 lines |
| Text quality | every card renders clean generated text | day-one guard from the predecessor, built first this time; holes, doubled spaces, lowercase starts, `undefined`, broken punctuation |
| Expansion | one test per authored card class and per bug | 108 KB file; the regression record of the whole project |
| Suspects | abilities random play never reached | fed by `tools/coverage.mjs` |
| Log | every log type has a describer; attribution rules | fuzzes real games and fails on any type that reaches the fallback |
| AI | pinned decisions with margins, negative controls | noiseless mode; a failure means the reasoning changed |
| Anim | the pure `plan()` of the animation layer | the only UI code the headless suite can reach |
| Fuzz | no throw, no dead state, termination; deck matrix | crash gate, not a balance readout |

**Rules that held up:**

- **Two entry points, one script list.** The Node runner parses `tests.html`; the audit
  and coverage tools load the engine the same way. Nothing else knows the load order.
- **Prove a test bites.** Every PR that pinned an engine fix reports having reverted the
  fix and watched the test fail. Several tests written before this habit passed for the
  wrong reason.
- **Pair every negative with a positive.** A fix that refuses illegal attachments needs
  the test that a legal one still attaches, "so the fix can't pass by simply refusing
  everything."
- **Budget the matrix.** A full matrix over 36 decks was ~1,400 games and blew the
  runner. Precons keep the full matrix; each competitive deck plays a fixed trio of
  precons from both seats, which still exercises every card in it. Know the runner's
  budget before the registry grows.
- **Check cards by what they generate, not by what fields they carry.** The three
  audit classes in §2.6 all passed field-level checks.
- **Some UI code can be made testable by splitting it.** `js/anim.js` is
  `plan(prev, next, log)` (pure, tested headless) and `run(steps)` (DOM). The recorder
  has a `--selftest` that records a random match in the format it writes and replays it,
  because the browser suite cannot reach UI files and drift between writer and reader
  would otherwise be found by the first real bug report.

### 5.1 The black box: every match is a replayable trace

`js/bugreport.js` records the seed, both deck ids, the difficulty and every action either
seat applied, with the structured log entries each produced, any error thrown, and counts
(never contents) of the position. Because the engine is deterministic in exactly those
inputs, a report is a replayable match rather than a screenshot. The player presses
**Flag a bug** the moment something looks wrong, says what they expected, and the note
pins the exact action index, which nothing else can recover; the dev server takes the
file into `traces/` over `POST /__trace/<name>` (scrubbed to a basename, size-capped), and
from `file://` or the deployed site the browser downloads it instead.

`tools/replay-report.mjs` re-runs it against the real engine (AI moves replayed, not
re-chosen, so a report survives AI changes) and reports three kinds of trouble, each a bug
on its own: **ILLEGAL** (the UI offered an action the engine would not have), **THREW**,
and **DIVERGED** (the same action produced different log entries than in the browser). A
clean replay ending in a flagged note means the engine is consistent and the bug is in the
card's rules or its op. Build this before the first playtest; it turns "the card did
something weird" into a file.

### 5.2 Parallel sessions and stale branches

Two AI sessions ran the same audit from the same commit; half of one PR was already on
`main` by the time it was reviewed, and the merge had to resolve overlaps *toward the
more faithful version* rather than whichever landed first (PR #16's body is the model:
what was taken, what was resolved and why, what was not taken because it would regress
`main`). Two other branches sat 100 commits behind and were never mergeable; their
findings were re-checked one by one against the current engine and only the still-broken
ones ported. Lessons: one audit per commit range at a time; a branch older than a day is
a list of findings to re-verify, not a diff to merge; and the merge commit must say
which side won each overlap.

---

## 6. AI — the measurement discipline that replaced argument

The machine is unchanged from the predecessor: enumerate `legalActions`, apply each,
settle forced choices greedily, score `sideValue(me) − sideValue(them)`, pick the best.
Easy adds noise and a blunder rate; Mid settles with small noise; Hard is noiseless with a
one-ply reply penalty. `docs/ai.md` holds the weight table with a cited reason per weight
("cite a reason or don't change it"), and every experiment with its result. What the
second project added is a *measurement harness* and the record of what it disproved.

**The tools.** `tools/ai-balance.mjs` plays the deck matrix at a difficulty and seed
(reproducible from `--seed`); `tools/ai-trace.mjs` replays one seeded game and records
every candidate's score through an opt-in, behaviour-neutral hook; `tools/ai-fingerprint.mjs`
reports what the AI *does* with a deck (attack share, claim timing) beside random play.
Together they answer "which deck is misplayed", "where", and "how".

**The findings, in the order they were learned:**

1. **Random play is the control.** The 16-deck matrix showed a 54-point spread under the
   AI and 29 under uniform random play. The AI nearly doubled the apparent imbalance; a
   deck that was third strongest under random was third weakest under the AI. Never read
   a deck spread without the random control beside it.
2. **The seat-1 win rate is the one number that must be ~50%.** It was 50.3% under the AI
   and 49.9% under random; every later change was checked against it.
3. **Ties decide a fifth of the AI's play.** Resource banking scored every candidate
   identically, so which card was banked was list order. A "sensible" tiebreaker (decay
   by castability) made the AI *worse* by 9 points of spread: a systematic wrong choice
   beats random only when the systematics are right.
4. **"Reverted" in a doc is not a revert.** The failed heuristic stayed live for three
   days because the commit that recorded the failure touched only the doc, and every
   measurement in that window was taken on it. Check the diff.
5. **A term that fires on one card in 1,527 is a correctness fix, not a strength fix.**
   `lockedPower` fixed a blunder watched at the table and moved 6 games in 1,520. Count
   the mechanic's frequency in the pool before expecting winrate from a weight.
6. **A deck-vs-deck matrix cannot say whether the AI got better** (mean 50% by
   construction). Split the weights into profiles and run the new profile *against* the
   old one, every pairing twice with seats swapped, 760 games, standard error ~1.8%.
7. **A 38-game per-deck row invites a story that survives until measured.** Two
   mechanisms hypothesised from a −23.7 row were both falsified. Aggregate first; chase a
   deck-specific effect only at 6+ games per pairing.
8. **Four carefully argued weight terms measured at 49–50%; one extra ply of search
   measured at 62.1%.** The engine alternates strictly, so any setup-then-payoff line has
   an opponent action in the middle and does not exist at one ply. No weight can price
   what the search cannot reach. Width mattered too: weighing only the opponent's single
   best reply captured a third of the gain.
9. **Competition earned its name by extracting decks more evenly than random play does**
   (spread 35.5 vs random's 50), not by beating Hard. The three decks it still fumbles are
   the ones whose plan lives in deck-specific knowledge rather than in position value.
10. **A locked-out player owns nothing in a unit that dies at regroup.** The AI took the
    initiative (an irreversible exit from the phase) while a temporary unit still had a
    legal attack. Discounting the unit's *body* measured backwards in two ways and was
    reverted; the fix scopes to the lock and leaves attack incentives alone.
11. **A flat penalty on holding cards does not work** (the idle-pass gauntlet). Recorded
    so nobody re-runs it.

**Known gaps carried forward, honestly labelled:** no initiative-timing policy (checked:
the claim rate that looked like early claiming was random passing at arbitrary moments);
currencies not valued in the base profile; banking still tied; greedy settling of long
divided-damage chains.

---

## 7. Interface — decisions and the reasons behind them

The three specs carry the detail and are binding; this is what the project decided on
top of them, with the failure that motivated each.

**Screen-level**

- **The board is the whole window.** Everything that is not the board is a title screen,
  a drawer, or a centred panel. The top bar went; round, turn and initiative moved to a
  short-lived centred banner plus a glow on the initiative holder's leader slot; history
  and the controls moved into a drawer that *overlays* rather than displaces, so opening
  it never moves the board. The mat is the flex column's one yielding row (height from
  what the hands leave it, width from the aspect ratio), after a fixed 62% share left a
  black band on wide windows.
- **The board is drawn, not photographed.** A generated photo of a card table was
  de-keystoned and the twelve zone rectangles hand-measured into CSS; the painted outline
  and the DOM hitbox were two sets of numbers that drifted twice, the image was not in the
  repo, and its labels were pixels. `js/boardart.js` now holds one geometry table in a
  2048×1280 board space, draws each slot as SVG and places the DOM zone on it: the outline
  and the hitbox are the same numbers by construction. The opponent's row is the player's
  row mirrored, so each player reads their own row in the same order from their side.
  Your zones are one faction colour, theirs the other; arenas, being shared, use a neutral
  warm/cool pair.
- **Deck choice is a screen, not a dropdown**, because picking a list is the point of the
  tool and a dropdown hides nineteen of twenty; hovering a deck peeks its leader and base
  at full size, because picking between twenty names without them is picking blind.
  "Surprise me" draws only from the competitive group: starters are teaching decks, worth
  picking deliberately.
- **Scrollbars are suppressed everywhere**; anything that would strand content out of
  reach is fixed by making it fit.
- **The opponent's hand is on screen as card backs**, one per card, because a count in a
  text line tells you the number but not the shape of the threat.
- **The mulligan and every other choice is the centred choice panel**, which can be
  peeked past without answering.

**Cards**

- One renderer at three sizes; art edge to edge under a scrim; text floats on the art
  with shadow, never a plate. The scrim numbers came from sampling luminance under the
  text across every card, not from opinion; when a background fights its cards, raise the
  scrim, never lighten the art.
- **Per-aspect border colours were removed.** Players read a coloured edge as "this card
  is playable" rather than as faction identity, because the border is where the
  interaction rings live. Identity moved to corner pips and coloured aspect words in the
  text.
- **Hand cards you cannot pay for are dimmed with the cost pip in damage red**, only on
  your own turn in the action phase with no prompt open, and only when the engine
  confirms cost is the limiting factor (`SB.cantAfford`). Hover restores full opacity; a
  state treatment never hides the art.
- **Face-down cards show the shared card back.** The card back is the one master that
  ships with the repo because it is hand-supplied branding no generator can rebuild.
- Leader and upgrade cards show their stats; an aspect named in rules text is drawn as
  the pip it refers to; run-together aspect icons from the dump are split.
- **The hand is a flat centred row with CSS overlap**, not a fan. `CARD-FANNING-SPEC.md`
  §1 has the six-item checklist; two failures mean ship the flat row. The row overlaps
  by a `--n` count, and covered cards hide their text plates because a dozen truncated
  names read as one card's words spilling onto the next.

**Choices and targeting**

- Targeting is a `pendingChoice` on state; three UIs chosen automatically by whether the
  player can see the options (board highlight / centred modal with card faces / buttons);
  hidden-pile choices show real card faces because answering "activate this" without
  seeing "this" is not a decision.
- Four role colours applied only from `legalActions` and the pending choice; actable is
  marked, destinations are not.
- The prompt line always says what the game is waiting for, echoed in the middle of the
  arenas as well as in the drawer; the card says *what*, the UI appends *how*.
- Binary, peek and arrange buttons say what they do, not "OK".

**Animation and feedback**

- **Every hit is drawn before the board redraws**: `plan()` turns one apply's fresh log
  entries into steps, `run()` plays them on the *old* board so a defeated card is still on
  screen to die, then the redraw fires. Ranged attacks are a sprite bolt coloured by
  aspect; melee is the attacker card lunging (derived from traits; card data has no such
  field); defeats shrink into the owner's discard; events fly from the spotlight to the
  pile. Input is locked under an overlay during playback; any click or key skips; a
  drawer button cycles full / quick / off.
- Log-driven sound is voiced at the moment of the picture, not at apply time.
- The end of a match plays a generated victory or defeat clip, with the audio finale as
  the fallback when the file is missing.
- The turn banner is `pointer-events: none` so it never blocks the board.

**Traps added to the predecessor's list** (each cost a session):

- A keyframe that touches `transform` outranks an inline transform while it runs; the
  peek refused to scale until the keyframe animated opacity only.
- Card stacking order goes in a `--z` custom property, not inline `z-index`, so the
  stylesheet's hover raise still wins.
- `touch-action: none` on draggables is the single line that makes drag work on a phone.
- A freshly created `<img>` is not painted in the frame it is inserted; cache one decoded
  prototype per file and clone it, with `decoding = 'sync'`.
- Use `dvh`, not `vh`, for anything that must fit under mobile browser chrome.
- **iPadOS audio:** SFX through cloned `<audio>` elements while the score ran on Web Audio
  left the `AudioContext` parked (suspended or interrupted) and silent, with no error.
  One audio graph for everything, clips decoded once and fired as buffer sources, and a
  `wake()` that resumes the context on state change, any gesture, visibility regain and a
  1-second poll. This class cannot be reproduced headlessly; test on the device.

---

## 8. Art direction and pipeline

**Style.** Chibi super-deformed, cel shading, saturated colour, used-future science
fiction, wordless image. Chosen for function: it reads at 34px, forgives generation
anatomy errors, and is a genre tradition rather than anyone's property. The `STYLE`
string in `tools/gen-art.mjs` is byte-identical across every prompt; that constant is what
makes 800+ generations read as one set. Subjects are one line per card in
`tools/art-prompts.json`, committed, in original terms.

**Model and format.** FLUX.1-schnell through the Hugging Face router (nscale provider),
512×704 portrait for cards, 1024×640 for arena panels, re-encoded to WebP at quality 90
on the way to disk (about 10× smaller than PNG at no visible cost). Sprites for the
battle effects are asked for on pure black and keyed to transparent WebP. The two
end-of-match clips are re-encoded for delivery with a shrink tool. The first Pages
commit was 656 required renders and 22 sound files at 37 MB; the tracked assets are
47 MB today.

**Prompt rules** (`docs/ART-PROMPT-RULES.md`, eighteen rules earned over three rounds;
the ones that generalise):

1. Never name the card; the model renders titles as on-image text.
2. Never use text-magnet nouns (sign, banner, flag, insignia, label, display *showing*
   anything, nameplate). Crowded public settings (market, concourse, cantina, plaza,
   spaceport, street) are the single biggest text source; describe the space physically
   instead. Naming a room by its function prints that word on a wall.
3. Never negate. "Drapes with no writing on them" produces ghost lettering; describe
   positively. The style block's blanket "no lettering" clause is fine; per-card negations
   are not.
4. Always state the environment; events are situations with at most two or three
   fully-visible figures, each with an explicit body action and a stated contact.
5. Exact counts above two are unreliable; write "a group of".
6. Restate the proportions in the subject line when a humanoid stands in a detailed
   environment, or the figures drift realistic.
7. Genre-lock the vocabulary. For this project: no knight, robe, princess, magic, sword,
   stone walls, cathedrals (they drag the render medieval); formal dress defaults to
   present-day suits unless given invented formal vocabulary. The next project's genre
   will have its own list; build it from the first twenty test renders.
8. Do not reproduce recognisable third-party costume design; flag any render whose armour
   or weapon reads as a specific franchise's. The working phrasing for the energy blade
   took three rounds to find and is recorded verbatim in the rules file.
9. The model signs its work in a bottom corner about a third of the time; crop ~4% off
   the bottom at the pipeline level, since wording does not stop it.
10. Regeneration is not monotonic: re-rolling a passing image can make it worse. Only
    regenerate cards that failed, and archive the previous version so a good render can
    be restored.

**QC at scale.** `tools/art-thumbs.mjs` tiles 16 thumbnails per contact sheet; hand the
sheets to one cheap model with the failure checklist (lettering or signatures, crossguard
blades, franchise helmets, sailing ships and flags, broken anatomy, wrong subject) and
look only at flagged tiles yourself. Never view full-size renders in the main context.

**Pipeline conventions** (the predecessor's, confirmed): idempotent, `--dry-run` free and
printing the whole plan, `--only` exact-match, `--force`, `--limit`, key resolution
flag → env → gitignored file, 429 back-off. Masters stay out of the repo; delivery
formats only are tracked. Sideboard-only cards get no art by decision, and
`tools/check-pages.mjs` requires art only for what a registered deck can show.

**The photo route failed.** A generated table photo needed de-keystoning, patching of
baked-in placeholder text, and hand-measured zones; three tools were written for it and
the board was then redrawn as SVG. The tools survive as general-purpose image utilities.
Generate art for things that are *pictures*; draw things that are *geometry*.

---

## 9. Audio

- **SFX** from the ElevenLabs sound-generation API, one clip per structured-log sound tag,
  same generator conventions as art. Tags the engine emits that have no clip are ignored,
  so the engine can tag sounds that do not exist yet; retired clips are aliased.
- **Music** from the ElevenLabs Music API: three loop tiers keyed to the lowest remaining
  base HP (stately / urgent / frenzied) plus a major-key and a minor-key finale. All five
  prompts share one byte-identical musical brief (same key, motif and orchestra) so the
  tiers read as one piece intensifying, the same trick as the art style block.
- **Looping** needed trimming to the sustained body by RMS envelope, not just silence
  trimming: a generated fade-out is loud enough to pass a silence test and the loop
  sounded like the piece ending and restarting. Crossfade between tiers; no fade-in on the
  opening tier.
- Music plays through the end-of-match video only after the video, and never when the
  clip carries its own audio.
- One `AudioContext` for everything (§7, the iPad lesson).

---

## 10. Deployment

- **GitHub Pages serves `main` at the repo root**; no workflow, no bundler, `.nojekyll` so
  files are served verbatim. The live site is exactly what is committed, so delivery
  assets (`art/*.webp`, `art/fx/*.webp`, two `.mp4`, `sfx/*.mp3`) are tracked and
  everything else under `art/` and `sfx/` is ignored. Commit an art batch once, after QC,
  not per regeneration: every regenerated file stays in history forever.
- `tools/check-pages.mjs` lists every asset the scripts can ask for that is missing from
  disk or untracked and exits 1 on a required gap; the test runner has no filesystem, so
  this is a tool rather than a test.
- `SB.artUrl(cardId)` in `index.html` is the only place an image path is built, so moving
  assets to a release or a CDN is a one-function change if bandwidth ever matters.
- The deploy went from 353 MB to 41 MB by shipping WebP instead of PNG and shrinking the
  two clips. Do the format decision before the first asset commit.
- **A zero-dependency dev server** (`tools/serve.mjs`) with cache disabled is worth the
  hour: `file://` works for play but not for the trace upload, and a cached script during
  a fix pass cost a session.
- **Not done, and should be:** a workflow that runs the headless suite on every push to
  `main`, so a broken deploy is a red check rather than a discovery. And a mobile pass on
  the live URL; Pages is the first time a phone reaches the game.

---

## 11. Working process

Carried from the predecessor and confirmed: a user's diagnosis is a symptom report, not
a root cause; measure instead of eyeballing; read the DOM when screenshots are
unavailable; comment the *why* on every weight, penalty and non-obvious branch. Added:

- **HANDOFF.md for a fresh session.** Where things stand, the exact commands, the open
  work in agreed order, and the token-budget rules. It paid for itself every time a
  session started cold.
- **Token budget rules, after hitting the usage limit twice:** never view full-size
  renders in the main context (contact sheets plus a cheap model); read large files by
  range or grep, never whole; one cheap agent at a time on the dev machine; if a cheap
  agent underperforms, fix its brief and rerun rather than taking over its bulk work;
  commit at checkpoints and report, rather than one long autonomous run.
- **Commit messages describe the mechanism, by id.** The history reads as a bug diary
  ("Nineteen cards were smuggling into play for nothing"), which made writing this file
  possible. Never a card name, never a printed sentence.
- **Every plan document carries a dated Status section** that is rewritten when reality
  changes. PLAN.md, PAGES-PLAN.md and docs/ai.md all did, and each rewrite recorded what
  the previous version got wrong.
- **Docs that claim a code state are checked against the diff** (the "reverted" lesson).
- **Tooling on Windows:** Git Bash eats backslashes in `sed -i` and `node -e` regex
  literals; write such lines from a heredoc file. Never open the browser pane from an
  agent on that machine.
- **When the user says "faithful, no cuts", log every simplification** rather than
  arguing each one; DEVIATIONS.md is the argument.

---

## 12. Day-one checklist for the next project

The predecessor's ten items still apply. Add:

1. `.gitignore` before the first tool: key files, `scratch/`, masters, `traces/*.json`,
   superseded generations. Commit it alone.
2. **Decide the id space** (set code + number), the trait-id scheme (append-only, mapped
   in scratch, never re-derived), and the deck-id scheme, before the first import.
3. **Decide the `terms` list**: every franchise word that generated prose would otherwise
   contain. Put the theme's words in `names.js` and the published words in the generator's
   `TERMS`.
4. **Check the working title and every faction name against the card dump** before
   they reach a filename, a URL or `package.json`.
5. NOTICE.md with the three-tier posture, the same-commit rule, and the title-screen
   disclaimer string in `names.js`.
6. The generator for the source-name pack, its `index.html`-only script tag with the
   "absent → benign 404" comment, and the test that asserts the pack is absent under
   test.
7. The importer's boundary: scratch dir as `argv[2]`, header comment on every tool saying
   which side it writes to, packets to scratch, skeletons to the repo.
8. Invariant tests for skeleton defaults: no cost-bearing keyword at zero, no empty
   ability list on anything a deck uses, no leader deploy threshold at a default.
9. The audit tool that compares printed text (from the committed pack) with generated
   text, and the coverage tool that finds abilities random play never fires.
10. The black box and its replayer, with `--selftest`, before the first playtest.
11. `docs/ai.md` with the weight table and the random-play control the first time the
    matrix runs.
12. A CI workflow running the headless suite on push.
13. `tools/serve.mjs`, `tools/check-pages.mjs`, `.nojekyll`, README with the live URL and
    the disclaimer line.

---

## 13. Applying this to the Final Fantasy Trading Card Game

Same posture, same architecture. The mechanics are functional and will be implemented
faithfully; every name, sentence, image and sound will be original; the published names
and printed text will exist in one generated, switchable, withdrawable file. What differs
is below. Rules details are this author's reading and must be checked against the
official comprehensive rules before the engine skeleton is written; the point of listing
them is to show where the SWU-shaped engine needs to change.

### 13.1 The IP surface is larger, and the art tier is stricter

- **The card art is the franchise's own character and scene art** (illustrations and
  renders from the video games). Tier 3 is even more clearly off the table than it was for
  a licensed movie property; the project's own art in an original style is the only
  option, and the style must not imitate the games' character designs. The art prompt
  rules need a franchise-costume checklist from day one (signature weapons, hairstyles,
  named creature silhouettes), and the QC checklist must name them as failures.
- **The characters are the product.** Card names are character names across dozens of
  games; the tier-1 reasoning (a name identifies the card it identifies) is unchanged, but
  every name is also a strongly protected character, so the theme's original names are
  not a fallback, they are the game. The pack is the convenience layer.
- **Categories are functional identifiers that happen to be the games' titles.** A card's
  category (the roman numeral of its source game, and a few named sub-series) is referenced
  by rules text ("if you control a Category X Forward"). Treat categories exactly like
  SWU traits: neutral ids in card data, theme names in `names.js`, the published words in
  the pack. The theme needs an original set of "worlds" or "eras" to stand in for them.
- **Jobs are a second trait axis** with the same treatment; many are generic words, some
  are franchise-specific, and the pack handles both.
- **Elements are generic words** (eight of them) and can stay as-is, like SWU's aspects
  did, but the two special ones carry deck-building restrictions the validator must know.
- **The publisher has its own published fan-content terms.** Read them before choosing
  what the pack contains by default; they may settle the printed-text tier one way or the
  other, which SWU's publisher never did explicitly.
- **Printed text is dense with inline markup** (element glyphs, the special-ability icon,
  the EX Burst tag, card references in brackets, damage-trigger keywords). The
  generator's "unknown tag fails the build" rule matters more here; expect a translation
  table three times the size of SWU's.
- **Data sources:** the official card browser exposes a JSON card list, and community
  deck sites publish deck lists. Same rule: dumps to scratch, only mechanical fields cross,
  numbers checked against a second source when two disagree.

### 13.2 Engine differences that change the skeleton

- **There is a stack and instant-speed play.** SWU alternates single actions with no
  responses, and the AI's two-ply exchange search leaned on that. FFTCG lets either player
  play summons and activate abilities in response, resolves last-in-first-out, and passes
  priority. The queue from §3.1 stays (it already models "the game is waiting for a
  player"), but it must grow an explicit stack with a priority holder, a response window
  after every play and every attack declaration, and "both pass in succession resolves
  the top". `legalActions` for the non-active player is no longer empty. This is the
  single largest engine change; build it in Phase 1 with fuzz coverage, not later.
- **No leaders, no bases.** The loss condition is seven damage; damage is dealt as cards
  from the top of the deck into a damage zone, and **a damage card with an EX Burst
  ability may be resolved as it is dealt**. That is a random trigger from a hidden zone,
  which the seeded RNG and the replayable trace handle, and which the AI evaluator must
  price (damage zone count replaces base HP; deck-out is a second loss condition).
- **Resources are Crystal Points produced per turn, not a permanent row.** CP comes from
  dulling a Backup (one CP of its element) or discarding a card from hand (two CP of the
  card's element), and unspent CP vanishes. Costs are paid partly in a specific element.
  The evaluator's `resource` and `readyResource` terms become "Backups on field by
  element" and "cards in hand as CP", and the SWU banking tie problem becomes a discard
  choice problem: which card to burn for CP is the decision the AI will tie on.
- **Four card types with different lifetimes:** Forwards (attack, block, take damage
  measured in thousands), Backups (stay, produce CP, limited to five), Summons (resolve
  and go to the break zone, at instant speed), Monsters (field permanents that are not
  Forwards). The unit/upgrade/event split maps loosely; do not force it.
- **Combat is one attacker, one blocker.** No arenas, no sentinel; instead: active/dull
  state, party attacks by same-element Forwards, a single blocker chosen by the defender,
  first strike, Brave (attacking does not dull), Haste, Back Attack (played during the
  opponent's turn), Freeze (does not activate next turn), and damage that clears at end of
  turn. Combat is simpler than SWU's; the response windows around it are not.
- **Deck rules:** fifty cards exactly, a copy limit (verify whether it counts name or card
  number; reprints share names), and restrictions on the two special elements. The
  validator needs all three before the first deck registers.
- **Later sets add mechanics** (multi-element cards, and newer resource-like tokens);
  scope the first pool to a format and a date, as SWU's tournament lists did, and let the
  extension file take the rest.

### 13.3 What transfers without change

The three-function surface, the immutable state, the queue, the effect grammar and its
extension hooks, `names.js` with `terms`, the generator and its guards, the audit and
coverage tools, the test harness and runner, the black box and replayer, the card
renderer and its specs, the drawn board (with a new geometry table: no arenas, a damage
zone, five Backup slots, a break zone), the art and audio generators and their
conventions, the Pages deploy and its gate, the AI machine and the measurement harness.
The first week's work is the stack and the CP economy; everything else is a copy.

### 13.4 Vocabulary decisions to make before writing prose

The theme must decide, in the `terms` table, its own words for: the resource points, the
damage-zone trigger keyword, the four card types if the theme wants its own (the
published words are generic English and may be kept), the break zone, and the names of
the special-ability icon and any token the pool uses. Everything generated (rules text,
log lines, prompts, keyword help) reads these at render time; the pack swaps them with
the names. Decide them once; renaming later touches every describer.
