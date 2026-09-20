// The describer. Under the printed-text regime (CLAUDE.md decision 1) this is NOT what the
// card face shows — it is the AUDITOR. tools/audit-card-text.mjs generates prose from the
// ability data and diffs it against the printed text by id, which is how a clause that was
// silently dropped for want of a primitive becomes visible. It is also the harness's
// fallback, because tests.html never loads data/printed.js.
//
// Every describer below names its engine counterpart in a comment. If you add an op to
// js/abilities.js you add a describer here, and validation fails without one.
(function (RB) {
  'use strict';

  const D = Object.create(null);
  RB.describers = D;
  RB.defineDescriber = function (op, fn) { D[op] = fn; };

  const n = e => (e.n == null ? 1 : e.n);
  const who = e => (e.opponent ? 'your opponent' : 'you');

  RB.defineDescriber('draw', e => (e.opponent ? 'Your opponent draws ' : 'Draw ') + n(e) + '.');            // ops.draw
  RB.defineDescriber('damage', e => 'Deal ' + n(e) + ' damage to ' + sel(e.target) + '.');                  // ops.damage
  RB.defineDescriber('kill', e => 'Kill ' + sel(e.target) + '.');                                           // ops.kill
  RB.defineDescriber('buff', e => sel(e.target, true) + ' gets +' + n(e) + ' Might.');                      // ops.buff
  RB.defineDescriber('grant', e => sel(e.target, true) + ' gains ' + e.keyword + '.');                      // ops.grant
  RB.defineDescriber('ready', e => 'Ready ' + (e.what === 'runes' ? n(e) + ' runes' : sel(e.target)) + '.');// ops.ready
  RB.defineDescriber('exhaust', e => 'Exhaust ' + sel(e.target) + '.');                                     // ops.exhaust
  RB.defineDescriber('channel', e => 'Channel ' + n(e) + ' rune' + (n(e) === 1 ? '' : 's') +
    (e.exhausted ? ' exhausted' : '') + '.');                                                               // ops.channel
  RB.defineDescriber('addEnergy', e => 'Add ' + n(e) + ' Energy.');                                         // ops.addEnergy
  RB.defineDescriber('addPower', e => 'Add ' + n(e) + ' ' + e.domain + ' Power.');                          // ops.addPower
  RB.defineDescriber('gainPoint', e => 'Gain ' + n(e) + ' point' + (n(e) === 1 ? '' : 's') + '.');           // ops.gainPoint
  RB.defineDescriber('discard', e => (e.opponent ? 'Your opponent discards ' : 'Discard ') + n(e) + '.');   // ops.discard
  RB.defineDescriber('recycleRune', e => 'Recycle ' + n(e) + ' rune' + (n(e) === 1 ? '' : 's') + '.');       // ops.recycleRune
  RB.defineDescriber('heal', e => 'Heal ' + sel(e.target) + '.');                                           // ops.heal
  RB.defineDescriber('token', e => 'Play a ' + (e.might != null ? e.might + ' Might ' : '') + 'token' +
    (e.to === 'here' ? ' there' : ' to your base') + (e.temporary ? ', Temporary' : '') + '.');              // ops.token
  RB.defineDescriber('nothing', () => '');                                                                  // ops.nothing

  function sel(s, subject) {
    if (!s || s === 'self') return subject ? 'It' : 'me';
    if (typeof s === 'object' && s.pick) return 'a chosen ' + sel(s.pick).replace(/^(your|enemy) /, '$1 ');
    return ({
      eventUnit: 'that unit', myUnits: 'your units', enemyUnits: 'enemy units',
      allUnits: 'any unit', hereMine: 'your units there', hereEnemy: 'enemy units there',
    })[s] || String(s);
  }

  const TRIGGER_WORDS = {
    played: 'When I am played', conquer: 'When you conquer', hold: 'When you hold',
    beginningPhase: 'At the start of your turn', endOfTurn: 'At the end of your turn',
    combatEnd: 'When a combat ends', unitPlayed: 'When you play a unit',
  };

  RB.cardText = function (id) {
    const c = RB.card(id);
    const ab = c.abilities;
    if (!ab) return '';
    const out = [];
    for (const k of ab.keywords || []) out.push(typeof k === 'string' ? k : k.name + (k.value ? ' ' + k.value : ''));
    for (const t of ab.triggers || [])
      out.push((TRIGGER_WORDS[t.on] || t.on) + ', ' + lower(t.effects.map(line).join(' ')));
    for (const a of ab.activated || [])
      out.push(cost(a) + ': ' + a.effects.map(line).join(' '));
    for (const s of ab.statics || [])
      out.push(s.might ? 'Units here have ' + (s.might > 0 ? '+' : '') + s.might + ' Might.'
        : s.grant ? 'Units here have ' + s.grant + '.' : '');
    if (ab.effects) out.push(ab.effects.map(line).join(' '));
    return out.filter(Boolean).join('\n');
  };
  function line(e) {
    const d = D[e.op];
    if (!d) throw new Error('no describer for op: ' + e.op);
    return d(e);
  }
  function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function cost(a) {
    const bits = [];
    if (a.energy) bits.push(a.energy + ' Energy');
    if (a.power) bits.push(a.power + ' Power');
    if (a.exhaustSelf) bits.push('Exhaust me');
    return bits.join(', ') || 'Free';
  }
})(window.RB = window.RB || {});
