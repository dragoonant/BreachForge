# Lessons from BreachForge — starter guide for the Marvel Rivals card game

Distilled from building BreachForge: a browser reproduction of **Riftbound: The League of Legends
TCG**, played against an AI, with original art and sound. This is the **fourth** document in the
series — `CARD-GAME-LESSONS.md` (MegaRobotWar), `CARD-GAME-LESSONS-2.md` (Starbound Legions /
Star Wars: Unlimited) and `CARD-GAME-LESSONS-3.md` (Crystal Wars / FFTCG) came first. Every rule
in all three still applies unless this file says otherwise; where they disagree, the later
document wins, because it is the later evidence.

**Read this section before anything else, because it changes more than any handoff in this series
has changed before.**

Projects 1 through 4 were all **reproductions of published card games**. Every rule in the three
earlier documents is written for that situation: there is a printed card, it has correct
behaviour, your job is to match it, and a divergence is a defect. The whole apparatus — the
printed-text pack, the audit tool that diffs generated prose against printed text, `docs/rules.md`
as a citation index, DEVIATIONS.md as a register of unmet printed behaviour, the fuzzer's deck
matrix as a crash gate and explicitly *not* a balance readout — exists because someone else
already designed and balanced the game and wrote the rules down.

**Marvel Rivals is not a card game.** There is no printed text, no rulebook section to cite, no
community card dump, no tournament decklists, and no pool that a thousand players have already
proved is playable. You are not reproducing a card game. You are **designing** one, and using a
video game as its source of flavour, identity and mechanical inspiration.

That single fact rewrites four of the series' load-bearing assumptions. §7 is about what replaces
each of them. Read §7.1 before you write a line of code, and do not let the earlier documents'
fidelity language carry you into building an auditor with nothing to audit.

The good news is that everything *structural* transfers, and more of it than usual: the engine
surface, the resolution queue, the effect grammar, the two-entry-point test harness, the black
box, the art and audio pipelines, the AI machine and its measurement harness, and all three UI
specs. BreachForge's own engine is 10,800 lines and about two days of it was novel.

Copy into the new repo root on commit one, and point `CLAUDE.md` at all of them:
`CARD-GAME-LESSONS.md`, `CARD-GAME-LESSONS-2.md`, `CARD-GAME-LESSONS-3.md`, this file, plus the
three binding UI specs (`CARD-PRESENTATION-SPEC.md`, `CARD-LOG-AND-TARGETING-SPEC.md`,
`CARD-FANNING-SPEC.md`), which are written game-agnostically and have been binding for three
projects running.

Nothing here is legal advice. It is the record of the posture one hobby project took, the
reasoning behind it, and the engineering that makes the posture cheap to keep.

---

## 1. What BreachForge became, and the calibration numbers

Three days, 2026-09-19 to 2026-09-21. 89 commits.

| | Starbound Legions (2) | Crystal Wars (3) | BreachForge (4) |
|---|---|---|---|
| Days / commits | 10 / 149 | 6 / 71 | **3 / 89** |
| Content | 2,277 registered, 412 authored | 406 cards, all authored | **264 registered, all authored, 20 decks** |
| Tests | 252 | 444 | **90 in 4 suites** |
| Code | ~43,000 lines | ~12,200 js | **10,824 js · 5,256 data · 1,677 tests** |
| Grammar | — | ~120 ops | **~180 ops, every one with a describer** |
| Art | 800+ renders | 406 renders, 8 board paintings | **265 card renders, 4 board paintings** |
| Audio | generated SFX + 5 music tiers | 4 CC0 tracks, **no SFX** | **synth kit + 15 generated one-shots + 4 CC0 tracks** |
| AI | full harness, 760-game runs | harness built, **never measured** | **arena built and run; `competition` beat `hard` at 81% of 42 decisive shuffles over 200 holdout pairings** |
| Audit | — | 65 real defects found | **0 findings across 250 cards** |
| Shipped | GitHub Pages | never deployed | **not deployed — deliberately (§5.1)** |

Read that table as the scheduling lesson and as the encouraging one. Three days, because
**everything that took project 3 a week was a copy**: the queue, priority, the payment solver,
targeting, the describer family, the test harness, the black box, the art pipeline. The novel work
was battlefields, the two-currency economy and the score clock — exactly the three things project
3's handoff predicted would be novel, and it was right about all three.

**The commit arc**, because the next project will follow a similar one: `.gitignore` alone →
scaffold with the regime decisions written down → engine spine in one commit → interface in one
commit → **ten days' worth of ability-pack authoring compressed into eight commits** → the
targeting retrofit, twice, both times triggered by a player report → the audit tool → 0 findings →
sound → the arena → the AI weight sweep → **the UI pass (log drawer, chain viewer, spotlight,
piles inspector)** → worktree and asset-stamping discipline.

Note what the *last third* is made of: presentation, measurement and process discipline, not
engine. Same as project 3. Budget for it.

---

## 2. The owner's standing instructions

Carried from project 3's §2 and confirmed, plus what is new. Items marked **decide again** are
open for the next project.

1. **Playable first, not endless tests.** This is now written into the owner's global preferences
   and it is the most important scheduling instruction in this file: *get something he can open,
   click and play in front of him as early as possible, then iterate*. Do not spend a large budget
   on engines, suites or verification loops that leave him with nothing to use. Keep automated
   tests to what protects a working build. **Order multi-stage work so every stage ends in
   something visible**, and say what he can try. BreachForge had a clickable board with an AI
   opponent on commit 4 of 89.
