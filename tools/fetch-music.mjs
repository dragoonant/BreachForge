#!/usr/bin/env node
// tools/fetch-music.mjs — sources the four CC0 music beds and re-encodes them
// into audio/music/. Run from the repo root:  node tools/fetch-music.mjs
//
// Everything here is CC0 / public-domain dedication. Nothing under a licence
// that needs permission goes in this list. Provenance is duplicated into
// docs/sound.md; this file is the machine-readable copy.
//
// What it does, per track:
//   1. download the original into scratch/music-src/ (gitignored, cached)
//   2. decode to 48k stereo float WAV
//   3. find the SUSTAINED BODY by RMS envelope, not by silence detection —
//      a generated fade-out is far too loud to trip a silence test, and if you
//      leave it in the loop sounds like the piece ending and starting again
//   4. for looping beds, crossfade the tail over the head so the seam is gone
//   5. two-pass EBU R128 loudness normalise so the four sit at one level
//   6. encode twice: Opus-in-Ogg (gapless, which the seamless loop needs)
//      and AAC/m4a (for browsers that refuse Opus)
//
// If ffmpeg is missing the script says so and stops rather than shipping junk.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SRC_DIR = 'scratch/music-src';
const OUT_DIR = 'audio/music';
const BUDGET = 8 * 1024 * 1024;          // ~8 MB total on disk, both formats
const XFADE = 0.40;                      // loop seam crossfade, seconds

const TRACKS = [
  {
    name: 'deckpick',
    title: 'Medieval: The Old Tower Inn',
    author: 'RandomMind',
    page: 'https://opengameart.org/content/medieval-the-old-tower-inn',
    url: 'https://opengameart.org/sites/default/files/The_Old_Tower_Inn.mp3',
    licence: 'CC0',
    loop: true,
    kbps: 88
  },
  {
    name: 'battle',
    title: 'Battle Theme A',
    author: 'cynicmusic (Pixelsphere)',
    page: 'https://opengameart.org/content/battle-theme-a',
    url: 'https://opengameart.org/sites/default/files/battleThemeA.mp3',
    licence: 'CC0',
    loop: true,
    kbps: 88
  },
  {
    name: 'victory',
    title: 'Victory Fanfare',
    author: 'aroachifoundonmypillow',
    page: 'https://opengameart.org/content/victory-fanfare',
    url: 'https://opengameart.org/sites/default/files/fanfare1.ogg',
    licence: 'CC0',
    loop: false,
    kbps: 112
  },
  {
    name: 'defeat',
    title: 'Icy Game Over',
    author: 'sudocolon',
    page: 'https://opengameart.org/content/icy-game-over',
    url: 'https://opengameart.org/sites/default/files/Icy%20Game%20Over.mp3',
    licence: 'CC0',
    loop: false,
    kbps: 112
  }
];

// ------------------------------------------------------------------ shell --

function run(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { maxBuffer: 1 << 29, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`${bin} exited ${r.status}\n${(r.stderr || '').toString().slice(-1200)}`);
  }
  return r;
}

function have(bin) {
  return spawnSync(bin, ['-version'], { stdio: 'ignore' }).status === 0;
}

const ff = (args) => run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args]);

function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration,bit_rate:stream=codec_name,sample_rate,channels',
    '-of', 'json', file]);
  return JSON.parse(r.stdout.toString());
}

// ------------------------------------------------------------- RMS shaping --

// Per-window RMS in dBFS. Mono, 8 kHz — plenty for an envelope.
function envelope(file, win = 0.05) {
  const r = run('ffmpeg', ['-hide_banner', '-v', 'error', '-i', file,
    '-ac', '1', '-ar', '8000', '-f', 'f32le', '-']);
  const b = r.stdout;
  const pcm = new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
  const step = Math.max(1, Math.round(8000 * win));
  const out = [];
  for (let i = 0; i + step <= pcm.length; i += step) {
    let s = 0;
    for (let j = i; j < i + step; j++) s += pcm[j] * pcm[j];
    const rms = Math.sqrt(s / step);
    out.push(20 * Math.log10(Math.max(rms, 1e-7)));
  }
  return { db: out, win };
}

// The sustained body: everything at or above (loud-level - drop) dB.
//
// The reference level is the 80th percentile of the envelope, i.e. "how loud
// is this piece when it is actually playing". A fade-out sits 10-30 dB under
// that while still being 40 dB above any silence threshold, which is exactly
// why silence detection is the wrong tool here.
function bodyRange({ db, win }, headDrop, tailDrop) {
  const sorted = [...db].sort((a, b) => a - b);
  const level = sorted[Math.floor(sorted.length * 0.80)];
  const headTh = level - headDrop;
  const tailTh = level - tailDrop;

  let i = 0;
  while (i < db.length && db[i] < headTh) i++;
  let j = db.length - 1;
  while (j > i && db[j] < tailTh) j--;

  // Never cut more than we meant to; if the envelope is unusual, keep it all.
  if (j - i < db.length * 0.25) { i = 0; j = db.length - 1; }

  return { start: i * win, end: (j + 1) * win, level, headTh, tailTh };
}

// ------------------------------------------------------------- loudness ----

function measure(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af',
    'loudnorm=I=-18:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'],
    { maxBuffer: 1 << 28 });
  const txt = r.stderr.toString();
  const m = txt.slice(txt.lastIndexOf('{'));
  return JSON.parse(m.slice(0, m.indexOf('}') + 1));
}

