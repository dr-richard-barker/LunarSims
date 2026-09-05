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
  const G = window.LM_GRID, T = window.LM_TERRAIN;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const buildById = id => BUILDINGS.find(b => b.id === id);

  /* Read from the data rather than named one by one, exactly as render.js
     derives its wonder set — adding a fifth arcology stays a data change.

     Two groups share this module because they share a LIFECYCLE, not a shape.
     Both open as a single unit and grow one unit at a time while the three
     networks reach them and the colony can carry them; what differs is the
     direction of growth and what stops it. A bore grows down and stops at a
     depth its own data fixes. A tube arcology grows along a course it did not
     choose and stops when the tube does — a ceiling the MAP owns, not the
     designer. Everything below is written in terms of a "frontier" so that
     one implementation serves both. */
  const DEEP_IDS = new Set(BUILDINGS.filter(b => b.group === 'deep').map(b => b.id));
  const TUBE_IDS = new Set(BUILDINGS.filter(b => b.group === 'tube').map(b => b.id));
  const isDeep = id => DEEP_IDS.has(id);
  const isTube = id => TUBE_IDS.has(id);
  const isSub = id => isDeep(id) || isTube(id);
  const specOf = t => (t && t.b && isSub(t.b.type)) ? buildById(t.b.type) : null;

  /* How far this structure can grow, and how fast.

     For a bore both come straight from its data. For a tube arcology the cap
     is whichever runs out first, the structure's own reach or the tube itself
     — and on most maps it is the tube, which is exactly the constraint this
     group exists to express. */
  function capOf(s, t) {
    const B = specOf(t);
    if (!B) return 0;
    if (isTube(t.b.type)) {
      const tube = T.tubeOf(s, t);
      if (!tube) return 1;
      return Math.max(1, Math.min(B.maxReach, tube.path.length));
    }
    return B.maxLevels;
  }
  const stepDays = t => {
    const B = specOf(t);
    return B ? (B.digDays || B.reachDays || 20) : 20;
  };

  /* A tube's width where the structure sits, as a multiplier on everything it
     delivers. A fat tube is worth more per tile of reach than a thin one, so
     two tubes of equal length are not equal prizes. */
  function spanOf(s, t) {
    if (!t || !t.b || !isTube(t.b.type)) return 1;
    const tube = T.tubeOf(s, t);
    return tube ? tube.span : 1;
  }

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

  /* Both groups, for the tally and the tick. allDeep stays bore-only because
     iceYield's sharing rule is about ice, and a tube arcology draws on none. */
  function allSub(s) {
    const out = [];
    for (const t of s.map) if (t.b && isSub(t.b.type)) out.push(t);
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
  const levelsOf = (t, cap) => {
    const B = specOf(t);
    if (!B) return 0;
    return clamp(t.b.levels || 1, 1, cap === undefined ? (B.maxLevels || 1) : cap);
  };

  /* What one arcology currently contributes.

     Housing and jobs scale with the levels dug and nothing else — a gallery
     holds what it holds regardless of what is in the ground. Air and export
     scale with the ice as well, because those are the two outputs that are
     literally made of it. */
  function outputOf(s, t, others) {
    const B = specOf(t);
    if (!B) return null;
    const cap = capOf(s, t);
    const lv = levelsOf(t, cap);

    /* A tube arcology delivers per tile of reach, multiplied by how wide the
       tube is there, and it makes no air and no export — it has no ice to
       make them from. That asymmetry is the whole trade: the cheapest volume
       in the game is also the only one that gives the atmosphere budget
       nothing back. */
    if (isTube(t.b.type)) {
      const span = spanOf(s, t);
      /* Rounded, because span is fractional and a fraction of a resident is
         not a thing. Everything downstream — the housing cap, migration, the
         population readout — is a count of people, and letting a tube's width
         leak a decimal into it put "13,998.56" in the HUD. */
      return {
        levels: lv, maxLevels: cap, yield: span, tube: true,
        housing: Math.round((B.housingPerReach || 0) * lv * span),
        jobs: Math.round((B.jobsPerReach || 0) * lv * span),
        air: 0, export: 0, dust: 0
      };
    }

    const y = (B.airPerLevel || B.exportPerLevel) ? iceYield(s, t, others) : 1;
    return {
      levels: lv, maxLevels: cap, yield: y, tube: false,
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
    /* Bores are passed the bore list so iceYield can share a deposit between
       them; tube arcologies are in the tally but never in that list. */
    const bores = allDeep(s);
    for (const t of allSub(s)) {
      const o = outputOf(s, t, bores);
      if (!o) continue;
      out.count++;
      out.housing += o.housing;
      out.jobs += o.jobs;
      out.air += o.air;
      out.export += o.export;
    }
    return out;
  }

  /* Which tiles of the tube this arcology has actually sealed.

     It grows outward from its portal in both directions at once, falling back
     to one direction when it reaches an end. Note what this does NOT do: it
     does not make the entry point affect total capacity. The cap is
     min(maxReach, tube length) wherever the portal is sunk, so a portal at
     the mouth of a tube simply seals in one direction until it has as much as
     one sunk in the middle. What the entry point does change is WHICH stretch
     gets sealed — and therefore where the lit run appears and which ground
     falls inside the arcology's amenity radius. That is a real effect but a
     modest one, and it is worth being plain about rather than dressing up. */
  function reachTiles(s, t) {
    if (!t || !t.b || !isTube(t.b.type) || !t.tube) return [];
    const tube = T.tubeOf(s, t);
    if (!tube) return [];
    const at = t.tube.i, want = levelsOf(t, capOf(s, t));
    const out = [tube.path[at]];
    let lo = at, hi = at;
    while (out.length < want && (lo > 0 || hi < tube.path.length - 1)) {
      if (lo > 0) { lo--; out.push(tube.path[lo]); }
      if (out.length < want && hi < tube.path.length - 1) { hi++; out.push(tube.path[hi]); }
    }
    return out.filter(Boolean);
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

      const cap = capOf(s, t);
      const ok = !stalled && serviced(s, t, nets);
      t.b.stalled = !ok;
      if (!ok || t.b.levels >= cap) continue;

      t.b.dig += 1 / stepDays(t);
      while (t.b.dig >= 1 && t.b.levels < cap) {
        t.b.dig -= 1;
        t.b.levels++;
        opened.push(t);
      }
      if (t.b.levels >= cap) t.b.dig = 0;
    }
    return opened;
  }

  window.LM_DEEP = {
    isDeep, isTube, isSub, specOf, allDeep, allSub, iceYield, iceAt, levelsOf,
    capOf, spanOf, reachTiles, outputOf, totals, excavate, serviced,
    ICE_RADIUS, ICE_REFERENCE, YIELD_MIN, YIELD_MAX
  };
})();
