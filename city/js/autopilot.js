/* Artemis City — Automanage director.
   A priority-ladder autopilot, adapted from lunar-habitat/js/autopilot.js:
   keep a cash reserve floor before spending on anything, grow the road
   network outward one segment at a time rather than leaping ahead of
   service, and let zoning follow demand instead of a fixed script. Loads
   after sim.js and is called from sim.js's endOfDay() only if it exists —
   sim.js has no compile-time dependency on this file. */

(function () {
  const S = window.LC_SIM, D = window.LC_DATA, GRID = window.LC_GRID;
  const K = D.K;

  /* Never spend the colony down to nothing — keep a floor that scales with
     population, the same "reserve()" discipline lunar-habitat's director
     uses to avoid building itself into a corner. */
  const reserveFloor = s => Math.max(800, s.pop * 60);
  const afford = (s, cost) => s.sandbox || (s.credits - cost) >= reserveFloor(s);

  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const cmdTile = s => s.map.find(t => t.b && t.b.type === 'command');

  /* Average daily credit delta over the trailing week, read straight from
     s.history — the same ledger the Colony tab's self-sufficiency streak
     reads, so the director and the player are looking at the same number. */
  function creditTrend(s) {
    const h = s.history;
    if (h.length < 2) return 0;
    const span = h.slice(-7);
    return (span[span.length - 1].credits - span[0].credits) / (span.length - 1);
  }

  function openTile(s, pred) {
    let best = null, bestD = Infinity, cmd = cmdTile(s);
    for (const t of s.map) {
      if (!GRID.inRevealed(s, t.x, t.y)) continue;
      if (t.b || t.f || t.zone) continue;
      if (t.t !== 'flat' && t.t !== 'rough') continue;
      if (pred && !pred(t)) continue;
      const d = dist(t, cmd);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  /* ---------- roads: grow outward from whatever the network already touches ---------- */

  function frontierRoadSpots(s) {
    const spots = [], seen = new Set();
    for (const t of s.map) {
      if (!t.b || (t.b.type !== 'track' && t.b.type !== 'command')) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = S.tileAt(s, t.x + dx, t.y + dy);
        if (!n) continue;
        const k = n.x + ',' + n.y;
        if (seen.has(k) || S.canPlace(s, n, 'track')) continue;
        seen.add(k); spots.push(n);
      }
    }
    return spots;
  }

  function extendRoads(s) {
    const cost = S.buildById('track').cost;
    if (!afford(s, cost)) return false;
    const spots = frontierRoadSpots(s);
    if (!spots.length) return false;
    const cmd = cmdTile(s);
    spots.sort((a, b) => dist(a, cmd) - dist(b, cmd));
    return !S.place(s, spots[0], 'track');
  }

  /* ---------- zoning: bootstrap one of each, then follow demand ---------- */

  function zoneCounts(s) {
    const c = { hab: 0, trade: 0, industry: 0 };
    for (const t of s.map) if (t.zone) c[t.zone.kind]++;
    return c;
  }

  function pickZoneKind(s) {
    const c = zoneCounts(s);
    /* Migration only unblocks once the food crisis clears, so any housing
       capacity zoned faster than the colony can actually fill just sits
       there as a dam — and the longer it accumulates, the bigger the
       population surge is the day it finally breaks, arriving faster than
       any reactive farm expansion can follow. Capping how far capacity is
       allowed to run ahead of today's population keeps that surge small
       enough to catch up to instead. */
    const habAhead = s.housingCap - s.pop > 8;
    if (!c.trade) return 'trade';
    if (!c.industry) return 'industry';
    if (!c.hab && !habAhead) return 'hab';
    const d = s.demand;
    if (habAhead) return d.trade >= d.industry ? 'trade' : 'industry';
    if (d.hab >= d.trade && d.hab >= d.industry) return 'hab';
    if (d.trade >= d.industry) return 'trade';
    return 'industry';
  }

  /* Zoning is per-tile serviced (only a tile actually touching a road
     grows — see zones.js), so a solid 3x3 block only ever develops on its
     outer edge and wastes the rest. The director zones one tile at a time,
     each one individually road-adjacent, which is slower to place but
     never wastes a purchase — over many days it reads as buildings lining
     the road, which is the point of a road anyway. */
  function zoneSpot(s) {
    const carries = t => t && t.b && (t.b.type === 'track' || t.b.type === 'rail' || t.b.type === 'command');
    const cmd = cmdTile(s);
    let best = null, bestD = Infinity;
    for (const t of s.map) {
      if (t.b || t.f || t.zone) continue;
      if (t.t !== 'flat' && t.t !== 'rough') continue;
      let touches = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (carries(S.tileAt(s, t.x + dx, t.y + dy))) touches = true;
      }
      if (!touches) continue;
      const d = dist(t, cmd);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  function growZoning(s) {
    const kind = pickZoneKind(s);
    const cost = S.zoneCost(kind, 1, 1);
    if (!afford(s, cost)) return false;
    const spot = zoneSpot(s);
    if (!spot) return false;
    return !S.paintZone(s, spot.x, spot.y, 1, 1, kind);
  }

  /* ---------- power ---------- */

  function ensurePower(s) {
    const gen = S.generation(s).total, dem = S.gridDemand(s).total;
    /* Daylight generation has to actually clear demand first — a battery
       bank on top of a grid that's already short even at noon just empties
       faster. Solar takes priority whenever there's a real daytime deficit. */
    if (gen < dem * 1.3) {
      const cost = S.buildById('solar').cost;
      if (afford(s, cost)) { const t = openTile(s); if (t) S.place(s, t, 'solar'); return; }
    }
    /* Once daytime generation clears demand with room to spare, a battery
       bank is what gets the colony through the 14.75-day lunar night —
       bank at least three before the first night is due (day ~14.75)
       rather than waiting for the reactive "stored is low" trigger, which
       doesn't fire until the night is already underway. */
    if (s.day < 13 && S.count(s, 'battery') < 3) {
      const cost = S.buildById('battery').cost;
      if (afford(s, cost)) { const t = openTile(s); if (t) S.place(s, t, 'battery'); return; }
    }
    if (s.stored < S.storageCap(s) * 0.4) {
      const cost = S.buildById('battery').cost;
      if (afford(s, cost)) { const t = openTile(s); if (t) S.place(s, t, 'battery'); return; }
    }
    if (s.pop + (s.jobs || 0) > 40 && !S.count(s, 'reactor')) {
      const cost = S.buildById('reactor').cost;
      if (afford(s, cost)) { const t = openTile(s); if (t) S.place(s, t, 'reactor'); }
    }
  }

  /* ---------- agriculture: tend, harvest, replant, expand ---------- */

  const daysOfFood = s => s.resources.food / Math.max(1, S.dailyFoodNeed(s));

  /* A calorie-dense staple like potato takes 95 days to mature — fine once
     the colony has slack, useless as the only thing standing between it and
     starvation. Reach for something that actually finishes in time when the
     reserve is thin. */
  function pickCrop(s) {
    const d = daysOfFood(s);
    if (d < 20) return 'duckweed';   // 16 days, edible whole, fastest real calories
    if (d < 35) return 'mizuna';     // 22 days
    if (d < 60) return 'romaine';    // 28 days
    return 'potato';                 // 95 days, but the reserve can carry it
  }

  function addSmallField(s, log, note, w, h) {
    w = w || 2; h = h || 2;
    const spot = (() => {
      for (let y = 0; y < K.ROWS - h; y++) for (let x = 0; x < K.COLS - w; x++) {
        if (!S.checkField(s, x, y, w, h)) return { x, y };
      }
      return null;
    })();
    if (!spot) return false;
    if (S.addField(s, spot.x, spot.y, w, h)) return false;
    /* Plant fast here regardless of how the reserve reads right now — this
       hall exists to hedge the founding potato's 95-day bet, which only
       works if it actually finishes sooner than that bet does. */
    const f = s.fields[s.fields.length - 1];
    S.plant(s, f, 'mizuna');
    if (log && note) log.push(note);
    return true;
  }

  function tendFarm(s, log) {
    for (const f of s.fields) {
      if (f.dead) { S.clearField(s, f); continue; }
      if (!f.crop) { S.plant(s, f, pickCrop(s)); continue; }
      if (f.moisture < 0.4) S.water(s, f);
      if (f.feed < 0.35) S.feed(s, f);
      if (f.growth >= 1) S.harvest(s, f, log);
    }
    /* The founding hall alone is a near-run thing: one calorie-dense staple
       against a reserve that runs out before it matures. Rather than wait
       for a crisis and then scramble — by which point roads and zoning
       have usually already spent the budget down to the reserve floor —
       claim a second, fast-cropping hall in the first fortnight, before
       anything else gets a turn at the day's credits. */
    if (s.day <= 14 && s.fields.length < 2) {
      if (s.sandbox || s.credits - S.fieldCost(2, 2) >= 1000) {
        addSmallField(s, log, 'Automanage broke ground on a second hall.');
      }
      return;
    }
    /* Food security still outranks the normal reserve floor after that —
       an empty larder is a faster death than an empty bank account. When
       it's this urgent, reach for whatever is affordable at all: a 1x2
       plot for 1,000 credits beats no plot because 2,000 wasn't there. */
    const d = daysOfFood(s);
    if (d < 20) {
      if (s.sandbox || s.credits - S.fieldCost(1, 2) >= 0) {
        const w = (s.sandbox || s.credits - S.fieldCost(2, 2) >= Math.max(500, s.pop * 50)) ? 2 : 1;
        addSmallField(s, log, null, w, 2);
      }
    }
    /* A city that only ever fed 3 people does not stay fed once housing and
       jobs pull in a sixteenth — capacity has to track population, not just
       the founding emergency. Keep total hall area roughly proportional to
       who actually has to eat, using the founding hall's own 3-tiles-per-
       colonist ratio as the yardstick. A population boom arriving all at
       once (migration only unblocks once the reserve clears the crisis
       line, so it tends to arrive in a rush) can outrun this faster than a
       single 2x2 a day keeps up, so this is not an either/or with the
       block above — a colony that is short on both days-of-food margin
       and total capacity needs both responses, not just the more urgent-
       looking one. */
    const totalTiles = s.fields.reduce((a, f) => a + f.w * f.h, 0);
    if (totalTiles < s.pop * 3) {
      const floor = Math.max(500, s.pop * 50);
      if (s.sandbox || s.credits - S.fieldCost(2, 2) >= floor) {
        addSmallField(s, log);
      } else if (s.sandbox || s.credits - S.fieldCost(1, 2) >= 0) {
        addSmallField(s, log, null, 1, 2);
      }
    }
  }

  /* ---------- mining, ISRU, spaceport ---------- */

  function ensureMining(s) {
    const cost = S.buildById('miner').cost;
    if (!afford(s, cost)) return;
    for (const kind of ['ice', 'he3', 'regolith']) {
      const t = s.map.find(x => x.deposit && x.deposit.kind === kind && !S.canPlace(s, x, 'miner'));
      if (t) { S.place(s, t, 'miner'); return; }
    }
  }

  function ensureIsru(s) {
    if (S.count(s, 'isru')) return;
    const minesIce = s.map.some(t => t.b && t.b.type === 'miner' && t.deposit && t.deposit.kind === 'ice');
    if (!minesIce) return;
    const cost = S.buildById('isru').cost;
    if (!afford(s, cost)) return;
    const t = openTile(s); if (t) S.place(s, t, 'isru');
  }

  function ensureSpaceport(s, log) {
    if (S.count(s, 'spaceport')) {
      const err = S.launchRocket(s);
      if (!err) log.push('Automanage cleared the pad for launch.');
      return;
    }
    const cost = S.buildById('spaceport').cost;
    if (!afford(s, cost)) return;
    const t = openTile(s); if (t) S.place(s, t, 'spaceport');
  }

  /* ---------- colony alerts ---------- */

  /* A pending alert isn't just an idle prompt — the UI shows it as a modal
     and gates the tick loop on the modal being hidden, so an unanswered
     alert freezes the whole colony, Automanage included, the moment it
     fires. Every event's first choice is its "handle it properly" option,
     and resolveEvent() already degrades gracefully (logs a shortfall and
     falls back to the risk-accepting outcome) when the colony can't afford
     it — so always reaching for choice one is a safe default, not a naive
     one. */
  function resolveDisaster(s, log) {
    if (!s.pendingEvent) return;
    const e = D.EVENTS.find(x => x.id === s.pendingEvent);
    if (!e) { s.pendingEvent = null; return; }
    const pick = e.choices[0];
    S.resolveEvent(s, e.id, pick.effect);
    if (log) log.push(`Automanage answered "${e.title}": ${pick.label}.`);
  }

  /* ---------- established / growingHealthily: shared by both toggles ---------- */

  /* The export economy is a late-game reach, not a bootstrap priority — an
     ISRU plant alone draws as much power as the entire founding grid. Only
     go after mining once the colony can actually carry the load: daytime
     generation comfortably ahead of demand, and past its first night.
     Chasing exports before that is how a 3kW plant tips a 6-kW-generation
     colony into a permanent brownout. */
  const established = s => s.day > 20 && S.generation(s).total > S.gridDemand(s).total * 1.4;

  /* Growth itself has to earn its keep once established: a negative
     trailing credit trend means the colony is spending down its founding
     stash faster than zones and exports replace it, and more zoning or a
     wider charter only adds upkeep to books already going backwards. In
     that state, chase the revenue side (mining/ISRU/the export pad) instead
     of adding more consumers of the grid — the actual path to paying for
     itself, not just spending the stash down slower. Before "established"
     this guard is always open (!established short-circuits true), so none
     of the early bootstrap sequencing changes. Read independently by both
     autoManageCity (for growZoning) and autoManageExpansion (for
     expandSurvey) — a City-only or Expansion-only run still gets the same
     "don't grow past what you can afford" discipline on its own half. */
  const growingHealthily = s => !established(s) || creditTrend(s) >= -5;

  /* ---------- entry points ---------- */

  /* Day-to-day operations: keep the colony fed, powered, roaded and
     zoning — everything short of widening the survey charter or chasing
     the export economy. Colony alerts are answered here too, since an
     unanswered one freezes the tick loop outright (see resolveDisaster's
     own note) and a player who only wants City automation still expects
     the colony to keep running unattended. */
  function autoManageCity(s, log) {
    resolveDisaster(s, log);
    tendFarm(s, log);
    /* An empty larder is a faster death than a stalled expansion — don't
       let roads or zoning compete with the emergency field for the same
       credits while food is critically short. */
    if (daysOfFood(s) < 15) return;
    ensurePower(s);
    extendRoads(s);
    /* Housing capacity that outruns the farm just means migration lands a
       population the colony can't feed, all at once, the moment the
       reserve clears the crisis line — a slower-building disaster than a
       stalled expansion, but the same disaster. Only keep zoning for more
       colonists once the farm can already carry the ones it has. */
    const totalTiles = s.fields.reduce((a, f) => a + f.w * f.h, 0);
    if (growingHealthily(s) && totalTiles >= s.pop * 2.5) growZoning(s);
  }

  /* Growing the charter and the export economy — the two things a colony
     can do without once it's simply running, which is exactly why a player
     might want this off while leaving day-to-day operations on. */
  function autoManageExpansion(s, log) {
    /* Same food-crisis guard as City — expansion spending has no business
       competing with an emergency field either. */
    if (daysOfFood(s) < 15) return;
    /* A charter that's run out of room caps the colony for good — expand it
       the moment it's earned (half the surveyed ground developed) and
       affordable, same reserve discipline as everything else here. */
    if (growingHealthily(s) && S.canExpand(s) && afford(s, S.expandCost(s))) S.expandSurvey(s);
    if (!established(s)) return;
    ensureMining(s);
    ensureIsru(s);
    ensureSpaceport(s, log);
  }

  window.LC_AUTO = { autoManageCity, autoManageExpansion, resolveDisaster };
})();
