// Unleashed, card by card. Each test reads one printed clause literally and asks the real
// engine — legalActions / apply — whether a game plays it. Each names the rule, and each
// was watched failing on the code before its fix (CLAUDE.md rule 10).
export function run(t) {
  const RB = t.RB;
  RB.registerCards();
  const decks = RB.deckData.map(d => d.id);

  // A cleared board: no hands, no units, p0 active in its main phase.
  const game = (opts = {}) => {
    let s = RB.newGame({ seed: opts.seed || 'cards-unl', decks: [decks[0], decks[1]] });
    while (s.queue.length && s.queue[0].kind === 'mulligan') s = RB.apply(s, { t: 'mulligan', toss: [] });
    s.humanSeat = opts.human === undefined ? null : opts.human;
    for (const P of s.players) { P.deck.push(...P.hand); P.hand = []; P.base = []; }
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
  // A plain unit of the given Might.
  const sized = (s, m, p, where) => {
    const iid = put(s, vanilla, p, where);
    RB.obj(s, iid).permBuffs = m - RB.card(vanilla).might;
    return iid;
  };
  const plays = (s, iid) => RB.legalActions(s).filter(a => a.t === 'play' && a.iid === iid);
  const vanilla = 'tok-mech';                   // a 3 Might unit with no text
  const aSpell = RB.allCards().find(c => c.type === 'Spell' && c.set !== 'Token').id;
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
  // Run a list of effects as a resolution of its own, as a trigger would.
  const resolve = (s, effects, ctx) => { RB.runAsking(s, effects, ctx, ctx.source); return s; };

  // --- unl-081 Keeper of Masks ---------------------------------------------------
  t.test('Keeper of Masks: the copies are copies of a [Temporary] card, so they are Temporary', () => {
    let s = game();
    rich(s, 0);
    const k = put(s, 'unl-081', 0, 'hand');
    s = passAll(RB.apply(s, plays(s, k).find(a => a.to === 'base')));
    const copies = s.players[0].base.filter(i => i !== k && RB.obj(s, i).cardId === 'unl-081');
    t.eq(copies.length, 2, 'two Reflection copies');
    t.ok(copies.every(i => RB.obj(s, i).temporary), 'each copy is Temporary');
  });
}
