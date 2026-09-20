// Structured log entries. One entry point, `data` carries machine-readable fields, and a
// `via` attribution is stamped automatically while a trigger drains. The UI renders these;
// the audio layer rides the same entries (`sound`).
(function (RB) {
  'use strict';
  RB.log = function (state, kind, data, sound) {
    const e = { n: state.log.length, kind: kind, turn: state.turn, data: data || {} };
    if (sound) e.sound = sound;
    if (state.via) e.via = state.via;
    state.log.push(e);
    return e;
  };
})(window.RB = window.RB || {});