function loudnormFilter(m) {
  return `loudnorm=I=-18:TP=-1.5:LRA=11:measured_I=${m.input_i}:` +
    `measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:` +
    `measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;
}

// ----------------------------------------------------------------- steps ---

function download(t) {
  const ext = path.extname(new URL(t.url).pathname) || '.bin';
  const file = path.join(SRC_DIR, t.name + ext);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) {
    console.log(`  cached  ${file} (${fs.statSync(file).size} B)`);
    return file;
  }
  console.log(`  GET     ${t.url}`);
  run('curl', ['-fsSL', '-A', 'Mozilla/5.0 (BreachForge asset fetch)', '-o', file, t.url]);
  const size = fs.statSync(file).size;
  if (size < 1024) throw new Error(`${t.url} returned only ${size} bytes`);
  console.log(`  saved   ${file} (${size} B)`);
  return file;
}

function build(t, src) {
  const work = path.join(SRC_DIR, `${t.name}.work.wav`);
  const body = path.join(SRC_DIR, `${t.name}.body.wav`);
  const norm = path.join(SRC_DIR, `${t.name}.norm.wav`);

  // 1. canonical PCM
  ff(['-i', src, '-ac', '2', '-ar', '48000', '-c:a', 'pcm_f32le', work]);

  // 2. RMS envelope -> sustained body
  const env = envelope(work);
  const range = t.loop
    ? bodyRange(env, 6, 6)      // loops: cut intro swell AND the fade-out
    : bodyRange(env, 25, 45);   // one-shots: keep the natural decay, drop dead air
  const dur = +probe(work).format.duration;
  console.log(`  body    ${range.start.toFixed(2)}s -> ${range.end.toFixed(2)}s ` +
    `of ${dur.toFixed(2)}s  (ref ${range.level.toFixed(1)} dBFS, ` +
    `head>${range.headTh.toFixed(1)}, tail>${range.tailTh.toFixed(1)})`);

  const len = range.end - range.start;
  ff(['-i', work, '-ss', String(range.start), '-t', String(len),
    '-c:a', 'pcm_f32le', body]);

  // 3. loop seam: crossfade the body's tail over its head.
  //    out = body[X..L] with its last X crossfaded into body[0..X]
  //    -> length L-X, and the join back to the start is continuous.
  let shaped = body;
  if (t.loop && len > XFADE * 6) {
    const looped = path.join(SRC_DIR, `${t.name}.loop.wav`);
    ff(['-i', body, '-i', body, '-filter_complex',
      `[0:a]atrim=start=${XFADE},asetpts=N/SR/TB[a];` +
      `[1:a]atrim=end=${XFADE},asetpts=N/SR/TB[b];` +
      `[a][b]acrossfade=d=${XFADE}:c1=tri:c2=tri[o]`,
      '-map', '[o]', '-c:a', 'pcm_f32le', looped]);
    shaped = looped;
    console.log(`  seam    ${XFADE}s tail-over-head crossfade`);
  }

  // 4. two-pass EBU R128, so the fanfare does not blow out the battle bed
  const m = measure(shaped);
  ff(['-i', shaped, '-af', loudnormFilter(m), '-ar', '48000',
    '-c:a', 'pcm_f32le', norm]);
  console.log(`  loud    ${(+m.input_i).toFixed(1)} LUFS -> -18.0 LUFS`);

  return norm;
}

function encode(t, wav, kbps) {
  const ogg = path.join(OUT_DIR, `${t.name}.ogg`);
  const m4a = path.join(OUT_DIR, `${t.name}.m4a`);

  // Opus in Ogg. Gapless by design — this is the one that loops cleanly.
  ff(['-i', wav, '-c:a', 'libopus', '-b:a', `${kbps}k`,
    '-vbr', 'on', '-compression_level', '10',
    '-application', 'audio', '-frame_duration', '20',
    '-map_metadata', '-1', ogg]);

  // AAC in m4a, for anything that will not decode Opus.
  ff(['-i', wav, '-c:a', 'aac', '-b:a', `${kbps + 8}k`,
    '-movflags', '+faststart', '-map_metadata', '-1', m4a]);

  return [ogg, m4a];
}

// ------------------------------------------------------------------ main ---

if (!have('ffmpeg') || !have('ffprobe')) {
  console.error('ffmpeg/ffprobe not found on PATH — cannot re-encode.');
  console.error('Install it (brew install ffmpeg) and re-run. Nothing was written.');
  process.exit(1);
}

fs.mkdirSync(SRC_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const report = [];
let kbpsScale = 1;

for (let pass = 0; pass < 3; pass++) {
  report.length = 0;
  for (const t of TRACKS) {
    console.log(`\n== ${t.name} — "${t.title}" by ${t.author} [${t.licence}]`);
    const src = download(t);
    const wav = build(t, src);
    const kbps = Math.max(48, Math.round(t.kbps * kbpsScale));
    const files = encode(t, wav, kbps);
    const sizes = files.map(f => fs.statSync(f).size);
    const d = +probe(files[0]).format.duration;
    console.log(`  out     ${files[0]} ${sizes[0]} B / ${files[1]} ${sizes[1]} B  ` +
      `(${d.toFixed(2)}s @ ${kbps}k)`);
    report.push({ t, files, sizes, duration: d, kbps });
  }

  const total = report.reduce((a, r) => a + r.sizes[0] + r.sizes[1], 0);
  if (total <= BUDGET) {
    console.log(`\nTOTAL ${total} B (${(total / 1048576).toFixed(2)} MB) — within the ~8 MB budget.`);
    break;
  }
  console.log(`\nTOTAL ${total} B over budget — re-encoding harder.`);
  kbpsScale *= 0.75;
}

console.log('\n--- provenance (mirror of docs/sound.md) ---');
for (const r of report) {
  console.log(`${r.t.name}: "${r.t.title}" by ${r.t.author} — ${r.t.licence} — ${r.t.page}`);
}
