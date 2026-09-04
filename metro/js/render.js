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
  const { K, DEPOSITS, ZONES, BUILDINGS } = window.LM_DATA;
  const T = window.LM_TERRAIN, G = window.LM_GRID;

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

  /* ---------- detail tiers and the moving sun ----------

     Frame context. Set once at the top of draw() and read by everything it
     calls, rather than threaded through twenty signatures. Single-threaded
     by construction — there is exactly one draw in flight at a time. */
  const LOD_FAR = 0, LOD_MID = 1, LOD_NEAR = 2;
  const FR = { lod: LOD_MID, az: 0 };

  /* Zoomed out, a full map is 16,384 tiles and every one of them was paying
     for a mottle ellipse, eight speckle rects and a full window grid that
     landed on less than a pixel. Tiers let the far view get cheaper AND the
     near view get richer at the same time. */
  const lodFor = z => z < 0.5 ? LOD_FAR : z < 1.15 ? LOD_MID : LOD_NEAR;

  /* THE SUN MOVES — but not the way it would on Earth, and this is the one
     place the setting really asserts itself.

     At a polar site the sun does not rise and set. It tracks around the
     horizon at a very low elevation over the 29.5-day cycle, which is
     exactly why the peaks of eternal light and the permanently shadowed
     floors exist at all. So the honest animation is the sun's AZIMUTH
     sweeping a full turn each month: how much light a tile gets barely
     changes, but the DIRECTION everything is lit from swings right round,
     and the shadows crawl with it.

     That also keeps faith with the terrain model. `t.sun` is a static
     raycast averaged over eight directions and remains the authority on how
     much light a tile receives — a crater floor stays dark and a rim stays
     bright all month. Only the shading direction is animated. A global
     "lunar night" dimming would have been wrong here twice over: wrong for a
     polar site, and it would have contradicted the sun model.

     (K.LUNAR_CYCLE and K.HOURS_PER_DAY were declared in data.js from the
     start and read by nothing until now.) */
  function sunAzimuth(s) {
    const d = s && s.day ? s.day : 0;
    const phase = ((d % K.LUNAR_CYCLE) + K.LUNAR_CYCLE) % K.LUNAR_CYCLE / K.LUNAR_CYCLE;
    return phase * Math.PI * 2;
  }

  /* How lit a vertical face is, from the compass direction its outward normal
     points in tile space. Never reaches zero: vacuum has no air to scatter
     light, but the regolith itself bounces plenty, so shadowed faces read as
     dim rather than black. */
  const EAST = 0, SOUTH = Math.PI / 2;
  const faceLight = n => 0.32 + 0.48 * Math.max(0, Math.cos(n - FR.az));

  /* Which way a contact shadow falls, in screen pixels — directly away from
     the sun. Small, because the light is low and the shadows are long but
     the contact patch is what sells the object as standing ON something. */
  function shadowOff() {
    const a = FR.az + Math.PI;
    const tx = Math.cos(a), ty = Math.sin(a);
    return { x: (tx - ty) * (TW / 2) * 0.06, y: (tx + ty) * (TH / 2) * 0.06 };
  }

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

    /* Both walls take their brightness from where the sun currently is, so
       over a month the lit side of every terrace swings round the compass.
       Previously east was always the bright wall and south always the dark
       one, which made the relief read as a fixed engraving. */
    const east = T.tileAt(s, t.x + 1, t.y);
    const eDrop = (east ? t.h - east.h : t.h) * K.LEVEL_PX;
    if (eDrop > 0) {
      ctx.fillStyle = regolith(230 * faceLight(EAST), l);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - z); ctx.lineTo(c.x, c.y - z);
      ctx.lineTo(c.x, c.y - z + eDrop); ctx.lineTo(b.x, b.y - z + eDrop);
      ctx.closePath(); ctx.fill();
    }

    const south = T.tileAt(s, t.x, t.y + 1);
    const sDrop = (south ? t.h - south.h : t.h) * K.LEVEL_PX;
    if (sDrop > 0) {
      ctx.fillStyle = regolith(230 * faceLight(SOUTH), l);
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

    /* Everything below here is surface texture. At the far tier it lands on
       fractions of a pixel across sixteen thousand tiles, so it is simply not
       drawn — this is most of what makes the zoomed-out view expensive. */
    if (FR.lod === LOD_FAR) return;

    /* one stable mottled patch per tile, so ground reads as undulating
       rather than as a flat painted plane */
    {
      const lighter = ((t.v * 331) % 1) < 0.62;
      const q = iso(t.x + 0.2 + ((t.v * 811) % 60) / 100, t.y + 0.2 + ((t.v * 457) % 60) / 100);
      ctx.fillStyle = lighter ? 'rgba(255,250,236,0.055)' : 'rgba(0,0,0,0.045)';
      ctx.beginPath(); ctx.ellipse(q.x, q.y - z, TW * 0.22, TH * 0.22, 0, 0, 7); ctx.fill();
    }

    /* Grit density follows the tier: a handful mid-range, a real scatter when
       you are close enough to see individual stones. */
    const n = (t.t === 'rough' ? 8 : 5) * (FR.lod === LOD_NEAR ? 3 : 1);
    for (let i = 0; i < n; i++) {
      const u = ((t.v * 977 + i * 131) % 100) / 100;
      const w = ((t.v * 613 + i * 271) % 100) / 100;
      const q = iso(t.x + u * 0.86 + 0.07, t.y + w * 0.86 + 0.07);
      ctx.fillStyle = ((t.v * 100 + i) % 2) < 1 ? 'rgba(0,0,0,0.11)' : 'rgba(255,250,240,0.12)';
      ctx.fillRect(q.x - 1, q.y - 1 - z, 2, 2);
    }

    /* Crop circles. Pressed into the ground, read by nothing else in the
       game, and the only trace the harmless half of the invasion deck
       leaves behind. */
    if (t.pattern) {
      ctx.strokeStyle = `rgba(214,236,255,${0.22 + Math.min(3, t.pattern) * 0.13})`;
      ctx.lineWidth = 1.6;
      const c = iso(t.x + 0.5, t.y + 0.5);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - z, TW * 0.34, TH * 0.34, 0, 0, 7);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,230,255,0.10)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - z, TW * 0.30, TH * 0.30, 0, 0, 7);
      ctx.fill();
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

  /* ---------- built structures ---------- */

  function tone(hex, l, mul) {
    const n = parseInt(hex.slice(1), 16);
    const f = l * mul;
    return `rgb(${Math.round(clamp(((n >> 16) & 255) * f, 0, 255))},${
      Math.round(clamp(((n >> 8) & 255) * f, 0, 255))},${
      Math.round(clamp((n & 255) * f, 0, 255))})`;
  }

  /* An extruded box standing on ground already lifted to baseZ. */
  function box(ctx, tx, ty, w, h, hz, col, l, baseZ, opts) {
    const o = opts || {};
    const b = iso(tx + w, ty), c = iso(tx + w, ty + h), d = iso(tx, ty + h);
    const z0 = baseZ, z1 = baseZ + hz;

    /* Contact shadow: what stops a tower looking pasted onto the ground.
       Skipped at the far tier, where it lands on a couple of pixels. */
    if (!o.noShadow && FR.lod > LOD_FAR && hz > 4) {
      const so = shadowOff();
      const mid = iso(tx + w / 2, ty + h / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath();
      ctx.ellipse(mid.x + so.x * hz * 0.06, mid.y - z0 + so.y * hz * 0.06,
                  w * TW * 0.36, h * TH * 0.36, 0, 0, 7);
      ctx.fill();
    }

    ctx.fillStyle = o.right || tone(col, l, faceLight(EAST));
    ctx.beginPath();
    ctx.moveTo(b.x, b.y - z0); ctx.lineTo(c.x, c.y - z0);
    ctx.lineTo(c.x, c.y - z1); ctx.lineTo(b.x, b.y - z1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = o.left || tone(col, l, faceLight(SOUTH));
    ctx.beginPath();
    ctx.moveTo(d.x, d.y - z0); ctx.lineTo(c.x, c.y - z0);
    ctx.lineTo(c.x, c.y - z1); ctx.lineTo(d.x, d.y - z1);
    ctx.closePath(); ctx.fill();
    if (!o.noTop) {
      ctx.fillStyle = o.top || tone(col, l, 1.0);
      diamond(ctx, tx, ty, w, h, z1); ctx.fill();
    }
    if (o.stroke) {
      ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1;
      diamond(ctx, tx, ty, w, h, z1); ctx.stroke();
    }
  }

  /* A pressurised dome: regolith berm, shell layers standing in for
     curvature, and a glazed viewport ring. */
  function dome(ctx, tx, ty, w, h, hz, col, l, baseZ, ring) {
    const p = iso(tx + w / 2, ty + h / 2);
    const rx = w * (TW / 2) * 0.9, ry = h * (TH / 2) * 0.9;
    ctx.fillStyle = regolith(140, l);
    ctx.beginPath(); ctx.ellipse(p.x, p.y - baseZ + TH * 0.05, rx * 1.2, ry * 1.2, 0, 0, 7); ctx.fill();
    for (const ly of [{ f: 0, rf: 1, sh: 0.55 }, { f: 0.5, rf: 0.78, sh: 0.84 }, { f: 1, rf: 0.48, sh: 1.08 }]) {
      ctx.fillStyle = tone(col, l, ly.sh);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - baseZ - hz * ly.f, rx * ly.rf, ry * ly.rf, 0, 0, 7);
      ctx.fill();
    }
    ctx.strokeStyle = ring || `rgba(190,225,255,${0.3 + l * 0.3})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - baseZ - hz * 0.6, rx * 0.66, ry * 0.66, 0, 0, 7); ctx.stroke();
  }

  /* Transit tube: a raised, ribbed, pressurised corridor. Legs are drawn
     only toward neighbours that actually continue the network, so junctions
     and dead ends read correctly. */
  function drawTube(ctx, s, t, l) {
    const z = lift(t);
    const c = iso(t.x + 0.5, t.y + 0.5);
    ctx.fillStyle = regolith(120, l);
    fillDiamond(ctx, t.x + 0.16, t.y + 0.16, 0.68, 0.68, regolith(150, l), null, z);
    for (const [dx, dy] of G.DIRS) {
      const n = G.tileAt(s, t.x + dx, t.y + dy);
      if (!n || !((n.b && (n.b.type === 'tube')) || (n.zone && n.zone.stage > 0))) continue;
      const e = iso(t.x + 0.5 + dx * 0.5, t.y + 0.5 + dy * 0.5);
      const nz = lift(n);
      ctx.strokeStyle = tone('#cfc6ae', l, 1); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(c.x, c.y - z - 3); ctx.lineTo(e.x, e.y - (z + nz) / 2 - 3); ctx.stroke();
      ctx.strokeStyle = tone('#6d6858', l, 1); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(c.x, c.y - z - 6); ctx.lineTo(e.x, e.y - (z + nz) / 2 - 6); ctx.stroke();
    }
    ctx.fillStyle = tone('#e6dcc0', l, 1);
    ctx.beginPath(); ctx.arc(c.x, c.y - z - 4, 3.2, 0, 7); ctx.fill();
  }

  /* Power conduit: slim pylons carrying a catenary between them. */
  function drawConduit(ctx, s, t, l) {
    const z = lift(t);
    const c = iso(t.x + 0.5, t.y + 0.5);
    ctx.strokeStyle = grey(150, Math.max(l, 0.5)); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(c.x, c.y - z); ctx.lineTo(c.x, c.y - z - 15); ctx.stroke();
    ctx.strokeStyle = `rgba(120,220,255,${0.35 + l * 0.4})`; ctx.lineWidth = 1.2;
    for (const [dx, dy] of G.DIRS) {
      const n = G.tileAt(s, t.x + dx, t.y + dy);
      if (!n) continue;
      const conducts = (n.b && ['conduit', 'solar', 'reactor', 'o2'].includes(n.b.type)) || (n.zone && n.zone.stage > 0);
      if (!conducts) continue;
      const e = iso(t.x + 0.5 + dx * 0.5, t.y + 0.5 + dy * 0.5);
      ctx.beginPath(); ctx.moveTo(c.x, c.y - z - 14); ctx.lineTo(e.x, e.y - (z + lift(n)) / 2 - 12); ctx.stroke();
    }
  }

  function drawPlant(ctx, s, t, l) {
    const z = lift(t), type = t.b.type;
    if (type === 'solar') {
      /* the panel is tilted and its brightness tracks the tile's own sun
         exposure, so an array on a shadowed floor visibly reads as dead */
      box(ctx, t.x + 0.42, t.y + 0.42, 0.16, 0.16, 9, '#8a8f9c', l, z, { noTop: true });
      const a = iso(t.x + 0.06, t.y + 0.06), b = iso(t.x + 0.94, t.y + 0.06);
      const c2 = iso(t.x + 0.94, t.y + 0.94), d = iso(t.x + 0.06, t.y + 0.94);
      const tilt = 8, Z = z + 20;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - Z - tilt); ctx.lineTo(b.x, b.y - Z);
      ctx.lineTo(c2.x, c2.y - Z + tilt); ctx.lineTo(d.x, d.y - Z);
      ctx.closePath();
      const g = 0.25 + t.sun * 0.75;
      ctx.fillStyle = `rgb(${Math.round(22 + 30 * g)},${Math.round(40 + 62 * g)},${Math.round(86 + 96 * g)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(155,200,250,${0.2 + t.sun * 0.5})`; ctx.lineWidth = 1; ctx.stroke();
      return;
    }
    if (type === 'reactor') {
      box(ctx, t.x + 0.22, t.y + 0.22, 0.56, 0.56, 26, '#9aa0ad', l, z, { stroke: '#ffd166', lw: 1.4 });
      const p = iso(t.x + 0.5, t.y + 0.5);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(p.x, p.y - z - 26, 3.4, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,209,102,0.16)';
      ctx.beginPath(); ctx.arc(p.x, p.y - z - 26, 11, 0, 7); ctx.fill();
      return;
    }
    if (type === 'o2') {
      dome(ctx, t.x + 0.14, t.y + 0.14, 0.72, 0.72, 22, '#9fd8c4', l, z, 'rgba(190,255,235,0.6)');
      const p = iso(t.x + 0.5, t.y + 0.5);
      ctx.fillStyle = 'rgba(200,255,235,0.55)';
      ctx.beginPath(); ctx.arc(p.x, p.y - z - 24, 3.2, 0, 7); ctx.fill();
      return;
    }

    /* Civic buildings. Each keeps its service's colour so a district can be
       read at a glance, with a small rooftop mark for what it does. */
    const SVC = { depot: '#ff9f6e', medbay: '#ff7a9c', training: '#8fd0ff',
                  lab: '#c98bff', biodome: '#6ee7a0' };
    if (SVC[type]) {
      const col = SVC[type];
      if (type === 'biodome') {
        /* glazed, and planted — the one civic building you can see into */
        dome(ctx, t.x + 0.12, t.y + 0.12, 0.76, 0.76, 20, '#7fcf9a', l, z, 'rgba(190,255,210,0.7)');
        const p = iso(t.x + 0.5, t.y + 0.5);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.6;
          ctx.fillStyle = 'rgba(70,180,110,0.85)';
          ctx.beginPath();
          ctx.ellipse(p.x + Math.cos(a) * 11, p.y - z - 9 + Math.sin(a) * 5, 3.4, 2.4, 0, 0, 7);
          ctx.fill();
        }
        return;
      }
      box(ctx, t.x + 0.18, t.y + 0.18, 0.64, 0.64, 20, '#b6bdc9', l, z,
        { stroke: grey(140, l), lw: 1, top: tone(col, l, 0.62) });
      const p = iso(t.x + 0.5, t.y + 0.5);
      ctx.fillStyle = col;
      if (type === 'medbay') {                       // a cross
        ctx.fillRect(p.x - 6, p.y - z - 22, 12, 3.4);
        ctx.fillRect(p.x - 1.7, p.y - z - 26, 3.4, 11);
      } else if (type === 'training') {              // a stack of decks
        for (let i = 0; i < 3; i++) ctx.fillRect(p.x - 7 + i, p.y - z - 20 - i * 3.4, 14 - i * 2, 2.2);
      } else if (type === 'lab') {                   // a dish
        ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(p.x, p.y - z - 23, 8, 4, 0, Math.PI, Math.PI * 2.25); ctx.stroke();
      } else {                                       // depot: a beacon
        ctx.beginPath(); ctx.arc(p.x, p.y - z - 23, 3, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(255,159,110,${0.25 + beatPulse() * 0.35})`;
        ctx.beginPath(); ctx.arc(p.x, p.y - z - 23, 9, 0, 7); ctx.fill();
      }
    }
  }

  /* wall-clock pulse, so beacons stay alive even while the sim is paused */
  const beatPulse = () => (Math.sin(Date.now() / 520) + 1) / 2;

  /* Zone buildings.

     Four architectural languages, one per era, because a city that looks
     identical from its first shelter to its last tower has no visible arc.
     An Outpost is bermed cans; a Settlement is proper viewported domes; a
     Colony is dome clusters and mid-rise; a Metropolis is towers with
     window grids, spires and skyways. Low density stays low throughout —
     the contrast between the two is what gives a lunar city a downtown
     rather than uniform sprawl. */

  const ZONE_RING = {
    hab: '190,225,255', trade: '255,214,150', industry: '210,200,255'
  };

  /* stable per-tile variant so a block of identical stage/era tiles does not
     render as one building repeated */
  const variant = t => Math.floor(((t.v * 977) % 1) * 3);

  function drawZoneBuilding(ctx, s, t, l, era) {
    const z0 = lift(t), zn = t.zone;
    const spec = ZONES.find(x => x.id === zn.kind);
    const col = spec.colour;
    const stage = zn.stage;
    const v = variant(t);
    const ring = `rgba(${ZONE_RING[zn.kind]},0.55)`;
    const snatched = window.LM_INVASION ? window.LM_INVASION.isSnatched(s, t) : false;

    if (stage === 0) {                       // zoned, nothing built yet
      ctx.globalAlpha = 0.5;
      fillDiamond(ctx, t.x + 0.08, t.y + 0.08, 0.84, 0.84, tone(col, l, 0.42), tone(col, l, 0.9), z0);
      ctx.globalAlpha = 1;
      return;
    }

    /* The two special districts get their own architecture — neither should
       read as "housing painted a different colour". */
    if (zn.kind === 'military') return drawMilitary(ctx, s, t, l, z0, stage, v);
    if (zn.kind === 'launch') return drawLaunch(ctx, s, t, l, z0, stage, v);

    if (zn.density === 'low' || era === 0) {
      /* Outpost cans and low-density domes. At the earliest era even a
         high-density plot is only a hut — the city has not learned to
         build upward yet. */
      if (era === 0) {
        box(ctx, t.x + 0.26, t.y + 0.26, 0.48, 0.48, 10 + stage * 4, '#b3aa98', l, z0,
          { stroke: grey(130, l), lw: 1 });
        const bp = iso(t.x + 0.5, t.y + 0.5);
        ctx.fillStyle = regolith(140, l);     // regolith berm heaped against it
        ctx.beginPath(); ctx.ellipse(bp.x, bp.y - z0 + 3, TW * 0.34, TH * 0.34, 0, 0, 7); ctx.fill();
        ctx.fillStyle = tone(col, l, 0.8);
        ctx.beginPath(); ctx.arc(bp.x, bp.y - z0 - 10 - stage * 4, 2.2, 0, 7); ctx.fill();
        return;
      }
      dome(ctx, t.x + 0.14, t.y + 0.14, 0.72, 0.72, 12 + stage * 8, '#c7cdd9', l, z0, ring);
      if (era >= 2) {                         // lit viewports once the colony matures
        const p = iso(t.x + 0.5, t.y + 0.5);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + v;
          ctx.fillStyle = `rgba(255,209,120,${0.5 + l * 0.35})`;
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(a) * 12, p.y - z0 - 12 + Math.sin(a) * 6, 1.8, 0, 7);
          ctx.fill();
        }
      }
      return;
    }

    /* ---- high density ---- */
    const hz = era >= 3 ? 20 + stage * 24 : 14 + stage * 13;
    box(ctx, t.x + 0.2, t.y + 0.2, 0.6, 0.6, hz, era >= 3 ? '#c3cad8' : '#b9c0cc', l, z0,
      { stroke: grey(140, l), lw: 1, top: tone(col, l, 0.5) });

    if (era >= 3) {
      /* Metropolis: a real window grid up the shaft rather than a few bands,
         plus a setback crown and a beacon — this is the skyline.

         Window rows double at the near tier, and the lit fraction varies per
         building and per row, so a downtown stops reading as one facade
         stamped out fifty times. */
      const dense = FR.lod === LOD_NEAR;
      const rows = (2 + stage * 2) * (dense ? 2 : 1);
      if (FR.lod > LOD_FAR) for (let r = 1; r <= rows; r++) {
        const wy = z0 + hz * (r / (rows + 1));
        for (let c = 0; c < 3; c++) {
          /* deterministic per building, row and column — a given window is
             either lit or dark and stays that way, rather than flickering */
          const on = ((t.v * 7919 + r * 131 + c * 17) % 100) / 100 > 0.28;
          const u = 0.28 + c * 0.22;
          const q = iso(t.x + u, t.y + 0.8);
          /* A snatched district reads wrong before you have worked out why:
             every window in it is lit the same sickly green. */
          ctx.fillStyle = on ? (snatched ? `rgba(150,255,170,${0.35 + l * 0.4})`
                                         : `rgba(255,214,140,${0.30 + l * 0.4})`)
                             : `rgba(40,52,74,${0.35 + l * 0.25})`;
          ctx.fillRect(q.x - 1.6, q.y - wy - 2.4, 3.2, dense ? 2.2 : 3.4);
        }
      }
      box(ctx, t.x + 0.3, t.y + 0.3, 0.4, 0.4, 14, '#d5dbe6', l, z0 + hz,
        { stroke: grey(150, l), lw: 1 });
      const cp = iso(t.x + 0.5, t.y + 0.5);
      ctx.strokeStyle = grey(180, Math.max(l, 0.5)); ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cp.x, cp.y - z0 - hz - 14); ctx.lineTo(cp.x, cp.y - z0 - hz - 14 - (8 + v * 4));
      ctx.stroke();
      ctx.fillStyle = `rgba(255,110,90,${0.4 + beatPulse() * 0.5})`;
      ctx.beginPath(); ctx.arc(cp.x, cp.y - z0 - hz - 23 - v * 4, 2, 0, 7); ctx.fill();

      /* Skyways. Only between neighbours that are also tall, and only
         toward +x/+y so each link is drawn exactly once. */
      ctx.strokeStyle = `rgba(210,225,245,${0.35 + l * 0.35})`; ctx.lineWidth = 3.4;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const n = s && T.tileAt(s, t.x + dx, t.y + dy);
        if (!n || !n.zone || n.zone.density !== 'high' || n.zone.stage < 3) continue;
        const nz = lift(n) + 20 + n.zone.stage * 24;
        const a = iso(t.x + 0.5 + dx * 0.3, t.y + 0.5 + dy * 0.3);
        const b = iso(t.x + 0.5 + dx * 0.7, t.y + 0.5 + dy * 0.7);
        const yA = a.y - (z0 + hz) * 0.72, yB = b.y - nz * 0.72;
        ctx.beginPath(); ctx.moveTo(a.x, yA); ctx.lineTo(b.x, yB); ctx.stroke();
      }
      return;
    }

    /* Settlement and Colony: banded windows, and a dome cap once clustered */
    ctx.strokeStyle = `rgba(255,209,120,${0.30 + l * 0.35})`; ctx.lineWidth = 1.1;
    for (let i = 1; i <= stage; i++) {
      const wy = z0 + hz * (i / (stage + 1));
      const a = iso(t.x + 0.2, t.y + 0.8), b = iso(t.x + 0.8, t.y + 0.8);
      ctx.beginPath(); ctx.moveTo(a.x, a.y - wy); ctx.lineTo(b.x, b.y - wy); ctx.stroke();
    }
    if (era >= 2 && stage >= 2) {
      dome(ctx, t.x + 0.28, t.y + 0.28, 0.44, 0.44, 9, '#d5dbe6', l, z0 + hz, ring);
      /* radiator fins along the flank — the Colony-era tell */
      ctx.strokeStyle = tone('#aeb6c4', l, 0.9); ctx.lineWidth = 2;
      const f1 = iso(t.x + 0.22, t.y + 0.5), f2 = iso(t.x + 0.78, t.y + 0.5);
      ctx.beginPath();
      ctx.moveTo(f1.x, f1.y - z0 - hz * 0.6); ctx.lineTo(f2.x, f2.y - z0 - hz * 0.6);
      ctx.stroke();
    }
  }

  /* ---- the special districts ---- */

  /* Low, hard, buried. A garrison on the Moon is not a parade ground — it is
     revetments and hardened sheds under a regolith blanket, which is also the
     only shielding anyone gets out here. */
  function drawMilitary(ctx, s, t, l, z0, stage, v) {
    const p = iso(t.x + 0.5, t.y + 0.5);
    /* graded apron */
    fillDiamond(ctx, t.x + 0.04, t.y + 0.04, 0.92, 0.92, regolith(196, l), null, z0);
    /* blast revetment walls along two sides */
    ctx.fillStyle = regolith(150 * (0.6 + faceLight(EAST) * 0.5), l);
    box(ctx, t.x + 0.06, t.y + 0.06, 0.88, 0.14, 7, '#8a8f78', l, z0, { noShadow: true });
    box(ctx, t.x + 0.06, t.y + 0.06, 0.14, 0.88, 7, '#8a8f78', l, z0, { noShadow: true });

    /* hardened sheds, more of them as the base grows in */
    for (let i = 0; i < stage; i++) {
      const u = 0.30 + (i % 2) * 0.30, w = 0.32 + Math.floor(i / 2) * 0.28;
      box(ctx, t.x + u, t.y + w, 0.22, 0.22, 9 + (i === 0 ? 4 : 0), '#7d846e', l, z0,
        { stroke: grey(110, l), lw: 1 });
    }
    if (FR.lod === LOD_FAR) return;

    /* a mast with a slow red navigation light, and the star that marks it */
    ctx.strokeStyle = grey(150, Math.max(l, 0.45)); ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p.x + 16, p.y - z0 - 4); ctx.lineTo(p.x + 16, p.y - z0 - 26);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,90,70,${0.35 + beatPulse() * 0.55})`;
    ctx.beginPath(); ctx.arc(p.x + 16, p.y - z0 - 28, 2, 0, 7); ctx.fill();

    if (FR.lod === LOD_NEAR && stage >= 2) {
      ctx.fillStyle = `rgba(220,235,200,${0.35 + l * 0.4})`;
      ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('★', p.x - 14, p.y - z0 - 10);
      ctx.textAlign = 'start';
    }
  }

  /* A pad, a gantry, and the scorch ring around it. */
  function drawLaunch(ctx, s, t, l, z0, stage, v) {
    const p = iso(t.x + 0.5, t.y + 0.5);
    /* blast-scarred apron — the dust this thing throws is a real mechanic */
    fillDiamond(ctx, t.x + 0.02, t.y + 0.02, 0.96, 0.96, regolith(178, l), null, z0);
    ctx.fillStyle = `rgba(30,22,18,${0.30 + 0.10 * stage})`;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - z0, TW * 0.34, TH * 0.34, 0, 0, 7); ctx.fill();

    /* the pad itself, raised on a plinth */
    box(ctx, t.x + 0.3, t.y + 0.3, 0.4, 0.4, 5, '#9aa1b0', l, z0, { stroke: grey(140, l), lw: 1 });

    /* gantry: taller with each stage, with a vehicle standing on the pad
       once the complex is properly built out */
    const gh = 14 + stage * 11;
    box(ctx, t.x + 0.32, t.y + 0.62, 0.1, 0.1, gh, '#b0b7c4', l, z0 + 5, { noShadow: true });
    ctx.strokeStyle = grey(160, Math.max(l, 0.4)); ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const q = iso(t.x + 0.37, t.y + 0.67);
      ctx.beginPath();
      ctx.moveTo(q.x - 5, q.y - z0 - 5 - gh * i / 4);
      ctx.lineTo(q.x + 7, q.y - z0 - 5 - gh * i / 4);
      ctx.stroke();
    }
    if (stage >= 2) {
      /* a launcher on the pad: tapered body and a flare of light beneath */
      const c = iso(t.x + 0.5, t.y + 0.45);
      ctx.fillStyle = tone('#e8edf7', l, 0.95);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - z0 - 5 - gh * 1.15);
      ctx.lineTo(c.x + 5, c.y - z0 - 5 - gh * 0.35);
      ctx.lineTo(c.x - 5, c.y - z0 - 5 - gh * 0.35);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = tone('#ff9f6e', l, 1);
      ctx.fillRect(c.x - 5, c.y - z0 - 5 - gh * 0.5, 10, 2.4);
    }
    if (FR.lod === LOD_FAR) return;
    /* fuel farm: a couple of spheres off to one side */
    for (let i = 0; i < 2; i++) {
      const q = iso(t.x + 0.72, t.y + 0.24 + i * 0.22);
      ctx.fillStyle = tone('#cfd6e2', l, 0.85 - i * 0.1);
      ctx.beginPath(); ctx.arc(q.x, q.y - z0 - 6, 4.2, 0, 7); ctx.fill();
    }
  }

  /* ---- wonders ---- */

  function drawWonder(ctx, s, t, l) {
    const z = lift(t), type = t.b.type;
    if (type === 'megadome') {
      /* a vast glazed shell over the tube mouth, ringed by a service collar */
      const p = iso(t.x + 0.5, t.y + 0.5);
      ctx.fillStyle = regolith(150, l);
      ctx.beginPath(); ctx.ellipse(p.x, p.y - z + 4, TW * 0.62, TH * 0.62, 0, 0, 7); ctx.fill();
      for (const ly of [{ f: 0, rf: 1, sh: 0.5 }, { f: 0.45, rf: 0.8, sh: 0.78 },
                        { f: 0.8, rf: 0.55, sh: 1.02 }, { f: 1, rf: 0.28, sh: 1.15 }]) {
        ctx.fillStyle = tone('#8fd8c8', l, ly.sh);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - z - 46 * ly.f, TW * 0.55 * ly.rf, TH * 0.55 * ly.rf, 0, 0, 7);
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(200,255,240,${0.4 + l * 0.4})`; ctx.lineWidth = 1.4;
      /* Meridian ribs: each is the same arc seen at a different angle, so the
         x-radius is a cosine. It must be an absolute value — past a quarter
         turn the cosine goes negative, and canvas throws on a negative radius
         rather than ignoring it, which takes the whole draw loop down. */
      for (let i = 0; i < 4; i++) {
        const rx = Math.abs(Math.cos((i / 4) * Math.PI)) * TW * 0.5;
        if (rx < 0.5) continue;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - z - 20, rx, TH * 0.5, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(255,240,190,${0.5 + beatPulse() * 0.4})`;
      ctx.beginPath(); ctx.arc(p.x, p.y - z - 50, 3.4, 0, 7); ctx.fill();
      return;
    }
    if (type === 'massdriver') {
      /* a launch rail running away along the ridge, on trestles */
      const p = iso(t.x + 0.5, t.y + 0.5);
      box(ctx, t.x + 0.1, t.y + 0.3, 0.8, 0.4, 16, '#9aa1b0', l, z, { stroke: grey(150, l), lw: 1.2 });
      ctx.strokeStyle = grey(200, Math.max(l, 0.5)); ctx.lineWidth = 3;
      const a = iso(t.x - 2.6, t.y + 0.5), b = iso(t.x + 3.6, t.y + 0.5);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - z - 14); ctx.lineTo(b.x, b.y - z - 30);
      ctx.stroke();
      ctx.strokeStyle = grey(140, l); ctx.lineWidth = 1.4;
      for (let i = -2; i <= 3; i++) {
        const q = iso(t.x + i, t.y + 0.5);
        const yTop = q.y - z - 14 - ((i + 2.6) / 6.2) * 16;
        ctx.beginPath(); ctx.moveTo(q.x, q.y - z); ctx.lineTo(q.x, yTop); ctx.stroke();
      }
      ctx.fillStyle = `rgba(120,220,255,${0.5 + beatPulse() * 0.45})`;
      ctx.beginPath(); ctx.arc(b.x, b.y - z - 30, 3.2, 0, 7); ctx.fill();
      return;
    }

    const p = iso(t.x + 0.5, t.y + 0.5);

    if (type === 'elevator') {
      /* The tether runs off the top of the screen, because that is what a
         space elevator does — the anchor is the only part you can draw. */
      box(ctx, t.x + 0.24, t.y + 0.24, 0.52, 0.52, 26, '#aab2c2', l, z,
        { stroke: grey(160, l), lw: 1.2 });
      for (let i = 0; i < 4; i++) {            // guy anchors splayed out
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const q = iso(t.x + 0.5 + Math.cos(a) * 0.62, t.y + 0.5 + Math.sin(a) * 0.62);
        ctx.strokeStyle = grey(130, l); ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y - z); ctx.lineTo(p.x, p.y - z - 30); ctx.stroke();
      }
      const grad = ctx.createLinearGradient(p.x, p.y - z - 26, p.x, p.y - z - 640);
      grad.addColorStop(0, `rgba(214,232,255,${0.55 + l * 0.35})`);
      grad.addColorStop(0.55, 'rgba(190,220,255,0.30)');
      grad.addColorStop(1, 'rgba(170,210,255,0)');
      ctx.strokeStyle = grad; ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - z - 26); ctx.lineTo(p.x, p.y - z - 640); ctx.stroke();
      /* climbers riding the ribbon */
      for (let i = 0; i < 3; i++) {
        const climb = ((Date.now() / 5200 + i / 3) % 1);
        ctx.fillStyle = `rgba(255,236,180,${0.85 * (1 - climb)})`;
        ctx.fillRect(p.x - 2.4, p.y - z - 30 - climb * 580, 4.8, 6);
      }
      return;
    }

    if (type === 'eiffel') {
      /* A wrought lattice, drawn absurdly tall because at one sixth of a
         gravity it can be. Four splayed legs meeting in a spire. */
      const H = 190;
      ctx.strokeStyle = tone('#c8b48a', l, 0.95); ctx.lineWidth = 2.4;
      const legs = [[-0.34, -0.34], [0.34, -0.34], [0.34, 0.34], [-0.34, 0.34]];
      const feet = legs.map(([dx, dy]) => iso(t.x + 0.5 + dx, t.y + 0.5 + dy));
      for (const f of feet) {
        ctx.beginPath();
        ctx.moveTo(f.x, f.y - z);
        ctx.quadraticCurveTo(f.x * 0.35 + p.x * 0.65, f.y - z - H * 0.45,
                             p.x, p.y - z - H);
        ctx.stroke();
      }
      /* the arch and the platforms */
      ctx.lineWidth = 1.6;
      for (const frac of [0.22, 0.46, 0.72]) {
        const w = (1 - frac) * 28;
        ctx.beginPath();
        ctx.moveTo(p.x - w, p.y - z - H * frac);
        ctx.lineTo(p.x + w, p.y - z - H * frac);
        ctx.stroke();
      }
      if (FR.lod > LOD_FAR) {
        ctx.strokeStyle = `rgba(255,226,150,${0.30 + l * 0.3})`; ctx.lineWidth = 1;
        for (const frac of [0.30, 0.55]) {
          const w = (1 - frac) * 26;
          for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(p.x + i * w / 2.5, p.y - z - H * frac);
            ctx.lineTo(p.x, p.y - z - H * (frac + 0.16));
            ctx.stroke();
          }
        }
      }
      ctx.fillStyle = `rgba(255,150,90,${0.45 + beatPulse() * 0.5})`;
      ctx.beginPath(); ctx.arc(p.x, p.y - z - H - 4, 2.6, 0, 7); ctx.fill();
      return;
    }

    if (type === 'telescope') {
      /* Wire mesh slung across the crater floor, with a receiver on cables
         above the centre — the LCRT proposal, more or less. */
      ctx.fillStyle = `rgba(150,170,190,${0.20 + l * 0.2})`;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - z, TW * 0.62, TH * 0.62, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(190,215,240,${0.35 + l * 0.35})`; ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - z, TW * 0.62 * (i / 3.4), TH * 0.62 * (i / 3.4), 0, 0, 7);
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - z);
        ctx.lineTo(p.x + Math.cos(a) * TW * 0.62, p.y - z + Math.sin(a) * TH * 0.62);
        ctx.stroke();
      }
      ctx.strokeStyle = grey(150, Math.max(l, 0.4)); ctx.lineWidth = 1.2;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(p.x + sx * TW * 0.5, p.y - z);
        ctx.lineTo(p.x, p.y - z - 34); ctx.stroke();
      }
      ctx.fillStyle = tone('#cfd6e2', l, 1);
      ctx.beginPath(); ctx.arc(p.x, p.y - z - 34, 5, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(200,140,255,${0.4 + beatPulse() * 0.45})`;
      ctx.beginPath(); ctx.arc(p.x, p.y - z - 40, 2, 0, 7); ctx.fill();
      return;
    }

    if (type === 'heliostat') {
      /* A ring of steerable mirrors throwing light down the slope. */
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const q = iso(t.x + 0.5 + Math.cos(a) * 0.42, t.y + 0.5 + Math.sin(a) * 0.42);
        ctx.strokeStyle = grey(140, l); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(q.x, q.y - z); ctx.lineTo(q.x, q.y - z - 12); ctx.stroke();
        ctx.fillStyle = tone('#dff0ff', Math.max(l, 0.7), 1);
        ctx.beginPath();
        ctx.moveTo(q.x - 6, q.y - z - 12);
        ctx.lineTo(q.x + 6, q.y - z - 16);
        ctx.lineTo(q.x + 6, q.y - z - 24);
        ctx.lineTo(q.x - 6, q.y - z - 20);
        ctx.closePath(); ctx.fill();
      }
      /* the beam they all throw at the tower in the middle */
      const glow = ctx.createRadialGradient(p.x, p.y - z - 26, 0, p.x, p.y - z - 26, 46);
      glow.addColorStop(0, `rgba(255,246,205,${0.55 + beatPulse() * 0.2})`);
      glow.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(p.x, p.y - z - 26, 46, 0, 7); ctx.fill();
      box(ctx, t.x + 0.42, t.y + 0.42, 0.16, 0.16, 34, '#e6d9b0', l, z, { noShadow: true });
      return;
    }

    if (type === 'arena') {
      /* A bowl: outer ring, raked seating, and an open floor people fly in. */
      ctx.fillStyle = regolith(180, l);
      ctx.beginPath(); ctx.ellipse(p.x, p.y - z, TW * 0.72, TH * 0.72, 0, 0, 7); ctx.fill();
      for (const ly of [{ r: 0.68, h: 26, c: '#b9c0cc' }, { r: 0.52, h: 18, c: '#cdd4e0' }]) {
        ctx.fillStyle = tone(ly.c, l, faceLight(SOUTH) + 0.16);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - z - ly.h, TW * ly.r, TH * ly.r, 0, 0, Math.PI);
        ctx.fill();
        ctx.fillStyle = tone(ly.c, l, 1);
        ctx.beginPath(); ctx.ellipse(p.x, p.y - z - ly.h, TW * ly.r, TH * ly.r, 0, 0, 7); ctx.fill();
      }
      ctx.fillStyle = tone('#6ee7a0', l, 0.75);
      ctx.beginPath(); ctx.ellipse(p.x, p.y - z - 20, TW * 0.36, TH * 0.36, 0, 0, 7); ctx.fill();
      if (FR.lod > LOD_FAR) {
        for (let i = 0; i < 8; i++) {          // floodlight masts around the rim
          const a = (i / 8) * Math.PI * 2;
          const q = iso(t.x + 0.5 + Math.cos(a) * 0.62, t.y + 0.5 + Math.sin(a) * 0.62);
          ctx.strokeStyle = grey(150, l); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(q.x, q.y - z - 8); ctx.lineTo(q.x, q.y - z - 30); ctx.stroke();
          ctx.fillStyle = `rgba(255,244,205,${0.55 + l * 0.3})`;
          ctx.beginPath(); ctx.arc(q.x, q.y - z - 31, 2, 0, 7); ctx.fill();
        }
      }
      return;
    }

    if (type === 'arcology') {
      /* A stepped tower built to leave: hull, ring decks, and a lit throat at
         the base where the ships go out from. */
      const H = 150;
      for (let i = 0; i < 4; i++) {
        const w = 0.62 - i * 0.11;
        const o = (1 - w) / 2;
        box(ctx, t.x + o, t.y + o, w, w, H / 4, '#b6c2d4', l, z + i * (H / 4),
          { stroke: grey(150, l), lw: 1, noShadow: i > 0 });
      }
      if (FR.lod > LOD_FAR) {
        ctx.fillStyle = `rgba(255,224,160,${0.35 + l * 0.35})`;
        for (let r = 1; r <= 10; r++) {
          for (let c = -1; c <= 1; c++) {
            const q = iso(t.x + 0.5 + c * 0.16, t.y + 0.82);
            ctx.fillRect(q.x - 1.4, q.y - z - H * (r / 11) - 2, 2.8, 3);
          }
        }
      }
      /* the throat, and a departing ship on its way out */
      const glow = ctx.createRadialGradient(p.x, p.y - z - 12, 0, p.x, p.y - z - 12, 30);
      glow.addColorStop(0, `rgba(150,225,255,${0.5 + beatPulse() * 0.3})`);
      glow.addColorStop(1, 'rgba(150,225,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(p.x, p.y - z - 12, 30, 0, 7); ctx.fill();
      const out = (Date.now() / 6400) % 1;
      ctx.fillStyle = `rgba(255,240,200,${0.9 * (1 - out)})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - z - H - 10 - out * 260, 3.4 * (1 - out * 0.6), 6 * (1 - out * 0.6), 0, 0, 7);
      ctx.fill();
      return;
    }
  }

  /* ---- the deep arcologies ----

     Every other structure in this renderer extrudes UPWARD: box() raises the
     +x and +y outer faces off the ground, dome() stacks shrinking ellipses
     above it. These go the other way, and a hole needs the inverse primitive.

     What makes a pit read at all in a 2:1 isometric projection is that a ring
     drawn both SMALLER and LOWER leaves a crescent of its predecessor showing
     along the top — and that stack of crescents IS the far interior wall,
     receding away from the camera. Depth is therefore carried entirely by
     what you can see on the far side of the bore, which is exactly what you
     see standing at the edge of a real shaft: the near wall is beneath you.

     The whole descent is clipped to the mouth. That is not tidiness. Without
     it a deep bore spills below its own tile and floats over whatever is in
     front of it — and on a crater floor the tile in front is usually LOWER,
     so it cannot paint over the spill the way flat ground would. Clipping
     makes a hole a hole whatever the relief around it, and it is also what
     lets the Core Arcology's chamber widen as it descends: the rock above
     correctly hides the overhang.

     Ring spacing is depth * f^0.72 rather than linear, so near rings are far
     apart and far ones bunch together. That is foreshortening, and it buys an
     apparent depth several times what the same pixels spent linearly would.

     THE MOUTH HAS TO BE WIDE, and that is geometry rather than taste. Clipped
     to the mouth, a ring whose top arc has descended past the mouth's own
     bottom edge is cut away entirely — so the visible depth of a bore can
     never exceed roughly the mouth's vertical radius, which in a 2:1
     projection is a quarter of its width. A one-tile mouth therefore cannot
     show more than about twenty pixels of shaft no matter what depth it is
     given, and reads as a dish rather than a hole.

     That is also true of a real shaft seen from this elevation: stand at the
     edge of a narrow bore and the near rim hides the bottom. The answer is
     the same in both cases — make the opening wider. Each of these already
     demands a 3x3 or 5x5 pad, so a mouth that spans its own pad is honest as
     well as legible, and it stops a megastructure reading as a manhole. */

  const TAU = Math.PI * 2;

  function ring(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.4, rx), Math.max(0.3, ry), 0, 0, TAU);
  }

  /* Lit galleries on the FAR half of one ring only. The near half is on the
     camera's own side of the bore; drawing windows there would put lit rooms
     in mid-air over the void. */
  function galleries(ctx, sp, g, cx, dim) {
    const n = sp.windows;
    if (!n) return;
    ctx.fillStyle = 'rgba(' + sp.winRGB + ',' + (0.34 + dim * 0.52).toFixed(3) + ')';
    for (let k = 0; k < n; k++) {
      const a = Math.PI + (k + 0.5) / n * Math.PI;
      const x = cx + Math.cos(a) * g.rx * 0.88;
      const y = g.y + sp.ledge * 0.6 + Math.sin(a) * g.ry * 0.88;
      ctx.fillRect(x - 1.5, y - 1.3, 3, 2.6);
    }
  }

  /* Chords across the opening at rim height. A line crossing a void is the
     single strongest cue that there IS a void — more convincing than any
     amount of shading, because nothing else in the scene has anything to
     cross. Each gets a drop shadow onto the wall below it. */
  function spanBridges(ctx, cx, cy, RX, RY, n, l, col) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI + Math.PI * 0.18;
      const dx = Math.cos(a) * RX, dy = Math.sin(a) * RY;
      ctx.strokeStyle = 'rgba(0,0,0,0.42)'; ctx.lineWidth = 4.4;
      ctx.beginPath();
      ctx.moveTo(cx + dx, cy + dy + 3); ctx.lineTo(cx - dx, cy - dy + 3); ctx.stroke();
      ctx.strokeStyle = tone(col, Math.max(l, 0.62), 1); ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cx + dx, cy + dy); ctx.lineTo(cx - dx, cy - dy); ctx.stroke();
    }
  }

  /* A ring walkway with spurs, for a bore whose centre has something in it.
     Straight chords are the better depth cue in general — they cross the void
     — but four of them meeting over the Core's suspended lamp put a dark X on
     the brightest and most important thing in the structure. */
  function spanRing(ctx, cx, cy, RX, RY, l, col) {
    ctx.strokeStyle = 'rgba(0,0,0,0.40)'; ctx.lineWidth = 4.6;
    ring(ctx, cx, cy + 3, RX * 0.62, RY * 0.62); ctx.stroke();
    ctx.strokeStyle = tone(col, Math.max(l, 0.62), 1); ctx.lineWidth = 2.6;
    ring(ctx, cx, cy, RX * 0.62, RY * 0.62); ctx.stroke();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.25;
      ctx.strokeStyle = 'rgba(0,0,0,0.40)'; ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * RX * 0.62, cy + Math.sin(a) * RY * 0.62 + 3);
      ctx.lineTo(cx + Math.cos(a) * RX, cy + Math.sin(a) * RY + 3);
      ctx.stroke();
      ctx.strokeStyle = tone(col, Math.max(l, 0.62), 1); ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * RX * 0.62, cy + Math.sin(a) * RY * 0.62);
      ctx.lineTo(cx + Math.cos(a) * RX, cy + Math.sin(a) * RY);
      ctx.stroke();
    }
  }

  function rimCollar(ctx, cx, cy, RX, RY, l, col) {
    ctx.strokeStyle = tone(col, Math.max(l, 0.55), 1); ctx.lineWidth = 3.6;
    ring(ctx, cx, cy, RX, RY); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,248,232,' + (0.12 + l * 0.24).toFixed(3) + ')';
    ctx.lineWidth = 1.1;
    ring(ctx, cx, cy - 1.8, RX * 0.985, RY * 0.985); ctx.stroke();
  }

  /* The bore itself. Returns its geometry so the caller can hang a
     superstructure off the rim without recomputing any of it. */
  /* The band between the FAR arcs of two rings — the only part of a bore's
     interior this camera can actually see.

     Filling each ring as a whole ellipse was the first attempt and it is
     wrong: the lower half of any such ellipse is the NEAR wall, the one on
     the camera's own side of the hole, which you are looking over rather than
     at. Painting it turned the bottom of every bore into a flat grey plate
     and buried the floor under it. Drawing only the far crescent leaves the
     near side as the void it should be, and the shaft reads as open. */
  function crescent(ctx, cx, ay, arx, ary, by, brx, bry) {
    ctx.beginPath();
    ctx.ellipse(cx, ay, Math.max(0.4, arx), Math.max(0.3, ary), 0, Math.PI, TAU);
    ctx.ellipse(cx, by, Math.max(0.4, brx), Math.max(0.3, bry), 0, TAU, Math.PI, true);
    ctx.closePath();
  }

  function shaft(ctx, s, t, l, sp) {
    const z = lift(t);
    const p = iso(t.x + 0.5, t.y + 0.5);
    const cy = p.y - z;
    const RX = TW * 0.5 * sp.mouth, RY = TH * 0.5 * sp.mouth;

    /* How far it has dug drives BOTH how many galleries there are and how
       deep the hole goes, so a young arcology is a shallow scrape and a
       finished one is a chasm. Watching it sink is most of the payoff.

       Depth is DERIVED, not chosen. The clip makes RY a hard ceiling: anything
       that has descended past the mouth's bottom edge is cut away entirely,
       and the first thing to go is the floor and its glow — which is the one
       part of a bore that has to be seen, because it is the central space the
       whole structure is built around. The floor is a disc of radius
       RY*taper(1) centred at the full depth, so keeping it in view means
       depth + RY*taper(1) <= RY. Letting its near half be clipped is fine and
       in fact correct (the near rim really does hide it), hence the 0.55.

       Deriving this rather than hand-tuning a constant per structure means a
       taper can be changed freely without silently amputating the bottom of
       its own shaft — which is exactly what happened to all four of these the
       first time round. */
    const prog = clamp(sp.prog, 0, 1);
    const N = Math.max(2, Math.round(2 + prog * (sp.rings - 2)));
    const maxDepth = RY * (1 - sp.taper(1) * 0.55) * 0.88;
    const depth = maxDepth * (sp.deep === undefined ? 1 : sp.deep) * (0.26 + 0.74 * prog);

    /* graded apron and spoil banked around the mouth */
    ctx.fillStyle = regolith(128, l);
    ring(ctx, p.x, cy + TH * 0.07, RX * 1.20, RY * 1.20); ctx.fill();
    ctx.fillStyle = regolith(162, l);
    ring(ctx, p.x, cy + TH * 0.02, RX * 1.08, RY * 1.08); ctx.fill();

    const geo = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const r = Math.max(0.06, sp.taper(f));
      geo.push({ f, rx: RX * r, ry: RY * r, y: cy + depth * Math.pow(f, 0.72) });
    }

    ctx.save();
    ring(ctx, p.x, cy, RX, RY); ctx.clip();

    /* Void first, and everything after it only ever adds the far side back.
       Whatever is left black is genuinely the part of the shaft the near rim
       is standing in front of. */
    ctx.fillStyle = '#05060a';
    ctx.fillRect(p.x - RX - 2, cy - RY - 2, RX * 2 + 4, RY * 2 + depth + 120);

    for (let i = 0; i < geo.length; i++) {
      const g = geo[i], nx = geo[i + 1];
      const dim = 1 - g.f * 0.78;                       // light falls off downward

      /* the gallery deck: a horizontal surface seen from above, so it catches
         what light there is and is the brightest thing at that depth */
      if (sp.ledge > 0) {
        ctx.fillStyle = tone(sp.terrace, Math.max(l, 0.66) * dim, 1);
        crescent(ctx, p.x, g.y, g.rx, g.ry, g.y + sp.ledge, g.rx, g.ry);
        ctx.fill();
      }
      /* and the wall dropping from it to the next deck down */
      if (nx) {
        ctx.fillStyle = tone(sp.wall, Math.max(l, 0.55) * dim, 0.74);
        crescent(ctx, p.x, g.y + sp.ledge, g.rx, g.ry, nx.y, nx.rx, nx.ry);
        ctx.fill();
      }

      if (FR.lod > LOD_FAR) {
        galleries(ctx, sp, g, p.x, dim);
        /* pilasters: vertical ribs down the far wall, which is what stops a
           smooth cone reading as a painted circle */
        if (FR.lod === LOD_NEAR && nx && sp.ribs) {
          ctx.strokeStyle = 'rgba(0,0,0,0.34)'; ctx.lineWidth = 1;
          for (let k = 0; k < sp.ribs; k++) {
            const a = Math.PI + (k + 0.5) / sp.ribs * Math.PI;
            ctx.beginPath();
            ctx.moveTo(p.x + Math.cos(a) * g.rx, g.y + sp.ledge + Math.sin(a) * g.ry);
            ctx.lineTo(p.x + Math.cos(a) * nx.rx, nx.y + Math.sin(a) * nx.ry);
            ctx.stroke();
          }
        }
      }
    }

    /* the floor at the bottom of the bore, drawn whole — it is horizontal, so
       unlike the walls all of it faces the camera */
    const floor = geo[geo.length - 1];
    const fy = floor.y + sp.ledge;
    ctx.fillStyle = tone(sp.wall, Math.max(l, 0.5) * 0.3, 0.7);
    ring(ctx, p.x, fy, floor.rx, floor.ry); ctx.fill();

    if (sp.interior) sp.interior(ctx, { p, cy, RX, RY, geo, floor, fy, depth, prog, l });

    /* The near lip. Everything above is the far side of the bore; without
       this the near half is an unbroken black field that reads as a hole in
       the PICTURE rather than a hole in the ground. A single lit arc just
       inside the mouth's lower edge is enough to put a rim back. */
    ctx.strokeStyle = 'rgba(255,246,226,' + (0.10 + l * 0.20).toFixed(3) + ')';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(p.x, cy - 1, RX * 0.985, RY * 0.985, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();

    /* rimT is the rim radius in TILE units. Every mast, stack and pylon hung
       off the rim is positioned with it, so widening a mouth moves its
       furniture out to match instead of leaving it stranded in the void. */
    return { p, cy, RX, RY, geo, floor, fy, depth, prog, rimT: sp.mouth * 0.5 };
  }

  /* A soft pool of light at the bottom of a bore — the "central space" every
     one of these is built around, and the only warm thing on a crater floor
     that has been at cryogenic temperatures for a billion years. */
  function coreGlow(ctx, x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a.toFixed(3) + ')');
    g.addColorStop(0.55, 'rgba(' + rgb + ',' + (a * 0.34).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  function drawDeep(ctx, s, t, l) {
    const type = t.b.type;
    const B = BUILDINGS.find(b => b.id === type);
    const levels = Math.max(1, t.b.levels || 1);
    const prog = clamp(levels / (B.maxLevels || 1), 0, 1);
    const z = lift(t);

    if (type === 'sinkwell') {
      /* An open terraced funnel: bone-white galleries stepping down around a
         lattice lift spine. The plainest of the four, and the clearest read
         of a city dug into the ground. */
      const g = shaft(ctx, s, t, l, {
        mouth: 2.40, rings: 9, ledge: 7, windows: 9, ribs: 6,
        terrace: '#ded6c6', wall: '#6d6760', winRGB: '255,206,132',
        taper: f => 1 - 0.80 * f,
        prog,
        interior(c, q) {
          coreGlow(c, q.p.x, q.fy, Math.max(46, q.floor.rx * 3.2), '255,206,138', 0.78);
          c.fillStyle = 'rgba(255,232,182,0.85)';
          ring(c, q.p.x, q.fy, q.floor.rx * 0.72, q.floor.ry * 0.72); c.fill();
          /* the lift spine, hanging the full bore on four cables */
          c.strokeStyle = 'rgba(190,196,208,' + (0.30 + l * 0.4).toFixed(3) + ')';
          c.lineWidth = 1.2;
          for (const sx of [-1, 1]) {
            c.beginPath();
            c.moveTo(q.p.x + sx * 5, q.cy - q.RY * 0.2);
            c.lineTo(q.p.x + sx * 2.4, q.fy);
            c.stroke();
          }
          const car = ((Date.now() / 4200) % 1);
          c.fillStyle = 'rgba(255,226,166,0.9)';
          c.fillRect(q.p.x - 3, q.cy - q.RY * 0.2 + (q.fy - q.cy + q.RY * 0.2) * car - 2, 6, 4.6);
        }
      });
      rimCollar(ctx, g.p.x, g.cy, g.RX, g.RY, l, '#cdc6b6');
      spanBridges(ctx, g.p.x, g.cy, g.RX, g.RY, 3, l, '#c9c2b2');
      if (FR.lod > LOD_FAR) {
        /* head-frame and beacon on the rim */
        const hf = g.rimT * 0.86;
        const m = iso(t.x + 0.5 + hf, t.y + 0.5 - 0.1);
        box(ctx, t.x + 0.38 + hf, t.y + 0.4, 0.26, 0.26, 30, '#b9b2a2', l, z, { noShadow: true });
        ctx.fillStyle = 'rgba(255,196,120,' + (0.42 + beatPulse() * 0.46).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(m.x + 0, m.y - z - 28, 2.4, 0, TAU); ctx.fill();
      }
      return;
    }

    if (type === 'cistern') {
      /* The ice is melted rather than mined, so the floor of this one is
         water: a lit reservoir with grow-decks tiered around it and mirror
         masts on the rim throwing the only daylight this ground will ever
         see down onto it. */
      const g = shaft(ctx, s, t, l, {
        mouth: 2.40, rings: 8, ledge: 8, windows: 8, ribs: 5,
        terrace: '#7ed7a4', wall: '#495e69', winRGB: '186,255,222',
        taper: f => 1 - 0.60 * f,
        prog,
        interior(c, q) {
          /* the reservoir */
          const rx = q.floor.rx * 1.5, ry = q.floor.ry * 1.5;
          c.fillStyle = 'rgba(28,86,110,0.95)';
          ring(c, q.p.x, q.fy, rx, ry); c.fill();
          coreGlow(c, q.p.x, q.fy, Math.max(56, rx * 2.0), '120,232,255', 0.72);
          c.strokeStyle = 'rgba(190,246,255,' + (0.22 + l * 0.3).toFixed(3) + ')';
          c.lineWidth = 1;
          const t0 = (Date.now() / 2600) % 1;
          for (let k = 0; k < 3; k++) {
            const w = ((k / 3) + t0) % 1;
            ring(c, q.p.x, q.fy, rx * w, ry * w); c.stroke();
          }
          /* and the shafts of mirrored daylight coming down to meet it */
          for (let k = 0; k < 3; k++) {
            const a = Math.PI + (k + 0.5) / 3 * Math.PI;
            const sx = q.p.x + Math.cos(a) * q.RX * 0.88;
            const sy = q.cy + Math.sin(a) * q.RY * 0.88;
            const grad = c.createLinearGradient(sx, sy, q.p.x, q.fy);
            grad.addColorStop(0, 'rgba(255,250,224,' + (0.26 + l * 0.16).toFixed(3) + ')');
            grad.addColorStop(1, 'rgba(190,246,255,0.02)');
            c.fillStyle = grad;
            c.beginPath();
            c.moveTo(sx - 3, sy); c.lineTo(sx + 3, sy);
            c.lineTo(q.p.x + 9, q.fy); c.lineTo(q.p.x - 9, q.fy);
            c.closePath(); c.fill();
          }
        }
      });
      rimCollar(ctx, g.p.x, g.cy, g.RX, g.RY, l, '#9fc6c4');
      spanBridges(ctx, g.p.x, g.cy, g.RX, g.RY, 2, l, '#a8d2c8');
      if (FR.lod > LOD_FAR) {
        /* mirror masts, angled to bounce the low sun down the bore */
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + Math.PI / 4;
          const q = iso(t.x + 0.5 + Math.cos(a) * g.rimT * 0.94, t.y + 0.5 + Math.sin(a) * g.rimT * 0.94);
          ctx.strokeStyle = grey(140, l); ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(q.x, q.y - z); ctx.lineTo(q.x, q.y - z - 18); ctx.stroke();
          ctx.fillStyle = tone('#dff4ff', Math.max(l, 0.72), 1);
          ctx.beginPath();
          ctx.moveTo(q.x - 6, q.y - z - 18); ctx.lineTo(q.x + 6, q.y - z - 22);
          ctx.lineTo(q.x + 6, q.y - z - 30); ctx.lineTo(q.x - 6, q.y - z - 26);
          ctx.closePath(); ctx.fill();
        }
      }
      return;
    }

    if (type === 'foundry') {
      /* No terraces — a smooth inverted cone with a smelter at the bottom of
         it, hoists riding the wall and a working town's worth of pipework
         crowding the surface. Deliberately the ugly one. */
      const g = shaft(ctx, s, t, l, {
        mouth: 2.30, rings: 9, ledge: 0, windows: 7, ribs: 7,
        terrace: '#5c5349', wall: '#4b433b', winRGB: '255,158,86',
        /* Closes hard, but not to a point. At 0.90 the floor was eleven pixels
           across and the smelter that is supposed to be the whole character of
           this one had nowhere to burn. */
        taper: f => 1 - 0.76 * f,
        prog,
        interior(c, q) {
          /* the smelter: a pool of melt, the glow off it, and the haze that
             glow is being seen through — the reason this one has no lit decks
             is that all of its light comes from the bottom */
          coreGlow(c, q.p.x, q.fy, Math.max(90, q.floor.rx * 4.0), '255,124,36',
                   0.86 + beatPulse() * 0.14);
          c.fillStyle = 'rgba(255,228,160,' + (0.82 + beatPulse() * 0.18).toFixed(3) + ')';
          ring(c, q.p.x, q.fy, q.floor.rx * 0.92, q.floor.ry * 0.92); c.fill();
          c.fillStyle = 'rgba(255,168,74,0.16)';
          ring(c, q.p.x, q.fy - q.depth * 0.22, q.RX * 0.8, q.RY * 0.5); c.fill();
          /* hoist cables with cars riding them, offset so they never line up */
          for (let k = 0; k < 3; k++) {
            const a = Math.PI + (k + 0.5) / 3 * Math.PI;
            const sx = q.p.x + Math.cos(a) * q.RX * 0.9;
            const sy = q.cy + Math.sin(a) * q.RY * 0.9;
            c.strokeStyle = 'rgba(196,176,150,0.75)'; c.lineWidth = 1.3;
            c.beginPath(); c.moveTo(sx, sy); c.lineTo(q.p.x, q.fy); c.stroke();
            const u = ((Date.now() / 3400 + k / 3) % 1);
            c.fillStyle = 'rgba(255,186,110,0.92)';
            c.fillRect(sx + (q.p.x - sx) * u - 2, sy + (q.fy - sy) * u - 2, 4, 3.4);
          }
        }
      });
      rimCollar(ctx, g.p.x, g.cy, g.RX, g.RY, l, '#8a7f70');
      spanBridges(ctx, g.p.x, g.cy, g.RX, g.RY, 2, l, '#8f8474');
      if (FR.lod > LOD_FAR) {
        /* stacks and pipework crowding the rim */
        const rt = g.rimT * 0.82;
        for (const [ox, oy, hh] of [[0.5 + rt, 0.1, 34], [0.5 + rt, 0.6, 24], [0.1, 0.5 + rt, 28]]) {
          box(ctx, t.x + ox, t.y + oy, 0.2, 0.2, hh, '#8b7f6e', l, z, { noShadow: true });
          const q = iso(t.x + ox + 0.1, t.y + oy + 0.1);
          ctx.fillStyle = 'rgba(190,170,150,0.22)';
          ctx.beginPath();
          ctx.ellipse(q.x, q.y - z - hh - 7, 6, 4, 0, 0, TAU); ctx.fill();
        }
        ctx.strokeStyle = grey(120, l); ctx.lineWidth = 2;
        const a0 = iso(t.x + 0.6 + rt, t.y + 0.2), b0 = iso(t.x + 0.2, t.y + 0.6 + rt);
        ctx.beginPath();
        ctx.moveTo(a0.x, a0.y - z - 12); ctx.lineTo(b0.x, b0.y - z - 12); ctx.stroke();
      }
      return;
    }

    if (type === 'core') {
      /* The showstopper. A chamber bored so deep it widens as it goes, with
         inverted towers hanging from its ceiling around a suspended sun-lamp.
         The overhang only works because the descent is clipped to the mouth:
         the rock above hides the part of the bell that is wider than the hole
         it was dug through, exactly as it would. */
      const g = shaft(ctx, s, t, l, {
        mouth: 3.80, rings: 11, ledge: 9, windows: 12, ribs: 8,
        /* Markedly darker than the other three, and deliberately so: this one
           is a cavern lit BY its suspended lamp, not a lit room that happens
           to contain one. Pale decks made the lamp the dimmest thing in its
           own chamber. */
        terrace: '#7f8ba6', wall: '#262b39', winRGB: '212,236,255',
        /* Damped by f on purpose. An undamped sine bulge makes ring 1 wider
           than the mouth itself, which pushes the hanging towers out under
           the rock and leaves the chamber looking flat. Multiplying by f
           holds the first rings at the mouth and opens the bell out below
           it, where it can actually be seen. */
        taper: f => 1 - 0.74 * f + 0.44 * Math.sin(Math.PI * f) * f,
        prog,
        interior(c, q) {
          const hangTop = q.geo[2] || q.geo[1] || q.geo[0];
          const lampY = q.cy + q.depth * 0.66;
          const towers = [];
          /* Only the far half of the ceiling. A tower hung from the near half
             is behind the rim you are looking over, so it has nothing to be
             seen against — and because it hangs DOWNWARD from a point already
             near the bottom of the mouth, the clip cut each one to a stub and
             left a row of grey sawteeth lying across the lamp. */
          for (let k = 0; k < 9; k++) {
            const a = Math.PI + (k + 0.5) / 9 * Math.PI;
            const y = hangTop.y + Math.sin(a) * hangTop.ry * 0.80;
            towers.push({
              a, y,
              x: q.p.x + Math.cos(a) * hangTop.rx * 0.80,
              /* and never longer than the room left below it, so a tower can
                 never reach the clip and be cut off mid-shaft */
              len: Math.min(q.depth * (0.42 + ((k * 37) % 11) / 30),
                            (q.cy + q.RY * 0.93) - y)
            });
          }
          const draw = tw => {
            /* a tower hanging point-down: wide at the ceiling, tapering to a
               lit tip, with window rows all the way */
            c.fillStyle = 'rgba(0,0,0,0.35)';                 // its own shadow side
            c.beginPath();
            c.moveTo(tw.x, tw.y); c.lineTo(tw.x + 10, tw.y);
            c.lineTo(tw.x + 3, tw.y + tw.len); c.lineTo(tw.x, tw.y + tw.len);
            c.closePath(); c.fill();
            c.fillStyle = tone('#b8c4dc', Math.max(l, 0.55), 0.84);
            c.beginPath();
            c.moveTo(tw.x - 10, tw.y); c.lineTo(tw.x + 10, tw.y);
            c.lineTo(tw.x + 3, tw.y + tw.len); c.lineTo(tw.x - 3, tw.y + tw.len);
            c.closePath(); c.fill();
            if (FR.lod > LOD_FAR) {
              c.fillStyle = 'rgba(226,244,255,0.85)';
              const rows = Math.max(3, Math.round(tw.len / 8));
              for (let r = 1; r < rows; r++) {
                const u = r / rows, hw = 7 - u * 4.6;
                c.fillRect(tw.x - hw, tw.y + tw.len * u, hw * 2, 1.8);
              }
            }
            c.fillStyle = 'rgba(255,240,196,0.95)';
            c.beginPath(); c.arc(tw.x, tw.y + tw.len + 2, 2.6, 0, TAU); c.fill();
          };
          for (const tw of towers) draw(tw);

          /* the suspended lamp, and the floor plaza it lights */
          coreGlow(c, q.p.x, q.fy, Math.max(70, q.floor.rx * 2.4), '190,220,255', 0.55);
          c.fillStyle = 'rgba(206,232,255,0.55)';
          ring(c, q.p.x, q.fy, q.floor.rx * 0.8, q.floor.ry * 0.8); c.fill();
          /* the suspended sun-lamp: the only daylight this city will ever get,
             and the thing the whole chamber is arranged around */
          coreGlow(c, q.p.x, lampY, 120 + beatPulse() * 16, '255,240,196', 1);
          coreGlow(c, q.p.x, lampY, 46, '255,250,232', 1);
          c.fillStyle = 'rgba(255,255,252,1)';
          c.beginPath(); c.arc(q.p.x, lampY, 14, 0, TAU); c.fill();
          c.strokeStyle = 'rgba(255,248,214,0.42)'; c.lineWidth = 1.2;
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * TAU + 0.2;
            c.beginPath();
            c.moveTo(q.p.x + Math.cos(a) * 14, lampY + Math.sin(a) * 14);
            c.lineTo(q.p.x + Math.cos(a) * 34, lampY + Math.sin(a) * 34);
            c.stroke();
          }
          /* the cable it hangs on, run up into the roof */
          c.strokeStyle = 'rgba(190,206,232,0.5)'; c.lineWidth = 1.4;
          c.beginPath();
          c.moveTo(q.p.x, q.cy - q.RY * 0.35); c.lineTo(q.p.x, lampY - 9); c.stroke();

        }
      });
      rimCollar(ctx, g.p.x, g.cy, g.RX, g.RY, l, '#c3cede');
      /* a glazed cap, drawn as arcs rather than a filled dome so the chamber
         below stays visible through it */
      if (FR.lod > LOD_FAR) {
        ctx.strokeStyle = 'rgba(198,232,255,' + (0.26 + l * 0.3).toFixed(3) + ')';
        ctx.lineWidth = 1.3;
        for (let i = 1; i <= 3; i++) {
          const rx = Math.abs(Math.cos((i / 4) * Math.PI)) * g.RX;
          if (rx < 0.5) continue;
          ctx.beginPath();
          ctx.ellipse(g.p.x, g.cy - 4, rx, g.RY * 0.92, 0, Math.PI, TAU);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.ellipse(g.p.x, g.cy - 4, g.RX, g.RY * 0.92, 0, Math.PI, TAU);
        ctx.stroke();
      }
      spanRing(ctx, g.p.x, g.cy, g.RX, g.RY, l, '#cbd6e6');
      if (FR.lod > LOD_FAR) {
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + Math.PI / 4;
          const q = iso(t.x + 0.5 + Math.cos(a) * g.rimT * 0.96, t.y + 0.5 + Math.sin(a) * g.rimT * 0.96);
          ctx.strokeStyle = grey(160, l); ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(q.x, q.y - z); ctx.lineTo(q.x, q.y - z - 40); ctx.stroke();
          ctx.fillStyle = 'rgba(190,226,255,' + (0.5 + beatPulse() * 0.4).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(q.x, q.y - z - 42, 2.4, 0, TAU); ctx.fill();
        }
      }
      return;
    }
  }

  /* An arcology that cannot dig gets a mark on the rim rather than a silent
     stall. Every other stalled thing in this game says so somewhere; a hole
     that has quietly stopped getting deeper would be the one exception. */
  function drawDeepStall(ctx, s, t, l) {
    if (!t.b || !t.b.stalled) return;
    const B = BUILDINGS.find(b => b.id === t.b.type);
    if (!B || (t.b.levels || 1) >= B.maxLevels) return;
    const p = iso(t.x + 0.5, t.y + 0.5);
    const y = p.y - lift(t) - 16;
    ctx.fillStyle = 'rgba(255,178,74,' + (0.35 + beatPulse() * 0.5).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(p.x, y - 7); ctx.lineTo(p.x + 6, y + 4); ctx.lineTo(p.x - 6, y + 4);
    ctx.closePath(); ctx.fill();
  }

  /* ---------- traffic and pedestrians (cosmetic, from agents.js) ----------

     Drawn INSIDE the back-to-front tile walk, bucketed by the tile they are
     standing on, so the painter's algorithm occludes them against elevation
     and towers for free. city/ has to fake this with ghost silhouettes
     because it has no heights; here the honest version is also the cheaper
     one. Agents outside the viewport are never drawn because walkVisible
     never visits their tile. */

  /* Every wonder, read from the data rather than named one by one, so adding
     one is a data change here too. */
  const WONDER_IDS = new Set(BUILDINGS.filter(b => b.group === 'wonder').map(b => b.id));
  const isWonder = id => WONDER_IDS.has(id);
  const DEEP_IDS = new Set(BUILDINGS.filter(b => b.group === 'deep').map(b => b.id));
  const isDeepId = id => DEEP_IDS.has(id);

  /* Roughly how tall whatever stands on this tile is, in world units. Only
     used to decide whether it would hide a person standing behind it, so it
     mirrors the heights drawZoneBuilding actually uses without needing to be
     exact. */
  function roughHeight(t, era) {
    if (t.b) {
      const ty = t.b.type;
      if (ty === 'tube' || ty === 'conduit') return 0;
      /* A deep arcology is a hole with a collar around it. Only the
         superstructure can hide anyone, so it must not claim a tower's
         height or it would swallow every pedestrian behind it. */
      if (isDeepId(ty)) return 26;
      if (isWonder(ty)) return 120;
      return 22;
    }
    if (!t.zone || t.zone.stage === 0) return 0;
    const st = t.zone.stage;
    if (t.zone.density === 'low' || era === 0) return 12 + st * 8;
    return era >= 3 ? 20 + st * 24 : 14 + st * 13;
  }

  /* Painter's order gives honest occlusion for free, and in a downtown of
     stage-4 towers that means almost every vehicle is behind something — the
     city looks dead precisely where it is busiest. So occluded agents get a
     second pass as translucent silhouettes over the top, the same trick
     city/js/render.js uses. Traffic you can see is worth more here than
     traffic that is strictly hidden. */
  function agentOccluded(s, a, era) {
    const tx = Math.round(a.x), ty = Math.round(a.y);
    const t0 = T.tileAt(s, tx, ty);
    if (!t0) return false;
    const eye = lift(t0) + 10;                 // about head height
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [2, 0], [0, 2], [2, 1], [1, 2]]) {
      const n = T.tileAt(s, tx + dx, ty + dy);
      if (!n) continue;
      if (lift(n) + roughHeight(n, era) > eye + (dx + dy) * (K.LEVEL_PX * 0.5)) return true;
    }
    return false;
  }

  function bucketAgents(s, era) {
    const A = window.LM_AGENTS;
    const map = new Map(), hidden = [];
    if (!A) return { map, hidden };
    for (const a of A.all()) {
      const tx = Math.round(a.x), ty = Math.round(a.y);
      if (tx < 0 || ty < 0 || tx >= K.COLS || ty >= K.ROWS) continue;
      if (agentOccluded(s, a, era)) { hidden.push(a); continue; }
      const k = T.idx(tx, ty);
      const list = map.get(k);
      if (list) list.push(a); else map.set(k, [a]);
    }
    return { map, hidden };
  }

  /* A downtown of stage-4 towers hides essentially all of its own traffic
     from this camera angle, so the busiest part of the city was also the
     deadest-looking. Hidden agents are therefore drawn bright rather than
     faint — they read as headlights and helmet lamps moving between the
     towers, which is what you actually want to see at night on the Moon.
     Deliberately not subtle: an invisible ghost is the same as no ghost. */
  function drawGhost(ctx, s, a) {
    const t = T.tileAt(s, Math.round(a.x), Math.round(a.y));
    const z = t ? lift(t) : 0;
    const p = iso(a.x + 0.5, a.y + 0.5);

    if (a.kind === 'ped') {
      ctx.fillStyle = 'rgba(170,220,255,0.55)';
      ctx.beginPath(); ctx.arc(p.x, p.y - z - 8, 1.9, 0, 7); ctx.fill();
      return;
    }
    const w = a.kind === 'bus' ? 12 : a.kind === 'train' ? 11 : 8;
    const warm = a.kind === 'ped' ? '255,235,190' : '255,226,150';
    /* a soft halo, then a hot core — cheap, and it survives being drawn over
       a bright tower face as well as a dark one */
    const g = ctx.createRadialGradient(p.x, p.y - z - 7, 0, p.x, p.y - z - 7, w * 1.5);
    g.addColorStop(0, `rgba(${warm},0.85)`);
    g.addColorStop(0.45, `rgba(${warm},0.30)`);
    g.addColorStop(1, `rgba(${warm},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - z - 7, w * 1.5, w * 0.8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(${warm},0.95)`;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - z - 7, w * 0.42, w * 0.22, 0, 0, 7); ctx.fill();
  }

  /* A vehicle body drawn as a squat isometric box. Kept separate from box()
     because these are sub-tile and want their own proportions and a windscreen
     rather than a full six-face extrusion. */
  function vehicle(ctx, p, z, len, wid, hz, col, l, lit) {
    const hx = len * 0.5, hy = wid * 0.5;
    const top = [[-hx, 0], [0, -hy], [hx, 0], [0, hy]];
    const at = (i, dz) => ({ x: p.x + top[i][0], y: p.y - z - dz + top[i][1] * 0.5 });

    /* contact shadow first, on the ground */
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - z + 1, hx * 0.9, hy * 0.45, 0, 0, 7); ctx.fill();

    ctx.fillStyle = tone(col, l, 0.62);
    ctx.beginPath();
    ctx.moveTo(at(3, 0).x, at(3, 0).y); ctx.lineTo(at(2, 0).x, at(2, 0).y);
    ctx.lineTo(at(2, hz).x, at(2, hz).y); ctx.lineTo(at(3, hz).x, at(3, hz).y);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = tone(col, l, 0.44);
    ctx.beginPath();
    ctx.moveTo(at(0, 0).x, at(0, 0).y); ctx.lineTo(at(3, 0).x, at(3, 0).y);
    ctx.lineTo(at(3, hz).x, at(3, hz).y); ctx.lineTo(at(0, hz).x, at(0, hz).y);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = tone(col, l, 1);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const q = at(i, hz);
      i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
    }
    ctx.closePath(); ctx.fill();

    if (lit) {
      ctx.fillStyle = `rgba(255,238,190,${0.55 + 0.35 * (1 - l)})`;
      ctx.fillRect(p.x - hx * 0.55, p.y - z - hz * 0.55, hx * 1.1, Math.max(1, hz * 0.28));
    }
  }

  function drawAgent(ctx, s, a, l) {
    const t = T.tileAt(s, Math.round(a.x), Math.round(a.y));
    const z = t ? lift(t) : 0;
    const p = iso(a.x + 0.5, a.y + 0.5);

    /* Zoomed right out a vehicle is a couple of pixels, so it becomes one —
       a moving speck still reads as a city that is alive, and it costs one
       fill instead of eleven. */
    if (FR.lod === LOD_FAR) {
      if (a.kind === 'ped') return;               // too small to register at all
      ctx.fillStyle = 'rgba(255,226,150,0.85)';
      ctx.beginPath(); ctx.arc(p.x, p.y - z - 4, a.kind === 'car' ? 1.6 : 2.4, 0, 7); ctx.fill();
      return;
    }

    if (a.kind === 'ped') {
      /* a suited figure: legs, torso, helmet, and a bob so a crowd does not
         read as a row of identical posts */
      const bob = Math.sin(a.bob) * 1.1;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y - z + 1, 3, 1.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = tone(a.tint, l, 0.85);
      ctx.fillRect(p.x - 1.6, p.y - z - 9 + bob, 3.2, 6.5);
      ctx.fillStyle = tone('#9fb4d4', l, 1);
      ctx.beginPath(); ctx.arc(p.x, p.y - z - 11 + bob, 2.1, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(180,230,255,${0.35 + 0.4 * (1 - l)})`;
      ctx.beginPath(); ctx.arc(p.x + 0.6, p.y - z - 11.4 + bob, 1, 0, 7); ctx.fill();
      return;
    }
    if (a.kind === 'car')  return vehicle(ctx, p, z, 17, 9, 6, a.livery, l, false);
    if (a.kind === 'bus')  return vehicle(ctx, p, z, 26, 11, 9, a.livery, l, true);
    if (a.kind === 'train') {
      /* three articulated cars strung back along the corridor */
      const c = a.corridor;
      const ux = c.bx === c.ax ? 0 : 1, uy = c.by === c.ay ? 0 : 1;
      for (let i = 0; i < 3; i++) {
        const off = i * 0.62 * (a.dir > 0 ? -1 : 1);
        const q = iso(a.x + 0.5 + ux * off, a.y + 0.5 + uy * off);
        vehicle(ctx, q, z, 24, 10, 11, i === 0 ? a.livery : '#b8c2d4', l, true);
      }
    }
  }

  /* ---------- invasion set pieces (cosmetic, from fx.js) ----------

     Drawn in world space AFTER the tile walk, because every one of them is
     either in the sky or a column of light going up — they belong in front of
     the city, not sorted into it. Timing comes from LM_FX's injectable clock,
     which is what lets a frame of any of these be frozen and screenshotted in
     a browser whose animation clock is throttled to a third of a frame per
     second. */

  function drawFx(ctx, s) {
    const FX = window.LM_FX;
    if (!FX || !FX.count()) return;

    /* Beams and the herald first, then the path-followers, so a saucer
       crosses in front of a beam rather than behind it. */
    for (const fx of FX.all()) {
      const p = FX.progress(fx);
      if (fx.kind === 'beam') drawBeam(ctx, s, fx, p);
      else if (fx.kind === 'herald') drawHerald(ctx, s, fx, p);
    }
    for (const fx of FX.all()) {
      if (fx.kind !== 'saucer' && fx.kind !== 'worm') continue;
      drawTraveller(ctx, s, fx, FX.progress(fx));
    }
  }

  /* A saucer riding its cut, or a worm surfacing along its trench. Both
     follow a path the simulation already decided on. */
  function drawTraveller(ctx, s, fx, p) {
    const path = fx.path || [];
    if (path.length < 2) return;
    const i = Math.min(path.length - 1, Math.floor(p * (path.length - 1)));
    const [tx, ty] = path[i];
    const t = T.tileAt(s, tx, ty);
    const z = t ? lift(t) : 0;
    const q = iso(tx + 0.5, ty + 0.5);

    if (fx.kind === 'worm') {
      /* segments arcing out of the ground and back into it */
      for (let k = -3; k <= 3; k++) {
        const j = Math.max(0, Math.min(path.length - 1, i + k));
        const [px, py] = path[j];
        const w = T.tileAt(s, px, py);
        const wz = w ? lift(w) : 0;
        const c = iso(px + 0.5, py + 0.5);
        const arc = Math.max(0, Math.cos((k / 3) * Math.PI / 2)) * 26;
        ctx.fillStyle = `rgba(${120 - k * 4},${86},${74},0.95)`;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y - wz - arc, 15 - Math.abs(k) * 1.4, 9 - Math.abs(k) * 0.8, 0, 0, 7);
        ctx.fill();
        if (k === 0) {                      // the business end
          ctx.fillStyle = 'rgba(255,120,90,0.9)';
          ctx.beginPath(); ctx.ellipse(c.x, c.y - wz - arc, 6, 4, 0, 0, 7); ctx.fill();
        }
      }
      return;
    }

    /* saucer: hull, dome, running lights, and the beam it is cutting with */
    const alt = 120;
    const cx = q.x, cy = q.y - z - alt;

    const beam = ctx.createLinearGradient(cx, cy, cx, q.y - z);
    beam.addColorStop(0, 'rgba(180,255,210,0.55)');
    beam.addColorStop(1, 'rgba(120,255,170,0.06)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy + 4); ctx.lineTo(cx + 5, cy + 4);
    ctx.lineTo(cx + 26, q.y - z); ctx.lineTo(cx - 26, q.y - z);
    ctx.closePath(); ctx.fill();
    /* the scorch where it is landing right now */
    ctx.fillStyle = 'rgba(255,150,80,0.55)';
    ctx.beginPath(); ctx.ellipse(q.x, q.y - z, 22, 11, 0, 0, 7); ctx.fill();

    ctx.fillStyle = '#2b3340';
    ctx.beginPath(); ctx.ellipse(cx, cy, 34, 12, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#59667d';
    ctx.beginPath(); ctx.ellipse(cx, cy - 4, 34, 11, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#9fb6d4';
    ctx.beginPath(); ctx.ellipse(cx, cy - 10, 15, 8, 0, 0, 7); ctx.fill();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + Date.now() / 400;
      ctx.fillStyle = `rgba(255,${180 + k * 8},120,0.95)`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 28, cy + Math.sin(a) * 9, 2.2, 0, 7);
      ctx.fill();
    }
  }

  /* A tractor beam, with whatever it is taking rising up inside it. */
  function drawBeam(ctx, s, fx, p) {
    const t = T.tileAt(s, fx.x, fx.y);
    const z = t ? lift(t) : 0;
    const q = iso(fx.x + 0.5, fx.y + 0.5);
    const top = q.y - z - 320;
    const flare = Math.sin(Math.min(1, p * 1.6) * Math.PI);

    const g = ctx.createLinearGradient(q.x, top, q.x, q.y - z);
    g.addColorStop(0, `rgba(190,255,235,${0.05 + flare * 0.20})`);
    g.addColorStop(0.7, `rgba(150,255,220,${0.12 + flare * 0.30})`);
    g.addColorStop(1, `rgba(120,255,200,${0.20 + flare * 0.45})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(q.x - 8, top); ctx.lineTo(q.x + 8, top);
    ctx.lineTo(q.x + 46, q.y - z); ctx.lineTo(q.x - 46, q.y - z);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = `rgba(200,255,235,${0.35 + flare * 0.4})`;
    ctx.beginPath(); ctx.ellipse(q.x, q.y - z, 46, 22, 0, 0, 7); ctx.fill();

    /* the abductee, tumbling upward and shrinking as it goes */
    const rise = p * 300;
    const sc = Math.max(0.1, 1 - p);
    ctx.save();
    ctx.translate(q.x, q.y - z - 18 - rise);
    ctx.rotate(p * 3.2);
    ctx.fillStyle = `rgba(205,214,226,${0.95 - p * 0.5})`;
    ctx.fillRect(-13 * sc, -13 * sc, 26 * sc, 26 * sc);
    ctx.restore();
  }

  /* The Chrome Herald: a figure on a board, trailing light. */
  function drawHerald(ctx, s, fx, p) {
    const path = fx.path || [];
    if (path.length < 2) return;
    const i = Math.min(path.length - 1, Math.floor(p * (path.length - 1)));
    const [tx, ty] = path[i];
    const t = T.tileAt(s, tx, ty);
    const z = t ? lift(t) : 0;
    const q = iso(tx + 0.5, ty + 0.5);
    const alt = 150 + Math.sin(p * Math.PI * 3) * 22;
    const cx = q.x, cy = q.y - z - alt;

    /* the trail, drawn back along the path it has already covered */
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let k = 1; k <= 14; k++) {
      const j = Math.max(0, i - k);
      const [ax, ay] = path[j], [bx, by] = path[Math.max(0, i - k + 1)];
      const at = T.tileAt(s, ax, ay), bt = T.tileAt(s, bx, by);
      const a = iso(ax + 0.5, ay + 0.5), b = iso(bx + 0.5, by + 0.5);
      ctx.strokeStyle = `rgba(215,245,255,${0.5 * (1 - k / 14)})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - (at ? lift(at) : 0) - alt);
      ctx.lineTo(b.x, b.y - (bt ? lift(bt) : 0) - alt);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
    glow.addColorStop(0, 'rgba(235,250,255,0.65)');
    glow.addColorStop(1, 'rgba(200,240,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, 40, 0, 7); ctx.fill();

    ctx.fillStyle = '#dfeaf6';                       // the board
    ctx.beginPath(); ctx.ellipse(cx, cy + 6, 22, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#eef5ff';                       // and the figure on it
    ctx.fillRect(cx - 2.6, cy - 16, 5.2, 16);
    ctx.beginPath(); ctx.arc(cx, cy - 20, 4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(cx - 9, cy - 11, 18, 2.4);          // arms out
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
    const nets = ui.nets;
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
      } else if (ui.view === 'power') {
        if (!nets) return;
        colour = G.served(s, nets.power, tx, ty) ? '#6ee7a0' : '#3b2230';
      } else if (ui.view === 'air') {
        if (!nets) return;
        colour = G.served(s, nets.air, tx, ty) ? '#7fd8ff' : '#2a2438';
      } else if (ui.view === 'transit') {
        colour = G.hasTransit(s, tx, ty) ? '#ffd166' : '#2e2a26';
      } else if (ui.view === 'value') {
        if (!t.zone) return;
        colour = lerpColour('#3a6ea8', '#ffd166', t.zone.value || 0);
      } else if (ui.view === 'dust') {
        const d = clamp(t.dust || 0, 0, 1);
        if (d < 0.02) return;
        colour = lerpColour('#4a3a24', '#e8b070', d);
        alpha = 0.25 + d * 0.6;
      } else if (ui.view.startsWith('cov:')) {
        const svc = ui.view.slice(4);
        const field = ui.cov && ui.cov[svc];
        if (!field) return;
        const c = field[T.idx(tx, ty)];
        if (c < 0.02) return;
        const spec = (window.LM_DATA.SERVICES || []).find(x => x.id === svc);
        colour = lerpColour('#1b2030', spec ? spec.colour : '#6ee7a0', c);
        alpha = 0.25 + c * 0.6;
      }
      if (!colour) return;
      ctx.globalAlpha = alpha;
      fillDiamond(ctx, tx, ty, 1, 1, colour, null, lift(t));
      ctx.globalAlpha = 1;
    });
  }

  /* Ghost of whatever the current drag would build. */
  function drawPreview(ctx, s, prev) {
    for (const c of prev.cells) {
      const t = T.tileAt(s, c.x, c.y);
      if (!t) continue;
      fillDiamond(ctx, c.x + 0.04, c.y + 0.04, 0.92, 0.92,
        c.ok ? 'rgba(95,201,255,0.32)' : 'rgba(255,122,104,0.38)',
        c.ok ? '#5fc9ff' : '#ff7a68', lift(t));
    }
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
    /* the architectural language for this frame — every zone building reads
       it, so the whole city changes character together as the era turns */
    const era = window.LM_ERAS ? window.LM_ERAS.index(s) : 3;
    /* frame context for the whole pass — detail tier and where the sun is */
    if (!FR.pinned) { FR.lod = lodFor(ui.cam.z); FR.az = sunAzimuth(s); }
    const traffic = bucketAgents(s, era);

    /* One back-to-front pass covering ground AND everything standing on it.
       Splitting structures into a later pass would let a tall tower behind a
       ridge paint over the ridge in front of it; doing both per tile in
       diagonal order keeps the occlusion honest. */
    walkVisible(range, (tx, ty) => {
      const t = s.map[T.idx(tx, ty)];
      drawTile(ctx, s, t);

      if (t.pipe) {                                  // buried main, faintly showing
        ctx.strokeStyle = 'rgba(120,200,230,0.30)';
        ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]);
        fillDiamond(ctx, tx + 0.3, ty + 0.3, 0.4, 0.4, null, ctx.strokeStyle, lift(t));
        ctx.setLineDash([]);
      }
      if (ui.showDeposits !== false && t.deposit && !t.b && !t.zone) depositMarker(ctx, t);

      if (t.b) {
        if (t.b.type === 'tube') drawTube(ctx, s, t, litness(t));
        else if (t.b.type === 'conduit') drawConduit(ctx, s, t, litness(t));
        else if (isDeepId(t.b.type)) { drawDeep(ctx, s, t, litness(t)); drawDeepStall(ctx, s, t, litness(t)); }
        else if (isWonder(t.b.type)) drawWonder(ctx, s, t, litness(t));
        else drawPlant(ctx, s, t, litness(t));
      } else if (t.zone) {
        drawZoneBuilding(ctx, s, t, litness(t), era);
      }

      if (traffic.map.size) {
        const here = traffic.map.get(T.idx(tx, ty));
        if (here) for (const a of here) drawAgent(ctx, s, a, litness(t));
      }
    });

    /* the ones a tower is standing in front of, as silhouettes over the top */
    for (const a of traffic.hidden) drawGhost(ctx, s, a);

    /* set pieces last: they are in the sky, or a column of light going up */
    drawFx(ctx, s);

    if (ui.view && ui.view !== 'terrain') drawOverlay(ctx, s, ui, range);
    if (ui.preview) drawPreview(ctx, s, ui.preview);

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

  window.LM_RENDER = {
    draw, iso, pickTile, TW, TH,
    /* the minimap draws its viewport box from this, so it can never drift
       out of step with what the renderer actually shows */
    visibleRange,
    /* Detail tier and sun angle, exposed so they can be pinned during
       verification — measuring what LOD is worth means drawing the far view
       at near detail, and screenshotting a given sun angle means holding the
       month still. Nothing in the game reads these. */
    LOD_FAR, LOD_MID, LOD_NEAR,
    debugPin(o) { Object.assign(FR, o); FR.pinned = true; },
    debugUnpin() { FR.pinned = false; },
    /* exposed for the globe, which needs the same lunar-cycle phase to
       place its own terminator — one clock, read by both views */
    sunAzimuth
  };
})();
