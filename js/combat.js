// Combat is a sub-procedure parameterised by a battlefield, not a global phase — many
// showdowns can happen in one turn. Rules 459-461.
(function (RB) {
  'use strict';

  RB.closeShowdown = function (s) {
    const sd = s.showdown;
    const i = sd.bf;
    RB.log(s, 'showdownClose', { bf: i });
    if (sd.combat && RB.unitsAt(s, i, sd.attacker).length && RB.unitsAt(s, i, sd.defender).length)
      combatDamage(s, sd);
    resolveCombat(s, sd);
    s.showdown = null; s.focus = null; s.priority = s.active; s.passes = 0;
  };

  // Each side assigns damage equal to its summed Might among the other's units, lethal
  // first, no overkill while another unit remains. Damage is dealt simultaneously.
  function combatDamage(s, sd) {
    const i = sd.bf;
    const A = RB.unitsAt(s, i, sd.attacker);
    const D = RB.unitsAt(s, i, sd.defender);
    const sum = list => list.reduce((n, iid) => n + RB.mightOf(s, iid), 0);
    const assignA = assign(s, sum(A), D);
    const assignD = assign(s, sum(D), A);
    RB.log(s, 'combatDamage', { bf: i, attackerMight: sum(A), defenderMight: sum(D) }, 'showdown.start');
    for (const [iid, n] of assignA) RB.obj(s, iid).damage += n;
    for (const [iid, n] of assignD) RB.obj(s, iid).damage += n;
  }

  // Tank must be assigned first; a unit that cannot be dealt damage is skipped entirely.
  function assign(s, pool, targets) {
    const order = targets.slice().sort((a, b) => {
      const ta = RB.hasKeyword(s, a, 'Tank') ? 0 : 1;
      const tb = RB.hasKeyword(s, b, 'Tank') ? 0 : 1;
      if (ta !== tb) return ta - tb;
      return RB.mightOf(s, a) - RB.mightOf(s, b);   // cheapest kills first
    });
    const out = [];
    for (const iid of order) {
      if (pool <= 0) break;
      const lethal = Math.max(1, RB.mightOf(s, iid) - RB.obj(s, iid).damage);
      const n = Math.min(pool, lethal);
      out.push([iid, n]); pool -= n;
    }
    // Nothing left to kill — the remainder piles onto the last unit assigned.
    if (pool > 0 && out.length) out[out.length - 1][1] += pool;
    return out;
  }

  // The Resolution Step: kill lethal, heal survivors, recall attackers if defenders hold,
  // then establish control — which is a Conquer if that player has not scored here yet.
  function resolveCombat(s, sd) {
    const i = sd.bf, bf = s.bf[i];
    for (const iid of bf.units.slice())
      if (RB.obj(s, iid).damage > 0 && RB.obj(s, iid).damage >= RB.mightOf(s, iid)) RB.kill(s, iid);
    for (const iid of bf.units) RB.obj(s, iid).damage = 0;     // 3c. Heal all Units.

    const A = RB.unitsAt(s, i, sd.attacker);
    const D = RB.unitsAt(s, i, sd.defender);
    if (sd.combat) {
      if (A.length && D.length) {
        // "No Result": both sides still standing. Combat stages again at this battlefield.
        bf.combatStaged = true; bf.showdownStaged = true;
        RB.log(s, 'combatNoResult', { bf: i });
        return;
      }
      if (D.length && A.length === 0) {
        RB.log(s, 'combatResult', { bf: i, winner: sd.defender }, 'showdown.lose');
      } else if (A.length && D.length === 0) {
        RB.log(s, 'combatResult', { bf: i, winner: sd.attacker }, 'showdown.win');
        // 3d. Recall attackers only if defenders are still present — they are not.
      }
      RB.runTriggers(s, 'combatEnd', { bf: i, winner: A.length ? sd.attacker : (D.length ? sd.defender : null) });
    }

    bf.contestedBy = null; bf.combatStaged = false; bf.showdownStaged = false;
    for (const iid of bf.units) delete RB.obj(s, iid).role;

    if (!bf.units.length) { bf.controller = null; return; }
    const holder = RB.obj(s, bf.units[0]).controller;
    if (bf.units.some(u => RB.obj(s, u).controller !== holder)) return;
    const was = bf.controller;
    bf.controller = holder;
    if (was !== holder) {
      RB.log(s, 'conquer', { bf: i, p: holder }, 'battlefield.conquer');
      RB.score(s, holder, i, 'conquer');
    }
  }
})(window.RB = window.RB || {});
