/* Lunar Metropolis — eras and progression.

   A colony advances by growing AND by funding research; both thresholds
   must be met. That pairing is deliberate: population alone would make the
   science dial safe to zero out forever, and research alone would let a
   tiny well-funded outpost build towers.

   An era raises the ceiling on how far ground can develop, unlocks
   buildings, and changes the architecture. The density cap is the important
   one — you cannot build a skyline on day one, you have to become the kind
   of city that has one. No DOM references. */

(function () {
  const { ERAS, BUILDINGS } = window.LM_DATA;

  /* Highest era whose thresholds the colony has met. Uses the population
     ever reached rather than today's, so a temporary slump does not
     retroactively demolish a skyline the city genuinely earned. */
  function index(s) {
    let i = 0;
    for (let e = 0; e < ERAS.length; e++) {
      const era = ERAS[e];
      if ((s.peakPop || 0) >= era.pop && (s.research || 0) >= era.research) i = e;
    }
    return i;
  }

  const current = s => ERAS[index(s)];
  const stageCap = s => ERAS[index(s)].stageCap;

  /* What the colony still needs for the next era, or null at the top. */
  function next(s) {
    const i = index(s);
    if (i >= ERAS.length - 1) return null;
    const e = ERAS[i + 1];
    return {
      era: e,
      popNeeded: Math.max(0, e.pop - (s.peakPop || 0)),
      researchNeeded: Math.max(0, e.research - (s.research || 0)),
      popPct: e.pop ? Math.min(1, (s.peakPop || 0) / e.pop) : 1,
      researchPct: e.research ? Math.min(1, (s.research || 0) / e.research) : 1
    };
  }

  const unlocked = (s, buildId) => {
    const B = BUILDINGS.find(b => b.id === buildId);
    return !B || !B.era || index(s) >= B.era;
  };

  /* Why a locked building is locked, for the palette tooltip. */
  function lockReason(s, buildId) {
    const B = BUILDINGS.find(b => b.id === buildId);
    if (!B || !B.era || index(s) >= B.era) return null;
    return `Requires the ${ERAS[B.era].name} era.`;
  }

  window.LM_ERAS = { index, current, stageCap, next, unlocked, lockReason, ERAS };
})();
