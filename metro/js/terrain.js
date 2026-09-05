/* Lunar Metropolis — terrain: generation, elevation editing, sun exposure.

   No DOM references anywhere in this file. The renderer depends on this
   module, never the reverse, which is what lets harness.html drive the whole
   thing headlessly — the same discipline the rest of this repo's simulations
   keep. */

(function () {
  const { K, TERRAIN, DEPOSITS } = window.LM_DATA;

  const idx = (x, y) => y * K.COLS + x;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < K.COLS && y < K.ROWS;
  const tileAt = (s, x, y) => inBounds(x, y) ? s.map[idx(x, y)] : null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /* Deterministic hash noise — same technique Artemis City uses, so a given
     seed always regenerates exactly the same world. */
  function rnd(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

  /* Smooth value noise, sampled on a coarse lattice and bilinearly blended.
     Cheap, deterministic, and enough to give the mare a gentle roll before
     craters are stamped into it. */
  function valueNoise(seed, x, y, scale) {
    const gx = x / scale, gy = y / scale;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const c = (ix, iy) => rnd(seed + ix * 57.13 + iy * 131.7);
    const a = c(x0, y0), b = c(x0 + 1, y0), d = c(x0, y0 + 1), e = c(x0 + 1, y0 + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (d * (1 - sx) + e * sx) * sy;
  }

  /* ---------- elevation editing ---------- */

  /* Pull every tile back inside the max-one-level step rule, working
     outward from whatever was just edited. This is what turns a single
     raised tile into a natural-looking slope instead of a spike, and it is
     the invariant every other part of the game can then rely on. */
  function relax(s, seeds) {
    const q = seeds.slice();
    let guard = 0;
    while (q.length && guard++ < 400000) {
      const [x, y] = q.pop();
      const t = tileAt(s, x, y);
      if (!t) continue;
      for (const [dx, dy] of DIRS) {
        const n = tileAt(s, x + dx, y + dy);
        if (!n) continue;
        if (n.h > t.h + K.MAX_STEP) { n.h = t.h + K.MAX_STEP; q.push([n.x, n.y]); }
        else if (n.h < t.h - K.MAX_STEP) { n.h = t.h - K.MAX_STEP; q.push([n.x, n.y]); }
      }
    }
  }

  function raise(s, x, y) {
    const t = tileAt(s, x, y);
    if (!t || t.h >= K.MAX_H) return false;
    t.h++;
    relax(s, [[x, y]]);
    return true;
  }

  function lower(s, x, y) {
    const t = tileAt(s, x, y);
    if (!t || t.h <= 0) return false;
    t.h--;
    relax(s, [[x, y]]);
    return true;
  }

  /* Flatten toward a target height — the tool you use to cut a building pad
     out of a slope. One level per application so the cascade stays legible. */
  function levelTo(s, x, y, target) {
    const t = tileAt(s, x, y);
    if (!t || t.h === target) return false;
    t.h += t.h < target ? 1 : -1;
    relax(s, [[x, y]]);
    return true;
  }

  function clearBoulders(s, x, y) {
    const t = tileAt(s, x, y);
    if (!t || t.t !== 'boulder') return false;
    t.t = 'rough';
    return true;
  }

  /* True when the whole map honours the step rule. Cheap enough to assert in
     tests after every edit, which is the point. */
  function stepRuleHolds(s) {
    for (const t of s.map) {
      for (const [dx, dy] of DIRS) {
        const n = tileAt(s, t.x + dx, t.y + dy);
        if (n && Math.abs(n.h - t.h) > K.MAX_STEP) return false;
      }
    }
    return true;
  }

  /* ---------- sun exposure ---------- */

  /* Fraction of the horizon a tile can see, cast against the surrounding
     relief. The threshold a blocker has to clear — how much higher a tile
     must be, per step of distance, to throw shadow — is SUN_SLOPE, and it is
     read off the world being computed rather than fixed globally: a site's
     own sunSlope (set once at generation, from its latitude — see colony-sites.js's
     slopeFor()) is what actually distinguishes a pole from the equator. Near
     a pole that threshold is low, so a ridge only a couple of levels up
     throws shadow a long way — precisely why crater floors there stay
     permanently dark and crater rims stay permanently lit. Near the equator
     it is high, so almost nothing casts a usable shadow at all — measured,
     not assumed: permanent shadow (and the ice seedDeposits keys off it)
     drops by more than an order of magnitude. What that does NOT do is make
     permanent light scarce too — the opposite; open sky gets far more
     common, not rarer, so an equatorial site trades the pole's power-vs-ice
     siting puzzle for a different one: solar siting stops mattering much,
     and finding a floor still dark enough for a telescope becomes the hard
     search instead. Falls back to the global default when a world has no
     sunSlope of its own — every save from before this existed, and every
     call in this file's own generation step before the site's slope has
     been attached. Recomputed after terrain edits. */
  const slopeOf = s => s.sunSlope !== undefined ? s.sunSlope : K.SUN_SLOPE;

  function computeSun(s) {
    const slope = slopeOf(s);
    const dirs = [];
    for (let i = 0; i < K.RAY_DIRS; i++) {
      const a = (i / K.RAY_DIRS) * Math.PI * 2;
      dirs.push([Math.cos(a), Math.sin(a)]);
    }
    for (const t of s.map) {
      let open = 0;
      for (const [dx, dy] of dirs) {
        let blocked = false;
        for (let d = 1; d <= K.RAY_LEN; d++) {
          const n = tileAt(s, Math.round(t.x + dx * d), Math.round(t.y + dy * d));
          if (!n) break;                       // off the map is open sky
          if (n.h > t.h + d * slope) { blocked = true; break; }
        }
        if (!blocked) open++;
      }
      t.sun = open / K.RAY_DIRS;
    }
  }

  /* Recompute sun only around an edit. A terrain change can only affect
     tiles within RAY_LEN of it, so a full-map pass after every click would
     be wasted work on a 128x128 map. */
  function computeSunNear(s, cx, cy, pad) {
    const slope = slopeOf(s);
    const r = K.RAY_LEN + (pad || 1);
    const dirs = [];
    for (let i = 0; i < K.RAY_DIRS; i++) {
      const a = (i / K.RAY_DIRS) * Math.PI * 2;
      dirs.push([Math.cos(a), Math.sin(a)]);
    }
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const t = tileAt(s, x, y);
        if (!t) continue;
        let open = 0;
        for (const [dx, dy] of dirs) {
          let blocked = false;
          for (let d = 1; d <= K.RAY_LEN; d++) {
            const n = tileAt(s, Math.round(t.x + dx * d), Math.round(t.y + dy * d));
            if (!n) break;
            if (n.h > t.h + d * slope) { blocked = true; break; }
          }
          if (!blocked) open++;
        }
        t.sun = open / K.RAY_DIRS;
      }
    }
  }

  /* ---------- generation ---------- */

  function stampCrater(s, cx, cy, r, depth) {
    for (let y = cy - r - 2; y <= cy + r + 2; y++) {
      for (let x = cx - r - 2; x <= cx + r + 2; x++) {
        const t = tileAt(s, x, y);
        if (!t) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d > r + 1.5) continue;
        if (d < r * 0.72) {
          t.h -= depth;                                  // the floor drops away
          if (d < r * 0.5) t.t = 'flat';
        } else {
          t.h += Math.max(1, Math.round(depth * 0.55));  // and throws up a rim
          t.t = 'rough';
        }
      }
    }
  }

  /* A sinuous collapsed lava channel. Real rilles wander, so the centreline
     is walked with a slowly-turning heading rather than drawn straight. */
  /* Returns the centreline it walked, as tile coordinates. The rille is the
     COLLAPSED length of a lava tube; the intact tube continues underneath the
     same course, which is why the two share a path rather than being
     generated independently. Nothing about the carving changed when this
     started returning a value — the surface a rille produces is exactly what
     it always was. */
  function stampRille(s, seed, x0, y0, len) {
    let x = x0, y = y0, a = rnd(seed) * Math.PI * 2;
    const spine = [];
    for (let i = 0; i < len; i++) {
      a += (rnd(seed + i * 3.7) - 0.5) * 0.5;
      x += Math.cos(a); y += Math.sin(a);
      const w = 1 + Math.round(rnd(seed + i * 9.1) * 1.6);
      spine.push([Math.round(x), Math.round(y), w]);
      for (let dy = -w; dy <= w; dy++) {
        for (let dx = -w; dx <= w; dx++) {
          const t = tileAt(s, Math.round(x + dx), Math.round(y + dy));
          if (!t) continue;
          if (Math.hypot(dx, dy) > w) continue;
          t.h -= 2;
          t.t = 'rough';
        }
      }
    }
    return spine;
  }

  /* ---------- lava tubes ----------

     The third way to house people, and the only one the player cannot make
     more of. Surface ground can be levelled and a shaft can be bored, but a
     tube is where the geology put it, as long as the geology made it, and no
     amount of money extends it by a metre.

     A tube is recorded as METADATA over ground that already exists: the rille
     carved the surface exactly as it always did, and this only writes down
     where the intact continuation of it runs. Generation output — every
     height, every terrain type, the single skylight — is unchanged by any of
     this, which is what lets it be added without altering a colony anyone has
     already founded. See the CLASS_PARAMS note below for why that invariant
     is taken seriously here.

     `span` is the tube's width in tiles at that point, carried from the
     rille's own width, and it is what makes one tube worth more per metre
     than another. */
  function recordTube(s, spine, seed) {
    if (!spine || spine.length < 8) return;
    /* Trimmed at both ends: the mouth of a rille is where the roof has fallen
       in completely, and a collapsed end is not habitable volume. */
    const path = [], mid = spine.slice(4, spine.length - 4);
    let span = 0;
    for (const [x, y, w] of mid) {
      if (!inBounds(x, y)) continue;
      const last = path[path.length - 1];
      if (last && last[0] === x && last[1] === y) continue;   // the walk repeats tiles
      path.push([x, y]);
      span += w;
    }
    if (path.length < 6) return;
    const tube = {
      id: 0,
      path,
      span: +(span / path.length).toFixed(2),
      roofDepth: 3 + Math.round(rnd(seed + 61.3) * 4)
    };
    s.tubes = [tube];
    for (let i = 0; i < path.length; i++) {
      const t = tileAt(s, path[i][0], path[i][1]);
      if (t) t.tube = { id: 0, i };
    }
  }

  /* One entry per site class, read by makeMap. 'polar' is, deliberately,
     nothing more than today's numbers given names — every world this game
     has ever generated is a polar world, so the default path (opts omitted
     entirely) must keep producing exactly what it always has, and the
     cleanest way to guarantee that is for there to be only one code path,
     not a legacy branch frozen alongside a new one. A harness scenario
     checks makeMap(seed) and makeMap(seed, CLASS_PARAMS.polar's own values)
     produce byte-identical worlds for exactly this reason.

     mare is flat, dark, lightly cratered, with no massif — real maria are
     the smooth basaltic plains, and a guaranteed peak would be redundant
     there anyway: a mare site's high sunSlope already makes open sky the
     default state of nearly every tile (see computeSun's own note), so
     there is no scarce well-lit spot worth manufacturing one for. mare's
     low relief cuts the other way, though — height rarely reaches the 8
     levels a heliostat crown needs, so the wonder that wants peak sun most
     is often the one a mare site cannot actually host.

     highland is rough and heavily cratered with the highest relief — the
     ancient, saturated terrain real lunar highlands are, and tall enough
     that a heliostat crown finds a home there almost anywhere. */
  const CLASS_PARAMS = {
    polar: {
      noiseA: 26, noiseB: 11, reliefBase: 3, reliefAmp: 5,
      bigCount: 5, bigRBase: 9, bigRSpread: 7, bigDepth: 4,
      smallCount: 22, smallRBase: 2, smallRSpread: 3, smallDepth: 2,
      rille: true, massif: true, boulders: 260
    },
    mare: {
      noiseA: 34, noiseB: 14, reliefBase: 1, reliefAmp: 2,
      bigCount: 2, bigRBase: 6, bigRSpread: 5, bigDepth: 3,
      smallCount: 8, smallRBase: 1, smallRSpread: 3, smallDepth: 1,
      rille: false, massif: false, boulders: 90
    },
    highland: {
      noiseA: 18, noiseB: 8, reliefBase: 5, reliefAmp: 8,
      bigCount: 9, bigRBase: 7, bigRSpread: 9, bigDepth: 6,
      smallCount: 40, smallRBase: 2, smallRSpread: 5, smallDepth: 3,
      rille: false, massif: false, boulders: 340
    }
  };

  /* `opts` is entirely optional. Omitting it — as every call site in this
     codebase does today — reproduces exactly what makeMap has always
     produced: a polar world at the default sunSlope. Only sites founded
     through the globe (Phase 4) or found() with an explicit class ever pass
     one, and every one of THOSE also carries a gen number recording that it
     was built by this parameterised generator rather than the frozen
     original — see colony-sites.js. */
  function makeMap(seed, opts) {
    const cls = (opts && opts.class) || 'polar';
    const P = CLASS_PARAMS[cls] || CLASS_PARAMS.polar;
    const slope = (opts && opts.sunSlope !== undefined) ? opts.sunSlope : K.SUN_SLOPE;
    const s = { map: [], seed, sunSlope: slope };

    /* base relief: two octaves of noise, scaled and offset per class */
    for (let y = 0; y < K.ROWS; y++) {
      for (let x = 0; x < K.COLS; x++) {
        const n = valueNoise(seed, x, y, P.noiseA) * 0.7 + valueNoise(seed + 91, x, y, P.noiseB) * 0.3;
        s.map.push({
          x, y,
          h: clamp(Math.round(P.reliefBase + n * P.reliefAmp), 0, K.MAX_H),
          t: 'flat',
          sun: 1,
          dust: 0,
          deposit: null,
          v: rnd(seed + x * 7.1 + y * 13.7)   // stable per-tile seed for texture
        });
      }
    }

    /* craters: a few large basins and a scatter of small ones */
    for (let i = 0; i < P.bigCount; i++) {
      const cx = Math.floor(rnd(seed + i * 3.3) * K.COLS);
      const cy = Math.floor(rnd(seed + i * 5.9) * K.ROWS);
      stampCrater(s, cx, cy, P.bigRBase + Math.floor(rnd(seed + i * 8.2) * P.bigRSpread), P.bigDepth);
    }
    for (let i = 0; i < P.smallCount; i++) {
      const cx = Math.floor(rnd(seed + 400 + i * 4.1) * K.COLS);
      const cy = Math.floor(rnd(seed + 400 + i * 6.3) * K.ROWS);
      stampCrater(s, cx, cy, P.smallRBase + Math.floor(rnd(seed + 400 + i * 2.7) * P.smallRSpread), P.smallDepth);
    }

    /* the rille, and the massif that gives a polar map a guaranteed peak of
       eternal light — see the CLASS_PARAMS comment for why only polar gets
       one */
    const spine = P.rille ? stampRille(s, seed + 77, K.COLS * 0.2, K.ROWS * 0.7, 90) : null;
    if (P.massif) {
      const px = Math.floor(K.COLS * 0.68), py = Math.floor(K.ROWS * 0.28);
      for (let y = py - 7; y <= py + 7; y++) {
        for (let x = px - 7; x <= px + 7; x++) {
          const t = tileAt(s, x, y);
          if (!t) continue;
          const d = Math.hypot(x - px, y - py);
          if (d > 7) continue;
          t.h += Math.round((7 - d) * 0.9);
        }
      }
    }

    for (const t of s.map) t.h = clamp(t.h, 0, K.MAX_H);
    relax(s, s.map.map(t => [t.x, t.y]));

    /* one lava-tube skylight — sited on the rille where there is one, and
       on a fixed interior spot where there is not, so the megadome wonder
       stays buildable on every class of site */
    const skx = P.rille ? Math.floor(K.COLS * 0.26) : Math.floor(K.COLS * 0.32);
    const sky = P.rille ? Math.floor(K.ROWS * 0.74) : Math.floor(K.ROWS * 0.36);
    const sk = tileAt(s, skx, sky);
    if (sk) { sk.t = 'skylight'; for (const [dx, dy] of DIRS) { const n = tileAt(s, sk.x + dx, sk.y + dy); if (n) n.t = 'rough'; } }

    /* The intact tube under the rille, if this class of site has one. Written
       down after the skylight so the skylight can be tied to it. */
    s.tubes = [];
    if (spine) recordTube(s, spine, seed);

    /* boulders, avoiding anything already special */
    for (let i = 0; i < P.boulders; i++) {
      const t = tileAt(s, Math.floor(rnd(seed + 900 + i * 17.3) * K.COLS),
                          Math.floor(rnd(seed + 900 + i * 11.9) * K.ROWS));
      if (t && t.t === 'flat') t.t = 'boulder';
    }

    computeSun(s);
    seedDeposits(s, seed);
    return s;
  }

  /* Deposits follow the sun model rather than being scattered independently
     of it: ice only survives where the sun genuinely never reaches, and
     helium-3 is implanted by the solar wind so it only accumulates where the
     ground has been exposed for billions of years. That coupling is the
     whole reason elevation is worth sculpting. */
  function seedDeposits(s, seed) {
    for (const t of s.map) {
      if (t.t === 'skylight') continue;
      const r = rnd(seed + 1300 + t.x * 3.1 + t.y * 7.7);
      if (t.sun <= K.SUN_SHADOW && r < 0.45) {
        t.deposit = { kind: 'ice', richness: clamp(0.5 + (K.SUN_SHADOW - t.sun) * 2.2, 0.3, 0.95) };
      } else if (t.sun >= K.SUN_PEAK && r > 0.94) {
        t.deposit = { kind: 'he3', richness: 0.15 + rnd(seed + t.x * 5.5) * 0.25 };
      } else if (r > 0.86) {
        t.deposit = { kind: 'regolith', richness: 0.3 + rnd(seed + t.x * 3.4) * 0.5 };
      }
    }
  }

  /* The tube under a tile, or null. Tubes are recorded on the tiles above
     them at generation, so this is a field read rather than a search. */
  const tubeAt = (s, x, y) => {
    const t = tileAt(s, x, y);
    return (t && t.tube && s.tubes) ? s.tubes[t.tube.id] || null : null;
  };
  const tubeOf = (s, t) => (t && t.tube && s.tubes) ? s.tubes[t.tube.id] || null : null;

  /* Where a tube arcology can be driven in from: the point on the tube's own
     course nearest the given tile. A skylight is a hole in the roof, so the
     ground beside one is the natural portal. */
  function nearestTubeEntry(s, x, y, maxD) {
    if (!s.tubes || !s.tubes.length) return null;
    let best = null;
    for (const tube of s.tubes) {
      for (let i = 0; i < tube.path.length; i++) {
        const d = Math.hypot(tube.path[i][0] - x, tube.path[i][1] - y);
        if (maxD !== undefined && d > maxD) continue;
        if (!best || d < best.d) best = { tube, i, d, x: tube.path[i][0], y: tube.path[i][1] };
      }
    }
    return best;
  }

  const terrainById = id => TERRAIN.find(t => t.id === id);
  const depositById = id => DEPOSITS.find(d => d.id === id);
  const buildable = t => !!t && !!terrainById(t.t) && terrainById(t.t).build;

  window.LM_TERRAIN = {
    makeMap, raise, lower, levelTo, clearBoulders,
    computeSun, computeSunNear, relax, stepRuleHolds,
    idx, inBounds, tileAt, terrainById, depositById, buildable, clamp,
    tubeAt, tubeOf, nearestTubeEntry,
    /* exposed for the harness (checking each class actually differs, and
       that omitting opts matches passing polar's own values explicitly)
       and for colony-sites.js, which needs the same slope-per-latitude concept
       to live somewhere other than here (see classify()/slopeFor()) */
    CLASS_PARAMS
  };
})();
