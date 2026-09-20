# Sound

All audio in BreachForge goes through `js/audio.js`. The rest of the app never
touches an `AudioContext`, an `<audio>` element, or a file path — it calls four
functions and nothing else.

```js
RB.audio.init();                                   // lazy; creates nothing
RB.audio.play('card.play');                        // a sound effect
RB.audio.play('point.score', {points: 6, mine: true});
RB.audio.music('battle');                          // crossfade to a screen bed
RB.audio.setMuted(true);  RB.audio.isMuted();      // persisted in localStorage
```

Two decisions shape everything below.

**Sound effects are synthesised, not loaded.** There is no SFX file in this
repo and none is ever fetched. All 27 tags are built from four hand-made Web
Audio voices. That makes the whole set free, instant, and tweakable by editing
numbers in one table — no round trip to a generator, no licence to track.

**There is exactly one `AudioContext`.** Music is fetched and decoded into that
same context as an `AudioBuffer`; it does not use `<audio>` elements. Mixing
the two is how you end up with a context parked in `suspended`, music playing,
SFX silent, and nothing in the console to tell you why.

---

## The voice kit

Every tag is a short recipe over four primitives (`js/audio.js`, "voice kit"):

| Voice | What it is | Used for |
|---|---|---|
| `vNoise` | white noise through a filter with a moving cutoff | paper, cloth, grit, impact bodies |
| `vFM` | two oscillators, one modulating the other's frequency | metal, bells, thuds, anything with clang |
| `vBlip` | a plain pitched tone with an optional glide | clicks, chimes, arpeggio notes, score pings |
| `vSweep` | a long glide, tone or noise through a moving band | risers, whooshes, falls |

They all share one amplitude envelope helper and all route into the SFX bus.

## Buses

```
voice ──► (optional pan) ──► sfxBus  (0.30) ──┐
                                              ├──► master (0.90) ──► destination
music track gain ──────────► musicBus (0.55) ─┘
```

SFX sits deliberately *under* music. A card game fires dozens of little
transients a minute; if they are the loudest thing in the mix they fatigue fast.

---

## Tags

27 tags. `RB.audio.play(tag)` with an **unknown tag is silently ignored** — no
warning, no throw. The engine is allowed to tag events whose sound does not
exist yet.

### Cards

| Tag | What it voices |
|---|---|
| `card.draw` | Upward paper swish — bandpass noise sweeping 900→3200 Hz with a faint tone under it. |
| `card.play` | A slap onto the table: bright noise transient collapsing to 700 Hz over a short low FM thud. |
| `card.discard` | `card.draw` inverted — noise falling 2600→520 Hz with a sinking tone. Reads as "away". |

### Units

| Tag | What it voices |
|---|---|
| `unit.deploy` | Weight landing: low FM thud (140→70 Hz), a noise body, and a rising 220→330 Hz tone so it feels like an arrival rather than a drop. |
| `unit.move` | Small scuff — short bandpass noise rising, tiny tone. Throttled; it fires a lot. |
| `unit.die` | Falling sawtooth sweep 420→70 Hz, noise crunch, and a low detuned FM tail. |

### Gear and spells

| Tag | What it voices |
|---|---|
| `gear.equip` | Two inharmonic FM hits (ratios 3.13 and 2.41) plus a high noise tick — metal on metal. |
| `spell.cast` | Noise riser 600→5200 Hz, then a rising tone and a bell that blooms after it. |

### The chain

| Tag | What it voices |
|---|---|
| `chain.add` | A single dry tick — square blip at 740 Hz plus a highpass click. Deliberately small; it repeats. |
| `chain.resolve` | Three descending notes (784/659/523 Hz) closing into a soft noise fall. The chain unwinding. |

### Runes

| Tag | What it voices |
|---|---|
| `rune.channel` | Noise wash rising 320→2400 Hz under a tone opening its filter — energy gathering. |
| `rune.recycle` | Down-then-up pair (494→330, then 392→587 Hz) with a noise sweep. "Spent, returned." |
| `rune.ready` | A clean bell: FM at 1046 Hz, ratio 3.51, long decay. The most pleasant sound in the set. |

### Showdowns

| Tag | What it voices |
|---|---|
| `showdown.start` | A 0.55 s riser 90→480 Hz that lands on a noise-plus-FM impact. Tension then commit. |
| `showdown.win` | Rising major triad (523/659/784 Hz) with a bell on top and a high tick. |
| `showdown.lose` | Two falling notes (440→370 Hz) onto a low, dull FM thud. |

