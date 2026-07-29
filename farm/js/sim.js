/* Lunar Farm — simulation.
   The farm is a tile map of lunar surface. Grow halls are dragged out as
   rectangles of any size and hold one crop each; everything else is a single
   tile structure. One tick is one hour of station time. */

(function () {
  const { K, CROPS, UPGRADES, BUILDINGS, EVENTS, MILESTONES } = window.LF_DATA;

  /* Rates below are PER TILE of grow hall. One tile is a multi-tier rack of
     roughly 20 m2 of growing area. */
  const KCAL_SCALE = 9;
  const VALUE_SCALE = 3;
  const RTG_KW = 2.6;              // legacy radioisotope unit, always on
  const REACTOR_KW = 9.0;
  const ARRAY_KW = 2.5;
  const BATTERY_KWH = 60;
  const BASE_KWH = 60;
  const O2_PER_LIT_HOUR = 0.010;   // kg per tile-hour at crop.o2 = 1
  const CO2_PER_O2 = 1.375;        // mass ratio in photosynthesis
  const WATER_PER_TILE = 0.25;     // scales crop.water down to a per-tile draw
  const BASE_RECOVERY = 0.80;
  /* The farm serves the wider station, and the station's waste stream comes back
     to it as carbon. Without this the loop can only run down, because most of the
     carbon a surplus farm fixes leaves inside the food it exports. */
  const STATION_CO2 = 3.0;         // kg per day
  const UNSERVICED_PENALTY = 0.72; // growth factor for a hall with no track to the hab
  const RAIL_BONUS = 1.10;         // a hall on the rail head ships out by wagon
  const RAW_SOIL = 0.62;           // growth factor in unconditioned regolith
  const SOIL_PER_LIT_HOUR = 0.00004;
  const MAX_FIELD = 8;             // longest side you may drag

  const co2Cap = s => (s.up.composter ? 400 : 260);
  const cropById = id => CROPS.find(c => c.id === id);
  const buildById = id => BUILDINGS.find(b => b.id === id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const idx = (x, y) => y * K.COLS + x;

  /* ---------- terrain ---------- */

  function rnd(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

  function makeMap(seed) {
    const tiles = [];
    for (let y = 0; y < K.ROWS; y++) {
      for (let x = 0; x < K.COLS; x++) {
        tiles.push({ x, y, t: 'flat', b: null, f: null, v: rnd(seed + x * 7.1 + y * 13.7) });
      }
    }
    for (let i = 0; i < 6; i++) {                    // crater bowls
      const cx = Math.floor(rnd(seed + i * 3.3) * K.COLS);
      const cy = Math.floor(rnd(seed + i * 5.9) * K.ROWS);
      const r = 1 + Math.floor(rnd(seed + i * 8.2) * 1.7);
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= K.COLS || y >= K.ROWS) continue;
          const d = Math.hypot(x - cx, y - cy);
          if (d <= r + 0.3) tiles[idx(x, y)].t = d > r - 0.5 ? 'rough' : 'crater';
        }
    }
    for (let i = 0; i < 34; i++) {                   // boulder fields
      const x = Math.floor(rnd(seed + i * 17.3) * K.COLS);
      const y = Math.floor(rnd(seed + i * 11.9) * K.ROWS);
      if (tiles[idx(x, y)].t === 'flat') tiles[idx(x, y)].t = 'boulder';
    }
    const sx = 3, sy = Math.floor(K.ROWS / 2);       // the lava tube skylight
    for (let y = sy - 1; y <= sy; y++)
      for (let x = sx; x <= sx + 1; x++) tiles[idx(x, y)].t = 'skylight';

    for (let y = 4; y <= 12; y++)                    // keep the starting plot clear
      for (let x = 8; x <= 19; x++)
        if (tiles[idx(x, y)].t !== 'skylight') tiles[idx(x, y)].t = 'flat';
    return tiles;
  }

  /* Bump when the stored shape changes. Anything older is brought forward by
     migrate() rather than thrown away. */
  const STATE_VERSION = 6;

  /* Bring a stored run up to the shape this code expects.

     Defaults are chosen to preserve what the player was actually seeing, not
     what a new hall would get. A run saved before bed conditioning existed
     behaved as fully worked ground, so that is what it becomes — starting it at
     raw dust would punish somebody for loading their own save. */
  function migrate(o) {
    if (!o || typeof o !== 'object') return { ok: false, why: 'unreadable' };
    if ((o.version || 0) > STATE_VERSION) return { ok: false, why: 'newer', from: o.version };
    /* the earliest builds laid the farm out differently — there is nothing here
       to carry forward, and pretending otherwise would load a broken run */
    if (!Array.isArray(o.map) || !Array.isArray(o.fields)) {
      return { ok: false, why: 'incompatible', from: o.version || 0 };
    }

    const from = o.version || 0;
    const def = (obj, k, v) => { if (obj[k] === undefined) obj[k] = v; };

    def(o, 'auto', false); def(o, 'sandbox', false); def(o, 'history', []);
    def(o, 'litFields', 0); def(o, 'wantFields', 0);
    def(o, 'litTiles', 0); def(o, 'wantTiles', 0);
    def(o, 'photoperiod', 16); def(o, 'isruOn', true);
    def(o, 'up', {}); def(o, 'flags', {}); def(o, 'stats', {});
    def(o, 'done', {}); def(o, 'log', []); def(o, 'over', null);
    def(o, 'nextField', o.fields.reduce((m, f) => Math.max(m, f.id || 0), 0) + 1);

    ['dust', 'leak', 'busfault', 'biofilm', 'thermal', 'shutter']
      .forEach(k => def(o.flags, k, 0));
    def(o.up, 'led', 0); def(o.up, 'recovery', 0);

    const st = o.stats;
    def(st, 'harvests', 0); def(st, 'kinds', {}); def(st, 'nightsSurvived', 0);
    def(st, 'closureStreak', 0); def(st, 'harvestedToday', 0);
    def(st, 'lastClosure', 0); def(st, 'brownouts', 0); def(st, 'seenNight', false);
    /* closure used to be a rolling window; it is now measured over the whole
       mission, so seed the totals from what the run has actually done */
    if (st.totalGrown === undefined) {
      st.totalGrown = 0;
      st.totalEaten = Math.max(0, (o.day || 1) - 1) * dailyNeed(o);
    }
    def(st, 'totalEaten', 0);
    delete st.recent;

    for (const f of o.fields) {
      def(f, 'soil', 1);            // it behaved as worked ground, so it stays worked
      def(f, 'serviced', true); def(f, 'railed', false);
      def(f, 'carbon', 0); def(f, 'warned', false); def(f, 'litNow', false);
      def(f, 'health', 1); def(f, 'moisture', 0.9); def(f, 'feed', 0.9);
      def(f, 'growth', 0); def(f, 'infected', false); def(f, 'dead', false);
      def(f, 'crop', null); def(f, 'plantedDay', o.day || 1);
    }
    for (const t of o.map) { def(t, 'b', null); def(t, 'f', null); def(t, 'v', 0.5); }

    o.version = STATE_VERSION;
    return { ok: true, from, carried: from !== STATE_VERSION };
  }

  function newGame() {
    const s = {
      version: STATE_VERSION,
      hour: 6, day: 1,
      credits: 12000, water: 900, o2: 240, co2: 200, nutrients: 400,
      food: 600000, science: 0, spares: 6, pressure: 100, stored: 120,
      crew: 3, morale: 72, photoperiod: 16, isruOn: true,
      auto: false, sandbox: false, history: [],
      map: makeMap(41), fields: [], nextField: 1,
      up: { led: 0, recovery: 0 },
      flags: { dust: 0, leak: 0, busfault: 0, biofilm: 0, thermal: 0, shutter: 0 },
      stats: { harvests: 0, kinds: {}, nightsSurvived: 0, closureStreak: 0,
               harvestedToday: 0, totalGrown: 0, totalEaten: 0, lastClosure: 0, brownouts: 0, seenNight: false },
      done: {}, log: [], over: null, litFields: 0, wantFields: 0, litTiles: 0, wantTiles: 0
    };
    const put = (x, y, type) => { s.map[idx(x, y)].b = { type }; };
    put(12, 8, 'hab');
    [[11, 8], [13, 8], [14, 8], [12, 7], [12, 9], [10, 8], [15, 8]].forEach(([x, y]) => put(x, y, 'track'));
    [[11, 10], [13, 10], [14, 10], [10, 10]].forEach(([x, y]) => put(x, y, 'solar'));
    [[15, 9], [15, 7]].forEach(([x, y]) => put(x, y, 'battery'));
    /* The inherited hall must clear the pre-laid track at 12,7. The outgoing
       crew left a crop part-grown in it: a staple takes longer to mature than
       the handover stores last, so the farm has to start mid-cycle. */
    addField(s, 9, 4, 4, 3, true);
    /* the beds you inherit have been worked for years */
    Object.assign(s.fields[0], { crop: 'potato', growth: 0.55, plantedDay: 1, soil: 0.8 });
    return s;
  }

  /* ---------- fields ---------- */

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

  /* Can a rectangle become a hall? Returns null if fine, else why not. */
  function checkField(s, x, y, w, h) {
    if (w < 1 || h < 1) return 'Drag out at least one tile.';
    if (w > MAX_FIELD || h > MAX_FIELD) return `A hall can be at most ${MAX_FIELD} tiles a side.`;
    if (x < 0 || y < 0 || x + w > K.COLS || y + h > K.ROWS) return 'That runs off the plot.';
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const t = s.map[idx(xx, yy)];
        if (t.b || t.f) return 'Something is already built inside that outline.';
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
      plantedDay: 0, warned: false, serviced: true,
      /* Regolith is not soil until you make it soil: fresh beds are sharp,
         sterile dust with no structure and no biology. Conditioning comes from
         working roots and stubble back in, harvest after harvest. */
      soil: 0.15
    };
    s.fields.push(f);
    for (const t of fieldTiles(s, f)) t.f = f.id;
    return null;
  }

  function removeField(s, f) {
    for (const t of fieldTiles(s, f)) t.f = null;
    s.fields = s.fields.filter(x => x.id !== f.id);
  }

  /* ---------- queries ---------- */

  const tileAt = (s, x, y) =>
    (x < 0 || y < 0 || x >= K.COLS || y >= K.ROWS) ? null : s.map[idx(x, y)];
  const built = (s, type) => s.map.filter(t => t.b && t.b.type === type);
  const count = (s, type) => built(s, type).length;

  /* A hall or module is serviced if it touches the track network reaching a hab. */
  function serviceSet(s) {
    const net = new Set(), queue = [];
    for (const t of s.map) if (t.b && t.b.type === 'hab') { net.add(idx(t.x, t.y)); queue.push(t); }
    while (queue.length) {
      const t = queue.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tileAt(s, t.x + dx, t.y + dy);
        if (!n || !n.b) continue;
        const k = idx(n.x, n.y);
        const carries = n.b.type === 'track' || n.b.type === 'rail' || n.b.type === 'hab';
        if (net.has(k) || !carries) continue;
        net.add(k); queue.push(n);
      }
    }
    const touching = new Set(net);
    for (const k of net) {
      const t = s.map[k];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tileAt(s, t.x + dx, t.y + dy);
        if (n && (n.b || n.f)) touching.add(idx(n.x, n.y));
      }
    }
    return touching;
  }

  function fieldServiced(s, f, touching) {
    return fieldTiles(s, f).some(t => touching.has(idx(t.x, t.y)));
  }

  /* A hall whose outline touches rail ships its crop out by the wagonload. */
  function fieldRailed(s, f) {
    for (let y = f.y - 1; y <= f.y + f.h; y++) {
      for (let x = f.x - 1; x <= f.x + f.w; x++) {
        const inside = x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h;
        if (inside) continue;
        const t = tileAt(s, x, y);
        if (t && t.b && t.b.type === 'rail') return true;
      }
    }
    return false;
  }

  function sunElevation(s) {
    const phase = ((s.day + s.hour / 24) % K.LUNAR_CYCLE) / K.LUNAR_CYCLE;
    if (phase >= 0.5) return 0;
    return Math.sin(phase * 2 * Math.PI);
  }
  const isSunlit = s => sunElevation(s) > 0.02;
  const dustFactor = s => s.up.eds ? 1 : clamp(1 - s.flags.dust * 0.12, 0.4, 1);
  const ledKW = s => K.LED_KW * Math.pow(0.85, s.up.led || 0);   // per tile

  function lightsOn(s) {
    if (s.flags.shutter > 0) return false;
    return ((s.hour - 6 + 24) % 24) < s.photoperiod;
  }

  function generation(s) {
    const solar = isSunlit(s) ? count(s, 'solar') * ARRAY_KW * sunElevation(s) * dustFactor(s) : 0;
    const rtg = RTG_KW + count(s, 'reactor') * REACTOR_KW;
    return { solar, rtg, total: solar + rtg };
  }

  function demand(s) {
    const ls = K.BASE_LIFE_SUPPORT + s.crew * K.LS_PER_CREW;
    const lit = lightsOn(s) ? planted(s).reduce((a, f) => a + area(f), 0) * ledKW(s) : 0;
    const isru = (count(s, 'isru') && s.isruOn) ? K.ISRU_KW : 0;
    return { ls, lit, isru, total: ls + lit + isru };
  }

  function storageCap(s) {
    const cap = BASE_KWH + count(s, 'battery') * BATTERY_KWH;
    return s.flags.busfault ? cap * 0.5 : cap;
  }

  function recoveryRate(s) {
    let r = BASE_RECOVERY + (s.up.recovery || 0) * 0.06;
    if (s.flags.biofilm) r -= 0.10;
    return clamp(r, 0.3, 0.97);
  }

  const crewCapacity = s => Math.max(1, count(s, 'hab') * 3);
  const dailyNeed = s => s.crew * K.CREW_KCAL;

  function nightReserve(s) {
    const net = demand(s).total - (RTG_KW + count(s, 'reactor') * REACTOR_KW);
    return net <= 0 ? Infinity : s.stored / net;
  }

  /* ---------- the tick ---------- */

  function tick(s) {
    if (s.over) return;
    const log = [];

    /* --- energy ---
       Load sheds in order of what the colony can least afford to lose: the ISRU
       plant first, then whole grow halls, life support last. A hall is lit or it
       is not — you cannot half-light a canopy. */
    const gen = generation(s);
    const crops = planted(s);
    const ls = K.BASE_LIFE_SUPPORT + s.crew * K.LS_PER_CREW;
    const per = ledKW(s);
    const on = lightsOn(s);

    let isruRan = !!(count(s, 'isru') && s.isruOn);
    let baseSurplus = gen.total - ls - (isruRan ? K.ISRU_KW : 0);
    if (baseSurplus < 0 && isruRan) { isruRan = false; baseSurplus = gen.total - ls; }

    let brownout = false, usedKW = 0, litFields = 0, litTiles = 0;
    for (const f of s.fields) f.litNow = false;

    if (baseSurplus < 0 && s.stored + baseSurplus < 0) {
      brownout = true;
      s.morale -= 0.6;
      s.o2 -= s.crew * K.CREW_O2 / 24 * 0.5;
      s.stored = 0;
    } else if (on) {
      const pool = baseSurplus + s.stored;
      for (const f of crops) {
        const need = area(f) * per;
        if (usedKW + need <= pool) { f.litNow = true; usedKW += need; litFields++; litTiles += area(f); }
      }
      s.stored = clamp(s.stored + baseSurplus - usedKW, 0, storageCap(s));
      brownout = litFields < crops.length;
    } else {
      s.stored = clamp(s.stored + baseSurplus, 0, storageCap(s));
    }
    if (brownout) s.stats.brownouts++;
    s.litFields = litFields; s.wantFields = on ? crops.length : 0;
    s.litTiles = litTiles;
    s.wantTiles = on ? crops.reduce((a, f) => a + area(f), 0) : 0;

    /* --- crops --- */
    const touching = serviceSet(s);
    let o2Made = 0, co2Used = 0, waterUsed = 0, nutrUsed = 0;
    const carbonLimit = clamp(s.co2 / 14, 0.15, 1);

    for (const f of crops) {
      const c = cropById(f.crop);
      const A = area(f);
      const rate = 1 / (c.days * s.photoperiod);
      f.serviced = fieldServiced(s, f, touching);
      f.railed = fieldRailed(s, f);

      if (f.litNow) {
        let g = 1;
        g *= clamp(f.moisture * 3, 0, 1);
        g *= clamp(f.feed * 3, 0, 1);
        g *= f.health;
        g *= carbonLimit;
        if (!f.serviced) g *= UNSERVICED_PENALTY;
        if (f.railed) g *= RAIL_BONUS;
        g *= RAW_SOIL + (1 - RAW_SOIL) * f.soil;
        if (s.flags.thermal > 0) g *= 0.7;
        if (f.infected) g *= 0.5;
        if (s.pressure < 90) g *= 0.6;

        f.growth = clamp(f.growth + rate * g, 0, 1);

        const o2 = O2_PER_LIT_HOUR * c.o2 * g * A;
        o2Made += o2; co2Used += o2 * CO2_PER_O2; f.carbon += o2 * CO2_PER_O2;

        f.soil = clamp(f.soil + SOIL_PER_LIT_HOUR, 0, 1);
        f.moisture -= (c.water / 24) * 0.020;
        f.feed -= (c.nutrients / 24) * 0.022;
        waterUsed += (c.water / 24) * WATER_PER_TILE * A;
        nutrUsed += (c.nutrients / 24) * 0.25 * A;
      } else {
        f.moisture -= 0.0035;
        f.feed -= 0.0015;
        waterUsed += (c.water / 24) * WATER_PER_TILE * A * 0.15;
      }

      f.moisture = clamp(f.moisture, 0, 1);
      f.feed = clamp(f.feed, 0, 1);

      let dh = 0;
      if (f.moisture < 0.12) dh -= 0.0025;
      if (f.feed < 0.08) dh -= 0.0018;
      if (f.infected) dh -= 0.004;
      if (s.flags.thermal > 0) dh -= 0.0015;
      if (s.pressure < 85) dh -= 0.002;
      if (dh === 0 && f.moisture > 0.3 && f.feed > 0.25) dh = 0.005;
      f.health = clamp(f.health + dh, 0, 1);

      if (f.moisture < 0.22 && !f.warned) {
        f.warned = true;
        log.push(`The ${c.name} in the hall at ${f.x + 1},${f.y + 1} is drying out.`);
      } else if (f.moisture > 0.5) f.warned = false;

      if (f.health <= 0) {
        f.dead = true; f.growth = 0;
        log.push(`Lost the ${c.name} in the hall at ${f.x + 1},${f.y + 1}.`);
      }

      if (s.up.irrigation && f.serviced) {
        if (f.moisture < 0.55) {
          const a = Math.min(0.06, 0.9 - f.moisture);
          f.moisture += a; waterUsed += a * 4 * A;
        }
        if (f.feed < 0.5 && s.nutrients > 0) {
          const a = Math.min(0.05, 0.9 - f.feed);
          f.feed += a; nutrUsed += a * 2 * A;
        }
      }
      if (s.up.uvc && f.infected) f.infected = false;
      if (s.up.harvester && f.growth >= 1) harvest(s, f, log);
    }

    /* --- gases --- */
    s.o2 += o2Made - s.crew * K.CREW_O2 / 24;
    s.co2 += (s.crew * K.CREW_CO2 + STATION_CO2) / 24 - co2Used;
    s.o2 = clamp(s.o2, 0, 400 + (s.up.composter ? 200 : 0));
    s.co2 = clamp(s.co2, 0, co2Cap(s));

    /* --- consumables --- */
    const rec = recoveryRate(s);
    waterUsed += s.crew * K.CREW_WATER / 24;
    s.water -= waterUsed * (1 - rec);
    if (isruRan) s.water += 14 / 24;
    s.nutrients = Math.max(0, s.nutrients - nutrUsed);
    if (s.nutrients <= 0) for (const f of crops) f.feed = Math.min(f.feed, 0.05);
    s.food -= dailyNeed(s) / 24;
    s.water = Math.max(0, s.water);

    if (s.flags.leak) s.pressure -= 0.12;
    else if (s.pressure < 100) s.pressure = Math.min(100, s.pressure + 0.05);

    for (const fl of ['shutter', 'thermal']) if (s.flags[fl] > 0) s.flags[fl]--;

    s.hour++;
    if (s.hour >= 24) { s.hour = 0; s.day++; endOfDay(s, log); }

    for (const m of log) pushLog(s, m);
    checkFail(s);
    return { brownout };
  }

  /* The farm crew running themselves: tend, harvest, replant, restock.
     Deliberately conservative — it keeps a farm alive, it does not expand it. */
  function autoManage(s, log) {
    for (const f of s.fields) {
      if (f.dead) { clearCrop(f); continue; }
      if (!f.crop) continue;
      if (f.moisture < 0.4) water(s, f);
      if (f.feed < 0.35) feed(s, f);
      if (f.infected && s.credits > 120 * area(f) * 3) treat(s, f);
      if (f.growth >= 1) harvest(s, f, log);
    }
    /* replant anything standing empty, favouring calories but keeping variety */
    const empties = s.fields.filter(f => !f.crop && !f.dead);
    empties.forEach((f, i) => {
      const pick = i % 5 === 4 ? 'arabidopsis' : (i % 3 === 1 ? 'wheat' : 'potato');
      plant(s, f, pick);
    });
    /* restock, leaving a working float so the player still has money to build */
    const float = 2500;
    if (s.water < 260 && s.credits > float) trade(s, 'water', 200);
    if (s.nutrients < 120 && s.credits > float) trade(s, 'nutrients', 200);
    if (s.food < dailyNeed(s) * 9 && s.credits > float) trade(s, 'food', 30000);
    if (s.o2 < 80 && s.credits > float) trade(s, 'o2', 60);
    if (s.co2 < 25 && s.credits > float) trade(s, 'co2', 40);
    if (s.o2 > 330) sellO2(s, 60);
    if (s.food > dailyNeed(s) * 80) sellFood(s, 60000);
  }

  function endOfDay(s, log) {
    if (s.auto) autoManage(s, log);
    /* Food closure over the whole mission: everything grown divided by everything
       eaten. A windowed average is useless here — a staple takes longer to mature
       than any sensible window, so it reads zero between harvests. */
    const need = dailyNeed(s);
    s.stats.totalGrown = (s.stats.totalGrown || 0) + s.stats.harvestedToday;
    s.stats.totalEaten = (s.stats.totalEaten || 0) + need;
    s.stats.harvestedToday = 0;
    s.stats.lastClosure = s.stats.totalEaten > 0 ? s.stats.totalGrown / s.stats.totalEaten : 0;
    s.stats.closureStreak = s.stats.lastClosure >= 1 ? s.stats.closureStreak + 1 : 0;

    const kinds = Object.keys(s.stats.kinds).length;
    let target = 46 + Math.min(kinds, 8) * 3;
    if (s.stats.flowersRecent) target += 8;
    if (s.food < need * 3) target -= 25;
    if (s.pressure < 95) target -= 10;
    if (s.o2 < 40) target -= 20;
    s.morale = clamp(s.morale + clamp(target - s.morale, -4, 2.5), 0, 100);
    s.stats.flowersRecent = false;

    const sunlit = isSunlit(s);
    if (!sunlit) s.stats.seenNight = true;
    if (sunlit && s.stats.seenNight && !s.stats.countedNight) {
      s.stats.nightsSurvived++; s.stats.countedNight = true;
      log.push('Sunrise over the Marius Hills. You brought the farm through the night.');
    }
    if (!sunlit) s.stats.countedNight = false;

    if (s.food > need * 20 && s.morale > 65 && s.crew < crewCapacity(s) && s.day % 12 === 0) {
      s.crew++;
      log.push(`A colonist transferred in. Crew is now ${s.crew}.`);
    }

    if (!s.up.uvc) {
      for (const f of planted(s)) {
        if (f.infected && Math.random() < 0.10) {
          const n = neighbourFields(s, f).filter(x => x.crop && !x.infected && !x.dead);
          if (n.length) {
            const pick = n[Math.floor(Math.random() * n.length)];
            pick.infected = true;
            log.push(`Infection spread to the hall at ${pick.x + 1},${pick.y + 1}.`);
          }
        }
      }
    }

    if (s.day > 3 && !s.pendingEvent && Math.random() < 0.16) {
      const pool = EVENTS.filter(e => s.day >= e.minDay);
      let r = Math.random() * pool.reduce((a, e) => a + e.weight, 0);
      for (const e of pool) { r -= e.weight; if (r <= 0) { s.pendingEvent = e.id; break; } }
    }

    for (const m of MILESTONES) {
      if (!s.done[m.id] && m.done(s)) { s.done[m.id] = s.day; log.push(`Milestone: ${m.text}.`); }
    }

    /* one telemetry sample a day, for the report dashboard */
    s.history.push({
      d: s.day,
      food: Math.round(s.food / Math.max(1, need) * 10) / 10,   // days of reserve
      closure: Math.round(s.stats.lastClosure * 100) / 100,
      o2: Math.round(s.o2), co2: Math.round(s.co2),
      water: Math.round(s.water), power: Math.round(s.stored),
      credits: Math.round(s.credits), crew: s.crew,
      morale: Math.round(s.morale), tiles: totalTiles(s),
      sun: isSunlit(s) ? 1 : 0
    });
    if (s.history.length > 400) s.history.shift();
  }

  /* halls whose outlines touch */
  function neighbourFields(s, f) {
    return s.fields.filter(o => o.id !== f.id &&
      o.x <= f.x + f.w && f.x <= o.x + o.w && o.y <= f.y + f.h && f.y <= o.y + o.h);
  }

  /* ---------- player actions ---------- */

  /* Why this tile will or will not take that structure. Mutates nothing, so the
     build tools can use it to colour a drag preview. */
  function canPlace(s, t, type, ignoreCost) {
    const B = buildById(type);
    if (!B) return 'Unknown structure.';
    if (!t) return 'That is off the plot.';
    if (t.f) return 'A grow hall covers that ground.';
    if (t.t === 'crater') return 'The ground drops away here — nothing will sit level.';
    if (t.t === 'skylight') return 'That is the tube skylight. It stays open.';
    if (t.t === 'boulder') return 'Clear the boulders first.';
    if (t.b) return t.b.type === type ? 'Already laid here.' : 'Something is already built here.';
    if (B.once && count(s, type) >= 1) return `The farm only needs one ${B.name.toLowerCase()}.`;
    if (!ignoreCost && !s.sandbox) {
      if (s.credits < B.cost) return 'Not enough credits.';
      if (B.science && s.science < B.science) return `Needs ${B.science} science.`;
    }
    return null;
  }

  function place(s, t, type) {
    const err = canPlace(s, t, type);
    if (err) return err;
    const B = buildById(type);
    if (!s.sandbox) {
      s.credits -= B.cost;
      if (B.science) s.science -= B.science;
    }
    t.b = { type };
    if (type === 'composter') s.up.composter = true;
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
    if (t.t === 'boulder') {
      if (s.credits < 120) return 'Clearing boulders costs 120 credits.';
      s.credits -= 120; t.t = 'flat';
      return null;
    }
    if (!t.b) return 'Nothing here to clear.';
    if (t.b.type === 'hab' && count(s, 'hab') <= 1) return 'The crew have to live somewhere.';
    if (s.credits < 60) return 'Demolition costs 60 credits.';
    s.credits -= 60;
    if (t.b.type === 'composter') s.up.composter = count(s, 'composter') > 1;
    t.b = null;
    if (s.crew > crewCapacity(s)) s.crew = crewCapacity(s);
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

  function water(s, f) {
    if (!f || !f.crop || f.dead) return 'Nothing planted there.';
    const need = (1 - f.moisture) * 4 * area(f);
    if (s.water < need) return 'Not enough water in the loop.';
    s.water -= need * (1 - recoveryRate(s));
    f.moisture = 1;
    return null;
  }

  function feed(s, f) {
    if (!f || !f.crop || f.dead) return 'Nothing planted there.';
    const need = (1 - f.feed) * 2 * area(f);
    if (s.nutrients < need) return 'Nutrient stock is empty.';
    s.nutrients -= need; f.feed = 1;
    return null;
  }

  function treat(s, f) {
    if (!f || !f.infected) return 'That hall is clean.';
    const cost = 120 * area(f);
    if (s.credits < cost) return `Sterilising that hall costs ${cost.toLocaleString()} credits.`;
    s.credits -= cost; f.infected = false;
    return null;
  }

  function harvest(s, f, log) {
    if (!f || !f.crop || f.growth < 1) return 'Not ready yet.';
    const c = cropById(f.crop);
    const A = area(f), q = f.health;
    const kcal = Math.round(c.kcal * KCAL_SCALE * A * q);
    const pay = Math.round(c.value * VALUE_SCALE * A * q);
    s.food += kcal; s.credits += pay; s.science += c.science;
    s.morale = clamp(s.morale + c.morale * 0.25, 0, 100);
    if (c.kind === 'flower') s.stats.flowersRecent = true;
    /* Stems, roots and leaf waste go back through the composter; the rest of the
       carbon leaves the loop inside the food. */
    s.co2 = clamp(s.co2 + f.carbon * (s.up.composter ? 0.75 : 0.42), 0, co2Cap(s));
    if (s.up.composter) s.nutrients += 4 * A;
    /* stubble and root mass go back into the beds */
    const worked = s.up.composter ? 0.20 : 0.12;
    s.stats.harvests++;
    s.stats.kinds[c.id] = (s.stats.kinds[c.id] || 0) + 1;
    s.stats.harvestedToday += kcal;
    const msg = `Harvested ${c.name}: ${kcal.toLocaleString()} kcal, ${pay.toLocaleString()} cr.`;
    if (log) log.push(msg); else pushLog(s, msg);
    const keptSoil = clamp(f.soil + worked, 0, 1);
    clearCrop(f);
    f.soil = keptSoil;
    return null;
  }

  function clearCrop(f) {
    Object.assign(f, { crop: null, growth: 0, health: 1, moisture: 0.9, feed: 0.9,
                       infected: false, dead: false, carbon: 0, litNow: false, warned: false });
  }

  function clear(s, f) {
    if (!f || (!f.crop && !f.dead)) return 'Nothing to clear.';
    clearCrop(f);
    return null;
  }

  const conditionCost = f => ({ credits: 90 * area(f), nutrients: 6 * area(f) });

  /* Work imported biomass through the beds: buys in one go what several
     harvests would eventually do on their own. */
  function condition(s, f) {
    if (!f) return 'Select a grow hall first.';
    if (f.soil >= 0.995) return 'Those beds are fully conditioned.';
    const c = conditionCost(f);
    if (!s.sandbox && s.credits < c.credits) return `Conditioning that hall costs ${c.credits.toLocaleString()} credits.`;
    if (s.nutrients < c.nutrients) return `Conditioning that hall needs ${Math.ceil(c.nutrients)} nutrients.`;
    if (!s.sandbox) s.credits -= c.credits;
    s.nutrients -= c.nutrients;
    f.soil = clamp(f.soil + 0.30, 0, 1);
    return null;
  }

  function research(s, id) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) return 'Unknown item.';
    if (!u.repeat && s.up[id]) return 'Already fitted.';
    if (!s.sandbox) {
      if (s.credits < u.cost) return 'Not enough credits.';
      if (u.science && s.science < u.science) return `Needs ${u.science} science.`;
      s.credits -= u.cost;
      if (u.science) s.science -= u.science;
    }
    s.up[id] = u.repeat ? (s.up[id] || 0) + 1 : true;
    pushLog(s, `Fitted ${u.name}.`);
    return null;
  }

  function trade(s, what, qty) {
    const prices = { water: 4.2, nutrients: 3.0, spares: 260, food: 0.024, co2: 22, o2: 20 };
    const cost = Math.round(prices[what] * qty * (count(s, 'pad') ? 0.85 : 1));
    if (s.credits < cost) return 'Not enough credits.';
    s.credits -= cost; s[what] += qty;
    if (what === 'co2') s.co2 = clamp(s.co2, 0, co2Cap(s));
    return null;
  }

  function sellFood(s, kcal) {
    if (s.food - kcal < dailyNeed(s) * 10) return 'That would cut into the ten-day reserve.';
    s.food -= kcal;
    s.credits += Math.round(kcal * (count(s, 'pad') ? 0.015 : 0.012));
    return null;
  }

  function sellO2(s, kg) {
    if (s.o2 - kg < 90) return 'That would cut into the oxygen reserve.';
    s.o2 -= kg; s.credits += Math.round(kg * 14);
    return null;
  }

  /* ---------- events ---------- */

  function resolveEvent(s, eventId, effect) {
    const L = m => pushLog(s, m);
    switch (effect) {
      case 'spe_shelter': s.flags.shutter = 12; L('Halls shuttered for the flare. Twelve hours of lost light.'); break;
      case 'spe_ride': {
        const factor = s.up.shield ? 0.5 : 1;
        for (const f of planted(s)) f.health = clamp(f.health - 0.22 * cropById(f.crop).radSens * factor, 0, 1);
        s.morale -= 8 * factor;
        L('Rode out the flare. Radiation damage across the canopy and a dose to the crew.');
        break;
      }
      case 'micro_patch':
        if (s.spares < 2) { L('No spares to patch with — the leak continues.'); s.flags.leak = 1; }
        else { s.spares -= 2; s.flags.leak = 0; L('Puncture patched. Pressure holding.'); }
        break;
      case 'micro_ignore': s.flags.leak = 1; L('Leak logged and left. Pressure is falling.'); break;
      case 'dust_clean': s.flags.dust = 0; s.morale -= 2; L('Arrays cleaned. Everyone came back filthy.'); break;
      case 'dust_ignore': s.flags.dust = Math.min(5, s.flags.dust + 2); L('Dust left on the arrays.'); break;
      case 'fus_treat':
        if (s.credits < 400) { L('Could not afford the kit — infection spreading.'); infectRandom(s, 2); }
        else { s.credits -= 400; for (const f of planted(s)) f.infected = false; L('Halls sterilised.'); }
        break;
      case 'fus_ignore': infectRandom(s, 2); L('Airflow cut. The fungus is still there.'); break;
      case 'bus_fix':
        if (s.spares < 3) { L('Not enough spares — running on half the battery string.'); s.flags.busfault = 1; }
        else { s.spares -= 3; s.flags.busfault = 0; L('Bus rebuilt. Full storage restored.'); }
        break;
      case 'bus_ignore': s.flags.busfault = 1; L('Half the battery string stays isolated.'); break;
      case 'pump_fix':
        if (s.credits < 600) { s.flags.biofilm = 1; L('Could not afford the flush.'); }
        else { s.credits -= 600; s.flags.biofilm = 0; L('Loop flushed and re-inoculated.'); }
        break;
      case 'pump_ignore': s.flags.biofilm = 1; L('Water recovery is down ten points.'); break;
      case 'res_buy':
        if (s.credits < 2200) L('The broker left without a deal.');
        else { s.credits -= 2200; s.spares += 8; s.water += 300; L('Took delivery of spares and water.'); }
        break;
      case 'res_sell': {
        const spare = Math.max(0, s.food - dailyNeed(s) * 12);
        if (spare < 5000) L('Nothing spare to sell.');
        else { s.food -= spare; s.credits += Math.round(spare * 0.02); L(`Sold ${Math.round(spare).toLocaleString()} kcal at the premium rate.`); }
        break;
      }
      case 'grant_take':
        if (s.science < 20) L('Not enough data to package.');
        else { s.science -= 20; s.credits += 5200; L('Grant paid out: 5,200 credits.'); }
        break;
      case 'crew_add':
        if (s.crew + 2 > crewCapacity(s)) L('No quarters for them. The transfer was refused.');
        else { s.crew += 2; L('Two agronomists joined the crew.'); }
        break;
      case 'crew_decline': s.morale -= 3; L('Transfer declined.'); break;
      case 'therm_fix':
        if (s.credits < 500) { s.flags.thermal = 96; L('No budget for the scrub — running warm.'); }
        else { s.credits -= 500; s.flags.thermal = 0; L('Radiators scrubbed.'); }
        break;
      case 'therm_throttle': s.flags.thermal = 96; L('Lights throttled while the farm sheds heat.'); break;
      default: break;
    }
    s.morale = clamp(s.morale, 0, 100);
    s.pendingEvent = null;
  }

  function infectRandom(s, n) {
    const pool = planted(s).filter(f => !f.infected);
    for (let i = 0; i < n && pool.length; i++) {
      const j = Math.floor(Math.random() * pool.length);
      pool[j].infected = true; pool.splice(j, 1);
    }
  }

  /* ---------- bookkeeping ---------- */

  function pushLog(s, msg) {
    s.log.unshift({ day: s.day, msg });
    if (s.log.length > 120) s.log.pop();
  }

  function checkFail(s) {
    if (s.food <= 0) s.over = 'The stores ran out. The colony was evacuated on the next lander.';
    else if (s.o2 <= 0) s.over = 'Oxygen reserves hit zero. The farm could not keep up with the crew.';
    else if (s.water <= 0) s.over = 'The water loop ran dry.';
    else if (s.pressure <= 60) s.over = 'Pressure fell below the abort limit. The tube was sealed and abandoned.';
    else if (s.credits < -5000) s.over = 'The station cut your funding. Someone else will farm this tube.';
  }

  window.LF_SIM = {
    newGame, migrate, STATE_VERSION,
    tick, place, bulldoze, plant, water, feed, treat, harvest, clear, autoManage,
    research, trade, sellFood, sellO2, resolveEvent, condition, conditionCost, RAW_SOIL,
    addField, removeField, checkField, fieldCost, fieldAt, fieldById, fieldTiles, canPlace,
    planted, area, totalTiles, seedCost, serviceSet, fieldRailed,
    cropById, buildById, clamp, tileAt, built, count,
    generation, demand, storageCap, isSunlit, sunElevation, lightsOn,
    dailyNeed, nightReserve, recoveryRate, crewCapacity, dustFactor, ledKW, pushLog,
    KCAL_SCALE, VALUE_SCALE, RTG_KW, REACTOR_KW, ARRAY_KW, BATTERY_KWH, MAX_FIELD
  };
})();
