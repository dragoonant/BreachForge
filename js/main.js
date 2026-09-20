// Entry point. Load-time validation runs before the first screen: a card that is
// registered but does not play as it reads must stop the app, not surprise the player.
(function (RB) {
  'use strict';
  window.addEventListener('DOMContentLoaded', function () {
    RB.registerCards();
    const problems = RB.validate();
    const registered = problems.filter(p => !/has no ability data|skeleton/.test(p));
    if (registered.length) {
      document.body.innerHTML = '<pre style="padding:2rem;color:#ff9a8a;white-space:pre-wrap">' +
        'Validation failed:\n\n' + registered.join('\n') + '</pre>';
      throw new Error(registered.length + ' validation problems');
    }
    RB.initScreens();
  });
})(window.RB = window.RB || {});