### Battlefields

| Tag | What it voices |
|---|---|
| `battlefield.conquer` | The biggest non-endgame sound: sub FM at 84→42 Hz, a wide noise body, a rising 262/392/523 Hz chord, and a noise riser over the top. |
| `battlefield.hold` | The same idea, smaller and shorter — mid thud plus a steady 330 Hz tone. Holding is not conquering. |

### Legend

| Tag | What it voices |
|---|---|
| `legend.activate` | Noise riser to 6000 Hz, then a stacked FM chord (330/494/660 Hz, slightly detuned ratios) over a low 82→55 Hz sub. Deliberately the most "special" texture. |

### Scoring

| Tag | What it voices |
|---|---|
| `point.score` | See below — the one tag that takes an argument. |

### Turn and UI

| Tag | What it voices |
|---|---|
| `turn.start` | Two-note rise, 392→587 Hz, sine, with a breath of high noise. |
| `turn.end` | Two-note fall, 494→330 Hz. Same voice, opposite direction. |
| `ui.click` | 45 ms square tick plus a highpass transient. Throttled to 20 ms. |
| `ui.hover` | 35 ms sine at 1320 Hz, very quiet — the quietest thing in the game. Throttled to 45 ms. |
| `ui.invalid` | Two dull low square blips (168 then 142 Hz) through an 900 Hz lowpass. Buzzy, not harsh. |

### Match end

| Tag | What it voices |
|---|---|
| `game.win` | Four-note rise (523/659/784/1046 Hz), each note doubled by an FM bell, over a 1.3 s sub and a long noise riser. |
| `game.lose` | Four-note fall (392/330/262/196 Hz) over a 1.5 s low FM drone and a sawtooth sweep down to 60 Hz. |

---

## `point.score` — the clock

The whole game is a race to 8 points, and a distinct, escalating sound per
point is the cheapest way to make that clock felt. So this one tag takes an
argument:

```js
RB.audio.play('point.score', { points: 6, mine: true });
```

- **`points`** — the score *after* this point lands, 1–8 (clamped).
- **`mine`** — `true` for the player's side, `false` for the opponent's.
  Defaults to `true`.

### What changes as the score climbs

| | |
|---|---|
| **Pitch** | The root walks up a major-pentatonic ladder, one rung per point. |
| **Brightness** | The tonal layer's lowpass opens from 2200 Hz to 8200 Hz (mine) / 1100→3700 Hz (theirs). |
| **Layers** | 1 at low scores, up to 7 at game point. |

| Points | Layers added |
|---|---|
| 1+ | The ping itself, plus a high tick. |
| 3+ | An octave above, as FM — it starts to ring. |
| 4+ | A shimmer two octaves up, growing with the score. Without it the sub layers below drag the whole sound darker as the race tightens. |
| 5+ | A third, giving the chord a colour — major for the player, flatter for the opponent. |
| 6+ | A sub underneath. You feel the score now. |
| **7 — match point** | **Categorically different**: a noise riser *in front of* the hit, a stacked fifth with a 1.1 s bell tail, and a wide noise body. One more point ends it. |
| **8 — game** | The full stack plus a rolled four-note chord and a 1.4 s sub. |

### Sides

The opponent's points are audibly darker: rooted a fifth lower in a lower
register, filters roughly half as open, and coloured with a flatter third
(1.1892 vs 1.2599). Measured on the real output, the opponent's spectral
centroid is lower than the player's **at every one of the 8 points** —
averaging 2.8 kHz against 3.8 kHz.

Measured energy across the race rises **8.8×** from point 1 to point 8 and is
monotonic the whole way, with the largest single jump (1.9×) landing between
match point and game.

`point.score` is deliberately the one tag that will **never** get a recorded
sample. Its whole value is the live parameter — eight fixed files would lose
the escalation and the mine/theirs split that make the clock legible.

One honest caveat: the *overall* spectral centroid still falls as the score
climbs (6.4 kHz at point 1 down to 2.3 kHz at point 8), because the sub layers
added at 6+ grow faster than the top end does. The shimmer layer at 4+ exists
to fight this and recovers some of it, but big moments in this kit genuinely
are weightier rather than brighter. If match point ever sounds muddy rather
than huge, the knobs are the layer-4 and game-point `peak` values.

---

## Recorded samples

