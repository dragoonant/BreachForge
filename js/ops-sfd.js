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
// 3. THREE WRAPPERS ARE LEFT (D-8). The core now raises `deathknell`, `died`,
//    `leftBoard`, `moved`, `defend`, `becameMighty`, `becameReady` and `chosen`, and reads
//    `untargetableByEnemies` in RB.canChoose — so the wrappers this pack had over RB.kill,
//    RB.apply and RB.autoPick are gone, and their cards ride the core events. What is left:
//      * RB.recycleRune — there is no event for a rune being recycled, and sfd-203's first
//        clause triggers on exactly that. Raised into this pack's own `sfdTriggers` table,
//        read only off cards whose id starts with `sfd-`, so a second pack's wrapper can
//        neither fire this data nor be fired by it.
//      * RB.score — "Players can't score here until their third turn" (sfd-209) is a
//        restriction on scoring, and scoring has no hook table.
//      * RB.legalActions — "Units can't be played here" (sfd-216) has to bar every path
//        that offers a unit play to a battlefield, and they do not share a hook table.
//    RB.cardText is extended too, but only as a describer: it adds prose for the static
//    keys and set-local triggers the core describer does not know, and delegates the rest.
//
// 4. EVERY PICKER ENDS AT RB.offerChoice. A pack builds its own pool and orders it — that
//    ordering is the card's policy — and hands it to the one door, which decides how many
//    and whether to ask. Slicing a pool here instead would skip the human seat's question,
//    the Deflect toll and the `chosen` trigger — and sfd-195 Blade Dancer IS that trigger.
//
// 5. ONE STATIC PREDICATE IS ADDED HERE, through RB.defineStaticWhen and never by wrapping
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
  function fireOn(s, event, data, iid) {
    const ab = abOf(s, iid);
    if (!ab || !ab.sfdTriggers || !isSfd(s, iid)) return;
    for (const t of ab.sfdTriggers) {
      if (t.on !== event) continue;
      const prev = s.via;
      s.via = { iid: iid };
      RB.runEffects(s, t.effects, { p: RB.obj(s, iid).owner, source: iid, event: data });
      s.via = prev;
    }
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
    handAtMost: (s, ctx, e) => s.players[ctx.p].hand.length <= n_(e),
    // "in combat": a combat showdown is open, which is the window combat kills happen in.
    // "When I die IN combat": a combat is open AND I died at its battlefield. A combat
    // elsewhere is not mine — sfd-148 Draven, killed in his base during a fight at the
    // other battlefield, handed the opponent a point.
    inCombat: (s, ctx) => !!s.showdown && !!s.showdown.combat &&
      !!ctx.event && ctx.event.bf === s.showdown.bf,
    // "an OPEN battlefield" is one that was occupied and UNCONTROLLED before you took it.
    // The conquer event does not carry the previous controller, so sfd.noteOpen records it
    // at the showdown that led here — a trigger, not a wrapper.
    conqueredOpen: (s, ctx) => {
      const bf = eventBf(s, ctx);
      return bf >= 0 && s.bf[bf].sfdWasOpen === true;
    },
  };
  const COND_TEXT = {
    here: 'it happened here', isMe: 'it is me', iChose: 'you were the one choosing',
    diedAlone: 'I died alone', wasMighty: 'I was Mighty', wonCombat: 'you won it',
    unattached: 'I am unattached', mightyHere: 'you had one or more Mighty units here',
    enemyUnitDied: 'it was an enemy unit', paidExtra: 'you paid the additional cost',
    trashAtLeast: 'your trash holds enough cards',
    handAtMost: 'you have few enough cards in hand', inCombat: 'it was in combat',
    conqueredOpen: 'the battlefield was open',
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
      // The question comes from this op's own describer (RB.promptFromEffect), not from
      // the cost: built from the cost alone this read "Pay exhaust me?" and never once
      // said what the player was buying.
      prompt: RB.promptFromEffect(s, e, ctx),
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
      const u = RB.offerChoice(s, hereCandidates(s, ctx), 1, ctx, 'bounceHere',
        'Return which unit to hand?')[0];
      if (!u) return;
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
    if (e.bounceHere && !hereCandidates(s, ctx).length) return false;
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
  // The pool, ordered cheapest-first. Kept separate from the choice because `canPay` asks
  // only whether one EXISTS, and a legality probe must not announce a choice.
  function hereCandidates(s, ctx) {
    const here = eventBf(s, ctx);
    if (here < 0) return [];
    return RB.unitsAt(s, here, ctx.p).slice()
      .sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b));
  }

  // --- gear ------------------------------------------------------------------
  // Equip / Quick-Draw. Attaching is how this engine models Equipment: RB.mightOf already
  // adds an attached gear's printed Might Bonus, so the bonus itself needs no data.
  def('attach', (s, e, ctx) => {
    const gear = ctx.source;
    // Weaponmaster runs an Equip ability's own effects on behalf of the unit it is
    // attaching to, so the host is already chosen; that is also the one case in which an
    // already-attached Equipment is moved ("even if it's already attached").
    if (ctx.sfdHost) {
      if (!s.objects[ctx.sfdHost] || RB.locationOf(s, ctx.sfdHost).kind === 'nowhere') return;
      detach(s, gear);
      attachTo(s, gear, ctx.sfdHost, ctx.p);
      return;
    }
    if (RB.obj(s, gear).attachedTo) return;          // already placed by the play destination
    const hosts = unitsOf(s, ctx.p).sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    const host = RB.offerChoice(s, hosts, 1, ctx, 'equipHost', 'Attach to which unit?')[0];
    if (!host) return;
    attachTo(s, gear, host, ctx.p);
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
    const g = pickGear(s, e, ctx, 'killGear');
    if (g === null) return;
    detach(s, g);
    RB.kill(s, g);
  });
  say('killGear', () => 'Kill a gear.');

  def('bounceGear', (s, e, ctx) => {
    const g = pickGear(s, e, ctx, 'bounceGear');
    if (g === null) return;
    detach(s, g);
    toHand(s, g);
  });
  say('bounceGear', () => "Return a gear to its owner's hand.");

  // "A gear" is any gear on the board, yours included — returning your own Equipment to
  // hand is a real play. The pool is every gear; the ORDER is the auto-resolution policy:
  // the opponent's biggest first, then your own smallest. It used to drop your own gear
  // whenever the opponent had any, and `side: 'enemy'` dropped it outright.
  function pickGear(s, e, ctx, tag) {
    const all = allGear(s);
    const theirs = all.filter(i => RB.obj(s, i).controller !== ctx.p)
      .sort((a, b) => bonusOf(s, b) - bonusOf(s, a));
    const mine = all.filter(i => RB.obj(s, i).controller === ctx.p)
      .sort((a, b) => bonusOf(s, a) - bonusOf(s, b));
    const got = RB.offerChoice(s, theirs.concat(mine), 1, ctx, tag || 'gear', 'Which gear?');
    return got.length ? got[0] : null;
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
    // RB.leaveBoard is the one door: it lifts the card out of its zone, clears every
    // temporary modification (§104) the way RB.kill does, and raises `leftBoard` — which
    // is what a delayed ability keyed to "until I leave the board" is waiting for. Doing
    // the lift by hand here left such a promise open when a card was bounced instead of
    // killed.
    if (!RB.leaveBoard(s, iid)) return;
    if (!o.token) s.players[o.owner].hand.push(iid);
    RB.log(s, 'bounce', { iid: iid, p: o.controller }, 'unit.move');
  }

  // [Weaponmaster] — "choose a card you control with the Equipment tag; pay the cost of its
  // Equip ability, reduced by [A], to attach it to this unit" — "even if it's already
  // attached" (sfd-116), so an attached Equipment is a legal choice and is taken off its
  // host. The reduction applies to that ability's own printed cost, and the WHOLE cost is
  // paid: an Equip gated on something beyond Energy and Power (sfd-150's "Recycle 2 cards
  // from your trash") is a candidate only when that part is payable too, and its own
  // effects are what pay it. Only an Equipment whose cost the player can pay is offered —
  // and nothing is taken off its old host unless it is attached to the new one.
  def('weaponmaster', (s, e, ctx) => {
    const reduced = gear => {
      const eq = equipOf(s, gear) || {};
      return { energy: eq.energy || 0, power: Math.max(0, (eq.power || 0) - 1),
        domains: eq.domains || RB.DOMAINS.slice(), each: false };
    };
    const payable = gear => {
      const eq = equipOf(s, gear);
      if (eq && eq.when && !RB.testCondition(s, eq.when, { p: ctx.p, source: gear })) return false;
      return RB.canPay(s, ctx.p, reduced(gear));
    };
    const mine = allGear(s).filter(i => RB.obj(s, i).controller === ctx.p &&
      RB.obj(s, i).attachedTo !== ctx.source &&
      (RB.cardOf(s, i).tags || []).includes('Equipment') && payable(i));
    mine.sort((a, b) => bonusOf(s, b) - bonusOf(s, a));
    const gear = RB.offerChoice(s, mine, 1, ctx, 'weaponmaster', 'Attach which Equipment?')[0];
    if (!gear) return;
    const plan = RB.planPayment(s, ctx.p, reduced(gear));
    if (!plan) return;
    RB.pay(s, ctx.p, plan);
    const eq = equipOf(s, gear);
    // This pack's Equip abilities attach through sfd.attach, which honours the named host;
    // their other effects (the recycle) run as they would on activation. Another pack's
    // Equip op cannot be told the host, so it is attached directly.
    if (eq && usesSfdAttach(eq.effects)) {
      RB.runEffects(s, eq.effects, Object.assign(plainCtx(ctx), { source: gear, sfdHost: ctx.source }));
      return;
    }
    detach(s, gear);
    attachTo(s, gear, ctx.source, ctx.p);
  });
  function equipOf(s, gear) {
    return ((abOf(s, gear) || {}).activated || []).find(a => a.keyword === 'Equip') || null;
  }
  function usesSfdAttach(fx) {
    return (fx || []).some(x => x.op === 'sfd.attach' || usesSfdAttach(x.effects));
  }
  say('weaponmaster', () => 'Attach an Equipment you control to me, paying the cost of its ' +
    'Equip ability reduced by 1 Power.');

  // "Move an enemy gear to your base. You control it until I leave the board. If it's an
  // Equipment, attach it to me." The loan is a delayed ability keyed to this unit leaving,
  // so it outlives the trigger that made it and survives the unit dying.
  def('stealGear', (s, e, ctx) => {
    const theirs = allGear(s).filter(i => RB.obj(s, i).controller !== ctx.p)
      .sort((a, b) => bonusOf(s, b) - bonusOf(s, a));
    const gear = RB.offerChoice(s, theirs, 1, ctx, 'stealGear', 'Take which gear?')[0];
    if (!gear) return;
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
    const made = (ctx.made || []).filter(i => s.objects[i] && RB.obj(s, i).exhausted);
    for (const iid of RB.offerChoice(s, made, n_(e), ctx, 'readyMade', 'Ready which of them?'))
      RB.obj(s, iid).exhausted = false;
  });
  say('readyMade', e => 'Ready up to ' + (COUNTWORD[n_(e)] || n_(e)) + ' of them.');

  function mintToken(s, e, ctx0) {
    const ctx = (e.forOwner && ctx0.owner != null) ? Object.assign({}, ctx0, { p: ctx0.owner }) : ctx0;
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
      RB.ops.may(s, { op: 'may', effects: [{ op: 'sfd.weaponmaster' }] }, { p: ctx.p, source: iid });
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
    for (const iid of pickFor(s, e, ctx)) RB.obj(s, iid).buffs += n_(e);
  });
  say('giveMight', e => 'Give ' + selPhrase(e.target, e.other) + ' +' + n_(e) + ' Might this turn.');

  // A chosen target. `{ pick, prefer }` is "a unit" read literally: the POOL is every unit
  // the selector names, of either side, and `prefer` only ORDERS it — the side the clause
  // helps first, biggest-first, then the other side smallest-first — because that order is
  // the auto-resolution policy and the pool is what the card may legally choose.
  // `another` is "another unit": not one this same card has already chosen.
  const pickFor = (s, e, ctx) => {
    const sel = e.target;
    if (!(sel && typeof sel === 'object' && sel.prefer)) {
      const got = RB.select(s, sel, ctx).filter(i => !e.other || i !== ctx.source);
      ctx.sfdPicked = (ctx.sfdPicked || []).concat(got);
      return got;
    }
    let pool = RB.select(s, sel.pick, ctx).filter(i => RB.cardOf(s, i).type === 'Unit');
    if (e.other) pool = pool.filter(i => i !== ctx.source);
    if (sel.another) pool = pool.filter(i => !(ctx.sfdPicked || []).includes(i));
    const got = RB.offerChoice(s, preferOrder(s, pool, ctx, sel.prefer), sel.n || 1, ctx,
      String(sel.pick), sel.prompt);
    ctx.sfdPicked = (ctx.sfdPicked || []).concat(got);
    return got;
  };
  // The side a clause is FOR, biggest first; then the other side, smallest first.
  function preferOrder(s, pool, ctx, prefer) {
    const want = prefer === 'enemy' ? RB.opponentOf(ctx.p) : ctx.p;
    const big = (a, b) => RB.mightOf(s, b) - RB.mightOf(s, a);
    return pool.filter(i => RB.obj(s, i).controller === want).sort(big)
      .concat(pool.filter(i => RB.obj(s, i).controller !== want).sort((a, b) => big(b, a)));
  }

  def('weaken', (s, e, ctx) => {
    for (const iid of pickFor(s, e, ctx)) RB.obj(s, iid).buffs -= n_(e);
  });
  say('weaken', e => 'Give ' + selPhrase(e.target, e.other) + ' -' + n_(e) + ' Might this turn.');

  function selPhrase(sel, other) {
    if (!sel || sel === 'self') return 'me';
    if (sel === 'eventUnit') return 'that unit';
    if (sel && typeof sel === 'object' && sel.pick)
      return (sel.another ? 'another chosen ' : 'a chosen ') + selPhrase(sel.pick);
    if (sel === 'myUnits' && other) return 'your other units';
    return ({
      myUnits: 'friendly unit', enemyUnits: 'enemy unit', allUnits: 'unit',
      hereMine: 'friendly unit there', hereEnemy: 'enemy unit there',
    })[sel] || 'unit';
  }

  // "Give a unit [Assault 2] this turn." A granted keyword may carry a VALUE: `o.granted`
  // holds either a bare name or { name, value }, RB.keywordValue SUMS every instance, and
  // the Ending Cleanup empties the channel — which is the printed "this turn".
  //
  // The core `grant` op stores whatever it is handed, so the mechanic needs no new channel;
  // what it cannot do is SAY a valued grant — its describer reads `e.keyword` back as text
  // and prints a value-carrying one as an object. The describer is the auditor, so the
  // printed phrasing lives here instead, the way sfd.giveMight already does for `buff`.
  def('grantKeyword', (s, e, ctx) => {
    for (const iid of pickFor(s, e, ctx)) {
      RB.obj(s, iid).granted.push(e.value == null ? e.keyword : { name: e.keyword, value: e.value });
      RB.log(s, 'grant', { iid: iid, keyword: e.keyword, value: e.value == null ? null : e.value });
    }
  });
  say('grantKeyword', e => 'Give ' + selPhrase(e.target, e.other) + ' ' + e.keyword +
    (e.value == null ? '' : ' ' + e.value) + ' this turn.');

  // "+N Might for each enemy unit there" — the choice is over units standing at a
  // battlefield only, and resolves to the one the clause actually rewards.
  def('buffPerEnemyAt', (s, e, ctx) => {
    const cands = [];
    for (let i = 0; i < s.bf.length; i++)
      for (const u of RB.unitsAt(s, i, ctx.p)) cands.push([u, RB.unitsAt(s, i, RB.opponentOf(ctx.p)).length]);
    cands.sort((a, b) => b[1] - a[1] || RB.mightOf(s, b[0]) - RB.mightOf(s, a[0]));
    const pool = cands.map(c => c[0]);
    const got = RB.offerChoice(s, pool, 1, ctx, 'buffPerEnemyAt', 'Give the Might to which unit?');
    if (!got.length) return;
    const many = cands.find(c => c[0] === got[0])[1];
    RB.obj(s, got[0]).buffs += n_(e) * many;
  });
  say('buffPerEnemyAt', e =>
    'Give a friendly unit at a battlefield +' + n_(e) + ' Might this turn for each enemy unit there.');

  // "Swap the Might of two units at the same battlefield." Any two: yours and theirs, both
  // theirs or both yours — the only constraint printed is that they stand together. Each
  // half is its own question. The ORDER is the auto-resolution policy: the pair worth most
  // to the chooser (your smallest against their biggest) comes first.
  def('swapMightThere', (s, e, ctx) => {
    const worth = (a, b) => {                 // what swapping a and b gains the chooser
      const ma = RB.mightOf(s, a), mb = RB.mightOf(s, b);
      const sgn = i => (RB.obj(s, i).controller === ctx.p ? 1 : -1);
      return sgn(a) * (mb - ma) + sgn(b) * (ma - mb);
    };
    const choosable = i => RB.canChoose(s, ctx.p, i);
    const firsts = [];
    for (let i = 0; i < s.bf.length; i++) {
      const here = s.bf[i].units.filter(choosable);
      if (here.length < 2) continue;
      for (const u of here)
        firsts.push([u, Math.max(...here.filter(v => v !== u).map(v => worth(u, v)))]);
    }
    firsts.sort((a, b) => b[1] - a[1] ||
      (RB.obj(s, a[0]).controller === ctx.p) - (RB.obj(s, b[0]).controller === ctx.p) ||
      RB.mightOf(s, b[0]) - RB.mightOf(s, a[0]));
    const one = RB.offerChoice(s, firsts.map(f => f[0]), 1, ctx, 'swapThem', 'Swap which unit?')[0];
    if (!one) return;
    const at = RB.locationOf(s, one).bf;
    const partners = s.bf[at].units.filter(v => v !== one)
      .sort((a, b) => worth(one, b) - worth(one, a));
    const two = RB.offerChoice(s, partners, 1, ctx, 'swapUs', 'Swap its Might with which unit?')[0];
    if (!two) return;
    const ma = RB.mightOf(s, one), mb = RB.mightOf(s, two);
    RB.obj(s, one).buffs += mb - ma;
    RB.obj(s, two).buffs += ma - mb;
    RB.log(s, 'swapMight', { a: one, b: two });
  });
  say('swapMightThere', () => 'Swap the Might of two units at the same battlefield this turn.');

  // Kill a friendly unit and move its Might onto another. Auto-resolution: give up the
  // smallest, hand the Might to the biggest of the rest.
  def('killAndTransferMight', (s, e, ctx) => {
    const mine = unitsOf(s, ctx.p).sort((a, b) => RB.mightOf(s, a) - RB.mightOf(s, b));
    const victim = RB.offerChoice(s, mine, 1, ctx, 'sacrifice', 'Kill which of your units?')[0];
    if (!victim) return;
    const m = RB.mightOf(s, victim);
    const rest = mine.filter(i => i !== victim).sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    RB.kill(s, victim);
    const heir = RB.offerChoice(s, rest, 1, ctx, 'inherit', 'Give its Might to which unit?')[0];
    if (heir) RB.obj(s, heir).buffs += m;
  });
  say('killAndTransferMight', () =>
    'Kill a friendly unit. If you do, give +Might equal to its Might to another friendly unit this turn.');

  // "Deal N to a unit at a battlefield" — a narrower pool than `enemyUnits`, which would
  // also offer units sitting in a base. Choosing is announced, so Deflect is paid and a
  // "when you choose" trigger fires, exactly as RB.autoPick would. The damage itself goes
  // through RB.dealDamage, the one door: a direct write to `obj.damage` would step over
  // "prevent all spell and ability damage this turn" and "spells deal 1 bonus damage to
  // units here", and the card reading those plays wrong without ever looking broken.
  // "A unit" is either side's: the enemy's come first only because that is the order the
  // engine answers in for a seat nobody is asking.
  def('damageThere', (s, e, ctx) => {
    const pool = [];
    for (let i = 0; i < s.bf.length; i++) for (const u of s.bf[i].units) pool.push(u);
    const got = RB.offerChoice(s, preferOrder(s, pool, ctx, 'enemy'), 1, ctx, 'damageThere',
      'Deal the damage to which unit?');
    for (const iid of got) RB.dealDamage(s, iid, n_(e), ctx);
  });
  say('damageThere', e => 'Deal ' + n_(e) + ' to a unit at a battlefield.');

  // --- movement, zones --------------------------------------------------------
  // "Move an attacking unit to its base." A MOVE (§144), not a Recall: it raises `moved`,
  // so "when I move" triggers fire, and a unit that can't move to base is not moved. The
  // pool is the attackers and nothing else — with none, there is nothing to move. (This
  // was a Recall with no `moved` event, and it fell back to any enemy unit.)
  def('moveAttacker', (s, e, ctx) => {
    const pool = RB.allUnits(s).filter(u => RB.obj(s, u).role === 'attacker' &&
      RB.locationOf(s, u).kind === 'bf' && RB.canMoveToBase(s, u))
      .sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    const iid = RB.offerChoice(s, pool, 1, ctx, 'moveAttacker', 'Move which attacker to its base?')[0];
    if (!iid) return;
    const o = RB.obj(s, iid), from = RB.locationOf(s, iid);
    RB.removeFrom(s.bf[from.bf].units, iid);
    delete o.role;
    s.players[o.controller].base.push(iid);
    RB.log(s, 'move', { p: o.controller, iid: iid, to: 'base' }, 'unit.move');
    RB.runTriggers(s, 'moved', { p: o.controller, iid: iid, bf: undefined, fromBf: from.bf });
  });
  say('moveAttacker', () => 'Move an attacking unit to its base.');

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
    fireOn(s, 'revealed', { p: ctx.p, iid: iid }, iid);
    P.deck.shift();
    if (card.type === 'Spell') { P.hand.push(iid); RB.log(s, 'draw', { p: ctx.p, iid: iid }, 'card.draw'); }
    else P.deck.push(iid);
  });
  say('revealTop', () => "Reveal the top card of your Main Deck. If it's a spell, put it in " +
    'your hand. Otherwise, recycle it.');

  // Which cards go is the player's choice (cheapest first when nobody is asked), and it is
  // all or nothing: "Recycle 2" is a cost on sfd-150, and a cost is paid in full or not at
  // all. It used to pop the two most recent cards, whichever they were.
  def('recycleFromTrash', (s, e, ctx) => {
    const P = s.players[ctx.p];
    if (P.trash.length < n_(e)) return;
    const pool = P.trash.slice().sort((a, b) =>
      (RB.cardOf(s, a).energy || 0) - (RB.cardOf(s, b).energy || 0));
    const took = RB.offerChoice(s, pool, n_(e), ctx, 'recycleFromTrash',
      'Recycle which ' + n_(e) + ' cards from your trash?', { quiet: true });
    for (const iid of took) { RB.removeFrom(P.trash, iid); P.deck.push(iid); }
    RB.log(s, 'recycle', { p: ctx.p, iids: took.slice() });
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
      // "Ignoring its Energy cost (you must still pay its Power cost)": a spell whose Power
      // the player cannot pay is not one they can play, so it is not a candidate. Offered
      // anyway, the engine's first pick could be the unpayable one and nothing happened
      // while a payable spell sat beside it.
      return e.ignoreCost || RB.canPay(s, ctx.p, trashCost(s, iid, e));
    });
    pool.sort((a, b) => (RB.cardOf(s, b).energy || 0) - (RB.cardOf(s, a).energy || 0));
    const iid = RB.offerChoice(s, pool, 1, ctx, 'fromTrash', 'Play which card from your trash?')[0];
    if (!iid) return;
    RB.removeFrom(P.trash, iid);
    if (!e.ignoreCost) {
      const plan = RB.planPayment(s, ctx.p, trashCost(s, iid, e));
      if (!plan) { P.trash.push(iid); return; }
      RB.pay(s, ctx.p, plan);
    }
    RB.log(s, 'play', { p: ctx.p, iid: iid, card: RB.cardOf(s, iid).id, from: 'trash' }, 'card.play');
    RB.playCard(s, { iid: iid, controller: ctx.p, to: e.to || 'base', kind: 'card', immediate: true });
    // A spell resolves straight to the trash; recycling it is the printed clause that stops
    // the same spell being replayed from there every turn.
    if (e.recycleAfter && RB.removeFrom(P.trash, iid)) P.deck.push(iid);
  });
  function trashCost(s, iid, e) {
    const cost = RB.costOf(s, iid);
    if (e.ignoreEnergy) cost.energy = 0;
    return cost;
  }
  say('playFromTrash', e => 'Play a ' + (e.type ? e.type.toLowerCase() : 'card') +
    ' from your trash' +
    (e.maxEnergy != null ? ' with Energy cost no more than ' + e.maxEnergy : '') +
    (e.maxPower != null ? ' and no more than ' + e.maxPower + ' Power' : '') +
    (e.ignoreCost ? ', ignoring its cost' : e.ignoreEnergy ? ', ignoring its Energy cost' : '') + '.' +
    (e.recycleAfter ? ' Recycle that card after you play it.' : ''));

  // --- the chain ---------------------------------------------------------------
  // Counters read the chain's top, which during this card's resolution is the item it was
  // played in response to (the chain is LIFO and this card has already been popped). An
  // ability's item now carries `cardId` and its declared choices, so "spell OR ABILITY"
  // is sayable: `spellOnly` is what narrows a card that names only spells.
  def('counterSpell', (s, e, ctx) => {
    const item = RB.chainTop(s);
    if (!item || !item.cardId) return;
    if (e.spellOnly && RB.card(item.cardId).type !== 'Spell') return;
    if (e.enemy && item.controller === ctx.p) return;
    if (e.chose === 'mine') {
      const mine = (item.targets || []).filter(i => s.objects[i] && RB.obj(s, i).controller === ctx.p);
      if (!mine.length) return;
    }
    const energy = item.energy || 0;
    RB.ops.counter(s, {}, ctx);
    if (e.then) RB.runEffects(s, e.then, Object.assign({}, ctx, { counteredEnergy: energy }));
  });
  say('counterSpell', e => 'Counter ' + (e.enemy ? 'an enemy ' : 'a ') +
    (e.spellOnly ? 'spell' : 'spell or ability') +
    (e.chose === 'mine' ? ' that chooses a friendly unit or gear' : '') + '.' +
    (e.then ? ' ' + upper(join(e.then)) : ''));

  def('ransomSpell', (s, e, ctx) => {
    const item = RB.chainTop(s);
    if (!item || !item.cardId) return;
    if (RB.card(item.cardId).type !== 'Spell') return;
    RB.ops.ransom(s, { energy: e.energy || 0, power: e.power || 0 }, ctx);
  });
  say('ransomSpell', e => 'Counter a spell unless its controller pays ' + (e.energy || 0) + ' Energy.');

  // --- a cost layer -------------------------------------------------------------
  // "While I'm in combat, friendly spells cost [1][A] less to a minimum of [1], and enemy
  // spells cost [1][A] more." Registered into the core's modifier list rather than wrapping
  // RB.totalCost, and driven by the `spellCost` static so the clause lives in the card data.
  //
  // "[A]" is Power of ANY domain, and a cost carries ONE domain list for all of its Power.
  // For a spell with no Power of its own — most of them — that is exact: the list becomes
  // every domain. For a spell that already costs Power the extra [A] can only join that
  // spell's own domains (Universal Power still pays it, an off-domain rune cannot): that
  // remainder is a standing deviation until a cost can carry Power per domain list.
  // Changing the Power of a one-of-each cost clears `each`, as RB.totalCost does for an
  // extra that adds Power — left set, the solver reads the domain list and never the
  // count, so neither the surcharge nor the discount was applied to such a spell.
  RB.defineCostModifier(function (s, p, iid, cost) {
    if (!s.showdown || !s.showdown.combat) return;
    if (RB.card(RB.obj(s, iid).cardId).type !== 'Spell') return;
    for (const src of s.bf[s.showdown.bf].units) {
      for (const st of ((RB.cardOf(s, src).abilities || {}).statics) || []) {
        if (!st.spellCost) continue;
        const shift = RB.obj(s, src).controller === p ? st.spellCost.friendly : st.spellCost.enemy;
        if (!shift) continue;
        cost.energy += shift.energy || 0;
        if ((shift.power || 0) > 0 && cost.power <= 0) cost.domains = RB.DOMAINS.slice();
        const before = cost.power;
        cost.power += shift.power || 0;
        if (shift.minEnergy != null && cost.energy < shift.minEnergy) cost.energy = shift.minEnergy;
        if (cost.power < 0) cost.power = 0;
        if (cost.power !== before) cost.each = false;
      }
    }
  });

  // "Optional additional costs you pay cost [1] or [A] less" (sfd-149 Ezreal, a Chosen
  // Champion that sits in a public zone all game). The modifier layer is handed the chosen
  // EXTRAS as well as the finished total, which is what makes this sayable at all: the
  // discount is held to what the optional additional costs themselves added, so it never
  // reaches the printed cost, and `optional === false` is skipped because a mandatory cost
  // is the one that gates legality — discounting it would be a different card.
  //
  // D-2 (the player does not choose yet): the card offers [1] OR [A] and nothing can open a
  // question while a cost is being totalled, so the policy is the Power reduction — Power is
  // the scarcer currency, and a recycled rune is gone where an exhausted one comes back —
  // falling back to the Energy one when that is what leaves the play payable. An extra that
  // adds Power has already cleared `each` in RB.totalCost, so a reduced Power count is never
  // read as one-of-each-domain.
  RB.defineCostModifier(function (s, p, iid, cost, extras) {
    const d = discountOnExtras(s, p);
    if (!d) return;
    void iid;
    for (const x of extras || []) {
      if (x.optional === false) continue;
      const byEnergy = Math.min(d.energy || 0, x.energy || 0);
      const byPower = Math.min(d.orPower || 0, x.power || 0);
      if (!byEnergy && !byPower) continue;
      if (byPower && (!byEnergy || stillPayable(s, p, cost, 0, byPower))) cost.power -= byPower;
      else cost.energy -= byEnergy;
    }
  });
  // Every card this player controls is asked, because the clause is about the player and not
  // about where the card stands. A Chosen Champion waiting in the Champion Zone is not on
  // the board and is not asked.
  function discountOnExtras(s, p) {
    for (const src of RB.allUnits(s).concat(s.players.map(P => P.legend)).filter(Boolean)) {
      if (RB.obj(s, src).controller !== p) continue;
      for (const st of ((RB.cardOf(s, src).abilities || {}).statics) || [])
        if (st.optionalExtraDiscount) return st.optionalExtraDiscount;
    }
    return null;
  }
  function stillPayable(s, p, cost, offEnergy, offPower) {
    return RB.canPay(s, p, { energy: Math.max(0, cost.energy - offEnergy),
      power: Math.max(0, cost.power - offPower),
      domains: cost.domains.slice(), each: cost.each });
  }

  // --- wave two ---------------------------------------------------------------
  // The Buff game action, placed through the core's one channel: `o.counters` is both the
  // +1 Might and the resource a `spendBuff` cost spends, so a buff placed here pays for a
  // card that asks for one and is the same buff every other pack can read.
  //
  // What the core's `placeBuff` op cannot say is the CHOICE this card makes: buffing an
  // already-buffed unit does nothing, so a buffed unit is not a candidate at all, and the
  // pool is ordered biggest-first before it reaches the one door. Hence this op, which
  // places exactly what placeBuff places — never a Might modifier, which would be a buff
  // that grants Might nobody can spend.
  def('buff', (s, e, ctx) => {
    if (e.target === 'self') {
      const o = s.objects[ctx.source];
      if (o && !o.counters) { o.counters = 1; RB.log(s, 'buff', { p: ctx.p, iid: ctx.source }); }
      return;
    }
    const pool = unitsOf(s, ctx.p)
      .filter(i => !RB.obj(s, i).counters && (!e.other || i !== ctx.source))
      .sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    for (const iid of RB.offerChoice(s, pool, n_(e), ctx, 'buff', 'Buff which units?')) {
      RB.obj(s, iid).counters = 1;
      RB.log(s, 'buff', { p: ctx.p, iid: iid });
    }
  });
  say('buff', e => e.target === 'self' ? 'Buff me.'
    : 'Buff up to ' + (COUNTWORD[n_(e)] || n_(e)) + (e.other ? ' other' : '') + ' friendly units.');

  // "When a friendly unit is played this turn, buff it." A promise for the rest of the
  // turn: delayed abilities outlive their source, and the turn it was made in rides along
  // so it expires when the turn does — s.delayed is never swept.
  def('buffPlayedThisTurn', (s, e, ctx) => {
    s.delayed = s.delayed || [];
    s.delayed.push({ on: 'unitPlayed', p: ctx.p, source: ctx.source, once: false,
      watch: 'mine', effects: [{ op: 'sfd.buffEventUnit' }], data: { turn: s.turn } });
    RB.log(s, 'delayed', { p: ctx.p, on: 'unitPlayed' });
  });
  say('buffPlayedThisTurn', () => 'When a friendly unit is played this turn, buff it.');

  def('buffEventUnit', (s, e, ctx) => {
    const d = ctx.delayed || {};
    if (d.turn !== s.turn) {                        // the turn is over: the promise lapses
      for (const entry of (s.delayed || []).slice())
        if (entry.data === d) s.delayed.splice(s.delayed.indexOf(entry), 1);
      return;
    }
    const iid = ctx.event && ctx.event.iid;
    if (!iid || !s.objects[iid] || RB.obj(s, iid).counters) return;
    RB.obj(s, iid).counters = 1;
    RB.log(s, 'buff', { p: ctx.p, iid: iid });
  });
  say('buffEventUnit', () => 'Buff it.');

  // "Deal N to up to three units at the same location." A location is a battlefield or a
  // base, and it is the PLAYER's: the first unit chosen — any unit, either side — names it,
  // and every further one is optional ("up to") and must stand there too. Each further pick
  // is a yes/no followed by its own choice, so "up to" is honoured without a variable-count
  // question (D-2), and the damage lands on all of them at once when the choosing stops.
  // The ORDER is the auto-resolution policy: enemy units where the most enemies stand,
  // the ones N finishes off first; your own last.
  def('damageAtLocation', (s, e, ctx) => {
    const units = RB.allUnits(s).filter(i => RB.cardOf(s, i).type === 'Unit');
    const enemiesAt = key => unitsAtKey(s, key)
      .filter(u => RB.obj(s, u).controller !== ctx.p && RB.canChoose(s, ctx.p, u)).length;
    const theirs = units.filter(i => RB.obj(s, i).controller !== ctx.p)
      .sort((a, b) => enemiesAt(locKey(s, b)) - enemiesAt(locKey(s, a)) || health(s, a) - health(s, b));
    const mine = units.filter(i => RB.obj(s, i).controller === ctx.p)
      .sort((a, b) => health(s, b) - health(s, a));
    const first = RB.offerChoice(s, theirs.concat(mine), 1, ctx, 'damageAtLocation',
      'Deal ' + n_(e) + ' to which unit? (up to ' + (e.upTo || 1) + ' at one location)')[0];
    if (!first) return;
    moreAtLocation(s, e, ctx, locKey(s, first), [first]);
  });
  def('damageAlsoThere', (s, e, ctx) => {
    const chosen = (ctx.sfdChosen || []).filter(i => s.objects[i]);
    const pool = othersAt(s, ctx, ctx.sfdLoc, chosen);
    const next = RB.offerChoice(s, pool, 1, ctx, 'damageAlsoThere', 'Deal ' + n_(e) + ' to which unit there?')[0];
    moreAtLocation(s, e, ctx, ctx.sfdLoc, next ? chosen.concat([next]) : chosen);
  });
  say('damageAlsoThere', e => 'Deal ' + n_(e) + ' to another unit there.');
  def('damageChosen', (s, e, ctx) => {
    for (const iid of ctx.sfdChosen || [])
      if (s.objects[iid] && RB.locationOf(s, iid).kind !== 'nowhere') RB.dealDamage(s, iid, n_(e), ctx);
  });
  say('damageChosen', e => 'Deal ' + n_(e) + ' to each of them.');

  function moreAtLocation(s, e, ctx, key, chosen) {
    const c = Object.assign(plainCtx(ctx), { sfdLoc: key, sfdChosen: chosen.slice() });
    const done = { op: 'sfd.damageChosen', n: n_(e) };
    if (chosen.length >= (e.upTo || 1) || !othersAt(s, ctx, key, chosen).length) {
      RB.ops['sfd.damageChosen'](s, done, c);
      return;
    }
    s.queue.push({ kind: 'may', who: ctx.p, source: ctx.source,
      prompt: 'Deal ' + n_(e) + ' to another unit there as well? (' + chosen.length + ' chosen)',
      ctx: c, onAnswer: [[{ op: 'sfd.damageAlsoThere', n: n_(e), upTo: e.upTo }], [done]] });
  }
  function othersAt(s, ctx, key, chosen) {
    return unitsAtKey(s, key).filter(u => !chosen.includes(u) && RB.canChoose(s, ctx.p, u))
      .sort((a, b) => (RB.obj(s, a).controller === ctx.p) - (RB.obj(s, b).controller === ctx.p) ||
        health(s, a) - health(s, b));
  }
  function locKey(s, iid) {
    const l = RB.locationOf(s, iid);
    return l.kind === 'bf' ? 'bf' + l.bf : l.kind === 'base' ? 'base' + l.p : null;
  }
  function unitsAtKey(s, key) {
    if (!key) return [];
    if (key.startsWith('bf')) return s.bf[+key.slice(2)].units.slice();
    return s.players[+key.slice(4)].base.filter(i => RB.cardOf(s, i).type === 'Unit');
  }
  const health = (s, i) => RB.mightOf(s, i) - RB.obj(s, i).damage;
  say('damageAtLocation', e => 'Deal ' + n_(e) + ' to up to ' +
    (COUNTWORD[e.upTo || 1] || e.upTo) + ' units at the same location.');

  // "You and each opponent may play a Gold gear token exhausted. For each opponent who did,
  // you play a Gold gear token exhausted." Two real questions, one per seat, and the second
  // pays its answerer AND the card's controller.
  def('goldRound', (s, e, ctx) => {
    const gold = { op: 'sfd.playToken', cardId: 'tok-gold', exhausted: true };
    RB.ops.may(s, { op: 'may', effects: [gold], prompt: 'Play a Gold gear token exhausted?' }, ctx);
    const foe = RB.opponentOf(ctx.p);
    s.queue.push({ kind: 'may', who: foe, source: ctx.source,
      prompt: 'Play a Gold gear token exhausted? (your opponent gets one too)',
      ctx: { p: foe, source: ctx.source, owner: ctx.p },
      onAnswer: [[gold, Object.assign({ forOwner: true }, gold)], []] });
  });
  say('goldRound', () => 'You and each opponent may play a Gold gear token exhausted. ' +
    'For each opponent who did, you play a Gold gear token exhausted.');

  // "Return all units and gear to their owners' hands." Gear first, so a Might Bonus is
  // never read off a host that has already gone.
  def('returnAll', (s, e, ctx) => {
    for (const gid of allGear(s)) { detach(s, gid); toHand(s, gid); }
    for (const iid of RB.allUnits(s).slice())
      if (RB.cardOf(s, iid).type === 'Unit') toHand(s, iid);
    void ctx;
  });
  say('returnAll', () => "Return all units and gear to their owners' hands.");

  // "Choose an opponent. They score 1 point." In a duel there is exactly one.
  def('opponentScores', (s, e, ctx) => {
    const foe = RB.opponentOf(ctx.p);
    s.players[foe].points += n_(e);
    RB.log(s, 'score', { p: foe, how: 'effect', points: s.players[foe].points }, 'point.score');
  });
  say('opponentScores', e => 'Choose an opponent. They score ' + n_(e) +
    ' point' + (n_(e) === 1 ? '' : 's') + '.');

  def('channelEach', (s, e, ctx) => {
    for (let p = 0; p < 2; p++) RB.channel(s, p, n_(e), !!e.exhausted);
    void ctx;
  });
  say('channelEach', e => 'Each player channels ' + n_(e) + ' rune' + (n_(e) === 1 ? '' : 's') +
    (e.exhausted ? ' exhausted' : '') + '.');

  // "…, deal damage equal to my Might to an enemy unit in a base."
  def('damageInBase', (s, e, ctx) => {
    const foe = RB.opponentOf(ctx.p);
    const pool = s.players[foe].base
      .filter(i => RB.cardOf(s, i).type === 'Unit' && RB.canChoose(s, ctx.p, i))
      .sort((a, b) => RB.mightOf(s, b) - RB.mightOf(s, a));
    const n = e.fromMight ? RB.mightOf(s, ctx.source) : n_(e);
    if (!n) return;
    for (const iid of RB.offerChoice(s, pool, 1, ctx, 'damageInBase', 'Damage which unit in their base?'))
      RB.dealDamage(s, iid, n, ctx);
  });
  say('damageInBase', e => 'Deal damage equal to ' + (e.fromMight ? 'my Might' : n_(e)) +
    ' to an enemy unit in a base.');

  // "The first time I … each turn" — the count is on the source, stamped with the turn, so
  // it resets without anything having to sweep it.
  def('onceEachTurn', (s, e, ctx) => {
    const o = RB.obj(s, ctx.source);
    const key = 'sfdOnce' + (ctx.opIx || '');
    if (o[key] === s.turn) return;
    o[key] = s.turn;
    RB.runEffects(s, e.effects || [], ctx);
  });
  say('onceEachTurn', e => 'The first time each turn, ' + lower(join(e.effects)));

  // Records whether this battlefield was OPEN — occupied and uncontrolled — as the showdown
  // that may conquer it begins. The conquer event cannot say so afterwards: by then the
  // conqueror is the controller.
  def('noteOpen', (s, e, ctx) => {
    const bf = eventBf(s, ctx);
    if (bf >= 0) s.bf[bf].sfdWasOpen = s.bf[bf].controller === null;
  });
  say('noteOpen', () => '');

  // Counts a choice this card's controller made with a spell or a unit ability, of an
  // object an opponent controls. Read by the `sfd.chosenEnemyTwice` gate on sfd-248.
  def('countChoice', (s, e, ctx) => {
    const ev = ctx.event || {};
    if (ev.chooser !== ctx.p) return;
    if (!s.objects[ev.iid] || RB.obj(s, ev.iid).controller === ctx.p) return;
    const src = ev.source && s.objects[ev.source] ? RB.cardOf(s, ev.source).type : null;
    if (src !== 'Spell' && src !== 'Unit') return;
    const o = RB.obj(s, ctx.source);
    if (o.sfdChoiceTurn !== s.turn) { o.sfdChoiceTurn = s.turn; o.sfdChoices = 0; }
    o.sfdChoices = (o.sfdChoices || 0) + 1;
  });
  say('countChoice', () => '');

  // "Reveal the top 2 cards of your Main Deck. You may banish one, then play it. Recycle
  // the rest." The two are lifted off the deck while the question is open, so nothing can
  // draw one out from under the choice; whatever is not taken goes to the bottom.
  def('burrow', (s, e, ctx) => {
    const P = s.players[ctx.p];
    const top = P.deck.splice(0, n_(e) || 2);
    if (!top.length) return;
    for (const iid of top) {
      RB.log(s, 'reveal', { p: ctx.p, iid: iid, card: RB.cardOf(s, iid).id });
      fireOn(s, 'revealed', { p: ctx.p, iid: iid }, iid);
    }
    const playable = top.filter(iid => RB.canPay(s, ctx.p, RB.costOf(s, iid)));
    if (!playable.length) { for (const iid of top) P.deck.push(iid); return; }
    s.queue.push({ kind: 'may', who: ctx.p, source: ctx.source,
      prompt: 'Banish one of them and play it?',
      ctx: { p: ctx.p, source: ctx.source, revealed: top },
      onAnswer: [[{ op: 'sfd.burrowTake' }], [{ op: 'sfd.burrowRecycle' }]] });
  });
  say('burrow', e => 'Reveal the top ' + (n_(e) || 2) + ' cards of your Main Deck. ' +
    'You may banish one, then play it. Recycle the rest.');

  def('burrowTake', (s, e, ctx) => {
    const P = s.players[ctx.p];
    const top = (ctx.revealed || []).filter(i => s.objects[i]);
    const playable = top.filter(iid => RB.canPay(s, ctx.p, RB.costOf(s, iid)))
      .sort((a, b) => (RB.cardOf(s, b).energy || 0) - (RB.cardOf(s, a).energy || 0));
    const take = RB.offerChoice(s, playable, 1, ctx, 'burrowTake', 'Banish and play which card?')[0];
    for (const iid of top) if (iid !== take) P.deck.push(iid);
    if (!take) return;
    P.banished.push(take);
    const plan = RB.planPayment(s, ctx.p, RB.costOf(s, take));
    if (!plan) return;
    RB.pay(s, ctx.p, plan);
    RB.removeFrom(P.banished, take);
    RB.log(s, 'play', { p: ctx.p, iid: take, card: RB.cardOf(s, take).id, from: 'banished' }, 'card.play');
    RB.playCard(s, { iid: take, controller: ctx.p, to: 'base', kind: 'card', immediate: true });
  });
  say('burrowTake', () => 'Banish one and play it.');

  def('burrowRecycle', (s, e, ctx) => {
    for (const iid of ctx.revealed || []) if (s.objects[iid]) s.players[ctx.p].deck.push(iid);
  });
  say('burrowRecycle', () => 'Recycle them.');

  // --- install: describers, and the two wrappers the core still needs -----------
  let installed = false;
  function ready() {
    return !!(RB.defineDescriber && RB.cardText && RB.score && RB.recycleRune);
  }
  function install() {
    if (installed || !ready()) return;
    installed = true;
    for (const [name, fn] of SAY) RB.defineDescriber(name, fn);

    // The gate on sfd-248, registered into the core's condition table (and its prose into
    // the core's, or the auditor reads back a camelCase identifier).
    // The gate on sfd-150's Equip: "Recycle 2 cards from your trash" is part of its cost,
    // so with fewer than two cards there the ability is not offered at all.
    RB.defineCondition('sfd.trashAtLeast', (s, ctx, a) =>
      s.players[ctx.p].trash.length >= (a.n || 1));
    if (RB.defineWhenText)
      RB.defineWhenText('sfd.trashAtLeast', () => 'if your trash holds enough cards to recycle');
    RB.defineCondition('sfd.chosenEnemyTwice', (s, ctx, a) => {
      const o = s.objects[ctx.source];
      return !!o && o.sfdChoiceTurn === s.turn && (o.sfdChoices || 0) >= (a.n || 2);
    });
    if (RB.defineWhenText)
      // No leading "only": cost() already renders a gate as "(use only …)", and a predicate
      // that supplies its own reads back as "use only only if …".
      RB.defineWhenText('sfd.chosenEnemyTwice', () =>
        "if you've chosen enemy units and/or gear twice this turn with spells or unit abilities");

    // WRAPPER 3 of 3. "Units can't be played here" (sfd-216). It bars EVERY way a unit
    // reaches a battlefield by being played from the action list, and those do not share a
    // door: the named permissions in PLAY_WHERE, `playTo: 'battlefield'|'any'` (which never
    // consult it), a hidden unit played at its own battlefield, and js/ops-ogn.js's own
    // legalActions wrapper for "friendly units may be played to open battlefields" (ogn-193
    // Miss Fortune). Barring the PLAY_WHERE entries — what this did before — let the last
    // three through. So the finished action list is filtered instead; installed here, after
    // every pack has loaded, it sits outside ogn's wrapper and sees what that one added.
    // Plays made by an effect rather than an action (a token played "here", a unit put
    // onto a battlefield by another card's resolution) do not pass through this.
    const baseLegal = RB.legalActions;
    RB.legalActions = function (st) {
      const acts = baseLegal(st);
      const out = acts.filter(a => !(a.t === 'play' && typeof a.to === 'string' &&
        a.to.indexOf('bf') === 0 && RB.cardOf(st, a.iid).type === 'Unit' &&
        unitsBarredAt(st, +a.to.slice(2))));
      if (out.length === acts.length) return acts;
      return out.length ? out : [{ t: 'pass' }];
    };

    // "When you spend a buff" (sfd-101). A buff is spent as an additional cost, which is a
    // hook-table entry — so the raise is registered there, delegating to whatever the entry
    // already did. A buff spent by another pack's own op does not come through here; a core
    // `buffSpent` event would close that.
    const spend = RB.extraAvailable && RB.extraAvailable.spendBuff;
    if (spend) RB.defineExtraCost('spendBuff', {
      available: spend.available,
      pay: (st, p, iid, x) => { spend.pay(st, p, iid, x); fire(st, 'buffSpent', { p: p }); },
    });

    // WRAPPER 1 of 3. There is no event for a rune being recycled, and sfd-203 triggers on
    // exactly that. Raised into this pack's own table (see note 3), never into RB.runTriggers.
    const baseRecycleRune = RB.recycleRune;
    RB.recycleRune = function (s, p, iid) {
      const r = baseRecycleRune(s, p, iid);
      fire(s, 'runeRecycle', { p: p, iid: iid });
      return r;
    };

    // WRAPPER 2 of 3. A battlefield that locks scoring (sfd-209). "Can't score" negates
    // the POINT; the conquest or hold still happened, and Conquer and Hold effects fire
    // "even if the point gain is negated or replaced" (rules.md §13.2). Blocking the whole
    // call used to drop them too. Scoring has no hook table.
    const baseScore = RB.score;
    RB.score = function (s, p, i, how) {
      const ab = RB.card(s.bf[i].cardId).abilities;
      const lock = ab && ab.statics && ab.statics.find(x => x.scoreLockUntilTurn);
      if (lock && turnsTaken(s, p) < lock.scoreLockUntilTurn) {
        RB.log(s, 'scoreDenied', { p: p, bf: i, how: how });
        RB.runTriggers(s, how === 'conquer' ? 'conquer' : 'hold', { p: p, bf: i });
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
    // A static that reaches another card's PLAY STEP. The price is spelled out rather than
    // named, because the price is the half an auditor can check: "[Accelerate]" would read
    // as correct whatever numbers were behind it.
    if (st.grantsExtra) {
      const x = st.grantsExtra;
      const price = [x.energy ? x.energy + ' Energy' : null, x.power ? x.power + ' Power' : null]
        .filter(Boolean).join(' and ') || 'nothing';
      return 'Friendly ' + (st.tag ? st.tag + ' ' : '') +
        (st.type ? st.type.toLowerCase() + 's' : 'cards') +
        ' played from ' + (ZONE_TEXT[st.fromZone] || 'anywhere') +
        ' may pay ' + price + ' as an additional cost' +
        (x.entersReady ? ' to enter ready' : '') + '.';
    }
    if (st.optionalExtraDiscount) {
      const d = st.optionalExtraDiscount;
      return 'Optional additional costs you pay cost ' + (d.energy || 0) + ' Energy or ' +
        (d.orPower || 0) + ' Power less.';
    }
    if (st.when === 'attacking' && st.might != null)
      return 'I have +' + st.might + " Might while I'm an attacker.";
    if (st.when && st.when.kind === 'sandSoldier' && st.grant)
      return 'Your Sand Soldiers have ' + st.grant + '.';
    if (st.noUnitPlays) return "Units can't be played here.";
    return null;
  }
  function unitsBarredAt(s, i) {
    const ab = RB.card(s.bf[i].cardId).abilities;
    return !!(ab && ab.statics && ab.statics.some(x => x.noUnitPlays));
  }
  const SFD_WORDS = {
    runeRecycle: 'When you recycle a rune',
    buffSpent: 'When you spend a buff',
    revealed: "As I'm revealed from your deck",
  };
  const ORDINAL = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };
  const ZONE_TEXT = { hand: 'a hand', champion: 'the Champion Zone', hidden: 'face down' };

  // The public door into this pack's set-local triggers, for a spend or reveal that
  // happens outside this file. Events: `buffSpent` { p } — "when you spend a buff"
  // (sfd-101 Fae Dragon); `runeRecycle` { p, iid }; `revealed` { p, iid } — "as I'm
  // revealed from your deck" (sfd-175 Undertitan), asked of the revealed card itself,
  // which is in a deck and so is no board source. A buff spent or a card revealed by
  // another pack's op (ogn.spendBuff, ogn.playUnitFromDeck, unl revealTopSpell) reaches
  // these cards only if that op raises it here, or the core grows the event.
  RB.sfdRaise = function (s, event, data) {
    if (event === 'revealed') fireOn(s, event, data, data.iid);
    else fire(s, event, data);
  };
  RB.sfdInstall = install;
  if (RB.registerCards) {
    const baseRegisterCards = RB.registerCards;
    RB.registerCards = function () { install(); return baseRegisterCards.apply(this, arguments); };
  }
  install();                                        // in case this file is ever loaded last
})(window.RB = window.RB || {});
