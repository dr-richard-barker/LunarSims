/* Lunar Metropolis — the deep arcologies.

   Everything about the structures that go DOWN. The four of them are declared
   in data.js like any other building; what lives here is the two things they
   do that nothing else in the game does.

   ICE IS FINALLY A RESOURCE. Deposits have been surveyed onto the map since
   the first version and read by nothing but the inspector and the Deposits
   overlay. A deep arcology is the first structure that consumes one, and it
   does not read only the tile it stands on: it reads all the ice within
   reach, SHARED with any other arcology whose reach overlaps. So the deposit
   map becomes something to survey and space out across rather than a single
   tile to stand on, and two shafts parked side by side genuinely make each
   other worse.

   That coupling matters because of where the ice is. seedDeposits only puts
   it where the sun genuinely never reaches, which is the ground the rest of
   the game has no use for — a permanently shadowed floor earns nothing as
   land value and generates nothing from solar. These buildings invert that,
   and they pay for it on the grid: a shaft in permanent shadow can never be
   solar-fed, so every watt is conduited in across the dark.

   THEY ARE NOT FINISHED WHEN THEY ARE PAID FOR. One opens as a collar and a
   single gallery and then sinks a level at a time, but only while all three
   networks reach it and the colony is neither browning out nor short of air
   — the same gate zoned ground grows under. That is what stops a megastructure
   being a purchase: it is a commitment the grid has to keep honouring. It
   never loses what it already opened, only the ability to go deeper.

   No DOM references. */

