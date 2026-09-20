// Screens: title, deck picker, game, end. Deck choice is a screen, one seat at a time,
// and the title screen pre-picks a deck derived from the displayed seed so Start is never
// greyed out with a picker to walk first.
(function (RB) {
  'use strict';
  const $ = s => document.querySelector(s);

  RB.showScreen = function (id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  };

  let seed = String(Math.floor(Math.random() * 100000));
  let myDeck = null, theirDeck = null, difficulty = 'normal';

  RB.initScreens = function () {
    const decks = RB.playableDecks();
    if (!decks.length) throw new Error('every deck is out of circulation — see data/defects.js');
    myDeck = decks[RB.seedFromString(seed) % decks.length >>> 0 % decks.length] || decks[0];

    $('#seed').value = seed;
    $('#seed').oninput = e => { seed = e.target.value || '1'; };
    $('#start').onclick = () => { RB.audio.play('ui.click'); RB.showDeckPicker(); };
    $('#howto').onclick = () => $('#help').classList.toggle('hidden');
    $('#help').onclick = () => $('#help').classList.add('hidden');
    RB.showScreen('title');
    RB.audio.music('title');
    document.addEventListener('pointerdown', () => RB.audio.init(), { once: true });
  };

  RB.showDeckPicker = function () {
    RB.showScreen('deckpick');
    RB.audio.music('deckpick');
    const decks = RB.playableDecks();
    const grid = $('#deckgrid');
    grid.innerHTML = '';
    for (const d of decks) {
      const t = RB.el('decktile' + (d === myDeck ? ' sel' : ''));
      const legend = RB.card(d.legend);
      // The legend's name is already beside the tile, so the tile shows the art alone —
      // a name plate at this size covers the face and reads as a smudge.
      const c = RB.renderCard(legend, { size: 'board' });
      c.classList.add('tile-art');
      t.appendChild(c);
      const m = RB.el('');
      m.innerHTML = '<div class="nm">' + legend.name + '</div>' +
        '<div class="meta">' + d.domains.map(x =>
          '<span class="dombadge" style="color:var(--d-' + x + ')">' + x + '</span>').join('') +
        '<br>' + d.main.reduce((s, e) => s + e.qty, 0) + ' cards · ' + d.result + ' · ' + d.event + '</div>';
      t.appendChild(m);
      t.onclick = () => {
        RB.audio.play('ui.click');
        myDeck = d;
        for (const x of grid.children) x.classList.remove('sel');
        t.classList.add('sel');
      };
      grid.appendChild(t);
    }
    $('#difficulty').onchange = e => { difficulty = e.target.value; };
    $('#play').onclick = () => {
      const pool = decks.filter(d => d !== myDeck);
      const s0 = { rngSeed: RB.seedFromString(seed + ':rival') };
      theirDeck = pool[RB.rngInt(s0, pool.length)];
      const state = RB.newGame({ seed: seed, decks: [myDeck.id, theirDeck.id] });
      RB.autoMulligan(state);
      RB.startGame(state, 0, difficulty);
    };
    $('#back').onclick = () => { RB.showScreen('title'); RB.audio.music('title'); };
  };

  // The mulligan is a queue step for both seats. Keeping the opening simple tonight: the
  // AI tosses its two most expensive cards, and the human is offered the same choice.
  RB.autoMulligan = function (state) {
    // The human seat is index 0; its step is answered on the mulligan screen.
    void state;
  };

  RB.endScreen = function (state) {
    const won = state.winner === RB.ui.me;
    RB.audio.music(won ? 'victory' : 'defeat');
    RB.audio.play(won ? 'game.win' : 'game.lose');
    const o = $('#endover');
    o.classList.remove('hidden');
    o.querySelector('h2').textContent = won ? 'Victory' : 'Defeat';
    o.querySelector('.detail').textContent =
      state.players[RB.ui.me].points + ' – ' + state.players[RB.opponentOf(RB.ui.me)].points +
      ' after ' + state.turn + ' turns.';
    o.querySelector('.again').onclick = () => {
      o.classList.add('hidden');
      seed = String(Math.floor(Math.random() * 100000));
      $('#seed').value = seed;
      RB.showDeckPicker();
    };
  };
})(window.RB = window.RB || {});
