// One renderer, three sizes. Art is the card: it covers the face edge to edge, the text
// floats on it over a scrim, and the only content difference between sizes is the detail
// block, which renders at preview size only. CARD-PRESENTATION-SPEC.md §1-§6.
(function (RB) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  RB.renderCard = function (card, opts) {
    opts = opts || {};
    const size = opts.size || 'board';
    const el = document.createElement('div');
    el.className = 'card card-' + size + ' dom-' + (card.domain || 'Colorless');
    el.dataset.defId = card.id;
    if (opts.iid) el.dataset.iid = opts.iid;

    const art = document.createElement('div');
    art.className = 'card-art';
    art.appendChild(RB.artFor(card, size));
    el.appendChild(art);

    const corners = document.createElement('div');
    corners.className = 'card-corners';
    // A domain is a colour, not a letter: Calm and Chaos both start with C, and a "C" pip
    // read as the wrong domain on the board. One coloured lozenge per domain, named in the
    // tooltip and spelled out in the preview where there is room.
    const doms = (card.domains && card.domains.length ? card.domains : [card.domain]).filter(Boolean);
    const left = document.createElement('span');
    left.className = 'pip dom';
    left.title = doms.join(' / ');
    left.innerHTML = doms.map(d =>
      '<span class="dot" style="background:var(--d-' + d + ')"></span>').join('') +
      (size === 'preview' ? '<span class="domname">' + esc(doms.join(' · ')) + '</span>' : '');
    corners.appendChild(left);
    if (card.energy != null || card.power != null) {
      const c = document.createElement('span');
      c.className = 'pip cost';
      c.innerHTML = (card.energy != null ? esc(card.energy) : '') +
        (card.power ? ' <span class="ic ic-power">' + '◈'.repeat(Math.min(card.power, 4)) + '</span>' : '');
      corners.appendChild(c);
    }
    el.appendChild(corners);

    const plate = document.createElement('div');
    plate.className = 'card-plate';
    plate.innerHTML =
      '<div class="card-name">' + esc(card.name) + '</div>' +
      // The printed face sets the subtitle on its own line under the name, inside the same
      // band — smaller, uppercase, italic. It is part of the name for every rules purpose
      // (two Rengars are two names), so it is not decoration and does not get dropped at
      // small sizes: a board with "Rengar" twice on it cannot be read.
      (card.subtitle ? '<div class="card-subtitle">' + esc(card.subtitle) + '</div>' : '') +
      '<div class="card-type">' + esc(card.type) +
        ((card.tags && card.tags.length) ? ' · ' + esc(card.tags.join(' ')) : '') + '</div>';
    const kws = keywordNames(card);
    if (kws.length) plate.innerHTML += '<div class="card-kw">' + kws.map(esc).join('  ·  ') + '</div>';
    if (size === 'preview') {
      const txt = RB.printedText(card.id);
      if (txt) plate.innerHTML += '<div class="card-detail">' + RB.iconHTML(esc(txt)) + '</div>';
    }
    el.appendChild(plate);

    // A card whose ability the grammar cannot yet say is marked on its own face, with the
    // missing clause in the tooltip. An unmarked partial card is the failure mode that
    // matters; this is the opposite of it.
    if (RB.isPartial(card.id)) {
      el.classList.add('card-partial');
      const w = document.createElement('div');
      w.className = 'partial-mark';
      w.textContent = '!';
      w.title = 'Not yet implemented: ' + RB.partialReason(card.id);
      el.appendChild(w);
      if (size === 'preview')
        plate.innerHTML += '<div class="partial-note">Not yet implemented — ' +
          esc(RB.partialReason(card.id)) + '. This card plays as its printed body only.</div>';
    }

    if (card.might != null) {
      const st = document.createElement('div');
      st.className = 'card-stats';
      st.innerHTML = '<span class="stat mt">' + esc(card.might) + '</span>';
      el.appendChild(st);
    }
    return el;
  };

  // Grants aggregated the way RB.keywordValue reads them: one entry per name, values summed.
  // A valueless grant of a name that also arrives with a value contributes 0 to the sum, so
  // Assault + Assault 2 is Assault 2 and not Assault 3 \u2014 same arithmetic as the engine.
  function grantedNames(granted) {
    const order = [], val = Object.create(null);
    for (const k of granted) {
      const name = typeof k === 'string' ? k : k.name;
      if (!(name in val)) { order.push(name); val[name] = 0; }
      val[name] += typeof k === 'string' ? 0 : (k.value || 0);
    }
    return order.map(n => n + (val[n] ? ' ' + val[n] : ''));
  }

  function addKw(band, text) {
    const sp = document.createElement('span');
    sp.className = 'gr';
    sp.textContent = (band.textContent ? '  \u00b7  ' : '') + text;
    band.appendChild(sp);
  }

  function keywordNames(card) {
    const ab = card.abilities;
    if (!ab || !ab.keywords) return [];
    return ab.keywords.map(k => (typeof k === 'string' ? k : k.name + (k.value ? ' ' + k.value : '')));
  }

  // Art: a generated render when one exists, the procedural painting otherwise. A half
  // generated art folder still plays, and every card looks consistent across runs.
  RB.artFor = function (card, size) {
    const w = size === 'preview' ? 420 : size === 'hand' ? 170 : 140;
    const h = Math.round(w * 7 / 5);
    const src = RB.artUrl(card);
    if (src) {
      const img = document.createElement('img');
      img.className = 'art art-painted'; img.src = src; img.alt = '';
      // A generated render that fails to load falls back to the painting for that card —
      // this is an asset fallback, not a module fallback.
      img.onerror = function () { img.replaceWith(asCanvas(RB.procArt(card, w, h))); };
      return img;
    }
    return asCanvas(RB.procArt(card, w, h));
  };
  function asCanvas(v) {
    if (typeof v !== 'string') return v;
    const img = document.createElement('img');
    img.className = 'art art-painted'; img.src = v; img.alt = '';
    return img;
  }
  // Generated art is opt-in per id: art/manifest.js lists what exists, so a missing folder
  // never produces a broken image.
  RB.artUrl = function (card) {
    return (RB.artManifest && RB.artManifest[card.id]) ? 'art/cards/' + card.id + '.webp' : null;
  };

  // decorate() adds the live-instance state: exhaust tilt, damage, buffs, roles. Kept
  // separate from renderCard so the same renderer serves a card with no state at all.
  RB.decorate = function (el, state, iid) {
    const o = RB.obj(state, iid);
    el.classList.toggle('is-exhausted', !!o.exhausted);
    el.classList.toggle('is-token', !!o.token);
    const stat = el.querySelector('.stat.mt');
    if (stat) {
      const m = RB.mightOf(state, iid);
      const base = RB.card(o.cardId).might || 0;
      stat.textContent = m;
      stat.classList.toggle('buffed', m > base);
      if (o.damage > 0) {
        stat.classList.add('hurt');
        stat.textContent = (m - o.damage) + '/' + m;
      }
    }
    if (o.role) el.dataset.role = o.role;
    // renderCard puts the PRINTED keywords on the face. A granted one is live state, and it
    // was invisible: Master Yi (unl-113) crossing 6 XP silently gains Deflect and Ganking
    // through two conditional statics, and his card looked identical before and after. Both
    // channels land here \u2014 RB.grantedOn returns the instance's "this turn" grants and every
    // static whose `when` currently holds \u2014 so an "until end of turn" grant shows too.
    //
    // Aggregated by name with values summed, which is the rule RB.keywordValue already
    // applies: a unit granted Assault and Assault 2 has Assault 3, and printing
    // "+Assault \u00b7 +Assault 2" invited the reader to do arithmetic the engine had already
    // done. Prefixed "+" and in its own colour because a grant SUMS with a printed keyword
    // of the same name \u2014 "Assault 1 \u00b7 +Assault 2" is a unit with Assault 3, not a
    // contradiction.
    const gr = grantedNames(RB.grantedOn(state, iid));
    if (gr.length) {
      const plate = el.querySelector('.card-plate');
      let band = el.querySelector('.card-kw');
      if (!band) {
        band = document.createElement('div');
        band.className = 'card-kw';
        // Ahead of the preview-only detail block and the partial note, so the band sits with
        // the printed keywords rather than under the rules text.
        plate.insertBefore(band, plate.querySelector('.card-detail'));
      }
      // "The small card shows identity; the big view shows everything"
      // (CARD-PRESENTATION-SPEC.md \u00a70.3). Five grants at board size is 70px of unreadable
      // text that overflows the plate and runs under the Might number \u2014 measured, with a
      // damaged stat, not assumed. The board card says which grants it has room to name and
      // how many more there are; the preview names them all.
      const preview = el.classList.contains('card-preview');
      const show = preview ? gr : gr.slice(0, 3);
      for (const name of show) addKw(band, '+' + name);
      if (show.length < gr.length) addKw(band, '+' + (gr.length - show.length) + ' more');
    }
    return el;
  };

  RB.cardBack = function (size) {
    const el = document.createElement('div');
    el.className = 'card card-' + (size || 'hand') + ' card-back';
    return el;
  };
})(window.RB = window.RB || {});
