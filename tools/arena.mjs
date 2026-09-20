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
// A weight chosen on one set of shuffles and reported on the same set is a weight fitted to
// those shuffles. --seedbase moves the whole set, so a value picked on the tuning seeds can
// be confirmed on shuffles it has never seen.
const SEEDBASE = opt('seedbase', 'arena');
const verbose = argv.includes('--verbose');

const RB = loadEngine();
RB.registerCards();
const decks = RB.deckData.map(d => d.id);

// Weight overrides, so a tuning pass is a command line and not an edit to js/ai.js:
//   --set held=3 --set unitOnBf=1.9        applied to side A
//   --setb endTurnBar=9                    applied to side B
// Every name must already exist in the tier's table — a typo silently doing nothing is
// how a sweep spends an hour measuring the baseline against itself.
function applySets(flag, tier) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== flag) continue;
    const [k, v] = String(argv[i + 1]).split('=');
    if (!(k in RB.WEIGHTS[tier])) throw new Error(`no such weight "${k}" in ${tier}`);
    RB.WEIGHTS[tier][k] = Number(v);
    if (!Number.isFinite(RB.WEIGHTS[tier][k])) throw new Error(`weight ${k} is not a number: ${v}`);
  }
}
// A tier may appear on both sides, so B is cloned off its table first and A mutates the
// original — otherwise --set and --setb would fight over one object.
if (A === B) RB.WEIGHTS[B + ':b'] = Object.assign({}, RB.WEIGHTS[B]);
applySets('--set', A);
applySets('--setb', A === B ? B + ':b' : B);
const Bkey = A === B ? B + ':b' : B;
const label = t => (t === Bkey && A === B ? B + "'" : t);

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

const tally = { [A]: 0, [Bkey]: 0, draws: 0, broken: [] };
// The matched pair is the unit of evidence, not the game. A shuffle where A won from BOTH
// seats is a shuffle A genuinely handled better; one where each side won its own seat says
// only that going first mattered, which is exactly the noise the pairing exists to remove.
// Counting those splits as evidence is what buries a small effect under first-player bias.
const pairs = { A: 0, B: 0, split: 0 };
let plies = 0;
const t0 = Date.now();

for (let g = 0; g < GAMES; g++) {
  const d0 = decks[g % decks.length], d1 = decks[(g * 7 + 3) % decks.length];
  // Same seed and decks, both seatings — the pair cancels first-player and deck bias.
  const won = [];
  for (const flip of [false, true]) {
    const seats = flip ? [Bkey, A] : [A, Bkey];
    // The SAME seed in both orientations, deliberately. The pair is then one shuffle
    // played twice with the seats swapped, which is a matched design: the deck order and
    // every draw are identical, so the only difference between the two games is which
    // tier sat where. Giving each orientation its own seed turns the pair into two
    // independent games and throws the variance reduction away — with that bug, two
    // IDENTICAL tiers scored 60/40 over 20 pairings instead of the exact 50/50 that a
    // matched design guarantees. That equality is the instrument's self-test.
    const r = play(SEEDBASE + g, d0, d1, seats);
    plies += r.n;
    if (r.winner === null) { tally.draws++; if (r.reason !== 'no termination') tally.broken.push(r.reason); continue; }
    tally[seats[r.winner]]++;
    won.push(seats[r.winner] === A);
    if (verbose) console.log(`g${g}${flip ? 'f' : ''} ${seats[r.winner]} won in ${r.n} plies ${JSON.stringify(r.points)}`);
  }
  if (won.length === 2) pairs[won[0] && won[1] ? 'A' : (!won[0] && !won[1]) ? 'B' : 'split']++;
}

const played = tally[A] + tally[Bkey];
const rate = played ? tally[A] / played : 0;
// Two-sigma on a binomial proportion: the band inside which the true rate probably sits.
const margin = played ? 2 * Math.sqrt(rate * (1 - rate) / played) : 0;
const secs = (Date.now() - t0) / 1000;

const sets = argv.filter((x, i) => argv[i - 1] === '--set').join(' ');
console.log(`${A}${sets ? '[' + sets + ']' : ''} vs ${label(Bkey)} — ${GAMES} pairings, ${played} decisive`);
console.log(`  ${A}: ${tally[A]}   ${label(Bkey)}: ${tally[Bkey]}   unfinished: ${tally.draws}`);
console.log(`  ${A} win rate ${(rate * 100).toFixed(1)}% ±${(margin * 100).toFixed(1)}`);
// Sign test over the decisive pairs: how surprised should we be by this split if the two
// tiers were really the same? Two sigma on the pair proportion is the band that matters.
const dec = pairs.A + pairs.B;
const pRate = dec ? pairs.A / dec : 0.5;
const pMargin = dec ? 2 * Math.sqrt(0.25 / dec) : 0;
console.log(`  shuffles won from BOTH seats — ${A}: ${pairs.A}   ${label(Bkey)}: ${pairs.B}   split: ${pairs.split}`);
console.log(`  paired signal ${(pRate * 100).toFixed(0)}% of ${dec} decisive shuffles` +
  (dec ? `  (a real difference needs |${(pRate * 100).toFixed(0)} - 50| > ${(pMargin * 100).toFixed(0)})` : ''));
console.log(`  ${secs.toFixed(1)}s, ${plies} plies, ${(plies / secs).toFixed(0)} plies/s`);
if (tally.broken.length) console.log(`  BROKEN: ${[...new Set(tally.broken)].slice(0, 3).join(' | ')}`);
