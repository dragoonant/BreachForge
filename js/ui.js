// Interaction. Every affordance here is derived from RB.legalActions — the UI cannot
// invent a rule. Tap inspects; a second tap on a legal destination commits.
(function (RB) {
  'use strict';
  const $ = s => document.querySelector(s);
  const U = RB.ui = RB.ui || {};
  U.sel = null;          // the selected hand card or unit
  U.toss = [];           // cards set aside during the mulligan
  U.state = null;
  U.me = 0;
  U.difficulty = 'normal';

  RB.startGame = function (state, me, difficulty) {
    U.state = state; U.me = me; U.difficulty = difficulty || 'normal'; U.sel = null;
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
    soundFor(U.state, before);
    RB.step();
  };

  // The audio layer rides the log: a new entry with a sound tag voices at the moment of
  // the picture, and a tag with no clip is simply ignored.
  function soundFor(after, before) {
    for (let i = before.log.length; i < after.log.length; i++) {
      const e = after.log[i];
      if (!e.sound) continue;
      if (e.kind === 'score') RB.audio.play('point.score', { points: e.data.points, mine: e.data.p === U.me });
      else RB.audio.play(e.sound);
    }
  }

  // --- selection ------------------------------------------------------------
  U.bindCard = function (elm, state, iid, role) {
    elm.addEventListener('mouseenter', () => RB.showPreview(elm, RB.cardOf(state, iid)));
    elm.addEventListener('mouseleave', RB.hidePreview);
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
    const mine = acts.filter(a => a.iid === iid && (a.t === 'play' || a.t === 'move' || a.t === 'activate'));
    if (!mine.length) return;
    elm.style.cursor = 'pointer';
    if (U.sel === iid) elm.style.outline = '2px solid var(--accent)';
    elm.addEventListener('click', ev => {
      ev.stopPropagation();
      RB.audio.play('ui.click');
      const dests = mine.filter(a => a.t !== 'activate');
      const act = mine.find(a => a.t === 'activate');
      if (!dests.length && act) return RB.commit(act);
      // One destination is not a choice — spells (no destination at all), units that can
      // only go to the base, and single-target gear all commit on the first click.
      if (dests.length === 1) return RB.commit(dests[0]);
      U.sel = (U.sel === iid) ? null : iid;
      RB.paintBoard(state, U.me);
    });
  };

  U.bindDrop = function (box, state, me) {
    box.addEventListener('click', () => {
      if (!U.sel) return;
      const to = box.dataset.drop;
      const a = RB.legalActions(state).find(x => x.iid === U.sel && x.to === to);
      if (!a) { RB.audio.play('ui.invalid'); return; }
      RB.commit(a);
    });
    if (U.sel && RB.legalActions(state).some(x => x.iid === U.sel && x.to === box.dataset.drop))
      box.classList.add('dropok');
    void me;
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
    const say = t => { const d = RB.el(''); d.innerHTML = t; p.appendChild(d); };
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

    // A card-driven choice names the card and shows its printed text, so a "may" reads as a
    // question about a card rather than a bare yes/no.
    const q = state.queue[0];
    if (q && (q.kind === 'may' || q.kind === 'choose')) {
      const src = q.source ? RB.cardOf(state, q.source) : null;
      say((src ? '<b>' + src.name + '</b> — ' : '') +
        '<span style="color:#cfe6ff">' + (q.prompt || (src ? RB.iconHTML(RB.printedText(src.id)) : 'Choose.')) + '</span>');
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
      say('A card is on the chain. Respond, or pass to let it resolve.');
      btn('Pass', () => RB.commit({ t: 'pass' }), 'primary');
      return;
    }
    if (U.sel) {
      const dests = acts.filter(a => a.iid === U.sel);
      say('<b>' + RB.cardOf(state, U.sel).name + '</b> selected — click a highlighted destination.' +
        (dests.length ? '' : ' <span style="color:#ff9a8a">No legal destination.</span>'));
      btn('Cancel', () => { U.sel = null; RB.paintBoard(state, me); });
      return;
    }
    const plays = new Set(acts.filter(a => a.t === 'play').map(a => a.iid)).size;
    const moves = new Set(acts.filter(a => a.t === 'move').map(a => a.iid)).size;
    const held = state.players[me].hand.length;
    say('Your main phase — <b>' + plays + '</b> of ' + held + ' card' + (held === 1 ? '' : 's') +
      ' playable, <b>' + moves + '</b> unit' + (moves === 1 ? '' : 's') + ' can move.' +
      (plays === 0 && held > 0 ? ' <span style="color:#9fb0cc">Hover a card to see what it needs.</span>' : ''));
    btn('End turn', () => RB.commit({ t: 'endTurn' }), 'primary');
  };

  // --- preview --------------------------------------------------------------
  let previewEl = null;
  RB.showPreview = function (anchor, card) {
    RB.hidePreview();
    const box = $('#preview');
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
  RB.hidePreview = function () { $('#preview').classList.add('hidden'); previewEl = null; };

  // --- log ------------------------------------------------------------------
  RB.paintLog = function (state, me) {
    const box = $('#log');
    const nm = iid => RB.cardOf(state, iid).name;
    const you = p => (p === me ? 'You' : 'They');
    const lines = [];
    for (const e of state.log.slice(-60)) {
      const d = e.data || {};
      let t = null, cls = '';
      switch (e.kind) {
        case 'turnStart': t = '— ' + (d.p === me ? 'Your turn' : 'Their turn') + ' ' + d.turn + ' —'; break;
        case 'play': t = you(d.p) + ' played <b>' + nm(d.iid) + '</b>'; break;
        case 'move': t = you(d.p) + ' moved <b>' + nm(d.iid) + '</b>'; break;
        case 'showdownOpen': t = 'Showdown at <b>' + RB.card(state.bf[d.bf].cardId).name + '</b>'; break;
        case 'combatDamage': t = 'Might ' + d.attackerMight + ' vs ' + d.defenderMight; break;
        case 'die': t = '<b>' + nm(d.iid) + '</b> was destroyed'; break;
        case 'conquer': t = you(d.p) + ' conquered <b>' + RB.card(state.bf[d.bf].cardId).name + '</b>'; break;
        case 'score': cls = ' score'; t = you(d.p) + ' scored — ' + d.points + ' point' + (d.points === 1 ? '' : 's') +
          (d.how === 'hold' ? ' (hold)' : d.how === 'conquer' ? ' (conquer)' : ''); break;
        case 'scoreDenied': t = you(d.p) + ' could not take the winning point by conquest — drew instead'; break;
        case 'gameOver': t = '<b>' + (d.winner === me ? 'You win.' : 'You lose.') + '</b>'; break;
        default: t = null;
      }
      if (t) lines.push('<div class="e' + (d.p === me ? ' mine' : '') + cls + (e.via ? ' via' : '') + '">' + t + '</div>');
    }
    // Collapsed, only the tail is visible; the CSS mask fades the cut so it reads as a
    // battle line rather than a clipped panel.
    box.innerHTML = lines.join('');
    box.scrollTop = box.scrollHeight;
  };
})(window.RB = window.RB || {});
