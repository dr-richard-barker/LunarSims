/* Lunar Metropolis — AI auto-play director.

   A priority ladder, run once per simulated day, that will build and manage
   a city on its own with a growth mindset: it keeps the lights on and the
   air in first, then spends everything else on getting bigger.

   Loaded optionally — sim.js calls window.LM_AUTO.step only if it exists, so
   nothing here is a compile-time dependency of the simulation. No DOM
   references, so harness.html can run a whole city start to finish headlessly.

   THE LAYOUT

   The director builds a lattice rather than sprawling, because the growth
   model rewards it: a zoned tile needs transit, power and atmosphere all
   within one tile, so regular streets serve far more ground per credit than
   organic growth does.

     - Tube streets every third row. That puts every interior tile within one
       tile of a street, which is the adjacency the growth model wants.
     - Atmosphere mains buried under those same streets. They are subsurface
       so they cost the street nothing.
     - Power conduits in columns every sixth tile.

   The one subtlety is what happens where a conduit column crosses a tube
   street, since both are surface structures and only one can have the tile.
   The conduit wins, and it has to: power is a flood fill and a column broken
   every three rows would leave isolated segments no generator can reach.
   Transit is pure adjacency with no network solve at all (see grid.js), so
   the one-tile gap the conduit leaves in each street costs nothing — every
   tile that needed that street still touches it somewhere else.

   Interior tiles further from a column start unpowered, and are meant to:
   current also flows through developed buildings, so the grid walks outward
   one ring at a time as the blocks nearest each column develop. */