2. **Fidelity is the product** — a divergence from printed behaviour is a defect to fix, never a
   design choice. **This one changes meaning completely for Marvel Rivals; see §7.1.**
3. **Nothing playable contains content that does not work correctly.** `data/defects.js` plus a
   deck-picker filter. Build it on day one, empty and wired. It ended at empty here.
4. **Show the player the real thing.** Printed text verbatim on the face, printed icons rendered as
   icons, no generated paraphrase. **Decide again** — for an original design there is no printed
   text, and this reverts to generated prose (§7.1).
5. **Verify in the real app, not just in the suite.** Every UI commit message ends with what was
   checked in a browser on the real code path. Green tests plus a broken page happened twice in
   project 3, and the suite was green throughout both.
6. **The interface should be beautiful and explained.** Painted art everywhere, music on every
   screen, a How-to-play sheet, an opening video behind the title, a log you can read, a chain you
   can see, a zoom that puts the text beside the card.
7. **Commit messages describe the mechanism, by id.** The history reads as a bug diary. It is what
   makes these handoff files writable and it is the cheapest documentation you will ever write.
8. **Art direction is the owner's call, recorded, and not re-litigated.** For BreachForge: each
   champion recognisable by silhouette, palette, hair and weapon class, in an original style.
   **Decide again** before the art pass (§7.6).
9. **State a concern once, in writing, then build what was asked.** In the file that exists to hold
   it — NOTICE.md, DEVIATIONS.md, the art-rules header. Not in the middle of the work, not twice,
   and never by quietly delivering less. Scaling the project down is the owner's call.
10. **One agent per worktree** (§4.1). New this project, and it earned its own hard rule the hard
    way.

---

## 3. What this project confirmed — repeat without re-arguing

Everything in `CARD-GAME-LESSONS.md` §1, `-2.md` §3 and `-3.md` §4 held for a fourth time. In
short:

- **No build step.** Plain browser JS, IIFEs on one `window.RB`, script order declared in
  `index.html`. It runs from `file://` and from a 40-line dev server.
- **The engine surface is exactly `legalActions` / `apply` (immutable) / `isTerminal`**, plus
  `whoActs(state)` as the one answer to "whose input is needed". `apply` deep-copies and nobody
  has ever regretted it, across four projects.
- **Every UI affordance derives from `legalActions`.** The UI cannot invent a rule.
- **One resolution queue is the whole control flow.** A pending queue item owns the turn; only its
  choices are legal; `legalActions` throws on a queue head that offers nothing.
- **Cards are pure data; abilities are data.** New vocabulary goes into extension files wired
  through hook tables, never by editing the core. **New op = handler + describer + test**, and
  validation rejects an op with no handler while the describer throws on an op with no prose — so
  neither half can be forgotten.
- **An ability the grammar cannot express fails authoring loudly**: `{ unimplemented: 'why' }`,
  which validation rejects from any registered deck. BreachForge ended at 0 unimplemented across
  three packs. This rule is the single biggest quality lever in the series and it cost nothing.
- **A default that a real value would replace must fail validation.**
- **Load-time content validation, seeded RNG with every shuffle inside `apply`, one names file,
  structured log entries with `data` and automatic `via` attribution, deck registry decides the
  pool.**
- **The black box** (`js/bugreport.js` + `tools/replay-report.mjs` with `--selftest`) reporting
  ILLEGAL / THREW / DIVERGED. Built before the first playtest, as instructed, for the second
  project running. It works, and it is one tool call instead of a conversation.
- **Test layers:** engine, primitives-by-pack, content integrity, fuzz (200 random games + the
  deck matrix; **crash gate, never a balance readout — this one changes for Marvel, see §7.4**).
  `--quiet` / `--filter` / `--full`.
- **Two entry points, one script list**, asserted by a tool because the test runner has no
  filesystem. **No defensive `if (!RB.x) { fallback }` in UI code** — a missing module must throw
  on the first frame.

---

## 4. What this project added

### 4.1 One agent per WORKTREE — and the path is the point

Project 3 wrote "one agent per working copy" and this project discovered that saying *working
copy* is not enough, because the obvious way to make a second one puts it somewhere that breaks.

The full rule is CLAUDE.md hard rule 12 and it should be copied verbatim. The mechanisms behind
it, each observed rather than reasoned about:

- **`git add <file>` stages the whole file, including the other agent's half-finished hunk.** That
  shipped a commit that threw on load.
- **`git commit --amend` commits whatever the other agent had just staged**, swallowing five of
  their files into your commit message.
- **`git reset` after their commit orphans it off the branch entirely**, silently.
- **A worktree at `../Project-<task>` is still inside OneDrive** when the repo lives in a OneDrive
  folder — which resolves to a synced path and defeats the entire point. Use
  `~/breachforge-worktrees/<task>`, outside the synced tree. The same trap catches any tool whose
  default worktree path is inside the project.
- **`preview_start` binds to the PRIMARY checkout's launch config whatever directory the session
  is in.** It will happily serve you the main tree while you believe you are testing your
  worktree. Serve your own (`PORT=<n> node tools/serve.mjs` from inside it) and check what is
  actually being served before believing a browser check.
- **`git update-ref` is the right tool for a branch nobody has checked out and the wrong one for a
  branch that is.** Pointing it at a checked-out branch leaves that tree's index and files on the
  old commit while HEAD reports the new one, and everything you just landed shows up there **staged
  in reverse**. Demonstrated: a worktree moved forward that way reported a file rename backwards
  and pre-staged, and a `git commit` in it would have quietly reverted the merge.
