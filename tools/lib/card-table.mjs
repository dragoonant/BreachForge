// The registered card table, as the running game sees it — for tools that must not miss a card.
//
// `data/cards.js` is the generated pack list and `data/tokens.js` is the token list, but neither is
// the whole table. A card pack may register a token of its own at load time: Origins adds
// `tok-recruit` from `js/ops-ogn.js`, because that token is not printed in the gallery and
// data/tokens.js is not that pack's file. `RB.defineToken` is the proper door for this; a direct
// `RB.tokenData.push` is the older one and is still in use.
//
// Building an art work list from data/tokens.js alone therefore silently skips a card that appears
// on the board. This module reads every door: the generated pack list, the token list, and any
// token registered from source anywhere under js/ or data/.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/** Run a browser-style `window.RB = ...` script and return the shared context. */
function loadInto(ctx, root, rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return false;
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel });
  return true;
}

/**
 * Pull token definitions out of source without executing it. Finds every
 * `RB.defineToken({...})` and `RB.tokenData.push({...})` call, brace-matches the object literal,
 * and evaluates just that literal. Static, so it works even when the surrounding pack cannot run
 * outside the browser.
 */
function scanTokenRegistrations(src, filename) {
  const out = [];
  const call = /RB\.(?:defineToken|tokenData\.push)\s*\(\s*\{/g;
  let m;
  while ((m = call.exec(src)) !== null) {
    const start = src.indexOf('{', m.index);
    let depth = 0;
    let end = -1;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      } else if (ch === "'" || ch === '"' || ch === '`') {
        // skip over a string so a brace inside it cannot unbalance the scan
        const quote = ch;
        i++;
        while (i < src.length && src[i] !== quote) { if (src[i] === '\\') i++; i++; }
      }
    }
    if (end === -1) continue;
    const literal = src.slice(start, end + 1);
    try {
      const def = vm.runInNewContext('(' + literal + ')');
      if (def && typeof def.id === 'string') out.push({ def, from: filename });
    } catch (_e) {
      /* not a plain literal (a spread, a variable) — skip it rather than guess */
    }
  }
  return out;
}

function sourceFiles(root) {
  const files = [];
  for (const dir of ['js', 'data']) {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      if (f.endsWith('.js')) files.push(path.join(dir, f));
    }
  }
  return files;
}

/**
 * loadCardTable(root) -> { cards, tokens, all, ids, sources }
 *   cards  — data/cards.js, the generated pack list
 *   tokens — data/tokens.js plus every token registered from source
 *   all    — cards.concat(tokens), the table the game registers
 *   sources — { '<token id>': '<file it came from>' } for anything not in data/tokens.js
 */
export function loadCardTable(root) {
  const ctx = vm.createContext({});
  vm.runInContext('var window = globalThis;', ctx);
  loadInto(ctx, root, 'data/cards.js');
  loadInto(ctx, root, 'data/tokens.js');

  const RB = ctx.RB || {};
  const cards = (RB.cardData || []).slice();
  const tokens = (RB.tokenData || []).slice();
  const seen = new Set([...cards, ...tokens].map((c) => c.id));
  const sources = {};

  for (const rel of sourceFiles(root)) {
    if (rel === 'data/tokens.js' || rel === 'data/cards.js') continue;
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    if (!src.includes('defineToken') && !src.includes('tokenData.push')) continue;
    for (const { def } of scanTokenRegistrations(src, rel)) {
      if (seen.has(def.id)) continue;
      seen.add(def.id);
      tokens.push(def);
      sources[def.id] = rel;
    }
  }

  const all = cards.concat(tokens);
  return { cards, tokens, all, ids: all.map((c) => c.id), sources };
}
