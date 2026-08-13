/* Lunar Metropolis — isometric renderer.

   A 2:1 isometric projection drawn with a painter's algorithm, entirely
   procedural: no sprites, no textures, no external assets. The colour and
   extrusion toolkit is carried over from this repo's other two games, where
   it is proven — what is new here is ELEVATION.

   Every tile carries an integer height. Its top face is lifted on screen by
   h * LEVEL_PX, and wherever a tile stands above its +x or +y neighbour a
   cliff face is drawn down to that neighbour's level. The existing
   back-to-front diagonal walk (walkVisible) is already the correct painter's
   order for this: a tile's cliff faces extend toward the camera, and any
   tile in front of it is drawn later and correctly paints over.

   Tiles are also shaded by their own sun exposure, so permanently shadowed
   crater floors genuinely read as dark ground and peaks of eternal light
   genuinely read as bright — the elevation model showing its work. */

(function () {
  const { K, DEPOSITS } = window.LM_DATA;
  const T = window.LM_TERRAIN;

  const TW = 128, TH = 64;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const iso = (tx, ty) => ({ x: (tx - ty) * (TW / 2), y: (tx + ty) * (TH / 2) });
  const lift = t => t.h * K.LEVEL_PX;

  /* ---------- colour ---------- */

  /* Regolith reads warm grey-tan under direct sun rather than the cool
     blue-grey that spacecraft steel wants — R leads, B trails. */
  function regolith(v, l) {
    const b = clamp(v * l + 16, 0, 255);
    return `rgb(${Math.round(clamp(b * 1.06, 0, 255))},${Math.round(clamp(b * 0.97, 0, 255))},${Math.round(clamp(b * 0.85, 0, 255))})`;
  }
  function grey(v, l) {
    const b = clamp(v * l, 0, 255);
    return `rgb(${Math.round(b)},${Math.round(b * 0.995)},${Math.round(b * 1.035)})`;
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${Math.round(clamp(((n >> 16) & 255) + amt, 0, 255))},${
      Math.round(clamp(((n >> 8) & 255) + amt, 0, 255))},${
      Math.round(clamp((n & 255) + amt, 0, 255))})`;
  }

  /* How brightly a given tile is lit. Sun exposure dominates: a floor that
     never sees the sun sits near the ambient floor no matter the time of
     day, which is the entire point of the shadow model. The top of the
     range stops short of 1.0 deliberately — regolith is a dark material
     (about 12% reflectance) and letting fully-lit ground saturate to white
     destroys the surface texture and the sense of a mid-tone landscape. */
  const litness = t => 0.28 + 0.62 * (t.sun === undefined ? 1 : t.sun);

  /* ---------- primitives ---------- */

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
  function fillDiamond(ctx, tx, ty, w, h, fill, stroke, dz) {
    diamond(ctx, tx, ty, w, h, dz);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  /* ---------- terrain ---------- */

  /* The two cliff walls a raised tile shows the camera. In this projection
     the +x edge falls away to the lower right and the +y edge to the lower
     left, so those are the only two that can ever be visible. Each is drawn
     down to whatever its neighbour's height is — or to the ground at the
     map edge, so the world reads as a solid slab rather than floating. */
  function cliffs(ctx, s, t, l) {
    const z = lift(t);
    const a = iso(t.x, t.y), b = iso(t.x + 1, t.y), c = iso(t.x + 1, t.y + 1), d = iso(t.x, t.y + 1);

    const east = T.tileAt(s, t.x + 1, t.y);
    const eDrop = (east ? t.h - east.h : t.h) * K.LEVEL_PX;
    if (eDrop > 0) {
      ctx.fillStyle = regolith(150, l);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - z); ctx.lineTo(c.x, c.y - z);
      ctx.lineTo(c.x, c.y - z + eDrop); ctx.lineTo(b.x, b.y - z + eDrop);
      ctx.closePath(); ctx.fill();
    }

    const south = T.tileAt(s, t.x, t.y + 1);
    const sDrop = (south ? t.h - south.h : t.h) * K.LEVEL_PX;
    if (sDrop > 0) {
      ctx.fillStyle = regolith(104, l);          // the shaded wall
      ctx.beginPath();
      ctx.moveTo(d.x, d.y - z); ctx.lineTo(c.x, c.y - z);
      ctx.lineTo(c.x, c.y - z + sDrop); ctx.lineTo(d.x, d.y - z + sDrop);
      ctx.closePath(); ctx.fill();
    }

    /* a bright lip along the crest catches the low sun and is what makes
       terraces legible against each other at a glance */
    if ((eDrop > 0 || sDrop > 0) && l > 0.34) {
      ctx.strokeStyle = `rgba(255,248,232,${0.10 + l * 0.20})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (eDrop > 0) { ctx.moveTo(b.x, b.y - z); ctx.lineTo(c.x, c.y - z); }
      if (sDrop > 0) { ctx.moveTo(d.x, d.y - z); ctx.lineTo(c.x, c.y - z); }
      ctx.stroke();
    }
  }

  function drawTile(ctx, s, t) {
    const l = litness(t);
    const z = lift(t);

    cliffs(ctx, s, t, l);

    if (t.t === 'skylight') {
      fillDiamond(ctx, t.x, t.y, 1, 1, regolith(150, l), null, z);
      fillDiamond(ctx, t.x + 0.08, t.y + 0.08, 0.84, 0.84, '#04060b', null, z);
      fillDiamond(ctx, t.x + 0.08, t.y + 0.08, 0.84, 0.84, null, grey(190, l), z);
      return;
    }

    const base = t.t === 'rough' ? 208 : t.t === 'boulder' ? 214 : 226;
    fillDiamond(ctx, t.x, t.y, 1, 1, regolith(base, l), null, z);

    /* one stable mottled patch per tile, so ground reads as undulating
       rather than as a flat painted plane */
    {
      const lighter = ((t.v * 331) % 1) < 0.62;
      const q = iso(t.x + 0.2 + ((t.v * 811) % 60) / 100, t.y + 0.2 + ((t.v * 457) % 60) / 100);
      ctx.fillStyle = lighter ? 'rgba(255,250,236,0.055)' : 'rgba(0,0,0,0.045)';
      ctx.beginPath(); ctx.ellipse(q.x, q.y - z, TW * 0.22, TH * 0.22, 0, 0, 7); ctx.fill();
    }

    const n = t.t === 'rough' ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const u = ((t.v * 977 + i * 131) % 100) / 100;
      const w = ((t.v * 613 + i * 271) % 100) / 100;
      const q = iso(t.x + u * 0.86 + 0.07, t.y + w * 0.86 + 0.07);
      ctx.fillStyle = ((t.v * 100 + i) % 2) < 1 ? 'rgba(0,0,0,0.11)' : 'rgba(255,250,240,0.12)';
      ctx.fillRect(q.x - 1, q.y - 1 - z, 2, 2);
    }

    if (t.t === 'boulder') {
      for (let i = 0; i < 2; i++) {
        const u = 0.24 + ((t.v * 700 + i * 150) % 52) / 100;
        const w = 0.24 + ((t.v * 430 + i * 90) % 52) / 100;
        const p = iso(t.x + u, t.y + w);
        const r = 6 + ((t.v * 100 + i * 33) % 6);
        ctx.fillStyle = regolith(176, l);
        ctx.beginPath(); ctx.ellipse(p.x, p.y - z - r * 0.5, r, r * 0.86, 0, 0, 7); ctx.fill();
        ctx.fillStyle = regolith(248, l);
        ctx.beginPath(); ctx.ellipse(p.x - r * 0.3, p.y - z - r * 0.8, r * 0.45, r * 0.38, 0, 0, 7); ctx.fill();
      }
    }
  }

  function depositMarker(ctx, t) {
    const p = iso(t.x + 0.5, t.y + 0.5);
    const z = lift(t);
    const dep = t.deposit;
    const c = DEPOSITS.find(d => d.id === dep.kind).colour;
    ctx.globalAlpha = 0.26 + dep.richness * 0.4;
    ctx.beginPath(); ctx.arc(p.x, p.y - z, 5 + dep.richness * 5, 0, Math.PI * 2);
    ctx.fillStyle = c; ctx.fill();
    if (dep.kind === 'ice') {
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - 4, p.y - z); ctx.lineTo(p.x + 4, p.y - z);
      ctx.moveTo(p.x, p.y - z - 4); ctx.lineTo(p.x, p.y - z + 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- viewport culling ---------- */

  /* Padded generously on the far side: a tall tile is drawn well above its
     flat screen position, so tiles that project from below the viewport can
     still be visible. MAX_H * LEVEL_PX of lift is about seven tiles of
     diagonal, so ten is a safe margin. */
  function visibleRange(ui, w, h) {
    const corners = [[0, 0], [w, 0], [0, h], [w, h]];
    const xs = [], ys = [];
    for (const [sx, sy] of corners) {
      const wx = (sx - w / 2 - ui.cam.x) / ui.cam.z;
      const wy = (sy - 92 - ui.cam.y) / ui.cam.z;
      xs.push((wx / (TW / 2) + wy / (TH / 2)) / 2);
      ys.push((wy / (TH / 2) - wx / (TW / 2)) / 2);
    }
    const pad = 10;
    return {
      xMin: Math.max(0, Math.floor(Math.min(...xs)) - 2),
      xMax: Math.min(K.COLS - 1, Math.ceil(Math.max(...xs)) + pad),
      yMin: Math.max(0, Math.floor(Math.min(...ys)) - 2),
      yMax: Math.min(K.ROWS - 1, Math.ceil(Math.max(...ys)) + pad)
    };
  }

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

  /* ---------- data-map overlays ---------- */

  function lerpColour(hexA, hexB, t) {
    t = clamp(t, 0, 1);
    const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
  }

  /* Data maps read as data, not as a wash over the landscape — SimCity 2000's
     own overlays substantially replace the view rather than tinting it, and
     at low alpha a height map over already-tan regolith is unreadable. The
     terraces and cliff geometry still show through underneath, which is what
     keeps the map legible as terrain. */
  function drawOverlay(ctx, s, ui, range) {
    walkVisible(range, (tx, ty) => {
      const t = s.map[T.idx(tx, ty)];
      let colour = null, alpha = 0.8;
      if (ui.view === 'height') {
        colour = lerpColour('#16233a', '#ffe9b0', t.h / K.MAX_H);
      } else if (ui.view === 'sun') {
        colour = lerpColour('#101a2e', '#ffd166', t.sun);
      } else if (ui.view === 'deposits') {
        if (!t.deposit) return;
        colour = DEPOSITS.find(d => d.id === t.deposit.kind).colour;
        alpha = 0.25 + t.deposit.richness * 0.5;
      }
      if (!colour) return;
      ctx.globalAlpha = alpha;
      fillDiamond(ctx, tx, ty, 1, 1, colour, null, lift(t));
      ctx.globalAlpha = 1;
    });
  }

  /* ---------- frame ---------- */

  function draw(ctx, s, ui) {
    const cv = ctx.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.width / dpr, h = cv.height / dpr;
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#05070e'); grad.addColorStop(1, '#0a0c14');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 110; i++) {
      const rx = (Math.sin(i * 12.9898) * 43758.5453) % 1, ry = (Math.sin(i * 78.233) * 12543.123) % 1;
      ctx.fillRect(((rx < 0 ? rx + 1 : rx)) * w, ((ry < 0 ? ry + 1 : ry)) * h * 0.55, 1.4, 1.4);
    }

    ctx.translate(w / 2, 92);
    ctx.translate(ui.cam.x, ui.cam.y);
    ctx.scale(ui.cam.z, ui.cam.z);

    const range = visibleRange(ui, w, h);

    walkVisible(range, (tx, ty) => {
      const t = s.map[T.idx(tx, ty)];
      drawTile(ctx, s, t);
      if (ui.showDeposits !== false && t.deposit) depositMarker(ctx, t);
    });

    if (ui.view && ui.view !== 'terrain') drawOverlay(ctx, s, ui, range);

    if (ui.hover) {
      const t = T.tileAt(s, ui.hover.x, ui.hover.y);
      if (t) fillDiamond(ctx, t.x, t.y, 1, 1, 'rgba(120,200,255,0.18)', '#7fd0ff', lift(t));
    }
    if (ui.selected) {
      const t = T.tileAt(s, ui.selected.x, ui.selected.y);
      if (t) fillDiamond(ctx, t.x, t.y, 1, 1, null, '#ffffff', lift(t));
    }

    ctx.restore();
  }

  /* Screen point -> tile, accounting for elevation. A raised tile is drawn
     lifted, so the naive flat inverse projection lands short of it. Walking
     candidate heights from the top down and taking the first whose flat
     footprint contains the point picks the tile the player actually sees —
     without this, clicking a hilltop selects the ground behind it. */
  function pickTile(s, ui, cssW, sx, sy) {
    const wx = (sx - cssW / 2 - ui.cam.x) / ui.cam.z;
    const wyRaw = (sy - 92 - ui.cam.y) / ui.cam.z;
    for (let hh = K.MAX_H; hh >= 0; hh--) {
      const wy = wyRaw + hh * K.LEVEL_PX;
      const tx = Math.round((wx / (TW / 2) + wy / (TH / 2)) / 2);
      const ty = Math.round((wy / (TH / 2) - wx / (TW / 2)) / 2);
      const t = T.tileAt(s, tx, ty);
      if (t && t.h === hh) return t;
    }
    const wy = wyRaw;
    const tx = Math.round((wx / (TW / 2) + wy / (TH / 2)) / 2);
    const ty = Math.round((wy / (TH / 2) - wx / (TW / 2)) / 2);
    return T.tileAt(s, tx, ty);
  }

  window.LM_RENDER = { draw, iso, pickTile, TW, TH };
})();