- **`main`'s checkout belongs to nobody.** It is the integration tree: no agent works there, so it
  is always clean, and branches land with `git merge --ff-only <branch>` run from inside it — which
  moves ref, index and working tree together and refuses outright if `main` has moved somewhere
  your branch does not descend from. Run the gates *there*, because green on your branch is not
  green on `main`: `main` moved under this session twice, and once it rewrote a file the session
  had also changed.
- **Gate the commit, not the working tree.** A working copy showed 81 tests green while the commit
  built from it — checked out alone with `git worktree add --detach <sha>` — was 65 of 77 and dead
  on the first `legalActions`. The green came from someone else's uncommitted engine.

Also: **slice bulk authoring by disjoint id ranges *with disjoint files*.** The per-set
`data/abilities-<set>.js` / `js/ops-<set>.js` split exists exactly so two slices never touch one
file.

### 4.2 Every declared asset carries the hash of its own contents

New hard rule 13, and it fixed a class of bug that had shipped verified, green, and broken.

GitHub Pages sends `cache-control: max-age=600` on everything and **ages each file separately**.
Without a content stamp, a returning player holds a new `index.html` next to a ten-minute-old
`css/style.css` — which is how a fix that was tested, green and deployed still rendered broken in
a real browser. `tools/stamp-assets.mjs` rewrites every `<script src>` and the stylesheet link as
`path?v=<first 10 of sha256>`; `--check` re-derives every hash and sits in CI immediately after
the script-list check, so a stale stamp fails the gate rather than reaching a player. A file that
did not change keeps its URL and stays cached, so it costs nothing to ship.

Two details worth copying: the test page is deliberately **not** stamped (it never deploys), and
the script-list checker strips the query before comparing, so the two-entry-point rule asserts
exactly what it always did.

The meta-lesson, which cost a commit of its own: **a gate is not discoverable from a commit
message.** If a step must run after every change to a loaded file, it goes in CLAUDE.md as a hard
rule *and* in CI, not in the history where the next session will not look.

### 4.3 One door per rule — and a gate that greps for the bypasses

Project 3's "one home per rule" was confirmed four separate times in a single session, each one
found by a card pack rather than by a test, and each one already shipping:

- **A Buff was two things**: a Might modifier in one field and a spendable counter in another,
  with the rule tying them together living in a *pack wrapper* — so a unit buffed by one pack
  granted Might that a cost printed by another could not see.
- **Damage was written straight to the object in eleven places**, each one stepping over damage
  prevention and the bonus-damage layer.
- **A target pool was sliced inside each pack**, skipping the player, the Deflect keyword and the
  `chosen` trigger — which is why targeting did not actually *ask* until all three packs were
  routed through one door.
- **A pack wrapper around `RB.additionalCost` dropped an argument the core later added**, and
  broke zone-scoped grants for the whole project.

The fix that generalises: **`tools/check-pages.mjs` now greps for the two bypasses that have
actually happened** and fails the gate on them. A convention that a tool can check is a rule; a
convention in a doc is a suggestion. Add a grep the first time a bypass costs you an hour.

And the corollary, unchanged from project 3: **when a card fix touches a shared helper, stop and
ask which other cards ride it** — then grep, and fix the helper.

### 4.4 The arena — and the discovery that it was measuring first-player bias

`tools/arena.mjs` plays weight tables against each other over many deck pairings. Its first
version reported a clear, stable, entirely fictional signal: **it was measuring first-player
bias.** Any AI measurement harness must play every pairing in both seats and report only the
*decisive* shuffles — the ones where the two sides actually chose differently — or it will hand
you a number with a p-value and no content.

What the corrected instrument then bought, and this is the part worth copying:

- **Weights are swept, not argued.** Every weight in `RB.WEIGHTS` carries a comment recording the
  sweep that set it, including the values that measured *worse* in both directions. That comment is
  the difference between a number and a decision.
- **Distinguish a peak from a plateau.** `endTurnBar` at 16 ties 20 and beats 3, so 16 is the low
  end of a plateau and is stable; `hand` at 2.2 is worse in both directions, which is what a
  genuinely tuned weight looks like from below. Record which kind each weight is, because only the
  first kind is worth re-sweeping later.
- **Hold changes to a holdout.** `competition` was accepted at 81% of 42 decisive shuffles across
  200 pairings **the weight had never seen**. Tuning on the same pairings you measure on is how a
  weight table memorises a deck list.
- **A negative result is a result, and it gets committed.** One entry in this history is
  "B1 is closed: a COUNT of the opponent's outs makes the AI worse, in both aimings". That saved
  the next session from trying it.
