#!/usr/bin/env node
// Headless runner. Loads the engine files index.html declares (minus the UI-only tail)
// into one sandbox, then every tests/*.js. --quiet prints two lines; --filter picks
// suites; --full enables the slow ones (fuzz, deck matrix).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = n => { const i = argv.indexOf('--' + n); return i < 0 ? null : argv[i + 1]; };

export function engineFiles() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const all = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const uiOnly = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/ui-only.json'), 'utf8')));
  return { all, engine: all.filter(f => !uiOnly.has(f)), uiOnly: [...uiOnly] };
}

export function loadEngine() {
  const { engine } = engineFiles();
  const sandbox = { console, Math, Date, JSON, performance, structuredClone };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of engine) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    try { vm.runInContext(src, sandbox, { filename: f }); }
    catch (e) { throw new Error(`loading ${f}: ${e.stack}`); }
  }
  return sandbox.RB;
}

const suites = [];
export function suite(name, fn) { suites.push({ name, fn }); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const RB = loadEngine();
  const T = { pass: 0, fail: 0, failures: [], current: '' };
  const api = {
    RB, full: flag('full'),
    test(name, fn) {
      try { fn(); T.pass++; }
      catch (e) { T.fail++; T.failures.push(`${T.current} › ${name}\n    ${e.message.split('\n')[0]}`); }
    },
    eq(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b);
      if (A !== B) throw new Error(`${msg || ''} expected ${B}, got ${A}`); },
    ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); },
    throws(fn, msg) { let t = false; try { fn(); } catch { t = true; } if (!t) throw new Error(msg || 'expected a throw'); },
  };
  const dir = path.join(ROOT, 'tests');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort() : [];
  const filter = opt('filter');
  for (const f of files) {
    if (filter && !f.includes(filter)) continue;
    const mod = await import(path.join(dir, f));
    T.current = f.replace(/^test-|\.js$/g, '');
    await mod.run(api);
  }
  for (const f of T.failures) console.log('FAIL ' + f);
  console.log(`${T.pass} passed, ${T.fail} failed, ${files.length} suites`);
  process.exit(T.fail ? 1 : 0);
}
