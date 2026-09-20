#!/usr/bin/env node
// tools/fetch-sfx.mjs — generates the recorded half of the SFX set with the
// ElevenLabs sound-generation API, then re-encodes it the same way as music.
//
//   node tools/fetch-sfx.mjs --dry-run        # print the whole plan, spend nothing
//   node tools/fetch-sfx.mjs                  # generate whatever is missing
//   node tools/fetch-sfx.mjs --only unit.die  # one tag, exact match
//   node tools/fetch-sfx.mjs --limit 3        # cap a paid run
//   node tools/fetch-sfx.mjs --force          # archive existing, regenerate
//
// GENERATION COSTS REAL MONEY AND THE ACCOUNT CANNOT EXTEND ITS QUOTA.
// The script is idempotent: a tag that already has BOTH output encodes is
// skipped unless --force. Nothing is ever silently regenerated.
//
// Only some tags get files. UI ticks and point.score stay synthesised in
// js/audio.js — see docs/sound.md for why. Every tag listed here keeps its
// oscillator recipe as a fallback: if the file is missing or fails to decode,
// the synth voice plays instead and nothing breaks.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const OUT_DIR = 'audio/sfx';
const RAW_DIR = 'scratch/sfx-src';
const ARCHIVE = 'audio/sfx/_archive';
const API = 'https://api.elevenlabs.io/v1/sound-generation';
const SUB = 'https://api.elevenlabs.io/v1/user/subscription';

// Prompts are the meter. Keep them short and specific; a longer prompt is not
// a better sound, it is just a more expensive one. These strings are mirrored
// into docs/sound.md so a regeneration is a rerun, not a rewrite.
const SFX = [
  { tag: 'card.draw',           secs: 1.0, gain: 0.55, prompt: 'single card sliding off a deck, crisp paper' },
  { tag: 'card.play',           secs: 1.0, gain: 0.55, prompt: 'playing card slapped flat onto a wooden table' },
  { tag: 'card.discard',        secs: 1.2, gain: 0.50, prompt: 'card tossed onto a pile, soft paper flutter' },
  { tag: 'unit.deploy',         secs: 1.2, gain: 0.60, prompt: 'heavy armored boots land on stone, deep thud' },
  { tag: 'unit.die',            secs: 1.5, gain: 0.55, prompt: 'armored knight collapses, metal clatter on stone' },
  { tag: 'gear.equip',          secs: 1.0, gain: 0.55, prompt: 'metal buckle clasps onto armor, sharp click' },
  { tag: 'spell.cast',          secs: 1.5, gain: 0.55, prompt: 'magic spell released, airy whoosh with sparkle' },
  { tag: 'rune.channel',        secs: 2.0, gain: 0.50, prompt: 'arcane energy charging, rising crystalline hum' },
  { tag: 'showdown.start',      secs: 2.0, gain: 0.60, prompt: 'low war horn blast, tense drum hit' },
  { tag: 'showdown.win',        secs: 1.5, gain: 0.55, prompt: 'bright metallic clash, victorious ring' },
  { tag: 'showdown.lose',       secs: 1.5, gain: 0.55, prompt: 'dull heavy clash, metal scrape down' },
  { tag: 'battlefield.conquer', secs: 2.5, gain: 0.65, prompt: 'deep cannon boom, banner unfurling' },
  { tag: 'legend.activate',     secs: 2.5, gain: 0.60, prompt: 'huge magical surge, deep swell and shimmer' },
  { tag: 'game.win',            secs: 2.5, gain: 0.60, prompt: 'short triumphant orchestral hit, bright brass' },
  { tag: 'game.lose',           secs: 2.5, gain: 0.60, prompt: 'short dark orchestral hit, low strings fade' }
];

const PROMPT_INFLUENCE = 0.6;
const FILE = t => t.replace(/\./g, '-');   // card.draw -> card-draw

// ------------------------------------------------------------------ args ---

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const val = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const DRY = flag('dry-run');
const FORCE = flag('force');
const ONLY = val('only', null);
const LIMIT = val('limit', null) ? parseInt(val('limit'), 10) : Infinity;

// ----------------------------------------------------------------- shell ---

