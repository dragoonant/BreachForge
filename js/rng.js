// Seeded RNG. Every shuffle, channel and hidden reveal happens inside RB.apply through
// one of these, so a seed plus an action list reproduces a game exactly.
(function (RB) {
  'use strict';
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // A state carries its RNG as a plain integer so apply() can deep-copy it.
  RB.rngNext = function (state) {
    state.rngSeed = (state.rngSeed + 0x6D2B79F5) | 0;
    let t = Math.imul(state.rngSeed ^ (state.rngSeed >>> 15), 1 | state.rngSeed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RB.rngInt = function (state, n) { return Math.floor(RB.rngNext(state) * n); };
  RB.shuffle = function (state, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = RB.rngInt(state, i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  RB.seedFromString = function (s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h | 0;
  };
  RB.mulberry32 = mulberry32;
})(window.RB = window.RB || {});