Some things an oscillator cannot fake: real paper, real metal, a real impact.
Those tags get a recorded one-shot, generated by `tools/fetch-sfx.mjs` through
the ElevenLabs sound-generation API and re-encoded exactly like the music.

**The sample layer is additive and every tag keeps its synthesised voice.**

- A tag with a loaded sample plays the sample.
- A tag whose sample is missing, still downloading, or fails to decode plays
  its oscillator recipe instead.
- Delete `audio/sfx/` entirely and the game degrades to the full synth set
  with nothing broken and nothing logged.

The first hit on a file-backed tag is therefore *always* the synth voice — the
fetch starts on that hit and the sample takes over from the second hit onward.
That is deliberate: it costs no latency and never produces a silent event.
A tag whose file cannot load is marked once and never re-requested.

Samples decode into **the same `AudioContext`** as everything else, play
through the same SFX bus, and build a fresh `AudioBufferSourceNode` per hit, so
like the music one-shots they are always rewound.

`SAMPLES` in `js/audio.js` sits between two markers and is **written by the
tool, not by hand** — same arrangement as `tools/import-cards.mjs` generating
`data/*.js`. The tool only lists tags whose files are actually on disk, which
is what stops the module from 404-ing for samples that were never built.

### Status

**Not yet generated.** The module wiring, the tool, and the prompts are done
and tested (against a local fixture), but the paid API run has not been made —
see the note at the end of this section. `SAMPLES` is currently empty, so every
tag is synthesised today and the game is complete and audible as-is.

### The planned set — 15 tags

| Tag | Duration | Gain | Prompt |
|---|---|---|---|
| `card.draw` | 1.0 s | 0.55 | `single card sliding off a deck, crisp paper` |
| `card.play` | 1.0 s | 0.55 | `playing card slapped flat onto a wooden table` |
| `card.discard` | 1.2 s | 0.50 | `card tossed onto a pile, soft paper flutter` |
| `unit.deploy` | 1.2 s | 0.60 | `heavy armored boots land on stone, deep thud` |
| `unit.die` | 1.5 s | 0.55 | `armored knight collapses, metal clatter on stone` |
| `gear.equip` | 1.0 s | 0.55 | `metal buckle clasps onto armor, sharp click` |
| `spell.cast` | 1.5 s | 0.55 | `magic spell released, airy whoosh with sparkle` |
| `rune.channel` | 2.0 s | 0.50 | `arcane energy charging, rising crystalline hum` |
| `showdown.start` | 2.0 s | 0.60 | `low war horn blast, tense drum hit` |
| `showdown.win` | 1.5 s | 0.55 | `bright metallic clash, victorious ring` |
| `showdown.lose` | 1.5 s | 0.55 | `dull heavy clash, metal scrape down` |
| `battlefield.conquer` | 2.5 s | 0.65 | `deep cannon boom, banner unfurling` |
| `legend.activate` | 2.5 s | 0.60 | `huge magical surge, deep swell and shimmer` |
| `game.win` | 2.5 s | 0.60 | `short triumphant orchestral hit, bright brass` |
| `game.lose` | 2.5 s | 0.60 | `short dark orchestral hit, low strings fade` |

629 prompt characters, 25.4 seconds of audio. `prompt_influence` is 0.6.

`game.win` and `game.lose` are prompted as short *hits*, not fanfares, on
purpose: the victory and defeat music tracks are the fanfare, and a second one
layered on top would be mush. These lead into the music rather than compete.

### Staying synthesised, and why

| Tag | Why |
|---|---|
| `ui.click`, `ui.hover`, `ui.invalid` | Need zero latency and fire constantly. An oscillator tick is already the right sound and costs nothing. |
| `point.score` | Live parameter across 8 points — see above. |
| `unit.move` | Fires very often; a sample would get repetitive fast and the synth scuff already varies per hit. |
| `chain.add`, `chain.resolve` | Abstract game mechanics with no physical referent; the synth versions read as "systems", which is correct. |
| `rune.recycle`, `rune.ready` | The FM bell and the two-tone blip are distinctly *game* sounds; a recording would make them generic. |
| `battlefield.hold` | Deliberately the smaller sibling of `battlefield.conquer`; keeping it synth preserves that contrast. |
| `turn.start`, `turn.end` | Matched pair — same voice, opposite direction. A sample pair would not stay symmetric. |

### Running the tool

