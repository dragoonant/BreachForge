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
}