- **Some features cannot be measured, and saying so is the deliverable.** The open TODO entry T-1
  documents, with counts, that the information the feature depends on flows about half a reveal per
  game — so 2,400 pairings changed four shuffles, 2–2. The honest write-up ("strike this criterion
  rather than attempting it, or make the reveal family reachable first") is worth more than a
  number that does not exist.

### 4.5 The targeting retrofit happened twice, both times from a player report

The engine parks a target question on the state as a queue step and **restarts the resolution with
the answer pre-filled**; `RB.offerChoice` is the one door; the UI picks between clicking the real
card and a choice modal by asking the DOM which options the board just painted.

That machinery was built once and then retrofitted **twice more**, both times because a human
played a card and reported that it appeared to do nothing — a card that looked at three cards,
showed none of them, and kept one by itself. Every op that chooses on the player's behalf is
invisible in the suite, because the test supplies the choice it expects.

**Build the one door before the first ability pack, and make validation reject an op that picks a
card without going through it.** A grep in the deploy gate is the cheap version.

What still is not routed, and is the shape of the remaining work in any project like this: the
**payment** path, because `pay` runs inside `apply` rather than inside the restartable resolver;
and **variable-count** clauses ("recycle one or both", "up to 4", "any number totalling 8 or
less"), because a target step carries a fixed `n`. Both fixes are named in DEVIATIONS.md D-2.
Design the target step with `min`/`max` from the start and you skip one of them entirely.

### 4.6 Two registers, not one

DEVIATIONS.md records **printed behaviour the engine does not yet reproduce** — every entry a
standing bug with an owner, retired in the commit that makes it untrue. TODO.md, new this project,
records **wanted improvements to something that is already correct**. The header of each says it
is not the other one.

They were conflated for the first two days and the effect was that improvements diluted a defect
register that is supposed to be shameful to have entries in. Two files, two headers, one sentence
each explaining the difference.

TODO.md's format is worth copying exactly: each entry says **what exists today** (with file and
symbol names, and an instruction to grep rather than trust the list), **constraints — read these
before designing anything**, and **done when**, with a measurable bar. Another agent should be able
to pick it up cold.

### 4.7 The interface work that paid

Additions to the three specs, which otherwise stand unchanged:

- **The log becomes a drawer, its card names become doorways, and the chain becomes visible.** A
  LIFO chain the player cannot see is a rules engine arguing with itself.
- **Fold the chain viewer away to read the board under it, and pop it back.** Any overlay that sits
  over the play area needs a fold, not just a close.
- **Spotlight the card the opponent just played**, at hover-preview size, held long enough to read.
  Without it the opponent's turn is a diff you have to reconstruct from the log.
- **One door writes every "may" prompt.** A prompt that read "Pay exhaust me?" is what prompted it.
  Card-driven queue steps carry a `source`, and a may-question reads as a question about a named
  card with its text beneath.
- **Say why a card cannot be played, next to it, before the first click.**
- **The deck and the trash are cards on the board, with an inspector for what you may look at** —
  and the card back is a printed back, not a placeholder rectangle.
- **A tab that slides must slide by the drawer's own width.** The log tab slid 19rem while the
  drawer was 12rem wide, because two numbers described one distance. Same class as §4.3.

---

## 5. What this project got wrong

### 5.1 PLAN.md and NOTICE.md disagree about whether the project is deployed

At handoff, `PLAN.md` carries a dated section titled "The publication decision — owner,
2026-09-20" recording that **the owner chose to deploy publicly**; forty lines later, the same file
lists "**Not deployed.**" among the deliberate scope decisions; and `NOTICE.md` says the project
"is therefore kept as a private practice tool, run locally and not deployed". `README.md` carries
the Riot-policy attribution line that only a published project needs.

Nothing is deployed. The docs are the thing that is wrong. This is project 3's §6 lesson — *a
dated Status section, rewritten when reality changes* — failing again, in the file whose entire job
is to hold that decision, **in the same three days it was written**.

**Rule for the next project, with teeth this time:** a decision recorded in one file and
contradicted in another is worse than an unrecorded decision, because both readers think they have
the answer. When a decision of that kind lands, grep the repo for every file that states the old
one and fix them in the same commit — and put the *decision* in exactly one file, with the others
pointing at it.

Whoever picks BreachForge up next: **reconcile those three files before anything else**, and ask
the owner which of the two it is.

### 5.2 Three projects running with no animation layer

D-7, third time. Cards appear and disappear between renders. The structured log already carries
everything an animation layer needs — this is the same "the engine emits it and nobody wired a
player to it" shape that sound had in project 3, and sound *did* ship this time, which is the
proof that this class of gap closes in about a day when someone decides to.

### 5.3 Rules the engine knows about and does not yet separate

`Focus` is not separated from `Priority` (D-4), and combat damage is assigned by the engine within
the printed constraints rather than by the assigning player (D-10). Both are known, both are
written down, both are one queue step away. They are listed here because they are the kind of gap
that a green suite will never surface: the engine makes *a* legal choice, every test agrees, and
the player never gets asked.

### 5.4 Reconstructed content is honest but it is still reconstructed

Seventeen of twenty decks have a reconstructed rune split (D-3) and eleven a reconstructed Chosen
Champion (D-11), because the decklist source does not record them. The reconstruction rule is
stated, the affected ids are named, and the entries distinguish the determined case from the
judgement call. That is the right handling. **It does not apply to the next project at all** — you
are not importing anyone's decklists — but the discipline does: when you infer a value, say which
rule inferred it, name the ids, and add a test that fails when the real value arrives.

---

## 6. Token economy

Project 3's §5 list is still correct and is not repeated. What this project adds:

1. **`--quiet` on everything.** The suite prints two lines. The audit prints a findings count and
   writes detail to gitignored `scratch/`. The deploy gate prints one line. You should be able to
   run all three gates in one command and read four lines.
2. **Never `cat` a generated pack.** `data/printed.js` is 260 lines of very wide JSON. Query it
   with `node -e`.
3. **A grep against `ls` is a document review.** Project 3 shipped an architecture doc describing a
   file that did not exist. Check a doc's file list against the filesystem as part of reviewing it.
4. **Commit at checkpoints and report.** A long autonomous run that ends in a context wall loses
   everything it had not committed.
5. **Match the model to the work.** Bulk authoring from a pattern script is cheap-model work by
   design; the reviewer reads the *generated text*, not the work packet.

---

## 7. The Marvel Rivals project

### 7.1 The regime change: nothing is printed, so design is the product

Four things break, and each needs a replacement decided on day one.

**1. "Fidelity is the product" has no referent.** There is no printed card to diverge from. What
replaces it is *kit fidelity*: does the card called Spider-Man do the things Spider-Man does in
the video game, and does a player who knows the game recognise it? That is a real and checkable
standard, but it is a **flavour** standard, and it cannot adjudicate a rules question. When a card
and the engine disagree, there is no third party to appeal to — **you** decide, and you write the
decision down. That makes `docs/rules.md` your own rulebook rather than a citation index, and it
must be written *before* the cards, not derived from them.

**2. The audit tool has nothing to diff — so give it something.** Do not delete it; it found 65
real defects in project 3 and confirmed 250 cards clean here, and it is the only automated way to
catch a clause silently dropped for want of a primitive (a test cannot see it, because both sides
of a test come from the same ability data). The replacement: **author a one-line kit table per
hero, from the video game, as its own committed file** — hero → the abilities the game gives them,
in plain prose, written once and treated as the source of truth. The audit diffs generated card
prose against that table by id. You lose "is this the printed wording" and keep "did a clause go
missing" and "does this card still claim to be the hero it says it is", which are the two the tool
was actually for.

**3. Generated rules text goes back on the card face.** Project 3 reversed this rule for a
reproduction, correctly, because a paraphrase of a rule the player must know verbatim is a lie they
cannot check. For an original design **there is nothing to paraphrase** — the generated prose *is*
the card, by definition, and it cannot misdescribe its own data. This reverts to project 2's
posture and takes the consistency guarantee back with it. Record it as regime decision 1.

**4. Balance is now yours, and it is the hardest new thing in this project.** Every previous
project inherited a pool that a publisher designed, playtested and errata'd. Yours has not been
played by anyone. See §7.4 — it is the section that decides whether this project is good.

What this **also** does, and it is worth saying plainly: it makes the published-words surface
**smaller than any project in this series**. There is no rules text to reproduce, because the
source has none. The entire exposure moves to **names, characters and likeness** (§7.2).

### 7.2 IP posture — what is different about Marvel

Project 3's §10 is the standing posture and it does not change: two places for published words
only; no official image or audio ever in the repo; nothing sold, monetised or advertised; a
NOTICE.md that names the source once to identify what is implemented, states non-affiliation,
credits third-party audio and gives a takedown address; the same disclaimer on a screen the player
actually sees; `.gitignore` committed alone before the first tool.

What is different, and what to do about it:

- **Two rights holders, not one.** Marvel Rivals is NetEase Games in collaboration with Marvel
  Games; the characters are Marvel Entertainment / Disney. The game's terms and the characters'
  rights are separate questions with separate answers.
- **Riot had written a policy down and Marvel, as far as I know, has not written one of the same
  kind.** BreachForge's single most valuable day-one act was reading Riot's two policies from the
  primary pages and writing down what they say (`docs/sources.md` §"Riot's published position"),
  which settled the argument against a document instead of re-having it every session. **Do the
  same here on day one**: find and read whatever NetEase and Marvel actually publish — the game's
  terms of service, any fan-content or creator guidelines, and Disney's general position — record
  what they say with the date and the URL, and record honestly where the project sits against them.
  If there is no analogous policy, **write that down too**: "searched on <date>, found none" is a
  finding, and it stops the next session from assuming one exists in either direction.
- **The exposure is inverted relative to the last three projects.** There is no rules text to copy,
  so the copyright surface that dominated projects 2–4 is simply absent. What replaces it is
  **character identity**: names, likenesses and trademarks that are among the most actively
  enforced in the world and are in continuous commercial use across films, games and comics. That
  argues for taking the *names* question more seriously than the *text* question, which is the
  reverse of every previous project.
- **My recommendation, which the owner may overrule and historically will:** build the original
  theme as the default display mode with a **switchable hero-name pack** on top — project 2's
  posture. It costs one constant and a names file you were going to write anyway, the game is
  unchanged without the pack, and it is the one-commit withdrawal lever. Then record the owner's
  answer in PLAN.md with the date and never re-open it. His pattern across three projects is to
  choose the real thing, and he has been right every time; what matters is not which way it goes
  but that the engineering makes either answer cost nothing.
- **Publication is a separate, deliberate decision, made late**, with its own commit and its own
  note. A private tool for one player is a different act from a public URL. And `docs/takedown.md`
  is worth copying verbatim: the contact, plus the two commands that end the deployment, so the
  undertaking is a ten-second operation rather than a good intention.
- **Check the working title against the source material *and* against the licensed card games that
  already exist.** Marvel has a large published vocabulary and several official card products.
  Grep candidate titles against both before a name reaches a filename, a URL or a repo name —
  project 2 renamed across eight files, a package, a repo and a live URL for exactly this.

### 7.3 Mapping Riftbound's shapes onto Marvel Rivals

Everything below is a **design proposal to decide on, not a finding**. The Marvel Rivals details
are from general knowledge of the game and **must be checked against the game itself before you
plan around them** — the roster rotates by season and the mode list changes.

**What transfers with no thought at all:** the three-function surface; immutable `apply`; the
resolution queue and `whoActs`; the parked-target step and its three UIs; the effect grammar with
hook-table extensions; structured logging with `via`; the names file with a `terms` table;
load-time validation and the skeleton-default invariants; the coverage tool; the test harness, the
two-entry-point script list and the Node runner; the fuzzer; the black box and its replayer; the
card renderer and all three UI specs; the defects gate; the art and audio pipelines; the AI machine,
the arena, and the seat-symmetry correction that made it real. A hand is a hand and a board is a
board.

**The five mappings to decide before the skeleton:**

**1. The objective replaces the battlefields, and it is the best fit in the whole adaptation.**
Riftbound scores by controlling battlefields; Marvel Rivals is *entirely* about controlling an
objective. The mapping is nearly free, and the AI evaluator's central question — "can they retake
it before I score" — is unchanged, which means `pointValue`, the safety term and the one-ply reply
search all transfer as written. Three shapes to choose from:

  - **Domination**: two or three points, one active at a time, a capture meter that fills while
    you hold it. Closest to Riftbound; the meter replaces points-per-turn and makes the clock
    visible on the board rather than in a counter.
  - **Convoy**: one objective that *moves along a track* while you control it, toward your
    opponent's end. A single contested location, a position on a route, and a natural tug-of-war.
    This is the most Rivals-shaped and the simplest to model.
  - **Convergence**: capture, then escort. Both of the above in sequence.

  My recommendation: **Convoy as the shipped mode**, because one location plus a track is less
  engine than two locations, reads instantly as Marvel Rivals, and the track gives you a score
  clock that is literally a picture. Then add a **second, non-scoring zone** — call it the flank or
  the high ground — that confers a positional advantage rather than points, so there is still a
  two-location decision. A single symmetric contested zone with nothing else on the board is a
  arm-wrestle, and Riftbound's interest comes from the choice between two places.

**2. Respawn, and it changes everything about removal.** In Rivals a downed hero comes back. A
destroyed unit that goes to a trash forever is not Marvel Rivals, and a destroyed unit that returns
next turn makes removal nearly worthless. **This is the single most important balance lever in the
game and the most Rivals-native mechanic available to you**: a destroyed hero goes to a **respawn
queue** and returns to your base after N turns, or when you pay something, or at a reduced state.
Get it wrong in either direction and the game is either a stalemate or a normal TCG in a Marvel
coat. Prototype it in the first playable build and measure it in the arena before the pool grows —
the value of every removal card in the set is downstream of this one number.

  Engine consequence: the trash stops being terminal, the AI evaluator's "unit destroyed" term
  shrinks sharply and becomes *tempo* rather than *material*, and a new timed zone joins
  validation, the fuzzer and the trace format.

**3. The economy: one spendable currency plus per-hero Ultimate charge.** Riftbound's two
currencies come from its rune deck, which has no analogue here — **drop the rune deck**, and with
it the most retrofit-hostile part of Riftbound's deck construction. What Rivals has instead is
*Ultimate charge that accrues from participating in fights*. That gives you:

  - **A generic currency** (call it Momentum), a simple ramping per-turn allowance, so the payment
    solver keeps its shape while losing an axis.
  - **A per-object resource**: each hero on the board accumulates charge from combat and spends it
    on their own Ultimate. This is genuinely new in this series — **a resource that lives on the
    unit, not in the player's pool** — and it is the mechanic that will make the game feel like the
    source. BreachForge's `pool.tagged` (resources spendable only on certain things) is the nearest
    existing machinery; extend that rather than inventing a second pool.
  - Consequences to plan for: the payment solver needs to know a cost can be payable *by one
    specific object*; the AI evaluator needs a term for accumulated charge (an Ultimate two turns
    from ready is worth real value on the board); and "what can this source pay, and in what" must
    be **one function from day one** — it was `RB.produceElements`' job here and it is the exact
    rule that grows four copies if you let it.

**4. The colour axis is affiliation; the role trio is a card type.** Riftbound has six domains.
Rivals has three roles — Vanguard, Duelist, Strategist — which is too few for a colour axis and is
in any case a *functional* distinction, not a deckbuilding one. Recommendation:

  - **Affiliation as the colour axis** (Avengers, X-Men, Guardians, Fantastic Four, the Spider
    side, the Asgard side, the villain side — pick six and commit), driving deckbuilding legality
    and the Legend's restriction exactly as domains do here.
  - **Role as the type**, with mechanical consequences printed into the rules rather than the
    cards: Vanguards hold ground and draw attacks, Duelists convert resources into damage,
    Strategists heal and enable. Three types with three different relationships to the objective is
    a better foundation than three colours.

**5. Team-Up abilities are the signature mechanic, and the engine already has the primitive.** In
Rivals, specific hero pairings unlock an extra ability. As a card: **an anchor on your board grants
a named ability to a named partner while it is there** — a conditional continuous grant scoped by
the other object's identity. BreachForge's statics layer plus the `granted` array does this today.

  One warning, inherited from project 3's §3.5 and still true: **a static whose condition queries
  another object is the recursion class.** `statics(state)` recomputed on every call, with a
  condition that asks about a candidate card, reliably blew the stack in project 3 and needed a
  reentrancy guard that the handoff correctly called "a patch, not a model". Team-Ups will make
  every static read another object's identity. **Design the layer system with an explicit
  evaluation order on day one** — this is the one place where an hour of design up front is worth
  a week of guards.

**Also decide up front:** the Legend analogue (a squad captain who is always on the board and
restricts deckbuilding by affiliation maps cleanly onto both Riftbound's Legend and Rivals' hero
select); how many heroes are on a side and whether that is a hard cap (6v6 is the source's number
and it is a *lot* of simultaneous objects to render and to search — consider 3 on the board with a
bench); whether destructible environments earn their place (recommendation: not in version one);
and **1v1 only**, which for once is not a compromise — the source is two teams, and more than two
seats still breaks `sideValue(me) − sideValue(them)` and the zero-sum identity the queue-step
chooser relies on.

### 7.4 Balance: the thing that has never been hard before

Every previous project could point at a publisher and say "that is what it does". You cannot. Four
consequences:

- **The fuzzer's deck matrix stops being only a crash gate.** Project 3's handoff said explicitly:
  "fuzz — crash gate, never a balance readout". **That rule is reversed for an original design.**
  The matrix — every deck against every other, both seats — is now your primary balance instrument,
  and it must play both seats and report decisive outcomes for exactly the reason §4.4 gives.
- **The arena becomes a design tool, not just an AI tool.** The same harness that tunes weights
  measures whether a card is broken, by holding the AI fixed and varying the deck.
- **A third register is needed.** DEVIATIONS.md records unmet promises, TODO.md records wanted
  improvements; you now need somewhere for **balance findings** — "Hulk's ultimate wins any board
  it resolves on, measured at X% across Y pairings" — with the measurement attached. Do not put
  them in DEVIATIONS.md; a balance problem is not a bug against a printed card, and conflating the
  two is how the defect register stops being shameful.
- **Design small and play it.** This is where the owner's "playable first" instruction bites
  hardest. **Do not author forty heroes before the first game is playable.** Twelve heroes, two
  affiliations, one map, one mode, a working respawn timer, and a human seat that can beat the AI —
  that is the first milestone, and every later milestone is a widening of it. A hundred cards
  designed against an unplayed engine is a hundred cards to redesign.

### 7.5 Content sourcing without a card dump

There is no `cards.json` for this. The pool comes out of the video game's own hero kits: names,
roles, affiliations, the three-to-five abilities each hero has, the ultimate, and the team-up
pairings. Practical notes:

- **The import is small and the authoring is large** — the reverse of the last three projects,
  where 1,188 cards were imported and the work was making them play. Here maybe forty heroes go in
  and each becomes several cards you design. Budget the time where the work actually is.
- **The kit table is the source of truth and it is committed** (§7.1). Write it once, from the
  game, in plain prose, with the date and where each hero's kit was read. That file is the closest
  thing this project has to `docs/rules.md`'s citation index, and it is what the audit diffs
  against.
- **Only mechanical description crosses into the repo.** Raw dumps, wiki scrapes and screenshots
  live in gitignored `scratch/`, same as always.
- **Season rot is real.** The roster and the kits change with each season of the live game. Record
  the version/season you authored against at the top of the kit table, or in a year nobody will
  know whether a card is wrong or just old.

### 7.6 Art direction — decide again, and record it

The three constants do not move under any decision: **no text rendered in an image**, **no
reproduction of a specific official illustration** (prompts describe a visual identity in original
prose; they never ask for "the art of X"), and **an original rendering style throughout**.

Within those, the direction is the owner's call, recorded at the top of the art-rules doc and
marked *do not re-litigate*. For BreachForge it was "recognisable by silhouette, palette, hair and
weapon class, in an original style". The same decision for Marvel characters carries a higher
profile than it did for either League champions or FF characters, and the recommendation stands
where project 3 put it: **recognisable at 34px, not a copy at 512px.**

Everything else in project 3's §8 holds verbatim and is the most reusable part of the whole
pipeline: one byte-identical `STYLE` block appended to a one-line subject is what makes hundreds of
independent generations read as one set; full-bleed environments always; never negate; front-load
the proportion anchor; exact counts above two are unreliable; crop the bottom 4% and expect QC
regenerations anyway; idempotent generators with a free `--dry-run` that prints the whole plan,
exact-match `--only`, `--force` that archives first, and `--limit` to cap a paid run; masters never
enter the repo; **generate art for things that are pictures and draw things that are geometry** —
the board's outlines and hitboxes come from one geometry table so the painted outline and the DOM
hitbox are the same numbers by construction.

One Marvel-specific note: a hero roster is a set of *very* widely recognised silhouettes, which
cuts both ways. Recognition is easier than it was for a card game's minor characters, and the
failure mode — a render that looks like a specific official illustration — is correspondingly
closer. QC for it explicitly.

### 7.7 Sound

Project 3 shipped no sound effects and called it "perhaps a day's work and the single largest
perceived quality gain on the table". BreachForge did it in about that, and it was right.

The shape that worked: one module owns every audio decision so the UI has one call to make and
nothing there touches game state; **the audio layer rides the structured log**, so the engine tags
sounds and a tag with no clip is simply ignored; one `AudioContext` for everything; a synthesized
Web Audio kit as the floor with generated one-shots layered over it; CC0 music, credited anyway,
two encodes per track (Opus-in-Ogg for gapless looping, AAC for the browsers that refuse it);
looping is per track and a finished one-shot must be **rewound** before it can play again; a draw
keeps the battle track; autoplay refusal is "wait", not an error; mute persists and a muted reload
creates no audio element at all.

And the trap that cost a commit: **the siren was the rune sound, and it was firing on every
payment.** A sound tagged on a mechanism that fires more often than the picture does will drive the
player out of the room. Voice the sound at the moment of the *picture*, not at apply time.

For Marvel Rivals the tag set writes itself from the structured log: a hero deployed, an ultimate
charged and an ultimate fired (these two want to be the loudest things in the game), a team-up
triggered, a hero downed and a hero respawned, the objective contested, taken and lost, and the
track advancing. **The objective tags are the ones to get right** — the whole game is a race along
that track, and a distinct, escalating sound per tick is the cheapest possible way to make the
clock felt.

### 7.8 Vocabulary to decide before writing any prose

The `terms` table needs the project's own words for everything the theme renames: the currency, the
Ultimate charge, the objective and the track, the respawn queue, the trash and the banish zone, the
six affiliations, the three roles, the squad captain, and the team-up. Everything generated — card
text, log lines, prompts, keyword help — reads these at render time, and the pack swaps them
together with the names. **Decide once; renaming later touches every describer.** And per §7.2,
decide which set is the default display mode at the same time.

---

## 8. Day-one checklist

The earlier lists still apply in full. In the order to do them:

1. **`.gitignore` committed alone**, before the first tool: `scratch/`, key files, art masters and
   archives, traces, editor lock files.
2. **Read and record whatever NetEase and Marvel actually publish** — with the date, the URL, and
   an honest statement of where the project sits. "Searched, found none" is a valid finding
   (§7.2). Before any code.
3. **`CLAUDE.md` on commit one**, pointing at all four lessons files and the three specs, and
   stating the regime decisions explicitly: **generated text on the face** (§7.1), **theme names or
   hero names as the default display mode** (§7.2), **1v1 only**, and — new for this project —
   **that this is an original design and what the fidelity standard therefore is** (§7.1).
4. **One agent per worktree**, with an explicit path outside any synced folder, and `main`'s
   checkout reserved as the integration tree (§4.1).
5. **The script-list equality check** and the **asset-hash stamp**, both in CI, plus a ban on
   defensive `if (!NS.x)` fallbacks in UI code (§4.2).
6. **The defects gate**, empty and wired.
7. **Engine skeleton**: `legalActions` / `apply` (immutable) / `isTerminal`, seeded RNG with every
   shuffle inside `apply`, structured log, the resolution queue, `whoActs`.
8. **The one targeting door before the first ability**, with `min`/`max` on the target step rather
   than a single `n` (§4.5), and a gate that greps for ops that pick without it.
9. **Load-time validation** including the skeleton-default invariants and the explicit
   `unimplemented` marker that validation rejects from any registered deck.
10. **The test harness and Node runner**, `--quiet` / `--filter` / `--full`, plus the geometry suite
    before the first board pixel.
11. **The black box and its replayer with `--selftest`**, before the first playtest.
12. **A playable build with twelve heroes, one map and an AI opponent** — before the pool grows
    past that (§7.4). This is the milestone the owner actually wants; everything above exists to
    make it survivable.
13. **The kit table and the audit tool that diffs against it** (§7.1), re-run after every authoring
    pass.
14. **The arena, playing both seats and reporting decisive shuffles only** (§4.4) — and the
    balance register it feeds (§7.4).
15. **NOTICE.md, `docs/takedown.md` with the actual commands, and the disclaimer on a screen the
    player sees.**
16. **A dated Status in PLAN.md, rewritten at the end of every session — and grepped against every
    other file that states the same decision** (§5.1).

---

## 9. Files to copy into the next repo

```
CARD-GAME-LESSONS.md          CARD-GAME-LESSONS-2.md        CARD-GAME-LESSONS-3.md
CARD-GAME-LESSONS-4.md (this file)
CARD-PRESENTATION-SPEC.md     CARD-LOG-AND-TARGETING-SPEC.md  CARD-FANNING-SPEC.md
```

Worth reading in the BreachForge repo before starting, rather than copying blind:

- `CLAUDE.md` — the thirteen hard rules in their final form, especially 12 (worktrees) and 13
  (asset stamping), which are new this project and were both written after the failure.
- `DEVIATIONS.md` and `TODO.md` — the shape of two honest registers, and why they are two files.
- `docs/grammar.md` — the effect grammar as it ended up after 264 cards and ~180 ops. The section
  headings alone are a checklist of the primitives a TCG needs.
- `docs/rules.md` — a citation index. For an original design this becomes your own rulebook, and
  the format (numbered sections, every engine rule naming its section in a comment) is the part to
  copy.
- `docs/sources.md` — how to record a rights holder's published position so the argument is had
  once.
- `docs/HANDOFF-ai-tuning.md` and `docs/HANDOFF-ui-log-chain.md` — the format for handing a scoped
  piece of work to another agent: what exists today, what will bite you, done when.
- `js/state.js` — the state shape, and the comment at the top explaining why every derived
  predicate lives there exactly once.
- `js/ai.js` — the weight table with a cited reason and a sweep result per weight.
- `tools/` in full, and the CI workflow.

---

*Written at the BreachForge handoff, 2026-09-23, for the Marvel Rivals project that follows it.
Suite green at 90 tests; audit clean at 250 cards; `data/defects.js` empty; all 20 decks offered;
check-pages and the asset stamps current. Not deployed — and the three files that disagree about
whether that was the decision are §5.1, which is the first thing to fix if anyone returns to this
repo.*

*And one line for whoever picks this up: the previous three handoffs all end by saying the owner
has been right about the shape of these projects every time, including the times he was argued
with. A fourth data point does not change that. But this project is the first one where he is not
copying someone's homework — the game does not exist yet, and nobody can tell you whether a card is
correct. Get something playable in front of him in the first day, and let what he says about
playing it be the specification.*
