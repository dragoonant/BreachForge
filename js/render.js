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
    const left = document.createElement('span');
    left.className = 'pip dom';
    left.style.color = 'var(--d-' + (card.domain || 'Colorless') + ')';
    left.textContent = (card.domains && card.domains.length ? card.domains : [card.domain])
      .filter(Boolean).map(d => d[0]).join('');
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
      '<div class="card-type">' + esc(card.type) +
        ((card.tags && card.tags.length) ? ' · ' + esc(card.tags.join(' ')) : '') + '</div>';
    const kws = keywordNames(card);
    if (kws.length) plate.innerHTML += '<div class="card-kw">' + kws.map(esc).join('  ·  ') + '</div>';
    if (size === 'preview') {
      const txt = RB.printedText(card.id);
      if (txt) plate.innerHTML += '<div class="card-detail">' + RB.iconHTML(esc(txt)) + '</div>';
    }
    el.appendChild(plate);

    if (card.might != null) {
      const st = document.createElement('div');
      st.className = 'card-stats';
      st.innerHTML = '<span class="stat mt">' + esc(card.might) + '</span>';
      el.appendChild(st);
    }
    return el;
  };

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
    return el;
  };

  RB.cardBack = function (size) {
    const el = document.createElement('div');
    el.className = 'card card-' + (size || 'hand') + ' card-back';
    return el;
  };
})(window.RB = window.RB || {});
