/* Lunar Metropolis — civic coverage and the dust field.

   Two spatial systems, both recomputed once per simulated day and read by
   the growth model rather than being decoration.

   COVERAGE. Each civic building projects a circle whose strength falls off
   with distance, the way SimCity 2000's police and fire stations do, and the
   relevant department's funding scales how far it reaches. Coverage is
   stamped outward from each building rather than searched for per tile: a
   handful of buildings times a small disc is a few thousand operations,
   where asking every one of 16,384 tiles about every building would be
   hundreds of thousands.

   DUST. Regolith dust is the best-documented nuisance of working on the
   Moon — abrasive, electrostatically clingy, and ruinous to seals and
   radiators. Here industry emits it, it diffuses to neighbours and slowly
   settles out, and where it lies it fouls solar arrays and drags land value
   down. That makes where the refineries go a real decision. Biodomes scrub
   it locally, which gives them a second job beyond amenity.

   No DOM references. */

(function () {
  const { K, BUILDINGS, SERVICES } = window.LM_DATA;
  const G = window.LM_GRID;
  const idx = G.idx, tileAt = G.tileAt, DIRS = G.DIRS;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const N = K.COLS * K.ROWS;

  const buildById = id => BUILDINGS.find(b => b.id === id);
  const serviceById = id => SERVICES.find(x => x.id === id);

  /* One Float32Array per service. Values run 0..1 and saturate rather than
     summing without limit, so stacking six medbays on one block is wasted
     money — the same diminishing return SimCity 2000 uses to stop coverage
     spam being the dominant strategy. */
  function coverage(s, eff) {
    const out = {};
    for (const sv of SERVICES) out[sv.id] = new Float32Array(N);

    for (const t of s.map) {
      if (!t.b) continue;
      const B = buildById(t.b.type);
      if (!B || !B.service) continue;

      /* funding scales reach: a starved department covers a smaller circle */
      const fund = eff ? (eff.deptFunding[serviceById(B.service).dept] ?? 1) : 1;
      const r = B.radius * (0.5 + 0.5 * fund);
      const field = out[B.service];
      const r2 = r * r;
      const x0 = Math.max(0, Math.floor(t.x - r)), x1 = Math.min(K.COLS - 1, Math.ceil(t.x + r));
      const y0 = Math.max(0, Math.floor(t.y - r)), y1 = Math.min(K.ROWS - 1, Math.ceil(t.y + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - t.x, dy = y - t.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const strength = 1 - Math.sqrt(d2) / r;
          const k = idx(x, y);
          /* saturating combine, not a raw sum */
          field[k] = field[k] + strength - field[k] * strength;
        }
      }
    }
    return out;
  }

  /* One day of dust: industry emits, the field bleeds outward, biodomes
     scrub, and the rest settles. Written as a single pass over a scratch
     copy so the diffusion does not read values it has already updated. */
  function diffuseDust(s) {
    const cur = new Float32Array(N);
    for (const t of s.map) cur[idx(t.x, t.y)] = t.dust || 0;

    /* emission */
    for (const t of s.map) {
      if (t.zone && t.zone.kind === 'industry' && t.zone.stage > 0) {
        cur[idx(t.x, t.y)] += K.DUST_EMIT * t.zone.stage;
      }
    }

    /* diffusion + decay */
    const next = new Float32Array(N);
    for (let y = 0; y < K.ROWS; y++) {
      for (let x = 0; x < K.COLS; x++) {
        const k = idx(x, y);
        let acc = cur[k];
        let out = 0;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= K.COLS || ny >= K.ROWS) continue;
          acc += cur[idx(nx, ny)] * K.DUST_SPREAD;
          out += K.DUST_SPREAD;
        }
        next[k] = (acc - cur[k] * out) * K.DUST_DECAY;
      }
    }

    /* biodomes scrub the air around them */
    for (const t of s.map) {
      if (!t.b || t.b.type !== 'biodome') continue;
      const B = buildById('biodome'), r = B.radius;
      for (let y = Math.max(0, t.y - r); y <= Math.min(K.ROWS - 1, t.y + r); y++) {
        for (let x = Math.max(0, t.x - r); x <= Math.min(K.COLS - 1, t.x + r); x++) {
          const d = Math.hypot(x - t.x, y - t.y);
          if (d > r) continue;
          next[idx(x, y)] *= 1 - 0.55 * (1 - d / r);
        }
      }
    }

    for (const t of s.map) t.dust = clamp(next[idx(t.x, t.y)], 0, 3);
  }

  /* Total draw of every powered civic building — folded into the grid load
     so a service-rich city genuinely needs a bigger grid. */
  function serviceDraw(s) {
    let kw = 0;
    for (const t of s.map) {
      if (!t.b) continue;
      const B = buildById(t.b.type);
      if (B && B.drawKw && B.service) kw += B.drawKw;
    }
    return kw;
  }

  const at = (field, x, y) => field ? field[idx(x, y)] : 0;

  window.LM_SERVICES = { coverage, diffuseDust, serviceDraw, at, buildById, serviceById };
})();
