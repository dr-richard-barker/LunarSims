/* Artemis City — zone demand, land value, and per-tile growth/decay.
   This module has no equivalent in Lunar Farm or Lunar Habitat: OpenSC2K's
   own RCI/land-value system was confirmed unfinished, so there was nothing
   to adapt here — it is written fresh, and is the one place the "SimCity"
   half of this game actually lives. Everything here is DOM-free, same
   discipline as farm/js/sim.js. */

(function () {
  const { K, ZONES } = window.LC_DATA;
  const { idx, isServiced, nearestDist, inRevealed } = window.LC_GRID;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoneById = id => ZONES.find(z => z.id === id);

  const BASE_GROWTH = 0.09;      // per day, best-case conditions
  const DECAY_PROGRESS = 0.10;   // per day of sustained negative demand
  const UNSERVICED_LIMIT = 10;   // days off-network before a stage is lost

  /* Sum the capacity every zoned tile currently provides, at its current
     stage — not what it could reach, what it has actually grown to. */
  function tally(s) {
    let housingCap = 0, tradeJobs = 0, industryJobs = 0, upkeep = 0, income = 0;
    for (const t of s.map) {
      if (!t.zone) continue;
      const z = zoneById(t.zone.kind);
      const st = z.stages[t.zone.stage];
      if (t.zone.kind === 'hab') { housingCap += st.pop || 0; upkeep += st.upkeep || 0; }
      else {
        if (t.zone.kind === 'trade') tradeJobs += st.jobs || 0;
        else industryJobs += st.jobs || 0;
        upkeep += st.upkeep || 0;
        income += st.income || 0;
      }
    }
    return { housingCap, tradeJobs, industryJobs, jobs: tradeJobs + industryJobs, upkeep, income };
  }

  /* RCI-style demand: each index is -1..+1. Positive means the zone wants
     to grow; negative means it is over-built for what the colony needs
     right now. Hab wants jobs to outrun population; Trade and Industry each
     want population to outrun their own capacity, at different ratios, so
     the three zones chase each other the way a real RCI loop does. */
  function demand(s, t) {
    const hab = clamp((t.jobs - s.pop) / K.ZONE_SCALE, -1, 1);
    const trade = clamp((s.pop * 0.35 - t.tradeJobs) / K.ZONE_SCALE, -1, 1);
    const industry = clamp((s.pop * 0.25 - t.industryJobs) / K.ZONE_SCALE, -1, 1);
    return { hab, trade, industry };
  }

  const HAZARD_TERRAIN = t => t.t === 'crater' || t.t === 'boulder' || t.t === 'skylight';

  /* 0..1 composite: terrain, road access, hazard proximity, and closeness to
     a grow hall (the one amenity this colony has in Phase 1 — greenery and
     a food source close by is worth something). */
  function landValue(s, touching, tile) {
    let v = tile.t === 'flat' ? 0.55 : tile.t === 'rough' ? 0.4 : 0.25;
    v += isServiced(s, touching, tile.x, tile.y) ? 0.25 : -0.45;
    const hazD = nearestDist(s, tile.x, tile.y, HAZARD_TERRAIN, 3);
    v -= (3 - hazD) * 0.05;
    const farmD = nearestDist(s, tile.x, tile.y, x => !!x.f, 5);
    v += (5 - farmD) * 0.025;
    return clamp(v, 0, 1);
  }

  /* Advance or retreat every zoned tile by one day. Call once per simulated
     day, after serviceSet() has been recomputed for today. */
  function growthTick(s, touching) {
    const t = tally(s);
    const d = demand(s, t);
    for (const tile of s.map) {
      const z = tile.zone;
      if (!z) continue;
      const serviced = isServiced(s, touching, tile.x, tile.y);
      if (!serviced) {
        z.unserviced = (z.unserviced || 0) + 1;
        if (z.unserviced > UNSERVICED_LIMIT && z.stage > 0) {
          z.stage--; z.growth = 0.4; z.unserviced = 0;
        }
        continue;
      }
      z.unserviced = 0;
      const dk = d[z.kind];
      const lv = landValue(s, touching, tile);

      if (z.stage < K.MAX_STAGE && dk > -0.1) {
        const rate = BASE_GROWTH * (0.3 + 0.7 * lv) * clamp(0.2 + dk, 0, 1.4);
        z.growth = (z.growth || 0) + rate;
        z.decay = 0;
        if (z.growth >= 1) { z.stage++; z.growth = 0; }
      } else if (dk <= -0.1) {
        z.growth = Math.max(0, (z.growth || 0) - BASE_GROWTH * 0.5);
        if (z.stage > 0 && dk < -0.5) {
          z.decay = (z.decay || 0) + DECAY_PROGRESS;
          if (z.decay >= 1) { z.stage--; z.decay = 0; z.growth = 0.5; }
        } else {
          z.decay = 0;
        }
      }
    }
    return { tally: t, demand: d };
  }

  /* Can this rectangle be zoned? Same shape as Lunar Farm's checkField. */
  function checkZone(s, x, y, w, h) {
    if (w < 1 || h < 1) return 'Drag out at least one tile.';
    if (x < 0 || y < 0 || x + w > K.COLS || y + h > K.ROWS) return 'That runs off the survey area.';
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (!inRevealed(s, xx, yy)) return 'That ground has not been surveyed yet.';
        const t = s.map[idx(xx, yy)];
        if (t.b || t.f || t.zone) return 'Something already occupies that ground.';
        if (t.t === 'crater') return 'A crater bowl is inside that outline.';
        if (t.t === 'skylight') return 'The tube skylight is inside that outline.';
        if (t.t === 'boulder') return 'Boulders are inside that outline — clear them first.';
      }
    }
    return null;
  }

  window.LC_ZONES = { tally, demand, landValue, growthTick, checkZone, zoneById };
})();
