/* Artemis City — simulation.
   A tile map of the Shackleton crater rim. Roads and rail are dragged as
   lines; the Agriculture zone is dragged as a rectangle and behaves exactly
   like a Lunar Farm grow hall (same crop model, same soil conditioning);
   Habitation/Trade/Industry are also dragged as rectangles, but instead of
   holding a single crop, each tile inside grows its own density over time —
   see zones.js. One tick is one hour of colony time, same convention as
   Lunar Farm. This file has no DOM references: the renderer depends on it,
   never the reverse, so it can be driven headlessly by harness.html. */

(function () {
  const { K, CROPS, ZONES, BUILDINGS, UPGRADES, DEPOSITS, EVENTS, MILESTONES } = window.LC_DATA;
  const GRID = window.LC_GRID;
  const ZONESYS = window.LC_ZONES;

  const KCAL_SCALE = 9;
  const VALUE_SCALE = 3;
  const COMMAND_KW = 3.0;          // legacy radioisotope unit at the Command Module, always on
  const REACTOR_KW = 9.0;
  const ARRAY_KW = 2.5;
  const BATTERY_KWH = 60;
  const BASE_KWH = 60;
  const O2_PER_LIT_HOUR = 0.010;
  const CO2_PER_O2 = 1.375;
  const WATER_PER_TILE = 0.25;
  const BASE_RECOVERY = 0.80;
  const COLONY_CO2 = 3.0;          // kg/day returned to the loop from colony-wide waste, not just crew
  const RAW_SOIL = 0.62;
  const SOIL_PER_LIT_HOUR = 0.00004;
  const MAX_FIELD = 8;
  const MAX_ZONE = 12;
  const COMMAND_POP_CAP = 4;       // berths built into the founding module, before any hab zoning
  const MIGRATION_RATE = 0.08;     // fraction of the housing gap that can move in per day
  const MIGRATION_CAP = 6;         // colonists per day, at most
  const EMIGRATION_RATE = 2;       // colonists per day lost when life support fails

  const MINE_RATE_PER_DAY = 8;     // units/day at richness 1.0
  const ISRU_ICE_USE = 1.2;        // ice units/day consumed while running
  const ISRU_WATER_YIELD = 18;     // litres of water per ice unit cracked
  const LAUNCH_CAPACITY = 400;     // payload units per launch
  const LAUNCH_COOLDOWN = 72;      // hours between launches, real-cadence flavour
  const PRICE_HE3 = 900;           // credits/unit — the highest-value export by far
  const PRICE_REGOLITH = 40;       // credits/unit — bulk, low-value export
  const PRICE_FOOD_EXPORT = 0.03;  // credits/kcal, surplus only
  const FOOD_RESERVE_DAYS = 20;    // never export food below this many days of reserve

  const cropById = id => CROPS.find(c => c.id === id);
  const buildById = id => BUILDINGS.find(b => b.id === id);
  const zoneDataById = id => ZONES.find(z => z.id === id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const idx = GRID.idx;

  /* ---------- terrain ---------- */

  function rnd(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

  function makeMap(seed) {
    const tiles = [];
    for (let y = 0; y < K.ROWS; y++) {
      for (let x = 0; x < K.COLS; x++) {
        tiles.push({ x, y, t: 'flat', b: null, zone: null, f: null, deposit: null,
                     v: rnd(seed + x * 7.1 + y * 13.7) });
      }
    }
    /* terrain/deposit feature counts scale with the full map's tile count
       (4x Phase-1's 40x28), so density per revealed tile stays the same as
       the colony expands into unexplored ground rather than the founding
       area alone soaking up the original counts */
    const AREA_SCALE = (K.COLS * K.ROWS) / (40 * 28);
    for (let i = 0; i < Math.round(10 * AREA_SCALE); i++) {   // crater bowls
      const cx = Math.floor(rnd(seed + i * 3.3) * K.COLS);
      const cy = Math.floor(rnd(seed + i * 5.9) * K.ROWS);
      const r = 1 + Math.floor(rnd(seed + i * 8.2) * 2.1);
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= K.COLS || y >= K.ROWS) continue;
          const d = Math.hypot(x - cx, y - cy);
          if (d <= r + 0.3) tiles[idx(x, y)].t = d > r - 0.5 ? 'rough' : 'crater';
        }
    }
    for (let i = 0; i < Math.round(60 * AREA_SCALE); i++) {   // boulder fields
      const x = Math.floor(rnd(seed + i * 17.3) * K.COLS);
      const y = Math.floor(rnd(seed + i * 11.9) * K.ROWS);
      if (tiles[idx(x, y)].t === 'flat') tiles[idx(x, y)].t = 'boulder';
    }
    /* the permanently shadowed floor of a polar crater, tucked in one corner */
    const sx = K.COLS - 6, sy = 3;
    for (let y = sy; y <= sy + 2; y++)
      for (let x = sx; x <= sx + 2; x++) tiles[idx(x, y)].t = 'skylight';

    const cx0 = Math.floor(K.COLS / 2), cy0 = Math.floor(K.ROWS / 2);
    for (let y = cy0 - 5; y <= cy0 + 5; y++)          // keep the founding plot clear
      for (let x = cx0 - 6; x <= cx0 + 6; x++) {
        const t = tiles[idx(x, y)];
        if (t && t.t !== 'skylight') t.t = 'flat';
      }

    /* ---- deposits: surveyed in now, mined in a later pass ----
       Ice sits with the one skylight cluster, tucked in a map corner well
       outside the founding survey — reaching it is what the "expand the
       survey" mechanic is actually for, the same way the real Artemis
       target is a permanently shadowed crater some distance from any
       reasonable landing/founding site. Regolith and helium-3 are common
       enough that the founding window gets a fair share of both without
       needing to expand first. */
    for (let i = 0; i < Math.round(90 * AREA_SCALE); i++) {   // regolith: common, variable richness
      const x = Math.floor(rnd(seed + 200 + i * 9.7) * K.COLS);
      const y = Math.floor(rnd(seed + 200 + i * 6.1) * K.ROWS);
      const t = tiles[idx(x, y)];
      if (t.t === 'flat' || t.t === 'rough') {
        t.deposit = { kind: 'regolith', richness: 0.3 + rnd(seed + i * 3.4) * 0.5 };
      }
    }
    for (let y = 0; y < K.ROWS; y++)                  // ice: concentrated near permanent shadow
      for (let x = 0; x < K.COLS; x++) {
        const t = tiles[idx(x, y)];
        const d = Math.hypot(x - (sx + 1), y - (sy + 1));
        if (d <= 5 && (t.t === 'flat' || t.t === 'rough' || t.t === 'crater')) {
          if (rnd(seed + x * 4.4 + y * 2.2) < 0.5 - d * 0.05) {
            t.deposit = { kind: 'ice', richness: clamp(0.9 - d * 0.1, 0.3, 0.9) };
          }
        }
      }
    for (let i = 0; i < Math.round(16 * AREA_SCALE); i++) {   // helium-3: rare, patchy, sun-exposed ground
      const x = Math.floor(rnd(seed + 400 + i * 13.1) * K.COLS);
      const y = Math.floor(rnd(seed + 400 + i * 7.7) * K.ROWS);
      const t = tiles[idx(x, y)];
      if (t.t === 'flat') t.deposit = { kind: 'he3', richness: 0.15 + rnd(seed + i * 5.5) * 0.25 };
    }
    return tiles;
  }

  /* bump whenever a save's shape changes in a way old saves won't have —
     e.g. the growable-map charter (s.revealed), the Upgrades roster's
     s.upgrades, and now the single s.auto flag splitting into
     s.autoCity/s.autoExpand, none of which older saves have and would
     otherwise crash the renderer/UI on load */
  const STATE_VERSION = 4;

  function newGame() {
    const s = {
      version: STATE_VERSION, hour: 6, day: 1,
      credits: 20000,
      sandbox: false, disastersOn: false, autoCity: false, autoExpand: false, upgrades: [],
      map: makeMap(83), fields: [], nextField: 1,
      pop: 3, housingCap: 0, jobs: 0,
      resources: { o2: 240, co2: 180, water: 900, nutrients: 400, food: 850000,
                   regolith: 0, ice: 0, he3: 0 },
      science: 0, spares: 6, pressure: 100, stored: 120, photoperiod: 16,
      flags: { dust: 0, leak: 0, busfault: 0, shutter: 0 },
      demand: { hab: 0, trade: 0, industry: 0 },
      stats: { harvests: 0, kinds: {}, brownouts: 0, totalExports: 0, launches: 0 },
      history: [], log: [], done: {}, over: null, pendingEvent: null
    };
    const cx = Math.floor(K.COLS / 2), cy = Math.floor(K.ROWS / 2);
    s.revealed = {
      x0: Math.max(0, cx - K.REVEAL_HALF_W), x1: Math.min(K.COLS - 1, cx + K.REVEAL_HALF_W),
      y0: Math.max(0, cy - K.REVEAL_HALF_H), y1: Math.min(K.ROWS - 1, cy + K.REVEAL_HALF_H)
    };
    const put = (x, y, type) => { s.map[idx(x, y)].b = { type }; };
    put(cx, cy, 'command');
    [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1], [cx - 2, cy], [cx + 2, cy]]
      .forEach(([x, y]) => put(x, y, 'track'));
    [[cx - 2, cy - 2], [cx + 2, cy - 2]].forEach(([x, y]) => put(x, y, 'solar'));
    put(cx, cy - 2, 'battery');
    /* the founding crew inherited a small hall, part-grown, same handover
       story as Lunar Farm's opening plot */
    addField(s, cx - 4, cy + 2, 3, 3, true);
    Object.assign(s.fields[0], { crop: 'potato', growth: 0.5, plantedDay: 1, soil: 0.75 });
    return s;
  }

  /* ---------- fields (Agriculture zone — ported from Lunar Farm) ---------- */

  const fieldById = (s, id) => s.fields.find(f => f.id === id);
  const fieldAt = (s, t) => (t && t.f) ? fieldById(s, t.f) : null;
  const planted = s => s.fields.filter(f => f.crop && !f.dead);
  const area = f => f.w * f.h;
  const totalTiles = s => s.fields.reduce((a, f) => a + area(f), 0);

  function fieldTiles(s, f) {
    const out = [];
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++) out.push(s.map[idx(x, y)]);
    return out;
  }

  function checkField(s, x, y, w, h) {
    if (w < 1 || h < 1) return 'Drag out at least one tile.';
    if (w > MAX_FIELD || h > MAX_FIELD) return `A hall can be at most ${MAX_FIELD} tiles a side.`;
    if (x < 0 || y < 0 || x + w > K.COLS || y + h > K.ROWS) return 'That runs off the survey area.';
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (!GRID.inRevealed(s, xx, yy)) return 'That ground has not been surveyed yet.';
        const t = s.map[idx(xx, yy)];
        if (t.b || t.f || t.zone) return 'Something is already built inside that outline.';
        if (t.t === 'crater') return 'A crater bowl is inside that outline.';
        if (t.t === 'skylight') return 'The tube skylight is inside that outline.';
        if (t.t === 'boulder') return 'Boulders are inside that outline — clear them first.';
      }
    }
    return null;
  }

  function fieldCost(w, h) { return buildById('greenhouse').cost * w * h; }

  function addField(s, x, y, w, h, free) {
    const err = checkField(s, x, y, w, h);
    if (err) return err;
    const cost = s.sandbox ? 0 : fieldCost(w, h);
    if (!free && s.credits < cost) return `That hall costs ${cost.toLocaleString()} credits.`;
    if (!free) s.credits -= cost;
    const f = {
      id: s.nextField++, x, y, w, h,
      crop: null, growth: 0, health: 1, moisture: 0.9, feed: 0.9,
      infected: false, dead: false, carbon: 0, litNow: false,
      plantedDay: 0, warned: false, serviced: true, soil: 0.15
    };
    s.fields.push(f);
    for (const t of fieldTiles(s, f)) t.f = f.id;
    return null;
  }

  function removeField(s, f) {
    for (const t of fieldTiles(s, f)) t.f = null;
    s.fields = s.fields.filter(x => x.id !== f.id);
  }

  /* ---------- zones (Habitation / Trade / Industry) ---------- */

  function zoneCost(kind, w, h) { return buildById('zone_' + kind).cost * w * h; }

  function paintZone(s, x, y, w, h, kind) {
    if (w > MAX_ZONE || h > MAX_ZONE) return `Zone at most ${MAX_ZONE} tiles a side at once.`;
    const err = ZONESYS.checkZone(s, x, y, w, h);
    if (err) return err;
    const cost = s.sandbox ? 0 : zoneCost(kind, w, h);
    if (s.credits < cost) return `Zoning that outline costs ${cost.toLocaleString()} credits.`;
    s.credits -= cost;
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        s.map[idx(xx, yy)].zone = { kind, stage: 0, growth: 0, unserviced: 0, decay: 0 };
      }
    return null;
  }

  function unzone(s, t) {
    if (!t.zone) return 'No zoning here.';
    if (s.credits < 60) return 'Rezoning costs 60 credits.';
    s.credits -= 60;
    t.zone = null;
    return null;
  }

  /* ---------- survey expansion ---------- */

  /* Fraction of buildable (flat/rough) ground inside the revealed rectangle
     that's actually developed — the same "what can this ground hold" test
     checkField/checkZone already apply per tile, just tallied across the
     charter instead of one outline. */
  function fillRatio(s) {
    const r = s.revealed;
    let buildable = 0, filled = 0;
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const t = s.map[idx(x, y)];
        if (t.t !== 'flat' && t.t !== 'rough') continue;
        buildable++;
        if (t.b || t.zone || t.f) filled++;
      }
    }
    return buildable ? filled / buildable : 0;
  }

  function atFullExtent(s) {
    const r = s.revealed;
    return r.x0 <= 0 && r.y0 <= 0 && r.x1 >= K.COLS - 1 && r.y1 >= K.ROWS - 1;
  }

  function nextRevealed(s) {
    const r = s.revealed;
    return {
      x0: Math.max(0, r.x0 - K.REVEAL_STEP), x1: Math.min(K.COLS - 1, r.x1 + K.REVEAL_STEP),
      y0: Math.max(0, r.y0 - K.REVEAL_STEP), y1: Math.min(K.ROWS - 1, r.y1 + K.REVEAL_STEP)
    };
  }

  function expandCost(s) {
    if (atFullExtent(s)) return 0;
    const r = s.revealed, n = nextRevealed(s);
    const oldArea = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    const newArea = (n.x1 - n.x0 + 1) * (n.y1 - n.y0 + 1);
    return K.EXPAND_BASE_COST + (newArea - oldArea) * K.EXPAND_COST_PER_TILE;
  }

  const canExpand = s => !atFullExtent(s) && fillRatio(s) >= K.EXPAND_FILL_THRESHOLD;

  function expandSurvey(s) {
    if (atFullExtent(s)) return 'The full survey charter is already revealed.';
    const cost = expandCost(s);
    if (!s.sandbox && s.credits < cost) return `Expanding the survey costs ${cost.toLocaleString()} credits.`;
    if (!s.sandbox) s.credits -= cost;
    s.revealed = nextRevealed(s);
    return null;
  }

  /* ---------- upgrades (colony-wide, not placed on a tile) ---------- */

  const upgradeById = id => UPGRADES.find(u => u.id === id);
  const hasUpgrade = (s, id) => s.upgrades.includes(id);

  function buyUpgrade(s, id) {
    const U = upgradeById(id);
    if (!U) return 'Unknown upgrade.';
    if (hasUpgrade(s, id)) return 'Already fitted.';
    const cost = s.sandbox ? 0 : U.cost;
    if (s.credits < cost) return `${U.name} costs ${cost.toLocaleString()} credits.`;
    s.credits -= cost;
    s.upgrades.push(id);
    return null;
  }

  /* ---------- queries ---------- */

  const tileAt = GRID.tileAt;
  const built = (s, type) => s.map.filter(t => t.b && t.b.type === type);
  const count = (s, type) => built(s, type).length;

  function fieldServiced(s, f, touching) {
    return fieldTiles(s, f).some(t => touching.has(idx(t.x, t.y)));
  }

  function sunElevation(s) {
    const phase = ((s.day + s.hour / 24) % K.LUNAR_CYCLE) / K.LUNAR_CYCLE;
    if (phase >= 0.5) return 0;
    return Math.sin(phase * 2 * Math.PI);
  }
  const isSunlit = s => sunElevation(s) > 0.02;
  const ledKW = s => hasUpgrade(s, 'led_retrofit') ? K.LED_KW * 0.85 : K.LED_KW;
  const dustFactor = s => hasUpgrade(s, 'dust_shield') ? 1 : clamp(1 - (s.flags.dust || 0) * 0.12, 0.4, 1);
  const recovery = s => hasUpgrade(s, 'condensate_recovery') ? Math.min(0.95, BASE_RECOVERY + 0.08) : BASE_RECOVERY;

  function lightsOn(s) {
    if (s.flags.shutter > 0) return false;
    return ((s.hour - 6 + 24) % 24) < s.photoperiod;
  }

  function generation(s) {
    const solar = isSunlit(s) ? count(s, 'solar') * ARRAY_KW * sunElevation(s) * dustFactor(s) : 0;
    const cmd = count(s, 'command') * COMMAND_KW + count(s, 'reactor') * REACTOR_KW;
    return { solar, cmd, total: solar + cmd };
  }

  function gridBase(s) {
    return K.BASE_GRID_KW + s.pop * K.POP_KW + s.jobs * K.JOB_KW
      + count(s, 'miner') * K.MINER_KW + (count(s, 'isru') ? K.ISRU_KW : 0);
  }

  function gridDemand(s) {
    const base = gridBase(s);
    const lit = lightsOn(s) ? planted(s).reduce((a, f) => a + area(f), 0) * ledKW(s) : 0;
    return { base, lit, total: base + lit };
  }

  function storageCap(s) {
    const cap = BASE_KWH + count(s, 'battery') * BATTERY_KWH;
    return s.flags.busfault ? cap * 0.5 : cap;
  }

  const co2Cap = s => 260;
  const dailyFoodNeed = s => s.pop * K.POP_KCAL;

  /* Trailing run of consecutive self-sufficient days, read straight off
     history rather than kept as a separate counter — nothing to fall out
     of sync, and it self-corrects the instant a day breaks the streak. */
  function selfSuffStreak(s) {
    let n = 0;
    for (let i = s.history.length - 1; i >= 0; i--) {
      if (!s.history[i].selfSufficient) break;
      n++;
    }
    return n;
  }

  /* ---------- the hourly tick ---------- */

  function tick(s) {
    if (s.over) return;
    const log = [];

    const gen = generation(s);
    const crops = planted(s);
    const base = gridBase(s);
    const per = ledKW(s);
    const on = lightsOn(s);

    let baseSurplus = gen.total - base;
    let brownout = false, usedKW = 0, litFields = 0;
    for (const f of s.fields) f.litNow = false;

    if (baseSurplus < 0 && s.stored + baseSurplus < 0) {
      brownout = true;
      s.resources.o2 -= s.pop * K.POP_O2 / 24 * 0.5;
      s.stored = 0;
    } else if (on) {
      const pool = baseSurplus + s.stored;
      for (const f of crops) {
        const need = area(f) * per;
        if (usedKW + need <= pool) { f.litNow = true; usedKW += need; litFields++; }
      }
      s.stored = clamp(s.stored + baseSurplus - usedKW, 0, storageCap(s));
      brownout = litFields < crops.length;
    } else {
      s.stored = clamp(s.stored + baseSurplus, 0, storageCap(s));
    }
    if (brownout) s.stats.brownouts++;
    s.brownoutNow = brownout;

    /* --- crops (Agriculture zone, identical rules to Lunar Farm) --- */
    const touching = GRID.serviceSet(s);
    let o2Made = 0, co2Used = 0, waterUsed = 0, nutrUsed = 0;
    const carbonLimit = clamp(s.resources.co2 / 14, 0.15, 1);

    for (const f of crops) {
      const c = cropById(f.crop);
      const A = area(f);
      const rate = 1 / (c.days * s.photoperiod);
      f.serviced = fieldServiced(s, f, touching);
      /* Automatic Irrigation Loop: a serviced hall tops itself up rather
         than draining down to wait on the player — it still draws from the
         shared colony water/nutrient stock exactly as before (waterUsed/
         nutrUsed below are untouched), this just skips the local reservoir
         decay that would otherwise need a manual Water/Feed visit. */
      const autoTended = f.serviced && hasUpgrade(s, 'auto_irrigation');

      if (f.litNow) {
        let g = 1;
        g *= clamp(f.moisture * 3, 0, 1);
        g *= clamp(f.feed * 3, 0, 1);
        g *= f.health;
        g *= carbonLimit;
        if (!f.serviced) g *= 0.72;
        g *= RAW_SOIL + (1 - RAW_SOIL) * f.soil;
        if (f.infected) g *= 0.5;
        if (s.pressure < 90) g *= 0.6;

        f.growth = clamp(f.growth + rate * g, 0, 1);
        const o2 = O2_PER_LIT_HOUR * c.o2 * g * A;
        o2Made += o2; co2Used += o2 * CO2_PER_O2; f.carbon += o2 * CO2_PER_O2;
        f.soil = clamp(f.soil + SOIL_PER_LIT_HOUR, 0, 1);
        if (!autoTended) {
          f.moisture -= (c.water / 24) * 0.020;
          f.feed -= (c.nutrients / 24) * 0.022;
        }
        waterUsed += (c.water / 24) * WATER_PER_TILE * A;
        nutrUsed += (c.nutrients / 24) * 0.25 * A;
      } else {
        if (!autoTended) {
          f.moisture -= 0.0035;
          f.feed -= 0.0015;
        }
        waterUsed += (c.water / 24) * WATER_PER_TILE * A * 0.15;
      }
      f.moisture = clamp(f.moisture, 0, 1);
      f.feed = clamp(f.feed, 0, 1);

      let dh = 0;
      if (f.moisture < 0.12) dh -= 0.0025;
      if (f.feed < 0.08) dh -= 0.0018;
      if (f.infected) dh -= 0.004;
      if (s.pressure < 85) dh -= 0.002;
      if (dh === 0 && f.moisture > 0.3 && f.feed > 0.25) dh = 0.005;
      f.health = clamp(f.health + dh, 0, 1);
      if (f.health <= 0) { f.dead = true; f.growth = 0; }
      if (f.growth >= 1) harvest(s, f, log);
    }

    /* --- mining and ISRU: idle during a brownout, like everything else --- */
    if (!brownout) {
      const mineRate = MINE_RATE_PER_DAY * (hasUpgrade(s, 'mining_efficiency') ? 1.25 : 1);
      for (const t of s.map) {
        if (t.b && t.b.type === 'miner' && t.deposit) {
          s.resources[t.deposit.kind] += (mineRate * t.deposit.richness) / 24;
        }
      }
      if (count(s, 'isru') && s.resources.ice > 0) {
        const use = Math.min(s.resources.ice, ISRU_ICE_USE / 24);
        s.resources.ice -= use;
        s.resources.water += use * ISRU_WATER_YIELD;
      }
    }
    for (const t of s.map) {
      if (t.b && t.b.type === 'spaceport' && t.b.cooldown > 0) t.b.cooldown--;
    }

    /* --- gases and consumables --- */
    s.resources.o2 += o2Made - s.pop * K.POP_O2 / 24;
    s.resources.co2 += (s.pop * K.POP_CO2 + COLONY_CO2) / 24 - co2Used;
    s.resources.o2 = clamp(s.resources.o2, 0, 500);
    s.resources.co2 = clamp(s.resources.co2, 0, co2Cap(s));

    waterUsed += s.pop * K.POP_WATER / 24;
    s.resources.water = Math.max(0, s.resources.water - waterUsed * (1 - recovery(s)));
    s.resources.nutrients = Math.max(0, s.resources.nutrients - nutrUsed);
    if (s.resources.nutrients <= 0) for (const f of crops) f.feed = Math.min(f.feed, 0.05);
    s.resources.food -= dailyFoodNeed(s) / 24;

    if (s.flags.leak) s.pressure -= 0.12;
    else if (s.pressure < 100) s.pressure = Math.min(100, s.pressure + 0.05);
    if (s.flags.shutter > 0) s.flags.shutter--;

    s.hour++;
    if (s.hour >= 24) { s.hour = 0; s.day++; endOfDay(s, log); }

    for (const m of log) pushLog(s, m);
    checkFail(s);
    return { brownout };
  }

  function endOfDay(s, log) {
    /* Automanage is a separate, optional module (autopilot.js) that loads
       after this file — late-bound so sim.js never depends on it existing.
       City operations and survey/export expansion are independent
       toggles, each gating its own half. */
    if (s.autoCity && window.LC_AUTO) window.LC_AUTO.autoManageCity(s, log);
    if (s.autoExpand && window.LC_AUTO) window.LC_AUTO.autoManageExpansion(s, log);

    const touching = GRID.serviceSet(s);
    const { tally, demand } = ZONESYS.growthTick(s, touching);
    s.housingCap = tally.housingCap + COMMAND_POP_CAP; s.jobs = tally.jobs;
    s.tradeJobs = tally.tradeJobs; s.industryJobs = tally.industryJobs;
    s.demand = demand;

    s.credits += tally.income - tally.upkeep;

    /* Migration reacts to the resource stocks themselves, not to any single
       hour's power shed — a lunar night without a reactor yet is expected to
       brown out the grid most nights, and that must slow crop growth (and
       so, eventually, food and oxygen) rather than evict the colony on the
       spot the moment one bad hour lands on a day boundary. */
    const crisis = s.resources.food <= 0 || s.resources.o2 < 25
      || s.resources.water <= 0 || s.pressure < 60;
    if (!crisis) {
      const gap = Math.max(0, s.housingCap - s.pop);
      const move = clamp(Math.round(gap * MIGRATION_RATE), 0, MIGRATION_CAP);
      s.pop = Math.min(s.housingCap, s.pop + move);
      if (move > 0) log.push(`${move} colonist${move === 1 ? '' : 's'} moved in. Population is now ${s.pop}.`);
    } else {
      const before = s.pop;
      s.pop = Math.max(0, s.pop - EMIGRATION_RATE);
      if (s.pop < before) log.push(`Life support is short. Population fell to ${s.pop}.`);
    }
    if (s.pop > s.housingCap) s.pop = s.housingCap;

    /* Disasters are entirely optional — turning the toggle off stops the
       roll outright, same shape as Free Mode bypassing cost. */
    if (s.disastersOn && s.day > 5 && !s.pendingEvent && Math.random() < 0.15) {
      const pool = EVENTS.filter(e => s.day >= e.minDay);
      if (pool.length) {
        let r = Math.random() * pool.reduce((a, e) => a + e.weight, 0);
        for (const e of pool) { r -= e.weight; if (r <= 0) { s.pendingEvent = e.id; break; } }
      }
    }

    /* A colony is "self-sufficient" for a day when its grid held through the
       day without browning out, it has more than five days of food ahead
       of it, and today's zone income covered today's zone upkeep — three
       things the sim already computes, just never combined into one signal
       before. Power specifically reads s.brownoutNow rather than comparing
       raw generation to demand: solar alone reads zero every lunar night by
       design, and a battery bank carrying the colony through the dark is
       genuine self-sufficiency, not a gap — brownoutNow already accounts
       for stored charge the same way the HUD's own power chip does. This is
       the same definition the Colony tab's streak and Automanage's
       established-colony goal both read, so player, dashboard and director
       are all looking at the same number. */
    const selfSufficient = !s.brownoutNow
      && s.resources.food > dailyFoodNeed(s) * 5
      && (tally.income - tally.upkeep) >= 0;

    s.history.push({
      d: s.day, pop: s.pop, jobs: s.jobs, housingCap: s.housingCap,
      credits: Math.round(s.credits),
      food: Math.round(s.resources.food / Math.max(1, dailyFoodNeed(s)) * 10) / 10,
      o2: Math.round(s.resources.o2), water: Math.round(s.resources.water),
      power: Math.round(s.stored), demandHab: Math.round(demand.hab * 100) / 100,
      demandTrade: Math.round(demand.trade * 100) / 100, demandInd: Math.round(demand.industry * 100) / 100,
      sun: isSunlit(s) ? 1 : 0, selfSufficient
    });
    if (s.history.length > 400) s.history.shift();

    /* Checked after today's history entry is pushed — the new
       selfsufficient10 milestone reads s.history's trailing window, and a
       milestone should see today's own day the moment it lands, not one
       day late. */
    for (const m of MILESTONES) {
      if (!s.done[m.id] && m.done(s)) { s.done[m.id] = s.day; log.push(`Milestone: ${m.text}.`); }
    }
  }

  /* ---------- player actions ---------- */

  function canPlace(s, t, type, ignoreCost) {
    const B = buildById(type);
    if (!B) return 'Unknown structure.';
    if (!t) return 'That is off the survey area.';
    if (!GRID.inRevealed(s, t.x, t.y)) return 'That ground has not been surveyed yet.';
    if (B.hidden) return 'That is placed automatically at colony founding.';
    if (t.f) return 'A grow hall covers that ground.';
    if (t.zone) return 'That ground is zoned — clear the zoning first.';
    /* a mining rig is anchored equipment built for broken ground — and the
       crater floors are exactly where the ice actually is */
    if (t.t === 'crater' && !B.deposit) return 'The ground drops away here — nothing will sit level.';
    if (t.t === 'skylight') return 'That is permanently shadowed crater floor. It stays clear for survey.';
    if (t.t === 'boulder') return 'Clear the boulders first.';
    if (t.b) return t.b.type === type ? 'Already laid here.' : 'Something is already built here.';
    if (B.deposit && !t.deposit) return 'Survey shows nothing to mine here.';
    if (B.once && count(s, type) >= 1) return `The colony only needs one ${B.name.toLowerCase()}.`;
    if (!ignoreCost && !s.sandbox && s.credits < B.cost) return 'Not enough credits.';
    return null;
  }

  function place(s, t, type) {
    const err = canPlace(s, t, type);
    if (err) return err;
    const B = buildById(type);
    if (!s.sandbox) s.credits -= B.cost;
    t.b = B.instance ? { type, cooldown: 0 } : { type };
    return null;
  }

  function bulldoze(s, t) {
    const f = fieldAt(s, t);
    if (f) {
      if (f.crop) return 'Clear the crop out of the hall first.';
      if (s.credits < 60) return 'Demolition costs 60 credits.';
      s.credits -= 60; removeField(s, f);
      return null;
    }
    if (t.zone) return unzone(s, t);
    if (t.t === 'boulder') {
      if (s.credits < 120) return 'Clearing boulders costs 120 credits.';
      s.credits -= 120; t.t = 'flat';
      return null;
    }
    if (!t.b) return 'Nothing here to clear.';
    if (t.b.type === 'command') return 'Mission control cannot be demolished.';
    if (s.credits < 60) return 'Demolition costs 60 credits.';
    s.credits -= 60;
    t.b = null;
    return null;
  }

  function seedCost(c, f) { return Math.round(c.seed * area(f) * 0.4); }

  function plant(s, f, cropId) {
    const c = cropById(cropId);
    if (!f) return 'Crops only grow in a grow hall.';
    if (f.crop || f.dead) return 'That hall is not clear.';
    const cost = seedCost(c, f);
    if (s.credits < cost) return `Seed for that hall costs ${cost.toLocaleString()} credits.`;
    s.credits -= cost;
    Object.assign(f, { crop: cropId, growth: 0, health: 1, infected: false, dead: false,
                       moisture: 0.9, feed: 0.9, carbon: 0, warned: false, plantedDay: s.day });
    return null;
  }

  function harvest(s, f, log) {
    if (!f || !f.crop || f.growth < 1) return 'Not ready yet.';
    const c = cropById(f.crop);
    const A = area(f), q = f.health;
    const kcal = Math.round(c.kcal * KCAL_SCALE * A * q);
    const pay = Math.round(c.value * VALUE_SCALE * A * q);
    s.resources.food += kcal; s.credits += pay; s.science += c.science;
    s.resources.co2 = clamp(s.resources.co2 + f.carbon * 0.42, 0, co2Cap(s));
    s.stats.harvests++;
    s.stats.kinds[c.id] = (s.stats.kinds[c.id] || 0) + 1;
    const msg = `Harvested ${c.name}: ${kcal.toLocaleString()} kcal, ${pay.toLocaleString()} cr.`;
    if (log) log.push(msg); else pushLog(s, msg);
    const keptSoil = clamp(f.soil + 0.12, 0, 1);
    clearCrop(f);
    f.soil = keptSoil;
    return null;
  }

  function clearCrop(f) {
    Object.assign(f, { crop: null, growth: 0, health: 1, moisture: 0.9, feed: 0.9,
                       infected: false, dead: false, carbon: 0, litNow: false, warned: false });
  }

  function water(s, f) {
    if (!f || !f.crop || f.dead) return 'Nothing planted there.';
    const need = (1 - f.moisture) * 4 * area(f);
    if (s.resources.water < need) return 'Not enough water in the loop.';
    s.resources.water -= need * (1 - recovery(s));
    f.moisture = 1;
    return null;
  }

  function feed(s, f) {
    if (!f || !f.crop || f.dead) return 'Nothing planted there.';
    const need = (1 - f.feed) * 2 * area(f);
    if (s.resources.nutrients < need) return 'Nutrient stock is empty.';
    s.resources.nutrients -= need; f.feed = 1;
    return null;
  }

  function treat(s, f) {
    if (!f || !f.infected) return 'That hall is clean.';
    const cost = 120 * area(f);
    if (s.credits < cost) return `Sterilising that hall costs ${cost.toLocaleString()} credits.`;
    s.credits -= cost; f.infected = false;
    return null;
  }

  function clearField(s, f) {
    if (!f || (!f.crop && !f.dead)) return 'Nothing to clear.';
    clearCrop(f);
    return null;
  }

  /* ---------- export economy ---------- */

  const spaceportTile = s => s.map.find(t => t.b && t.b.type === 'spaceport');

  /* Loads whatever the yard has, highest value first — helium-3, then bulk
     regolith, then any food genuinely surplus to the reserve — and converts
     it to credits on a cooldown. Shaped like Lunar Farm's sellFood/trade:
     check preconditions, mutate stockpiles, return null or an error string. */
  function launchRocket(s) {
    const t = spaceportTile(s);
    if (!t) return 'Build a launch pad first.';
    if (t.b.cooldown > 0) return `The pad is still cycling — ${t.b.cooldown}h to the next window.`;

    let remaining = LAUNCH_CAPACITY, payload = 0, credits = 0;
    const he3 = Math.min(s.resources.he3, remaining);
    payload += he3; credits += he3 * PRICE_HE3; remaining -= he3;

    const reg = Math.min(s.resources.regolith, remaining);
    payload += reg; credits += reg * PRICE_REGOLITH; remaining -= reg;

    const spareFood = Math.max(0, s.resources.food - dailyFoodNeed(s) * FOOD_RESERVE_DAYS);
    const foodShip = Math.min(spareFood, remaining);
    payload += foodShip; credits += foodShip * PRICE_FOOD_EXPORT;

    if (payload <= 0) return 'Nothing in the yard is ready to ship.';

    s.resources.he3 -= he3; s.resources.regolith -= reg; s.resources.food -= foodShip;
    s.credits += Math.round(credits);
    s.stats.totalExports += payload;
    s.stats.launches = (s.stats.launches || 0) + 1;
    t.b.cooldown = LAUNCH_COOLDOWN;
    pushLog(s, `Rocket away: ${Math.round(payload).toLocaleString()} kg to Earth, ${Math.round(credits).toLocaleString()} credits.`);
    return null;
  }

  /* ---------- disasters ---------- */

  function patchLeak(s) {
    if (!s.flags.leak) return 'The seal is holding.';
    if (s.spares < 2) return 'Patching it needs 2 spares.';
    s.spares -= 2; s.flags.leak = 0;
    pushLog(s, 'Seal patched. Pressure holding.');
    return null;
  }

  /* Random developed tiles, biased toward the ones with the most to lose —
     used by both the flare and moonquake effects. */
  function randomDeveloped(s, n) {
    const pool = s.map.filter(t => t.zone && t.zone.stage > 0);
    const picked = [];
    for (let i = 0; i < n && pool.length; i++) {
      const j = Math.floor(Math.random() * pool.length);
      picked.push(pool[j]); pool.splice(j, 1);
    }
    return picked;
  }

  function resolveEvent(s, eventId, effect) {
    const L = m => pushLog(s, m);
    switch (effect) {
      case 'spe_shelter': s.flags.shutter = 12; L('Colony sheltered through the flare. Twelve hours of lost grid load.'); break;
      case 'spe_ride': {
        const hit = randomDeveloped(s, hasUpgrade(s, 'regolith_shielding') ? 2 : 3);
        for (const t of hit) { t.zone.stage = Math.max(0, t.zone.stage - 1); t.zone.growth = 0.3; }
        L(`Rode out the flare. Radiation damage cost ${hit.length} tile${hit.length === 1 ? '' : 's'} a stage of development.`);
        break;
      }
      case 'micro_fix':
        if (s.spares < 2) L('No spares on hand — the strike goes unrepaired.');
        else { s.spares -= 2; L('Crew regraded the crater before the road failed.'); }
        break;
      case 'micro_ignore': {
        const roads = s.map.filter(t => t.b && t.b.type === 'track');
        if (roads.length) {
          const t = roads[Math.floor(Math.random() * roads.length)];
          t.b = null;
          L(`Road cratered at ${t.x + 1},${t.y + 1}. That stretch has stopped carrying service.`);
        }
        break;
      }
      case 'dust_clean': s.flags.dust = 0; L('Arrays cleaned. Full output restored.'); break;
      case 'dust_ignore': s.flags.dust = Math.min(5, (s.flags.dust || 0) + 2); L('Dust left on the arrays. Solar output stays degraded.'); break;
      case 'quake_brace':
        if (s.credits < 1200) { L('No budget to brace the district — damage stands.'); }
        else { s.credits -= 1200; L('District braced ahead of the aftershocks. No damage taken.'); }
        break;
      case 'quake_ignore': {
        const hit = randomDeveloped(s, hasUpgrade(s, 'regolith_shielding') ? 1 : 2);
        for (const t of hit) { t.zone.stage = Math.max(0, t.zone.stage - 1); t.zone.growth = 0.3; }
        L(`Foundations shifted. ${hit.length} tile${hit.length === 1 ? '' : 's'} lost a stage of development.`);
        break;
      }
      case 'breach_fix':
        if (s.spares < 2) { s.flags.leak = 1; L('No spares to patch with — the seal keeps bleeding.'); }
        else { s.spares -= 2; s.flags.leak = 0; L('Seal patched. Pressure holding.'); }
        break;
      case 'breach_ignore': s.flags.leak = 1; L('Logged and left. Pressure is falling.'); break;
      case 'bus_fix':
        if (s.spares < 3) { s.flags.busfault = 1; L('Not enough spares — running on half the battery string.'); }
        else { s.spares -= 3; s.flags.busfault = 0; L('Bus rebuilt. Full storage restored.'); }
        break;
      case 'bus_ignore': s.flags.busfault = 1; L('Half the battery string stays isolated.'); break;
      case 'res_buy':
        if (s.credits < 2400) L('The broker left without a deal — not enough credits.');
        else { s.credits -= 2400; s.spares += 10; s.resources.water += 300; L('Took delivery of spares and water.'); }
        break;
      case 'res_sell': {
        const spare = Math.max(0, s.resources.food - dailyFoodNeed(s) * 12);
        if (spare < 5000) L('Nothing spare to sell.');
        else { s.resources.food -= spare; s.credits += Math.round(spare * 0.02); L(`Sold ${Math.round(spare).toLocaleString()} kcal at the premium rate.`); }
        break;
      }
      case 'review_full': {
        const good = (s.pop >= 10 ? 1 : 0) + (s.credits >= 0 ? 1 : 0)
          + (s.map.some(t => t.zone && t.zone.stage >= 2) ? 1 : 0);
        if (good >= 2) { s.credits += 6000; s.science += 6; L('The review went well. Six thousand credits and a commendation.'); }
        else L('The review did not go well. The manifest slot is under review.');
        break;
      }
      case 'review_brief': s.credits += 1000; L('A short tour and a small honorarium.'); break;
      case 'transfer_take':
        if (s.pop >= s.housingCap) L('No berths free. The transfer was refused.');
        else { s.pop = Math.min(s.housingCap, s.pop + 2); L('Two colonists transferred in.'); }
        break;
      case 'transfer_decline': L('Transfer declined.'); break;
      case 'grant_take':
        if (s.science < 15) L('Not enough data to package.');
        else { s.science -= 15; s.credits += 4000; L('Grant paid out: 4,000 credits.'); }
        break;
      default: break;
    }
    s.pendingEvent = null;
  }

  function pushLog(s, msg) {
    s.log.unshift({ day: s.day, msg });
    if (s.log.length > 120) s.log.pop();
  }

  function checkFail(s) {
    if (s.resources.food <= 0) s.over = 'The stores ran out. The colony was evacuated on the next lander.';
    else if (s.resources.o2 <= 0) s.over = 'Oxygen reserves hit zero.';
    else if (s.resources.water <= 0) s.over = 'The water loop ran dry.';
    else if (s.pressure <= 60) s.over = 'Pressure fell below the abort limit.';
    else if (s.credits < -8000) s.over = 'The programme cut your funding.';
  }

  window.LC_SIM = {
    newGame, STATE_VERSION, tick, endOfDay,
    place, bulldoze, plant, harvest, water, feed, treat, clearField, canPlace,
    addField, removeField, checkField, fieldCost, fieldAt, fieldById, fieldTiles,
    paintZone, unzone, zoneCost,
    fillRatio, canExpand, expandCost, expandSurvey,
    hasUpgrade, buyUpgrade, upgradeById,
    planted, area, totalTiles, seedCost,
    cropById, buildById, zoneDataById, clamp, tileAt, built, count,
    generation, gridDemand, storageCap, isSunlit, sunElevation, lightsOn, dustFactor,
    dailyFoodNeed, selfSuffStreak, pushLog, resolveEvent, patchLeak, launchRocket, spaceportTile,
    KCAL_SCALE, VALUE_SCALE, ARRAY_KW, BATTERY_KWH, MAX_FIELD, MAX_ZONE, LAUNCH_CAPACITY, LAUNCH_COOLDOWN
  };
})();
