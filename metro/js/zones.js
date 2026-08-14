/* Lunar Metropolis — zone demand, land value and per-tile growth.

   The SimCity half of the game. Habitation wants jobs to outrun population;
   Trade and Industry each want population to outrun their own capacity, at
   different ratios, so the three chase each other rather than settling.

   A zoned tile only develops when ALL THREE networks reach it — transit,
   power and atmosphere — and only while the colony as a whole has generating
   capacity and pressurisation to spare. That is what makes the utilities
   feel like infrastructure rather than decoration. No DOM references. */

(function () {
  const { K, ZONES } = window.LM_DATA;
  const G = window.LM_GRID;
  const idx = G.idx, tileAt = G.tileAt, DIRS = G.DIRS;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const zoneById = id => ZONES.find(z => z.id === id);
  const bandOf = z => zoneById(z.kind)[z.density];
  const stageOf = z => bandOf(z).stages[z.stage];

  /* Multi-source breadth-first distance field. Land value needs "how far is
     the nearest X" for every tile at once; scanning every tile against every
     source would be 268 million comparisons on a 128x128 map, whereas one
     BFS visits each tile once. */
  function distanceField(s, pred, maxD) {
    const dist = new Int16Array(K.COLS * K.ROWS).fill(maxD + 1);
    const q = [];
    for (const t of s.map) if (pred(t)) { dist[idx(t.x, t.y)] = 0; q.push(t); }
    let head = 0;
    while (head < q.length) {
      const t = q[head++];
      const d = dist[idx(t.x, t.y)];
      if (d >= maxD) continue;
      for (const [dx, dy] of DIRS) {
        const n = tileAt(s, t.x + dx, t.y + dy);
        if (!n) continue;
        const k = idx(n.x, n.y);
        if (dist[k] > d + 1) { dist[k] = d + 1; q.push(n); }
      }
    }
    return dist;
  }

  /* What the city currently provides, at the stages actually reached — not
     what it could reach if everything grew. */
  function tally(s) {
    let pop = 0, tradeJobs = 0, industryJobs = 0, income = 0, upkeep = 0, draw = 0;
    for (const t of s.map) {
      const z = t.zone;
      if (!z || z.stage === 0) continue;
      const st = stageOf(z);
      if (z.kind === 'hab') pop += st.pop || 0;
      else if (z.kind === 'trade') tradeJobs += st.jobs || 0;
      else industryJobs += st.jobs || 0;
      income += st.income || 0;
      upkeep += st.upkeep || 0;
      draw += K.KW_PER_STAGE * z.stage;
    }
    return { housingCap: pop, tradeJobs, industryJobs, jobs: tradeJobs + industryJobs,
             income, upkeep, draw };
  }

  /* Generating capacity. Solar output is multiplied by the tile's own sun
     exposure — the whole reason to fight for a peak of eternal light — and
     then again by how much regolith dust has settled on it. An array
     downwind of a refinery genuinely stops earning its keep, which is the
     cleanest expression of why industry placement matters. */
  function power(s) {
    let gen = 0, plants = 0;
    for (const t of s.map) {
      if (!t.b) continue;
      if (t.b.type === 'solar') {
        const fouling = 1 - clamp(t.dust || 0, 0, 1) * K.DUST_SOLAR_BITE;
        gen += 7 * t.sun * fouling;
      } else if (t.b.type === 'reactor') gen += 60;
      else if (t.b.type === 'o2') plants++;
    }
    const svcDraw = window.LM_SERVICES ? window.LM_SERVICES.serviceDraw(s) : 0;
    return { gen, o2Plants: plants, o2Draw: plants * 5 + svcDraw };
  }

  /* RCI, each index running -1..+1. `bite` is the drag a tax rate above the
     base puts on every index — the other half of the budget trade-off, and
     the reason a maximally-taxed city is rich and stagnant. */
  function demand(s, t, bite) {
    const b = bite || 0;
    const hab = clamp((t.jobs - s.pop) / K.DEMAND_SCALE - b, -1, 1);
    const trade = clamp((s.pop * 0.38 - t.tradeJobs) / K.DEMAND_SCALE - b, -1, 1);
    const industry = clamp((s.pop * 0.28 - t.industryJobs) / K.DEMAND_SCALE - b, -1, 1);
    return { hab, trade, industry };
  }

  /* 0..1 composite. Sunlight and elevation both feed in: a lit, elevated
     outlook is worth more than a floor nobody can see out of, which quietly
     makes the terrain the player sculpted matter to the economy. Industry
     drags down whatever sits close to it, so hab wants to be somewhere else. */
  function landValue(s, ctx, tile) {
    const k = idx(tile.x, tile.y);
    let v = tile.t === 'flat' ? 0.52 : 0.38;
    /* a barely-maintained tube network is worth less to the ground it
       serves — the transit dial showing up in the economy */
    v += ctx.transit(tile.x, tile.y) ? 0.22 * (ctx.transitMul === undefined ? 1 : ctx.transitMul) : -0.40;
    v += (tile.sun - 0.4) * 0.30;                       // outlook and daylight
    v += (tile.h / K.MAX_H - 0.35) * 0.14;              // above the dust

    /* civic coverage — the reason to build any of it */
    if (ctx.cov) {
      v += ctx.cov.health[k] * 0.16;
      v += ctx.cov.education[k] * 0.14;
      v += ctx.cov.amenity[k] * 0.22;                   // nothing lifts value like green space
    }
    /* and the things that drag it back down */
    v -= clamp(tile.dust || 0, 0, 1) * K.DUST_VALUE_BITE;
    const dInd = ctx.indDist[k];
    if (dInd <= 4) v -= (5 - dInd) * 0.045;             // nobody wants to live by the refinery
    return clamp(v, 0, 1);
  }

  /* Advance or retreat every zoned tile by one day. `nets` is the result of
     LM_GRID.services(s), computed once for the whole map. */
  function growthTick(s, nets) {
    const B = window.LM_BUDGET;
    const eff = B ? B.effects(s)
      : { genMul: 1, airMul: 1, transitMul: 1, safety: 1, taxBite: 0 };

    const t = tally(s);
    const d = demand(s, t, eff.taxBite);
    const pw = power(s);
    const indDist = distanceField(s, x => x.zone && x.zone.kind === 'industry' && x.zone.stage > 0, 5);

    const SV = window.LM_SERVICES;
    const cov = SV ? SV.coverage(s, eff) : null;

    const ctx = {
      transit: (x, y) => G.hasTransit(s, x, y),
      indDist,
      transitMul: eff.transitMul,
      cov
    };

    /* Colony-wide gates. Growth stops everywhere if the grid cannot carry
       the load or there is not enough pressurisation to go round — the two
       classic "build another plant" pressures. Both ratings are scaled by
       their department's funding, so letting maintenance slide has exactly
       the same effect as never having built the capacity. */
    const gen = pw.gen * eff.genMul;
    const load = t.draw + pw.o2Draw;
    const brownout = load > gen;
    const airCap = Math.floor(pw.o2Plants * K.AIR_PER_PLANT * eff.airMul);
    const airShort = s.pop > airCap;

    for (const tile of s.map) {
      const z = tile.zone;
      if (!z) continue;

      const hasT = ctx.transit(tile.x, tile.y);
      const hasP = G.served(s, nets.power, tile.x, tile.y);
      const hasA = G.served(s, nets.air, tile.x, tile.y);
      z.served = hasT && hasP && hasA;

      if (!z.served) {
        z.unserved = (z.unserved || 0) + 1;
        if (z.unserved > K.UNSERVED_LIMIT && z.stage > 0) {
          z.stage--; z.growth = 0.4; z.unserved = 0;
        }
        continue;
      }
      z.unserved = 0;
      if (brownout || airShort) continue;      // serviced, but the colony is over-extended

      const band = bandOf(z);
      const dk = d[z.kind];
      const lv = landValue(s, ctx, tile);
      z.value = lv;

      if (z.stage < band.maxStage && dk > -0.08) {
        /* High density is far more sensitive to land value than low — a
           tower will not go up on ground nobody wants, which is what stops
           the whole map growing into uniform skyline. */
        const sens = z.density === 'high' ? (0.15 + 0.85 * lv) : (0.45 + 0.55 * lv);
        z.growth = (z.growth || 0) + K.BASE_GROWTH * sens * clamp(0.25 + dk, 0, 1.4);
        z.decay = 0;
        if (z.growth >= 1) { z.stage++; z.growth = 0; }
      } else if (dk <= -0.08) {
        z.growth = Math.max(0, (z.growth || 0) - K.BASE_GROWTH * 0.5);
        if (z.stage > 0 && dk < -0.45) {
          z.decay = (z.decay || 0) + K.DECAY_RATE;
          if (z.decay >= 1) { z.stage--; z.decay = 0; z.growth = 0.5; }
        } else z.decay = 0;
      }

      /* Deferred maintenance. Below roughly two-thirds effective repair a
         backlog accrues on developed ground and eventually costs it a stage
         — the slow, unglamorous way a city decays when the repair budget is
         the easy thing to cut. A depot within reach makes up much of the
         shortfall locally, which is the whole reason to build one: it buys
         back ground the city-wide budget alone cannot afford to hold. */
      const repair = clamp(eff.safety + (cov ? cov.safety[idx(tile.x, tile.y)] * 0.5 : 0), 0, 1);
      z.repair = repair;
      if (z.stage > 0 && repair < 0.65) {
        z.backlog = (z.backlog || 0) + (0.65 - repair) * 0.06;
        if (z.backlog >= 1) { z.stage--; z.backlog = 0; z.growth = 0.5; }
      } else if (z.backlog) {
        z.backlog = Math.max(0, z.backlog - 0.03);
      }
    }

    return { tally: t, demand: d, power: pw, gen, ratedGen: pw.gen,
             brownout, airShort, airCap, load, eff, cov };
  }

  window.LM_ZONES = {
    tally, demand, landValue, growthTick, power, distanceField,
    zoneById, bandOf, stageOf
  };
})();
