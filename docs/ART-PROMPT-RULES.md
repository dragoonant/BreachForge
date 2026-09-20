# BreachForge card art — prompt rules

How the 163 card illustrations are made, and the rules that keep them looking like one set rather
than 163 unrelated pictures. Read this before touching a prompt.

---

## The art decision — do not re-litigate

> **Each League champion is identified by silhouette, palette, hair and weapon class, rendered in
> an original chibi style — recognisable at 34px, never a copy of a specific official illustration,
> never any text rendered in the image.**

This is settled. It is the reason the prompts describe *identities* ("long silver-white hair, pale
blue and silver plate marked with a crescent, a great curved crescent blade") instead of pointing
at a particular painting. Do not reopen it, and do not "improve" a prompt by naming an official
artwork, a splash art, an artist or a studio.

---

## The three constants

Everything downstream depends on these three staying fixed. Change any one of them and you have
started a new set.

| Constant | Value | Lives in |
| --- | --- | --- |
| **Model** | `black-forest-labs/FLUX.1-schnell` via the Hugging Face router | `tools/lib/hf-image.mjs` → `DEFAULTS.model` |
| **Size / crop** | `768x1024`, then 8% cropped off the bottom, encoded WebP q90 | `tools/lib/hf-image.mjs` → `DEFAULTS` |
| **STYLE** | the block below, appended byte-identically to every subject | `tools/gen-art.mjs` → `export const STYLE` |

The bottom crop exists because FLUX signs its work in the bottom strip some of the time. 4% was
enough at 704px tall; at 1024px a signature was still surviving about 5.3% up from the bottom edge
(caught on `ogn-022` in the first sample batch), so the crop is **8%**. That is still well clear of
the subject in a portrait composition. If a signature ever survives again, raise
`DEFAULTS.cropFraction` and regenerate with `--force` — the crop happens at encode time, so a
raw image cannot be re-cropped after the fact.

---

## The STYLE block — verbatim

This string is appended to every single subject line, byte for byte identical, on every
generation. It is what makes 163 independent images read as one set. It is reproduced here exactly
as it appears in `tools/gen-art.mjs`; if the two ever disagree, the code is the source of truth and
this doc is stale.

```
Chibi super-deformed art direction throughout: every character, creature and figure has an oversized head atop a small compact body. Bold cel-shaded digital illustration with crisp highlights, confident linework and clean readable shapes; a saturated, vibrant colour palette; a wordless illustration, pure visual storytelling. The scene is a single full-bleed painted environment filling the frame edge to edge with rich background detail, sky or ground, depth and atmosphere — everything in the scene stands grounded within it, fully integrated into the setting. Dynamic lighting, dramatic rim light, strong value contrast between the subject and the light behind it. Vertical portrait composition, one cohesive artwork.
```

The full prompt sent to the model is exactly `SUBJECT + ' ' + STYLE`.

---

## The prompt rules

These come from three prior projects and a lot of wasted generations. Follow them exactly. The
lint pass in `scratch/build-art-prompts.mjs` enforces the mechanical ones and refuses to write the
JSON when a line breaks them.

1. **Front-load the chibi proportion anchor**, immediately after the subject name — for creatures
   as well as humanoids, and for objects and pure-effect scenes too. Without it the model drifts to
   realistic concept art within a clause or two. Every line therefore opens one of four ways:
   `"<Champion>, a chibi <role> with an oversized head and a small compact body, …"`,
   `"A chibi <creature> with an oversized head and a small compact body, …"`,
   `"A chibi-proportioned still life of …"` (Gear, Runes), or
   `"A chibi-proportioned fantasy scene: …"` / `"A chibi-proportioned landscape of squat chunky
   forms and oversized simple silhouettes: …"` (effect-only Spells, Battlefields).

2. **Full-bleed painted environment, always.** Every subject names a real place — a scorched
   hillside, a lantern-lit fighting pit, a reef shelf. Never a white background, never a sticker
   with a drop shadow, never "isolated on". The STYLE block reinforces this, but the subject has to
   carry it too.

3. **Never ask for text, and avoid text-magnet nouns.** Banned outright: sign, banner, flag,
   insignia, label, nameplate, market, plaza, street, poster, placard, scroll, book, tome, map,
   letter, word, writing, inscription, rune, glyph, sigil, symbol, logo, emblem, crest, heraldry,
   numeral, number, title, caption, font, calligraphy. Describe physical landscape instead — a war
   camp is "squat tents and iron braziers behind a spiked timber palisade", not the other thing.
   Note that this is why the three Rune cards are described as *faceted crystals*: a "rune stone"
   prompt produces lettering every time.

4. **Never negate.** "a cloak with no writing", "a wall without text", "free of lettering" — all of
   these produce the very thing you negated, as ghost lettering. Describe positively: say what the
   cloak *is* (plain crimson wool, a heavy grey weave) and stop.

5. **Exact counts above two are unreliable.** Write "a group of" or "a pair of". Never "three
   soldiers", never a numeral above 2. This is why `ogn-116` reads "a chibi many-tailed fox
   spirit" rather than naming a count.

6. **For a named League champion, describe the identity visually** — hair, palette, weapon class,
   silhouette — and name the champion. Never name an official illustration, a splash art, a skin
   line, an artist or a studio. The shared identity clauses live in the `CH` table at the top of
   `scratch/build-art-prompts.mjs` so a champion who appears on several cards is described the same
   way every time, with only the environment varying.

7. **One STYLE constant, byte-identical on every generation**, appended to each subject. See above.

---

## The second pipeline: board area art

`tools/gen-board-art.mjs` paints the AREAS of the playmat rather than subjects on cards. It
shares the router, model, token resolution, bottom crop and WebP encode with the card generator
through `tools/lib/hf-image.mjs`, and writes its switch into the same `art/manifest.js` (as
`RB.boardArt`) so `index.html` still loads one file.

Battlefield zones do NOT use this — each one paints itself with its own battlefield card render.
What this tool makes are the two areas with no card behind them, one image per side of the table:

| Name | Area |
| --- | --- |
| `base-mine` / `base-theirs` | the base — the muster yard units wait in before they move out |
| `runes-mine` / `runes-theirs` | the rune area — where channelled power is kept and spent |

Each pair describes the *same place from opposite sides of the table* — same architecture, same
materials — separated by vantage and by a warm/cool light shift. Different enough to tell apart at
a glance, close enough to read as one board.

### What is different from the card pipeline

1. **Ask for an empty place.** These sit UNDER the cards standing in them, so anything with a
   silhouette — a person, a creature, a figure — competes with the card on top of it. Ask
   positively: *empty, still, deserted, vacant, unattended*. Asking for "no people" is a negation
   and negations summon what they negate (rule 4 applies here exactly as it does to lettering).
2. **Muted and heavily desaturated**, low contrast, soft diffuse light.
3. **Detail gathers at the edges and softens toward the middle**, so the centre of the frame stays
   calm under the cards.
4. **Wide landscape**, 1344x768 — not the card pipeline's portrait 5:7. The base zone is a wide strip.
5. **`BOARD_STYLE`, not `STYLE`** — a separate constant, byte-identical across all four images.

### The BOARD_STYLE block — verbatim

Reproduced exactly as it appears in `tools/gen-board-art.mjs`. If the two disagree, the code wins
and this doc is stale.

```
Painted background art for one area of a tabletop playmat. The place stands empty, still and deserted — a vacant setting of bare ground and quiet architecture, motionless and unattended. Muted, heavily desaturated colour held to a narrow range of cool greys with a single restrained accent hue; low contrast throughout, soft diffuse light, every highlight gentle and every shadow open. Detail gathers along the outer edges of the frame and softens toward the middle, so the centre stays calm, simple and uncluttered. Cel-shaded digital painting with soft edges, gentle atmospheric haze, and a wide horizontal landscape composition filling the frame edge to edge. A wordless image, pure texture and place.
```

### How strongly it paints is a CSS decision

Two knobs in `css/style.css`, next to the battlefield pair:

```css
--zone-art-opacity: .22;            /* how strongly the board image paints */
--zone-scrim: rgba(8,11,19,.62);    /* how heavily the scrim knocks it back */
```

**Settled at .22 / .62** after an A/B on a live board with units in both bases. At .34 / .50 the
base floor brightened enough to compete with the card plates and with the zone label, and it made
the base louder than the battlefields beside it — which inverts the hierarchy, since the
battlefields are where the game actually happens. .22 keeps the areas as texture and leaves the
cards and the battlefields as the things you look at. A previous project wired board art at 50%
art / 55% scrim and it was visibly too loud; start low and only come up if the board looks empty.

`js/board.js` has a `paintZone(zone, name)` helper that appends a `.zone-art` div plus a
`.zone-scrim` sibling inside a `.zone`. **A name with no file in `art/board/` simply does not
paint**, and the zone reads exactly as it did before — the same guarantee `RB.artManifest` gives
the cards.

### Running it

```bash
node tools/gen-board-art.mjs --dry-run                     # the plan, free
node tools/gen-board-art.mjs                               # generate whatever is missing
node tools/gen-board-art.mjs --force --only runes-theirs   # re-roll one (archives the old file)
```

---

## Where things live

```
tools/art-prompts.json        GENERATED. 163 entries, {cardId: "subject"}. Never hand-edit.
scratch/build-art-prompts.mjs The editable source of those 163 lines, plus the lint pass.
tools/gen-art.mjs             The generator. Owns STYLE, the run plan and art/cards/ layout.
tools/lib/hf-image.mjs        HTTP + crop + WebP. Generator-agnostic, shared with future tools.
tools/art-contact-sheet.mjs   Builds scratch/art-contact-sheet.html for reviewing a run.
tools/gen-board-art.mjs       The board-area pipeline. Owns BOARD_STYLE and the four area images.
art/board/<name>.webp         Painted playmat areas: base-mine|theirs, runes-mine|theirs.
art/cards/<id>.webp           Delivery art. WebP only — masters stay out of the repo.
art-archive/                  Previous versions, stashed automatically by --force. Gitignored.
art/manifest.js               GENERATED switch: RB.artManifest lists the ids that have a file.
js/procart.js                 The procedural fallback for every id not in the manifest.
scratch/reports/              One report per generation run: generated / skipped / failed and why.
```

`art/manifest.js` is what makes a partial run safe. `js/render.js` paints a generated image only
for ids listed there and falls back to `RB.procArt(card, w, h)` for everything else, so a missing
file can never produce a broken image. **Rebuild the manifest after any run that adds or removes
files** (see below).

---

## How to run this once a token exists

The token is read from `--token`, else `HF_TOKEN`, else the gitignored `.hf_token` / `hf_token.md`
at the repo root. Billing is **prepaid — every generation spends real money**, so the generator is
idempotent by default: an id that already has `art/cards/<id>.webp` is skipped and never re-spent
unless you pass `--force`.

```bash
# 0. Rebuild the prompts from source and lint them (free, no network).
node scratch/build-art-prompts.mjs

# 1. See the whole plan without spending anything.
node tools/gen-art.mjs --dry-run

# 2. Sample batch first — always. Eight images, then look at them before committing to the set.
node tools/gen-art.mjs --limit 8
node tools/art-contact-sheet.mjs --open

# 3. The full set. ~5 s per image plus encode; roughly 15–25 minutes for 163 at concurrency 3.
node tools/gen-art.mjs

# 4. Review, then regenerate only the tiles that failed (the old file is archived first).
node tools/gen-art.mjs --force --only ogn-027

# 5. Rebuild the manifest so the renderer picks up the new files.
node tools/gen-art.mjs --manifest-only
```

### What to check on the sample batch

Four things go wrong, and they all go wrong systemically — if one tile has it, most will:

- **A white-background sticker** instead of a full-bleed environment → the subject did not name a
  place. Fix rule 2 in the offending lines.
- **Realistic proportions** on a creature → the chibi anchor drifted too far from the front. Fix
  rule 1.
- **Text or lettering** rendered anywhere in the frame → a text-magnet noun or a negation slipped
  through. Fix rules 3 and 4.
- **A signature surviving in a bottom corner** → if it is one or two tiles, just re-roll them with
  `--force`; FLUX signs stochastically and a fresh seed usually comes back clean. Only raise
  `DEFAULTS.cropFraction` if it is happening across the set, because the crop happens at encode
  time and raising it means regenerating everything.

Fix the prompts and re-run the sample before spending on the remaining cards.

### QC needs both passes, not one

The bottom-strip sweep and the contact sheet catch different failures, and a run is only clean when
both are done:

- **The strip sweep** (bottom ~9% at 2x zoom) is the only way to see a corner signature, which is
  invisible at contact-sheet size. Page through it with an explicit window (`?from=N&n=26`) and
  check that the last row of each window actually rendered — rows below the fold are silently
  skipped, and that is exactly how a signature on `ogn-310` survived the first sweep of the second
  wave.
- **The contact sheet** is the only way to see lettering anywhere else in the frame — a carved arch
  band, a crate stencil, a shop front. `ogs-021` had "NITZLIGR" across the top of a hall and passed
  the strip sweep cleanly.

When one id fails twice in the same way, stop re-rolling and change the prompt: `ogn-310` was
signed in the same empty bottom-right corner on two consecutive rolls, and filling that corner with
terrain ("the packed sand banking up across the lower corners of the frame") fixed it. Likewise
`ogs-021` stopped producing inscriptions once the grand hall became an open hilltop — a grand
architectural band is an inscription magnet even when no banned noun appears in the line.