(function () {
  const { K, BUILDINGS } = window.LM_DATA;
  const G = window.LM_GRID;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const buildById = id => BUILDINGS.find(b => b.id === id);

  /* Read from the data rather than named one by one, exactly as render.js
     derives its wonder set — adding a fifth arcology stays a data change. */
  const DEEP_IDS = new Set(BUILDINGS.filter(b => b.group === 'deep').map(b => b.id));
  const isDeep = id => DEEP_IDS.has(id);
  const specOf = t => (t && t.b && isDeep(t.b.type)) ? buildById(t.b.type) : null;

  /* How far a shaft reaches for ice, and how much of it counts as a good site.

     REFERENCE is measured, not guessed. Across eight seeds and every site the
     placement rules actually allow, the raw richness sum inside a radius-3
     disc runs from about 0.6 to 16, with a median near 8. Dividing by 8 —
     the obvious choice — puts the median site at 1.0 and pins about a sixth of
     all sites against the ceiling, which is fatal to the design: the whole
     point of iceYield is that a second bore nearby makes both worse, and a
     saturated site absorbs that loss without showing it. 12 puts the median
     near 0.67 and saturates nothing, so the penalty is always visible and
     there is real headroom for a genuinely good site to be worth hunting for.

     The clamp floor is deliberately non-zero: a shaft sunk on a lean deposit
     is a poor investment, never a dead one. */
  const ICE_RADIUS = 3;
  const ICE_REFERENCE = 12;
  const YIELD_MIN = 0.25, YIELD_MAX = 1.5;

  /* Every deep arcology on the map. At most one of each type exists, so this
     is a four-element list at worst and is cheap to rebuild per call. */
  function allDeep(s) {
    const out = [];
    for (const t of s.map) if (t.b && isDeep(t.b.type)) out.push(t);
    return out;
  }

  /* How much ice this site can actually draw on, 0.25..1.5.

     Each ice tile within reach is divided by the number of arcologies that
     can also reach it, so overlapping bores split one deposit rather than
     each counting it in full. `others` is passed in by callers that already
     built the list — totals() reads every arcology on the map and would
     otherwise rebuild it once per building. */
  function iceYield(s, t, others) {
    if (!t) return 0;
    const rivals = others || allDeep(s);
    let sum = 0;
    const r2 = ICE_RADIUS * ICE_RADIUS;
    for (let dy = -ICE_RADIUS; dy <= ICE_RADIUS; dy++) {
      for (let dx = -ICE_RADIUS; dx <= ICE_RADIUS; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const n = G.tileAt(s, t.x + dx, t.y + dy);
        if (!n || !n.deposit || n.deposit.kind !== 'ice') continue;
        /* Share count includes this tile itself when it is one of the
           arcologies, which is why it starts at zero rather than one. */
        let claims = 0;
        for (const q of rivals) {
          const qx = n.x - q.x, qy = n.y - q.y;
          if (qx * qx + qy * qy <= r2) claims++;
        }
        sum += n.deposit.richness / Math.max(1, claims);
      }
    }
    return clamp(sum / ICE_REFERENCE, YIELD_MIN, YIELD_MAX);
  }

  /* Whether a site holds ice at all, and richly enough for the structure
     being sited on it. Used by sim.js's canPlace, so the refusal can tell the
     two failures apart — "there is no ice here" and "there is not enough" are
     different problems and want different answers from the player. */
  const iceAt = t => (t && t.deposit && t.deposit.kind === 'ice') ? t.deposit.richness : 0;

  /* Levels opened so far. Defensive about a building that predates the field
     for the same reason launchColonyShips is about `built` — one is enough. */
  const levelsOf = t => {
    const B = specOf(t);
    if (!B) return 0;
    return clamp(t.b.levels || 1, 1, B.maxLevels);
  };

  /* What one arcology currently contributes.

     Housing and jobs scale with the levels dug and nothing else — a gallery
     holds what it holds regardless of what is in the ground. Air and export
     scale with the ice as well, because those are the two outputs that are
     literally made of it. */
  function outputOf(s, t, others) {
    const B = specOf(t);
    if (!B) return null;
    const lv = levelsOf(t);
    const y = (B.airPerLevel || B.exportPerLevel) ? iceYield(s, t, others) : 1;
    return {
      levels: lv, maxLevels: B.maxLevels, yield: y,
      housing: (B.housingPerLevel || 0) * lv,
      jobs: (B.jobsPerLevel || 0) * lv,
      air: (B.airPerLevel || 0) * lv * y,
      export: (B.exportPerLevel || 0) * lv * y,
      dust: (B.dustPerLevel || 0) * lv
    };
  }

  /* The whole city's deep contribution, in one pass over one shared list.
     zones.js folds this into the same tally the zone tables feed. */
  function totals(s) {
    const out = { housing: 0, jobs: 0, air: 0, export: 0, count: 0 };
    const list = allDeep(s);
    for (const t of list) {
      const o = outputOf(s, t, list);
      if (!o) continue;
      out.count++;
      out.housing += o.housing;
      out.jobs += o.jobs;
      out.air += o.air;
      out.export += o.export;
    }
    return out;
  }

  /* ---------- excavation ---------- */

  /* A shaft sinks only while it is genuinely part of the city: touched by a
     tube, reached by current, reached by pressurisation, and with the colony
     as a whole able to carry the load. Exactly the conditions zones.js makes
     zoned ground grow under, for exactly the same reason — a megastructure
     that dug on regardless would be the one thing in the game the utilities
     did not apply to. */
  function serviced(s, t, nets) {
    if (!nets) return false;
    return G.hasTransit(s, t.x, t.y) &&
           G.served(s, nets.power, t.x, t.y) &&
           G.served(s, nets.air, t.x, t.y);
  }

  /* One day of digging across every arcology. `r` is growthTick's result,
     read only for the two colony-wide gates. Returns the tiles that opened a
     level today, so a caller can react to them without re-scanning the map. */
  function excavate(s, nets, r) {
    const opened = [];
    const stalled = !!(r && (r.brownout || r.airShort));
    for (const t of s.map) {
      const B = specOf(t);
      if (!B) continue;
      if (!t.b.levels) t.b.levels = 1;
      if (t.b.dig === undefined) t.b.dig = 0;

      const ok = !stalled && serviced(s, t, nets);
      t.b.stalled = !ok;
      if (!ok || t.b.levels >= B.maxLevels) continue;

      t.b.dig += 1 / B.digDays;
      while (t.b.dig >= 1 && t.b.levels < B.maxLevels) {
        t.b.dig -= 1;
        t.b.levels++;
        opened.push(t);
      }
      if (t.b.levels >= B.maxLevels) t.b.dig = 0;
    }
    return opened;
  }

  window.LM_DEEP = {
    isDeep, specOf, allDeep, iceYield, iceAt, levelsOf,
    outputOf, totals, excavate, serviced,
    ICE_RADIUS, ICE_REFERENCE, YIELD_MIN, YIELD_MAX
  };
})();
