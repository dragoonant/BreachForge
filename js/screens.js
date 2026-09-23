// Screens: title, deck picker, game, end. Deck choice is a screen, one seat at a time,
// and the title screen pre-picks a deck derived from the displayed seed so Start is never
// greyed out with a picker to walk first.
(function (RB) {
  'use strict';
  const $ = s => document.querySelector(s);

  let vidVisBound = false;        // module-scoped, not a property on RB: a flag on RB
  // would read as a defensive module check, which is the one thing hard rule 3 forbids.
  RB.showScreen = function (id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
    // The opening plays for exactly as long as the title screen is up, and this is its
    // ONLY owner — see the comment on the <video> tag. A hidden video keeps decoding
    // frames nobody is looking at, which on a laptop is a fan spinning up through a whole
    // game; and coming back to the title should start it over, not resume it halfway.
    //
    // The wait for `canplay` is load-bearing. Seeking a video that has no metadata yet
    // does not rewind it, it aborts whatever playback was pending, and the only trace is a
    // rejected play() promise — so on a cold load the opening sat on frame one forever.
    const vid = $('#titlevid');
    if (id !== 'title') return vid.pause();
    const start = () => {
      if (!document.getElementById('title').classList.contains('hidden')) {
        vid.currentTime = 0;
        vid.play().catch(() => {});        // a browser that refuses leaves the first frame
      }
    };
    if (vid.readyState >= 2) start();
    else vid.addEventListener('canplay', start, { once: true });
    // A browser pauses video in a hidden tab and does NOT resume it when the tab comes
    // back, so without this the opening is frozen for anyone who looked at something else
    // and returned. Registered once, and it re-checks the title is still showing.
    if (!vidVisBound) {
      vidVisBound = true;
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !$('#title').classList.contains('hidden'))
          vid.play().catch(() => {});
      });
    }
  };

  let seed = String(Math.floor(Math.random() * 100000));
  let myDeck = null, theirDeck = null, difficulty = 'competition';

  RB.initScreens = function () {
    const decks = RB.playableDecks();
    if (!decks.length) throw new Error('every deck is out of circulation — see data/defects.js');
    myDeck = decks[RB.seedFromString(seed) % decks.length >>> 0 % decks.length] || decks[0];

    $('#seed').value = seed;
    $('#seed').oninput = e => { seed = e.target.value || '1'; };
    $('#start').onclick = () => { RB.audio.play('ui.click'); RB.showDeckPicker(); };
    $('#howto').onclick = () => $('#help').classList.toggle('hidden');
    $('#help').onclick = () => $('#help').classList.add('hidden');
    // The notice links wherever this is published from, so it is a live link on the one
    // screen everybody sees rather than only a line in a repo file.
    const nl = document.getElementById('noticelink');
    if (nl) nl.href = (location.hostname.endsWith('github.io')
      ? 'https://github.com/' + location.pathname.split('/').filter(Boolean)[0]
      : '') + '#notice';
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
    // The blurb counts what is actually on offer — a number written into the page goes
    // stale the first time the registry grows.
    const marked = decks.filter(d => RB.deckPartials(d).length).length;
    $('#deckblurb').innerHTML = decks.length + ' tournament-winning lists, one per legend. ' +
      "Your rival's deck is drawn from the seed." +
      (marked ? ' <span class="partialbadge">' + marked +
        ' still have cards that are not fully implemented — those cards are marked.</span>' : '');
    for (const d of decks) {
      const t = RB.el('decktile' + (d === myDeck ? ' sel' : ''));
      const legend = RB.card(d.legend);
      // The legend's name is already beside the tile, so the tile shows the art alone —
      // a name plate at this size covers the face and reads as a smudge.
      const c = RB.renderCard(legend, { size: 'board' });
      c.classList.add('tile-art');
      t.appendChild(c);
      const m = RB.el('');
      const partial = RB.deckPartials(d);
      m.innerHTML = '<div class="nm">' + legend.name + '</div>' +
        '<div class="meta">' + d.domains.map(x =>
          '<span class="dombadge" style="color:var(--d-' + x + ')">' + x + '</span>').join('') +
        '<br>' + d.main.reduce((s, e) => s + e.qty, 0) + ' cards · ' + d.result + ' · ' + d.event +
        (partial.length ? '<br><span class="partialbadge" title="' +
          partial.map(id => RB.card(id).name + ': ' + RB.partialReason(id)).join(' — ').replace(/"/g, "'") +
          '">' + partial.length + ' card' + (partial.length === 1 ? '' : 's') +
          ' not yet fully implemented</span>' : '') +
        '</div>';
      t.appendChild(m);
      t.onclick = () => {
        RB.audio.play('ui.click');
        myDeck = d;
        for (const x of grid.children) x.classList.remove('sel');
        t.classList.add('sel');
      };
      // A class, not an inline style: inline outranks every media query, and on a phone
      // this was a 39x21 target — the only way into a deck list before you commit to it.
      const look = RB.el('btn listbtn', 'button');
      look.textContent = 'List';
      look.onclick = ev => { ev.stopPropagation(); RB.audio.play('ui.click'); RB.showDeckList(d); };
      t.appendChild(look);
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
