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
    const plan = { exhaust: [], recycle: [], fromPool: { energy: 0, showdownOnly: 0, power: [] } };

    // Power first — it is the constrained currency, and recycling a rune also removes it
    // from the energy pool, so a greedy energy-first solve strands power costs.
    const need = [];
    if (cost.power > 0) {
      if (cost.each) for (const d of cost.domains) need.push([d]);
      else for (let i = 0; i < cost.power; i++) need.push(cost.domains.slice());
    }
    let universal = P.pool.any || 0;
    for (const opts of need) {
      let d = opts.find(x => pool.power[x] > 0);
      if (d) { pool.power[d]--; plan.fromPool.power.push(d); continue; }
      // Universal Power pays any domain requirement (rules §165.3), and is spent only
      // after matching Power, so it is never wasted on a cost a rune could have covered.
      if (universal > 0) { universal--; plan.fromPool.power.push('any'); continue; }
      const idx = ready.findIndex(r => opts.includes(r.domain));
      if (idx < 0) return null;
      plan.recycle.push(ready[idx].iid);
      ready.splice(idx, 1);
    }
    let e = cost.energy;
    // Showdown-only Energy is spent FIRST while a showdown is open, because it is lost
    // the moment the showdown closes and ordinary Energy is not.
    const sdPool = state.showdown ? (P.pool.showdownOnly || 0) : 0;
    const useSd = Math.min(e, sdPool);
    plan.fromPool.showdownOnly = useSd; e -= useSd;
    const useFromPool = Math.min(e, pool.energy);
    plan.fromPool.energy = useFromPool; e -= useFromPool;
    if (e > ready.length) return null;
    for (let i = 0; i < e; i++) plan.exhaust.push(ready[i].iid);
    return plan;
  };

  RB.canPay = function (state, p, cost) { return !!RB.planPayment(state, p, cost); };

  // --- additional costs, and the cost-modifier layer ------------------------
  // An additional cost is chosen AS a card is played and is part of its total cost
  // (§349 step 3). Two kinds matter: a resource surcharge ([Accelerate]'s "pay [1][C] and
  // I enter ready") and a sacrifice that gates legality ("kill a friendly Mighty unit").
  // A sacrifice authored as an EFFECT instead would make the spell castable with nothing
  // to sacrifice, which is a different card — so its availability is checked here.
  RB.additionalCost = function (state, iid, id) {
    const ab = RB.cardOf(state, iid).abilities || {};
    const x = (ab.additionalCosts || []).find(c => c.id === id);
    if (!x) throw new Error(RB.cardOf(state, iid).id + ' has no additional cost ' + id);
    return x;
  };
  RB.extraAvailable = Object.create(null);
  RB.defineExtraCost = function (name, spec) { RB.extraAvailable[name] = spec; };

  // Which additional costs can this player actually choose right now? Returns the ids.
  RB.availableExtras = function (state, p, iid) {
    const ab = RB.cardOf(state, iid).abilities || {};
    const out = [];
    for (const x of ab.additionalCosts || []) {
      if (x.pays) {
        const spec = RB.extraAvailable[x.pays];
        if (!spec) throw new Error('no extra-cost kind named ' + x.pays);
        if (!spec.available(state, p, iid, x)) continue;
      }
      out.push(x.id);
    }
    return out;
  };
  RB.payExtra = function (state, p, iid, x) {
    if (!x.pays) return;
    RB.extraAvailable[x.pays].pay(state, p, iid, x);
  };

  // The kinds of additional cost a card can name. Each answers two questions: can the
  // player pay it at all (which is what gates legality), and what happens when they do.
  RB.defineExtraCost('killFriendly', {
    available: (s, p, iid, x) => pickKillable(s, p, iid, x).length > 0,
    pay: (s, p, iid, x) => { const c = pickKillable(s, p, iid, x); if (c.length) RB.kill(s, c[0]); },
  });
  function pickKillable(s, p, iid, x) {
    const pool = RB.allUnits(s).filter(u => RB.obj(s, u).controller === p && u !== iid);
    const f = pool.filter(u => (!x.mighty || RB.isMighty(s, u)) &&
      (!x.tag || (RB.card(RB.obj(s, u).cardId).tags || []).includes(x.tag)));
    // Cheapest first: an additional cost should not eat the best unit on the board.
    return f.sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b));
  }
  RB.defineExtraCost('discard', {
    available: (s, p, iid, x) => s.players[p].hand.filter(h => h !== iid).length >= (x.n || 1),
    pay: (s, p, iid, x) => {
      const P = s.players[p];
      for (let i = 0; i < (x.n || 1); i++) {
        const h = P.hand.filter(c => c !== iid);
        if (!h.length) break;
        RB.removeFrom(P.hand, h[h.length - 1]);
        P.trash.push(h[h.length - 1]);
      }
    },
  });
  RB.defineExtraCost('spendBuff', {
    available: (s, p, iid, x) => buffPool(s, p).length >= (x.n || 1),
    pay: (s, p, iid, x) => {
      const pool = buffPool(s, p);
      for (let i = 0; i < (x.n || 1) && i < pool.length; i++) RB.obj(s, pool[i]).counters--;
    },
  });
  function buffPool(s, p) {
    return RB.allUnits(s).filter(u => RB.obj(s, u).controller === p && (RB.obj(s, u).counters || 0) > 0);
  }
  RB.defineExtraCost('recycleFromTrash', {
    available: (s, p, iid, x) => s.players[p].trash.length >= (x.n || 1),
    pay: (s, p, iid, x) => {
      const P = s.players[p];
      for (let i = 0; i < (x.n || 1) && P.trash.length; i++) P.deck.push(P.trash.pop());
    },
  });

  // The total cost of playing a card: its printed cost, plus any additional costs chosen,
  // through the modifier layer. Everything that changes what a card costs goes through
  // here, so "I cost [2] less" and "ignore this spell's cost" have one home.
  RB.costModifiers = [];
  RB.defineCostModifier = function (fn) { RB.costModifiers.push(fn); };

  RB.totalCost = function (state, iid, extras) {
    const base = RB.costOf(state, iid);
    const cost = { energy: base.energy, power: base.power,
      domains: base.domains.slice(), each: base.each };
    for (const x of extras || []) {
      cost.energy += x.energy || 0;
      if (x.power) {
        cost.power += x.power;
        cost.each = false;
        if (x.domains) for (const d of x.domains) if (!cost.domains.includes(d)) cost.domains.push(d);
      }
      if (x.waivesBaseCost) { cost.energy = x.energy || 0; cost.power = x.power || 0; }
    }
    const o = RB.obj(state, iid);
    for (const fn of RB.costModifiers) fn(state, o.controller, iid, cost);
    cost.energy = Math.max(0, cost.energy);
    cost.power = Math.max(0, cost.power);
    if (cost.power === 0) cost.each = false;
    return cost;
  };

  // Say WHY a card cannot be paid for, in the player's terms, before the first click.
  // "Costs 3 and 1 Calm — you have 2 ready runes, none of them Calm" beats a greyed card.
  RB.whyCannotPay = function (state, p, cost) {
    if (RB.planPayment(state, p, cost)) return null;
    const P = state.players[p];
    const ready = RB.runesReady(state, p);
    const byDomain = {};
    for (const i of ready) { const d = RB.cardOf(state, i).domain; byDomain[d] = (byDomain[d] || 0) + 1; }
    const have = P.pool.energy + ready.length;
    if (cost.power > 0) {
      const usable = cost.domains.reduce((n, d) => n + (byDomain[d] || 0) + (P.pool.power[d] || 0), 0);
      if (usable < cost.power)
        return 'needs ' + cost.power + ' ' + cost.domains.join('/') + ' Power — you have ' +
          usable + ' rune' + (usable === 1 ? '' : 's') + ' of that domain ready';
    }
    return 'needs ' + cost.energy + ' Energy — you have ' + have + ' ready';
  };

  RB.pay = function (state, p, plan) {
    const P = state.players[p];
    P.pool.energy -= plan.fromPool.energy;
    P.pool.showdownOnly -= (plan.fromPool.showdownOnly || 0);
    for (const d of plan.fromPool.power) { if (d === 'any') P.pool.any--; else P.pool.power[d]--; }
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
