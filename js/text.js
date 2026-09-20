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
  RB.defineDescriber('buff', e => sel(e.target, true) + ' gets +' + n(e) + ' Might' +
    (e.permanent ? '' : ' this turn') + '.');                      // ops.buff
  RB.defineDescriber('grant', e => sel(e.target, true) + ' gains ' + e.keyword + '.');                      // ops.grant
  RB.defineDescriber('ready', e => 'Ready ' + (e.what === 'runes' ? n(e) + ' runes' : sel(e.target)) + '.');// ops.ready
  RB.defineDescriber('exhaust', e => 'Exhaust ' + sel(e.target) + '.');                                     // ops.exhaust
  RB.defineDescriber('channel', e => 'Channel ' + n(e) + ' rune' + (n(e) === 1 ? '' : 's') +
    (e.exhausted ? ' exhausted' : '') + '.');                                                               // ops.channel
  RB.defineDescriber('addEnergy', e => 'Add ' + n(e) + ' Energy.');                                         // ops.addEnergy
  RB.defineDescriber('addPower', e => 'Add ' + n(e) + ' ' +
    (e.domain === 'any' ? 'Power of any domain' : e.domain + ' Power') + '.');                          // ops.addPower
  RB.defineDescriber('gainPoint', e => 'Gain ' + n(e) + ' point' + (n(e) === 1 ? '' : 's') + '.');           // ops.gainPoint
  RB.defineDescriber('discard', e => (e.opponent ? 'Your opponent discards ' : 'Discard ') + n(e) + '.');   // ops.discard
  RB.defineDescriber('recycleRune', e => 'Recycle ' + n(e) + ' rune' + (n(e) === 1 ? '' : 's') + '.');       // ops.recycleRune
  RB.defineDescriber('heal', e => 'Heal ' + sel(e.target) + '.');                                           // ops.heal
  RB.defineDescriber('token', e => 'Play a ' + (e.might != null ? e.might + ' Might ' : '') + 'token' +
    (e.to === 'here' ? ' there' : ' to your base') + (e.temporary ? ', Temporary' : '') + '.');              // ops.token
  RB.defineDescriber('nothing', () => '');                                                                  // ops.nothing
  RB.defineDescriber('may', e => 'You may ' + lower(e.effects.map(line).join(' ')));                        // ops.may
  RB.defineDescriber('choose', e => 'Choose one — ' +
    e.options.map(o => o.label).join('; ') + '.');                                                          // ops.choose
  RB.defineDescriber('stun', e => 'Stun ' + sel(e.target) +
    '. (It contributes no Might in combat this turn.)');                                           // ops.stun
  RB.defineDescriber('counter', () => 'Counter it.');                                                       // ops.counter
  RB.defineDescriber('xp', e => 'Gain ' + n(e) + ' XP.');                                                   // ops.xp
  RB.defineDescriber('counters', e => 'Put ' + n(e) + ' counter' + (n(e) === 1 ? '' : 's') +
    ' on ' + sel(e.target) + '.');                                                                          // ops.counters
  RB.defineDescriber('playFromZone', e => 'Play a ' + (e.type ? e.type.toLowerCase() : 'card') +
    ' from your ' + (e.zone || 'trash') +
    (e.ignoreCost ? ', ignoring its cost' : e.ignoreEnergy ? ', ignoring its Energy cost' : '') + '.');     // ops.playFromZone
  RB.defineDescriber('swapMight', e => 'Swap the Might of ' + sel(e.target) + '.');                        // ops.swapMight
  RB.defineDescriber('addBattlefield', () => 'Add a battlefield to the game.');                             // ops.addBattlefield
  RB.defineDescriber('addShowdownEnergy', e => 'Add ' + n(e) +
    ' Energy, spendable only during showdowns.');                                                           // ops.addShowdownEnergy
  RB.defineDescriber('ransom', e => 'Counter it unless its controller pays ' +
    (e.energy || 0) + ' Energy' + (e.power ? ' and ' + e.power + ' Power' : '') + '.');                     // ops.ransom
  RB.defineDescriber('payCost', e => 'Pay ' + (e.energy || 0) + ' Energy' +
    (e.power ? ' and ' + e.power + ' Power' : '') + '.');                                                   // ops.payCost
  RB.defineDescriber('counterIf', e => 'Counter it' +
    (e.chose === 'onlyMineOne' ? ' if it chose exactly one unit you control, and no other' : '') +
    (e.maxEnergy != null ? ' if its Energy cost is ' + e.maxEnergy + ' or less' : '') + '.' +
    (e.then ? ' ' + e.then.map(line).join(' ') : ''));                                                      // ops.counterIf
  RB.defineDescriber('buffByCounteredCost', e => sel(e.target, true) +
    " gets +Might equal to that card's Energy cost.");                                                      // ops.buffByCounteredCost
  RB.defineDescriber('delayed', e => 'Later, ' + trigger(e.on) + ', ' +
    lower(e.effects.map(line).join(' ')));                                                                  // ops.delayed
  function trigger(on) { return (TRIGGER_WORDS[on] || on).replace(/^When /, 'when ').replace(/^At /, 'at '); }

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
    died: 'When a unit dies', deathknell: 'Deathknell', moved: 'When a unit moves',
    cardPlayed: 'When a card is played', spellPlayed: 'When a spell is played',
    drew: 'When you draw', showdownBegins: 'When a showdown begins here',
    attack: 'When you attack here', defend: 'When you defend here',
    becameMighty: 'When a unit becomes Mighty', becameReady: 'When a unit becomes ready',
    chosen: 'When a unit is chosen', leftBoard: 'When a card leaves the board',
    beginningPhase: 'At the start of your turn', endOfTurn: 'At the end of your turn',
    combatEnd: 'When a combat ends', unitPlayed: 'When you play a unit',
  };

  RB.cardText = function (id) {
    const c = RB.card(id);
    const ab = c.abilities;
    if (!ab) return '';
    const out = [];
    for (const x of ab.additionalCosts || [])
      out.push((x.optional === false ? 'As an additional cost, ' : 'You may pay ') +
        extraCost(x) + (x.optional === false ? '' : ' as an additional cost') +
        (x.entersReady ? '; if you do, I enter ready' : '') +
        (x.waivesBaseCost ? '; if you do, ignore my cost' : '') + '.');
    for (const w of ab.playAlso || []) out.push(PLAY_WHERE_TEXT[w] || ('I may be played ' + w) + '.');
    for (const k of ab.keywords || []) out.push(typeof k === 'string' ? k : k.name + (k.value ? ' ' + k.value : ''));
    for (const t of ab.triggers || [])
      out.push((TRIGGER_WORDS[t.on] || t.on) + ', ' + lower(t.effects.map(line).join(' ')));
    for (const a of ab.activated || [])
      out.push(cost(a) + ': ' + a.effects.map(line).join(' '));
    for (const st of ab.statics || []) out.push(staticText(st));
    if (ab.effects) out.push(ab.effects.map(line).join(' '));
    return out.filter(Boolean).join('\n');
  };
  function line(e) {
    const d = D[e.op];
    if (!d) throw new Error('no describer for op: ' + e.op);
    return d(e);
  }
  // A static's SCOPE and CONDITION are the whole meaning of several cards — "your other
  // units here", "while defending alone", "at 6+ XP". A describer that prints every static
  // as "Units here have …" blunts the audit exactly where the continuous layer is doing
  // the most work, so it reads both.
  const SCOPE = {
    here: 'Units here', hereMine: 'Your units here', mine: 'Your units',
    all: 'All units', self: 'I',
  };
  const WHEN = {
    defendingAlone: 'while defending alone',
    xpAtLeast: 'while you have enough XP',
  };
  function staticText(st) {
    let who = SCOPE[st.scope || 'here'] || 'Units here';
    if (st.tag) who = who.replace(/Units?$/i, st.tag + 's');
    if (!st.includeSelf && (st.scope || 'here') !== 'self' && /^Your units/.test(who))
      who = who.replace('Your units', 'Your other units');
    const verb = who === 'I' ? 'have ' : 'have ';
    const what = st.might != null
      ? (st.might > 0 ? '+' : '') + st.might + ' Might'
      : st.grant ? st.grant : null;
    if (!what) return '';
    const cond = st.when ? ' ' + (WHEN[st.when.kind || st.when] ||
      ('while ' + (st.when.kind || st.when))) : '';
    return who + ' ' + verb + what + cond + '.';
  }
  RB.staticText = staticText;

  function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  const PLAY_WHERE_TEXT = {
    whereIHaveUnits: 'I can be played to a battlefield where you have units.',
    whereEnemyUnits: 'I can be played to a battlefield where there are enemy units.',
    whereIAmAttacking: "I can be played to a battlefield you're attacking.",
    whereIControl: 'I can be played to a battlefield you control.',
  };
  function extraCost(x) {
    const bits = [];
    if (x.energy) bits.push(x.energy + ' Energy');
    if (x.power) bits.push(x.power + ' Power');
    if (x.pays === 'killFriendly') bits.push('kill a friendly ' + (x.mighty ? 'Mighty ' : '') + 'unit');
    if (x.pays === 'discard') bits.push('discard ' + (x.n || 1));
    if (x.pays === 'spendBuff') bits.push('spend ' + (x.n || 1) + ' buff');
    if (x.pays === 'recycleFromTrash') bits.push('recycle ' + (x.n || 1) + ' from your trash');
    return bits.join(' and ') || 'nothing';
  }

  function cost(a) {
    const bits = [];
    if (a.energy) bits.push(a.energy + ' Energy');
    if (a.power) bits.push(a.power + ' Power');
    if (a.exhaustSelf) bits.push('Exhaust me');
    if (a.killSelf) bits.push('Kill me');
    return bits.join(', ') || 'Free';
  }
})(window.RB = window.RB || {});
