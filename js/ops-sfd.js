// Ops and conditions for the Spiritforged set. Handlers go in through RB.defineOp,
// describers through RB.defineDescriber, conditions through RB.defineStaticWhen — the core
// is never edited. Four things are worth knowing before reading on.
//
// 1. NAMESPACED OP NAMES. Every op defined here is `sfd.<name>`. Three packs write into one
//    RB.ops table and the last file loaded wins a collision SILENTLY (js/ops-unl.js defines
//    a bare `attach`, this set needs its own), so a prefix makes that impossible.
//
// 2. LOAD ORDER. index.html loads the ops files before js/engine.js and js/text.js, so
//    RB.defineDescriber, RB.cardText, RB.score and RB.recycleRune do not exist yet when this
//    file runs. Everything that needs them is deferred into install(), which runs on the
//    first RB.registerCards() — by which time every script has loaded. install() is
//    idempotent and is also tried immediately, in case this file is ever loaded last.
//
// 3. ONLY TWO WRAPPERS ARE LEFT (D-8). The core now raises `deathknell`, `died`,
//    `leftBoard`, `moved`, `defend`, `becameMighty`, `becameReady` and `chosen`, and reads
//    `untargetableByEnemies` in RB.canChoose — so the wrappers this pack had over RB.kill,
//    RB.apply and RB.autoPick are gone, and their cards ride the core events. What is left:
//      * RB.recycleRune — there is no event for a rune being recycled, and sfd-203's first
//        clause triggers on exactly that. Raised into this pack's own `sfdTriggers` table,
//        read only off cards whose id starts with `sfd-`, so a second pack's wrapper can
//        neither fire this data nor be fired by it.
//      * RB.score — "Players can't score here until their third turn" (sfd-209) is a
//        restriction on scoring, and scoring has no hook table.
//    RB.cardText is extended too, but only as a describer: it adds prose for the static
//    keys and set-local triggers the core describer does not know, and delegates the rest.
//
// 4. ONE STATIC PREDICATE IS ADDED HERE, through RB.defineStaticWhen and never by wrapping
//    RB.staticsOn: `sandSoldier`, because sfd-197 speaks about a token by NAME and the
//    static's own `tag` filter cannot say that (data/tokens.js tags the Sand Soldier
//    `Shurima`, not `Sand Soldier`).
(function (RB) {
  'use strict';

  const def = (name, fn) => RB.defineOp('sfd.' + name, fn);
  const SAY = [];                                   // describers, registered by install()
  const say = (name, fn) => SAY.push(['sfd.' + name, fn]);

  // --- small shared helpers -------------------------------------------------
  const n_ = e => (e.n == null ? 1 : e.n);
  const isSfd = (s, iid) => String(RB.obj(s, iid).cardId).startsWith('sfd-');
  const abOf = (s, iid) => RB.cardOf(s, iid).abilities || null;
  const lower = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const upper = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const join = fx => (fx || []).map(e => {
    const d = RB.describers[e.op];
    if (!d) throw new Error('no describer for op: ' + e.op);
    return d(e);
  }).filter(Boolean).join(' ');

  function unitsOf(s, p) {
    return RB.allUnits(s).filter(i => RB.obj(s, i).controller === p && RB.cardOf(s, i).type === 'Unit');
  }
  function allGear(s) {
    const out = [];
    for (const iid of Object.keys(s.objects)) {
      if (RB.card(s.objects[iid].cardId).type !== 'Gear') continue;
      if (s.objects[iid].attachedTo) { out.push(iid); continue; }
      const loc = RB.locationOf(s, iid);
      if (loc.kind === 'base' || loc.kind === 'bfGear') out.push(iid);
    }
    return out;
  }
  // The battlefield an ability speaks from: a battlefield's own iid, or the location of the
  // unit or gear that carries it. The core's `t.here` trigger filter reads locationOf, which
  // answers "nowhere" for a battlefield — so battlefield cards use the `here` condition.
  function sourceBf(s, ctx) {
    for (let i = 0; i < s.bf.length; i++) if (s.bf[i].iid === ctx.source) return i;
    const loc = RB.locationOf(s, ctx.source);
    return loc.kind === 'bf' ? loc.bf : -1;
  }
  function eventBf(s, ctx) {
    if (ctx.event && ctx.event.bf !== undefined && ctx.event.bf !== null) return ctx.event.bf;
    return sourceBf(s, ctx);
  }
  // The engine's `may` keeps p/source/event/targets across the queue step; a clause that
  // says "ready IT" about a token this card just made needs the token too.
  function plainCtx(ctx) {
    return { p: ctx.p, source: ctx.source, event: ctx.event || null,
      targets: ctx.targets || [], made: ctx.made || [], paid: ctx.paid || [] };
  }
  function turnsTaken(s, p) {
    return p === s.firstPlayer ? Math.ceil(s.turn / 2) : Math.floor(s.turn / 2);
  }

  // --- set-local triggers: one event the core does not raise ----------------
  function sfdSources(s) {
    const out = [];
    for (let p = 0; p < 2; p++) {
      if (s.players[p].legend) out.push([s.players[p].legend, p]);
      for (const iid of s.players[p].base) out.push([iid, p]);
    }
    for (const bf of s.bf) {
      for (const iid of bf.units) out.push([iid, RB.obj(s, iid).controller]);
      for (const iid of bf.gear) out.push([iid, RB.obj(s, iid).controller]);
    }
    return out;
  }
  function fire(s, event, data) {
    for (const [iid, p] of sfdSources(s)) {
      if (!isSfd(s, iid)) continue;
      const ab = abOf(s, iid);
      if (!ab || !ab.sfdTriggers) continue;
      for (const t of ab.sfdTriggers) {
        if (t.on !== event) continue;
        if (t.mine && data.p !== p) continue;
        const prev = s.via;
        s.via = { iid: iid };
        RB.runEffects(s, t.effects, { p: p, source: iid, event: data });
        s.via = prev;
      }
    }
  }

  // --- conditions -----------------------------------------------------------
  // One guard op with named tests. An unknown test throws rather than reading false, because
  // a condition that silently fails is how a printed clause goes missing.
  const CONDS = {
    here: (s, ctx) => !!ctx.event && ctx.event.bf === sourceBf(s, ctx),
    isMe: (s, ctx) => !!ctx.event && ctx.event.iid === ctx.source,
    iChose: (s, ctx) => !!ctx.event && ctx.event.chooser === ctx.p,
    // Deathknell runs after the card has left its zone, so "no other friendly units here"
    // is exactly "no friendly units here" by the time this is asked.
    diedAlone: (s, ctx) => {
      const bf = ctx.event && ctx.event.bf;
      if (bf !== undefined && bf !== null) return RB.unitsAt(s, bf, ctx.p).length === 0;
      return s.players[ctx.p].base.filter(i => RB.cardOf(s, i).type === 'Unit').length === 0;
    },
    wasMighty: (s, ctx) => RB.isMighty(s, ctx.source),
    wonCombat: (s, ctx) => !!ctx.event && ctx.event.winner === ctx.p,
    unattached: (s, ctx) => !RB.obj(s, ctx.source).attachedTo,
    mightyHere: (s, ctx) => {
      const here = eventBf(s, ctx);
      return here >= 0 && RB.unitsAt(s, here, ctx.p).some(i => RB.isMighty(s, i));
    },
    enemyUnitDied: (s, ctx) => !!ctx.event && ctx.event.p !== ctx.p &&
      !!s.objects[ctx.event.iid] && RB.cardOf(s, ctx.event.iid).type === 'Unit',
    paidExtra: (s, ctx, e) => (ctx.paid || []).includes(e.id),
    trashAtLeast: (s, ctx, e) => s.players[ctx.p].trash.length >= n_(e),
  };
  const COND_TEXT = {
    here: 'it happened here', isMe: 'it is me', iChose: 'you were the one choosing',
    diedAlone: 'I died alone', wasMighty: 'I was Mighty', wonCombat: 'you won it',
    unattached: 'I am unattached', mightyHere: 'you had one or more Mighty units here',
    enemyUnitDied: 'it was an enemy unit', paidExtra: 'you paid the additional cost',
    trashAtLeast: 'your trash holds enough cards',
  };
  def('when', (s, e, ctx) => {
    const list = Array.isArray(e.cond) ? e.cond : [e.cond];
    for (const name of list) {
      const c = CONDS[name];
      if (!c) throw new Error('sfd.when: no such condition: ' + name);
      if (!c(s, ctx, e)) return;
    }
    RB.runEffects(s, e.effects || [], ctx);
  });
  say('when', e => {
    const list = Array.isArray(e.cond) ? e.cond : [e.cond];
    for (const name of list) if (!COND_TEXT[name]) throw new Error('sfd.when: no text for ' + name);
    return 'If ' + list.map(name => COND_TEXT[name]).join(' and ') + ', ' + lower(join(e.effects));
  });

  // "Your Sand Soldiers" (sfd-197). The token carries the Shurima tag, not a Sand Soldier
  // one, so the static's `tag` filter cannot name it and the card means the token by name.
  RB.defineStaticWhen('sandSoldier', (s, iid) => RB.card(RB.obj(s, iid).cardId).name === 'Sand Soldier');

  // --- optional clauses with a price ----------------------------------------
  // "You may pay [Cost] to …". The core's `may` asks; this asks only when the player could
  // actually pay, and the yes branch pays through sfd.payThen. Offering a question the
  // player cannot answer, or one that takes the cost without checking, are both wrong.
  def('mayPay', (s, e, ctx) => {
    if (!canPay(s, e, ctx)) return;
    const pay = {
      op: 'sfd.payThen', energy: e.energy, power: e.power, domains: e.domains,
      anyDomain: e.anyDomain, exhaustSelf: e.exhaustSelf, bounceHere: e.bounceHere,
      effects: e.effects || [],
    };
    s.queue.push({
      kind: 'may', who: ctx.p, source: ctx.source,
      prompt: e.prompt || ('Pay ' + costPhrase(e).replace(/^pay /, '') + '?'),
      ctx: plainCtx(ctx), onAnswer: [[pay], []],
    });
  });
  say('mayPay', e => 'You may ' + costPhrase(e) + ' to ' + lower(join(e.effects)));

  def('payThen', (s, e, ctx) => {
    if (!canPay(s, e, ctx)) return;
    const plan = RB.planPayment(s, ctx.p, resourceCost(e));
    if (!plan) return;
    RB.pay(s, ctx.p, plan);
    if (e.exhaustSelf) RB.obj(s, ctx.source).exhausted = true;
    if (e.bounceHere) {
      const u = cheapestHere(s, ctx);
      if (u === null) return;
      toHand(s, u);
    }
    RB.runEffects(s, e.effects || [], ctx);
  });
  say('payThen', e => costPhrase(e).replace(/^pay/, 'Pay') + ': ' + join(e.effects));

  function resourceCost(e) {
    return { energy: e.energy || 0, power: e.power || 0,
      domains: e.anyDomain ? RB.DOMAINS.slice() : (e.domains || []), each: false };
  }
  function canPay(s, e, ctx) {
    if (!RB.canPay(s, ctx.p, resourceCost(e))) return false;
    if (e.exhaustSelf && RB.obj(s, ctx.source).exhausted) return false;
    if (e.bounceHere && cheapestHere(s, ctx) === null) return false;
    return true;
  }
  function costPhrase(e) {
    const bits = [];
    if (e.energy) bits.push(e.energy + ' Energy');
    if (e.power) bits.push(e.power + ' Power' + (e.anyDomain ? ' of any domain' : ''));
    let out = bits.length ? 'pay ' + bits.join(' and ') : '';
    if (e.exhaustSelf) out = out ? out + ' and exhaust me' : 'exhaust me';
    if (e.bounceHere) out += (out ? ' and ' : '') + "return a unit you control here to its owner's hand";
    return out || 'do nothing';
  }
  function cheapestHere(s, ctx) {
    const here = eventBf(s, ctx);
    if (here < 0) return null;
    const us = RB.unitsAt(s, here, ctx.p);
    if (!us.length) return null;
    return us.slice().sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b))[0];
  }

  // --- gear ------------------------------------------------------------------
  // Equip / Quick-Draw. Attaching is how this engine models Equipment: RB.mightOf already
  // adds an attached gear's printed Might Bonus, so the bonus itself needs no data.
  def('attach', (s, e, ctx) => {
    const gear = ctx.source;
    if (RB.obj(s, gear).attachedTo) return;          // already placed by the play destination
    const hosts = unitsOf(s, ctx.p);
    if (!hosts.length) return;
    hosts.sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    attachTo(s, gear, hosts[0], ctx.p);
  });
  say('attach', () => 'Attach me to a unit you control.');

  function attachTo(s, gear, host, p) {
    const loc = RB.locationOf(s, gear);
    if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, gear);
    else if (loc.kind === 'bfGear') RB.removeFrom(s.bf[loc.bf].gear, gear);
    else return false;
    RB.obj(s, host).attached.push(gear);
    RB.obj(s, gear).attachedTo = host;
    RB.log(s, 'attach', { p: p, iid: gear, host: host }, 'gear.equip');
    return true;
  }

  def('killGear', (s, e, ctx) => {
    const g = pickGear(s, e, ctx);
    if (g === null) return;
    detach(s, g);
    RB.kill(s, g);
  });
  say('killGear', () => 'Kill a gear.');

  def('bounceGear', (s, e, ctx) => {
    const g = pickGear(s, e, ctx);
    if (g === null) return;
    detach(s, g);
    toHand(s, g);
  });
  say('bounceGear', () => "Return a gear to its owner's hand.");

  // Auto-resolution for "a gear": the opponent's biggest, else your own smallest. The POOL
  // is every gear the card may legally choose; this only orders it, the way RB.autoPick
  // orders units, because the player does not pick yet (D-2).
  function pickGear(s, e, ctx) {
    const all = allGear(s);
    const theirs = all.filter(i => RB.obj(s, i).controller !== ctx.p);
    if (theirs.length) return theirs.sort((a, b) => bonusOf(s, b) - bonusOf(s, a))[0];
    if (e.side === 'enemy') return null;
    const mine = all.filter(i => RB.obj(s, i).controller === ctx.p);
    return mine.length ? mine.sort((a, b) => bonusOf(s, a) - bonusOf(s, b))[0] : null;
  }
  const bonusOf = (s, iid) => RB.cardOf(s, iid).might || 0;
  function detach(s, gid) {
    const o = RB.obj(s, gid);
    if (!o.attachedTo) return;
    RB.removeFrom(RB.obj(s, o.attachedTo).attached, gid);
    o.attachedTo = null;
    s.players[o.controller].base.push(gid);
  }
  // A permanent leaving the board for its owner's hand. A token put into any non-board zone
  // ceases to exist (§185.3), so it is dropped rather than handed over.
  function toHand(s, iid) {
    const o = RB.obj(s, iid);
    const loc = RB.locationOf(s, iid);
    if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, iid);
    else if (loc.kind === 'bf') RB.removeFrom(s.bf[loc.bf].units, iid);
    else if (loc.kind === 'bfGear') RB.removeFrom(s.bf[loc.bf].gear, iid);
    else return;
    o.damage = 0; o.buffs = 0; o.granted = []; o.exhausted = false;
    if (!o.token) s.players[o.owner].hand.push(iid);
    RB.log(s, 'bounce', { iid: iid, p: o.controller }, 'unit.move');
  }

  // [Weaponmaster] — "choose a card you control with the Equipment tag; pay the cost of its
  // Equip ability, reduced by [A], to attach it to this unit". The reduction is applied to
  // that ability's own printed cost, and nothing is attached if the rest cannot be paid.
  def('weaponmaster', (s, e, ctx) => {
    const mine = allGear(s).filter(i => RB.obj(s, i).controller === ctx.p &&
      !RB.obj(s, i).attachedTo && (RB.cardOf(s, i).tags || []).includes('Equipment'));
    if (!mine.length) return;
    mine.sort((a, b) => bonusOf(s, b) - bonusOf(s, a));
    const gear = mine[0];
    const eq = ((abOf(s, gear) || {}).activated || [])[0] || {};
    const cost = { energy: Math.max(0, (eq.energy || 0) - 0), power: Math.max(0, (eq.power || 0) - 1),
      domains: eq.domains || RB.DOMAINS.slice(), each: false };
    const plan = RB.planPayment(s, ctx.p, cost);
    if (!plan) return;
    RB.pay(s, ctx.p, plan);
    attachTo(s, gear, ctx.source, ctx.p);
  });
  say('weaponmaster', () => 'Attach an Equipment you control to me, paying the cost of its ' +
    'Equip ability reduced by 1 Power.');

  // "Move an enemy gear to your base. You control it until I leave the board. If it's an
  // Equipment, attach it to me." The loan is a delayed ability keyed to this unit leaving,
  // so it outlives the trigger that made it and survives the unit dying.
  def('stealGear', (s, e, ctx) => {
    const theirs = allGear(s).filter(i => RB.obj(s, i).controller !== ctx.p);
    if (!theirs.length) return;
    theirs.sort((a, b) => bonusOf(s, b) - bonusOf(s, a));
    const gear = theirs[0];
    detach(s, gear);
    const loc = RB.locationOf(s, gear);
    if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, gear);
    else if (loc.kind === 'bfGear') RB.removeFrom(s.bf[loc.bf].gear, gear);
    RB.obj(s, gear).controller = ctx.p;
    s.players[ctx.p].base.push(gear);
    RB.log(s, 'seize', { p: ctx.p, iid: gear }, 'gear.equip');
    if ((RB.cardOf(s, gear).tags || []).includes('Equipment')) attachTo(s, gear, ctx.source, ctx.p);
    s.delayed = s.delayed || [];
    s.delayed.push({ on: 'leftBoard', p: ctx.p, source: ctx.source, once: false,
      effects: [{ op: 'sfd.returnStolen' }], data: { gear: gear, host: ctx.source } });
  });
  say('stealGear', () => "Move an enemy gear to your base. You control it until I leave the " +
    "board. If it's an Equipment, attach it to me.");

  def('returnStolen', (s, e, ctx) => {
    const d = ctx.delayed || {};
    if (!ctx.event || ctx.event.iid !== d.host) return;
    const gear = d.gear;
    for (const entry of (s.delayed || []).slice())
      if (entry.data && entry.data.gear === gear) s.delayed.splice(s.delayed.indexOf(entry), 1);
    if (!s.objects[gear]) return;
    detach(s, gear);
    const o = RB.obj(s, gear);
    const loc = RB.locationOf(s, gear);
    if (loc.kind === 'base') RB.removeFrom(s.players[loc.p].base, gear);
    else if (loc.kind === 'bfGear') RB.removeFrom(s.bf[loc.bf].gear, gear);
    else if (loc.kind === 'nowhere') return;         // already gone with its host
    o.controller = o.owner;
    s.players[o.owner].base.push(gear);
    RB.log(s, 'seizeEnd', { p: o.owner, iid: gear });
  });
  say('returnStolen', () => 'Return it to its owner.');

  // --- tokens ----------------------------------------------------------------
  // Named tokens (data/tokens.js). Delegates to the core `token` op per copy and remembers
  // what it made, so a following clause ("Ready up to two of them") can speak about them.
  def('playToken', (s, e, ctx) => { for (let i = 0; i < n_(e); i++) mintToken(s, e, ctx); });
  say('playToken', e => tokenPhrase(e, n_(e)));

  def('playTokenPer', (s, e, ctx) => {
    let k = 0;
    for (const iid of ownedCards(s, ctx.p)) if ((RB.cardOf(s, iid).tags || []).includes(e.per)) k++;
    for (let i = 0; i < k; i++) mintToken(s, e, ctx);
  });
  say('playTokenPer', e => tokenPhrase(e, 1).replace(/\.$/, '') + ' for each ' + e.per + ' you control.');

  def('readyMade', (s, e, ctx) => {
    for (const iid of (ctx.made || []).slice(0, n_(e))) if (s.objects[iid]) RB.obj(s, iid).exhausted = false;
  });
  say('readyMade', e => 'Ready up to ' + (COUNTWORD[n_(e)] || n_(e)) + ' of them.');

  function mintToken(s, e, ctx) {
    const before = s.nextIid;
    RB.ops.token(s, {
      op: 'token', cardId: e.cardId, might: e.might, ready: e.ready, to: e.to, temporary: e.temporary,
    }, ctx);
    const iid = 'o' + before;
    if (!s.objects[iid]) return;
    (ctx.made = ctx.made || []).push(iid);
    // [Weaponmaster] is a PLAY effect, and "Play a … token" is the play — so a token that
    // has been granted the keyword (sfd-197 grants it to your Sand Soldiers) gets its
    // effect here, at the moment it arrives, rather than never. A token minted through the
    // core `token` op by another pack is outside this path; the grant is still readable
    // there through RB.hasKeyword, it simply has no play moment to hang on.
    if (RB.cardOf(s, iid).type === 'Unit' && RB.hasKeyword(s, iid, 'Weaponmaster'))
      RB.ops.may(s, { effects: [{ op: 'sfd.weaponmaster' }] }, { p: ctx.p, source: iid });
  }
  function ownedCards(s, p) {
    const out = [];
    for (const iid of s.players[p].base) out.push(iid);
    for (const bf of s.bf) {
      for (const iid of bf.units) if (RB.obj(s, iid).controller === p) out.push(iid);
      for (const iid of bf.gear) if (RB.obj(s, iid).controller === p) out.push(iid);
    }
    for (const iid of out.slice()) for (const g of RB.obj(s, iid).attached) out.push(g);
    return out;
  }
  const NUMWORD = { 1: 'a', 2: 'two', 3: 'three', 4: 'four' };
  const COUNTWORD = { 1: 'one', 2: 'two', 3: 'three', 4: 'four' };
  function tokenCard(id) {
    try { return RB.card(id); } catch (err) { return (RB.tokenData || []).find(t => t.id === id) || null; }
  }
  function tokenPhrase(e, n) {
    const t = tokenCard(e.cardId) || { name: e.cardId, type: 'Unit', might: null };
    const might = e.might != null ? e.might : t.might;
    const dest = e.to === 'here' ? ' there' : e.to === 'base' ? ' to your base' : '';
    return 'Play ' + (n === 1 ? 'a' : (NUMWORD[n] || n)) + ' ' + (might != null ? might + ' Might ' : '') +
      t.name + ' ' + (t.type === 'Gear' ? 'gear' : 'unit') + ' token' + (n > 1 ? 's' : '') +
      dest + (e.exhausted ? ' exhausted' : '') + '.';
  }

  // --- Might ------------------------------------------------------------------
  // The core `buff` op is the same mechanic, but its describer reads "a chosen your units
  // gets +5 Might" — and the describer is the auditor, so these two carry the printed
  // phrasing instead. Buffs already expire in the Ending Phase, hence "this turn".
  def('giveMight', (s, e, ctx) => {
    for (const iid of RB.select(s, e.target, ctx)) RB.obj(s, iid).buffs += n_(e);
  });
  say('giveMight', e => 'Give ' + selPhrase(e.target) + ' +' + n_(e) + ' Might this turn.');

  def('weaken', (s, e, ctx) => {
    for (const iid of RB.select(s, e.target, ctx)) RB.obj(s, iid).buffs -= n_(e);
  });
  say('weaken', e => 'Give ' + selPhrase(e.target) + ' -' + n_(e) + ' Might this turn.');

  function selPhrase(sel) {
    if (!sel || sel === 'self') return 'me';
    if (sel === 'eventUnit') return 'that unit';
    if (sel && typeof sel === 'object' && sel.pick) return 'a chosen ' + selPhrase(sel.pick);
    return ({
      myUnits: 'friendly unit', enemyUnits: 'enemy unit', allUnits: 'unit',
      hereMine: 'friendly unit there', hereEnemy: 'enemy unit there',
    })[sel] || 'unit';
  }

  // "+N Might for each enemy unit there" — the choice is over units standing at a
  // battlefield only, and resolves to the one the clause actually rewards.
  def('buffPerEnemyAt', (s, e, ctx) => {
    const cands = [];
    for (let i = 0; i < s.bf.length; i++)
      for (const u of RB.unitsAt(s, i, ctx.p)) cands.push([u, RB.unitsAt(s, i, RB.opponentOf(ctx.p)).length]);
    if (!cands.length) return;
    cands.sort((a, b) => b[1] - a[1] || RB.mightOf(s, b[0]) - RB.mightOf(s, a[0]));
    RB.obj(s, cands[0][0]).buffs += n_(e) * cands[0][1];
  });
  say('buffPerEnemyAt', e =>
    'Give a friendly unit at a battlefield +' + n_(e) + ' Might this turn for each enemy unit there.');

  // "Swap the Might of two units at the same battlefield." The pair taken is the one the
  // card is played for: your smallest against their biggest, wherever that gap is widest.
  def('swapMightThere', (s, e, ctx) => {
    let best = null;
    for (let i = 0; i < s.bf.length; i++) {
      const mine = RB.unitsAt(s, i, ctx.p);
      const theirs = RB.unitsAt(s, i, RB.opponentOf(ctx.p)).filter(u => RB.canChoose(s, ctx.p, u));
      for (const a of mine) for (const b of theirs) {
        const gap = RB.mightOf(s, b) - RB.mightOf(s, a);
        if (!best || gap > best.gap) best = { a: a, b: b, gap: gap };
      }
    }
    if (!best || best.gap <= 0) return;
    RB.announceChoice(s, ctx.p, best.b, ctx.source);
    const ma = RB.mightOf(s, best.a), mb = RB.mightOf(s, best.b);
    RB.obj(s, best.a).buffs += mb - ma;
    RB.obj(s, best.b).buffs += ma - mb;
    RB.log(s, 'swapMight', { a: best.a, b: best.b });
  });
  say('swapMightThere', () => 'Swap the Might of two units at the same battlefield this turn.');

  // Kill a friendly unit and move its Might onto another. Auto-resolution: give up the
  // smallest, hand the Might to the biggest of the rest.
  def('killAndTransferMight', (s, e, ctx) => {
    const mine = unitsOf(s, ctx.p);
    if (!mine.length) return;
    mine.sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b));
    const victim = mine[0];
    const m = RB.mightOf(s, victim);
    const rest = mine.slice(1).sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    RB.kill(s, victim);
    if (rest.length) RB.obj(s, rest[0]).buffs += m;
  });
  say('killAndTransferMight', () =>
    'Kill a friendly unit. If you do, give +Might equal to its Might to another friendly unit this turn.');

  // "Deal N to a unit at a battlefield" — a narrower pool than `enemyUnits`, which would
  // also offer units sitting in a base. Choosing is announced, so Deflect is paid and a
  // "when you choose" trigger fires, exactly as RB.autoPick would.
  def('damageThere', (s, e, ctx) => {
    const pool = [];
    for (let i = 0; i < s.bf.length; i++)
      for (const u of RB.unitsAt(s, i, RB.opponentOf(ctx.p)))
        if (RB.canChoose(s, ctx.p, u)) pool.push(u);
    if (!pool.length) return;
    pool.sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    RB.announceChoice(s, ctx.p, pool[0], ctx.source);
    RB.obj(s, pool[0]).damage += n_(e);
  });
  say('damageThere', e => 'Deal ' + n_(e) + ' to a unit at a battlefield.');

  // --- movement, zones --------------------------------------------------------
  // Recall: relocate a permanent to its base without it being a Move (§444) — no move
  // triggers, no exhaustion, damage and statuses preserved.
  def('recallAttacker', (s, e, ctx) => {
    const here = eventBf(s, ctx);
    if (here < 0) return;
    const foe = RB.opponentOf(ctx.p);
    const pool = RB.unitsAt(s, here, foe).filter(u => RB.obj(s, u).role === 'attacker');
    const take = (pool.length ? pool : RB.unitsAt(s, here, foe)).slice()
      .sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    if (!take.length) return;
    const iid = take[0];
    RB.removeFrom(s.bf[here].units, iid);
    delete RB.obj(s, iid).role;
    s.players[RB.obj(s, iid).controller].base.push(iid);
    RB.log(s, 'recall', { p: ctx.p, iid: iid, bf: here }, 'unit.move');
  });
  say('recallAttacker', () => 'Move an attacking unit to its base.');

  def('readyLegend', (s, e, ctx) => {
    const l = s.players[ctx.p].legend;
    if (l) RB.obj(s, l).exhausted = false;
  });
  say('readyLegend', () => 'Ready your legend.');

  def('drawPerOtherBattlefield', (s, e, ctx) => {
    const here = sourceBf(s, ctx);
    let k = 0;
    for (let i = 0; i < s.bf.length; i++) if (i !== here && s.bf[i].controller === ctx.p) k++;
    for (let i = 0; i < k * n_(e); i++) RB.draw(s, ctx.p);
  });
  say('drawPerOtherBattlefield', e => 'Draw ' + n_(e) + ' for each other battlefield you control.');

  // "Reveal the top card of your Main Deck. If it's a spell, put it in your hand. Otherwise,
  // recycle it." Revealing leaves the card where it is (§424); what follows moves it.
  def('revealTop', (s, e, ctx) => {
    const P = s.players[ctx.p];
    if (!P.deck.length) return;
    const iid = P.deck[0];
    const card = RB.cardOf(s, iid);
    RB.log(s, 'reveal', { p: ctx.p, iid: iid, card: card.id });
    P.deck.shift();
    if (card.type === 'Spell') { P.hand.push(iid); RB.log(s, 'draw', { p: ctx.p, iid: iid }, 'card.draw'); }
    else P.deck.push(iid);
  });
  say('revealTop', () => "Reveal the top card of your Main Deck. If it's a spell, put it in " +
    'your hand. Otherwise, recycle it.');

  def('recycleFromTrash', (s, e, ctx) => {
    const P = s.players[ctx.p];
    for (let i = 0; i < n_(e) && P.trash.length; i++) P.deck.push(P.trash.pop());
  });
  say('recycleFromTrash', e => 'Recycle ' + n_(e) + ' cards from your trash.');

  // Play a card out of your trash. The core's `playFromZone` does not filter on Power cost
  // and cannot recycle the card afterwards, and both are printed here: "no more than [3]
  // and no more than [A]" is a two-part bound, and Fizz recycles the spell rather than
  // leaving it in the trash to be replayed every turn.
  def('playFromTrash', (s, e, ctx) => {
    const P = s.players[ctx.p];
    const pool = P.trash.filter(iid => {
      const c = RB.cardOf(s, iid);
      if (e.type && c.type !== e.type) return false;
      if (e.maxEnergy != null && (c.energy || 0) > e.maxEnergy) return false;
      if (e.maxPower != null && (c.power || 0) > e.maxPower) return false;
      return true;
    });
    if (!pool.length) return;
    pool.sort((a, b) => (RB.cardOf(s, b).energy || 0) - (RB.cardOf(s, a).energy || 0));
    const iid = pool[0];
    RB.removeFrom(P.trash, iid);
    if (!e.ignoreCost) {
      const cost = RB.costOf(s, iid);
      if (e.ignoreEnergy) cost.energy = 0;
      const plan = RB.planPayment(s, ctx.p, cost);
      if (!plan) { P.trash.push(iid); return; }
      RB.pay(s, ctx.p, plan);
    }
    RB.log(s, 'play', { p: ctx.p, iid: iid, card: RB.cardOf(s, iid).id, from: 'trash' }, 'card.play');
    RB.resolveCard(s, { iid: iid, controller: ctx.p, to: e.to || 'base', kind: 'card' });
    // A spell resolves straight to the trash; recycling it is the printed clause that stops
    // the same spell being replayed from there every turn.
    if (e.recycleAfter && RB.removeFrom(P.trash, iid)) P.deck.push(iid);
  });
  say('playFromTrash', e => 'Play a ' + (e.type ? e.type.toLowerCase() : 'card') +
    ' from your trash' +
    (e.maxEnergy != null ? ' with Energy cost no more than ' + e.maxEnergy : '') +
    (e.maxPower != null ? ' and no more than ' + e.maxPower + ' Power' : '') +
    (e.ignoreCost ? ', ignoring its cost' : e.ignoreEnergy ? ', ignoring its Energy cost' : '') + '.' +
    (e.recycleAfter ? ' Recycle that card after you play it.' : ''));

  // --- the chain ---------------------------------------------------------------
  // Counters read the chain's top, which during this card's resolution is the item it was
  // played in response to (the chain is LIFO and this card has already been popped).
  //
  // KNOWN LIMIT: an activated ability's chain item records no targets — only a card that
  // declares `chooses` does — so a `chose` test can only ever match a spell. The printed
  // "spell or ability" is therefore narrower in play than on the card, and the engine, not
  // the data, is what decides that.
  def('counterSpell', (s, e, ctx) => {
    const item = RB.chainTop(s);
    if (!item || item.kind !== 'card') return;
    if (RB.card(item.cardId).type !== 'Spell') return;
    if (e.enemy && item.controller === ctx.p) return;
    if (e.chose === 'mine') {
      const mine = (item.targets || []).filter(i => s.objects[i] && RB.obj(s, i).controller === ctx.p);
      if (!mine.length) return;
    }
    const energy = item.energy || 0;
    RB.ops.counter(s, {}, ctx);
    if (e.then) RB.runEffects(s, e.then, Object.assign({}, ctx, { counteredEnergy: energy }));
  });
  say('counterSpell', e => 'Counter ' + (e.enemy ? 'an enemy' : 'a') + ' spell' +
    (e.chose === 'mine' ? ' that chooses a friendly unit or gear' : '') + '.' +
    (e.then ? ' ' + upper(join(e.then)) : ''));

  def('ransomSpell', (s, e, ctx) => {
    const item = RB.chainTop(s);
    if (!item || item.kind !== 'card') return;
    if (RB.card(item.cardId).type !== 'Spell') return;
    RB.ops.ransom(s, { energy: e.energy || 0, power: e.power || 0 }, ctx);
  });
  say('ransomSpell', e => 'Counter a spell unless its controller pays ' + (e.energy || 0) + ' Energy.');

  // --- a cost layer -------------------------------------------------------------
  // "While I'm in combat, friendly spells cost [1][A] less to a minimum of [1], and enemy
  // spells cost [1][A] more." Registered into the core's modifier list rather than wrapping
  // RB.totalCost, and driven by the `spellCost` static so the clause lives in the card data.
  //
  // DEVIATION: the extra [A] is added to the spell's own domain list rather than to "any
  // domain", because a cost carries ONE domain list for all of its Power. Universal Power
  // still pays it; an off-domain rune cannot.
  RB.defineCostModifier(function (s, p, iid, cost) {
    if (!s.showdown || !s.showdown.combat) return;
    if (RB.card(RB.obj(s, iid).cardId).type !== 'Spell') return;
    for (const src of s.bf[s.showdown.bf].units) {
      for (const st of ((RB.cardOf(s, src).abilities || {}).statics) || []) {
        if (!st.spellCost) continue;
        const shift = RB.obj(s, src).controller === p ? st.spellCost.friendly : st.spellCost.enemy;
        if (!shift) continue;
        cost.energy += shift.energy || 0;
        cost.power += shift.power || 0;
        if (shift.minEnergy != null && cost.energy < shift.minEnergy) cost.energy = shift.minEnergy;
        if (cost.power < 0) cost.power = 0;
      }
    }
  });

  // --- install: describers, and the two wrappers the core still needs -----------
  let installed = false;
  function ready() {
    return !!(RB.defineDescriber && RB.cardText && RB.score && RB.recycleRune);
  }
  function install() {
    if (installed || !ready()) return;
    installed = true;
    for (const [name, fn] of SAY) RB.defineDescriber(name, fn);

    // WRAPPER 1 of 2. There is no event for a rune being recycled, and sfd-203 triggers on
    // exactly that. Raised into this pack's own table (see note 3), never into RB.runTriggers.
    const baseRecycleRune = RB.recycleRune;
    RB.recycleRune = function (s, p, iid) {
      const r = baseRecycleRune(s, p, iid);
      fire(s, 'runeRecycle', { p: p, iid: iid });
      return r;
    };

    // WRAPPER 2 of 2. A battlefield that locks scoring (sfd-209). Blocking the call blocks
    // the point and the Conquer/Hold triggers with it, which is the rule: the scoring never
    // happens, so there is nothing for them to fire on. Scoring has no hook table.
    const baseScore = RB.score;
    RB.score = function (s, p, i, how) {
      const ab = RB.card(s.bf[i].cardId).abilities;
      const lock = ab && ab.statics && ab.statics.find(x => x.scoreLockUntilTurn);
      if (lock && turnsTaken(s, p) < lock.scoreLockUntilTurn) {
        RB.log(s, 'scoreDenied', { p: p, bf: i, how: how });
        return;
      }
      return baseScore(s, p, i, how);
    };

    // The describer is the auditor: a clause with no prose is a clause that can go missing.
    // The core describer has no words for this pack's set-local trigger or for three static
    // keys, so those lines are added here and everything else is delegated.
    const baseCardText = RB.cardText;
    RB.cardText = function (id) {
      let base = baseCardText(id);
      const ab = RB.card(id).abilities;
      const extra = [];
      if (ab) {
        for (const st of ab.statics || []) {
          const mine = staticProse(st);
          if (!mine) continue;
          const core = RB.staticText(st);
          if (core && base.includes(core)) base = base.replace(core, mine);
          else extra.push(mine);
        }
        for (const t of ab.sfdTriggers || [])
          extra.push((SFD_WORDS[t.on] || t.on) + ', ' + lower(join(t.effects)));
        // The core prints an additional cost's PRICE but not what paying it does, and for
        // [Repeat] that is the whole keyword — so the instructions it adds are said here.
        for (const x of ab.additionalCosts || [])
          if (x.effects && x.effects.length)
            extra.push('If you paid it, ' + lower(join(x.effects)));
      }
      return [base].concat(extra).filter(Boolean).join('\n');
    };
  }
  // Prose for the static shapes the core describer cannot say, and better prose for the
  // one it says badly (a self-only modifier written as scope 'all' plus a predicate).
  function staticProse(st) {
    if (st.untargetableByEnemies) return "I can't be chosen by enemy spells and abilities.";
    if (st.scoreLockUntilTurn)
      return "Players can't score here until their " +
        (ORDINAL[st.scoreLockUntilTurn] || st.scoreLockUntilTurn) + ' turn.';
    if (st.spellCost) {
      const f = st.spellCost.friendly || {}, x = st.spellCost.enemy || {};
      return "While I'm in combat, friendly spells cost " + Math.abs(f.energy || 0) + ' Energy and ' +
        Math.abs(f.power || 0) + ' Power less to a minimum of ' + (f.minEnergy || 0) +
        ' Energy, and enemy spells cost ' + (x.energy || 0) + ' Energy and ' + (x.power || 0) +
        ' Power more.';
    }
    if (st.when === 'attacking' && st.might != null)
      return 'I have +' + st.might + " Might while I'm an attacker.";
    if (st.when && st.when.kind === 'sandSoldier' && st.grant)
      return 'Your Sand Soldiers have ' + st.grant + '.';
    return null;
  }
  const SFD_WORDS = { runeRecycle: 'When you recycle a rune' };
  const ORDINAL = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };

  RB.sfdInstall = install;
  if (RB.registerCards) {
    const baseRegisterCards = RB.registerCards;
    RB.registerCards = function () { install(); return baseRegisterCards.apply(this, arguments); };
  }
  install();                                        // in case this file is ever loaded last
})(window.RB = window.RB || {});
