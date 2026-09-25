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
  // tools/replay-report.mjs. Returns the filename, so the caller can say that it happened:
  // a save with no visible result is indistinguishable from a dead button, and that is
  // exactly what this one was reported as.
  RB.downloadBugReport = function (note) {
    const name = 'breachforge-trace-' + Date.now() + '.json';
    const url = URL.createObjectURL(new Blob([RB.bugReport(note)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    // The anchor has to be IN the document when it is clicked. A detached <a download>
    // click is ignored outright by Firefox and by several embedded webviews — no error, no
    // file, nothing in the console — and this anchor has been detached since it was
    // written, so on those browsers the button has never once produced a trace.
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return name;
  };
})(window.RB = window.RB || {});
