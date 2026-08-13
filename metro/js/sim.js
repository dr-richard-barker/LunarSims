/* Lunar Metropolis — simulation state and player actions.

   One tick is one day. No DOM references: the renderer depends on this
   module, never the reverse, so harness.html can drive the whole city
   headlessly.

   There is deliberately no life-support fail state here. Running out of
   pressurisation or generating capacity stalls growth and empties the city
   through emigration — it never ends the run. This is a sandbox. */

(function () {
  const { K, BUILDINGS, ZONES } = window.LM_DATA;
  const T = window.LM_TERRAIN, G = window.LM_GRID, Z = window.LM_ZONES;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* bump whenever the saved shape changes in a way older saves lack — the
     budget added taxRate, funding and research, none of which a Phase 2
     save carries */
  const STATE_VERSION = 2;
  const buildById = id => BUILDINGS.find(b => b.id === id);

  function newGame(seed) {
    const w = T.makeMap(seed === undefined ? Math.floor(Math.random() * 9999) : seed);
    const s = {
      version: STATE_VERSION, seed: w.seed,
      map: w.map,
      day: 1,
      credits: K.START_CREDITS,
      pop: 0, housingCap: 0, jobs: 0,
      demand: { hab: 0, trade: 0, industry: 0 },
      gen: 0, ratedGen: 0, load: 0, airCap: 0,
      revenue: 0, expenses: 0, deptExpenses: 0, zoneUpkeep: 0,
      brownout: false, airShort: false,
      log: [], history: []
    };
    return Object.assign(s, window.LM_BUDGET.initial());
  }

  /* ---------- placement ---------- */

  function canPlace(s, t, type) {
    const B = buildById(type);
    if (!B) return 'Unknown structure.';
    if (!t) return 'That is off the map.';
    if (!T.buildable(t)) return t.t === 'boulder'
      ? 'Clear the boulders first.'
      : 'Nothing can be built on that ground.';

    if (B.subsurface) {
      if (t.pipe) return 'A main already runs under here.';
    } else {
      if (t.b) return t.b.type === type ? 'Already built here.' : 'Something is already built here.';
      if (t.zone) return 'That ground is zoned — clear the zoning first.';
    }
    if (s.credits < B.cost) return `That costs ${B.cost.toLocaleString()} credits.`;
    return null;
  }

  function place(s, t, type) {
    const err = canPlace(s, t, type);
    if (err) return err;
    const B = buildById(type);
    s.credits -= B.cost;
    if (B.subsurface) t.pipe = true;
    else t.b = { type };
    return null;
  }

  /* ---------- zoning ---------- */

  function canZone(s, t) {
    if (!t) return 'That is off the map.';
    if (!T.buildable(t)) return t.t === 'boulder'
      ? 'Clear the boulders first.'
      : 'That ground cannot be zoned.';
    if (t.b) return 'Something is already built there.';
    if (t.zone) return 'That ground is already zoned.';
    return null;
  }

  function zoneCost(kind, density) {
    return Z.zoneById(kind)[density].cost;
  }

  /* Paints a rectangle, skipping tiles that cannot take it rather than
     refusing the whole drag — dragging across a boulder field should still
     zone everything either side of it. Returns how many tiles were set. */
  function paintZone(s, x, y, w, h, kind, density) {
    const cost = zoneCost(kind, density);
    let painted = 0;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const t = T.tileAt(s, xx, yy);
        if (canZone(s, t)) continue;
        if (s.credits < cost) return painted;
        s.credits -= cost;
        t.zone = { kind, density, stage: 0, growth: 0, unserved: 0, decay: 0, served: false, value: 0 };
        painted++;
      }
    }
    return painted;
  }

  function bulldoze(s, t) {
    if (!t) return 'That is off the map.';
    if (t.b) { t.b = null; return null; }
    if (t.zone) { t.zone = null; return null; }
    if (t.pipe) { t.pipe = false; return null; }
    if (t.t === 'boulder') { t.t = 'rough'; return null; }
    return 'Nothing here to clear.';
  }

  /* ---------- the daily tick ---------- */

  function tick(s) {
    const nets = G.services(s);
    const r = Z.growthTick(s, nets);

    const B = window.LM_BUDGET;
    s.housingCap = r.tally.housingCap;
    s.jobs = r.tally.jobs;
    s.demand = r.demand;
    s.gen = r.gen;                 // after the power department's funding
    s.ratedGen = r.ratedGen;       // what the hardware could do if maintained
    s.load = r.load;
    s.airCap = r.airCap;
    s.brownout = r.brownout;
    s.airShort = r.airShort;

    /* Settled daily rather than in an annual lump, so the treasury is never
       ambushed by a bill it cannot pay and the player can watch a slider
       move the balance immediately. */
    const rev = B.revenue(s, r.tally);
    const exp = B.expenses(s);
    s.revenue = rev.taken;
    s.deptExpenses = exp.total;
    s.zoneUpkeep = r.tally.upkeep;
    s.expenses = exp.total + r.tally.upkeep;
    s.credits += s.revenue - s.expenses;

    s.research += r.eff.sciencePerDay * developedCount(s);

    /* Migration tracks the gap between people and pressurised housing.
       A colony that has over-extended its grid or its oxygen supply stops
       attracting anyone and slowly loses the people it has — a setback the
       player can build their way out of, never a game over. */
    if (!r.brownout && !r.airShort) {
      const gap = Math.max(0, s.housingCap - s.pop);
      s.pop += clamp(Math.round(gap * K.MIGRATION_RATE), 0, K.MIGRATION_CAP);
    } else if (s.pop > 0) {
      s.pop = Math.max(0, s.pop - Math.max(1, Math.round(s.pop * 0.02)));
    }
    if (s.pop > s.housingCap) s.pop = s.housingCap;

    s.day++;
    s.history.push({
      d: s.day, pop: s.pop, jobs: s.jobs, housingCap: s.housingCap,
      credits: Math.round(s.credits), gen: Math.round(r.gen * 10) / 10,
      load: Math.round(r.load * 10) / 10,
      revenue: Math.round(s.revenue), expenses: Math.round(s.expenses)
    });
    if (s.history.length > 400) s.history.shift();
    return r;
  }

  function pushLog(s, msg) {
    s.log.unshift({ day: s.day, msg });
    if (s.log.length > 80) s.log.pop();
  }

  const count = (s, type) => s.map.filter(t => t.b && t.b.type === type).length;
  const zonedCount = s => s.map.filter(t => t.zone).length;
  const developedCount = s => s.map.filter(t => t.zone && t.zone.stage > 0).length;

  window.LM_SIM = {
    newGame, STATE_VERSION, tick,
    canPlace, place, canZone, paintZone, zoneCost, bulldoze,
    buildById, count, zonedCount, developedCount, pushLog
  };
})();
