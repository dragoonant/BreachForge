# Notice and takedown

BreachForge is a non-commercial hobby project. If you are from **Riot Games** and want it
changed or taken down, email **anthony.j.escasa@gmail.com** and it will be done — no argument,
no delay. Opening an issue on the repository works too.

## What comes down, and how fast

Both commands are immediate and need no coordination with anyone.

```bash
gh api -X DELETE repos/<owner>/<repo>/pages   # the public site stops serving
gh repo edit <owner>/<repo> --visibility private --accept-visibility-change-consequences
```

The first ends the deployment; the second removes public access to the source. Together they
take about ten seconds. Nothing else has to be unwound, because nothing else was ever published:
there is no package, no mirror, no CDN, no app store listing, and nothing was ever sold.

## What this project does and does not contain

- **No official artwork.** Every image is the project's own — generated from original prose
  prompts, or painted procedurally. The card source carries official art URLs and they are
  deliberately unused.
- **No official audio.** Sound effects are synthesized or generated; music is CC0, credited in
  `docs/sound.md`.
- **Card names and printed rules text** are present, and live in one generated file,
  `data/printed.js`, produced by `tools/import-cards.mjs`. Deleting that file is a single commit;
  the game keeps working and the card faces fall back to generated prose.
- **Nothing is sold, monetised, crowdfunded or advertised.** There is no account system, no
  telemetry, and no server — the whole thing is static files.

## The relevant policies

Both were read on 2026-09-20 and are summarised in `docs/sources.md`: Riot's Fan Content Policy
(the "Legal Jibber Jabber") and the Riftbound: League of Legends TCG Digital Tools Policy. What
they say, and where this project sits against them, is recorded there in full rather than
paraphrased favourably.
