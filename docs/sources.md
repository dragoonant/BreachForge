# Sources

## Rules

**Riftbound Core Rules**, official PDF, "Last Updated 2026-07-16", pulled from the Rules Hub at
`playriftbound.com/en-us/rules-hub/` on **2026-09-19**. Digested into `docs/rules.md` by section
number; that file is the engine's citation index, and every rule the engine implements names its
section in a comment. The PDF itself is not in the repository (`.gitignore` excludes `*.pdf`).

The official **Tournament Rules** PDF was read from the same hub on the same date; it contributes
nothing the engine needs beyond confirming the 1v1 Duel mode's parameters.

## Card data

**`LouisCourrian/riftbound-cards`** (GitHub), release `v2026-09-19`, asset `cards.json` —
1,188 cards scraped from the official Card Gallery and errata pages and normalised to JSON. Used
for: card name, type, domain(s), tags, energy cost, power cost, might, rarity, set, artist, and
the printed ability text (`abilityEffective`, which is post-errata where errata exist).

That project states it is not affiliated with Riot and was created under Riot's fan-content
policy. This project takes the same posture. Only mechanical fields and names cross into the
repository, through `tools/import-cards.mjs`; the raw dump stays in the gitignored `scratch/`.

**Official artwork URLs are present in that dump and are deliberately unused.** No official image
is in this repository or is fetched by the game. Every image the game draws is this project's own
— either the procedural painting in `js/procart.js` or a render generated from original prose
prompts (`tools/art-prompts.json`, `docs/ART-PROMPT-RULES.md`). That covers all 264 registered
cards plus the four painted board areas; nothing falls back.

## Decklists

**`riftbound.one/decklists`**, read **2026-09-19**: 381 tournament decklists with legend, event,
placement and card list. Fetched once with a browser user agent; the dump lives in `scratch/`.

**Twenty decks selected, one per legend, all legends distinct.** The first ten are each a
first-place finish; of the second ten, nine are firsts and one (Kha'Zix) is a second, because that
legend has no first-place list in the data. Together they cover all six domains and give a
256-card union — the two waves share 87 cards, so the second ten added only 79.

Two things the source does **not** record, both reconstructed and both logged as deviations: the
rune deck is frequently partial or absent (D-3, affecting seventeen of twenty decks), and the
Chosen Champion is often missing entirely (D-11, eleven of twenty). The rune reconstruction is
determined by the legend's domains and is not a judgement call; **the champion reconstruction is**
— which champion a player ran is a real deckbuilding decision, and the entry says so.

Sites checked and rejected: `riftdecks.com` and `api.riftmana.com` both return Cloudflare 403 to
every client available here, including a real browser.

## Audio

Four CC0 music tracks; full provenance, licence and the exact re-encode commands are in
`docs/sound.md`. Sound effects are synthesized in Web Audio and generated through the ElevenLabs
sound-generation API; no third-party audio asset is in the repository under any other licence.

## Riot's published position — read 2026-09-20

Both primary documents were read on **2026-09-20**. This section records what they say so the
question is settled against the documents rather than re-argued.

### 1. Fan Content Policy, the "Legal Jibber Jabber"
<https://www.riotgames.com/en/legal>

- **The licence.** Personal, non-exclusive, non-sublicensable, non-transferable, **revocable**,
  limited, and for **non-commercial community use**. Riot reserves the right to deny anyone use of
  its IP at any time, for any reason or none, and a denied project must stop being developed,
  published or distributed immediately.
- **Games and apps are prohibited outright.** Section 3 says plainly that Riot prohibits the use
  of its IP in games and apps, and asks that no part of it — character appearance, abilities,
  maps, icons, items — be used in one. There is no carve-out for recreations, simulators or
  practice tools.
- **Commercial projects are out**, including crowdfunded ones and anything behind a paywall,
  absent a written licence. Narrow exceptions exist for passive ad revenue, live-stream donations,
  and projects operating under a valid Riot API key.
- **A conspicuous notice is required** naming the project, stating it was made under the Legal
  Jibber Jabber policy using Riot-owned assets, and that Riot neither endorses nor sponsors it.

### 2. Riftbound: League of Legends TCG Digital Tools Policy
<https://developer.riotgames.com/policies/riftbound>

This is the specific one, and it is the document that governs this project.

- **Explicitly encouraged:** deck builders and card libraries.
- **Explicitly prohibited:** apps that create a digital Riftbound gameplay experience **with
  automated rule enforcement**; **standalone clients solely for Riftbound**; skill-based
  matchmaking and player-facing ladders; publishing metagame-defining data such as deck and card
  win rates.
- **Assets:** an app may use only Riftbound assets supplied by the Riot API — not external or
  unofficial materials — and must display Riot's official English card text or its official
  translation.
- **Permission** is requested through the Developer Portal.

### 3. Where BreachForge sits

Honestly: **against three separate prohibitions in the Riftbound policy.** It is a standalone
client solely for Riftbound; it is a digital gameplay experience whose entire engine is automated
rule enforcement; and its card data comes from a community mirror rather than the Riot API. The
general policy's blanket prohibition on games covers it as well.

Two things it does *not* violate: it shows the official printed English text, which that policy
**requires**; and it contains no official artwork or audio, every image being the project's own.

**What follows from that, and what does not.** Both documents govern developing, publishing and
distributing a Project. A tool that runs on one person's machine, is never distributed, and is
never presented as official is a different act from a public deployment — but the policy does not
draw that line for us, and the honest reading is that a public URL is prohibited. That decision
is the owner's; this file records the documents, not a verdict.

**The compliant shape, if a public version is ever wanted:** a deck builder and card library,
which the Riftbound policy names as encouraged, sourcing card data from the Riot API and carrying
the required notice. BreachForge already contains most of one.
