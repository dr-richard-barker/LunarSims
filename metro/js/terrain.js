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
     relief. Near the pole the sun barely clears the horizon (SUN_SLOPE), so
     a ridge only a couple of levels up throws shadow for a long way — which
     is precisely why crater floors here stay permanently dark and crater
     rims stay permanently lit. Recomputed after terrain edits. */
  function computeSun(s) {
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
          if (n.h > t.h + d * K.SUN_SLOPE) { blocked = true; break; }
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
            if (n.h > t.h + d * K.SUN_SLOPE) { blocked = true; break; }
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
  function stampRille(s, seed, x0, y0, len) {
    let x = x0, y = y0, a = rnd(seed) * Math.PI * 2;
    for (let i = 0; i < len; i++) {
      a += (rnd(seed + i * 3.7) - 0.5) * 0.5;
      x += Math.cos(a); y += Math.sin(a);
      const w = 1 + Math.round(rnd(seed + i * 9.1) * 1.6);
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
  }

  function makeMap(seed) {
    const s = { map: [], seed };

    /* base relief: two octaves of gentle roll over the mare */
    for (let y = 0; y < K.ROWS; y++) {
      for (let x = 0; x < K.COLS; x++) {
        const n = valueNoise(seed, x, y, 26) * 0.7 + valueNoise(seed + 91, x, y, 11) * 0.3;
        s.map.push({
          x, y,
          h: clamp(Math.round(3 + n * 5), 0, K.MAX_H),
          t: 'flat',
          sun: 1,
          deposit: null,
          v: rnd(seed + x * 7.1 + y * 13.7)   // stable per-tile seed for texture
        });
      }
    }

    /* craters: a few large basins and a scatter of small ones */
    for (let i = 0; i < 5; i++) {
      const cx = Math.floor(rnd(seed + i * 3.3) * K.COLS);
      const cy = Math.floor(rnd(seed + i * 5.9) * K.ROWS);
      stampCrater(s, cx, cy, 9 + Math.floor(rnd(seed + i * 8.2) * 7), 4);
    }
    for (let i = 0; i < 22; i++) {
      const cx = Math.floor(rnd(seed + 400 + i * 4.1) * K.COLS);
      const cy = Math.floor(rnd(seed + 400 + i * 6.3) * K.ROWS);
      stampCrater(s, cx, cy, 2 + Math.floor(rnd(seed + 400 + i * 2.7) * 3), 2);
    }

    /* one rille and one massif — the massif gives the map a guaranteed peak
       of eternal light to build a solar farm on, which the player should
       always have somewhere to find */
    stampRille(s, seed + 77, K.COLS * 0.2, K.ROWS * 0.7, 90);
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

    for (const t of s.map) t.h = clamp(t.h, 0, K.MAX_H);
    relax(s, s.map.map(t => [t.x, t.y]));

    /* one lava-tube skylight, sited on the rille */
    const sk = tileAt(s, Math.floor(K.COLS * 0.26), Math.floor(K.ROWS * 0.74));
    if (sk) { sk.t = 'skylight'; for (const [dx, dy] of DIRS) { const n = tileAt(s, sk.x + dx, sk.y + dy); if (n) n.t = 'rough'; } }

    /* boulders, avoiding anything already special */
    for (let i = 0; i < 260; i++) {
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

  const terrainById = id => TERRAIN.find(t => t.id === id);
  const depositById = id => DEPOSITS.find(d => d.id === id);
  const buildable = t => !!t && !!terrainById(t.t) && terrainById(t.t).build;

  window.LM_TERRAIN = {
    makeMap, raise, lower, levelTo, clearBoulders,
    computeSun, computeSunNear, relax, stepRuleHolds,
    idx, inBounds, tileAt, terrainById, depositById, buildable, clamp
  };
})();