function run(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { maxBuffer: 1 << 29, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${bin} exited ${r.status}\n${(r.stderr || '').toString().slice(-800)}`);
  return r;
}
const ff = a => run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...a]);
const have = b => spawnSync(b, ['-version'], { stdio: 'ignore' }).status === 0;

function probe(f) {
  return JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration,size', '-of', 'json', f]).stdout.toString());
}

// ----------------------------------------------------------------- token ---
// Resolution order: --token flag, then env, then the gitignored file.
// The value is never printed, logged, or written anywhere by this script.

function token() {
  const fromFlag = val('token', null);
  if (fromFlag) return fromFlag.trim();
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();

  for (const f of ['.elevenlabs_token', 'elevenlabs.token', 'elevenlabs.token.rtf']) {
    if (!fs.existsSync(f)) continue;
    let s = fs.readFileSync(f, 'utf8');
    if (f.endsWith('.rtf')) {
      // strip RTF control words and groups, keep the bare key
      s = s.replace(/\\[a-z]+\d*\s?/gi, '').replace(/[{}]/g, '');
    }
    const m = s.match(/[A-Za-z0-9_\-]{24,}/);
    if (m) return m[0];
  }
  throw new Error(
    'No API key. Pass --token, set ELEVENLABS_API_KEY, or put it in .elevenlabs_token');
}

async function quota(key) {
  const r = await fetch(SUB, { headers: { 'xi-api-key': key } });
  if (!r.ok) throw new Error(`subscription check failed: HTTP ${r.status}`);
  const d = await r.json();
  return { used: d.character_count, limit: d.character_limit, tier: d.tier };
}

// ------------------------------------------------------------- generation --

async function generate(key, item, dest) {
  const body = {
    text: item.prompt,
    duration_seconds: item.secs,
    prompt_influence: PROMPT_INFLUENCE
  };
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 512) throw new Error(`suspiciously small response: ${buf.length} B`);
  fs.writeFileSync(dest, buf);
  return buf.length;
}

// ----------------------------------------------------------- post-process --

// Head trim. Unlike the music loops — where a fade-out is far too loud for a
// silence test and we had to use an RMS body detector — leading silence on a
// generated one-shot really is near-silence, so a level threshold is the right
// tool here. We keep the whole tail: the decay IS the sound.
function headStart(file) {
  const r = run('ffmpeg', ['-hide_banner', '-v', 'error', '-i', file,
    '-ac', '1', '-ar', '8000', '-f', 'f32le', '-']);
  const b = r.stdout;
  const pcm = new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
  const win = Math.round(8000 * 0.01);
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  const th = peak * Math.pow(10, -35 / 20);       // 35 dB under the loudest point
  for (let i = 0; i + win <= pcm.length; i += win) {
    let m = 0;
    for (let j = i; j < i + win; j++) m = Math.max(m, Math.abs(pcm[j]));
    if (m >= th) return Math.max(0, i / 8000 - 0.02);  // back off 20 ms
  }
  return 0;
}

function build(item, raw) {
  const trimmed = path.join(RAW_DIR, FILE(item.tag) + '.trim.wav');
  const ogg = path.join(OUT_DIR, FILE(item.tag) + '.ogg');
  const m4a = path.join(OUT_DIR, FILE(item.tag) + '.m4a');

  const start = headStart(raw);

  // Trim the head, then normalise to a TRUE PEAK of -1 dBFS. Peak (not
  // loudness) normalisation is deliberate: these are transients, and EBU R128
  // would shove the short ones far too loud. Per-tag playback gain in
  // js/audio.js does the final balancing against the synthesised voices.
  ff(['-i', raw, '-ss', String(start),
    '-af', 'afade=t=in:st=0:d=0.004,alimiter=limit=0.891:level=false,'
      + 'dynaudnorm=f=500:g=3:p=0.9:m=1.0:s=0,alimiter=limit=0.891:level=false',
    '-ac', '2', '-ar', '48000', '-c:a', 'pcm_f32le', trimmed]);

  ff(['-i', trimmed, '-c:a', 'libopus', '-b:a', '96k', '-vbr', 'on',
    '-compression_level', '10', '-application', 'audio', '-frame_duration', '20',
    '-map_metadata', '-1', ogg]);
  ff(['-i', trimmed, '-c:a', 'aac', '-b:a', '112k',
    '-movflags', '+faststart', '-map_metadata', '-1', m4a]);

  return { start, ogg, m4a, sizes: [fs.statSync(ogg).size, fs.statSync(m4a).size],
    duration: +probe(ogg).format.duration };
}

function done(item) {
  return fs.existsSync(path.join(OUT_DIR, FILE(item.tag) + '.ogg'))
    && fs.existsSync(path.join(OUT_DIR, FILE(item.tag) + '.m4a'));
}

// ------------------------------------------------------------------ main ---

if (!have('ffmpeg') || !have('ffprobe')) {
  console.error('ffmpeg/ffprobe not found on PATH. Nothing was written.');
  process.exit(1);
}

let plan = SFX.slice();
if (ONLY) {
  plan = plan.filter(x => x.tag === ONLY);
  if (!plan.length) {
    console.error(`--only ${ONLY}: no such tag. Known tags:\n  ` +
      SFX.map(x => x.tag).join('\n  '));
    process.exit(1);
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

if (FORCE && !DRY) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(ARCHIVE, stamp);
  let moved = 0;
  for (const item of plan) {
    for (const ext of ['ogg', 'm4a']) {
      const f = path.join(OUT_DIR, FILE(item.tag) + '.' + ext);
      if (fs.existsSync(f)) {
        fs.mkdirSync(dest, { recursive: true });
        fs.renameSync(f, path.join(dest, path.basename(f)));
        moved++;
      }
    }
  }
  if (moved) console.log(`--force: archived ${moved} file(s) to ${dest}\n`);
}

const todo = plan.filter(x => FORCE || !done(x)).slice(0, LIMIT);
const skip = plan.filter(x => !FORCE && done(x));

const chars = todo.reduce((a, x) => a + x.prompt.length, 0);
const secs = todo.reduce((a, x) => a + x.secs, 0);

console.log(`plan: ${todo.length} to generate, ${skip.length} already present` +
  (LIMIT !== Infinity ? ` (--limit ${LIMIT})` : '') + '\n');
for (const x of todo) {
  console.log(`  GEN  ${x.tag.padEnd(22)} ${String(x.secs).padStart(4)}s  ` +
    `gain ${x.gain}  ${x.prompt.length} chars  "${x.prompt}"`);
}
for (const x of skip) console.log(`  keep ${x.tag.padEnd(22)} (already built)`);
console.log(`\nprompt characters in this run: ${chars}   audio seconds: ${secs}`);

if (DRY) {
  console.log('\n--dry-run: nothing generated, nothing spent.');
  process.exit(0);
}
if (!todo.length) {
  console.log('\nNothing to do. Use --force to regenerate.');
  process.exit(0);
}

const key = token();
const before = await quota(key);
console.log(`\nquota before: ${before.used}/${before.limit} used (${before.tier}), ` +
  `${before.limit - before.used} remaining`);

const built = [];
for (const item of todo) {
  const raw = path.join(RAW_DIR, FILE(item.tag) + '.mp3');
  process.stdout.write(`\n== ${item.tag}\n`);
  try {
    if (!fs.existsSync(raw) || FORCE) {
      const n = await generate(key, item, raw);
      console.log(`  gen     ${n} B mp3`);
    } else {
      console.log(`  cached  ${raw} (no API call)`);
    }
    const r = build(item, raw);
    console.log(`  head    trimmed ${r.start.toFixed(3)}s`);
    console.log(`  out     ${r.ogg} ${r.sizes[0]} B / ${r.m4a} ${r.sizes[1]} B (${r.duration.toFixed(2)}s)`);
    built.push({ item, r });
  } catch (e) {
    console.error(`  FAILED  ${item.tag}: ${e.message}`);
    console.error('  (the tag keeps its synthesised voice — nothing is broken)');
  }
}

const after = await quota(key);
const total = built.reduce((a, b) => a + b.r.sizes[0] + b.r.sizes[1], 0);

console.log(`\nquota after:  ${after.used}/${after.limit} used, ` +
  `${after.limit - after.used} remaining`);
console.log(`characters spent this run: ${after.used - before.used}`);
console.log(`built ${built.length}/${todo.length} tags, ${total} B ` +
  `(${(total / 1024).toFixed(1)} KB) added`);

// Wire the built samples into js/audio.js between its markers, so a run is a
// single command rather than a run plus a hand-edit. Same idea as
// tools/import-cards.mjs generating data/*.js. Only the block between the
// markers is touched; everything else in the file is left alone.
function wire() {
  const F = 'js/audio.js';
  const BEGIN = '/* BEGIN GENERATED SAMPLES';
  const END = '/* END GENERATED SAMPLES */';
  let src = fs.readFileSync(F, 'utf8');
  const a = src.indexOf(BEGIN), b = src.indexOf(END);
  if (a < 0 || b < 0) {
    console.error(`\ncould not find the generated-samples markers in ${F}; ` +
      'paste this in by hand:');
    for (const x of built) {
      console.error(`    '${x.item.tag}': { file: '${FILE(x.item.tag)}', gain: ${x.item.gain} },`);
    }
    return;
  }
  // Keep any entry whose files are still on disk, so --only or a partial run
  // never drops tags that a previous run built.
  const keep = SFX.filter(x => done(x));
  const lines = keep.map(x =>
    `    '${x.tag}': { file: '${FILE(x.tag)}', gain: ${x.gain} },`).join('\n');

  const head = src.slice(0, a) + BEGIN + ' — written by tools/fetch-sfx.mjs, do not hand-edit */\n';
  src = head + (lines ? lines + '\n' : '') + '    ' + src.slice(b);
  fs.writeFileSync(F, src);
  console.log(`\nwired ${keep.length} sample tag(s) into ${F}`);
}

wire();