(function () {
  const D = window.LM_DATA, T = window.LM_TERRAIN, G = window.LM_GRID;
  const Z = window.LM_ZONES, S = window.LM_SIM, B = window.LM_BUDGET, E = window.LM_ERAS;
  const K = D.K;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* Never spend the treasury to nothing — a director that buys one more
     block and then cannot pay its department bills has made the city
     smaller, not bigger. Sandbox lifts the floor entirely, since nothing
     costs anything there. */
  const reserveFloor = s => Math.max(K.AI_RESERVE_FLOOR, s.pop * 40);
  /* The director will cut tax below the base rate to buy demand, but not to
     nothing — it still has departments to pay for. */
  const AI_MIN_TAX = 5;

  /* Utilities are built in BATCHES sized to the shortfall, not one per day.

     One plant a day is fine for a young colony and hopeless later: arrivals
     scale with the city, so a 20,000-person colony gains around 400 people a
     day while a single oxygen plant adds 45 of capacity. The director fell
     permanently behind its own pressurisation target somewhere past 15,000
     residents and could never catch up — it was not short of money or of
     ground, it was short of a loop. Still capped per day, so a city reads as
     being built rather than appearing fully formed. */
  const BUILD_BATCH = 8;
  const afford = (s, cost) => s.sandbox || (s.credits - cost) >= reserveFloor(s);
  const buildCost = id => S.buildById(id).cost;

  /* ---------- the lattice ---------- */

  /* Chosen once, then kept. Scores candidate centres on the two things that
     actually matter for a lunar site: how much sun the ground gets (solar is
     the only generation available at the start) and how much of it can be
     built on at all. */
  function ensureSeed(s) {
    if (s.ai && s.ai.ox !== undefined) return s.ai;
    let best = null, bestScore = -1;
    for (let cy = 24; cy <= K.ROWS - 24; cy += 6) {
      for (let cx = 24; cx <= K.COLS - 24; cx += 6) {
        let sun = 0, ok = 0, n = 0, flat = 0;
        const h0 = T.tileAt(s, cx, cy).h;
        for (let y = cy - 5; y <= cy + 5; y += 1) {
          for (let x = cx - 5; x <= cx + 5; x += 1) {
            const t = T.tileAt(s, x, y);
            if (!t) continue;
            n++; sun += t.sun;
            if (T.buildable(t)) ok++;
            if (Math.abs(t.h - h0) <= 1) flat++;
          }
        }
        if (!n) continue;
        const score = (sun / n) * 1.2 + (ok / n) * 1.5 + (flat / n) * 1.0;
        if (score > bestScore) { bestScore = score; best = { x: cx, y: cy }; }
      }
    }
    s.ai = { ox: best.x, oy: best.y, r: 7, built: 0 };
    return s.ai;
  }

  const isStreetRow = (a, y) => ((y - a.oy) % K.AI_BLOCK + K.AI_BLOCK) % K.AI_BLOCK === 0;
  const isConduitCol = (a, x) => ((x - a.ox) % K.AI_CONDUIT_EVERY + K.AI_CONDUIT_EVERY) % K.AI_CONDUIT_EVERY === 0;
  /* Interior ground is everything the lattice itself does not claim. */
  const isInterior = (a, x, y) => !isStreetRow(a, y) && !isConduitCol(a, x);

  /* Walks the lattice area nearest-first, so the city fills in from the
     centre outward instead of scattering. */
  function walkArea(a, fn) {
    for (let ring = 0; ring <= a.r; ring++) {
      for (let y = a.oy - ring; y <= a.oy + ring; y++) {
        for (let x = a.ox - ring; x <= a.ox + ring; x++) {
          if (Math.max(Math.abs(x - a.ox), Math.abs(y - a.oy)) !== ring) continue;
          if (fn(x, y) === false) return;
        }
      }
    }
  }

  /* ---------- budget ---------- */

  /* Tax is the growth dial, not just the income one: every point above the
     base rate suppresses demand, so the director keeps it as low as the
     books allow rather than as high as it can get away with. */
  function manageBudget(s) {
    const netPerDay = s.revenue - s.expenses;
    const thin = s.credits < reserveFloor(s);

    if (s.credits < 0 || (thin && netPerDay < 0)) {
      if (s.taxRate < K.MAX_TAX) s.taxRate++;
    } else if (s.credits > reserveFloor(s) * 4 && netPerDay > 0 && s.taxRate > AI_MIN_TAX) {
      /* Below the base rate the tax bite goes negative and every demand index
         is lifted rather than dragged. A treasury sitting on a surplus it has
         no use for is worth more spent that way than banked — which is what a
         growth mindset means once the books are already comfortable. */
      s.taxRate--;
    }

    /* Departments stay fully funded whenever the city can pay for it. When it
       cannot, science is trimmed first — losing research only slows the next
       era, whereas trimming safety costs density the city has already built
       and trimming power or air stalls growth outright. */
    const squeeze = s.credits < 0;
    for (const d of D.DEPARTMENTS) {
      const floor = d.id === 'science' ? 0.4 : d.id === 'transit' ? 0.7 : 1;
      s.funding[d.id] = squeeze ? floor : 1;
    }
  }

  /* ---------- utilities ---------- */

  function readGrid(s) {
    const eff = B.effects(s), pw = Z.power(s), tal = Z.tally(s);
    return {
      eff,
      gen: pw.gen * eff.genMul,
      load: tal.draw + pw.o2Draw,
      airCap: Math.floor(pw.o2Plants * K.AIR_PER_PLANT * eff.airMul)
    };
  }

  /* A free interior tile matching a predicate, nearest the centre first. */
  function spot(s, a, pred) {
    let found = null;
    walkArea(a, (x, y) => {
      if (!isInterior(a, x, y)) return;
      const t = T.tileAt(s, x, y);
      if (!t || t.b || t.zone || !T.buildable(t)) return;
      if (pred && !pred(t)) return;
      found = t;
      return false;
    });
    return found;
  }

  const nextTo = (s, t, pred) => G.DIRS.some(([dx, dy]) => {
    const n = T.tileAt(s, t.x + dx, t.y + dy);
    return n && pred(n);
  });
  const isConduit = t => t.b && t.b.type === 'conduit';
  const isTube = t => t.b && t.b.type === 'tube';

  /* ---------- power and air ---------- */

  /* Generation is kept ahead of load by a margin rather than matched to it:
     a grid that only just covers demand stalls the moment the next block
     develops, and a stalled block is a block paying upkeep for nothing.

     Capacity is not the only trigger, though. The conduit columns are
     electrically separate from one another — a column is only live if a
     generator is sitting against it — so a city can have generation to spare
     and still have whole streets that cannot develop because no array was
     ever built on their column. Left on capacity alone that deadlocks: the
     unpowered ground never develops, so load never rises, so the director
     never builds the array that would have freed it. Reaching for an unfed
     column is therefore a reason to build in its own right. */
  function ensurePower(s, a) {
    const g = readGrid(s);
    const powered = G.powerNet(s);
    const isDark = t => !powered.has(G.idx(t.x, t.y));
    /* Is there a conduit in the lattice with no current in it? */
    let darkColumn = false;
    walkArea(a, (x, y) => {
      const t = T.tileAt(s, x, y);
      if (t && isConduit(t) && isDark(t)) { darkColumn = true; return false; }
    });
    if (g.gen >= g.load * K.AI_POWER_MARGIN && !darkColumn) return false;

    /* A fission plant is worth roughly nine arrays and does not care about
       dust or sun, so take one whenever the era allows and the city is big
       enough to need that much in one place. */
    if (E && E.unlocked(s, 'reactor') && g.load > 25 && !darkColumn &&
        afford(s, buildCost('reactor'))) {
      const t = spot(s, a, tt => nextTo(s, tt, isConduit));
      if (t && !S.place(s, t, 'reactor')) return true;
    }
    if (!afford(s, buildCost('solar'))) return false;
    /* Sited on the sunniest ground touching the grid — the whole reason the
       sun model exists is that where an array goes changes what it earns —
       but an unlit column outranks a sunny tile on a column that already has
       power, because connecting new ground is worth more than more kilowatts
       into ground that is already served.

       Batched for the same reason the oxygen plants are: an array is worth
       about 7 kW and a large city's load climbs far faster than one a day. */
    const pickSite = () => {
      let best = null, bestScore = -1;
      walkArea(a, (x, y) => {
        if (!isInterior(a, x, y)) return;
        const t = T.tileAt(s, x, y);
        if (!t || t.b || t.zone || !T.buildable(t)) return;
        let dark = false, touches = false;
        for (const [dx, dy] of G.DIRS) {
          const n = T.tileAt(s, x + dx, y + dy);
          if (n && isConduit(n)) { touches = true; if (isDark(n)) dark = true; }
        }
        if (!touches) return;
        const score = t.sun - (t.dust || 0) * 0.5 + (dark ? 2 : 0);
        if (score > bestScore) { bestScore = score; best = t; }
      });
      return best;
    };
    const deficit = Math.max(0, g.load * K.AI_POWER_MARGIN - g.gen);
    const need = Math.min(BUILD_BATCH, Math.max(1, Math.ceil(deficit / 6)));
    let built = 0;
    for (let i = 0; i < need; i++) {
      if (!afford(s, buildCost('solar'))) break;
      const t = pickSite();
      if (!t || S.place(s, t, 'solar')) break;
      built++;
    }
    return built > 0;
  }

  function ensureAir(s, a) {
    const g = readGrid(s);
    const target = Math.max(20, s.pop * K.AI_AIR_MARGIN);
    if (g.airCap >= target) return false;
    const per = Math.max(1, K.AIR_PER_PLANT * g.eff.airMul);
    const need = Math.min(BUILD_BATCH, Math.ceil((target - g.airCap) / per));
    let built = 0;
    for (let i = 0; i < need; i++) {
      if (!afford(s, buildCost('o2'))) break;
      const t = spot(s, a, tt => tt.pipe || nextTo(s, tt, n => n.pipe));
      if (!t || S.place(s, t, 'o2')) break;
      built++;
    }
    return built > 0;
  }

  /* ---------- ground clearance ---------- */

  /* Boulder fields cannot be built on or zoned, and clearing them is free.
     Without this the director simply routes around them, which leaves holes
     in the street grid and strands the interior tiles that depended on the
     missing street. It also matters after a meteor: the strike leaves a rim
     of boulder field, so a director that never cleared any could never
     rebuild what it lost. */
  function clearObstacles(s, a, budget) {
    let n = 0;
    walkArea(a, (x, y) => {
      if (n >= budget) return false;
      const t = T.tileAt(s, x, y);
      if (!t || t.t !== 'boulder') return;
      if (T.clearBoulders(s, x, y)) n++;
    });
    return n;
  }

  /* ---------- networks ---------- */

  /* Lays a bounded number of lattice tiles per day. The cap is what makes the
     city appear to be built rather than stamped: over a few hundred days the
     streets creep outward at a readable pace. */
  function growNetworks(s, a, budgetTiles) {
    let laid = 0;
    walkArea(a, (x, y) => {
      if (laid >= budgetTiles) return false;
      const t = T.tileAt(s, x, y);
      if (!t) return;
      const col = isConduitCol(a, x), row = isStreetRow(a, y);
      if (!col && !row) return;

      /* Mains run under BOTH the streets and the conduit columns. Under the
         streets alone they would be a set of parallel runs that never touch,
         and atmosphere is a flood fill from the oxygen plants — one plant
         would pressurise its own street and nothing else. Crossing the two
         makes it a single connected grid. They are buried, so they cost the
         surface nothing either way. */
      if (!t.pipe && afford(s, buildCost('main'))) {
        if (!S.place(s, t, 'main')) laid++;
      }
      /* The conduit column wins every crossing — see the note at the top of
         this file for why the gap it leaves in the street is harmless. */
      const want = col ? 'conduit' : 'tube';
      if (!t.b && afford(s, buildCost(want))) {
        if (!S.place(s, t, want)) laid++;
      }
    });
    return laid;
  }

  /* ---------- zoning ---------- */

  /* Only the three RCI kinds. The special districts answer no demand index,
     so counting them here would put a NaN in the tally and tell the director
     nothing it can act on. */
  function zoneCounts(s) {
    const c = { hab: 0, trade: 0, industry: 0 };
    for (const t of s.map) if (t.zone && c[t.zone.kind] !== undefined) c[t.zone.kind]++;
    return c;
  }

  /* Follows demand, but bootstraps one of each first: all three indices sit
     at zero on an empty map, so a pure demand read has nothing to choose
     between and the city never starts. */
  function pickKind(s) {
    const c = zoneCounts(s);
    if (!c.hab) return 'hab';
    if (!c.trade) return 'trade';
    if (!c.industry) return 'industry';
    const d = s.demand;
    if (d.hab >= d.trade && d.hab >= d.industry) return 'hab';
    return d.trade >= d.industry ? 'trade' : 'industry';
  }

  /* High density as soon as the era can actually use it. Below that the extra
     cost buys nothing, because the era ceiling caps the stage anyway. */
  function pickDensity(s) {
    const cap = E ? E.stageCap(s) : K.MAX_STAGE;
    return cap >= 2 ? 'high' : 'low';
  }

  function growZoning(s, a, budgetTiles) {
    /* Stop buying ground while a lot of what was already bought has not
       developed. A backlog that big means something upstream is wrong — an
       unlit column, no pressurisation, negative demand — and buying more
       tiles neither diagnoses it nor fixes it, it just spends the reserve
       that the fix will need. */
    if (S.zonedCount(s) - S.developedCount(s) > 45) return 0;
    const kind = pickKind(s), density = pickDensity(s);
    if (!afford(s, S.zoneCost(kind, density))) return 0;
    let n = 0;
    walkArea(a, (x, y) => {
      if (n >= budgetTiles) return false;
      if (!isInterior(a, x, y)) return;
      const t = T.tileAt(s, x, y);
      if (!t || t.b || t.zone) return;
      if (S.canZone(s, t)) return;
      /* Only ground a street already reaches. Zoning ahead of the lattice
         buys tiles that pay upkeep and cannot develop. */
      if (!G.hasTransit(s, x, y)) return;
      if (!afford(s, S.zoneCost(kind, density))) return false;
      if (S.paintZone(s, x, y, 1, 1, kind, density)) n++;
    });
    return n;
  }

  /* ---------- civic services ---------- */

  /* One building per so many developed tiles, in the order they start to
     matter: repair holds what has been built, science unlocks the next era,
     then the quality-of-life buildings that lift land value. */
  const SERVICE_PLAN = [
    { id: 'depot', per: 22 },
    { id: 'lab', per: 40 },
    { id: 'medbay', per: 55 },
    { id: 'biodome', per: 60 },
    { id: 'training', per: 80 }
  ];

  function ensureServices(s, a) {
    const developed = S.developedCount(s);
    for (const p of SERVICE_PLAN) {
      const want = Math.floor(developed / p.per);
      if (want <= S.count(s, p.id)) continue;
      if (E && !E.unlocked(s, p.id)) continue;
      if (!afford(s, buildCost(p.id))) continue;
      /* Placed where there is developed ground to cover, not on the frontier
         — a coverage radius over empty regolith is a wasted building. */
      let best = null, bestN = -1;
      walkArea(a, (x, y) => {
        if (!isInterior(a, x, y)) return;
        const t = T.tileAt(s, x, y);
        if (!t || t.b || t.zone || !T.buildable(t)) return;
        let near = 0;
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          const n = T.tileAt(s, x + dx, y + dy);
          if (n && n.zone && n.zone.stage > 0) near++;
        }
        if (near > bestN) { bestN = near; best = t; }
      });
      if (best && !S.place(s, best, p.id)) return true;
    }
    return false;
  }

  /* ---------- the special districts ---------- */

  /* Both are demand-free, so the director cannot read an index to decide it
     wants one — it decides on the city's size instead, the same way the
     General does. Kept small: a handful of tiles each, sited away from the
     habitation it drags the value of. */
  function districtTiles(s, kind) {
    let n = 0;
    for (const t of s.map) if (t.zone && t.zone.kind === kind) n++;
    return n;
  }

  function growDistrict(s, a, kind, want) {
    if (districtTiles(s, kind) >= want) return false;
    if (S.canZoneKind(s, kind)) return false;
    if (!afford(s, S.zoneCost(kind, 'low'))) return false;
    /* Out at the lattice edge rather than through the middle of downtown —
       both districts drag the land value of whatever they sit beside. */
    let best = null, bestD = -1;
    walkArea(a, (x, y) => {
      if (!isInterior(a, x, y)) return;
      const t = T.tileAt(s, x, y);
      if (!t || t.b || t.zone || S.canZone(s, t)) return;
      if (!G.hasTransit(s, x, y)) return;
      const d = Math.max(Math.abs(x - a.ox), Math.abs(y - a.oy));
      if (d > bestD) { bestD = d; best = t; }
    });
    return best ? S.paintZone(s, best.x, best.y, 1, 1, kind, 'low') > 0 : false;
  }

  function ensureDistricts(s, a) {
    /* The General's offer is free money in employment terms and the director
       has no reason to refuse it. */
    if (s.military && s.military.state === 'pending') S.acceptMilitary(s);
    const pop = s.pop || 0;
    if (pop > 1500 && growDistrict(s, a, 'launch', Math.min(9, 3 + Math.floor(pop / 2500)))) return true;
    if (growDistrict(s, a, 'military', Math.min(6, Math.floor(pop / 700)))) return true;
    return false;
  }

  /* ---------- wonders ---------- */

  /* Both are terrain-gated, so the director does not sculpt for them — it
     takes them if the map it settled on happens to allow one. */
  function ensureWonders(s, a) {
    for (const id of ['megadome', 'massdriver']) {
      if (S.count(s, id) >= 1) continue;
      if (E && !E.unlocked(s, id)) continue;
      if (!afford(s, buildCost(id))) continue;
      let placed = false;
      /* Searched over the whole map rather than the lattice: a skylight or a
         ridge is wherever the generator put it. */
      for (const t of s.map) {
        if (t.b || t.zone) continue;
        if (S.canPlace(s, t, id)) continue;
        if (!S.place(s, t, id)) { placed = true; break; }
      }
      if (placed) return true;
    }
    return false;
  }

  /* ---------- growth ---------- */

  /* Widen the lattice once the ground already inside it is not just bought
     but actually built on. Reading zoning rather than development would let
     the city expand on the strength of tiles that never developed, laying
     street after street against no income at all — which is exactly how a
     director spends itself broke while looking busy. */
  function maybeExpand(s, a) {
    let interior = 0, built = 0;
    walkArea(a, (x, y) => {
      if (!isInterior(a, x, y)) return;
      const t = T.tileAt(s, x, y);
      if (!t || !T.buildable(t)) return;
      interior++;
      if (t.b || (t.zone && t.zone.stage > 0)) built++;
    });
    if (interior && built / interior > 0.6 && a.r < 46) { a.r += 3; return true; }
    return false;
  }

  /* ---------- entry point ---------- */

  /* The ladder. Order is the whole design: utilities before ground, ground
     before buildings, and expansion last, so the director never widens the
     city while the part it already has is browning out. */
  function step(s) {
    const a = ensureSeed(s);
    manageBudget(s);
    clearObstacles(s, a, 6);
    ensurePower(s, a);
    ensureAir(s, a);
    growNetworks(s, a, 10);
    growZoning(s, a, 4);
    ensureServices(s, a);
    ensureDistricts(s, a);
    ensureWonders(s, a);
    maybeExpand(s, a);
  }

  window.LM_AUTO = {
    step, ensureSeed, manageBudget, clearObstacles, ensurePower, ensureAir,
    growNetworks, growZoning, ensureServices, ensureDistricts, ensureWonders, maybeExpand,
    isStreetRow, isConduitCol, isInterior, reserveFloor
  };
})();