```sh
node tools/fetch-sfx.mjs --dry-run          # print the whole plan, spend nothing
node tools/fetch-sfx.mjs                    # generate whatever is missing
node tools/fetch-sfx.mjs --only unit.die    # one tag, exact match
node tools/fetch-sfx.mjs --limit 3          # cap a paid run
node tools/fetch-sfx.mjs --force            # archive existing, regenerate
```

It is **idempotent**: a tag with both encodes already present is skipped unless
`--force`, which moves the old files to `audio/sfx/_archive/<timestamp>/`
rather than deleting them. Raw MP3s are cached in `scratch/sfx-src/`
(gitignored), so re-encoding never costs another API call. The script prints
the quota before and after and the exact characters spent, and a tag that fails
to generate leaves the rest of the run intact — it just keeps its synth voice.

Token resolution, in order: `--token <key>`, then `ELEVENLABS_API_KEY`, then
the gitignored `.elevenlabs_token` / `elevenlabs.token.rtf` at the repo root.
The key is never printed, logged, or written anywhere by the script.

> **The account is on the starter tier and cannot extend its quota.** Prompt
> text is the meter. Keep prompts short, and do not regenerate casually — use
> `--dry-run` first and `--only` when iterating on a single sound.

### Post-processing

Head silence is trimmed with a **level threshold** (35 dB under the file's
peak, backed off 20 ms). Note this is the opposite choice from the music loops,
and deliberately so: leading silence on a generated one-shot really is
near-silence, whereas a music fade-out is far too loud for a silence test —
see the RMS section below. The tail is never trimmed; the decay is the sound.

Samples are **peak**-normalised to −1 dBFS, not loudness-normalised. These are
transients, and EBU R128 would shove the short ones far too loud. Final
balancing against the synth voices is the per-tag `gain` in the table above,
chosen so no sample exceeds the loudest already-tuned synth tag
(`battlefield.conquer`, 0.18 at the master output).

```sh
# trim head, limit, normalise, canonical PCM
ffmpeg -y -i scratch/sfx-src/unit-deploy.mp3 -ss <head> \
  -af "afade=t=in:st=0:d=0.004,alimiter=limit=0.891:level=false,\
dynaudnorm=f=500:g=3:p=0.9:m=1.0:s=0,alimiter=limit=0.891:level=false" \
  -ac 2 -ar 48000 -c:a pcm_f32le scratch/sfx-src/unit-deploy.trim.wav

# same two-format scheme as the music
ffmpeg -y -i scratch/sfx-src/unit-deploy.trim.wav -c:a libopus -b:a 96k -vbr on \
  -compression_level 10 -application audio -frame_duration 20 \
  -map_metadata -1 audio/sfx/unit-deploy.ogg
ffmpeg -y -i scratch/sfx-src/unit-deploy.trim.wav -c:a aac -b:a 112k \
  -movflags +faststart -map_metadata -1 audio/sfx/unit-deploy.m4a
```

---

## Music

Four tracks, five screens — `title` reuses the deck-picker bed at a lower gain.

| Screen | Track | Behaviour |
|---|---|---|
| `title` | `deckpick` | loops, 0.70 gain |
| `deckpick` | `deckpick` | loops, 0.95 gain |
| `battle` | `battle` | loops, 0.90 gain |
| `victory` | `victory` | **plays once**, leaves the screen quiet |
| `defeat` | `defeat` | **plays once**, leaves the screen quiet |

`RB.audio.music(null)` (or any unknown screen) fades to silence.

Every play builds a fresh `AudioBufferSourceNode` from sample 0, so a one-shot
is **always rewound** — losing twice in a row is not silent the second time.
When a one-shot ends the module clears its "currently playing" state, which is
the other half of that bug.

Each track ships twice:

- **`.ogg` — Opus in Ogg.** Gapless by design, which is what a seamless loop
  needs. This is the one that plays almost everywhere.
- **`.m4a` — AAC.** For browsers that refuse Opus.

The module tries Opus first and falls back to AAC if either the fetch or
`decodeAudioData` refuses, then remembers which container won for every later
track. **No `<audio>` element is ever created** — not even to sniff format
support — because a muted reload has to create no audio element and fetch
nothing at all.

### Provenance

All four are **CC0 / public-domain dedication**. Nothing here needs permission
or attribution, though the authors deserve it anyway.

