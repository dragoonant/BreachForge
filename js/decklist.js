// The deck inspector. A practice tool the player cannot read their own list in is half a
// tool: this renders a deck by type, grouped and counted, with every card readable at
// preview size and every partial card marked.
(function (RB) {
  'use strict';

  RB.showDeckList = function (deck) {
    const ov = document.getElementById('decklist');
    const box = ov.querySelector('.panel');
    const legend = RB.card(deck.legend);
    const partial = RB.deckPartials(deck);

    const group = entries => {
      const by = {};
      for (const e of entries) {
        const c = RB.card(e.id);
        (by[c.type] = by[c.type] || []).push({ c: c, qty: e.qty });
      }
      for (const k of Object.keys(by))
        by[k].sort((a, b) => (a.c.energy || 0) - (b.c.energy || 0) ||
          RB.fullName(a.c).localeCompare(RB.fullName(b.c)));
      return by;
    };

    box.innerHTML = '';
    const head = RB.el('');
    head.style.cssText = 'display:flex;align-items:center;gap:1rem;margin-bottom:.9rem;text-align:left';
    const lc = RB.renderCard(legend, { size: 'board' });
    lc.style.width = '5rem';
    head.appendChild(lc);
    head.insertAdjacentHTML('beforeend',
      '<div><div style="font-size:1.3rem">' + legend.name + '</div>' +
      '<div style="color:#9fb0cc;font-size:.78rem">' + deck.domains.join(' · ') + ' — ' +
      deck.main.reduce((n, e) => n + e.qty, 0) + ' main deck, 12 runes, ' +
      deck.battlefields.reduce((n, e) => n + e.qty, 0) + ' battlefields (one used)<br>' +
      deck.result + ' · ' + deck.event + '</div>' +
      (partial.length ? '<div class="partialbadge" style="margin-top:.3rem">' + partial.length +
        ' card' + (partial.length === 1 ? '' : 's') + ' not yet fully implemented</div>' : '') +
      '</div>');
    box.appendChild(head);

    const cols = RB.el('');
    cols.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));' +
      'gap:.9rem;text-align:left;max-height:56vh;overflow:auto';
    const by = group(deck.main.concat(deck.battlefields));
    for (const type of ['Unit', 'Spell', 'Gear', 'Battlefield']) {
      if (!by[type]) continue;
      const col = RB.el('');
      // A deck registers three battlefields and plays one, chosen at random at setup
      // (§486). Listing three with no note reads as three on the table, which is the
      // question the board itself raises.
      const note = type === 'Battlefield'
        ? '<div style="font-size:.6rem;color:#7d8ea8;margin:-.15rem 0 .35rem;line-height:1.3">' +
          'One of these is drawn at random at setup; your opponent brings the other. ' +
          'Both start neutral.</div>'
        : '';
      col.innerHTML = '<div style="font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;' +
        'color:#7d8ea8;margin-bottom:.3rem">' + type + ' · ' +
        by[type].reduce((n, x) => n + x.qty, 0) + '</div>' + note;
      for (const { c, qty } of by[type]) {
        const row = RB.el('');
        row.style.cssText = 'display:flex;gap:.4rem;align-items:baseline;padding:.1rem 0;font-size:.8rem;cursor:help';
        row.innerHTML = '<span style="color:#7d8ea8;min-width:1.2rem">' + qty + '×</span>' +
          '<span class="dot" style="background:var(--d-' + (c.domain || 'Colorless') + ');' +
          'width:.5em;height:.5em;border-radius:50%;display:inline-block;flex:0 0 auto;align-self:center"></span>' +
          '<span>' + RB.fullName(c) + (RB.isPartial(c.id) ? ' <span style="color:#ffca63">!</span>' : '') + '</span>' +
          '<span style="flex:1"></span><span style="color:#9fb0cc">' +
          (c.energy != null ? c.energy : '') + (c.power ? '◈'.repeat(c.power) : '') + '</span>';
        row.addEventListener('mouseenter', () => RB.showPreview(row, c));
        row.addEventListener('mouseleave', RB.hidePreview);
        col.appendChild(row);
      }
      cols.appendChild(col);
    }
    box.appendChild(cols);

    const foot = RB.el('');
    foot.style.cssText = 'margin-top:1rem';
    const close = RB.el('btn primary', 'button');
    close.textContent = 'Close';
    close.onclick = () => { RB.hidePreview(); ov.classList.add('hidden'); };
    foot.appendChild(close);
    box.appendChild(foot);
    ov.classList.remove('hidden');
  };
})(window.RB = window.RB || {});
