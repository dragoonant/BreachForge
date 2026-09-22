// The choice modal. The board answers a targeting question by highlighting the real
// cards — which works for every answer the board actually DRAWS, and for nothing else.
//
// A question whose answers live in a deck, a trash or a facedown zone has no card on the
// table to click, and for a while that is exactly what a player saw: Stacked Deck
// (ogn-183) reads "Look at the top 3 cards of your Main Deck. Put 1 into your hand" and
// the game looked at them, picked one and moved on without ever showing the three. The
// engine was already parking the question (js/abilities.js, RB.offerChoice); there was
// simply nowhere for it to be asked.
//
// CARD-LOG-AND-TARGETING-SPEC.md §10 decides which of the two surfaces to use, IN CODE
// rather than per card: every option the board drew -> highlight in place; anything else
// -> this modal, showing the real faces. §13 is the panel and the peek.
(function (RB) {
  'use strict';
  const $ = s => document.querySelector(s);
  const U = RB.ui = RB.ui || {};

  // Peek lives in the view layer, never in game state: it is a way of LOOKING at the
  // game, not a move in it, and undo must never bring it back. Keyed to the identity of
  // the question so a new one is never hidden on arrival.
  U.peekKey = null;

  const keyOf = q => q.key + '|' + q.options.join(',');

  // "Is this option a card the board just drew?" asked of the DOM, not of a list of zone
  // names. The board is repainted immediately before this runs, so the DOM is the truth,
  // and a zone that later starts or stops drawing its cards cannot desync a hand-written
  // table from it.
  function onBoard(iid) {
    return !!document.querySelector('#game [data-iid="' + iid + '"]');
  }

  // The open question, if it is mine and the board cannot show me the answers.
  RB.ui.offBoardChoice = function (state, me) {
    const q = state.queue[0];
    if (!q || q.kind !== 'target' || q.who !== me) return null;
    if (!q.options.length) return null;
    return q.options.every(onBoard) ? null : q;
  };

  RB.paintChoiceModal = function (state, me) {
    const ov = $('#choicemodal');
    const q = RB.ui.offBoardChoice(state, me);
    if (!q) { ov.className = 'hidden'; ov.innerHTML = ''; U.peekKey = null; return; }

    const key = keyOf(q);
    if (U.peekKey && U.peekKey !== key) U.peekKey = null;   // a new question is never hidden
    ov.className = U.peekKey === key ? 'peek' : '';
    ov.innerHTML = '';

    const box = RB.el('choice-panel');
    const src = q.source ? RB.cardOf(state, q.source) : null;
    const head = RB.el('choice-prompt');
    // The card that is talking, then what it is asking. Both, for the same reason the
    // yes/no prompt carries both: the name says what spoke, the question says what the
    // answer costs and buys.
    head.textContent = (src ? src.name + ' — ' : '') +
      (q.label || 'Choose ' + q.n + (q.n === 1 ? ' card' : ' cards'));
    box.appendChild(head);

    const left = q.n - U.picks.length;
    const hint = RB.el('choice-hint');
    hint.textContent = 'Click ' + left + ' card' + (left === 1 ? '' : 's') +
      (q.n > 1 ? ' — ' + U.picks.length + ' of ' + q.n + ' selected' : '') +
      '. Hover to read one at full size.';
    box.appendChild(hint);

    const row = RB.el('choice-cards');
    for (const iid of q.options) {
      const c = RB.renderCard(RB.cardOf(state, iid), { size: 'hand', iid: iid });
      // The same wiring board cards get, so these keep the hover preview and the click.
      // Without the preview they cannot be READ before one is picked, which is the whole
      // point of showing them.
      RB.ui.bindCard(c, state, iid, null);
      row.appendChild(c);
    }
    box.appendChild(row);

    const controls = RB.el('choice-controls');
    if (U.picks.length) {
      const clear = RB.el('btn', 'button');
      clear.textContent = 'Clear';
      clear.onclick = () => { U.picks = []; RB.paintBoard(state, me); };
      controls.appendChild(clear);
    }
    // Picking usually depends on what is already on the table, which this panel is
    // covering. Let the player push it aside WITHOUT answering.
    const hide = RB.el('btn', 'button');
    hide.textContent = 'Hide — check the board';
    hide.onclick = () => setPeek(key, true);
    controls.appendChild(hide);
    box.appendChild(controls);
    ov.appendChild(box);

    // Outside the panel, so it survives while the panel is hidden.
    const pill = RB.el('choice-restore', 'button');
    pill.textContent = 'Show the cards';
    pill.onclick = () => setPeek(key, false);
    ov.appendChild(pill);
  };

  // Toggled straight on the DOM, not through a repaint: nothing about the game should
  // move because the player looked behind the panel.
  function setPeek(key, on) {
    U.peekKey = on ? key : null;
    RB.audio.play('ui.click');
    $('#choicemodal').className = on ? 'peek' : '';
  }

  // Escape toggles the peek, both directions. Bound once at startup — the overlay's
  // contents are rebuilt on every repaint and a listener per painting would leak.
  RB.initChoiceKeys = function () {
    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      const ov = $('#choicemodal');
      if (ov.classList.contains('hidden')) return;
      const q = RB.ui.offBoardChoice(U.state, U.me);
      if (!q) return;
      ev.preventDefault();
      setPeek(keyOf(q), U.peekKey === null);
    });
  };
})(window.RB = window.RB || {});
