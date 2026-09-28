// DEVIATIONS.md D-13 … D-20, the entries the card-by-card audit of 2026-09-27 left open.
// Each test states the printed rule the deviation broke; each was watched failing with its
// fix reverted (CLAUDE.md rule 10).
export function run(t) {
  const RB = t.RB;
  RB.registerCards();
  const decks = RB.deckData.map(d => d.id);

  const game = (opts = {}) => {
    let s = RB.newGame({ seed: opts.seed || 'deviations', decks: [decks[0], decks[1]] });
    while (s.queue.length && s.queue[0].kind === 'mulligan') s = RB.apply(s, { t: 'mulligan', toss: [] });
    s.humanSeat = opts.human === undefined ? null : opts.human;
    for (const P of s.players) { P.deck.push(...P.hand); P.hand = []; P.base = []; P.trash = []; }
    for (const b of s.bf) { b.units = []; b.controller = null; b.contestedBy = null; }
    s.active = 0; s.priority = 0; s.phase = 'main';
    return s;
  };
  const rich = (s, p, n = 20) => { s.players[p].pool.energy = n; s.players[p].pool.any = n; };
  const put = (s, id, p, where = 'base') => {
    const iid = RB.mint(s, id, p);
    if (where === 'hand') s.players[p].hand.push(iid);
    else if (where === 'trash') s.players[p].trash.push(iid);
    else if (where === 'deck') s.players[p].deck.unshift(iid);
    else if (where === 'base') s.players[p].base.push(iid);
    else s.bf[where].units.push(iid);
    return iid;
  };
  const vanilla = 'tok-mech';                   // a 3 Might unit with no text
  const sized = (s, m, p, where) => {
    const iid = put(s, vanilla, p, where);
    RB.obj(s, iid).permBuffs = m - RB.card(vanilla).might;
    return iid;
  };
  const plays = (s, iid) => RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid);
  const acts = (s, iid) => RB.legalActions(s).filter(a => a.t === 'activate' && a.iid === iid);
  const passAll = s => {
    for (let k = 0; k < 30 && (s.chain.length || s.queue.length); k++)
      s = s.queue.length ? RB.apply(s, RB.legalActions(s)[0]) : RB.apply(s, { t: 'pass' });
    return s;
  };
  const resolve = (s, effects, ctx) => { RB.runAsking(s, effects, ctx, ctx.source); return s; };
  // A spell of the given player sitting on the chain, as if just played.
  const onChain = (s, id, p, owner = p) => {
    const iid = RB.mint(s, id, owner);
    RB.obj(s, iid).controller = p;
    s.chainSeq = (s.chainSeq || 0) + 1;
    s.chain.push({ iid: iid, controller: p, kind: 'card', cardId: id, uid: 'c' + s.chainSeq,
      energy: RB.card(id).energy || 0, targets: [] });
    return iid;
  };
  const aSpell = 'unl-190';                     // Lilting Lullaby: any plain spell will do

  // --- D-20 ------------------------------------------------------------------------
  t.test('D-20 unl-118 Elder Dragon: a fully prevented hit is not "your damage"', () => {
    let s = game();
    put(s, 'unl-118', 0, 'base');
    const foe = sized(s, 4, 1, 0);
    RB.dealDamage(s, foe, 2, { p: 1 }, 'effect');     // hurt by its own side
    s.preventEffectDamage = true;
    RB.dealDamage(s, foe, 1, { p: 0 }, 'effect');     // prevented entirely
    RB.settle(s);
    t.ok(s.bf[0].units.includes(foe), 'the enemy unit is still alive');
  });

  t.test("D-20 unl-131 Abandon: the countered spell goes to its OWNER's hand", () => {
    let s = game();
    const spell = onChain(s, aSpell, 0, 1);           // p0 cast a card p1 owns
    resolve(s, [{ op: 'counterToHand' }], { p: 1, source: null });
    t.ok(s.players[1].hand.includes(spell), "in the owner's hand");
    t.ok(!s.players[0].hand.includes(spell), "not in the caster's");
  });

  t.test("D-20 counter: a countered card goes to its OWNER's trash", () => {
    let s = game();
    const spell = onChain(s, aSpell, 0, 1);
    resolve(s, [{ op: 'counter' }], { p: 1, source: null });
    t.ok(s.players[1].trash.includes(spell), "in the owner's trash");
  });

  // --- D-16 ------------------------------------------------------------------------
  t.test("D-16 a unit bounced by another pack's op loses its ogn Might modifier", () => {
    let s = game();
    const u = sized(s, 3, 0, 0);
    resolve(s, [{ op: 'ogn.mightThisTurn', n: 2, target: 'self' }], { p: 0, source: u });
    t.eq(RB.mightOf(s, u), 5, 'modified on the board');
    resolve(s, [{ op: 'returnToHand', target: 'self' }], { p: 0, source: u });   // an unl op
    t.ok(s.players[0].hand.includes(u), 'back in hand');
    t.eq((RB.obj(s, u).ognMods || []).length, 0, 'the modifier did not ride along');
  });

  t.test('D-16 ogn-186 "when this leaves the board" is heard when an unl op bounces it', () => {
    let s = game();
    const g = put(s, 'ogn-186', 0, 'base');
    const hand = s.players[0].hand.length;
    resolve(s, [{ op: 'returnToHand', target: 'self' }], { p: 0, source: g });
    t.eq(s.players[0].hand.length, hand + 2, 'itself, plus the card it draws');
  });

  // --- D-17 ------------------------------------------------------------------------
  const rune = dom => RB.allCards().find(c => c.type === 'Rune' && c.domain === dom).id;
  t.test("D-17 sfd-146 Vex: the enemy's +[A] on a Calm spell may be paid with a Fury rune", () => {
    let s = game();
    const vex = put(s, 'sfd-146', 1, 0);
    put(s, vanilla, 0, 0);
    s.showdown = { bf: 0, attacker: 0, defender: 1, combat: true };
    s.players[0].runes = [];
    for (const d of ['Calm', 'Fury']) s.players[0].runes.push(RB.mint(s, rune(d), 0));
    s.players[0].pool.energy = 5;
    const defy = put(s, 'ogn-045', 0, 'hand');         // [1] and one Calm
    const cost = RB.totalCost(s, defy, []);
    t.ok(RB.canPay(s, 0, cost), 'Calm pays the Calm, Fury pays the [A]');
    s.players[0].runes = [RB.mint(s, rune('Fury'), 0), RB.mint(s, rune('Fury'), 0)];
    t.ok(!RB.canPay(s, 0, RB.totalCost(s, defy, [])), 'but the Calm itself still needs Calm');
    void vex;
  });

  // --- D-18 ------------------------------------------------------------------------
  t.test('D-18 sfd-140 Fizz: the spell it plays from the trash goes on the chain, and can be answered', () => {
    let s = game();
    rich(s, 0);
    const fizz = put(s, 'sfd-140', 0, 'hand');
    const spell = put(s, 'unl-061', 0, 'trash');          // Downstage Dramatics: draw 1
    s = RB.apply(s, plays(s, fizz).find(a => a.to === 'base'));
    t.eq(s.queue[0] && s.queue[0].kind, 'may', 'Fizz asks "you may"');
    s = RB.apply(s, { t: 'choose', ix: 0 });
    t.ok(s.chain.some(x => x.iid === spell), 'the spell is on the chain');
    t.eq(RB.whoActs(s), 1, 'and the opponent has priority to respond');
    const hand = s.players[0].hand.length;
    s = passAll(s);
    t.eq(s.players[0].hand.length, hand + 1, 'it resolved: drew 1');
    t.eq(s.players[0].deck[s.players[0].deck.length - 1], spell, 'then recycled, not trashed');
  });

  // --- D-13 ------------------------------------------------------------------------
  t.test('D-13 "counter a spell" is not playable with nothing on the chain', () => {
    for (const id of ['ogn-045', 'unl-131', 'unl-190']) {
      let s = game();
      rich(s, 0);
      const c = put(s, id, 0, 'hand');
      s.priority = 0;
      t.eq(plays(s, c).length, 0, id + ' withheld on an empty chain');
      onChain(s, 'unl-061', 1);                        // an enemy spell to answer
      t.ok(plays(s, c).length > 0, id + ' offered once there is a spell to counter');
    }
  });

  t.test('D-13 unl-106 Repulse needs a friendly unit at a battlefield', () => {
    let s = game();
    rich(s, 0);
    const r = put(s, 'unl-106', 0, 'hand');
    const mine = sized(s, 3, 0, 'base');
    const sp = onChain(s, 'unl-061', 1);
    s.chain[0].targets = [mine];
    s.priority = 0;
    t.eq(plays(s, r).length, 0, 'no friendly unit at a battlefield: withheld');
    RB.removeFrom(s.players[0].base, mine); s.bf[0].units.push(mine);
    t.ok(plays(s, r).length > 0, 'offered once one stands at a battlefield');
    void sp;
  });

  t.test('D-13 [Equip] is not offered with no unit to attach to', () => {
    let s = game();
    rich(s, 0);
    const g = put(s, 'sfd-022', 0, 'base');           // [Equip] [C]
    t.eq(acts(s, g).length, 0, 'no unit: nothing to equip');
    sized(s, 3, 0, 'base');
    t.ok(acts(s, g).length > 0, 'a unit to attach to: offered');
  });

  t.test('D-13 unl-044 Flurry of Feathers on an empty chain offers only the Birds', () => {
    let s = game();
    rich(s, 0);
    const f = put(s, 'unl-044', 0, 'hand');
    s = RB.apply(s, plays(s, f)[0]);
    s = RB.apply(s, { t: 'pass' }); s = RB.apply(s, { t: 'pass' });
    t.eq(s.queue[0] && s.queue[0].options, ['Play four 1 Might Bird unit tokens with Deflect'],
      'the counter mode is not offered');
  });

  t.test('D-13 a counter may answer a spell below the top of the chain', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    const lower = onChain(s, 'unl-061', 1);
    const upper = onChain(s, 'unl-061', 1);
    s.priority = 0;
    const defy = put(s, 'ogn-045', 0, 'hand');
    s = RB.apply(s, plays(s, defy)[0]);
    const q = s.queue[0];
    t.ok(q && q.kind === 'target' && q.options.includes(lower) && q.options.includes(upper),
      'asked which spell');
    s = RB.apply(s, { t: 'choose', selection: [lower] });
    s = RB.apply(s, { t: 'pass' }); s = RB.apply(s, { t: 'pass' });   // Defy resolves
    t.ok(!s.chain.some(x => x.iid === lower), 'the lower spell is countered');
    t.ok(s.chain.some(x => x.iid === upper), 'the top one is still there');
  });

  // --- D-14 ------------------------------------------------------------------------
  t.test('D-14 sfd-150 Last Rites: the recycle is paid on activation, cards of the player\'s choosing', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    const g = put(s, 'sfd-150', 0, 'base');
    sized(s, 3, 0, 'base');
    const t1 = put(s, vanilla, 0, 'trash'), t2 = put(s, vanilla, 0, 'trash'), t3 = put(s, vanilla, 0, 'trash');
    s = RB.apply(s, acts(s, g)[0]);
    t.eq(s.queue[0] && s.queue[0].kind, 'target', 'asked which cards to recycle');
    t.eq(s.chain.length, 0, 'the ability is not on the chain before its cost is paid');
    s = RB.apply(s, { t: 'choose', selection: [t1, t3] });
    t.eq(s.players[0].trash, [t2], 'the two chosen are recycled');
    t.ok(s.chain.some(x => x.kind === 'ability' && x.iid === g), 'then the ability is on the chain');
  });

  t.test("D-14 unl-158 Shepherd's Heirloom: Weaponmaster spends the XP too", () => {
    for (const xp of [0, 1]) {
      let s = game();
      rich(s, 0);
      s.players[0].xp = xp;
      const g = put(s, 'unl-158', 0, 'base');
      const y = put(s, 'sfd-116', 0, 'hand');           // Yone, [Weaponmaster]
      s = RB.apply(s, plays(s, y).find(a => a.to === 'base'));
      s = passAll(s);
      if (!xp) t.eq(RB.obj(s, g).attachedTo, null, 'no XP: not attached');
      else {
        t.eq(RB.obj(s, g).attachedTo, y, 'attached');
        t.eq(s.players[0].xp, 0, 'and the XP was spent');
      }
    }
  });

  // --- D-15 ------------------------------------------------------------------------
  t.test('D-15 unl-069 Sprite Burst: the player chooses where "play two tokens" puts them', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    sized(s, 3, 0, 0); s.bf[0].controller = 0;         // a battlefield p0 controls
    const sb = put(s, 'unl-069', 0, 'hand');
    s = RB.apply(s, plays(s, sb)[0]);
    s = RB.apply(s, { t: 'pass' }); s = RB.apply(s, { t: 'pass' });
    const q = s.queue[0];
    t.ok(q && q.kind === 'target' && q.labels, 'asked where, with labelled places');
    t.eq(q.options, ['base', 'bf0'], 'your base or the battlefield you control — not the other one');
    s = RB.apply(s, { t: 'choose', selection: ['bf0'] });
    t.eq(s.bf[0].units.filter(i => RB.obj(s, i).cardId === 'tok-sprite').length, 2, 'both Sprites there');
  });

  t.test('D-15 sfd-154 Guards! played face down puts its Sand Soldier at that battlefield', () => {
    let s = game();
    rich(s, 0);
    sized(s, 3, 0, 1); s.bf[1].controller = 0;
    const g = RB.mint(s, 'sfd-154', 0);
    s.bf[1].hidden.push({ iid: g, owner: 0, turnHidden: s.turn - 1 });
    const a = RB.legalActions(s).find(x => x.t === 'play' && x.iid === g && x.from === 'hidden' && !x.pay);
    s = passAll(RB.apply(s, a));
    t.ok(s.bf[1].units.some(i => RB.obj(s, i).cardId === 'tok-sand-soldier'), 'at the hidden battlefield');
  });

  t.test('D-15 a token played "here" at sfd-216 Rockfall Path is not played', () => {
    let s = game();
    s.bf[0].cardId = 'sfd-216';
    const before = Object.keys(s.objects).length;
    resolve(s, [{ op: 'token', cardId: 'tok-sand-soldier', to: 'here' }], { p: 0, source: null, event: { bf: 0 } });
    t.eq(s.bf[0].units.length, 0, 'nothing arrived');
    t.eq(Object.keys(s.objects).length, before, 'and nothing was minted');
  });
}