| Screen | Title | Author | Licence | Source |
|---|---|---|---|---|
| `deckpick` | Medieval: The Old Tower Inn | RandomMind | CC0 | https://opengameart.org/content/medieval-the-old-tower-inn |
| `battle` | Battle Theme A | cynicmusic (Pixelsphere) | CC0 | https://opengameart.org/content/battle-theme-a |
| `victory` | Victory Fanfare | aroachifoundonmypillow | CC0 | https://opengameart.org/content/victory-fanfare |
| `defeat` | Icy Game Over | sudocolon | CC0 | https://opengameart.org/content/icy-game-over |

Original files downloaded by `tools/fetch-music.mjs`:

```
https://opengameart.org/sites/default/files/The_Old_Tower_Inn.mp3
https://opengameart.org/sites/default/files/battleThemeA.mp3
https://opengameart.org/sites/default/files/fanfare1.ogg
https://opengameart.org/sites/default/files/Icy%20Game%20Over.mp3
```

### On disk

| File | Bytes | Duration |
|---|---|---|
| `audio/music/deckpick.ogg` | 1,188,319 | 94.46 s |
| `audio/music/deckpick.m4a` | 1,159,193 | 94.45 s |
| `audio/music/battle.ogg` | 1,022,716 | 91.76 s |
| `audio/music/battle.m4a` | 1,123,375 | 91.75 s |
| `audio/music/victory.ogg` | 124,386 | 6.26 s |
| `audio/music/victory.m4a` | 96,411 | 6.25 s |
| `audio/music/defeat.ogg` | 128,483 | 8.31 s |
| `audio/music/defeat.m4a` | 127,294 | 8.30 s |
| **Total** | **4,970,177 (4.74 MB)** | |

---

## Re-encoding: `tools/fetch-music.mjs`

```sh
node tools/fetch-music.mjs      # from the repo root
```

Originals are cached in `scratch/music-src/` (gitignored), so a re-run only
re-encodes. If `ffmpeg`/`ffprobe` are missing the script says so and writes
nothing rather than shipping something worse.

### Why the trim is by RMS envelope and not silence detection

A generated fade-out is 10–30 dB below the body of the piece but still 40 dB
above anything a silence threshold would catch. Leave it in a loop and the
track audibly *ends and restarts* every pass. So the script decodes to mono
8 kHz, takes RMS over 50 ms windows, uses the **80th percentile** of that
envelope as "how loud is this piece when it is actually playing", and keeps
everything within 6 dB of it (looping beds). One-shots use much gentler
thresholds — head −25 dB, tail −45 dB — because their decay *is* the sound.

This is what it actually cut:

| Track | Kept | Of | Reference level |
|---|---|---|---|
| `deckpick` | 0.75 → 95.60 s | 105.48 s | −16.2 dBFS |
| `battle` | 0.50 → 92.65 s | 95.85 s | −10.2 dBFS |
| `victory` | 0.00 → 6.25 s | 6.86 s | −22.1 dBFS |
| `defeat` | 0.00 → 8.30 s | 8.31 s | −25.4 dBFS |

Nearly 10 seconds of fade-out came off the deck-picker track. A silence test
would have kept all of it.

### The exact chain, per track

```sh
# 1. canonical PCM
ffmpeg -y -i scratch/music-src/deckpick.mp3 \
  -ac 2 -ar 48000 -c:a pcm_f32le scratch/music-src/deckpick.work.wav

# 2. RMS envelope (read by the script, not by ffmpeg's own filters)
ffmpeg -i scratch/music-src/deckpick.work.wav -ac 1 -ar 8000 -f f32le -

# 3. cut to the sustained body found in step 2
ffmpeg -y -i scratch/music-src/deckpick.work.wav -ss 0.75 -t 94.85 \
  -c:a pcm_f32le scratch/music-src/deckpick.body.wav

# 4. loop seam: crossfade the body's tail over its own head, so the join
#    back to the start is continuous (looping beds only)
ffmpeg -y -i scratch/music-src/deckpick.body.wav -i scratch/music-src/deckpick.body.wav \
  -filter_complex "[0:a]atrim=start=0.4,asetpts=N/SR/TB[a];\
[1:a]atrim=end=0.4,asetpts=N/SR/TB[b];\
[a][b]acrossfade=d=0.4:c1=tri:c2=tri[o]" \
  -map "[o]" -c:a pcm_f32le scratch/music-src/deckpick.loop.wav

# 5. two-pass EBU R128 to -18 LUFS, so the fanfare cannot blow out the battle bed.
#    Pass 1 measures:
ffmpeg -i scratch/music-src/deckpick.loop.wav \
  -af loudnorm=I=-18:TP=-1.5:LRA=11:print_format=json -f null -
#    Pass 2 applies the measured values linearly:
ffmpeg -y -i scratch/music-src/deckpick.loop.wav \
  -af "loudnorm=I=-18:TP=-1.5:LRA=11:measured_I=<input_i>:measured_TP=<input_tp>\
:measured_LRA=<input_lra>:measured_thresh=<input_thresh>:offset=<target_offset>:linear=true" \
  -ar 48000 -c:a pcm_f32le scratch/music-src/deckpick.norm.wav

# 6a. Opus in Ogg — gapless, the seamless-loop format
ffmpeg -y -i scratch/music-src/deckpick.norm.wav \
  -c:a libopus -b:a 88k -vbr on -compression_level 10 \
  -application audio -frame_duration 20 -map_metadata -1 \
  audio/music/deckpick.ogg

# 6b. AAC in m4a — for browsers that refuse Opus
ffmpeg -y -i scratch/music-src/deckpick.norm.wav \
  -c:a aac -b:a 96k -movflags +faststart -map_metadata -1 \
  audio/music/deckpick.m4a
```

