// Interaction. Every affordance here is derived from RB.legalActions — the UI cannot
// invent a rule. Tap inspects; a second tap on a legal destination commits.
(function (RB) {
  'use strict';
  const $ = s => document.querySelector(s);
  const U = RB.ui = RB.ui || {};
  U.sel = null;          // the selected hand card or unit
  U.toss = [];           // cards set aside during the mulligan
  U.picks = [];          // running selection while answering a targeting prompt
  U.payAsk = null;       // a destination reached by several actions: which costs to pay
  U.selUnits = [];       // units gathered for one simultaneous standard move (rule 144.4)
  U.state = null;
  U.me = 0;
  U.difficulty = 'competition';
  // Card names reach innerHTML in several places here, and item 2 builds a data- attribute
  // out of one. js/render.js has had its own esc() all along; this file did not.
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const trim = (t, n) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t);

  // --- the log drawer -------------------------------------------------------
  // Two states, not three. Closed is a pull tab on the right edge and the board gets its
  // full width back; open is a full-height panel slid in over it. The topbar Log button
  // and the tab toggle the same one piece of state, which lives here and not in the DOM,
  // because RB.paintBoard rebuilds the board on every action — #log survives only because
  // it sits outside the rebuilt subtree.
  const LOG_KEY = 'bf.logOpen';
  function storedLogOpen() {
    try { return localStorage.getItem(LOG_KEY) === '1'; } catch (e) { return false; }
  }
  function storeLogOpen(v) {
    try { localStorage.setItem(LOG_KEY, v ? '1' : '0'); } catch (e) { void e; }
  }
  U.logOpen = storedLogOpen();     // the player's preference, remembered across games
  U.logForced = false;             // stood aside for a prompt — not the player closing it

  RB.setLogOpen = function (open) { U.logOpen = !!open; storeLogOpen(U.logOpen); applyLog(); };
  RB.toggleLog = function () { RB.setLogOpen(!U.logOpen); };
  // An overlay may cover cards; it may NOT cover the cards you are being asked to click.
  // The board borrows the drawer while a targeting prompt is open and gives it straight
  // back — the stored preference is never touched, so the player's choice survives.
  RB.syncLogDrawer = function (choosing) { U.logForced = !!choosing; applyLog(); };
  function applyLog() {
    const open = U.logOpen && !U.logForced;
    $('#log').classList.toggle('open', open);
    $('#logtab').classList.toggle('open', open);
  }

  // Bound ONCE, at startup, by delegation: RB.paintLog replaces #log's innerHTML on every
  // repaint, so a listener per entry would be rebound and leaked a few hundred times a
  // game. #log itself is never rebuilt.
  RB.initLogHover = function () {
    const box = $('#log');
    box.addEventListener('mouseover', ev => {
      const t = ev.target.closest('.cardref');
      if (t) RB.showPreview(t, RB.card(t.dataset.def));
    });
    box.addEventListener('mouseout', ev => {
      if (ev.target.closest('.cardref')) RB.hidePreview();
    });
    // Touch has no hover. A tap on a name opens the preview and the next tap anywhere
    // closes it, which is the whole gesture — the game is on the web now.
    box.addEventListener('click', ev => {
      const t = ev.target.closest('.cardref');
      if (!t) return;
      ev.stopPropagation();
      RB.showPreview(t, RB.card(t.dataset.def));
    });
    document.addEventListener('click', () => RB.hidePreview());
    $('#logtab').addEventListener('click', () => { RB.audio.play('ui.click'); RB.toggleLog(); });
    applyLog();
  };

  // A standard move carries a SET of units (rule 144.4); every other action names one card
  // in `iid`. "Does this action involve this card" is the question here, and for a move
  // that is membership of the set — it used to be `iids.length === 1`, which bound the
  // human seat to one-unit groups and made every other subset the engine generates
  // unreachable. The AI had them from the start.
  U.actsOn = function (a, iid) {
    return a.t === 'move' ? a.iids.includes(iid) : a.iid === iid;
  };

  // --- the simultaneous standard move --------------------------------------
  // The engine's action space is every non-empty subset of movable units that share a
  // destination, so the board's job is to let the player NAME one of those subsets. It
  // gathers units, then picks a destination; the action committed is the one whose set of
  // movers is exactly what was gathered.
  //
  // This matters more than a convenience. A move completes, a cleanup runs, and a staged
  // showdown opens at once, so units sent one at a time fight one at a time — the engine's
  // own comment calls attacking into anything held "unwinnable by construction" without
  // the simultaneous move.
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  U.groupTo = function (state, to) {
    if (!U.selUnits.length) return null;
    return RB.legalActions(state).find(a =>
      a.t === 'move' && a.to === to && sameSet(a.iids, U.selUnits)) || null;
  };
  U.groupDests = function (state) {
    if (!U.selUnits.length) return [];
    return RB.legalActions(state)
      .filter(a => a.t === 'move' && sameSet(a.iids, U.selUnits))
      .map(a => a.to);
  };
  // Units that could still join the gathering: the ones some legal move takes to a
  // destination the whole enlarged group could also reach. Asking the engine this rather
  // than reasoning about exhaustion keeps the rule in one place.
  U.canJoin = function (state, iid) {
    if (U.selUnits.includes(iid)) return true;
    const want = U.selUnits.concat([iid]);
    return RB.legalActions(state).some(a => a.t === 'move' && sameSet(a.iids, want));
  };
  U.destName = function (state, to) {
    return to === 'base' ? 'your base' : RB.card(state.bf[+to.slice(2)].cardId).name;
  };

  RB.startGame = function (state, me, difficulty) {
    state.humanSeat = me;                 // from here the engine asks this seat to choose
    U.state = state; U.me = me; U.difficulty = difficulty || 'competition'; U.sel = null;
    U.payAsk = null; U.selUnits = [];
    RB.resetChainView();
    RB.recordStart(state);
    RB.showScreen('game');
    RB.audio.music('battle');
    RB.step();
  };

  // One place drives the game forward: paint, then if it is not the human's turn, let the
  // AI act after a beat so the player can see what happened.
  RB.step = function () {
    const s = U.state;
    RB.paintBoard(s, U.me);
    if (RB.isTerminal(s)) return RB.endScreen(s);
    if (RB.whoActs(s) === U.me) return;
    setTimeout(() => {
      if (U.state !== s) return;
      const a = RB.aiChoose(s, U.difficulty);
      RB.recordAction(a);
      U.state = RB.apply(s, a);
      soundFor(U.state, s);
      RB.step();
    }, 420);
  };

  RB.commit = function (action) {
    const before = U.state;
    RB.recordAction(action);
    U.state = RB.apply(before, action);
    U.sel = null;
    U.payAsk = null;
    U.selUnits = [];
    soundFor(U.state, before);
    RB.step();
  };

  // The audio layer rides the log: a new entry with a sound tag voices at the moment of
  // the picture, and a tag with no clip is simply ignored. The spotlight rides it too —
  // the opponent acts on a 420ms beat and a card played off-screen is a card the player
  // never saw.
  function soundFor(after, before) {
    // The chain viewer rides the same walk. An item leaving the chain is the one moment
    // the whole feature exists to show, and it happens INSIDE an apply — by the time the
    // board repaints, state.chain has already forgotten it. The item itself is read from
    // the chain as it stood before the action, never rebuilt from the log entry.
    const went = [];
    for (let i = before.log.length; i < after.log.length; i++) {
      const e = after.log[i];
      if (e.kind === 'resolve' || e.kind === 'counter') {
        const it = before.chain.find(x => x.iid === e.data.iid);
        if (it) went.push(it);
      }
      if (e.kind === 'play' && e.data.p !== U.me) RB.spotlight(after, e.data.iid);
      if (!e.sound) continue;
      if (e.kind === 'score') RB.audio.play('point.score', { points: e.data.points, mine: e.data.p === U.me });
      else RB.audio.play(e.sound);
    }
    if (went.length) U.chainWent = went;
  }

  // Spotlight: the card the opponent just played, shown at full preview size for a beat.
  // It is a decoration over the board, so it never takes a click.
  //
  // The hold is long enough to READ the printed text, not merely to notice that something
  // happened. It does not stack: a second play replaces the first outright, so the hold
  // only ever governs the LAST card of a run. In a run of plays on the AI's 420ms beat the
  // cards before the last one still get 420ms each — that is a property of the beat, not of
  // this number, and no hold fixes it.
  const SPOT_HOLD = 2800, SPOT_FADE = 260;
  let spotTimer = null;
  RB.spotlight = function (state, iid) {
    const box = $('#spotlight');
    box.innerHTML = '';
    box.appendChild(RB.renderCard(RB.cardOf(state, iid), { size: 'preview' }));
    box.classList.remove('hidden');
    box.classList.add('in');
    clearTimeout(spotTimer);
    spotTimer = setTimeout(() => {
      box.classList.remove('in');
      spotTimer = setTimeout(() => box.classList.add('hidden'), SPOT_FADE);
    }, SPOT_HOLD);
  };

  // Anything the player could act with is marked; WHERE it can go is revealed only once
  // they pick it up. A persistent destination highlight clutters the board before the
  // player has committed to anything. Computed once per repaint, because legalActions is
  // not cheap and the board asks about every card on it.
  U.actableSet = function (state) {
    const out = new Set();
    if (RB.isTerminal(state) || RB.whoActs(state) !== U.me) return out;
    if (state.queue.length && state.queue[0].kind === 'target') return out;
    for (const a of RB.legalActions(state)) if (a.iid) out.add(a.iid);
    return out;
  };

  // --- selection ------------------------------------------------------------
  U.bindCard = function (elm, state, iid, role) {
    elm.addEventListener('mouseenter', () => RB.showPreview(elm, RB.cardOf(state, iid)));
    elm.addEventListener('mouseleave', RB.hidePreview);
    // Answering a prompt is the one exception to "tapping never changes the game": it is a
    // deliberate response to a question the game just asked, and clicking the real card is
    // the documented way to answer targeting. This sits ABOVE the "is it mine" guard,
    // because the answer to a prompt is very often one of the opponent's cards.
    const q = state.queue[0];
    if (q && q.kind === 'target' && q.who === U.me) {
      if (!q.options.includes(iid)) return;
      const picked = U.picks.includes(iid);
      elm.classList.add(picked ? 'role-picked' : 'role-target');
      elm.style.cursor = 'pointer';
      elm.addEventListener('click', ev => {
        ev.stopPropagation();
        RB.audio.play('ui.click');
        const i = U.picks.indexOf(iid);
        if (i >= 0) U.picks.splice(i, 1);
        else U.picks.push(iid);
        if (U.picks.length === q.n) {
          const sel = U.picks.slice(); U.picks = [];
          return RB.commit({ t: 'choose', selection: sel });
        }
        RB.paintBoard(state, U.me);
      });
      return;
    }

    if (!role || RB.whoActs(state) !== U.me) return;

    // A selected Gear is looking for a host: any unit that is a legal destination for it
    // becomes a click target, and says so with the drop outline.
    if (U.sel && U.sel !== iid) {
      const drop = RB.legalActions(state).find(a => a.iid === U.sel && a.to === 'unit:' + iid);
      if (drop) {
        elm.classList.add('dropok');
        elm.style.cursor = 'pointer';
        elm.addEventListener('click', ev => { ev.stopPropagation(); RB.commit(drop); });
        return;
      }
    }
    if (mulliganStep(state)) {
      if (role !== 'hand') return;
      elm.style.cursor = 'pointer';
      elm.classList.toggle('toss', U.toss.includes(iid));
      elm.addEventListener('click', ev => {
        ev.stopPropagation();
        RB.audio.play('ui.click');
        const i = U.toss.indexOf(iid);
        if (i >= 0) U.toss.splice(i, 1);
        else if (U.toss.length < 2) U.toss.push(iid);   // rule 121: up to two
        RB.paintBoard(state, U.me);
      });
      return;
    }
    const acts = RB.legalActions(state);
    const mine = acts.filter(a => U.actsOn(a, iid) &&
      (a.t === 'play' || a.t === 'move' || a.t === 'activate' || a.t === 'hide'));
    if (!mine.length) return;

    // A unit that can move GATHERS rather than commits. It cannot auto-commit on the
    // first click any more: committing the one-unit move is precisely what stops a second
    // unit from ever joining it, and the group is the only way the printed rules let you
    // commit a force. Cards in hand are unaffected — a play is always one card.
    const gathers = mine.some(a => a.t === 'move');
    if (gathers) {
      const picked = U.selUnits.includes(iid);
      const joinable = picked || !U.selUnits.length || U.canJoin(state, iid);
      elm.classList.add(picked ? 'role-selected' : joinable ? 'role-actable' : 'role-dim');
      if (!picked) elm.style.animationDelay = '-' + ((Date.now() % 1700) / 1000).toFixed(3) + 's';
      if (!joinable) return;                       // visible, but not a click target
      elm.style.cursor = 'pointer';
      elm.addEventListener('click', ev => {
        ev.stopPropagation();
        RB.audio.play('ui.click');
        U.sel = null; U.payAsk = null;             // gathering units is not selecting a card
        const i = U.selUnits.indexOf(iid);
        if (i >= 0) U.selUnits.splice(i, 1); else U.selUnits.push(iid);
        RB.paintBoard(state, U.me);
      });
      return;
    }

    // Four states, four colours, and that is the whole targeting vocabulary.
    elm.classList.add(U.sel === iid ? 'role-selected' : 'role-actable');
    if (U.sel !== iid) {
      // A rebuilt node restarts its animation, so a board redrawn while the AI acts would
      // produce a stuttering pulse. The phase is taken from the wall clock instead.
      elm.style.animationDelay = '-' + ((Date.now() % 1700) / 1000).toFixed(3) + 's';
    }
    elm.style.cursor = 'pointer';
    elm.addEventListener('click', ev => {
      ev.stopPropagation();
      RB.audio.play('ui.click');
      U.selUnits = [];
      const dests = mine.filter(a => a.t === 'play' || a.t === 'move');
      const act = mine.find(a => a.t === 'activate');
      const hides = mine.filter(a => a.t === 'hide');
      if (!dests.length && !hides.length && act) return RB.commit(act);
      // One destination is not a choice — spells (no destination at all), units that can
      // only go to the base, and single-target gear all commit on the first click. A card
      // that could also be hidden always asks, because hiding is a different decision.
      if (dests.length === 1 && !hides.length) return RB.commit(dests[0]);
      U.sel = (U.sel === iid) ? null : iid;
      RB.paintBoard(state, U.me);
    });
  };

  // Every optional additional cost a card carries is its OWN play action at the same
  // destination — "[Accelerate] is a different play, not a decision taken afterwards", as
  // the engine puts it. So a destination can be reached by several actions that differ
  // only in what the player pays, and taking the first of them silently answers a printed
  // question on their behalf. Akshan (sfd-109) reads "You may pay [C][C] as an additional
  // cost to play me", and find() would have declined it every single time.
  U.playsTo = function (state, to) {
    return RB.legalActions(state).filter(x => U.actsOn(x, U.sel) && x.to === to);
  };

  U.bindDrop = function (box, state, me) {
    box.addEventListener('click', () => {
      const to = box.dataset.drop;
      if (U.selUnits.length) {
        const g = U.groupTo(state, to);
        if (!g) { RB.audio.play('ui.invalid'); return; }
        RB.audio.play('ui.click');
        return RB.commit(g);
      }
      if (!U.sel) return;
      const opts = U.playsTo(state, to);
      if (!opts.length) { RB.audio.play('ui.invalid'); return; }
      RB.audio.play('ui.click');
      if (opts.length === 1) return RB.commit(opts[0]);
      U.payAsk = { to: to, opts: opts };
      RB.paintBoard(state, U.me);
    });
    if (U.selUnits.length ? U.groupTo(state, box.dataset.drop)
                          : (U.sel && U.playsTo(state, box.dataset.drop).length))
      box.classList.add('dropok');
    void me;
  };

  // What one option on that question is called. The cost's prose comes from the describer
  // in js/text.js rather than a second phrasing written here.
  U.payLabel = function (state, iid, a) {
    const ids = a.pay || [];
    if (!ids.length) return 'Play for its printed cost only';
    const parts = ids.map(id => {
      const m = /^x(\d+)$/.exec(id);
      if (m) return 'X = ' + m[1];
      try { return RB.extraCostText(RB.additionalCost(state, iid, id, a.from || 'hand')); }
      catch (e) { return id; }
    });
    return 'Also pay ' + parts.join(' and ');
  };

  function mulliganStep(state) {
    return state.queue.length && state.queue[0].kind === 'mulligan' && state.queue[0].who === U.me;
  }

  // --- prompt ---------------------------------------------------------------
  // Always say what the game is waiting for, and why a disabled control is disabled,
  // next to it, before the first click.
  RB.paintPrompt = function (state, me) {
    const p = $('#prompt');
    p.innerHTML = '';
    // A block says its piece on its own line: the may/choose prompt is three lines now,
    // and the buttons drop below it rather than being squeezed off the right edge.
    const say = (t, cls) => { const d = RB.el(cls || ''); d.innerHTML = t; p.appendChild(d); };
    const btn = (label, fn, cls) => {
      const b = RB.el('btn' + (cls ? ' ' + cls : ''), 'button');
      b.style.cssText = 'padding:.28rem .9rem;font-size:.76rem';
      b.textContent = label; b.onclick = fn; p.appendChild(b); return b;
    };
    if (RB.isTerminal(state)) return say('<b>Game over.</b>');
    const who = RB.whoActs(state);
    if (who !== me) { say('Opponent is thinking…'); return; }
    const acts = RB.legalActions(state);

    if (mulliganStep(state)) {
      say('<b>Mulligan.</b> Set aside up to two cards — you draw that many back, and the ones you ' +
        'set aside go to the bottom of your deck. ' +
        (U.toss.length ? '<b>' + U.toss.length + '</b> selected.' : 'Click a card to set it aside.'));
      btn(U.toss.length ? 'Mulligan ' + U.toss.length : 'Keep this hand',
        () => { const t = U.toss.slice(); U.toss = []; RB.commit({ t: 'mulligan', toss: t }); }, 'primary');
      return;
    }

    if (state.queue.length && state.queue[0].kind === 'chooseShowdown')
      return say('Two battlefields are contested — <b>click one</b> to open its showdown.');

    const q0 = state.queue[0];
    if (q0 && q0.kind === 'target') {
      const src = q0.source ? RB.cardOf(state, q0.source) : null;
      const theirs = src && RB.obj(state, q0.source).controller !== me;
      const left = q0.n - U.picks.length;
      // The card says WHAT ("Choose an enemy unit"); the prompt line says HOW. Where to
      // click depends on whether the board can draw the answers at all — a choice from a
      // deck or a trash is answered in the panel js/choice.js opens over the board.
      const inPanel = !!RB.ui.offBoardChoice(state, me);
      // A choice of PLACES, not cards (a token's location, D-15): one button per place.
      if (q0.labels) {
        const ask = q0.label || 'Choose.';
        say((src ? (theirs ? 'Their <b>' : '<b>') + esc(src.name) + '</b> — ' : '') + esc(ask));
        q0.options.forEach((opt, i) => btn(q0.labels[opt] || opt,
          () => RB.commit({ t: 'choose', selection: [opt] }), i === 0 ? 'primary' : ''));
        return;
      }
      // A card's own prompt may already end in a question mark; a full stop after one
      // reads as a typo, and every prompt written from here on is a question.
      const ask = q0.label || 'Choose ' + q0.n + (q0.n === 1 ? ' target' : ' targets');
      say((src ? (theirs ? 'Their <b>' : '<b>') + src.name + '</b> — ' : '') +
        ask + (/[.?!]$/.test(ask) ? '' : '.') +
        ' <span style="color:#ff6bcb">Click ' + left + ' more card' +
        (left === 1 ? '' : 's') + (inPanel ? ' in the panel.' : ' highlighted on the board.') +
        '</span>');
      if (U.picks.length) btn('Clear', () => { U.picks = []; RB.paintBoard(state, me); });
      return;
    }

    // A card-driven choice names the card, shows its printed text, AND asks the question —
    // all three, because each answers a different thing. The name says what is talking,
    // the printed clause says why it is talking NOW (the trigger on the face IS the
    // reason), and the question says what saying yes costs and buys. Supplying a prompt
    // used to SUPPRESS the printed text, which is how "Grand Duelist — Pay exhaust me?"
    // reached a playtest with no way to find out what it meant.
    const q = state.queue[0];
    if (q && (q.kind === 'may' || q.kind === 'choose')) {
      const src = q.source ? RB.cardOf(state, q.source) : null;
      const printed = src ? RB.printedText(src.id) : '';
      say((src ? '<div class="promptcard">' + esc(src.name) + '</div>' : '') +
        (printed ? '<div class="promptwhy">' + RB.iconHTML(esc(printed)) + '</div>' : '') +
        '<div class="promptq">' + RB.iconHTML(esc(q.prompt || 'Choose.')) + '</div>',
        'promptblock');
      if (q.kind === 'may') {
        btn('Yes', () => RB.commit({ t: 'choose', ix: 0 }), 'primary');
        btn('No', () => RB.commit({ t: 'choose', ix: 1 }));
      } else {
        q.options.forEach((label, i) =>
          btn(label, () => RB.commit({ t: 'choose', ix: i }), i === 0 ? 'primary' : ''));
      }
      return;
    }

    if (state.showdown) {
      const sd = state.showdown;
      say('<b>' + (sd.combat ? 'Combat' : 'Showdown') + '</b> at ' +
        RB.card(state.bf[sd.bf].cardId).name + ' — you are the ' +
        (sd.attacker === me ? 'attacker' : 'defender') +
        '. Play a Reaction, or pass to resolve.');
      btn('Pass', () => RB.commit({ t: 'pass' }), 'primary');
      return;
    }
    if (state.chain.length) {
      // Name the thing. "A card is on the chain" was true and useless; the viewer between
      // the battlefields shows the rest of the stack and the order it resolves in.
      const top = RB.chainTop(state);
      say('<b>' + esc(RB.card(top.cardId).name) + '</b>' +
        (top.kind === 'ability' ? "'s ability is" : ' is') + ' on the chain — ' +
        (state.chain.length > 1 ? state.chain.length + ' items, first to resolve. ' : '') +
        'Respond, or pass to let it resolve.');
      btn('Pass', () => RB.commit({ t: 'pass' }), 'primary');
      return;
    }
    // Units gathered for one simultaneous move. Always say how many and where they can
    // go, because the group is invisible otherwise — the only sign is the outline on each
    // card, and "why is nothing highlighted" is how the last interface bug was reported.
    if (U.selUnits.length) {
      const dests = U.groupDests(state);
      const names = U.selUnits.map(i => esc(RB.cardOf(state, i).name));
      const might = U.selUnits.reduce((n, i) => n + RB.mightOf(state, i), 0);
      say('<b>' + U.selUnits.length + ' unit' + (U.selUnits.length === 1 ? '' : 's') +
        '</b> moving together — ' + names.join(', ') +
        ' · <b>' + might + '</b> Might total.');
      say(dests.length
        ? '<span style="color:#9fb0cc">Click another unit to add it, or a highlighted ' +
          'destination to move: ' + dests.map(d => esc(U.destName(state, d))).join(', ') + '.</span>'
        : '<span style="color:#ff9a8a">These units share no destination — ' +
          'drop one to move the rest.</span>');
      // A unit that can move AND has an activated ability could never reach the ability:
      // the click path treated any card with a destination as a thing to move, so the
      // activate branch above it was dead for every mobile unit, and a unit with exactly
      // one destination committed the MOVE on the first click instead. Gathering makes the
      // prompt the right home for it — offered only for a single gathered unit, because an
      // activated ability belongs to one card and not to a group.
      if (U.selUnits.length === 1)
        for (const a of acts.filter(x => x.t === 'activate' && x.iid === U.selUnits[0]))
          btn('Use: ' + trim(RB.activatedName(state, a.iid, a.ix), 58), () => RB.commit(a));
      btn('Cancel', () => { U.selUnits = []; RB.paintBoard(state, me); });
      return;
    }
    // A destination reached by more than one action, differing only in what is paid. The
    // card names itself and shows its printed text, because the question is about a clause
    // on that card and the player should not have to remember which.
    if (U.sel && U.payAsk) {
      const card = RB.cardOf(state, U.sel);
      say('<b>' + esc(card.name) + '</b> — how do you want to pay?');
      const pr = RB.printed && RB.printed[card.id];
      if (pr) say('<span style="color:#9fb0cc;font-size:.72rem;white-space:pre-line">' + esc(pr) + '</span>');
      for (const a of U.payAsk.opts)
        btn(U.payLabel(state, U.sel, a), () => RB.commit(a), a.pay && a.pay.length ? 'primary' : '');
      btn('Cancel', () => { U.payAsk = null; U.sel = null; RB.paintBoard(state, me); });
      return;
    }
    if (U.sel) {
      const dests = acts.filter(a => U.actsOn(a, U.sel) && (a.t === 'play' || a.t === 'move'));
      const hides = acts.filter(a => U.actsOn(a, U.sel) && a.t === 'hide');
      say('<b>' + RB.cardOf(state, U.sel).name + '</b> selected — ' +
        (dests.length ? 'click a highlighted destination.'
                      : '<span style="color:#ff9a8a">no legal destination.</span>'));
      // Hiding is a discretionary action, not a play, so it gets its own control rather
      // than sharing the battlefield click with playing the card there.
      for (const h of hides)
        btn('Hide at ' + RB.card(state.bf[+h.to.slice(2)].cardId).name,
          () => RB.commit(h));
      btn('Cancel', () => { U.sel = null; U.payAsk = null; RB.paintBoard(state, me); });
      return;
    }
    // The champion is playable from its own zone, so it is counted separately — "5 of 4
    // cards playable" is what happens when a zone outside the hand is folded into a
    // hand-relative count.
    const playIids = new Set(acts.filter(a => a.t === 'play').map(a => a.iid));
    const champReady = state.players[me].champion && playIids.has(state.players[me].champion);
    const plays = [...playIids].filter(i => i !== state.players[me].champion).length;
    const moves = new Set(acts.filter(a => a.t === 'move').flatMap(a => a.iids)).size;
    const canHide = new Set(acts.filter(a => a.t === 'hide').map(a => a.iid)).size;
    const held = state.players[me].hand.length;
    say('Your main phase — <b>' + plays + '</b> of ' + held + ' card' + (held === 1 ? '' : 's') +
      ' playable, <b>' + moves + '</b> unit' + (moves === 1 ? '' : 's') + ' can move.' +
      (champReady ? ' <span style="color:#ffca63">Your champion can be played.</span>' : '') +
      (canHide ? ' <span style="color:#ffca63">' + canHide + ' can be hidden.</span>' : '') +
      (plays === 0 && held > 0 ? ' <span style="color:#9fb0cc">Hover a card to see what it needs.</span>' : ''));
    btn('End turn', () => RB.commit({ t: 'endTurn' }), 'primary');
  };

  // --- preview --------------------------------------------------------------
  let previewEl = null;
  let previewAnchor = null;
  RB.showPreview = function (anchor, card) {
    RB.hidePreview();
    const box = $('#preview');
    previewAnchor = anchor;
    previewEl = RB.renderCard(card, { size: 'preview' });
    box.innerHTML = '';
    box.appendChild(previewEl);
    const r = anchor.getBoundingClientRect();
    const w = 21 * 16 + 20;
    let x = r.right + 12;
    if (x + w > window.innerWidth) x = r.left - w - 4;
    box.style.left = Math.max(8, x) + 'px';
    box.style.top = Math.max(8, Math.min(window.innerHeight - 420, r.top - 60)) + 'px';
    box.classList.remove('hidden');
  };
  RB.hidePreview = function () {
    $('#preview').classList.add('hidden'); previewEl = null; previewAnchor = null;
  };
  // A preview is anchored to a card element. paintBoard rebuilds every one of them, so a
  // card hovered as it LEAVES the board never gets its mouseleave and its preview hangs
  // there over whatever comes next — which is how the choice panel arrived under a
  // full-size picture of the spell that opened it. The anchor still being in the document
  // is the test, and it costs one call per repaint.
  RB.dropStalePreview = function () {
    if (previewAnchor && !document.contains(previewAnchor)) RB.hidePreview();
  };

  // --- the chain ------------------------------------------------------------
  // U.chainView MIRRORS state.chain. It is set from the live chain and is allowed to
  // LINGER for a beat after the engine's chain empties — long enough to watch the last
  // item leave. It is never built from the log: state.chain is the door (docs/grammar.md,
  // ground rule 0.3). Delaying a view of the door is fine; reconstructing it from a second
  // source is not, because one of the two homes is always subtly wrong.
  //
  // The lingering is not decoration. When both players pass, doPass resolves the whole
  // chain INSIDE one RB.apply, and the UI only paints between actions — so without a
  // delay a chain that is built and emptied in one action is never seen at all.
  let chainTimer = null;
  RB.resetChainView = function () {
    clearTimeout(chainTimer); chainTimer = null;
    U.chainView = null; U.chainWent = null; U.chainHidden = false;
  };

  RB.paintChain = function (state, me) {
    const box = $('#chain');
    if (state.chain.length) {
      clearTimeout(chainTimer); chainTimer = null;
      U.chainView = state.chain.slice();
    } else if (U.chainView && !chainTimer) {
      chainTimer = setTimeout(() => {
        chainTimer = null; U.chainView = null; U.chainWent = null;
        if (U.state) RB.paintChain(U.state, U.me);
      }, 900);
    }
    // The item that just resolved is shown for one more paint, marked, in the slot it left
    // from — otherwise a card is on the chain and then simply is not. soundFor collected it
    // from the pre-action chain.
    const went = U.chainWent || [];
    U.chainWent = null;
    // The lingering view still HOLDS the item that just left — chainView is only replaced
    // while the engine's chain is non-empty. Merging by identity rather than appending is
    // the difference between one entry marked `went` and the same card drawn twice.
    const items = (U.chainView || []).slice();
    for (const it of went) if (items.indexOf(it) < 0) items.push(it);
    box.innerHTML = '';
    // The collapse is per-CHAIN, not per-game: it clears the moment the viewer empties, so
    // hiding it once can never leave the next chain silently invisible. A headline feature
    // that goes dead quietly is the failure mode this project has already paid for twice.
    if (!items.length) { box.classList.add('hidden'); U.chainHidden = false; return; }
    box.classList.toggle('collapsed', !!U.chainHidden);
    const head = RB.el('chain-head');
    const label = RB.el('chain-label', 'span');
    // Collapsed, the header is all that is left, so it stops describing the ordering
    // nobody can see and says how much is hidden instead.
    label.textContent = U.chainHidden
      ? 'THE CHAIN — ' + items.length + (items.length === 1 ? ' item' : ' items')
      : 'THE CHAIN — resolves left to right';
    head.appendChild(label);
    // #chain takes no pointer events — it sits over the battlefields. This button opts
    // back in (see .chain-toggle), which is the whole reason it can be clicked at all.
    const tog = RB.el('chain-toggle', 'button');
    tog.type = 'button';
    tog.textContent = U.chainHidden ? 'SHOW' : 'HIDE';
    tog.title = U.chainHidden ? 'Show the chain' : 'Hide the chain to see the board';
    tog.setAttribute('aria-expanded', String(!U.chainHidden));
    tog.addEventListener('click', () => {
      U.chainHidden = !U.chainHidden;
      RB.paintChain(U.state, U.me);
    });
    head.appendChild(tog);
    box.appendChild(head);
    if (U.chainHidden) { box.classList.remove('hidden'); return; }
    const row = RB.el('chain-row');
    // ⚠ THE CHAIN IS LIFO: chain[length-1] resolves FIRST. Reversed so the leftmost entry
    // is the next one to resolve, which is the single thing this viewer exists to say.
    // Un-reverse this and it becomes confidently wrong. Do not "simplify" it away.
    items.slice().reverse().forEach((it, i) => {
      const card = RB.card(it.cardId);
      const mine = it.controller === me;
      const e = RB.el('chain-item ' + (mine ? 'ctrl-me' : 'ctrl-them') +
        (went.indexOf(it) >= 0 ? ' went' : ''));
      const n = RB.el('chain-n'); n.textContent = (i + 1) + '.';
      e.appendChild(n);
      e.appendChild(RB.renderCard(card, { size: 'board' }));
      // An ABILITY is not its card. A player who sees Grand Duelist on the chain will
      // reasonably think Grand Duelist was played, so the entry says which it is.
      if (it.kind === 'ability') {
        const b = RB.el('chain-abil'); b.textContent = 'ABILITY'; e.appendChild(b);
      }
      const cap = RB.el('chain-cap');
      cap.textContent = (mine ? 'yours' : 'theirs') + ' · ' +
        (it.kind === 'ability' ? 'ability' : String(card.type).toLowerCase());
      e.appendChild(cap);
      // The container takes no clicks — it sits over the battlefields. The entries opt
      // back in for the pointer alone, so hovering one reads the card.
      e.addEventListener('mouseenter', () => RB.showPreview(e, card));
      e.addEventListener('mouseleave', RB.hidePreview);
      row.appendChild(e);
    });
    box.appendChild(row);
    box.classList.remove('hidden');
  };

  // --- log ------------------------------------------------------------------
  RB.paintLog = function (state, me) {
    const box = $('#log');
    // Every name in the log is a doorway to the card. The attribute carries the
    // DEFINITION id, never the instance: the log outlives the objects it names — an
    // instance can be in the trash or gone entirely, while RB.card(id) answers for a
    // registered card forever.
    const ref = id => '<b class="cardref" data-def="' + esc(id) + '">' +
      esc(RB.card(id).name) + '</b>';
    const nm = iid => ref(RB.obj(state, iid).cardId);
    const bfnm = i => ref(state.bf[i].cardId);
    const you = p => (p === me ? 'You' : 'They');
    const lines = [];
    // A drawer can show a whole game. The old cap was tuned for a six-line strip.
    for (const e of state.log.slice(-400)) {
      const d = e.data || {};
      let t = null, cls = '';
      switch (e.kind) {
        case 'turnStart': t = '— ' + (d.p === me ? 'Your turn' : 'Their turn') + ' ' + d.turn + ' —'; break;
        case 'play': t = you(d.p) + ' played ' + nm(d.iid); break;
        // A standard move carries a set; an ability that relocates a unit logs a single
        // `iid`. Both read as one sentence, and the destination is named because a group
        // arriving somewhere is the sentence that explains the showdown on the next line.
        case 'move': {
          const names = (d.iids || [d.iid]).map(nm);
          const list = names.length === 1 ? names[0]
            : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
          t = you(d.p) + ' moved ' + list + ' to ' +
            (d.to === 'base' ? (d.p === me ? 'your base' : 'their base')
                             : bfnm(+d.to.slice(2)));
          break;
        }
        case 'showdownOpen': t = 'Showdown at ' + bfnm(d.bf); break;
        case 'combatDamage': t = 'Might ' + d.attackerMight + ' vs ' + d.defenderMight; break;
        case 'die': t = nm(d.iid) + ' was destroyed'; break;
        case 'conquer': t = you(d.p) + ' conquered ' + bfnm(d.bf); break;
        // The event carries the new TOTAL, not the delta (js/abilities.js, js/ops-unl.js all
        // log `xp` after assigning), so the line states the total. Deriving a delta from the
        // previous xp line would be wrong on the first line of a truncated view, and a wrong
        // number is worse than one fewer number.
        case 'xp': t = you(d.p) + ' now have ' + d.xp + ' XP'; break;
        case 'score': cls = ' score'; t = you(d.p) + ' scored — ' + d.points + ' point' + (d.points === 1 ? '' : 's') +
          (d.how === 'hold' ? ' (hold)' : d.how === 'conquer' ? ' (conquer)'
            : d.how === 'burnOut' ? ' (they burned out)' : ''); break;
        case 'scoreDenied': t = you(d.p) + ' could not take the winning point by conquest — drew instead'; break;
        case 'burnOut': t = you(d.p) + ' ran out of cards — trash recycled, and a point conceded'; break;
        // Named, never enumerated: WHICH cards were looked at is the looker's alone.
        case 'look': t = you(d.p) + ' looked at the top ' + d.n + ' of ' +
          (d.p === me ? 'your' : 'their') + ' deck'; break;
        case 'recycle': t = you(d.p) + ' recycled ' + (d.n || 1) + ' card' + ((d.n || 1) === 1 ? '' : 's'); break;
        case 'hide': t = you(d.p) + ' hid a card face down at ' + bfnm(d.bf); break;
        case 'hiddenLost': t = you(d.p) + ' lost a facedown card with the battlefield'; break;
        case 'deflectPaid': t = you(d.p) + ' paid Deflect to choose ' + nm(d.iid); break;
        case 'gameOver': t = '<b>' + (d.winner === me ? 'You win.' : 'You lose.') + '</b>'; break;
        default: t = null;
      }
      if (t) lines.push('<div class="e' + (d.p === me ? ' mine' : '') + cls + (e.via ? ' via' : '') + '">' + t + '</div>');
    }
    // A player scrolled back to read what happened must not be yanked to the bottom by the
    // opponent's next action. In a six-line strip nobody noticed; in a full-height drawer
    // it is the difference between a log you can read and one you cannot.
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
    box.innerHTML = lines.join('');
    if (atBottom) box.scrollTop = box.scrollHeight;
  };
})(window.RB = window.RB || {});
