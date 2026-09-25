// The board's DOM. paintBoard() is the ONLY way the board may be redrawn — it rebuilds
// every card element, so it always repaints selection state and re-wires click targets.
// A bare re-render elsewhere is how drag silently stopped working in a prior project.
(function (RB) {
  'use strict';
  const $ = s => document.querySelector(s);
  const el = (cls, tag) => { const d = document.createElement(tag || 'div'); d.className = cls || ''; return d; };

  RB.ui = RB.ui || {};

  RB.paintBoard = function (state, me) {
    const U = RB.ui;
    // Every card element below is about to be replaced; a preview anchored to one that
    // does not come back would hang over the new board.
    RB.dropStalePreview();
    // Computed once per repaint, not once per card: legalActions is not cheap and the
    // board asks about every card on it.
    U.actable = U.actableSet(state);
    const q = state.queue[0];
    const choosing = !!(q && q.kind === 'target' && q.who === me);
    document.getElementById('game').classList.toggle('choosing', choosing);
    // The log drawer covers the right of the board. While the player is being asked to
    // click a battlefield it stands aside, and it comes straight back afterwards.
    RB.syncLogDrawer(choosing);
    paintScores(state, me);
    paintThemHand(state, me);
    paintSide($('#side-them'), state, RB.opponentOf(me), false);
    paintSide($('#side-me'), state, me, true);
    paintBattlefields(state, me);
    paintHand(state, me);
    RB.paintChain(state, me);
    RB.paintLog(state, me);
    RB.paintPrompt(state, me);
    // Last: it asks the DOM which options the board just drew.
    RB.paintChoiceModal(state, me);
    void U;
  };

  function pipRow(n, victory, them) {
    const w = el('pips');
    for (let i = 0; i < victory; i++) {
      const p = el('sp' + (i < n ? ' on' : '') + (them ? ' them' : ''));
      if (i === victory - 1) p.classList.add('win');
      w.appendChild(p);
    }
    return w;
  }

  function paintScores(state, me) {
    const bar = $('#topbar');
    bar.innerHTML = '';
    const mk = (label, p, them) => {
      const w = el('scoreline');
      w.innerHTML = '<span style="font-size:.7rem;letter-spacing:.1em;color:#9fb0cc">' + label + '</span>';
      w.appendChild(pipRow(state.players[p].points, state.victoryScore, them));
      const n = el('', 'b'); n.textContent = state.players[p].points; n.style.marginLeft = '.25rem';
      w.appendChild(n);
      return w;
    };
    bar.appendChild(mk('YOU', me, false));
    const mid = el(''); mid.style.cssText = 'flex:1;text-align:center;font-size:.72rem;letter-spacing:.24em;color:#7d8ea8';
    mid.style.overflow = 'hidden'; mid.style.textOverflow = 'ellipsis';
    mid.textContent = 'TURN ' + state.turn + ' · ' + (state.active === me ? 'YOUR TURN' : 'THEIR TURN');
    bar.appendChild(mid);
    bar.appendChild(mk('RIVAL', RB.opponentOf(me), true));
    const btns = el(''); btns.style.cssText = 'display:flex;gap:.4rem;margin-left:.8rem';
    const mute = el('btn', 'button');
    mute.style.cssText = 'padding:.2rem .6rem;font-size:.7rem';
    mute.textContent = RB.audio.isMuted() ? '🔇' : '🔊';
    mute.onclick = () => { RB.audio.setMuted(!RB.audio.isMuted()); RB.paintBoard(state, me); };
    btns.appendChild(mute);
    const lg = el('btn', 'button');
    lg.style.cssText = 'padding:.2rem .6rem;font-size:.7rem';
    lg.textContent = 'Log';
    // The same one piece of state the pull tab toggles; the drawer is not DOM state.
    lg.onclick = () => { RB.toggleLog(); RB.audio.play('ui.click'); };
    btns.appendChild(lg);
    // The black box. "That card did something weird" becomes a file with a seed, two deck
    // ids and every action taken — one run of tools/replay-report.mjs instead of a
    // conversation.
    const bug = el('btn', 'button');
    bug.style.cssText = 'padding:.2rem .6rem;font-size:.7rem';
    bug.textContent = '🐞';
    bug.title = 'Save a bug trace — hand it to tools/replay-report.mjs';
    bug.onclick = () => {
      // The note is optional and never gates the save: window.prompt is suppressed
      // outright in some embedded browsers, where it returns null with no dialog shown.
      let note = '';
      try { note = window.prompt('What looked wrong?') || ''; } catch (e) { note = ''; }
      const name = RB.downloadBugReport(note);
      // Say so on the button itself. The file lands in a downloads folder the page cannot
      // see, so without this the only thing separating a successful save from a dead
      // button is whether the player thinks to go looking for the file.
      bug.textContent = '✓ saved';
      bug.title = 'Saved ' + name + ' — hand it to tools/replay-report.mjs';
      RB.audio.play('ui.click');
      setTimeout(() => {
        bug.textContent = '🐞';
        bug.title = 'Save a bug trace — hand it to tools/replay-report.mjs';
      }, 2200);
    };
    btns.appendChild(bug);
    bar.appendChild(btns);
  }

  function paintSide(root, state, p, mine) {
    root.innerHTML = '';
    const P = state.players[p];

    const lz = el('zone legendbox');
    lz.innerHTML = '<div class="lbl">Legend' + (P.champion ? ' · Champion' : '') + '</div>';
    const lrow = el('zonerow');
    const lc = RB.renderCard(RB.cardOf(state, P.legend), { size: 'board', iid: P.legend });
    RB.decorate(lc, state, P.legend);
    RB.ui.bindCard(lc, state, P.legend, mine ? 'legend' : null);
    lrow.appendChild(lc);
    // The Champion Zone is PUBLIC — both players can see the champion waiting there, and
    // it is playable from there all game, so it sits beside the legend rather than hiding.
    if (P.champion) {
      const cc = RB.renderCard(RB.cardOf(state, P.champion), { size: 'board', iid: P.champion });
      cc.classList.add('in-champion-zone');
      RB.decorate(cc, state, P.champion);
      RB.ui.bindCard(cc, state, P.champion, mine ? 'champion' : 'enemy');
      lrow.appendChild(cc);
    }
    lz.appendChild(lrow);
    root.appendChild(lz);

    // The main deck and the trash, as piles rather than two numbers on the rune label.
    // What each one is allowed to SHOW when clicked is decided in js/piles.js, and the
    // two are not the same: the trash is public to both seats, the deck is yours only and
    // never in draw order.
    //
    // Beside the legend, NOT at the far right of the row: the log drawer covers the right
    // of the board (it already clips the rune zone), so piles placed last were behind it
    // whenever the drawer was open — rendered, and invisible.
    const pz = el('zone piles');
    pz.innerHTML = '<div class="lbl">Piles</div>';
    const prow = el('zonerow');
    prow.appendChild(RB.pileFace(state, p, 'deck', mine));
    prow.appendChild(RB.pileFace(state, p, 'trash', mine));
    pz.appendChild(prow);
    root.appendChild(pz);

    const bz = el('zone base');
    bz.dataset.drop = mine ? 'base' : '';
    bz.innerHTML = '<div class="lbl">Base · ' + P.base.length + '</div>';
    paintZone(bz, mine ? 'base-mine' : 'base-theirs');
    const brow = el('zonerow');
    for (const iid of P.base) {
      const c = RB.renderCard(RB.cardOf(state, iid), { size: 'board', iid: iid });
      RB.decorate(c, state, iid);
      RB.ui.bindCard(c, state, iid, mine ? 'unit' : 'enemy');
      brow.appendChild(c);
    }
    bz.appendChild(brow);
    root.appendChild(bz);

    const rz = el('zone');
    rz.innerHTML = '<div class="lbl" title="Runes on board · Main deck · Trash">' +
      P.runes.length + 'R · ' + P.deck.length + 'D · ' + P.trash.length + 'T</div>';
    paintZone(rz, mine ? 'runes-mine' : 'runes-theirs');
    const rr = el('runes');
    for (const iid of P.runes) {
      const r = el('rune' + (RB.obj(state, iid).exhausted ? ' ex' : ''));
      r.style.color = 'var(--d-' + RB.cardOf(state, iid).domain + ')';
      r.title = RB.cardOf(state, iid).name + (RB.obj(state, iid).exhausted ? ' (exhausted)' : '');
      rr.appendChild(r);
    }
    const pool = el('');
    pool.style.cssText = 'font-size:.64rem;color:#9fb0cc;margin-top:.3rem;width:100%;line-height:1.5';
    const pw = Object.keys(P.pool.power).filter(d => P.pool.power[d] > 0)
      .map(d => '<span style="color:var(--d-' + d + ')">' + P.pool.power[d] + '◈</span>').join(' ');
    // What you can still pay for this turn, not just what is already in the pool — unspent
    // resources are lost at end of turn, so "available" is the number that matters.
    const ready = RB.runesReady(state, p);
    const avail = {};
    for (const i of ready) { const d = RB.cardOf(state, i).domain; avail[d] = (avail[d] || 0) + 1; }
    pool.innerHTML = (P.pool.energy ? '<b>' + P.pool.energy + '</b>⚡ ' : '') + pw +
      (mine ? '<div style="opacity:.8">can pay <b>' + (P.pool.energy + ready.length) + '</b>⚡ · ' +
        (Object.keys(avail).length
          ? Object.keys(avail).map(d => '<span style="color:var(--d-' + d + ')">' + avail[d] + '◈</span>').join(' ')
          : 'no Power') + '</div>' : '');
    rr.appendChild(pool);
    rz.appendChild(rr);
    root.appendChild(rz);
  }

  // The opponent's hand, across the table from yours: one back per card, fanned, with the
  // count in words beside it. It lived inside the rune zone under a -0.7rem overlap and a
  // playtester never found it — the count IS the information, and a row of five backs is
  // read at a glance in a way the numeral alone is not.
  //
  // NOTHING here names a card. No id, no data- attribute, no tooltip: the opponent's hand
  // is hidden information and the DOM is readable by anyone with devtools.
  //
  // THE ONE EXCEPTION is a card that buys the look. When the engine has parked a `target`
  // question at ME whose answers live in THEIR hand, the card that asked it said "they
  // reveal their hand" — you cannot be asked to choose from a hand you cannot see, and no
  // printed card asks you to. So the hand is drawn face up, for exactly as long as that
  // question is open, and it goes back to backs the moment it is answered. The WHOLE hand
  // is shown, not just the legal answers: "they reveal their hand" is a printed effect in
  // its own right and Sabotage's units are information the caster paid for.
  function revealedToMe(state, me) {
    const q = state.queue[0];
    if (!q || q.kind !== 'target' || q.who !== me) return null;
    const theirHand = state.players[RB.opponentOf(me)].hand;
    return q.options.some(iid => theirHand.includes(iid)) ? theirHand : null;
  }

  function paintThemHand(state, me) {
    const box = $('#them-hand');
    box.innerHTML = '';
    const n = state.players[RB.opponentOf(me)].hand.length;
    const shown = revealedToMe(state, me);
    if (shown) {
      const row = el('th-reveal');
      for (const iid of shown) {
        const c = RB.renderCard(RB.cardOf(state, iid), { size: 'hand', iid: iid });
        // bindCard's target branch sits ABOVE its "is it mine" guard, so a legal answer
        // becomes clickable and everything else stays a card you may only read.
        RB.ui.bindCard(c, state, iid, null);
        row.appendChild(c);
      }
      box.appendChild(row);
      const lbl = el('th-count th-revealed');
      lbl.textContent = 'HAND ' + n + ' — REVEALED';
      box.appendChild(lbl);
      return;
    }
    const fan = el('th-fan');
    // Past ten backs the fan is a smear and the numeral carries the rest.
    const drawn = Math.min(n, 10);
    for (let i = 0; i < drawn; i++) {
      const b = el('card card-tiny card-back');
      // A slight rotation across the fan (±6°) reads as cards held rather than stacked.
      const t = drawn === 1 ? 0 : (i / (drawn - 1)) * 2 - 1;
      b.style.transform = 'rotate(' + (t * 6).toFixed(1) + 'deg)';
      if (i) b.style.marginLeft = (drawn > 6 ? '-1.05rem' : '-0.6rem');
      fan.appendChild(b);
    }
    box.appendChild(fan);
    const lbl = el('th-count');
    lbl.textContent = 'HAND ' + n;
    box.appendChild(lbl);
  }

  // Paint a board area with its own image, behind a scrim. Same two knobs as the
  // battlefields and set lower still: these sit under cards AND under text, and a board
  // that competes with its own cards is a board that has to be turned off. A missing
  // image simply does not paint and the zone reads exactly as it did before.
  function paintZone(zone, name) {
    if (!(RB.boardArt || {})[name]) return;
    const art = el('zone-art');
    art.style.backgroundImage = 'url("art/board/' + name + '.webp")';
    zone.appendChild(art);
    zone.appendChild(el('zone-scrim'));
  }

  function paintBattlefields(state, me) {
    const row = document.querySelector('#bfrow');
    row.innerHTML = '';
    for (let i = 0; i < state.bf.length; i++) {
      const bf = state.bf[i];
      const card = RB.card(bf.cardId);
      const box = el('bf' +
        (bf.controller === me ? ' ctrl-me' : bf.controller === RB.opponentOf(me) ? ' ctrl-them' : '') +
        (bf.contestedBy !== null ? ' contested' : ''));
      box.dataset.drop = 'bf' + i;
      box.dataset.bf = i;

      // The battlefield paints itself with its own art. These images sit UNDER the cards
      // fighting over them, so the two knobs — art opacity and scrim — are deliberately
      // low; anything louder competes with the art on top of it. A battlefield with no
      // generated render simply does not paint, and the zone reads exactly as before.
      const art = RB.artUrl(card);
      if (art) {
        const layer = el('bf-art');
        layer.style.backgroundImage = 'url("' + art + '")';
        box.appendChild(layer);
        const scrim = el('bf-scrim');
        box.appendChild(scrim);
      }

      const lt = el('lane them');
      lt.style.position = 'relative'; lt.style.zIndex = '2';
      for (const iid of RB.unitsAt(state, i, RB.opponentOf(me))) lt.appendChild(unitEl(state, iid, false));
      box.appendChild(lt);

      const mid = el('');
      mid.style.position = 'relative'; mid.style.zIndex = '2';
      mid.innerHTML = '<div class="bfname">' + card.name +
        (bf.controller !== null ? (bf.controller === me ? ' — yours' : ' — theirs') : '') + '</div>' +
        '<div class="bftext">' + RB.iconHTML(RB.printedText(card.id)) + '</div>';
      box.appendChild(mid);

      const lm = el('lane');
      lm.style.position = 'relative'; lm.style.zIndex = '2';
      for (const iid of RB.unitsAt(state, i, me)) lm.appendChild(unitEl(state, iid, true));
      box.appendChild(lm);

      // A facedown card is visible as a card back to both players — its existence is
      // public, its identity is not. Only its owner is told what it is.
      for (const h of bf.hidden) {
        const back = el('card card-tiny card-back hidden-mark');
        back.style.cssText = 'position:absolute;bottom:.3rem;left:.35rem;z-index:3';
        back.title = h.owner === me
          ? RB.cardOf(state, h.iid).name + ' — hidden here' +
            (h.turnHidden >= state.turn ? ' (playable from next turn)' : ' (playable now)')
          : 'A facedown card';
        box.appendChild(back);
      }

      if (state.showdown && state.showdown.bf === i) {
        const s = el('');
        s.style.cssText = 'position:absolute;top:.25rem;right:.45rem;font-size:.62rem;letter-spacing:.12em;color:#ffca63';
        s.textContent = state.showdown.combat ? 'COMBAT' : 'SHOWDOWN';
        box.appendChild(s);
      }
      RB.ui.bindDrop(box, state, me);
      row.appendChild(box);
    }
    function unitEl(state, iid, mine) {
      const c = RB.renderCard(RB.cardOf(state, iid), { size: 'board', iid: iid });
      RB.decorate(c, state, iid);
      RB.ui.bindCard(c, state, iid, mine ? 'unit' : 'enemy');
      return c;
    }
  }

  function paintHand(state, me) {
    const h = document.querySelector('#hand');
    h.innerHTML = '';
    const playable = new Set(RB.legalActions(state).filter(a => a.t === 'play').map(a => a.iid));
    const P = state.players[me];
    const mull = state.queue.length && state.queue[0].kind === 'mulligan';
    for (const iid of P.hand) {
      const c = RB.renderCard(RB.cardOf(state, iid), { size: 'hand', iid: iid });
      if (!playable.has(iid) && !mull) {
        c.classList.add('unplayable');
        // Say why a disabled control is disabled, next to it, before the first click.
        const why = RB.whyCannotPay(state, me, RB.costOf(state, iid));
        c.title = why ? RB.cardOf(state, iid).name + ' — ' + why
                      : RB.cardOf(state, iid).name + ' — cannot be played right now';
      }
      RB.ui.bindCard(c, state, iid, 'hand');
      h.appendChild(c);
    }
  }
  RB.el = el;
})(window.RB = window.RB || {});
