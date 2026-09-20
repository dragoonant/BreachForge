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
    paintScores(state, me);
    paintSide($('#side-them'), state, RB.opponentOf(me), false);
    paintSide($('#side-me'), state, me, true);
    paintBattlefields(state, me);
    paintHand(state, me);
    RB.paintLog(state, me);
    RB.paintPrompt(state, me);
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
    lg.onclick = () => { $('#log').classList.toggle('open'); RB.audio.play('ui.click'); };
    btns.appendChild(lg);
    // The black box. "That card did something weird" becomes a file with a seed, two deck
    // ids and every action taken — one run of tools/replay-report.mjs instead of a
    // conversation.
    const bug = el('btn', 'button');
    bug.style.cssText = 'padding:.2rem .6rem;font-size:.7rem';
    bug.textContent = '🐞';
    bug.title = 'Save a bug trace — hand it to tools/replay-report.mjs';
    bug.onclick = () => RB.downloadBugReport(window.prompt('What looked wrong?') || '');
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
      RB.ui.bindCard(cc, state, P.champion, mine ? 'champion' : null);
      lrow.appendChild(cc);
    }
    lz.appendChild(lrow);
    root.appendChild(lz);

    const bz = el('zone base');
    bz.dataset.drop = mine ? 'base' : '';
    bz.innerHTML = '<div class="lbl">Base · ' + P.base.length + '</div>';
    paintZone(bz, mine ? 'base-mine' : 'base-theirs');
    const brow = el('zonerow');
    for (const iid of P.base) {
      const c = RB.renderCard(RB.cardOf(state, iid), { size: 'board', iid: iid });
      RB.decorate(c, state, iid);
      RB.ui.bindCard(c, state, iid, mine ? 'unit' : null);
      brow.appendChild(c);
    }
    bz.appendChild(brow);
    root.appendChild(bz);

    const rz = el('zone');
    rz.innerHTML = '<div class="lbl" title="Runes on board · Main deck · Trash">' +
      P.runes.length + 'R · ' + P.deck.length + 'D · ' + P.trash.length + 'T</div>';
    paintZone(rz, mine ? 'runes-mine' : 'runes-theirs');
    if (!mine) {
      const th = el('', 'div'); th.id = 'them-hand'; th.style.paddingTop = '.85rem';
      for (let i = 0; i < P.hand.length; i++) {
        const b = el('card card-tiny card-back'); th.appendChild(b);
      }
      rz.appendChild(th);
    }
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
      RB.ui.bindCard(c, state, iid, mine ? 'unit' : null);
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
