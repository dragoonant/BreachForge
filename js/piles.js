// The two piles that were a number on a label and nothing else: the main deck and the
// trash. Both are rendered on the board as a real pile you can click, and the click opens
// an inspector.
//
// WHAT EACH PILE IS ALLOWED TO SHOW is the whole of this file's judgement, and the two
// piles are not the same:
//
//   TRASH — public, both seats, in stack order. Discards, dead units and spent spells all
//   go here face up in front of everyone, and the ORDER is the information: "what did they
//   pitch, and when" is a real read. Shown top-of-pile first, which is the order a player
//   would turn them over.
//
//   DECK — YOURS ONLY, and NOT in draw order. Which cards remain is legitimate: you built
//   the deck, you may count what is left of it. The SEQUENCE is not — no physical game lets
//   you read your own deck top to bottom, and showing it would hand the player perfect
//   knowledge of every draw for the rest of the game. So the list is grouped and sorted by
//   cost, exactly the way the pre-game deck list is, and the draw order is never rendered
//   anywhere a player can reach it.
//
//   THEIR DECK — a back and a count. No id, no data- attribute, no tooltip, for the same
//   reason paintThemHand has none: the DOM is readable with devtools.
(function (RB) {
  'use strict';
  const $ = s => document.querySelector(s);

  // A pile on the board: a card back (or the top of the trash, face up, because that IS
  // what a trash pile looks like) with a count under it.
  RB.pileFace = function (state, p, which, mine) {
    const P = state.players[p];
    const list = which === 'deck' ? P.deck : P.trash;
    const box = RB.el('pile' + (list.length ? '' : ' empty'));
    const canOpen = which === 'trash' ? list.length > 0 : (mine && list.length > 0);

    if (which === 'trash' && list.length) {
      // The top of the trash is the last card sent there, and it is face up in the real
      // game, so it is face up here.
      const top = RB.cardOf(state, list[list.length - 1]);
      box.appendChild(RB.renderCard(top, { size: 'board' }));
    } else {
      // Board size, not tiny: these sit in the side zone beside the base row and must read
      // as the same furniture as the cards next to them.
      box.appendChild(RB.el('card card-board card-back'));
    }

    const n = RB.el('pile-n');
    n.textContent = (which === 'deck' ? 'DECK ' : 'TRASH ') + list.length;
    box.appendChild(n);

    if (canOpen) {
      box.classList.add('can-open');
      box.title = which === 'trash'
        ? (mine ? 'Your' : 'Their') + ' trash — click to look through it'
        : 'Your deck — click to see what is left';
      box.addEventListener('click', ev => {
        ev.stopPropagation();
        RB.audio.play('ui.click');
        RB.showPile(state, p, which, mine);
      });
    } else if (which === 'deck' && !mine) {
      box.title = 'Their deck — ' + list.length + ' cards left';
    }
    return box;
  };

  RB.showPile = function (state, p, which, mine) {
    const ov = $('#pileview');
    const box = ov.querySelector('.panel');
    const P = state.players[p];
    const list = which === 'deck' ? P.deck : P.trash;
    box.innerHTML = '';

    const title = which === 'trash'
      ? (mine ? 'Your trash' : "Their trash")
      : 'Your deck';
    const sub = which === 'trash'
      ? list.length + ' card' + (list.length === 1 ? '' : 's') + ' — top of the pile first'
      : list.length + ' card' + (list.length === 1 ? '' : 's') + ' left, ' +
        'sorted by cost. The draw order is not shown — knowing it would be knowing ' +
        'every draw for the rest of the game.';
    box.insertAdjacentHTML('beforeend',
      '<h2 style="margin-bottom:.2rem">' + title + '</h2>' +
      '<div style="color:#9fb0cc;font-size:.74rem;margin-bottom:.9rem;max-width:34rem;' +
      'margin-left:auto;margin-right:auto">' + sub + '</div>');

    const grid = RB.el('pile-grid');
    if (!list.length) {
      grid.innerHTML = '<div style="color:#7d8ea8;font-size:.8rem">Empty.</div>';
    } else {
      // Trash keeps its stack order, reversed so the most recent card reads first. The
      // deck is sorted, which is the whole point — see the header of this file.
      const order = which === 'trash'
        ? list.slice().reverse()
        : list.slice().sort((a, b) => {
            const ca = RB.cardOf(state, a), cb = RB.cardOf(state, b);
            return (ca.energy || 0) - (cb.energy || 0) || ca.name.localeCompare(cb.name);
          });
      order.forEach((iid, i) => {
        const card = RB.cardOf(state, iid);
        const cell = RB.el('pile-cell');
        const c = RB.renderCard(card, { size: 'hand' });
        cell.appendChild(c);
        if (which === 'trash') {
          const n = RB.el('pile-ix');
          n.textContent = i === 0 ? 'TOP' : String(i + 1);
          cell.appendChild(n);
        }
        // Hover reads the card at full preview size, the same as anywhere else on the
        // board. A pile you can see but not read is a list of names.
        cell.addEventListener('mouseenter', () => RB.showPreview(cell, card));
        cell.addEventListener('mouseleave', RB.hidePreview);
        grid.appendChild(cell);
      });
    }
    box.appendChild(grid);

    const foot = RB.el('');
    foot.style.cssText = 'margin-top:1rem';
    const close = RB.el('btn primary', 'button');
    close.textContent = 'Close';
    close.onclick = RB.hidePile;
    foot.appendChild(close);
    box.appendChild(foot);
    ov.classList.remove('hidden');
  };

  RB.hidePile = function () {
    RB.hidePreview();
    $('#pileview').classList.add('hidden');
  };
})(window.RB = window.RB || {});
