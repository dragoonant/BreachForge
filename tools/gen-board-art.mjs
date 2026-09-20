#!/usr/bin/env node
// BreachForge BOARD art generator — the second, smaller pipeline in docs/ART-PROMPT-RULES.md.
//
// This paints the AREAS of the playmat, not subjects on cards. Battlefield zones already paint
// themselves with their own card render; what this tool makes are the two areas that have no card
// behind them — the base (where units muster before they move out) and the rune/resource area
// (where channelled power is kept and spent) — one image per side of the table.
//
// It shares the router, the model, token resolution, the bottom crop and the WebP encode with the
// card generator through tools/lib/hf-image.mjs, and it writes its switch into the same
// art/manifest.js (as RB.boardArt) so js/board.js has one place to look.
//
// What is DIFFERENT from the card pipeline, and it matters more than anything else here:
//   - BOARD_STYLE, not STYLE. These images sit UNDER the cards, so they ask for an empty place:
//     no figure, no creature, nothing with a silhouette to compete with a card standing on it.
//   - Muted and desaturated, detail gathering at the edges so the centre of the frame stays calm.
//   - Wide landscape, not the card's portrait 5:7.
//
// Usage:
//   node tools/gen-board-art.mjs --dry-run              print the plan, generate nothing, free
//   node tools/gen-board-art.mjs                        generate whatever is missing
//   node tools/gen-board-art.mjs --only base-mine       exactly this one
//   node tools/gen-board-art.mjs --force --only runes-theirs   re-roll (archives the old file)
//   node tools/gen-board-art.mjs --token hf_xxx         else HF_TOKEN, else .hf_token/hf_token.md

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULTS, resolveToken, checkTools, generateToWebp, archiveExisting, asyncPool
} from './lib/hf-image.mjs';
import { writeManifest } from './gen-art.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOARD_DIR = path.join(ROOT, 'art', 'board');
const ARCHIVE_DIR = path.join(ROOT, 'art-archive');

// Wide strip, not the card's portrait. The base zone in particular is a long horizontal band.
const BOARD_SIZE = { width: 1344, height: 768 };

// ---------------------------------------------------------------------------
// THE BOARD STYLE CONSTANT.
//
// Byte-identical on every board generation, exactly the way STYLE works for cards — it is what
// makes four independently generated areas read as one playmat. Pasted verbatim into
// docs/ART-PROMPT-RULES.md. Everything in it is phrased positively: asking for "no people" is a
// negation, and negations summon the thing they negate, so this asks for an empty, deserted,
// vacant place instead.
// ---------------------------------------------------------------------------
export const BOARD_STYLE = 'Painted background art for one area of a tabletop playmat. The place '
  + 'stands empty, still and deserted — a vacant setting of bare ground and quiet architecture, '
  + 'motionless and unattended. Muted, heavily desaturated colour held to a narrow range of cool '
  + 'greys with a single restrained accent hue; low contrast throughout, soft diffuse light, every '
  + 'highlight gentle and every shadow open. Detail gathers along the outer edges of the frame and '
  + 'softens toward the middle, so the centre stays calm, simple and uncluttered. Cel-shaded '
  + 'digital painting with soft edges, gentle atmospheric haze, and a wide horizontal landscape '
  + 'composition filling the frame edge to edge. A wordless image, pure texture and place.';

// One subject per board image. Each pair describes the SAME place from opposite sides of the
// table — same architecture, same materials — separated by vantage and by a warm/cool light
// shift, so the two read as one board while still being tellable apart at a glance.
export const SUBJECTS = {
  'base-mine':
    'A muster yard of packed earth inside a low grey keep wall, empty weapon racks along the '
    + 'stones and a cold fire pit at one side, the yard gate standing open toward a pale valley, '
    + 'warm late afternoon light raking in low from the left',
  'base-theirs':
    'The same muster yard of packed earth inside a low grey keep wall seen from the far side, '
    + 'empty weapon racks along the stones and a cold fire pit at one side, the yard gate standing '
    + 'open toward a pale ridge, cold blue overcast light falling flat from the right',
  'runes-mine':
    'A shallow reflecting pool ringed by tall weathered standing stones, each stone holding a '
    + 'faint contained glow deep inside it, still water and low drifting mist, warm amber light '
    + 'pooling at the near edge',
  'runes-theirs':
    'The same ring of tall weathered standing stones around a shallow reflecting pool seen from '
    + 'the opposite bank, each stone holding a faint contained glow deep inside it, still water '
    + 'and colder heavier mist, dim blue light and a darker sky'
};

