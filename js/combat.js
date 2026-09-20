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
    // A unit may be prevented from dealing combat damage ("enemy units here with less
    // Might than me don't deal combat damage"). Zeroing its Might instead would also make
    // it die to any damage, which is a different card — so the exemption is on the SUM,
    // not on the unit.
    const sum = list => list.reduce((n, iid) => n + RB.combatMightOf(s, iid), 0);
    const assignA = assign(s, sum(A), D);
    const assignD = assign(s, sum(D), A);
    RB.log(s, 'combatDamage', { bf: i, attackerMight: sum(A), defenderMight: sum(D) }, 'showdown.start');
    // Combat damage goes through the same door as everything else, tagged 'combat' so a
    // card that prevents only spell and ability damage does not accidentally stop it.
    for (const [iid, n] of assignA) RB.dealDamage(s, iid, n, { p: sd.attacker }, 'combat');
    for (const [iid, n] of assignD) RB.dealDamage(s, iid, n, { p: sd.defender }, 'combat');
  }

  // What this unit contributes to its side's combat damage. Usually its Might; a static
  // carrying `noCombatDamage` zeroes the contribution without touching how much damage it
  // takes to kill it.
  RB.combatMightOf = function (s, iid) {
    // A stunned unit contributes 0 Might here — and only here. It still takes damage equal
    // to its full Might to kill, which is why this is separate from RB.mightOf.
    if (RB.obj(s, iid).stunned) return 0;
    for (const st of RB.staticsOn(s, iid)) if (st.noCombatDamage) return 0;
    return RB.mightOf(s, iid);
  };

  // Lethal damage is normally damage equal to or above Might. A static carrying
  // `anyDamageKills` rewrites that for damage dealt by its controller.
  RB.isLethalDamage = function (s, iid) {
    const o = RB.obj(s, iid);
    if (o.damage <= 0) return false;
    for (const st of RB.staticsOn(s, iid)) if (st.anyDamageKills) return true;
    return o.damage >= RB.mightOf(s, iid);
  };

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

  // A recall returns a unit to its owner's base. Rule 449.
  function recall(s, iid, i) {
    RB.removeFrom(s.bf[i].units, iid);
    const o = RB.obj(s, iid);
    o.damage = 0;
    delete o.role;
    s.players[o.controller].base.push(iid);
    RB.log(s, 'recall', { iid: iid, p: o.controller, bf: i }, 'unit.move');
  }

  // The Resolution Step: kill lethal, heal survivors, recall attackers if defenders hold,
  // then establish control — which is a Conquer if that player has not scored here yet.
  function resolveCombat(s, sd) {
    const i = sd.bf, bf = s.bf[i];
    for (const iid of bf.units.slice()) if (RB.isLethalDamage(s, iid)) RB.kill(s, iid);
    for (const iid of bf.units) RB.obj(s, iid).damage = 0;     // 3c. Heal all Units.

    if (sd.combat) {
      // 3d. Recall Attackers present at the Battlefield if Defenders are still present
      // (rule 449). This is the step that makes an attack that fails to clear the
      // battlefield *bounce* — without it two units that cannot kill each other restage
      // the combat forever, which is exactly what the fuzzer found with two 0-might units.
      if (RB.unitsAt(s, i, sd.defender).length)
        for (const iid of RB.unitsAt(s, i, sd.attacker)) recall(s, iid, i);
    }

    const A = RB.unitsAt(s, i, sd.attacker);
    const D = RB.unitsAt(s, i, sd.defender);
    if (sd.combat) {
      const winner = (A.length && !D.length) ? sd.attacker : (D.length && !A.length) ? sd.defender : null;
      if (winner === null) {
        // "No Result" — neither side holds the field. Both sides having units cannot
        // happen after the recall above, so this is the mutual-destruction case.
        RB.log(s, 'combatNoResult', { bf: i });
      } else {
        RB.log(s, 'combatResult', { bf: i, winner: winner },
          winner === sd.attacker ? 'showdown.win' : 'showdown.lose');
      }
      RB.runTriggers(s, 'combatEnd', { bf: i, winner: winner, p: winner === null ? sd.attacker : winner });
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
