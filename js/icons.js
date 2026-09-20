// Printed icon tokens. Showing the player raw bracket text is not fidelity, it is an
// untranslated dump. Every meaning here was confirmed against the comprehensive rules or
// against the ability data of a card that uses it; an UNKNOWN token keeps its literal
// text so a gap in this table is visible rather than invisible.
(function (RB) {
  'use strict';
  const T = {
    '[S]': { glyph: '⚔', cls: 'ic-might', title: 'Might' },        // rule 460.2: Might
    '[M]': { glyph: '⚔', cls: 'ic-might', title: 'Might' },
    '[E]': { glyph: '⟳', cls: 'ic-exhaust', title: 'Exhaust' },    // rule 165.3 rune ability
    '[T]': { glyph: '⟳', cls: 'ic-exhaust', title: 'Exhaust me' },
    '[C]': { glyph: '◈', cls: 'ic-power', title: 'Power' },        // rule 165.3: Power
    '[A]': { glyph: '◈', cls: 'ic-power', title: 'Power of any domain' },
    '[>]': { glyph: '➤', cls: 'ic-arrow', title: 'Activated ability' },
    // Domain shorthands, rules §134. [P] is CHAOS, not "power" — the one that reads wrong.
    '[R]': { glyph: '◈', cls: 'ic-d-fury', title: 'Fury Power' },
    '[G]': { glyph: '◈', cls: 'ic-d-calm', title: 'Calm Power' },
    '[B]': { glyph: '◈', cls: 'ic-d-mind', title: 'Mind Power' },
    '[O]': { glyph: '◈', cls: 'ic-d-body', title: 'Body Power' },
    '[P]': { glyph: '◈', cls: 'ic-d-chaos', title: 'Chaos Power' },
    '[Y]': { glyph: '◈', cls: 'ic-d-order', title: 'Order Power' },
  };
  const KEYWORDS = new Set(['Action', 'Reaction', 'Deathknell', 'Deflect', 'Tank', 'Ganking',
    'Hidden', 'Accelerate', 'Legion', 'Temporary', 'Mighty', 'Empower', 'Empowered', 'Assault',
    'Shield', 'Quick-Draw', 'Weaponmaster', 'Ambush', 'Repeat', 'Stun', 'Predict', 'Hunt',
    'Equip', 'Backline', 'Add', 'Vision', 'Genesis']);

  RB.iconHTML = function (text) {
    return String(text || '').replace(/\[([^\]]+)\]/g, function (whole, inner) {
      const t = T[whole];
      if (t) return '<span class="ic ' + t.cls + '" title="' + t.title + '">' + t.glyph + '</span>';
      if (/^\d+$/.test(inner))
        return '<span class="ic ic-energy" title="' + inner + ' Energy">' + inner + '</span>';
      const base = inner.split(' ')[0];
      if (KEYWORDS.has(base)) return '<span class="kw" title="' + base + '">' + inner + '</span>';
      return whole;      // unknown: keep the literal text so the gap is visible
    });
  };
  RB.iconTable = T;
})(window.RB = window.RB || {});
