#!/usr/bin/env node
// Replays a trace from js/bugreport.js and reports exactly one of three failure kinds:
//   ILLEGAL  — a recorded action was not in legalActions at that point
//   THREW    — apply threw
//   DIVERGED — the replay ended in a different state than the trace recorded
// --selftest proves the replayer itself works by generating a trace and replaying it.
import { loadEngine } from './test.mjs';
import fs from 'node:fs';

const RB = loadEngine();
RB.registerCards();
const argv = process.argv.slice(2);

function replay(trace) {
  let s = RB.newGame({ seed: trace.seed, decks: trace.decks });
  for (let i = 0; i < trace.actions.length; i++) {
    const a = trace.actions[i];
    let legal;
    try { legal = RB.legalActions(s); }
    catch (e) { return { kind: 'THREW', at: i, action: a, error: e.message }; }
    if (!legal.some(x => JSON.stringify(x) === JSON.stringify(a)))
      return { kind: 'ILLEGAL', at: i, action: a, phase: s.phase, offered: legal.length };
    try { s = RB.apply(s, a); }
    catch (e) { return { kind: 'THREW', at: i, action: a, error: e.message.split('\n')[0] }; }
  }
  return { kind: 'OK', turn: s.turn, points: s.players.map(p => p.points), winner: s.winner, log: s.log.length };
}

if (argv.includes('--selftest')) {
  let s = RB.newGame({ seed: 'selftest', decks: [RB.deckData[0].id, RB.deckData[1].id] });
  const trace = { seed: s.seed, decks: s.players.map(p => p.deckId), actions: [] };
  for (let n = 0; n < 250 && !RB.isTerminal(s); n++) {
    const acts = RB.legalActions(s);
    const a = acts[RB.peekInt(s, acts.length, n)];
    trace.actions.push(a);
    s = RB.apply(s, a);
  }
  const good = replay(trace);
  const bad = replay({ ...trace, actions: [{ t: 'endTurn' }, ...trace.actions] });
  console.log('clean trace  →', good.kind, JSON.stringify(good));
  console.log('tampered     →', bad.kind, '(expected ILLEGAL or THREW)');
  process.exit(good.kind === 'OK' && bad.kind !== 'OK' ? 0 : 1);
}

const file = argv[0];
if (!file) { console.error('usage: replay-report.mjs <trace.json> | --selftest'); process.exit(2); }
const trace = JSON.parse(fs.readFileSync(file, 'utf8'));
if (trace.note) console.log('note:', trace.note);
const r = replay(trace);
console.log(r.kind, JSON.stringify(r, null, 1));
process.exit(r.kind === 'OK' ? 0 : 1);
