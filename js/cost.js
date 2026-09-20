// Costs and the payment solver. Riftbound has two currencies with different mechanics:
// Energy is produced by EXHAUSTING a ready rune (any domain), Power by RECYCLING a rune
// (returning it to the rune deck) and takes the recycled rune's domain. Rule 165.3.
//
// One function answers "what can this source pay, and in what" so nothing else has to.
(function (RB) {
  'use strict';

  // The printed power cost is scraped as a count plus the card's domain list. A card whose
  // power count equals its domain count pays one of each; otherwise any listed domain pays.
  // Recorded as D-1 in DEVIATIONS.md with the test that fails when the real number arrives.
  RB.costOf = function (state, iid) {
    const c = RB.cardOf(state, iid);
    const doms = (c.domains && c.domains.length ? c.domains : [c.domain]).filter(d => d && d !== 'Colorless');
    const n = c.power || 0;
    const cost = { energy: c.energy || 0, power: n, domains: doms, each: n > 0 && doms.length > 1 && n === doms.length };
    return cost;
  };

  RB.runesReady = function (state, p) {
    return state.players[p].runes.filter(i => !RB.obj(state, i).exhausted);
  };

  // Can player p pay `cost` right now, counting what is already in the pool plus what the
  // runes on the board could still produce? Returns a plan, or null.
  RB.planPayment = function (state, p, cost) {
    const P = state.players[p];
    const pool = { energy: P.pool.energy, power: Object.assign({}, P.pool.power) };
    const ready = RB.runesReady(state, p).map(i => ({ iid: i, domain: RB.cardOf(state, i).domain }));
    const plan = { exhaust: [], recycle: [], fromPool: { energy: 0, power: [] } };

    // Power first — it is the constrained currency, and recycling a rune also removes it
    // from the energy pool, so a greedy energy-first solve strands power costs.
    const need = [];
    if (cost.power > 0) {
      if (cost.each) for (const d of cost.domains) need.push([d]);
      else for (let i = 0; i < cost.power; i++) need.push(cost.domains.slice());
    }
    for (const opts of need) {
      let d = opts.find(x => pool.power[x] > 0);
      if (d) { pool.power[d]--; plan.fromPool.power.push(d); continue; }
      const idx = ready.findIndex(r => opts.includes(r.domain));
      if (idx < 0) return null;
      plan.recycle.push(ready[idx].iid);
      ready.splice(idx, 1);
    }
    let e = cost.energy;
    const useFromPool = Math.min(e, pool.energy);
    plan.fromPool.energy = useFromPool; e -= useFromPool;
    if (e > ready.length) return null;
    for (let i = 0; i < e; i++) plan.exhaust.push(ready[i].iid);
    return plan;
  };

  RB.canPay = function (state, p, cost) { return !!RB.planPayment(state, p, cost); };

  RB.pay = function (state, p, plan) {
    const P = state.players[p];
    P.pool.energy -= plan.fromPool.energy;
    for (const d of plan.fromPool.power) P.pool.power[d]--;
    for (const iid of plan.exhaust) {
      RB.obj(state, iid).exhausted = true;
      RB.log(state, 'runeExhaust', { p: p, iid: iid }, 'rune.channel');
    }
    for (const iid of plan.recycle) RB.recycleRune(state, p, iid);
  };

  // Recycle: the rune leaves the board and goes to the BOTTOM of the rune deck (rule 416).
  RB.recycleRune = function (state, p, iid) {
    const P = state.players[p];
    RB.removeFrom(P.runes, iid);
    const o = RB.obj(state, iid);
    o.exhausted = false;
    P.runeDeck.push(iid);
    RB.log(state, 'runeRecycle', { p: p, iid: iid, domain: RB.cardOf(state, iid).domain }, 'rune.recycle');
  };

  RB.channel = function (state, p, n, exhausted) {
    const P = state.players[p];
    for (let i = 0; i < n; i++) {
      if (!P.runeDeck.length) break;
      const iid = P.runeDeck.shift();
      RB.obj(state, iid).exhausted = !!exhausted;
      P.runes.push(iid);
      RB.log(state, 'channel', { p: p, iid: iid, domain: RB.cardOf(state, iid).domain, exhausted: !!exhausted }, 'rune.channel');
    }
  };
})(window.RB = window.RB || {});