Measured loudness corrections on the shipped run: deckpick −17.4 → −18.0 LUFS,
battle −10.3 → −18.0, victory −22.7 → −18.0, defeat −24.9 → −18.0.

Bitrates are 88k for the looping beds and 112k for the two short stingers. The
script totals the output and, if it exceeds ~8 MB, re-encodes the whole set at
75% of those rates until it fits.

### Replacing a track

Edit the `TRACKS` array at the top of `tools/fetch-music.mjs` — `url`, `title`,
`author`, `page`, `licence`, `loop`, `kbps` — delete the cached original from
`scratch/music-src/`, and re-run. **Only CC0 / public-domain sources.** Check
the licence on the source page's own licence field, not on sidebar or tag text;
OpenGameArt pages routinely show CC0 in a sidebar collection while the item
itself is OGA-BY.

---

## Adding a new tag

1. Add a key to the `TAGS` table in `js/audio.js`. The value is a function
   `(t, opts) => void`, where `t` is the scheduled start time in context time.
   Compose it from `vNoise` / `vFM` / `vBlip` / `vSweep`; schedule layers at
   `t + offset` to build a gesture rather than a single hit.

   ```js
   'gear.shatter': function (t) {
     vNoise(t, { dur: 0.18, filter: 'bandpass', q: 1.4, from: 5200, to: 900, peak: 0.34, a: 0.002, rel: 0.17 });
     vFM(t, { dur: 0.30, freq: 260, freqTo: 90, ratio: 2.7, index: 600, peak: 0.30, rel: 0.28 });
   },
   ```

2. That is the whole change. Nothing else in the file needs touching — the tag
   is live, appears in `RB.audio.TAGS`, and shows up as a button in
   `scratch/audio-check.html`.

3. If it can fire many times a second, add it to `THROTTLE` with a minimum gap
   in seconds.

4. Keep `peak` values roughly in the 0.05–0.5 band used above. Measured at the
   master output the existing set peaks between 0.012 (`ui.hover`) and 0.18
   (`battlefield.conquer`), with nothing clipping — stay inside that and the
   mix stays balanced.

Calling a tag before it exists is safe: `play()` ignores unknown tags silently,
so the engine can be wired up ahead of the sound design.

### Giving an existing tag a recorded sample

Add a row to the `SFX` array in `tools/fetch-sfx.mjs` (`tag`, `secs`, `gain`,
`prompt`), run `--dry-run` to check the cost, then run `--only <tag>`. The tool
writes the files, wires `SAMPLES` in `js/audio.js`, and the tag switches over
on its second hit. Keep the synth recipe — it is the fallback, and it is what
plays on the first hit and whenever the file is unavailable.

---

## Checking it

`scratch/audio-check.html` (gitignored) is a button per tag, per score value,
and per music screen, plus a "run all" soak. Serve the repo root and open it:

```sh
python3 -m http.server 8123
# http://127.0.0.1:8123/scratch/audio-check.html
```

It taps the final mix with an analyser, so it reports real output amplitude
rather than just "did it throw" — useful because a Web Audio graph will
happily build, schedule, and play absolute silence without a single error.
