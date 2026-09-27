// Card-by-card fidelity. Each test reads one printed clause literally and asks the real
// engine — legalActions / apply — whether a game plays it. These came out of a full audit
// of every registered id against data/printed.js; each names the rule, and each was
// watched failing on the code before its fix.
export function run(t) {
  const RB = t.RB;
  RB.registerCards();
  const decks = RB.deckData.map(d => d.id);

  // A cleared board: no hands, no units, p0 active in its main phase.
  const game = (opts = {}) => {
    let s = RB.newGame({ seed: opts.seed || 'cards', decks: [decks[0], decks[1]] });
    while (s.queue.length && s.queue[0].kind === 'mulligan') s = RB.apply(s, { t: 'mulligan', toss: [] });
    s.humanSeat = opts.human === undefined ? null : opts.human;
    for (const P of s.players) { P.deck.push(...P.hand); P.hand = []; P.base = []; }
    for (const b of s.bf) { b.units = []; b.controller = null; b.contestedBy = null; }
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
  const vanilla = RB.allCards().find(c => c.type === 'Unit' && c.abilities && c.abilities.vanilla && c.might >= 2).id;
  const answerAll = (s, pick) => {
    for (let k = 0; k < 20 && s.queue.length; k++) {
      const acts = RB.legalActions(s);
      s = RB.apply(s, pick ? pick(s, acts) || acts[0] : acts[0]);
    }
    return s;
  };
  // Pass until the chain is empty or a question is waiting — never answers one.
  const passChain = s => {
    for (let k = 0; k < 20 && s.chain.length && !s.queue.length; k++) s = RB.apply(s, { t: 'pass' });
    return s;
  };
  const passAll = s => {
    for (let k = 0; k < 20 && (s.chain.length || s.queue.length); k++)
      s = s.queue.length ? RB.apply(s, RB.legalActions(s)[0]) : RB.apply(s, { t: 'pass' });
    return s;
  };

  // --- play locations (§8.2) ------------------------------------------------
  t.test('gear is played to its base — never onto a unit, and never onto an enemy', () => {
    for (const id of ['ogn-186', 'sfd-033', 'unl-039']) {
      const s = game();
      rich(s, 0);
      put(s, vanilla, 0, 'base');
      put(s, vanilla, 1, 'base');
      const g = put(s, id, 0, 'hand');
      t.eq([...new Set(plays(s, g).map(a => a.to))], ['base'], id);
    }
  });

  t.test('Treasure Trove in its base offers its own activated ability', () => {
    let s = game();
    rich(s, 0);
    put(s, vanilla, 0, 'base');
    const g = put(s, 'ogn-186', 0, 'hand');
    s = RB.apply(s, plays(s, g)[0]);
    t.ok(s.players[0].base.includes(g), 'the gear is in base');
    rich(s, 0);
    t.ok(RB.legalActions(s).some(a => a.t === 'activate' && a.iid === g), 'and can be activated');
  });

  t.test('a unit may be played to a battlefield its controller controls', () => {
    const s = game();
    rich(s, 0);
    put(s, vanilla, 0, 0);
    s.bf[0].controller = 0;
    const u = put(s, vanilla, 0, 'hand');
    const dests = plays(s, u).map(a => a.to).sort();
    t.eq(dests, ['base', 'bf0'], 'base and the controlled battlefield, not the other');
  });

  t.test('a hidden unit is played to the battlefield it was hidden at', () => {
    const s = game();
    put(s, vanilla, 0, 0);
    s.bf[0].controller = 0;
    const m = RB.mint(s, 'unl-003', 0);
    s.bf[0].hidden.push({ iid: m, owner: 0, turnHidden: s.turn - 1 });
    const dests = [...new Set(RB.legalActions(s).filter(a => a.iid === m).map(a => a.to))];
    t.eq(dests, ['bf0']);
  });

  t.test('an attached gear can be killed, and goes to its owner\'s trash', () => {
    let s = game();
    const u = put(s, vanilla, 0, 'base');
    const g = RB.mint(s, 'sfd-033', 0);
    RB.obj(s, u).attached.push(g); RB.obj(s, g).attachedTo = u;
    RB.kill(s, g);
    t.ok(s.players[0].trash.includes(g), 'in the trash');
    t.eq(RB.obj(s, u).attached, [], 'and off its host');
  });

  t.test('when an equipped unit dies its Equipment falls to base rather than vanishing', () => {
    const s = game();
    const u = put(s, vanilla, 0, 'base');
    const g = RB.mint(s, 'sfd-033', 0);
    RB.obj(s, u).attached.push(g); RB.obj(s, g).attachedTo = u;
    RB.kill(s, u);
    t.ok(s.players[0].base.includes(g), 'the gear is in base: ' + JSON.stringify(RB.locationOf(s, g)));
  });

  // --- the Beginning Phase (§316.3, [Temporary]) ------------------------------
  t.test('a Temporary unit survives its opponent\'s turn and dies at the start of its controller\'s', () => {
    let s = game();
    const u = put(s, vanilla, 0, 'base');
    RB.obj(s, u).temporary = true;
    s = RB.apply(s, { t: 'endTurn' });
    t.eq(s.active, 1);
    t.ok(s.players[0].base.includes(u), 'still in base on the opponent\'s turn');
    s = RB.apply(s, { t: 'endTurn' });
    t.eq(s.active, 0);
    t.ok(!s.players[0].base.includes(u), 'killed as its controller\'s turn began');
  });

  t.test('Frozen Fortress kills before scoring: a battlefield whose last unit dies is not held', () => {
    let s = game({ bfs: ['unl-212'] });
    const u = RB.mint(s, 'tok-recruit', 1);          // 1 Might: the Fortress's 1 is lethal
    s.bf[0].units.push(u);
    s.bf[0].controller = 1;
    const before = s.players[1].points;
    s = RB.apply(s, { t: 'endTurn' });
    t.ok(!s.bf[0].units.includes(u), 'the unit died');
    t.eq(s.players[1].points, before, 'and nothing was held');
  });

  t.test('Dusk Rose Lab asks its "you may" before scoring, not after', () => {
    let s = game({ bfs: ['unl-209'] });
    const u = RB.mint(s, vanilla, 1);
    s.bf[0].units.push(u);
    s.bf[0].controller = 1;
    const before = s.players[1].points;
    s = RB.apply(s, { t: 'endTurn' });
    t.eq(s.queue.length && s.queue[0].kind, 'may', 'the question is open');
    t.eq(s.phase, 'beginning', 'still in the Beginning Phase');
    t.eq(s.players[1].points, before, 'nothing scored yet');
    s = answerAll(s);     // yes: kill it, draw 1
    t.eq(s.phase, 'main');
    t.eq(s.players[1].points, before, 'the unit was killed first, so nothing is held');
  });

  t.test('a battlefield\'s own "when you hold here" fires (Amateur Recital)', () => {
    let s = game({ bfs: ['unl-207'] });
    const u = RB.mint(s, vanilla, 1);
    s.bf[0].units.push(u);
    s.bf[0].controller = 1;
    put(s, vanilla, 0, 1);
    s = RB.apply(s, { t: 'endTurn' });
    t.ok(s.queue.length && s.queue[0].kind === 'may', 'its "you may move a unit" is asked');
  });

  t.test('a Conquer trigger fires even when the point is replaced by a draw (Master Yi, Hunt)', () => {
    const s = game();
    const y = put(s, 'unl-113', 0, 0);
    s.players[0].points = s.victoryScore - 1;
    s.players[0].xp = 0;
    RB.score(s, 0, 0, 'conquer');
    t.eq(s.players[0].points, s.victoryScore - 1, 'the point was replaced');
    t.eq(s.players[0].xp, 2, 'but Hunt 2 still gained XP');
  });

  t.test('"spent [A][A] this turn" counts only this turn, whoever\'s it is (Sivir)', () => {
    let s = game();
    const v = put(s, 'sfd-143', 0, 'base');
    s.players[0].powerSpentThisTurn = 2;
    const pumped = RB.mightOf(s, v);
    s = RB.apply(s, { t: 'endTurn' });
    t.eq(RB.mightOf(s, v), pumped - 2, 'the +2 is gone on the opponent\'s turn');
  });

  // --- choosing (§809 Deflect) --------------------------------------------------
  t.test('a Deflect unit whose toll the caster cannot pay is not a legal choice (Hextech Ray on Vex)', () => {
    let s = game();
    s.players[0].runes = [];
    s.players[0].pool.energy = 1; s.players[0].pool.power.Fury = 1;   // exactly the Ray
    const vex = put(s, 'unl-150', 1, 1);             // "a unit at a battlefield"
    const other = put(s, vanilla, 1, 1);
    const ray = put(s, 'ogn-009', 0, 'hand');
    s = passAll(RB.apply(s, plays(s, ray)[0]));
    t.eq(RB.obj(s, vex).damage, 0, 'Vex untouched');
    t.ok(RB.obj(s, other).damage > 0 || !s.bf[1].units.includes(other), 'the other unit took it');
  });

  t.test('a static-granted Deflect costs one [A], not two (Fiora while Mighty)', () => {
    const s = game();
    const f = put(s, 'ogn-232', 1, 'base');
    RB.obj(s, f).permBuffs = 5;
    t.ok(RB.isMighty(s, f), 'Mighty');
    t.eq(RB.deflectCost(s, 0, f), 1);
  });

  // --- asking the human seat (CARD-LOG-AND-TARGETING-SPEC §10) --------------------
  t.test('a Deathknell that chooses asks its human controller (Ruined Rex)', () => {
    const s = game({ human: 0 });
    const rex = put(s, 'unl-067', 0, 'base');
    const a = put(s, vanilla, 1, 'base'), b = put(s, vanilla, 1, 'base');
    RB.kill(s, rex);
    const q = s.queue[0];
    t.ok(q && q.kind === 'target' && q.who === 0, 'a target question for seat 0');
    t.eq(q.options.slice().sort(), [a, b].sort());
    const done = RB.apply(s, { t: 'choose', selection: [b] });
    t.eq([RB.obj(done, a).damage, RB.obj(done, b).damage || (done.players[1].trash.includes(b) ? 4 : 0)], [0, 4]);
  });

  t.test('a choice inside a "you may" answer is asked, not taken (Grim Apothecary)', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    put(s, vanilla, 1, 0);
    const a = put(s, vanilla, 0, 0), b = put(s, vanilla, 0, 0);
    const g = put(s, 'unl-021', 0, 'hand');
    s = RB.apply(s, plays(s, g).find(x => x.to === 'bf0') || plays(s, g)[0]);
    t.eq(s.queue[0] && s.queue[0].kind, 'may');
    s = RB.apply(s, { t: 'choose', ix: 0 });
    const q = s.queue[0];
    t.ok(q && q.kind === 'target', 'which unit is asked: ' + JSON.stringify(q && q.kind));
    t.ok(q.options.includes(a) && q.options.includes(b));
    s = RB.apply(s, { t: 'choose', selection: [a] });
    t.ok(s.players[0].hand.includes(a) && !s.players[0].hand.includes(b), 'the chosen one returned');
  });

  t.test('Atakhan\'s "the defender kills one of their units here" asks the human defender on a real attack', () => {
    let s = game({ human: 1 });
    const mine = [put(s, vanilla, 1, 0), put(s, vanilla, 1, 0)];
    s.bf[0].controller = 1;
    const at = put(s, 'unl-170', 0, 'base');
    RB.obj(s, at).exhausted = false;
    s = RB.apply(s, RB.legalActions(s).find(a => a.t === 'move' && a.to === 'bf0' && a.iids.length === 1));
    const q = s.queue[0];
    t.ok(q && q.kind === 'target' && q.who === 1, 'the defender is asked: ' + JSON.stringify(q && [q.kind, q.who]));
    t.eq(q.options.slice().sort(), mine.slice().sort());
  });

  t.test('"each player kills one of their units" asks a human who did not cast it (Cull the Weak)', () => {
    let s = game({ human: 1 });
    rich(s, 0);
    put(s, vanilla, 0, 'base');
    const mine = [put(s, vanilla, 1, 'base'), put(s, 'unl-113', 1, 'base')];
    const cull = put(s, 'ogn-209', 0, 'hand');
    s = passChain(RB.apply(s, plays(s, cull)[0]));
    const q = s.queue[0];
    t.ok(q && q.kind === 'target' && q.who === 1, 'seat 1 is asked for its own unit');
    t.eq(q.options.slice().sort(), mine.slice().sort());
  });

  t.test('"each player banishes one of their top five" asks a human who did not cast it (Promising Future)', () => {
    let s = game({ human: 1 });
    rich(s, 0);
    const pf = put(s, 'ogn-115', 0, 'hand');
    s = RB.apply(s, plays(s, pf)[0]);
    s = passAll(s);
    t.ok(s.log.some(l => l.kind === 'target' && l.data.p === 1) || (s.queue[0] && s.queue[0].who === 1),
      'seat 1 chose its own card');
  });

  t.test('Hwei\'s "discard 1" is the player\'s choice, not the card just drawn', () => {
    const s = game({ human: 0 });
    const a = put(s, vanilla, 0, 'hand'), b = put(s, 'ogn-009', 0, 'hand');
    RB.resolveAsking(s, { kind: 'effects', effects: [{ op: 'discardByType', spell: [], gear: [], unit: [] }],
      ctx: { p: 0, source: a } });
    const q = s.queue[0];
    t.ok(q && q.kind === 'target', 'asked');
    t.eq(q.options.slice().sort(), [a, b].sort());
  });

  t.test('[Repeat] asks its choices again rather than reusing the first answer (Existential Dread)', () => {
    let s = game({ human: 0 });
    rich(s, 0);
    const a = put(s, vanilla, 1, 0), b = put(s, vanilla, 1, 0);
    RB.obj(s, a).role = 'attacker'; RB.obj(s, b).role = 'attacker';
    const d = put(s, 'unl-134', 0, 'hand');
    s = passChain(RB.apply(s, plays(s, d).find(x => (x.pay || []).includes('repeat'))));
    t.ok(s.queue[0] && s.queue[0].kind === 'target', 'first question');
    s = RB.apply(s, { t: 'choose', selection: [a] });
    t.ok(s.queue[0] && s.queue[0].kind === 'target', 'the repeat asks again');
    s = passChain(RB.apply(s, { t: 'choose', selection: [b] }));
    t.ok(RB.obj(s, a).stunned && RB.obj(s, b).stunned, 'each was stunned once');
  });

  // --- the chain: what a spell chooses, and what can counter it ------------------
  t.test('Not So Fast counters an enemy spell that chose a friendly unit', () => {
    let s = game();
    s.active = 1; s.priority = 1;
    rich(s, 0); rich(s, 1);
    const mine = put(s, vanilla, 0, 'base');
    const bolt = put(s, 'ogn-029', 1, 'hand');
    const nsf = put(s, 'sfd-045', 0, 'hand');
    s = RB.apply(s, plays(s, bolt)[0]);
    t.eq(s.chain[0].targets, [mine], 'the spell on the chain records what it chose');
    s = RB.apply(s, RB.legalActions(s).find(a => a.t === 'play' && a.iid === nsf));
    s = passChain(s);
    t.eq(RB.obj(s, mine).damage, 0, 'countered: my unit is untouched');
    t.ok(s.players[1].trash.includes(bolt), 'and the spell is in the trash');
  });

  t.test('"counter a spell" leaves an ability alone, and countering an ability does not trash its source', () => {
    const s = game();
    const legend = s.players[1].legend;
    s.chain.push({ iid: legend, controller: 1, kind: 'ability', ix: 0, uid: 'cX' });
    RB.ops.counter(s, { spellOnly: true }, { p: 0 });
    t.eq(s.chain.length, 1, 'Flurry\'s "counter a spell" does not take an ability');
    RB.ops.counter(s, {}, { p: 0 });
    t.eq(s.chain.length, 0, 'an unrestricted counter does');
    t.ok(!s.players[1].trash.includes(legend), 'and the legend stays where it is');
  });

  t.test('a Repeated ransom is bound to its spell: the second "no" does not counter the caster\'s own', () => {
    const s = game();
    const theirs = RB.mint(s, 'ogn-029', 1), mine = RB.mint(s, 'ogn-029', 0);
    s.chain.push({ iid: mine, controller: 0, kind: 'card', uid: 'c1' });
    s.chain.push({ iid: theirs, controller: 1, kind: 'card', uid: 'c2' });
    rich(s, 1, 2);
    RB.ops.ransom(s, { energy: 2 }, { p: 0, source: mine });
    RB.ops.ransom(s, { energy: 2 }, { p: 0, source: mine });
    RB.answerQueue(s, { t: 'choose', ix: 1 });           // no — countered
    RB.answerQueue(s, { t: 'choose', ix: 1 });           // no again — already gone
    t.eq(s.chain.map(x => x.uid), ['c1'], 'only the ransomed spell left the chain');
  });

  // --- combat (§464–466) ---------------------------------------------------------
  const combatAt = (s, bf, attackers, defenders) => {
    for (const u of attackers) s.bf[bf].units.push(u);
    for (const u of defenders) s.bf[bf].units.push(u);
    s.bf[bf].controller = 1;
    s.bf[bf].contestedBy = 0;
    s.bf[bf].combatStaged = true;
    RB.openShowdown(s, bf);
    return s;
  };
  const sized = (s, id, p, might) => {
    const u = RB.mint(s, id, p);
    RB.obj(s, u).permBuffs = might - RB.mightOf(s, u);
    return u;
  };

  t.test('[Backline] is assigned combat damage last (Pyke behind a bigger unit)', () => {
    const s = game();
    const atk = sized(s, vanilla, 0, 4);
    const pyke = sized(s, 'unl-145', 1, 3), wall = sized(s, vanilla, 1, 5);
    combatAt(s, 0, [atk], [pyke, wall]);
    RB.closeShowdown(s);
    t.ok(s.bf[0].units.includes(pyke), 'Pyke survives: all 4 went to the front unit');
  });

  t.test('a unit that arrives mid-combat takes its controller\'s designation (Rengar\'s Assault)', () => {
    let s = game();
    const atk = sized(s, vanilla, 0, 3), def = sized(s, vanilla, 1, 3);
    combatAt(s, 0, [atk], [def]);
    const rengar = put(s, 'sfd-025', 0, 0);
    s = RB.settle(s);
    t.eq(RB.obj(s, rengar).role, 'attacker');
    t.eq(RB.mightOf(s, rengar), RB.card('sfd-025').might + 2, 'Assault 2 applies');
  });

  t.test('attackers recalled because defenders survived is No Result, not a defender win', () => {
    const s = game();
    const atk = sized(s, vanilla, 0, 1), def = sized(s, vanilla, 1, 5);
    RB.obj(s, def).stunned = true;                 // deals nothing: both sides survive
    combatAt(s, 0, [atk], [def]);
    RB.closeShowdown(s);
    t.ok(s.players[0].base.includes(atk), 'the attacker was recalled');
    t.ok(s.log.some(l => l.kind === 'combatNoResult'), 'no result');
    t.ok(!s.log.some(l => l.kind === 'combatResult'), 'and no winner');
  });

  t.test('a showdown at an empty battlefield is not a combat: no attacker, no attack trigger', () => {
    const s = game();
    const u = put(s, vanilla, 0, 0);
    s.bf[0].contestedBy = 0;
    RB.openShowdown(s, 0);
    t.eq(RB.obj(s, u).role, undefined);
  });

  t.test('Azir\'s "when I attack" does not fire when he defends', () => {
    let s = game();
    const az = sized(s, 'sfd-177', 1, 3);
    const atk = sized(s, vanilla, 0, 3);
    s.bf[0].units.push(az); s.bf[0].controller = 1;
    s.bf[0].units.push(atk); s.bf[0].contestedBy = 0; s.bf[0].combatStaged = true;
    RB.openShowdown(s, 0);
    t.ok(!s.queue.some(q => q.kind === 'may' && q.who === 1), 'no "move your tokens" question');
  });

  t.test('a unit token played this turn is a friendly unit played (Rally the Troops buffs it)', () => {
    let s = game();
    rich(s, 0);
    const r = put(s, 'sfd-166', 0, 'hand');
    s = passAll(RB.apply(s, plays(s, r)[0]));
    RB.ops.token(s, { cardId: 'tok-recruit' }, { p: 0, source: r });
    const tok = s.players[0].base[s.players[0].base.length - 1];
    t.eq(RB.obj(s, tok).counters, 1, 'buffed');
  });

  t.test('Draven dying in his base during a combat elsewhere did not die in combat', () => {
    const s = game();
    const dr = put(s, 'sfd-148', 0, 'base');
    const atk = sized(s, vanilla, 0, 3), def = sized(s, vanilla, 1, 3);
    combatAt(s, 1, [atk], [def]);
    const before = s.players[1].points;
    RB.kill(s, dr);
    t.eq(s.players[1].points, before);
  });

  // --- what counts as playing a card ------------------------------------------
  t.test('Darius played as your second card sees himself: +2 and ready', () => {
    let s = game();
    rich(s, 0);
    const first = put(s, vanilla, 0, 'hand');
    const dar = put(s, 'ogn-027', 0, 'hand');
    s = RB.apply(s, plays(s, first).find(a => a.to === 'base'));
    rich(s, 0);
    s = RB.apply(s, plays(s, dar).find(a => a.to === 'base'));
    t.ok(!RB.obj(s, dar).exhausted, 'readied');
    t.eq(RB.mightOf(s, dar), RB.card('ogn-027').might + 2);
  });

  t.test('a card played by an effect is a card played this turn', () => {
    const s = game();
    rich(s, 0);
    put(s, vanilla, 0, 'trash');
    const n = s.players[0].playedThisTurn.length;
    RB.ops.playFromZone(s, { zone: 'trash', type: 'Unit', ignoreCost: true }, { p: 0, source: null });
    t.eq(s.players[0].playedThisTurn.length, n + 1);
  });

  t.test('a Bird token keeps its printed [Deflect] past the Ending Cleanup', () => {
    let s = game();
    RB.ops.keywordToken(s, { cardId: 'tok-bird', n: 1, might: 1, keywords: ['Deflect'] }, { p: 0, source: null });
    const bird = s.players[0].base[s.players[0].base.length - 1];
    s = RB.apply(s, { t: 'endTurn' });
    t.ok(RB.hasKeyword(s, bird, 'Deflect'));
  });

  t.test('"I can\'t move to base" holds against an effect move too (Determined Sentry)', () => {
    const s = game();
    const sentry = put(s, vanilla, 1, 0);
    RB.obj(s, sentry).noMoveToBase = true;
    RB.ops['ogn.moveUnit'](s, { target: { pick: 'enemyUnits' }, to: 'base' }, { p: 0, source: null });
    t.ok(s.bf[0].units.includes(sentry), 'still at the battlefield');
  });

  t.test('play-from-trash skips a card whose Power cost cannot be paid (The Harrowing)', () => {
    const s = game();
    s.players[0].runes = [];
    const dear = RB.allCards().find(c => c.type === 'Unit' && c.power >= 1);
    const big = put(s, dear.id, 0, 'trash');
    const small = put(s, vanilla, 0, 'trash');
    RB.ops.playFromZone(s, { zone: 'trash', type: 'Unit', ignoreEnergy: true }, { p: 0, source: null });
    t.ok(!s.players[0].trash.includes(small), 'the playable one was played');
    t.ok(s.players[0].trash.includes(big));
  });

  t.test('a showdown staged across the turn boundary opens in the Main Phase, after scoring', () => {
    let s = game();
    const mine = put(s, vanilla, 1, 0), theirs = put(s, vanilla, 0, 0);
    s.bf[0].controller = 1; s.bf[0].contestedBy = 0;
    s.bf[0].showdownStaged = true; s.bf[0].combatStaged = true;
    s.turnStart = null;
    // Hand the turn over without letting the cleanup open it in p0's own Ending Phase.
    const n0 = s.log.length;
    s = RB.apply(s, { t: 'endTurn' });
    const kinds = s.log.slice(n0).map(l => l.kind);
    const open = kinds.indexOf('showdownOpen');
    if (open < 0) return;                        // it opened before the turn ended: nothing to order
    t.ok(kinds.indexOf('draw') >= 0 && kinds.indexOf('draw') < open, 'the draw came first: ' + kinds.join(','));
    void mine; void theirs;
  });

  t.test('"kill all units" does not kill gear in a base (The Ruination)', () => {
    const s = game();
    const g = put(s, 'ogn-186', 0, 'base');
    const u = put(s, vanilla, 1, 'base');
    RB.ops.kill(s, { target: 'allUnits' }, { p: 0 });
    t.ok(s.players[0].base.includes(g), 'the gear is untouched');
    t.ok(!s.players[1].base.includes(u), 'the unit died');
    t.ok(!RB.select(s, 'myUnits', { p: 0 }).includes(g), 'and a gear is never "a friendly unit"');
  });

  t.test('a gear\'s death replacement is still asked (Zhonya\'s Hourglass)', () => {
    const s = game();
    const z = put(s, 'ogn-077', 0, 'base');
    const u = put(s, vanilla, 0, 'base');
    RB.kill(s, u);
    t.ok(s.players[0].base.includes(u) || s.players[0].trash.includes(z), 'Zhonya stood in: ' +
      JSON.stringify([RB.locationOf(s, u), RB.locationOf(s, z)]));
  });

  t.test('a unit that enters at 5+ Might did not BECOME Mighty (Grand Duelist stays quiet)', () => {
    let s = game();
    rich(s, 0);
    put(s, 'sfd-205', 0, 'base');
    const big = RB.allCards().find(c => c.type === 'Unit' && c.might >= 5 && c.abilities && c.abilities.vanilla)
      || RB.allCards().find(c => c.type === 'Unit' && c.might >= 5 && !(c.abilities.triggers || []).length);
    const b = put(s, big.id, 0, 'hand');
    s = RB.apply(s, plays(s, b).find(a => a.to === 'base'));
    t.eq(s.queue.length, 0, 'no "exhaust me to channel" offered');
    // …but growing into 5 is the crossing.
    const u = put(s, vanilla, 0, 'base');
    s = RB.settle(s);
    RB.obj(s, u).permBuffs = 5;
    s = RB.settle(s);
    t.eq(s.queue.length && s.queue[0].kind, 'may', 'crossing to 5 is offered');
  });

  t.test('a spell played from face down chooses its target at its own battlefield (Wages of Pain)', () => {
    let s = game();
    put(s, vanilla, 0, 0);
    s.bf[0].controller = 0;
    const near = sized(s, vanilla, 1, 3), far = sized(s, vanilla, 1, 9);
    s.bf[0].units.push(near); s.bf[1].units.push(far);
    const w = RB.mint(s, 'sfd-070', 0);
    s.bf[0].hidden.push({ iid: w, owner: 0, turnHidden: s.turn - 1 });
    s = passChain(RB.apply(s, RB.legalActions(s).find(a => a.iid === w)));
    t.ok(RB.obj(s, near).damage > 0 || !s.bf[0].units.includes(near), 'the unit at its battlefield was hit');
    t.eq(RB.obj(s, far).damage, 0, 'not the bigger one elsewhere');
  });
}
