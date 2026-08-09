/* Artemis City — isometric renderer.

   A 2:1 isometric projection of the colony, drawn with a painter's algorithm.
   Everything is procedural: no sprites, no textures, no external assets.
   The lighting/shadow/extrusion toolkit (box/diamond/contact/groundShadow,
   the grey/shade/tone colour utilities, the sun-elevation light scalar and
   sun-vector cast shadows) is ported directly from Lunar Farm's render.js —
   a proven technique, not reinvented here. Buildings get a deliberately
   uneven amount of detail: the Command Module and Launch Pad are this
   game's "hero" structures and get the full treatment Lunar Farm gives its
   habitat; reactor/ISRU/mining rig get real but leaner detail; solar/
   battery stay close to Lunar Farm's own utility-building treatment; zone
   buildings (habitation/trade/industry) get a compact, stage-scaling
   treatment because a thriving city can have dozens of them on screen at
   once — unlike Lunar Farm's handful of hab modules, this map is large
   enough that unbounded per-tile detail needs a viewport cull, so every
   per-tile pass below only walks the camera-visible window. Ground outside
   the survey's revealed rectangle (see sim.js/grid.js) renders as fog
   rather than real terrain — the world is generated at full size up front,
   just not all of it is charted yet. */

(function () {
  const { K, ZONES, DEPOSITS, CROPS } = window.LC_DATA;
  const S = window.LC_SIM, GRID = window.LC_GRID, ZONESYS = window.LC_ZONES;
  const A = window.LC_AGENTS;

  const TW = 128, TH = 64;             // tile footprint on screen
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const iso = (tx, ty) => ({ x: (tx - ty) * (TW / 2), y: (tx + ty) * (TH / 2) });

  /* ---------- light ---------- */

  function lightOf(s) {
    const e = S.sunElevation(s);
    return S.isSunlit(s) ? 0.62 + 0.38 * e : 0.10;
  }
  /* Direction+length a shadow is cast, derived from the lunar day phase —
     long shadows near sunrise/sunset, short near lunar noon, none at night. */
  function sunVec(s) {
    const e = S.sunElevation(s);
    if (!S.isSunlit(s)) return null;
    const phase = ((s.day + s.hour / 24) % K.LUNAR_CYCLE) / (K.LUNAR_CYCLE / 2);
    const len = (1 - e) * 46 + 10;
    return { x: (phase - 0.5) * 2 * len, y: len * 0.34, a: clamp(0.26 + (1 - e) * 0.3, 0, 0.6) };
  }

  const grey = (v, l) => {
    const b = clamp(v * l, 0, 255);
    return `rgb(${Math.round(b)},${Math.round(b * 0.995)},${Math.round(b * 1.035)})`;
  };
  /* Regolith-specific: reads warm grey/tan under direct sun rather than the
     cool blue-grey grey() gives spacecraft steel — R leads, B trails. Used
     only for terrain, never for built structures, which stay neutral. The
     +18 floor keeps low-sun-angle ground from ever reading too dim to see
     as ground — night still goes properly dark (lightOf's own 0.10 night
     floor dominates that arithmetic), this only lifts the low end of the
     *daytime* range. */
  const regolith = (v, l) => {
    const b = clamp(v * l + 18, 0, 255);
    return `rgb(${Math.round(clamp(b * 1.06, 0, 255))},${Math.round(clamp(b * 0.97, 0, 255))},${Math.round(clamp(b * 0.85, 0, 255))})`;
  };
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${Math.round(clamp(((n >> 16) & 255) + amt, 0, 255))},${
      Math.round(clamp(((n >> 8) & 255) + amt, 0, 255))},${
      Math.round(clamp((n & 255) + amt, 0, 255))})`;
  }
  function tone(hex, l, mul) {
    const n = parseInt(hex.slice(1), 16);
    const f = l * mul;
    return `rgb(${Math.round(clamp(((n >> 16) & 255) * f, 0, 255))},${
      Math.round(clamp(((n >> 8) & 255) * f, 0, 255))},${
      Math.round(clamp((n & 255) * f, 0, 255))})`;
  }

  /* ---------- primitives ---------- */

  /* Path only — caller fills/strokes. (tx,ty) is the tile-space rectangle
     origin, (w,h) its size in tiles (may be fractional, for sub-tile
     accents), dz an optional height offset in screen pixels. */
  function diamond(ctx, tx, ty, w, h, dz) {
    const z = dz || 0;
    const a = iso(tx, ty), b = iso(tx + w, ty), c = iso(tx + w, ty + h), d = iso(tx, ty + h);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - z);
    ctx.lineTo(b.x, b.y - z);
    ctx.lineTo(c.x, c.y - z);
    ctx.lineTo(d.x, d.y - z);
    ctx.closePath();
  }
  function fillDiamond(ctx, tx, ty, w, h, fill, stroke) {
    diamond(ctx, tx, ty, w, h);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  /* An extruded box over a tile rectangle — the one universal primitive
     every structure in this file is built from. `col` is the base hex. */
  function box(ctx, tx, ty, w, h, z, col, l, opts) {
    const o = opts || {};
    const b = iso(tx + w, ty), c = iso(tx + w, ty + h), d = iso(tx, ty + h);

    ctx.fillStyle = o.right || tone(col, l, 0.62);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y); ctx.lineTo(c.x, c.y);
    ctx.lineTo(c.x, c.y - z); ctx.lineTo(b.x, b.y - z);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = o.left || tone(col, l, 0.42);
    ctx.beginPath();
    ctx.moveTo(d.x, d.y); ctx.lineTo(c.x, c.y);
    ctx.lineTo(c.x, c.y - z); ctx.lineTo(d.x, d.y - z);
    ctx.closePath(); ctx.fill();

    if (!o.noTop) {
      ctx.fillStyle = o.top || tone(col, l, 1.0);
      diamond(ctx, tx, ty, w, h, z); ctx.fill();
    }
    if (o.stroke) {
      ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1;
      diamond(ctx, tx, ty, w, h, z); ctx.stroke();
    }

    /* rim light along the two roof edges the sun actually reaches */
    if (!o.noRim && l > 0.3) {
      const a = iso(tx, ty);
      ctx.strokeStyle = `rgba(255,252,238,${0.16 + l * 0.22})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - z); ctx.lineTo(a.x, a.y - z); ctx.lineTo(b.x, b.y - z);
      ctx.stroke();
    }
  }

  /* A hemispherical dome over a tile rectangle — the moon-colony counterpart
     to box(), used everywhere a pressurised habitat module sits on the
     surface. A regolith-berm skirt (piled shielding, reusing the terrain's
     own regolith() tone) grounds it, three tapering ellipse layers stand in
     for a curved shell too cheap to actually render in 3D (darkest/widest
     at the base, brightest/narrowest at the apex, the way a rounded surface
     catches more direct light near its crown), and a glassy viewport ring
     sits partway up. Returns the dome's own screen centre and radii so
     callers can hang trim off the real geometry instead of guessing. */
  function dome(ctx, tx, ty, w, h, z, col, l, opts) {
    const o = opts || {};
    const cx = tx + w / 2, cy = ty + h / 2;
    const p = iso(cx, cy);
    const rx = w * (TW / 2) * 0.92, ry = h * (TH / 2) * 0.92;

    if (!o.noSkirt) {
      ctx.fillStyle = regolith(150, l);
      ctx.beginPath(); ctx.ellipse(p.x, p.y + TH * 0.06, rx * 1.24, ry * 1.24, 0, 0, 7); ctx.fill();
    }

    const layers = [
      { f: 0.0, rf: 1.00, shade: 0.55 },
      { f: 0.5, rf: 0.78, shade: 0.82 },
      { f: 1.0, rf: 0.48, shade: 1.06 }
    ];
    for (const ly of layers) {
      ctx.fillStyle = tone(col, l, ly.shade);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - z * ly.f, rx * ly.rf, ry * ly.rf, 0, 0, 7);
      ctx.fill();
    }

    if (!o.noRing) {
      ctx.strokeStyle = o.ring || `rgba(190,225,255,${0.32 + l * 0.3})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - z * 0.6, rx * 0.68, ry * 0.68, 0, 0, 7);
      ctx.stroke();
    }

    if (!o.noRim && l > 0.3) {
      ctx.strokeStyle = `rgba(255,252,238,${0.15 + l * 0.22})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - z * 0.86, rx * 0.46, ry * 0.46, 0, Math.PI * 1.08, Math.PI * 1.82);
      ctx.stroke();
    }

    if (o.stroke) {
      ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + TH * 0.06, rx * 1.24, ry * 1.24, 0, 0, 7); ctx.stroke();
    }

    return { p, rx, ry };
  }

  /* cheap ambient occlusion where a structure meets the ground */
  function contact(ctx, tx, ty, w, h) {
    const p = iso(tx + w / 2, ty + h / 2);
    const g = ctx.createRadialGradient(p.x, p.y + TH * 0.1, 2,
      p.x, p.y + TH * 0.1, Math.max(w, h) * TW * 0.45);
    g.addColorStop(0, 'rgba(0,0,0,0.34)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + TH * 0.12, (w + 0.5) * TW * 0.44, (h + 0.5) * TH * 0.42, 0, 0, 7);
    ctx.fill();
  }

  function groundShadow(ctx, tx, ty, w, h, z, sv) {
    if (!sv) return;
    const k = z / 34;
    const a = iso(tx, ty), b = iso(tx + w, ty), c = iso(tx + w, ty + h), d = iso(tx, ty + h);
    const sx = sv.x * k, sy = sv.y * k;
    ctx.fillStyle = `rgba(0,0,0,${sv.a * 0.72})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x + sx, c.y + sy); ctx.lineTo(d.x + sx, d.y + sy);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + sx, a.y + sy);
    ctx.lineTo(d.x + sx, d.y + sy); ctx.lineTo(d.x, d.y);
    ctx.closePath(); ctx.fill();
  }

  /* real-time (not sim-time) pulse — beacons and strobes stay alive even paused */
  const beat = (period) => (Math.sin(Date.now() / period) + 1) / 2;

  /* ---------- terrain ---------- */

  /* Unsurveyed ground — deliberately flat and dark, no speckle or deposit
     hints, so a player panning past the charter's edge sees that there is
     more world out there without it spoiling what's in it. Warm-dark
     rather than the sky's own cool near-black, though: this is unlit
     rock, not vacuum, and a whole screen of it reading identical to the
     starfield is what made an early, mostly-unsurveyed colony look like
     it was floating in space rather than standing on a surface. */
  function drawFogTile(ctx, t, l) {
    const { x, y } = t;
    ctx.fillStyle = 'rgba(38,31,25,0.92)';
    fillDiamond(ctx, x, y, 1, 1);
    if (((t.v * 137) % 1) < 0.06) {
      const p = iso(x + 0.5, y + 0.5);
      ctx.fillStyle = 'rgba(140,150,170,0.12)';
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
  }

  function drawTerrainTile(ctx, t, l, sv) {
    const { x, y } = t;
    if (t.t === 'skylight') {
      ctx.fillStyle = regolith(150, l);
      fillDiamond(ctx, x, y, 1, 1);
      ctx.fillStyle = '#04060b';
      fillDiamond(ctx, x + 0.08, y + 0.08, 0.84, 0.84);
      ctx.strokeStyle = grey(200, l); ctx.lineWidth = 1.6;
      fillDiamond(ctx, x + 0.08, y + 0.08, 0.84, 0.84, null, ctx.strokeStyle);
      return;
    }

    /* Base albedo is pushed well above the old steel-grey baseline and
       warm-tinted via regolith() rather than grey() — real regolith is dim
       in absolute terms (~12% reflectance) but reads unmistakably bright
       and lunar next to a true-black vacuum sky; the old values sat close
       enough to the sky's own near-black that the ground read as more
       sky than surface. */
    ctx.fillStyle = regolith(t.t === 'rough' ? 238 : t.t === 'boulder' ? 242 : 250, l);
    fillDiamond(ctx, x, y, 1, 1);

    /* One soft, low-contrast mottled patch per tile — undulating ground,
       not a flat painted plane. Sign and offset come from the tile's own
       seed so it is stable across frames rather than a shimmer. Biased
       toward the lighter variant now that the base fill is bright enough
       that the darkening version reads as an actual shadowed dip rather
       than as murk. */
    {
      const lighter = ((t.v * 331) % 1) < 0.65;
      const mu = 0.2 + ((t.v * 811) % 60) / 100, mw = 0.2 + ((t.v * 457) % 60) / 100;
      const q = iso(x + mu, y + mw);
      ctx.fillStyle = lighter ? 'rgba(255,250,236,0.07)' : 'rgba(0,0,0,0.035)';
      ctx.beginPath(); ctx.ellipse(q.x, q.y, TW * 0.22, TH * 0.22, 0, 0, 7); ctx.fill();
    }

    if (t.t === 'crater') {
      const p = iso(x + 0.5, y + 0.5);
      ctx.fillStyle = regolith(205, l);
      ctx.beginPath(); ctx.ellipse(p.x, p.y + TH / 2, TW * 0.4, TH * 0.4, 0, 0, 7); ctx.fill();
      if (sv) {
        ctx.save();
        ctx.beginPath(); ctx.ellipse(p.x, p.y + TH / 2, TW * 0.4, TH * 0.4, 0, 0, 7); ctx.clip();
        ctx.fillStyle = `rgba(0,0,0,${clamp(0.14 + sv.a * 0.45, 0, 0.46)})`;
        ctx.beginPath();
        ctx.ellipse(p.x + Math.sign(sv.x) * TW * 0.3, p.y + TH * 0.42, TW * 0.36, TH * 0.36, 0, 0, 7);
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = regolith(252, l); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + TH / 2, TW * 0.4, TH * 0.4, 0, 0, 7); ctx.stroke();
      return;
    }

    /* regolith speckle — the same fixed per-tile texture cost Lunar Farm
       carries, safe here only because the caller has already culled to the
       visible window */
    const n = t.t === 'rough' ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const u = ((t.v * 977 + i * 131) % 100) / 100;
      const w = ((t.v * 613 + i * 271) % 100) / 100;
      const q = iso(x + u * 0.86 + 0.07, y + w * 0.86 + 0.07);
      ctx.fillStyle = ((t.v * 100 + i) % 2) < 1 ? 'rgba(0,0,0,0.12)' : 'rgba(255,250,240,0.14)';
      ctx.fillRect(q.x - 1, q.y - 1, 2, 2);
    }

    if (t.t === 'boulder') {
      for (let i = 0; i < 2; i++) {
        const u = 0.22 + ((t.v * 700 + i * 150) % 56) / 100;
        const w = 0.22 + ((t.v * 430 + i * 90) % 56) / 100;
        const p = iso(x + u, y + w);
        const r = 7 + ((t.v * 100 + i * 33) % 7);
        ctx.fillStyle = regolith(190, l);
        ctx.beginPath(); ctx.ellipse(p.x, p.y - r * 0.5, r, r * 0.86, 0, 0, 7); ctx.fill();
        ctx.fillStyle = regolith(252, l);
        ctx.beginPath(); ctx.ellipse(p.x - r * 0.3, p.y - r * 0.8, r * 0.45, r * 0.38, 0, 0, 7); ctx.fill();
      }
    }
  }

  function depositMarker(ctx, t) {
    const p = iso(t.x + 0.5, t.y + 0.5);
    const dep = t.deposit;
    const c = DEPOSITS.find(d => d.id === dep.kind).colour;
    ctx.globalAlpha = 0.28 + dep.richness * 0.42;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6 + dep.richness * 5, 0, Math.PI * 2);
    ctx.fillStyle = c; ctx.fill();
    if (dep.kind === 'ice') {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y);
      ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* survey stake — a zoned tile at stage 0 has no building yet, just intent */
  function drawSurveyStake(ctx, t, l, kind) {
    const p = iso(t.x + 0.3, t.y + 0.62);
    ctx.strokeStyle = grey(170, l); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 14); ctx.stroke();
    ctx.fillStyle = ZONE_COLOUR[kind];
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 14); ctx.lineTo(p.x + 9, p.y - 11); ctx.lineTo(p.x, p.y - 8);
    ctx.closePath(); ctx.fill();
  }

  const ZONE_COLOUR = { hab: '#5fc9ff', trade: '#ffb84d', industry: '#c98bff' };

  /* A stable per-tile pick among 3 shape/prop variants, reusing the same
     t.v per-tile seed the terrain speckle already reads — so a block of
     same-kind, same-stage zone tiles doesn't render as identical copies of
     one building, the way a city of dozens of hab pods otherwise would. */
  const variant = t => Math.floor(((t.v * 977) % 1) * 3);

  /* ---------- roads ---------- */

  function drawRoad(ctx, s, t, l, night) {
    const { x, y } = t;
    const railed = t.b.type === 'rail';
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
      const n = S.tileAt(s, x + dx, y + dy);
      return n && (n.b || n.f || n.zone);
    });
    const legs = dirs.length ? dirs : [[1, 0], [-1, 0]];
    const c = iso(x + 0.5, y + 0.5);

    /* Rail stays exposed line-and-ties — visually distinct from the
       pressurised tube below, same as an open-air siding next to a
       sealed corridor. */
    if (railed) {
      ctx.fillStyle = tone('#3a3f4c', l, 1);
      fillDiamond(ctx, x + 0.09, y + 0.09, 0.82, 0.82);
      ctx.strokeStyle = `rgba(214,226,242,${0.5 + l * 0.4})`;
      ctx.lineWidth = 1.6;
      for (const [dx, dy] of legs) {
        const e = iso(x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      }
      ctx.strokeStyle = `rgba(48,42,36,${0.7 * Math.max(l, 0.45)})`; ctx.lineWidth = 2;
      for (const [dx, dy] of legs) {
        const a = iso(x + 0.5 + dx * 0.32 - (dy ? 0.14 : 0), y + 0.5 + dy * 0.32 - (dx ? 0.14 : 0));
        const b2 = iso(x + 0.5 + dx * 0.32 + (dy ? 0.14 : 0), y + 0.5 + dy * 0.32 + (dx ? 0.14 : 0));
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
      }
      return;
    }

    /* Surface road: a raised, pressurised tunnel-tube rather than a painted
       lane — a berm shadow underneath, a lit tube wall on each connected
       leg with periodic ribs, and a dim amber seam light down the centre
       that brightens at night. The 4-directional connectivity check above
       is untouched, so junctions still read exactly as they did before. */
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    fillDiamond(ctx, x + 0.07, y + 0.07, 0.86, 0.86);
    ctx.fillStyle = tone('#8a8478', l, 1);
    fillDiamond(ctx, x + 0.12, y + 0.12, 0.76, 0.76);

    for (const [dx, dy] of legs) {
      const e = iso(x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5);
      const nx = dy ? 0.09 : 0, ny = dx ? 0.09 : 0; // perpendicular offset for the tube walls
      const wallA1 = iso(x + 0.5 + nx, y + 0.5 + ny), wallA2 = iso(x + 0.5 + dx * 0.5 + nx, y + 0.5 + dy * 0.5 + ny);
      const wallB1 = iso(x + 0.5 - nx, y + 0.5 - ny), wallB2 = iso(x + 0.5 + dx * 0.5 - nx, y + 0.5 + dy * 0.5 - ny);
      ctx.strokeStyle = tone('#c9c0a8', l, 1); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(wallA1.x, wallA1.y - 3); ctx.lineTo(wallA2.x, wallA2.y - 3); ctx.stroke();
      ctx.strokeStyle = tone('#5a5548', l, 0.9); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(wallB1.x, wallB1.y - 3); ctx.lineTo(wallB2.x, wallB2.y - 3); ctx.stroke();

      /* ribs, evenly spaced along the run */
      ctx.strokeStyle = `rgba(30,28,24,${0.4 * Math.max(l, 0.5)})`; ctx.lineWidth = 1.1;
      for (let i = 1; i <= 2; i++) {
        const u = i / 3;
        const rp = iso(x + 0.5 + dx * 0.5 * u, y + 0.5 + dy * 0.5 * u);
        const r1 = { x: rp.x + (wallA1.x - wallB1.x) * 0.5, y: rp.y - 3 + (wallA1.y - wallB1.y) * 0.5 };
        const r2 = { x: rp.x - (wallA1.x - wallB1.x) * 0.5, y: rp.y - 3 - (wallA1.y - wallB1.y) * 0.5 };
        ctx.beginPath(); ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.stroke();
      }

      /* seam light down the centre — dim by day, glowing amber at night */
      const sp = iso(x + 0.5 + dx * 0.32, y + 0.5 + dy * 0.32);
      ctx.fillStyle = night ? `rgba(255,196,90,${0.55 + beat(600) * 0.25})` : 'rgba(255,214,150,0.35)';
      ctx.beginPath(); ctx.arc(sp.x, sp.y - 3, night ? 1.6 : 1.1, 0, 7); ctx.fill();
    }

    /* an occasional maintenance hatch, placed by the tile's own seed rather
       than every tile, so the tube reads as infrastructure, not wallpaper */
    if (((t.v * 233) % 1) < 0.1) {
      ctx.fillStyle = tone('#6f6a5c', l, 1);
      ctx.strokeStyle = tone('#c9c0a8', l, 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.rect(c.x - 4, c.y - 3 - 4, 8, 8); ctx.fill(); ctx.stroke();
    }
  }

  /* ---------- agriculture (grow halls) ---------- */

  const HALL_Z = 44;

  function drawField(ctx, f, l, sv) {
    groundShadow(ctx, f.x, f.y, f.w, f.h, HALL_Z, sv);
    contact(ctx, f.x, f.y, f.w, f.h);

    if (f.litNow) {
      const p = iso(f.x + f.w / 2, f.y + f.h / 2);
      const g = ctx.createRadialGradient(p.x, p.y, 6, p.x, p.y, Math.max(f.w, f.h) * TW * 0.55);
      g.addColorStop(0, 'rgba(255,90,190,0.20)');
      g.addColorStop(1, 'rgba(255,90,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(iso(f.x, f.y + f.h).x - TW, iso(f.x, f.y).y - HALL_Z - TH,
        (f.w + f.h) * TW / 2 + TW * 2, (f.w + f.h) * TH / 2 + HALL_Z + TH * 3);
    }

    ctx.fillStyle = f.litNow ? '#2a2130' : grey(60, Math.max(l, 0.5));
    fillDiamond(ctx, f.x, f.y, f.w, f.h);

    for (let ty = 0; ty < f.h; ty++) for (let tx = 0; tx < f.w; tx++) {
      const soil = f.soil;
      const rr = Math.round(126 - 66 * soil), gg = Math.round(120 - 70 * soil), bb = Math.round(112 - 70 * soil);
      ctx.fillStyle = f.dead ? 'rgba(74,66,54,0.9)' : `rgba(${rr},${gg},${bb},0.9)`;
      fillDiamond(ctx, f.x + tx + 0.06, f.y + ty + 0.06, 0.88, 0.88);
      const p = iso(f.x + tx + 0.5, f.y + ty + 0.5);
      if (f.crop && !f.dead) {
        const c = CROPS.find(x => x.id === f.crop);
        const g = Math.max(0.15, f.growth);
        ctx.fillStyle = shade(c.colour, -(1 - f.health) * 60);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 5, TW * 0.15 * g, TH * 0.24 * g, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.dead) {
        ctx.strokeStyle = '#6b5f4c'; ctx.lineWidth = 1.6;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(p.x + i * 3, p.y + 4); ctx.lineTo(p.x + i * 6, p.y - 7); ctx.stroke();
        }
      }
    }

    const glassR = f.litNow ? 'rgba(255,140,210,0.20)' : 'rgba(150,185,220,0.15)';
    const glassL = f.litNow ? 'rgba(220,110,190,0.26)' : 'rgba(120,155,195,0.20)';
    box(ctx, f.x, f.y, f.w, f.h, HALL_Z, '#8fb4d8', l, {
      right: glassR, left: glassL,
      top: f.litNow ? 'rgba(255,150,215,0.17)' : 'rgba(175,205,235,0.13)', noRim: true
    });
    ctx.strokeStyle = f.litNow ? 'rgba(255,160,220,0.75)' : 'rgba(190,210,235,0.5)';
    ctx.lineWidth = 1.6;
    diamond(ctx, f.x, f.y, f.w, f.h, HALL_Z); ctx.stroke();
    diamond(ctx, f.x, f.y, f.w, f.h); ctx.stroke();
    for (const [cx, cy] of [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h]]) {
      const p = iso(cx, cy);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - HALL_Z); ctx.stroke();
    }
  }

  /* ---------- zone buildings (habitation / trade / industry, stage 1-4) ---------- */

  const ZONE_Z = st => 20 + st * 12;

  /* Dome footprint(s) for a zoned tile, in tile-fraction coordinates: one
     centred dome while a tile is still a starter module, a small cluster
     once it's developed enough to read as more than that. Cluster layout
     picked by variant(t) so neighbouring same-stage tiles don't all grow
     identically. The first entry is always the primary dome — the one
     trim (windows, beacons, signage) hangs off. */
  function domeLayout(stage, v) {
    if (stage <= 2) {
      const w = stage === 1 ? 0.52 : 0.64;
      return [{ x: 0.5 - w / 2, y: 0.5 - w / 2, w, h: w }];
    }
    const layouts = [
      [{ x: 0.40, y: 0.36, w: 0.46, h: 0.46 }, { x: 0.04, y: 0.14, w: 0.36, h: 0.36 }, { x: 0.44, y: 0.02, w: 0.32, h: 0.32 }],
      [{ x: 0.34, y: 0.32, w: 0.48, h: 0.48 }, { x: 0.42, y: 0.66, w: 0.34, h: 0.34 }, { x: 0.02, y: 0.44, w: 0.32, h: 0.32 }],
      [{ x: 0.30, y: 0.30, w: 0.44, h: 0.44 }, { x: 0.60, y: 0.10, w: 0.32, h: 0.32 }, { x: 0.10, y: 0.58, w: 0.34, h: 0.34 }]
    ];
    return layouts[v % layouts.length];
  }

  function drawZoneBuilding(ctx, s, t, l, sv, night) {
    const { x, y, zone: z } = t;
    const Z = ZONE_Z(z.stage);
    const v = variant(t);
    groundShadow(ctx, x + 0.08, y + 0.08, 0.84, 0.84, Z, sv);
    contact(ctx, x, y, 1, 1);
    const base = ZONE_COLOUR[z.kind];
    const layout = domeLayout(z.stage, v);
    const shellCol = z.kind === 'hab' ? '#c7cdd9' : z.kind === 'trade' ? '#b8ab95' : '#8f96a3';

    let primary = null;
    layout.forEach((d, i) => {
      const dz = i === 0 ? Z : Z * 0.72;
      const geo = dome(ctx, x + d.x, y + d.y, d.w, d.h, dz, shellCol, l, {
        stroke: grey(140, l), lw: 1, ring: `rgba(${z.kind === 'hab' ? '190,225,255' : z.kind === 'trade' ? '255,214,150' : '210,200,255'},${0.3 + l * 0.28})`
      });
      if (i === 0) primary = { ...geo, z: dz };
    });

    if (z.kind === 'hab') {
      /* window dots ringing the primary dome once it's more than a bare
         shell, brighter and glowing amber at night */
      if (z.stage >= 2) {
        const winCount = 3 + (v % 2);
        for (let i = 0; i < winCount; i++) {
          const ang = (i / winCount) * Math.PI * 2 + v;
          const q = { x: primary.p.x + Math.cos(ang) * primary.rx * 0.72, y: primary.p.y - primary.z * 0.62 + Math.sin(ang) * primary.ry * 0.4 };
          if (night) {
            const gl = ctx.createRadialGradient(q.x, q.y, 1, q.x, q.y, 8);
            gl.addColorStop(0, 'rgba(255,205,110,0.5)'); gl.addColorStop(1, 'rgba(255,205,110,0)');
            ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(q.x, q.y, 8, 0, 7); ctx.fill();
          }
          ctx.fillStyle = '#ffd166';
          ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, 7); ctx.fill();
        }
        /* a thin ground-level walkway to any same-stage-or-further hab
           neighbour — reads as a connected district rather than isolated
           pods once a block has grown in together */
        ctx.strokeStyle = `rgba(160,170,190,${0.35 * Math.max(l, 0.5)})`; ctx.lineWidth = 1.6;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const n = s && S.tileAt(s, x + dx, y + dy);
          if (!n || !n.zone || n.zone.kind !== 'hab' || n.zone.stage < 2) continue;
          const a = iso(x + 0.5 + dx * 0.16, y + 0.5 + dy * 0.16);
          const b = iso(x + 0.5 + dx * 0.84, y + 0.5 + dy * 0.84);
          ctx.beginPath(); ctx.moveTo(a.x, a.y - 2); ctx.lineTo(b.x, b.y - 2); ctx.stroke();
        }
      }
      if (z.stage >= 4) {
        const mast = { x: primary.p.x - primary.rx * 0.3, y: primary.p.y - primary.z };
        ctx.strokeStyle = grey(170, Math.max(l, 0.5)); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(mast.x, mast.y); ctx.lineTo(mast.x, mast.y - 12); ctx.stroke();
        ctx.fillStyle = `rgba(255,110,90,${0.4 + beat(500) * 0.5})`;
        ctx.beginPath(); ctx.arc(mast.x, mast.y - 13, 1.9, 0, 7); ctx.fill();
      }
    } else if (z.kind === 'trade') {
      if (z.stage >= 2) {
        const q = { x: primary.p.x + primary.rx * (v === 2 ? 0.8 : -0.8), y: primary.p.y - primary.z * 0.3 };
        box(ctx, x + (v === 2 ? 0.78 : 0.02), y + 0.62, 0.2, 0.2, Z * 0.32, base, l, { noRim: true });
        if (night) {
          ctx.fillStyle = `rgba(255,184,77,${0.5 + beat(900) * 0.3})`;
          ctx.fillRect(q.x - 14, q.y, 28, 3);
        }
      }
      if (z.stage >= 3) {
        /* a lit marquee sign over the entrance — the exchange floor's
           storefront, distinct from the plain awning glow above */
        const mq = { x: primary.p.x + v * 4 - 6, y: primary.p.y - primary.z - 6 };
        ctx.fillStyle = night ? `rgba(255,209,102,${0.55 + beat(700) * 0.25})` : 'rgba(200,210,225,0.5)';
        ctx.fillRect(mq.x - 10, mq.y, 20, 4);
        /* a loading-dock crate stack at the back corner */
        const cq = iso(x + 0.14, y + 0.86);
        ctx.fillStyle = shade(base, -25);
        ctx.fillRect(cq.x - 6, cq.y - 6, 12, 6);
        ctx.fillStyle = shade(base, -10);
        ctx.fillRect(cq.x - 5, cq.y - 11, 10, 5);
      }
    } else { // industry
      if (z.stage >= 2) {
        ctx.strokeStyle = tone(base, l, 1); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(primary.p.x, primary.p.y - primary.z);
        ctx.lineTo(primary.p.x, primary.p.y - primary.z - 18); ctx.stroke();
      }
      if (z.stage >= 3) {
        /* a second stack, offset by variant so a row of stage-3+ tiles
           doesn't read as one repeated silhouette */
        const p2x = primary.p.x + primary.rx * 0.4 + v * 3, p2y = primary.p.y - primary.z * 0.7;
        ctx.strokeStyle = tone(base, l, 0.75); ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(p2x, p2y); ctx.lineTo(p2x, p2y - 14); ctx.stroke();
        /* a stockpile of raw material at the base, same technique as the
           mining rig's spoil pile */
        const sp = iso(x + 0.85, y + 0.85);
        ctx.fillStyle = shade('#9a9086', -20);
        ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 10, 4.6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#9a9086';
        ctx.beginPath(); ctx.ellipse(sp.x, sp.y - 2.5, 7, 3.4, 0, 0, 7); ctx.fill();
      }
      if (z.stage >= 4) {
        const p = { x: primary.p.x + primary.rx * 0.5, y: primary.p.y - primary.z * 1.1 };
        const flick = 0.5 + beat(180 + v * 70) * 0.5;
        ctx.fillStyle = `rgba(255,140,80,${0.5 * flick})`;
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 6, 4, 8 * flick, 0, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(255,209,102,${0.7 * flick})`;
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 4, 2, 5 * flick, 0, 0, 7); ctx.fill();
      }
    }
  }

  /* ---------- hero / semi-hero / utility single-tile structures ---------- */

  const STRUCT_Z = { command: 54, solar: 34, battery: 32, reactor: 48, isru: 58, miner: 30, spaceport: 96 };

  function drawCommand(ctx, s, t, l, sv, night) {
    const { x, y } = t;
    const Z = STRUCT_Z.command;

    /* regolith-berm skirt, same flattened-ellipse language the zone domes
       use, so the hero structure and the district around it read as one
       consistent colony rather than two different art styles */
    {
      const bp = iso(x + 0.5, y + 0.62);
      ctx.fillStyle = regolith(150, l);
      ctx.beginPath(); ctx.ellipse(bp.x, bp.y, TW * 0.5, TH * 0.46, 0, 0, 7); ctx.fill();
    }
    /* hull */
    box(ctx, x + 0.10, y + 0.26, 0.80, 0.48, Z, '#c7cdd9', l, { stroke: grey(140, l), lw: 1.3 });

    /* crown highlight — reads as a cylinder rather than a crate */
    const crownA = iso(x + 0.14, y + 0.50), crownB = iso(x + 0.86, y + 0.50);
    const cg = ctx.createLinearGradient(crownA.x, crownA.y - Z, crownB.x, crownB.y - Z);
    cg.addColorStop(0, tone('#e4e9f2', l, 1)); cg.addColorStop(0.55, tone('#c9cfdb', l, 1)); cg.addColorStop(1, tone('#9aa1b0', l, 1));
    ctx.strokeStyle = cg; ctx.lineWidth = TH * 0.24; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(crownA.x, crownA.y - Z - 3); ctx.lineTo(crownB.x, crownB.y - Z - 3); ctx.stroke();
    ctx.lineCap = 'butt';

    /* hull ribs */
    ctx.strokeStyle = `rgba(90,100,118,${0.5 * Math.max(l, 0.5)})`; ctx.lineWidth = 1.4;
    for (let i = 1; i < 6; i++) {
      const u = x + 0.10 + 0.80 * i / 6;
      const a = iso(u, y + 0.26), b = iso(u, y + 0.74);
      ctx.beginPath(); ctx.moveTo(a.x, a.y - Z); ctx.lineTo(b.x, b.y - Z); ctx.lineTo(b.x, b.y - Z * 0.35); ctx.stroke();
    }

    /* airlock cap with docking ring and chevrons — same blue-glass viewport
       tint the zone domes use, so the ring language matches city-wide */
    const cap = iso(x + 0.90, y + 0.74);
    ctx.fillStyle = `rgba(190,225,255,${0.5 + l * 0.35})`;
    ctx.beginPath(); ctx.ellipse(cap.x, cap.y - Z * 0.52, TW * 0.075, Z * 0.42, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = grey(120, l); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(cap.x, cap.y - Z * 0.52, TW * 0.075, Z * 0.42, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = night ? '#ffca5f' : tone('#6f7686', l, 1);
    ctx.beginPath(); ctx.ellipse(cap.x, cap.y - Z * 0.50, TW * 0.038, Z * 0.22, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cap.x - 7, cap.y - 4 - i * 4); ctx.lineTo(cap.x, cap.y - 7 - i * 4); ctx.lineTo(cap.x + 7, cap.y - 4 - i * 4);
      ctx.stroke();
    }

    /* portholes down the flank, warm and glowing at night */
    for (let i = 0; i < 5; i++) {
      const u = x + 0.18 + i * 0.14;
      const q = iso(u, y + 0.74);
      const gy = q.y - Z * 0.56;
      if (night) {
        const gl = ctx.createRadialGradient(q.x, gy, 1, q.x, gy, 11);
        gl.addColorStop(0, 'rgba(255,205,110,0.55)'); gl.addColorStop(1, 'rgba(255,205,110,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(q.x, gy, 11, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(q.x, gy, 2.9, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(70,78,94,${Math.max(l, 0.5)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(q.x, gy, 3.6, 0, 7); ctx.stroke();
    }

    /* radiator fins along the spine */
    ctx.strokeStyle = tone('#aeb6c4', l, 0.9); ctx.lineWidth = 2.4;
    for (let i = 0; i < 2; i++) {
      const u = x + 0.34 + i * 0.26;
      const a = iso(u, y + 0.30), b = iso(u, y + 0.70);
      ctx.beginPath(); ctx.moveTo(a.x, a.y - Z - 4); ctx.lineTo(b.x, b.y - Z - 11); ctx.stroke();
    }

    /* dish + dual antenna mast — this is the colony's comms hub, so it gets
       more mast than a farm habitat needs */
    const mast = iso(x + 0.16, y + 0.32);
    ctx.strokeStyle = grey(170, Math.max(l, 0.5)); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(mast.x, mast.y - Z); ctx.lineTo(mast.x, mast.y - Z - 26); ctx.stroke();
    ctx.strokeStyle = tone('#d6dbe6', l, 1); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(mast.x, mast.y - Z - 27, 8, 4, 0, Math.PI, Math.PI * 2.3); ctx.stroke();
    for (const dx of [-1, 1]) {
      const bx = mast.x + dx * 7;
      ctx.beginPath(); ctx.moveTo(mast.x, mast.y - Z - 20); ctx.lineTo(bx, mast.y - Z - 32); ctx.stroke();
      const bt = beat(420 + dx * 90);
      ctx.fillStyle = `rgba(255,110,90,${0.4 + bt * 0.55})`;
      ctx.beginPath(); ctx.arc(bx, mast.y - Z - 33, 2.1, 0, 7); ctx.fill();
    }

    /* handrail */
    ctx.strokeStyle = `rgba(210,220,235,${0.35 * Math.max(l, 0.55)})`; ctx.lineWidth = 1;
    const r1 = iso(x + 0.12, y + 0.86), r2 = iso(x + 0.88, y + 0.86);
    ctx.beginPath(); ctx.moveTo(r1.x, r1.y - 9); ctx.lineTo(r2.x, r2.y - 9); ctx.stroke();
    for (let i = 0; i <= 5; i++) {
      const q = iso(x + 0.12 + i * 0.152, y + 0.86);
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, q.y - 9); ctx.stroke();
    }
  }

  function drawSpaceport(ctx, s, t, l, sv, night) {
    const { x, y } = t;
    const Z = STRUCT_Z.spaceport;

    /* pad slab with a hazard border and a scorch mark at centre */
    ctx.fillStyle = grey(108, l);
    fillDiamond(ctx, x + 0.02, y + 0.02, 0.96, 0.96);
    const pc = iso(x + 0.5, y + 0.5);
    const scorch = ctx.createRadialGradient(pc.x, pc.y, 2, pc.x, pc.y, TW * 0.4);
    scorch.addColorStop(0, 'rgba(20,18,16,0.55)'); scorch.addColorStop(1, 'rgba(20,18,16,0)');
    ctx.fillStyle = scorch;
    ctx.beginPath(); ctx.ellipse(pc.x, pc.y, TW * 0.4, TH * 0.4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
    fillDiamond(ctx, x + 0.06, y + 0.06, 0.88, 0.88, null, ctx.strokeStyle);
    ctx.setLineDash([]);

    /* gantry: two struts, cross braces, a mid platform */
    const gx = x + 0.14;
    for (const dz of [0, 0.62]) {
      const a = iso(gx + dz, y + 0.14), b = iso(gx + dz, y + 0.14);
    }
    const strutA = iso(gx, y + 0.14), strutB = iso(gx + 0.5, y + 0.14);
    ctx.strokeStyle = grey(160, l); ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(strutA.x, strutA.y); ctx.lineTo(strutA.x, strutA.y - Z * 0.92); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(strutB.x, strutB.y); ctx.lineTo(strutB.x, strutB.y - Z * 0.92); ctx.stroke();
    ctx.strokeStyle = grey(130, l); ctx.lineWidth = 1.3;
    for (let i = 1; i <= 4; i++) {
      const fy1 = strutA.y - Z * 0.92 * i / 4.4, fy2 = strutB.y - Z * 0.92 * i / 4.4;
      ctx.beginPath(); ctx.moveTo(strutA.x, fy1); ctx.lineTo(strutB.x, fy2); ctx.stroke();
    }
    const navTop = { x: strutB.x, y: strutB.y - Z * 0.94 };
    ctx.fillStyle = `rgba(255,90,90,${0.4 + beat(360) * 0.55})`;
    ctx.beginPath(); ctx.arc(navTop.x, navTop.y, 2.4, 0, 7); ctx.fill();

    /* fuel tank beside the gantry */
    box(ctx, x + 0.68, y + 0.62, 0.20, 0.20, Z * 0.34, '#c7cdd9', l, { stroke: grey(150, l) });

    /* the rocket, sitting on the pad */
    const bx = x + 0.5, by = y + 0.5;
    const rZ = Z * 0.85;
    box(ctx, bx - 0.09, by - 0.09, 0.18, 0.18, rZ, '#e8ecf2', l, { stroke: grey(150, l), lw: 1.1, noRim: true });
    /* accent stripe */
    ctx.strokeStyle = '#c8443a'; ctx.lineWidth = 3;
    const sA = iso(bx - 0.09, by + 0.09), sB = iso(bx + 0.09, by - 0.09);
    ctx.beginPath(); ctx.moveTo(sA.x, sA.y - rZ * 0.35); ctx.lineTo(sB.x, sB.y - rZ * 0.35); ctx.stroke();
    /* nose cone */
    const top = iso(bx, by);
    ctx.fillStyle = tone('#e8ecf2', l, 1.05);
    ctx.beginPath();
    ctx.moveTo(top.x - 9, top.y - rZ); ctx.lineTo(top.x, top.y - rZ - 22); ctx.lineTo(top.x + 9, top.y - rZ);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = grey(150, l); ctx.lineWidth = 1; ctx.stroke();
    const noseBt = beat(300);
    ctx.fillStyle = `rgba(255,255,255,${0.5 + noseBt * 0.5})`;
    ctx.beginPath(); ctx.arc(top.x, top.y - rZ - 21, 1.8, 0, 7); ctx.fill();
    /* fins */
    ctx.fillStyle = tone('#9aa1b0', l, 1);
    for (const dx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(top.x + dx * 9, top.y - 2); ctx.lineTo(top.x + dx * 17, top.y + 4); ctx.lineTo(top.x + dx * 9, top.y - 10);
      ctx.closePath(); ctx.fill();
    }

    /* cooldown vapour venting */
    if (t.b.cooldown > 0) {
      for (let i = 0; i < 3; i++) {
        const drift = ((Date.now() / 900) + i * 2.1) % 6.28;
        const q = iso(bx + Math.cos(drift) * 0.10, by + Math.sin(drift) * 0.10);
        ctx.fillStyle = `rgba(220,230,240,${0.16 - i * 0.04})`;
        ctx.beginPath(); ctx.ellipse(q.x, q.y - 6 - i * 5, 9 + i * 4, 5 + i * 2, 0, 0, 7); ctx.fill();
      }
      /* instrument plate */
      const plate = iso(gx, y + 0.86);
      ctx.fillStyle = 'rgba(8,10,16,0.8)';
      ctx.fillRect(plate.x - 20, plate.y - 12, 40, 14);
      ctx.strokeStyle = 'rgba(255,209,102,0.5)'; ctx.lineWidth = 1;
      ctx.strokeRect(plate.x - 20, plate.y - 12, 40, 14);
      ctx.fillStyle = '#ffd166'; ctx.font = '9px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center';
      ctx.fillText(t.b.cooldown + 'h', plate.x, plate.y - 2);
    }
  }

  function drawReactor(ctx, s, t, l) {
    const { x, y } = t;
    const Z = STRUCT_Z.reactor;
    ctx.strokeStyle = grey(150, l); ctx.lineWidth = 2.4;
    for (const i of [-1, 1]) {
      const a = iso(x + 0.5 + i * 0.42, y + 0.06), b = iso(x + 0.5 + i * 0.42, y + 0.94);
      ctx.beginPath(); ctx.moveTo(a.x, a.y - 10); ctx.lineTo(b.x, b.y - 10); ctx.stroke();
    }
    box(ctx, x + 0.26, y + 0.26, 0.48, 0.48, Z, '#9aa0ad', l, { stroke: '#ffd166', lw: 1.5 });
    const p = iso(x + 0.5, y + 0.5);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(p.x, p.y - Z, 3.6, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(255,209,102,${0.18 + beat(1400) * 0.1})`;
    ctx.beginPath(); ctx.arc(p.x, p.y - Z, 11, 0, 7); ctx.fill();
  }

  function drawIsru(ctx, s, t, l) {
    const { x, y } = t;
    const Z = STRUCT_Z.isru;
    box(ctx, x + 0.14, y + 0.14, 0.72, 0.72, Z * 0.55, '#8b909d', l);
    box(ctx, x + 0.30, y + 0.30, 0.40, 0.40, Z, '#9aa0ad', l, { stroke: grey(160, l) });
    box(ctx, x + 0.66, y + 0.14, 0.18, 0.18, Z * 0.42, '#7f8593', l, { stroke: grey(150, l), lw: 1 });
    const p = iso(x + 0.5, y + 0.5);
    ctx.fillStyle = 'rgba(200,230,255,0.5)';
    ctx.beginPath(); ctx.arc(p.x, p.y - Z - 3, 3.6, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(200,230,255,0.2)';
    ctx.beginPath(); ctx.arc(p.x, p.y - Z - 10, 7, 0, 7); ctx.fill();
  }

  function drawMiner(ctx, s, t, l) {
    const { x, y } = t;
    const Z = STRUCT_Z.miner;
    /* tracked chassis */
    box(ctx, x + 0.12, y + 0.30, 0.76, 0.40, Z * 0.4, '#7f8593', l, { stroke: grey(140, l), lw: 1.1 });
    /* spoil pile of whatever's under the rig */
    const dep = t.deposit;
    const spoil = dep ? DEPOSITS.find(d => d.id === dep.kind).colour : '#9a9086';
    const p0 = iso(x + 0.22, y + 0.82);
    ctx.fillStyle = shade(spoil, -20);
    ctx.beginPath(); ctx.ellipse(p0.x, p0.y, 13, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = spoil;
    ctx.beginPath(); ctx.ellipse(p0.x, p0.y - 3, 9, 4.5, 0, 0, 7); ctx.fill();
    /* reciprocating drill arm, driven off wall-clock time */
    const pivot = iso(x + 0.68, y + 0.42);
    const ang = -0.35 + Math.sin(Date.now() / 380) * 0.28;
    const len = 26;
    const tip = { x: pivot.x + Math.cos(ang) * len, y: pivot.y - Z * 0.4 - Math.sin(ang + 1.2) * len * 0.6 };
    ctx.strokeStyle = grey(160, l); ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pivot.x, pivot.y - Z * 0.4); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(tip.x, tip.y, 2.4, 0, 7); ctx.fill();
    /* headlight glow at night */
    const cabin = iso(x + 0.3, y + 0.5);
    ctx.fillStyle = tone('#c7cdd9', l, 1);
    ctx.beginPath(); ctx.rect(cabin.x - 6, cabin.y - Z * 0.5, 12, 10); ctx.fill();
    const gl = ctx.createRadialGradient(cabin.x + 8, cabin.y - Z * 0.45, 1, cabin.x + 8, cabin.y - Z * 0.45, 16);
    gl.addColorStop(0, 'rgba(255,255,235,0.5)'); gl.addColorStop(1, 'rgba(255,255,235,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(cabin.x + 8, cabin.y - Z * 0.45, 16, 0, 7); ctx.fill();
  }

  function drawSolar(ctx, s, t, l) {
    const { x, y } = t;
    const Z = STRUCT_Z.solar;
    box(ctx, x + 0.42, y + 0.42, 0.16, 0.16, Z * 0.45, '#8a8f9c', l);
    const tilt = 9;
    const a = iso(x + 0.04, y + 0.04), b = iso(x + 0.96, y + 0.04);
    const c2 = iso(x + 0.96, y + 0.96), d = iso(x + 0.04, y + 0.96);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - Z - tilt); ctx.lineTo(b.x, b.y - Z);
    ctx.lineTo(c2.x, c2.y - Z + tilt); ctx.lineTo(d.x, d.y - Z);
    ctx.closePath();
    ctx.fillStyle = `rgb(${Math.round(26 + 34 * l)},${Math.round(44 + 56 * l)},${Math.round(92 + 88 * l)})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(155,200,250,${0.25 + l * 0.35})`; ctx.lineWidth = 1; ctx.stroke();
    for (let i = 1; i < 4; i++) {
      const u = i / 4;
      const m1 = { x: a.x + (b.x - a.x) * u, y: a.y - Z - tilt + (b.y - a.y + tilt) * u };
      const m2 = { x: d.x + (c2.x - d.x) * u, y: d.y - Z + (c2.y - d.y + tilt) * u };
      ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();
    }
    if (S.isSunlit(s)) {
      const p = iso(x + 0.5, y + 0.5);
      ctx.fillStyle = `rgba(255,255,255,${0.05 + S.sunElevation(s) * 0.16})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - Z - tilt); ctx.lineTo(b.x, b.y - Z); ctx.lineTo(p.x, p.y - Z + 2); ctx.closePath(); ctx.fill();
    }
  }

  function drawBattery(ctx, s, t, l) {
    const { x, y } = t;
    const Z = STRUCT_Z.battery;
    box(ctx, x + 0.14, y + 0.14, 0.72, 0.72, Z, '#7f8593', l, { stroke: grey(170, l), lw: 1.2 });
    const p = iso(x + 0.5, y + 0.5);
    const frac = S.storageCap(s) > 0 ? clamp(s.stored / S.storageCap(s), 0, 1) : 0;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = (i + 1) / 3 <= frac + 0.001 ? '#6ee7a0' : 'rgba(255,255,255,0.14)';
      ctx.fillRect(p.x - 10, p.y - Z + 5 + i * 6, 20, 3.4);
    }
  }

  function drawStruct(ctx, s, t, l, sv, night) {
    const type = t.b.type;
    const Z = STRUCT_Z[type] || 30;
    if (type !== 'spaceport') groundShadow(ctx, t.x + 0.08, t.y + 0.08, 0.84, 0.84, Z, sv);
    contact(ctx, t.x, t.y, 1, 1);
    switch (type) {
      case 'command': return drawCommand(ctx, s, t, l, sv, night);
      case 'spaceport': return drawSpaceport(ctx, s, t, l, sv, night);
      case 'reactor': return drawReactor(ctx, s, t, l);
      case 'isru': return drawIsru(ctx, s, t, l);
      case 'miner': return drawMiner(ctx, s, t, l);
      case 'solar': return drawSolar(ctx, s, t, l);
      case 'battery': return drawBattery(ctx, s, t, l);
    }
  }

  /* ---------- crew and rover traffic (cosmetic, from agents.js) ---------- */

  const GHOST_FILL = 'rgba(198,224,255,0.95)';
  const GHOST_EDGE = 'rgba(104,158,232,1)';
  /* domes and other structures are opaque and now the tallest thing on the
     map — a figure walking behind one has to read as a ghost silhouette
     instead of just vanishing, same trick Lunar Farm uses for its own hab
     modules. Roads and the spaceport pad are open ground, so they don't
     hide anyone; a zoned dome (stage >= 1) does, a grow hall's glass walls
     don't. */
  const AGENT_SEE_THROUGH = { track: 1, rail: 1, spaceport: 1 };
  function agentOccluded(s, ax, ay) {
    const cx = Math.floor(ax), cy = Math.floor(ay);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [2, 0], [0, 2]]) {
      const t = S.tileAt(s, cx + dx, cy + dy);
      if (!t) continue;
      if (t.b && !AGENT_SEE_THROUGH[t.b.type]) return true;
      if (t.zone && t.zone.stage >= 1) return true;
    }
    return false;
  }

  function drawAgent(ctx, a, l, ghost) {
    const p = iso(a.x + 0.5, a.y + 0.5);

    if (ghost) {
      ctx.fillStyle = GHOST_FILL; ctx.strokeStyle = GHOST_EDGE; ctx.lineWidth = 1.3;
      if (a.kind === 'rover') {
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 7, 9, 6, 0, 0, 7); ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 6, 3, 6, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, p.y - 12, 2.5, 0, 7); ctx.fill(); ctx.stroke();
      }
      return;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, a.kind === 'rover' ? 8 : 4, 3, 0, 0, 7); ctx.fill();

    if (a.kind === 'rover') {
      ctx.fillStyle = grey(120, Math.max(l, 0.5));
      ctx.fillRect(p.x - 8, p.y - 4, 16, 4);
      ctx.fillStyle = grey(178, Math.max(l, 0.5));
      ctx.fillRect(p.x - 6, p.y - 10, 12, 6);
      if (a.cargo) { ctx.fillStyle = '#6ee7a0'; ctx.fillRect(p.x - 4, p.y - 13, 8, 3); }
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(p.x + 7, p.y - 7, 1.5, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(20,24,32,0.9)';
      ctx.beginPath(); ctx.arc(p.x - 5, p.y - 1, 1.8, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 5, p.y - 1, 1.8, 0, 7); ctx.fill();
      return;
    }

    /* a suited figure, bobbing as it walks */
    const bob = Math.abs(Math.sin(a.bob)) * 1.5;
    ctx.fillStyle = a.tint;
    ctx.fillRect(p.x - 2, p.y - 8 - bob, 4, 5.5);
    ctx.fillStyle = shade(a.tint === '#e8edf7' ? '#e8edf7' : '#d8c9a8', -40);
    ctx.fillRect(p.x - 2, p.y - 3 - bob, 1.6, 3);
    ctx.fillRect(p.x + 0.4, p.y - 3 - bob, 1.6, 3);
    ctx.fillStyle = a.tint;
    ctx.beginPath(); ctx.arc(p.x, p.y - 10 - bob, 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(90,150,220,0.85)';
    ctx.beginPath(); ctx.arc(p.x + 0.4, p.y - 10.2 - bob, 1.3, 0, 7); ctx.fill();
  }

  /* ---------- viewport culling ---------- */

  function visibleRange(ui, w, h) {
    const corners = [[0, 0], [w, 0], [0, h], [w, h]];
    let xs = [], ys = [];
    for (const [sx, sy] of corners) {
      const wx = (sx - w / 2 - ui.cam.x) / ui.cam.z;
      const wy = (sy - 92 - ui.cam.y) / ui.cam.z;
      xs.push((wx / (TW / 2) + wy / (TH / 2)) / 2);
      ys.push((wy / (TH / 2) - wx / (TW / 2)) / 2);
    }
    const pad = 4;
    return {
      xMin: Math.max(0, Math.floor(Math.min(...xs)) - pad),
      xMax: Math.min(K.COLS - 1, Math.ceil(Math.max(...xs)) + pad),
      yMin: Math.max(0, Math.floor(Math.min(...ys)) - pad),
      yMax: Math.min(K.ROWS - 1, Math.ceil(Math.max(...ys)) + pad)
    };
  }

  /* diagonal (painter's-order) walk of a culled rectangle */
  function walkVisible(range, fn) {
    const { xMin, xMax, yMin, yMax } = range;
    for (let d = xMin + yMin; d <= xMax + yMax; d++) {
      for (let tx = xMin; tx <= xMax; tx++) {
        const ty = d - tx;
        if (ty < yMin || ty > yMax) continue;
        fn(tx, ty);
      }
    }
  }

  /* ---------- map-view overlays ---------- */

  function lerpColour(hexA, hexB, t) {
    t = clamp(t, 0, 1);
    const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
  }

  /* SimCity2000-style overlays: the normal scene keeps rendering underneath
     (drawn earlier in draw()), this is one extra tinted pass on top. Roads
     and land value reuse GRID.serviceSet() directly; Power and Water reach
     are that exact same connectivity algorithm — GRID.networkFrom() — with
     a different set of source tiles, not a second implementation of it.
     Visualisation only: none of this feeds back into the simulation, so a
     layer showing "unreached" never means anything is actually unpowered —
     see the plan notes on why that's a deliberate, safer first cut. */
  function drawOverlay(ctx, s, ui, range) {
    const view = ui.view;
    let touching = null, reach = null;
    if (view === 'roads' || view === 'value') touching = GRID.serviceSet(s);
    else if (view === 'power') reach = GRID.networkFrom(s, t => t.b && ['solar', 'reactor', 'command', 'battery'].includes(t.b.type));
    else if (view === 'water') reach = GRID.networkFrom(s, t => t.b && (t.b.type === 'isru' || t.b.type === 'command'));

    walkVisible(range, (tx, ty) => {
      if (!GRID.inRevealed(s, tx, ty)) return;
      const t = s.map[GRID.idx(tx, ty)];
      let colour = null, alpha = 0.38;
      if (view === 'roads') {
        colour = touching.has(GRID.idx(tx, ty)) ? '#6ee7a0' : '#ff7a68';
      } else if (view === 'power' || view === 'water') {
        const on = reach.has(GRID.idx(tx, ty));
        colour = on ? '#6ee7a0' : '#8a8f9c';
        alpha = on ? 0.3 : 0.2;
      } else if (view === 'value') {
        if (t.t !== 'flat' && t.t !== 'rough') return;
        colour = lerpColour('#3a6ea8', '#ffd166', ZONESYS.landValue(s, touching, t));
      } else if (view === 'density') {
        if (!t.zone) return;
        colour = lerpColour('#3a3f4c', '#ff7a68', t.zone.stage / K.MAX_STAGE);
        alpha = 0.5;
      } else if (view === 'resources') {
        if (!t.deposit) return;
        colour = DEPOSITS.find(d => d.id === t.deposit.kind).colour;
        alpha = 0.22 + t.deposit.richness * 0.45;
      }
      if (!colour) return;
      ctx.globalAlpha = alpha;
      fillDiamond(ctx, tx, ty, 1, 1, colour);
      ctx.globalAlpha = 1;
    });
  }

  /* ---------- frame ---------- */

  function draw(ctx, s, ui) {
    const cv = ctx.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.width / dpr, h = cv.height / dpr;
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    const sun = S.sunElevation(s);
    const night = !S.isSunlit(s);
    const skyTop = night ? '#03040a' : `rgb(${10 + sun * 25},${13 + sun * 30},${22 + sun * 40})`;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, skyTop); grad.addColorStop(1, '#0a0c14');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 90; i++) {
      const rx = (Math.sin(i * 12.9898) * 43758.5453) % 1, ry = (Math.sin(i * 78.233) * 12543.123) % 1;
      ctx.fillRect(((rx < 0 ? rx + 1 : rx)) * w, ((ry < 0 ? ry + 1 : ry)) * h * 0.6, 1.4, 1.4);
    }

    ctx.translate(w / 2, 92);
    ctx.translate(ui.cam.x, ui.cam.y);
    ctx.scale(ui.cam.z, ui.cam.z);

    const light = lightOf(s);
    const sv = sunVec(s);
    const range = visibleRange(ui, w, h);
    const idx = (x, y) => y * K.COLS + x;

    walkVisible(range, (tx, ty) => {
      const t = s.map[idx(tx, ty)];
      if (!GRID.inRevealed(s, tx, ty)) { drawFogTile(ctx, t, light); return; }
      drawTerrainTile(ctx, t, light, sv);
      if (ui.showDeposits !== false && t.deposit && !t.b && !t.zone && !t.f) depositMarker(ctx, t);
    });

    walkVisible(range, (tx, ty) => {
      const t = s.map[idx(tx, ty)];
      if (t.b && (t.b.type === 'track' || t.b.type === 'rail')) drawRoad(ctx, s, t, light, night);
    });

    walkVisible(range, (tx, ty) => {
      const t = s.map[idx(tx, ty)];
      if (!t.zone) return;
      if (t.zone.stage === 0) {
        ctx.fillStyle = tone(ZONE_COLOUR[t.zone.kind], light, 0.32);
        fillDiamond(ctx, tx + 0.05, ty + 0.05, 0.9, 0.9);
        drawSurveyStake(ctx, t, light, t.zone.kind);
      } else {
        drawZoneBuilding(ctx, s, t, light, sv, night);
      }
    });

    for (const f of s.fields) drawField(ctx, f, light, sv);

    walkVisible(range, (tx, ty) => {
      const t = s.map[idx(tx, ty)];
      if (t.b && t.b.type !== 'track' && t.b.type !== 'rail') drawStruct(ctx, s, t, light, sv, night);
    });

    if (A) {
      for (const a of A.all()) {
        if (a.x < range.xMin - 1 || a.x > range.xMax + 1 || a.y < range.yMin - 1 || a.y > range.yMax + 1) continue;
        drawAgent(ctx, a, light, agentOccluded(s, a.x, a.y));
      }
    }

    if (ui.view && ui.view !== 'zones') drawOverlay(ctx, s, ui, range);

    if (ui.selected) fillDiamond(ctx, ui.selected.x, ui.selected.y, 1, 1, null, '#ffffff');
    if (ui.preview) drawPreview(ctx, ui.preview);

    ctx.restore();

    if (night) {
      ctx.fillStyle = 'rgba(4,6,14,0.28)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawPreview(ctx, prev) {
    for (const c of prev.cells) {
      fillDiamond(ctx, c.x + 0.04, c.y + 0.04, 0.92, 0.92,
        c.ok ? 'rgba(95,201,255,0.35)' : 'rgba(255,122,104,0.4)',
        c.ok ? '#5fc9ff' : '#ff7a68');
    }
  }

  window.LC_RENDER = { draw, iso, TW, TH };
})();
