#!/usr/bin/env node
// The instrument for every AI change. Plays two difficulties head to head over a matched
// set of games and prints a win rate with a margin, so "this made it better" is a number
// rather than an impression.
//
// Seats and decks are BOTH swapped across the set: going first is worth real points, and
// the ten decks are not equally strong, so a single-orientation set measures the matchup
// and not the AI. Every pairing is played twice, once in each seat.
//
// Usage:
//   node tools/arena.mjs competition hard --games 60
//   node tools/arena.mjs hard random --games 40 --decks 3
import { loadEngine } from './test.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const A = argv[0] || 'competition';
const B = argv[1] || 'hard';
const GAMES = +opt('games', 40);
const CAP = +opt('cap', 4000);
const verbose = argv.includes('--verbose');

const RB = loadEngine();
RB.registerCards();
const decks = RB.deckData.map(d => d.id);

// One game. `seats[0]` is the difficulty playing seat 0.
function play(seed, deckA, deckB, seats) {
  let s = RB.newGame({ seed: seed, decks: [deckA, deckB] });
  let n = 0;
  while (!RB.isTerminal(s) && n < CAP) {
    const who = RB.whoActs(s);
    const acts = RB.legalActions(s);
    if (!acts.length) return { winner: null, reason: 'dead state', n: n };
    let a;
    try { a = RB.aiChoose(s, seats[who]); }
    catch (e) { return { winner: null, reason: 'throw: ' + e.message.split('\n')[0], n: n }; }
    s = RB.apply(s, a);
    n++;
  }
  if (!RB.isTerminal(s)) return { winner: null, reason: 'no termination', n: n };
  return { winner: s.winner, n: n, points: [s.players[0].points, s.players[1].points] };
}

const tally = { [A]: 0, [B]: 0, draws: 0, broken: [] };
let plies = 0;
const t0 = Date.now();

for (let g = 0; g < GAMES; g++) {
  const d0 = decks[g % decks.length], d1 = decks[(g * 7 + 3) % decks.length];
  // Same seed and decks, both seatings — the pair cancels first-player and deck bias.
  for (const flip of [false, true]) {
    const seats = flip ? [B, A] : [A, B];
    const r = play('arena' + g + (flip ? 'f' : ''), d0, d1, seats);
    plies += r.n;
    if (r.winner === null) { tally.draws++; if (r.reason !== 'no termination') tally.broken.push(r.reason); continue; }
    tally[seats[r.winner]]++;
    if (verbose) console.log(`g${g}${flip ? 'f' : ''} ${seats[r.winner]} won in ${r.n} plies ${JSON.stringify(r.points)}`);
  }
}

const played = tally[A] + tally[B];
const rate = played ? tally[A] / played : 0;
// Two-sigma on a binomial proportion: the band inside which the true rate probably sits.
const margin = played ? 2 * Math.sqrt(rate * (1 - rate) / played) : 0;
const secs = (Date.now() - t0) / 1000;

console.log(`${A} vs ${B} — ${GAMES} pairings, ${played} decisive`);
console.log(`  ${A}: ${tally[A]}   ${B}: ${tally[B]}   unfinished: ${tally.draws}`);
console.log(`  ${A} win rate ${(rate * 100).toFixed(1)}% ±${(margin * 100).toFixed(1)}`);
console.log(`  ${secs.toFixed(1)}s, ${plies} plies, ${(plies / secs).toFixed(0)} plies/s`);
if (tally.broken.length) console.log(`  BROKEN: ${[...new Set(tally.broken)].slice(0, 3).join(' | ')}`);
