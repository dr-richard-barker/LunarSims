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

  /* Bump whenever the saved shape changes in a way older saves lack. v4 adds
     the three mode switches and the disaster state, and — more importantly —
     corrects the RCI ratios, which changes how an existing city behaves
     rather than just what it stores. Carrying a v3 city forward would leave
     it balanced against rules that no longer exist. */
  const STATE_VERSION = 4;
  const buildById = id => BUILDINGS.find(b => b.id === id);

  function newGame(seed) {
    const w = T.makeMap(seed === undefined ? Math.floor(Math.random() * 9999) : seed);
    const s = {
      version: STATE_VERSION, seed: w.seed,
      map: w.map,
      day: 1,
      credits: K.START_CREDITS,
      pop: 0, peakPop: 0, housingCap: 0, jobs: 0,
      demand: { hab: 0, trade: 0, industry: 0 },
      gen: 0, ratedGen: 0, load: 0, airCap: 0,
      revenue: 0, expenses: 0, deptExpenses: 0, zoneUpkeep: 0,
      brownout: false, airShort: false,

      /* Modes. Disasters start OFF: this is a sandbox city builder, and a
         player who came to design a city should opt in to having one wrecked
         rather than opt out. */
      sandbox: false, disastersOn: false, invasionOn: false, autoPlay: false,
      flareDays: 0, lastDisaster: -999, lastInvasion: -999, departed: 0,
      military: null,          // null until the General calls; see offerMilitary

      log: [], history: []
    };
    return Object.assign(s, window.LM_BUDGET.initial());
  }

  /* ---------- placement ---------- */

  /* A megadome has to sit beside an intact lava-tube skylight, and a mass
     driver needs a long, high, level run. Both tie a wonder to terrain the
     player either found or sculpted, rather than letting it drop anywhere. */
  function nearSkylight(s, t) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = T.tileAt(s, t.x + dx, t.y + dy);
        if (n && n.t === 'skylight') return true;
      }
    }
    return false;
  }

  /* Seven tiles of level ground in a straight line, high enough to throw
     from — checked along both axes. */
  function onRidge(s, t) {
    if (t.h < 7) return false;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      let ok = true;
      for (let i = -3; i <= 3; i++) {
        const n = T.tileAt(s, t.x + dx * i, t.y + dy * i);
        if (!n || n.h !== t.h || !T.buildable(n)) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  /* Sandbox mode. Everything is free and every era-gated structure is
     available immediately — the player (or the director) is designing a city
     rather than earning one. It deliberately does NOT touch the era itself:
     the city still advances through Outpost to Metropolis as it grows, so the
     architecture still changes as it earns it. What sandbox removes is the
     permission system, not the progression. */
  const free = s => !!s.sandbox;
  const cost = (s, n) => free(s) ? 0 : n;

  /* Level ground: this tile and all eight neighbours at the same height, and
     all of them buildable. */
  function isLevel(s, t, r) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const n = T.tileAt(s, t.x + dx, t.y + dy);
        if (!n || n.h !== t.h || !T.buildable(n)) return false;
      }
    }
    return true;
  }

  /* Clear as well as level — nothing already standing on it or zoned. Used by
     the arena, which wants a real site rather than a gap between towers. */
  function isOpen(s, t, r) {
    if (!isLevel(s, t, r)) return false;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const n = T.tileAt(s, t.x + dx, t.y + dy);
        if (n.b || n.zone) return false;
      }
    }
    return true;
  }

  /* A crater floor the sun never reaches: dark, and genuinely lower than the
     ground around it rather than merely shaded by a neighbouring tower. */
  /* Scanned five tiles out, not three. A crater floor wide enough to be worth
     stringing a dish across is wider than a three-tile scan can see — with
     the tighter radius the middle of a large crater could not find its own
     rim and reported flat ground, which refused exactly the sites the
     telescope exists for. */
  function inShadowedCrater(s, t) {
    if (t.sun > K.SUN_SHADOW) return false;
    let higher = 0, n = 0;
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        const q = T.tileAt(s, t.x + dx, t.y + dy);
        if (!q) continue;
        n++;
        if (q.h > t.h) higher++;
      }
    }
    return n > 0 && higher / n >= 0.25;
  }

  const onPeakOfLight = (s, t) => t.sun >= K.SUN_PEAK && t.h >= 8;

  function besideLaunchPad(s, t) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = T.tileAt(s, t.x + dx, t.y + dy);
        if (n && n.zone && n.zone.kind === 'launch' && n.zone.stage > 0) return true;
      }
    }
    return false;
  }

  function canPlace(s, t, type) {
    const B = buildById(type);
    if (!B) return 'Unknown structure.';
    if (!t) return 'That is off the map.';
    if (!free(s) && window.LM_ERAS && !window.LM_ERAS.unlocked(s, type)) {
      return window.LM_ERAS.lockReason(s, type);
    }
    if (B.once && count(s, type) >= 1) return `The colony only builds one ${B.name}.`;
    if (B.needsSkylight && !nearSkylight(s, t)) {
      return 'A megadome must be built beside a lava-tube skylight.';
    }
    if (B.needsRidge && !onRidge(s, t)) {
      return 'A mass driver needs seven tiles of level ground at height 7 or above to run along.';
    }
    if (B.needsHeight && t.h < B.needsHeight) {
      return `A space elevator has to be anchored at height ${B.needsHeight} or above — this ground is at ${t.h}.`;
    }
    if (B.needsLevel && !isLevel(s, t, B.needsLevel)) {
      return 'That needs level ground — flatten the site first.';
    }
    if (B.needsOpen && !isOpen(s, t, B.needsOpen)) {
      return `That needs a clear, level ${B.needsOpen * 2 + 1}x${B.needsOpen * 2 + 1} site.`;
    }
    if (B.needsShadow && !inShadowedCrater(s, t)) {
      return 'A radio telescope has to sit on a permanently shadowed crater floor, with the rim above it to screen out Earth.';
    }
    if (B.needsPeakSun && !onPeakOfLight(s, t)) {
      return 'A heliostat crown belongs on a peak of eternal light — high ground the sun never leaves.';
    }
    if (B.needsLaunchPad && !besideLaunchPad(s, t)) {
      return 'A launch arcology has to be built beside a working launch complex.';
    }
    if (!T.buildable(t)) return t.t === 'boulder'
      ? 'Clear the boulders first.'
      : 'Nothing can be built on that ground.';

    if (B.subsurface) {
      if (t.pipe) return 'A main already runs under here.';
    } else {
      if (t.b) return t.b.type === type ? 'Already built here.' : 'Something is already built here.';
      if (t.zone) return 'That ground is zoned — clear the zoning first.';
    }
    if (s.credits < cost(s, B.cost)) return `That costs ${B.cost.toLocaleString()} credits.`;
    return null;
  }

  function place(s, t, type) {
    const err = canPlace(s, t, type);
    if (err) return err;
    const B = buildById(type);
    s.credits -= cost(s, B.cost);
    if (B.subsurface) t.pipe = true;
    else t.b = { type };
    return null;
  }

  /* ---------- zoning ---------- */

  /* ---------- the General's offer ----------

     SimCity 2000 offered a military base once the city was big enough and
     then sited it for you, choosing Army, Air Force, Navy or Missile Silos
     from the terrain. Here you site it yourself — but the terrain still
     decides which kind of base you are getting, which is the part of the
     original worth keeping. */

  const BASE_KINDS = {
    landing: { name: 'Landing Field', why: 'the ground around the city is flat enough to set heavy lifters down on' },
    garrison: { name: 'Garrison', why: 'the broken ground around the city suits a dug-in garrison' },
    silos: { name: 'Silo Field', why: 'the deep shadowed craters around the city will take hardened silos' }
  };

  /* Reads the ground the city actually occupies, not the whole map. */
  function baseKindFor(s) {
    let n = 0, flat = 0, rough = 0, deep = 0, sumH = 0;
    const built = [];
    for (const t of s.map) if (t.b || t.zone) built.push(t);
    if (!built.length) return 'garrison';
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const t of built) {
      if (t.x < x0) x0 = t.x; if (t.x > x1) x1 = t.x;
      if (t.y < y0) y0 = t.y; if (t.y > y1) y1 = t.y;
    }
    for (let y = y0 - 4; y <= y1 + 4; y++) {
      for (let x = x0 - 4; x <= x1 + 4; x++) {
        const t = T.tileAt(s, x, y);
        if (!t) continue;
        n++; sumH += t.h;
        if (t.t === 'flat') flat++;
        if (t.t === 'rough' || t.t === 'boulder') rough++;
        if (t.sun <= K.SUN_SHADOW) deep++;
      }
    }
    if (!n) return 'garrison';
    if (deep / n > 0.18) return 'silos';
    if (rough / n > 0.30) return 'garrison';
    return flat / n > 0.55 ? 'landing' : 'garrison';
  }

  function offerMilitary(s) {
    if (s.military !== undefined && s.military !== null) return false;
    if (s.pop < K.MILITARY_OFFER_POP) return false;
    s.military = { state: 'pending', kind: baseKindFor(s), day: s.day };
    pushLog(s, `★ A General is on the line. The colony is large enough to ` +
      `warrant a military presence, and ${BASE_KINDS[s.military.kind].why} — ` +
      `they are offering a ${BASE_KINDS[s.military.kind].name}.`);
    return true;
  }

  function acceptMilitary(s) {
    if (!s.military || s.military.state !== 'pending') return 'There is no offer on the table.';
    s.military.state = 'accepted';
    pushLog(s, `★ ${BASE_KINDS[s.military.kind].name} approved. The military brush is now available — site it yourself.`);
    return null;
  }
  function declineMilitary(s) {
    if (!s.military || s.military.state !== 'pending') return 'There is no offer on the table.';
    s.military.state = 'declined';
    pushLog(s, '★ The General has been turned down. The offer will not come again.');
    return null;
  }
  const militaryUnlocked = s => !!s.sandbox || !!(s.military && s.military.state === 'accepted');

  /* ---------- the arcology exodus ----------

     SimCity 2000's Launch Arcologies eventually lifted off with everyone
     inside. Here one dispatches a colony ship periodically and then fills
     back up, so it reads as the same idea without deleting a chunk of the
     player's city every few years — this game has no fail state and taking
     thousands of residents away permanently would be the nearest thing to
     one. The counter is the score: it is the only number in the game that
     only ever goes up. */
  function launchColonyShips(s) {
    for (const t of s.map) {
      if (!t.b) continue;
      const B = buildById(t.b.type);
      if (!B || !B.departsEvery) continue;
      if (!t.b.built) t.b.built = s.day;
      if ((s.day - t.b.built) > 0 && (s.day - t.b.built) % B.departsEvery === 0) {
        s.departed = (s.departed || 0) + B.housing;
        pushLog(s, `⬢ A colony ship has left the ${B.name} at ${t.x + 1}, ${t.y + 1} ` +
          `carrying ${B.housing.toLocaleString()} settlers outbound. ` +
          `${s.departed.toLocaleString()} have now gone on from here.`);
      }
    }
  }

  /* Zoning gates that depend on the KIND being painted rather than on the
     ground. canZone answers "can anything be zoned here"; this answers "is
     this brush available to you at all". */
  function canZoneKind(s, kind) {
    if (kind === 'military' && !militaryUnlocked(s)) {
      return s.military && s.military.state === 'declined'
        ? 'You turned the General down.'
        : 'No military presence has been authorised here yet.';
    }
    return null;
  }

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
    if (canZoneKind(s, kind)) return 0;
    const each = cost(s, zoneCost(kind, density));
    let painted = 0;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const t = T.tileAt(s, xx, yy);
        if (canZone(s, t)) continue;
        if (s.credits < each) return painted;
        s.credits -= each;
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
    /* The director acts at the top of the day, before anything is evaluated,
       so what it builds is reflected in the same day's growth rather than
       lagging it by one. Loaded optionally — sim.js has no hard dependency on
       autopilot.js, the same discipline the renderer follows. */
    if (s.autoPlay && window.LM_AUTO) {
      try { window.LM_AUTO.step(s); } catch (e) { console.error('autoplay', e); }
    }
    /* Then the dice, if the player opted in. The two decks roll separately
       and on separate toggles — see invasion.js for why they are kept apart. */
    let disasterEvent = null, invasionEvent = null;
    if (s.disastersOn && window.LM_DISASTERS) disasterEvent = window.LM_DISASTERS.maybeFire(s);
    if (s.invasionOn && window.LM_INVASION) invasionEvent = window.LM_INVASION.maybeFire(s);
    if (window.LM_INVASION) window.LM_INVASION.expireSnatched(s);
    if (s.flareDays > 0) s.flareDays--;

    /* Dust settles before growth is evaluated, so a district reacts to the
       air it is actually breathing today rather than yesterday's. */
    if (window.LM_SERVICES) window.LM_SERVICES.diffuseDust(s);
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

    /* Research accrues per developed tile, multiplied by any lab coverage
       over it — so siting labs across the dense districts is worth far more
       than parking them on the edge of the map. */
    let sci = 0;
    for (const t of s.map) {
      if (!t.zone || t.zone.stage === 0) continue;
      const boost = r.cov ? 1 + r.cov.research[G.idx(t.x, t.y)] : 1;
      sci += r.eff.sciencePerDay * boost;
    }
    /* Instruments that do research in their own right rather than by
       multiplying what the districts under them produce — a telescope on an
       empty crater floor is still doing science. */
    for (const t of s.map) {
      if (!t.b) continue;
      const B = buildById(t.b.type);
      if (B && B.researchPerDay) sci += B.researchPerDay;
    }
    s.research += sci;

    /* Migration tracks the gap between people and pressurised housing.
       A colony that has over-extended its grid or its oxygen supply stops
       attracting anyone and slowly loses the people it has — a setback the
       player can build their way out of, never a game over. */
    if (!r.brownout && !r.airShort) {
      const gap = Math.max(0, s.housingCap - s.pop);
      /* The ceiling on daily arrivals scales with the city. A flat cap is
         right for an outpost with one landing pad and absurd for a
         metropolis — held flat, a city with thousands of empty berths fills
         them at eight people a day and never catches up to its own housing. */
      const cap = Math.max(K.MIGRATION_CAP, Math.round(s.pop * K.MIGRATION_CAP_FRAC));
      s.pop += clamp(Math.round(gap * K.MIGRATION_RATE), 0, cap);
    } else if (s.pop > 0) {
      s.pop = Math.max(0, s.pop - Math.max(1, Math.round(s.pop * 0.02)));
    }
    if (s.pop > s.housingCap) s.pop = s.housingCap;
    /* Era progression reads the high-water mark rather than today's count,
       so a temporary slump never retroactively demolishes a skyline the
       city genuinely earned. */
    if (s.pop > s.peakPop) s.peakPop = s.pop;
    /* Checked after migration, so the offer arrives on the day the colony
       actually reaches the threshold rather than the day after. */
    offerMilitary(s);
    launchColonyShips(s);

    s.day++;
    s.history.push({
      d: s.day, pop: s.pop, jobs: s.jobs, housingCap: s.housingCap,
      credits: Math.round(s.credits), gen: Math.round(r.gen * 10) / 10,
      load: Math.round(r.load * 10) / 10,
      revenue: Math.round(s.revenue), expenses: Math.round(s.expenses)
    });
    if (s.history.length > 400) s.history.shift();
    /* Anything that fired today rides out on the tick result. The renderer
       stages its animation from this; the simulation itself neither knows nor
       cares whether one gets drawn. */
    r.disaster = disasterEvent;
    r.invasion = invasionEvent;
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
    canPlace, place, canZone, canZoneKind, paintZone, zoneCost, bulldoze,
    buildById, count, zonedCount, developedCount, pushLog,
    offerMilitary, acceptMilitary, declineMilitary, militaryUnlocked,
    baseKindFor, BASE_KINDS, launchColonyShips,
    isLevel, isOpen, inShadowedCrater, onPeakOfLight, besideLaunchPad
  };
})();