// Board art carries the same bottom crop as the cards: the model signs its work down there, and a
// background-position of 50% 50% would put a corner signature right on the playmat.
const OPTS = { ...DEFAULTS, ...BOARD_SIZE, cropFraction: 0.08 };

function parseArgs(argv) {
  const o = { dryRun: false, only: null, force: false, token: null, concurrency: 2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--only') o.only = argv[++i];
    else if (a === '--force') o.force = true;
    else if (a === '--token') o.token = argv[++i];
    else if (a === '--concurrency') o.concurrency = Number(argv[++i]);
    else if (a === '--help' || a === '-h') o.help = true;
    else { console.error(`Unknown flag: ${a}`); process.exit(1); }
  }
  return o;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('See the header comment in tools/gen-board-art.mjs, or docs/ART-PROMPT-RULES.md.');
    return;
  }

  let names = Object.keys(SUBJECTS);
  if (opts.only) {
    if (!SUBJECTS[opts.only]) {
      console.error(`--only ${opts.only}: no such board image. Known: ${names.join(', ')}`);
      process.exit(1);
    }
    names = [opts.only];
  }

  const plan = names.map((name) => {
    const filePath = path.join(BOARD_DIR, `${name}.webp`);
    const exists = fs.existsSync(filePath);
    return { name, filePath, exists, action: exists && !opts.force ? 'skip' : 'generate' };
  });
  const todo = plan.filter((p) => p.action === 'generate');

  if (opts.dryRun) {
    console.log(`DRY RUN — no network calls, nothing written, nothing spent.`);
    console.log(`${BOARD_SIZE.width}x${BOARD_SIZE.height}, ${OPTS.cropFraction * 100}% bottom crop.`);
    for (const p of plan) {
      const full = `${SUBJECTS[p.name]} ${BOARD_STYLE}`;
      console.log(`  [${p.name}] ${p.action} · ${full.length} chars`);
      console.log(`      ${SUBJECTS[p.name]}`);
    }
    return;
  }

  const missing = await checkTools();
  if (missing.length) {
    console.error(`Missing required CLI tool(s): ${missing.join(', ')}.`);
    process.exit(1);
  }
  const token = resolveToken(ROOT, opts.token);
  if (!token) {
    console.error('No Hugging Face token: pass --token, set HF_TOKEN, or add .hf_token at the root.');
    process.exit(1);
  }

  console.log(`${names.length} board image(s) in scope, ${todo.length} to generate.`);
  const done = [];
  const failed = [];
  await asyncPool(opts.concurrency, todo, async (p) => {
    try {
      if (p.exists && opts.force) {
        const dest = archiveExisting(p.name, p.filePath, ARCHIVE_DIR);
        console.log(`     archived ${path.relative(ROOT, dest)}`);
      }
      const prompt = `${SUBJECTS[p.name]} ${BOARD_STYLE}`;
      const { bytes } = await generateToWebp(prompt, token, p.filePath, OPTS);
      done.push(`${p.name} (${bytes} bytes)`);
      console.log(`OK   ${p.name}  ${bytes} bytes`);
    } catch (err) {
      failed.push(`${p.name}: ${err.message}`);
      console.error(`FAIL ${p.name}  ${err.message}`);
    }
  });

  const manifest = writeManifest();
  console.log('');
  console.log(`Generated: ${done.length}  Failed: ${failed.length}`);
  console.log(`Manifest: ${path.relative(ROOT, manifest.file)} (${manifest.board} board image(s))`);
  if (failed.length) process.exitCode = 1;
}

main();
