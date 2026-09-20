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
prompts (`tools/art-prompts.json`, `docs/ART-PROMPT-RULES.md`).

## Decklists

**`riftbound.one/decklists`**, read **2026-09-19**: 381 tournament decklists with legend, event,
placement and card list. Ten were selected — one per legend, each a first-place finish — giving a
163-card union. Fetched once with a browser user agent; the dump lives in `scratch/`.

Sites checked and rejected: `riftdecks.com` and `api.riftmana.com` both return Cloudflare 403 to
every client available here, including a real browser.

## Audio

Four CC0 music tracks; full provenance, licence and the exact re-encode commands are in
`docs/sound.md`. Sound effects are synthesized in Web Audio and generated through the ElevenLabs
sound-generation API; no third-party audio asset is in the repository under any other licence.

## Riot's published position

Riot publishes a fan-content policy (the "Legal Jibber Jabber") and, separately, a Riftbound TCG
digital-tools statement. Both should be read from the primary pages and summarised here with the
date read, so the question is settled once against a real document rather than re-argued every
session. **Not yet done — this is the one open item in this file.** What the project does in the
meantime is the conservative shape either way: nothing sold, nothing advertised, nothing presented
as official, no official art or audio, a takedown address in `NOTICE.md`, and the published-text
pack isolated in one generated file that can be deleted in a single commit.
