// Shared image-generation plumbing for BreachForge's art tools.
//
// Everything here is generator-agnostic: it knows how to ask the Hugging Face router for an image,
// how to strip the signature the model sometimes leaves in the bottom strip, and how to land the
// result on disk as WebP. It knows nothing about cards, prompts or ids — so tools/gen-art.mjs and
// any future board-art generator can share it without one dragging the other's concerns along.
//
// Zero dependencies: Node's built-in fetch plus two system CLIs, `sips` (crop) and `cwebp`
// (encode), both of which ship with / are installed alongside macOS.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';

export const DEFAULTS = {
  endpoint: 'https://router.huggingface.co/nscale/v1/images/generations',
  model: 'black-forest-labs/FLUX.1-schnell',
  width: 512,
  height: 704,
  // The model signs its work in the bottom strip some of the time. Cropping ~4% off the bottom
  // removes it without meaningfully changing the composition.
  cropFraction: 0.04,
  webpQuality: 90,
  maxAttempts: 5,
  baseDelayMs: 2000
};

export function sizeString(width = DEFAULTS.width, height = DEFAULTS.height) {
  return `${width}x${height}`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args.join(' ')} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

/** Verify the external CLIs exist before spending money on a generation run. */
export async function checkTools() {
  const missing = [];
  for (const [cmd, args] of [['sips', ['--version']], ['cwebp', ['-version']]]) {
    try {
      await run(cmd, args);
    } catch (_e) {
      missing.push(cmd);
    }
  }
  return missing;
}

/**
 * Resolve a Hugging Face token: explicit argument, then HF_TOKEN, then the gitignored token files
 * at the repo root. hf_token.md may be a bare token or markdown with the token on some line.
 */
export function resolveToken(root, cliToken) {
  if (cliToken) return cliToken;
  if (process.env.HF_TOKEN) return process.env.HF_TOKEN.trim();
  for (const name of ['.hf_token', 'hf_token.md']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    const match = raw.match(/hf_[A-Za-z0-9]{20,}/);
    if (match) return match[0];
    const trimmed = raw.trim();
    if (trimmed && !trimmed.includes('\n')) return trimmed;
  }
  return null;
}

/**
 * requestImage(prompt, token, opts) -> Buffer (PNG bytes).
 * Retries 429 and 5xx with exponential backoff. Any other non-2xx fails immediately — a 400 or a
 * 401 will not fix itself on retry, and a revoked token should fail loudly on the first card
 * rather than after five slow rounds per id.
 */
export async function requestImage(prompt, token, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  let delay = o.baseDelayMs;
  for (let attempt = 1; attempt <= o.maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(o.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: o.model, prompt, size: sizeString(o.width, o.height) })
      });
    } catch (networkErr) {
      if (attempt === o.maxAttempts) throw new Error(`network error: ${networkErr.message}`);
      await sleep(delay); delay *= 2; continue;
    }
    if (res.ok) {
      const json = await res.json();
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) throw new Error('response had no data[0].b64_json');
      return Buffer.from(b64, 'base64');
    }
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} — the token was rejected (revoked or wrong scope): ${body.slice(0, 200)}`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < o.maxAttempts) {
      await sleep(delay); delay *= 2; continue;
    }
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  throw new Error('exhausted retries');
}

/**
 * pngToWebp(pngBuffer, outPath, opts): crop the bottom strip off, encode to WebP, write outPath.
 * Temp files live in the OS temp dir and are cleaned up even when a step throws.
 */
export async function pngToWebp(pngBuffer, outPath, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const cropH = Math.round(o.height * (1 - o.cropFraction));
  const base = path.join(
    os.tmpdir(),
    `bf-art-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const rawPng = `${base}-raw.png`;
  const croppedPng = `${base}-cropped.png`;
  fs.writeFileSync(rawPng, pngBuffer);
  try {
    await run('sips', ['--cropOffset', '0', '0', '-c', String(cropH), String(o.width), rawPng, '--out', croppedPng]);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await run('cwebp', ['-quiet', '-q', String(o.webpQuality), croppedPng, '-o', outPath]);
  } finally {
    for (const f of [rawPng, croppedPng]) {
      try { fs.unlinkSync(f); } catch (_e) { /* best effort */ }
    }
  }
  return outPath;
}

/** requestImage + pngToWebp in one call. Returns { outPath, bytes }. */
export async function generateToWebp(prompt, token, outPath, opts = {}) {
  const png = await requestImage(prompt, token, opts);
  await pngToWebp(png, outPath, opts);
  return { outPath, bytes: fs.statSync(outPath).size };
}

/** Copy an existing file into an archive dir under a timestamped name, before overwriting it. */
export function archiveExisting(id, filePath, archiveDir, ext = '.webp') {
  fs.mkdirSync(archiveDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(archiveDir, `${id}-${stamp}${ext}`);
  fs.copyFileSync(filePath, dest);
  return dest;
}

/** asyncPool(limit, items, worker): run worker(item, i) with at most `limit` in flight. */
export async function asyncPool(limit, items, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  const workers = [];
  for (let w = 0; w < Math.max(1, limit); w++) workers.push(runOne());
  await Promise.all(workers);
  return results;
}
