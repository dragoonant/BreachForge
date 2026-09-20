// The black box. Every action applied in a session is recorded; "the card did something
// weird" becomes a file with a seed, two deck ids and every action, and
// tools/replay-report.mjs says which of three failure kinds it is. One tool call instead
// of a conversation.
(function (RB) {
  'use strict';
  const rec = { seed: null, decks: null, actions: [], note: '' };

  RB.recordStart = function (state) {
    rec.seed = state.seed;
    rec.decks = state.players.map(p => p.deckId);
    rec.actions = [];
  };
  RB.recordAction = function (action) { rec.actions.push(action); };
  RB.bugReport = function (note) {
    rec.note = note || '';
    rec.at = new Date().toISOString();
    rec.version = RB.VERSION || 'dev';
    return JSON.stringify(rec, null, 1);
  };
  // Downloads the trace. Bound to a button on the board; the file goes straight into
  // tools/replay-report.mjs.
  RB.downloadBugReport = function (note) {
    const blob = new Blob([RB.bugReport(note)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'breachforge-trace-' + Date.now() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
})(window.RB = window.RB || {});
