// Spiritforged, card by card. Each test reads one printed clause (data/printed.js) literally
// and asks the real engine — legalActions / apply — whether a game plays it. Each names the
// rule, and each was watched failing on the code before its fix.
export function run(t) {
  const RB = t.RB;
  RB.registerCards();
  const decks = RB.deckData.map(d => d.id);

  // A cleared board: no hands, no units, p0 active in its main phase.
  const game = (opts = {}) => {
    let s = RB.newGame({ seed: opts.seed || 'sfd', decks: [decks[0], decks[1]] });
    while (s.queue.length && s.queue[0].kind === 'mulligan') s = RB.apply(s, { t: 'mulligan', toss: [] });
    s.humanSeat = opts.human === undefined ? null : opts.human;
    for (const P of s.players) { P.deck.push(...P.hand, ...P.trash); P.hand = []; P.base = []; P.trash = []; }
    for (const b of s.bf) { b.units = []; b.gear = []; b.hidden = []; b.controller = null; b.contestedBy = null; }
    s.active = 0; s.priority = 0; s.phase = 'main';
    if (opts.bfs) opts.bfs.forEach((id, i) => { if (id) { s.bf[i].cardId = id; RB.obj(s, s.bf[i].iid).cardId = id; } });
    return s;
  };
  const rich = (s, p, n = 20) => { s.players[p].pool.energy = n; s.players[p].pool.any = n; };
  const put = (s, id, p, where = 'base') => {
    const iid = RB.mint(s, id, p);
    if (where === 'hand') s.players[p].hand.push(iid);
    else if (where === 'trash') s.players[p].trash.push(iid);
    else if (where === 'base') s.players[p].base.push(iid);
    else s.bf[where].units.push(iid);
    return iid;
  };
  const plays = (s, iid) => RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid);
  const vanilla = RB.allCards().find(c => c.type === 'Unit' && c.abilities && c.abilities.vanilla && c.might >= 3).id;
  // Play a card and pass until something asks; return the state and the open question.
  const playUntilAsked = (s, a) => {
    s = RB.apply(s, a);
    for (let k = 0; k < 20 && !s.queue.length && s.chain.length; k++) s = RB.apply(s, { t: 'pass' });
    return s;
  };
  const settle = s => {
    for (let k = 0; k < 30 && (s.chain.length || s.queue.length); k++)
      s = s.queue.length ? RB.apply(s, RB.legalActions(s)[0]) : RB.apply(s, { t: 'pass' });
    return s;
  };

  // --- "a unit" is either side's ----------------------------------------------
  t.test('"Give a unit +5" may choose an enemy unit (sfd-097 Punch First)', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    const mine = put(s, vanilla, 0, 'base');
    const theirs = put(s, vanilla, 1, 'base');
    const c = put(s, 'sfd-097', 0, 'hand');
    s = RB.apply(s, plays(s, c)[0]);
    const q = s.queue[0];
    t.ok(q && q.kind === 'target', 'the player is asked');
    t.ok(q.options.includes(mine) && q.options.includes(theirs), 'both sides offered: ' + q.options);
    s = RB.apply(s, { t: 'choose', selection: [theirs] });
    s = settle(s);
    t.eq(RB.obj(s, theirs).buffs, 5, 'the enemy unit got +5');
  });

  t.test('"Give a unit [Assault 2]" may choose an enemy unit (sfd-003 Blood Rush)', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    const mine = put(s, vanilla, 0, 'base');
    const theirs = put(s, vanilla, 1, 'base');
    const c = put(s, 'sfd-003', 0, 'hand');
    s = RB.apply(s, plays(s, c).find(a => !a.pay));
    t.ok(s.queue[0] && s.queue[0].options.includes(theirs) && s.queue[0].options.includes(mine),
      'both sides offered');
  });

  t.test('"a unit +2 and ANOTHER unit -2": either side each, never the same one (sfd-196 Defiant Dance)', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    const a = put(s, vanilla, 0, 'base');
    const b = put(s, vanilla, 0, 'base');
    const e = put(s, vanilla, 1, 'base');
    const c = put(s, 'sfd-196', 0, 'hand');
    s = RB.apply(s, plays(s, c)[0]);
    t.eq(s.queue[0].options.slice().sort(), [a, b, e].sort(), 'the +2 may go to any unit');
    s = RB.apply(s, { t: 'choose', selection: [e] });
    t.eq(s.queue[0].options.slice().sort(), [a, b].sort(), 'the -2 may go to any OTHER unit, a friendly one included');
    s = RB.apply(s, { t: 'choose', selection: [b] });
    s = settle(s);
    t.eq([RB.obj(s, e).buffs, RB.obj(s, b).buffs], [2, -2]);
  });

  t.test('"Deal 3 to a unit at a battlefield" may choose a friendly one, never a base (sfd-070 Wages of Pain)', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    const mine = put(s, vanilla, 0, 0);
    const theirs = put(s, vanilla, 1, 1);
    const inBase = put(s, vanilla, 1, 'base');
    const c = put(s, 'sfd-070', 0, 'hand');
    s = RB.apply(s, plays(s, c)[0]);
    const q = s.queue[0];
    t.ok(q && q.options.includes(mine) && q.options.includes(theirs), 'both battlefield units: ' + (q && q.options));
    t.ok(!q.options.includes(inBase), 'not a unit in a base');
  });

  t.test('"Swap the Might of two units at the same battlefield": two enemy units will do (sfd-145 Switcheroo)', () => {
    let s = game();
    rich(s, 0);
    const big = put(s, vanilla, 1, 0);
    const small = put(s, vanilla, 1, 0);
    RB.obj(s, big).permBuffs = 3;
    const m0 = RB.mightOf(s, big), m1 = RB.mightOf(s, small);
    const c = put(s, 'sfd-145', 0, 'hand');
    t.ok(plays(s, c).length, 'playable with no unit of mine there');
    s = settle(RB.apply(s, plays(s, c)[0]));
    t.eq([RB.mightOf(s, big), RB.mightOf(s, small)], [m1, m0], 'swapped');
  });

  t.test('"up to three units at the same location": the player picks the location, and "up to" may stop at one (sfd-080 Bellows Breath)', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    const b1 = put(s, vanilla, 1, 'base'), b2 = put(s, vanilla, 1, 'base'), b3 = put(s, vanilla, 1, 'base');
    const f1 = put(s, vanilla, 1, 0), f2 = put(s, vanilla, 1, 0);
    const mine = put(s, vanilla, 0, 0);
    const c = put(s, 'sfd-080', 0, 'hand');
    s = playUntilAsked(s, plays(s, c).find(a => !a.pay));
    t.ok(s.queue[0].options.includes(f1) && s.queue[0].options.includes(b1) && s.queue[0].options.includes(mine),
      'the first unit may be anywhere, either side');
    s = RB.apply(s, { t: 'choose', selection: [f1] });
    s = playUntilAsked(s, { t: 'pass' });
    t.eq(s.queue[0] && s.queue[0].kind, 'may', 'a second unit is optional');
    s = RB.apply(s, { t: 'choose', ix: 0 });
    t.eq(s.queue[0].options.slice().sort(), [f2, mine].sort(), 'only units at the same location');
    s = RB.apply(s, { t: 'choose', selection: [f2] });
    t.eq(s.queue[0] && s.queue[0].kind, 'may', 'a third is optional too');
    s = RB.apply(s, { t: 'choose', ix: 1 });
    t.eq([f1, f2, mine, b1, b2, b3].map(i => RB.obj(s, i).damage), [1, 1, 0, 0, 0, 0]);
  });

  // --- "a gear" is either side's ----------------------------------------------
  t.test('"Return a gear to its owner\'s hand" may return your own, even while the enemy has one (sfd-135 Factory Recall)', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    const own = put(s, 'sfd-033', 0, 'base');
    const theirs = put(s, 'sfd-133', 1, 'base');
    const c = put(s, 'sfd-135', 0, 'hand');
    s = RB.apply(s, plays(s, c)[0]);
    t.eq(s.queue[0].options.slice().sort(), [own, theirs].sort());
    s = settle(RB.apply(s, { t: 'choose', selection: [own] }));
    t.ok(s.players[0].hand.includes(own), 'back in my hand');
  });

  t.test('"you may kill a gear" may kill your own (sfd-032 Disarming Rake)', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    const own = put(s, 'sfd-033', 0, 'base');
    const theirs = put(s, 'sfd-133', 1, 'base');
    const c = put(s, 'sfd-032', 0, 'hand');
    s = RB.apply(s, plays(s, c)[0]);
    s = RB.apply(s, { t: 'choose', ix: 0 });
    t.eq(s.queue[0].options.slice().sort(), [own, theirs].sort());
  });

  // --- sfd-128 Overzealous Fan --------------------------------------------------
  t.test('Overzealous Fan MOVES the attacker (its "when I move" fires) and takes only an attacker', () => {
    let s = game();
    const fan = put(s, 'sfd-128', 1, 0);
    s.bf[0].controller = 1;
    const mover = put(s, 'sfd-048', 0, 'base');           // "When I move, draw 1."
    const hand = s.players[0].hand.length;
    s = RB.apply(s, { t: 'move', iids: [mover], to: 'bf0' });
    t.ok(s.players[0].hand.length === hand + 1, 'the move in drew one');
    for (let k = 0; k < 10 && !(s.queue[0] && s.queue[0].kind === 'may' && s.queue[0].who === 1); k++)
      s = RB.apply(s, s.queue.length ? RB.legalActions(s)[0] : { t: 'pass' });
    t.ok(s.queue[0] && s.queue[0].who === 1, 'the Fan asks');
    s = RB.apply(s, { t: 'choose', ix: 0 });
    t.ok(s.players[0].base.includes(mover), 'the attacker is home');
    t.ok(!s.bf[0].units.includes(fan), 'the Fan paid with its life');
    t.eq(s.players[0].hand.length, hand + 2, 'and the move home drew another');

    const s2 = game();
    const u = put(s2, vanilla, 0, 0);                      // at the battlefield, not attacking
    RB.ops['sfd.moveAttacker'](s2, { op: 'sfd.moveAttacker' }, { p: 1, source: 'x' });
    t.ok(s2.bf[0].units.includes(u), 'a unit that is not attacking is not taken');
  });

  // --- sfd-140 Fizz -------------------------------------------------------------
  t.test('Fizz offers only a spell whose Power cost can be paid, and recycles it (sfd-140)', () => {
    let s = game();
    s.players[0].runes = [];
    s.players[0].pool.energy = 10;
    const star = put(s, 'ogn-029', 0, 'trash');            // 2 Power: unpayable here
    const cleave = put(s, 'ogn-004', 0, 'trash');          // no Power
    put(s, vanilla, 0, 'base');
    const fizz = put(s, 'sfd-140', 0, 'hand');
    const fc = RB.card('sfd-140');
    s.players[0].pool.power[fc.domain] = fc.power || 0;  // exactly Fizz's own Power
    s = RB.apply(s, plays(s, fizz)[0]);
    t.eq(s.players[0].pool.power[fc.domain] || 0, 0, 'no Power left over');
    s = settle(RB.apply(s, { t: 'choose', ix: 0 }));
    t.ok(s.players[0].deck.includes(cleave), 'the payable spell was played and recycled');
    t.ok(s.players[0].trash.includes(star), 'the unpayable one is still in the trash');
  });

  // --- sfd-150 Last Rites -------------------------------------------------------
  t.test('Last Rites: "Recycle 2 cards from your trash" is COST — not offered without them, and the player picks', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    const u = put(s, vanilla, 0, 'base');
    const g = put(s, 'sfd-150', 0, 'base');
    const t1 = put(s, vanilla, 0, 'trash');
    const equip = st => RB.legalActions(st).filter(a => a.t === 'activate' && a.iid === g);
    t.eq(equip(s).length, 0, 'one card in the trash: no Equip');
    const t2 = put(s, vanilla, 0, 'trash'), t3 = put(s, vanilla, 0, 'trash');
    t.eq(equip(s).length, 1, 'three: Equip is offered');
    s = playUntilAsked(s, equip(s)[0]);
    s = RB.apply(s, { t: 'choose', selection: [t1, t3] });   // which to recycle — may come first or second
    s = settle(s.queue.length && s.queue[0].options.includes(u) ? RB.apply(s, { t: 'choose', selection: [u] }) : s);
    t.eq(s.players[0].trash, [t2], 'the two chosen went, the other stayed');
    t.eq(RB.obj(s, g).attachedTo, u, 'and it is attached');
  });

  t.test('Weaponmaster pays Last Rites\' recycle too, and cannot take it without two cards in the trash', () => {
    for (const trash of [1, 2]) {
      let s = game();
      rich(s, 0);
      const g = put(s, 'sfd-150', 0, 'base');
      for (let k = 0; k < trash; k++) put(s, vanilla, 0, 'trash');
      const y = put(s, 'sfd-116', 0, 'hand');
      s = RB.apply(s, plays(s, y).find(a => a.to === 'base'));
      s = settle(s);
      if (trash === 1) t.eq(RB.obj(s, g).attachedTo, null, 'one card: not attached');
      else {
        t.eq(RB.obj(s, g).attachedTo, y, 'two cards: attached');
        t.eq(s.players[0].trash.length, 0, 'and both recycled');
      }
    }
  });

  // --- sfd-216 Rockfall Path ------------------------------------------------------
  t.test('"Units can\'t be played here" bars Miss Fortune\'s open-battlefield play too (sfd-216 / ogn-193)', () => {
    const s = game({ bfs: ['sfd-216'] });
    rich(s, 0);
    put(s, 'ogn-193', 0, 'base');
    put(s, vanilla, 1, 0);                 // both battlefields open
    put(s, vanilla, 1, 1);
    const u = put(s, vanilla, 0, 'hand');
    const dests = [...new Set(plays(s, u).map(a => a.to))].sort();
    t.eq(dests, ['base', 'bf1']);
  });

  t.test('"Units can\'t be played here" bars a hidden unit at that battlefield (sfd-216)', () => {
    const s = game({ bfs: ['sfd-216'] });
    put(s, vanilla, 0, 0);
    s.bf[0].controller = 0;
    const m = RB.mint(s, 'unl-003', 0);
    s.bf[0].hidden.push({ iid: m, owner: 0, turnHidden: s.turn - 1 });
    t.eq(RB.legalActions(s).filter(a => a.iid === m).length, 0);
  });

  // --- sfd-146 Vex --------------------------------------------------------------
  t.test('Vex\'s extra [A] on an enemy spell is Power of ANY domain (sfd-146)', () => {
    const s = game();
    put(s, 'sfd-146', 0, 0);
    s.showdown = { bf: 0, combat: true, attacker: 1, defender: 0 };
    const spell = put(s, 'ogn-004', 1, 'hand');           // Fury, no Power of its own
    const cost = RB.totalCost(s, spell, []);
    t.eq(cost.power, 1, 'one more Power');
    t.eq(cost.domains.slice().sort(), RB.DOMAINS.slice().sort(), 'of any domain');
  });

  // --- sfd-101 Fae Dragon ---------------------------------------------------------
  t.test('Fae Dragon\'s "when you spend a buff" can be raised from outside the pack (RB.sfdRaise)', () => {
    const s = game();
    put(s, 'sfd-101', 0, 'base');
    const before = s.players[0].base.length;
    RB.sfdRaise(s, 'buffSpent', { p: 0 });
    t.eq(s.players[0].base.length, before + 1, 'a Gold token');
    RB.sfdRaise(s, 'buffSpent', { p: 1 });
    t.eq(s.players[0].base.length, before + 1, 'not for the opponent\'s spend');
  });
}
