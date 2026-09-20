# BreachForge — working rules

A browser reproduction of **Riftbound: The League of Legends TCG** (Riot Games), played
against an AI. No build step. Plain browser JS, IIFEs on one `window.RB` namespace, script
order declared in the HTML.

Read before touching anything: `CARD-GAME-LESSONS.md`, `CARD-GAME-LESSONS-2.md`,
`CARD-GAME-LESSONS-3.md`, and the three binding UI specs — `CARD-PRESENTATION-SPEC.md`,
`CARD-LOG-AND-TARGETING-SPEC.md`, `CARD-FANNING-SPEC.md`.

## The three regime decisions (owner, 2026-09-19 — recorded, do not re-litigate)

1. **Printed text on the card face, verbatim**, from the generated pack `data/printed.js`.
   Real card and champion names. `RB.cardText` (generated from ability data) survives as the
   *auditor* — `tools/audit-card-text.mjs` diffs it against the printed text — and as the
   fallback for the test harness, which never loads the pack.
2. **Art: each champion is recognisable** by silhouette, palette, hair and weapon class, in an
   original style. Three constants that do not move: no text rendered in an image, no
   reproduction of a specific official illustration, original rendering style throughout.
3. **1v1 only.** More than two seats breaks `sideValue(me) − sideValue(them)` and the zero-sum
   identity the queue-step chooser relies on.

## Hard rules

1. **Fidelity is the product.** A divergence from printed behaviour is a *defect to fix*, never
   a design choice. `DEVIATIONS.md` records only what is not yet implemented; each entry is a
   standing bug with an owner, retired in the commit that makes it untrue.
2. **Nothing playable contains content that does not work correctly.** `data/defects.js` lists
   ids that do not yet play as they read, and the deck picker hides any deck containing one.
   Deleting an entry is the whole of putting its decks back.
3. **`index.html` and `tests.html` load the same engine files in the same order.**
   `tools/check-pages.mjs` asserts it. **No defensive `if (!RB.x) { fallback }` in UI code** — a
   missing module must throw on the first frame. A silent fallback once ran a headline feature
   dead for two days.
4. **The engine surface is exactly `legalActions` / `apply` (immutable) / `isTerminal`.**
   Every UI affordance derives from `legalActions`; the UI cannot invent a rule.
   `RB.whoActs(state)` is the one answer to "whose input is needed" — the AI does not keep a
   second copy of that rule.
5. **One resolution queue is the whole control flow.** A pending queue item owns the turn; only
   its choices are legal. `legalActions` throws on a queue head that offers nothing.
6. **Cards are pure data; abilities are data.** New vocabulary goes into extension files wired
   through hook tables, never by editing the core. New op = handler + describer + test.
7. **An ability the grammar cannot express fails authoring loudly.** Author it as an explicit
   `unimplemented` marker that validation rejects from any registered deck — never as a partial
   card that plays wrong quietly.
8. **A default that a real value would replace must fail validation.**
9. **Verify in the real app, not just in the suite.** Every UI commit message ends with what was
   checked in a browser on the real code path. Green tests plus a broken page has happened twice
   in this series, and the suite was green throughout both times.
10. **When a report contradicts a green test, suspect the test first.** A test's name states the
    rule, not the current behaviour. Every engine fix reports having reverted the fix and watched
    the test fail.
11. **Commit messages describe the mechanism, by id.** The history should read as a bug diary.
12. **One agent per working copy.** Slice bulk authoring by disjoint id ranges *with disjoint
    files*. Never measure against a tree someone else is fixing.
13. **Every declared asset carries the hash of its own contents.** After changing ANY file
    `index.html` loads — engine, data pack, stylesheet — run:

    ```
    node tools/stamp-assets.mjs
    ```

    It rewrites each `<script src>` and the stylesheet link as `path?v=<first 10 of sha256>`.
    `--check` re-derives every hash and is in CI right after `check-pages`, so a stale stamp
    fails the gate rather than reaching a player. Pages sends `cache-control: max-age=600` on
    everything and ages each file separately: without the stamp a returning player holds a NEW
    `index.html` next to a TEN-MINUTE-OLD `css/style.css`, which is how a fix that was verified,
    green and deployed still rendered broken in a real browser. A file that did not change keeps
    its URL and stays cached, so this costs nothing to ship. `tests.html` is deliberately not
    stamped — it never deploys, and `check-pages` and `test.mjs` strip the query before
    comparing lists or resolving a path, so rule 3 still asserts exactly what it always did.

## Layout

`index.html` declares script order. `js/` engine + UI. `data/` generated card, deck and printed
packs. `tools/` node-side tooling (importers, art, audit, the test runner, the replayer, and
`stamp-assets.mjs`, which runs after every change to a file the page loads — rule 13).
`docs/` rules citations, grammar, architecture, art and sound. `scratch/` is gitignored and is
the only place published words or third-party material may land besides the generated packs.
