# BreachForge

A browser reproduction of the mechanics of **Riftbound: The League of Legends TCG**, played
against an AI. Twenty tournament-winning decks, one per legend, across all six domains.

> BreachForge was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by
> Riot Games. Riot Games does not endorse or sponsor this project.

Non-commercial. No official artwork or audio is used — every image here is the project's own.
See [NOTICE.md](NOTICE.md), and [docs/takedown.md](docs/takedown.md) for the takedown contact.

## Play it

```bash
node tools/serve.mjs
```

Then open **http://localhost:8777**. It also runs straight from `file://` if you prefer.

Pick a legend, keep or mulligan your opening four, and play. Click a card to select it, then a
highlighted destination to commit. When a card asks you to choose a target, the legal answers glow
and you click the real card. Hover anything to read it in full; **List** on a deck tile shows the
whole decklist. **How to play** on the title screen has the rules in four paragraphs.

## The shape of a game

First to **8 points**. You score by controlling battlefields — one point per battlefield you
still hold at the start of your turn, and one for each you take from your opponent. The eighth
point can only be taken by holding, or by conquering every battlefield in one turn.

Two currencies: exhaust a ready rune for **1 Energy**; recycle a rune back into your rune deck
for **1 Power** of that rune's domain. You channel 2 runes a turn. Payment is solved for you.

Units enter your base exhausted. Moving exhausts them. Moving into a battlefield you do not
control **contests** it, which opens a **showdown**; with units on both sides it becomes a
**combat**, both sides deal damage equal to their total might, and whoever still has units
standing takes the battlefield.

## Working on it

```bash
node tools/test.mjs               # the suite  (--quiet --filter <name> --full)
node tools/check-pages.mjs        # index.html and tests.html load the same engine, in order
node tools/import-cards.mjs       # regenerate data/ from the gitignored scratch/ dumps
node tools/gen-art.mjs --dry-run  # the art plan, free
node tools/audit-card-text.mjs    # printed text vs generated prose, by id
node tools/replay-report.mjs --selftest
```

Start with [CLAUDE.md](CLAUDE.md) for the working rules and the three regime decisions,
[PLAN.md](PLAN.md) for the current status and the architecture, and
[DEVIATIONS.md](DEVIATIONS.md) for what does not yet play as printed.

`audit-card-text` is the fidelity instrument. The card face shows the printed text verbatim, so
the describer in `js/text.js` is not what you read — it is the auditor. The tool generates prose
from each card's ability data and diffs it against the printed text by id, which is the only
automated way to catch a printed clause silently dropped for want of a primitive: the card plays,
it looks structurally valid, and it is the wrong card. A test cannot see that, because both sides
of a test come from the same ability data.

Found a card behaving oddly? Hit **🐞** on the board. It saves a trace — seed, both deck ids,
every action — and `node tools/replay-report.mjs <trace.json>` says whether it was an illegal
action, a throw, or a divergence.
