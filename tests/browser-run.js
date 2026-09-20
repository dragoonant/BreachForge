// The browser face of the suite. The Node runner (tools/test.mjs) is the one CI uses;
// this page exists so a failure can be reproduced in the same environment the game runs in.
(function () {
  const out = document.getElementById('out');
  const lines = [];
  let pass = 0, fail = 0;
  window.__t = {
    test(n, fn) { try { fn(); pass++; } catch (e) { fail++; lines.push('FAIL ' + n + ' — ' + e.message); } },
  };
  RB.registerCards();
  lines.unshift(RB.allCards().length + ' cards registered, ' + RB.deckData.length + ' decks');
  lines.unshift(pass + ' passed, ' + fail + ' failed');
  out.innerHTML = lines.join('\n');
})();
