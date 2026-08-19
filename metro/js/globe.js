/* Lunar Metropolis — the Moon, as a globe.

   Where the local minimap lets you move around ONE city's map, this is the
   pop-up that shows the map is one patch of a sphere: an orthographic
   projection of the whole Moon, rotatable by drag, with every founded
   colony marked on it, sized by population. Click empty ground to found a
   new one; click an existing mark to switch to that city.

   Drawn as PROJECTED POLYGONS, not per-pixel — a pixel-shaded sphere would
   be both slower and stylistically wrong on a game whose entire visual
   language is flat procedural shapes. Everything here is a set of (lat,lon)
   points run through the same projection: a coarse lat/lon grid for the
   base shading, a wobbled outline per named feature, a single point per
   city.

   The projection math is split out as pure functions taking explicit
   arguments — no module-level mutable state, no canvas — specifically so it
   can be verified headlessly: a point at the sub-observer point must land
   at the centre of the disc, a point 90 degrees around it must land exactly
   on the limb, and anything further round is on the far side and must be
   culled. Only draw() at the bottom touches a canvas. */

(function () {
  const D2R = Math.PI / 180;

  /* ---------- named features ----------

     Real selenographic coordinates — the centre of each is a genuine,
     citable location, approximated to the nearest degree or so, which is
     the right precision for a "stylised outline" rather than a survey map.
     The outline itself is NOT traced from any real coastline data (none was
     available to draw from); it is a wobbled circle around that real centre,
     generated the same way terrain.js wobbles a crater rim — honest about
     being stylised, honest about the centre being real.

     lon: 0 at the classic Earth-facing centre of the near side, positive
     east (toward Mare Crisium), matching the traditional orientation of a
     Moon map. lat: positive north. `r` is an angular radius in degrees. */
  const FEATURES = [
    // near-side maria, roughly in their real relative arrangement
    { id: 'imbrium', name: 'Mare Imbrium', lat: 35, lon: -16, r: 18, kind: 'mare' },
    { id: 'serenitatis', name: 'Mare Serenitatis', lat: 28, lon: 17, r: 12, kind: 'mare' },
    { id: 'tranquillitatis', name: 'Mare Tranquillitatis', lat: 8, lon: 31, r: 11, kind: 'mare' },
    { id: 'crisium', name: 'Mare Crisium', lat: 17, lon: 59, r: 9, kind: 'mare' },
    { id: 'fecunditatis', name: 'Mare Fecunditatis', lat: -4, lon: 52, r: 10, kind: 'mare' },
    { id: 'nectaris', name: 'Mare Nectaris', lat: -15, lon: 35, r: 6, kind: 'mare' },
    { id: 'humorum', name: 'Mare Humorum', lat: -24, lon: -39, r: 7, kind: 'mare' },
    { id: 'nubium', name: 'Mare Nubium', lat: -21, lon: -17, r: 9, kind: 'mare' },
    { id: 'frigoris', name: 'Mare Frigoris', lat: 56, lon: 1, r: 8, kind: 'mareThin' },
    { id: 'procellarum', name: 'Oceanus Procellarum', lat: 18, lon: -57, r: 22, kind: 'mare' },
    { id: 'orientale', name: 'Mare Orientale', lat: -19, lon: -95, r: 9, kind: 'mare' },

    // far side — this is what makes the globe actually read as a Moon
    // rather than a painted disc: the near side is patched with maria and
    // the far side almost entirely is not, which is the single most
    // recognisable fact about the real Moon and falls straight out of
    // using real coordinates rather than scattering features evenly
    { id: 'moscoviense', name: 'Mare Moscoviense', lat: 27, lon: 147, r: 6, kind: 'mare' },
    { id: 'ingenii', name: 'Mare Ingenii', lat: -34, lon: 165, r: 6, kind: 'mare' },
    { id: 'spa', name: 'South Pole–Aitken Basin', lat: -53, lon: -169, r: 30, kind: 'basin' },

    // bright ray craters — small, but the rays themselves are the
    // recognisable part, so drawn as a glyph rather than left as a dot
    { id: 'tycho', name: 'Tycho', lat: -43, lon: -11, r: 2.2, kind: 'ray' },
    { id: 'copernicus', name: 'Copernicus', lat: 10, lon: -20, r: 2.6, kind: 'ray' },
    { id: 'kepler', name: 'Kepler', lat: 8, lon: -38, r: 1.6, kind: 'ray' },
    { id: 'aristarchus', name: 'Aristarchus', lat: 24, lon: -47, r: 1.4, kind: 'ray' },

    // the poles — the two real, named permanently-shadowed-rim craters that
    // this game's entire polar mechanic is standing in for
    { id: 'shackleton', name: 'Shackleton', lat: -89.9, lon: 0, r: 1.4, kind: 'pole' },
    { id: 'peary', name: 'Peary', lat: 88.6, lon: 33, r: 1.7, kind: 'pole' }
  ];

  /* Deterministic hash noise, the same technique terrain.js uses, so a
     feature's wobble is stable across redraws rather than reshuffling every
     frame. */
  function rnd(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

  /* A closed ring of (lat, lon) points around a feature's centre, wobbled so
     it reads as a coastline rather than a perfect circle. Cached per feature
     id — the wobble only needs computing once, ever. */
  const outlineCache = new Map();
  function outlineOf(f) {
    if (outlineCache.has(f.id)) return outlineCache.get(f.id);
    const n = 20;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const salt = f.lat * 13.1 + f.lon * 7.7 + i * 3.3;
      const wobble = 0.62 + rnd(salt) * 0.5;
      const rr = f.r * (f.kind === 'mareThin' ? (i % 2 ? 0.35 : 1) : wobble);
      /* longitude spacing narrows toward the poles on a real sphere — divide
         by cos(lat) so the outline stays round rather than egg-shaped near
         high-latitude features (Frigoris, the poles) */
      const dlat = rr * Math.sin(a);
      const dlon = rr * Math.cos(a) / Math.max(0.15, Math.cos(f.lat * D2R));
      pts.push([f.lat + dlat, f.lon + dlon]);
    }
    outlineCache.set(f.id, pts);
    return pts;
  }

  /* ---------- projection ----------

     Orthographic: the sphere is viewed from infinitely far away, so every
     projection ray is parallel rather than converging on a single eye
     point. It is the correct choice for a small, distant body seen as a
     disc — the flattening a perspective projection would add is not wanted
     here — and it is also the cheapest: no division per point.

     `view` is the camera's rotation, in degrees: view.lon is which
     longitude currently faces forward (spin), view.lat is how far the
     camera has tilted up or down (pitch). Both are just two rotations
     applied to the point's unit-sphere position before reading off x, y
     and testing z for visibility. */

  function toUnit(lat, lon) {
    const φ = lat * D2R, λ = lon * D2R;
    return [Math.cos(φ) * Math.sin(λ), Math.sin(φ), Math.cos(φ) * Math.cos(λ)];
  }

  /* Rotates a unit-sphere point into camera space: yaw by -view.lon brings
     that longitude to face forward, then pitch by -view.lat brings that
     latitude level. Camera space has +Z toward the viewer, +Y up, +X right
     — z > 0 is the near side, z <= 0 is the far side and never drawn. */
  function toCamera(lat, lon, view) {
    const [x0, y0, z0] = toUnit(lat, lon);
    const yaw = -view.lon * D2R;
    const x1 = x0 * Math.cos(yaw) + z0 * Math.sin(yaw);
    const z1 = -x0 * Math.sin(yaw) + z0 * Math.cos(yaw);
    /* Same rotation shape as the yaw step above, applied to the y-z pair
       instead of x-z: y2 = y1 cos + z1 sin, z2 = -y1 sin + z1 cos. Getting
       this backwards (y2 = y1 cos - z1 sin, the more "obvious" pattern) is
       an easy mistake — it still LOOKS like a rotation, project/unproject
       stay exact inverses of each other either way, and the round trip
       test alone cannot catch it, because the bug is in what the camera
       means, not in whether the two functions agree with each other. Only
       checking a known point — the sub-observer point must land exactly at
       the disc centre — catches it. */
    const pitch = -view.lat * D2R;
    const y2 = y0 * Math.cos(pitch) + z1 * Math.sin(pitch);
    const z2 = -y0 * Math.sin(pitch) + z1 * Math.cos(pitch);
    return { x: x1, y: y2, z: z2 };
  }

  /* The public entry point: (lat, lon) -> where it sits on a unit disc, and
     whether it is on the visible hemisphere at all. x/y are already in
     "screen-ish" orientation (x right, y DOWN, matching canvas convention)
     so a caller only has to scale by the disc radius and add the canvas
     centre — see toScreen(). */
  function project(lat, lon, view) {
    const c = toCamera(lat, lon, view);
    return { x: c.x, y: -c.y, z: c.z, visible: c.z > 1e-9 };
  }

  const toScreen = (p, cx, cy, R) => ({ x: cx + p.x * R, y: cy + p.y * R });

  /* The inverse: a click at normalised disc coordinates (nx, ny), each in
     [-1, 1] with ny already flipped to match project()'s convention, back to
     (lat, lon) — or null if the click missed the sphere altogether. Solves
     for the one unknown, z, from the unit-sphere constraint, then undoes
     both camera rotations in reverse order. */
  function unproject(nx, ny, view) {
    const r2 = nx * nx + ny * ny;
    if (r2 > 1) return null;
    const x1 = nx, y2 = -ny, z2 = Math.sqrt(Math.max(0, 1 - r2));

    const pitch = -view.lat * D2R;
    const y0 = y2 * Math.cos(pitch) - z2 * Math.sin(pitch);
    const z1 = y2 * Math.sin(pitch) + z2 * Math.cos(pitch);

    const yaw = -view.lon * D2R;
    const x0 = x1 * Math.cos(yaw) - z1 * Math.sin(yaw);
    const z0 = x1 * Math.sin(yaw) + z1 * Math.cos(yaw);

    return { lat: Math.asin(Math.max(-1, Math.min(1, y0))) / D2R,
             lon: Math.atan2(x0, z0) / D2R };
  }

  /* ---------- lighting ----------

     Independent of the view entirely — the sun sits at a fixed point in the
     MOON's own reference frame at any given moment (sunLon sweeps once
     around per lunar cycle, the same K.LUNAR_CYCLE render.js's sunAzimuth
     already uses for the city view), so the terminator is a real place on
     the sphere's surface, not a screen-space lighting trick that would spin
     along with whatever way the player last dragged the camera. */
  function litness(lat, lon, sunLon) {
    const p = toUnit(lat, lon);
    const s = toUnit(0, sunLon);
    const d = p[0] * s[0] + p[1] * s[1] + p[2] * s[2];
    /* a soft floor rather than true black — regolith backscatters some
       light even in shadow, the same reasoning render.js's own litness
       uses for the city view */
    return 0.12 + 0.88 * Math.max(0, d);
  }

  /* ---------- drawing ----------

     The only part of this file that touches a canvas, and the only part
     that is not unit tested directly — everything it calls (project,
     litness, outlineOf) already is. */

  const FEATURE_TONE = {
    mare: '#3a4a5c', mareThin: '#3a4a5c', basin: '#4a4438', ray: '#e8e2d0', pole: '#8fd0ff'
  };

  function drawFeature(ctx, f, view, cx, cy, R, sunLon) {
    const centre = project(f.lat, f.lon, view);
    if (centre.z < -0.25) return;    // well onto the far side — skip entirely

    if (f.kind === 'ray') {
      const p = toScreen(centre, cx, cy, R);
      const l = litness(f.lat, f.lon, sunLon);
      const rr = Math.max(0.8, f.r * R / 90);
      ctx.fillStyle = `rgba(232,226,208,${0.5 + l * 0.4})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(232,226,208,${0.22 + l * 0.2})`; ctx.lineWidth = Math.max(0.5, rr * 0.18);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const far = project(f.lat + Math.sin(a) * f.r * 2.6, f.lon + Math.cos(a) * f.r * 2.6 / Math.max(0.2, Math.cos(f.lat * D2R)), view);
        if (!far.visible) continue;
        const q = toScreen(far, cx, cy, R);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      return;
    }

    if (f.kind === 'pole') {
      const p = toScreen(centre, cx, cy, R);
      const l = litness(f.lat, f.lon, sunLon);
      ctx.fillStyle = `rgba(143,208,255,${0.55 + l * 0.35})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.2, R * 0.012), 0, Math.PI * 2); ctx.fill();
      return;
    }

    const pts = outlineOf(f).map(([lat, lon]) => toScreen(project(lat, lon, view), cx, cy, R));
    const l = litness(f.lat, f.lon, sunLon);
    const tone = FEATURE_TONE[f.kind] || FEATURE_TONE.mare;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    const n = parseInt(tone.slice(1), 16);
    const rC = (n >> 16) & 255, gC = (n >> 8) & 255, bC = n & 255;
    const shade = 0.35 + l * 0.65;
    ctx.fillStyle = `rgba(${rC * shade | 0},${gC * shade | 0},${bC * shade | 0},${f.kind === 'basin' ? 0.35 : 0.8})`;
    ctx.fill();
  }

  /* opts: { view:{lon,lat}, sunLon, sites:[{id,lat,lon,pop}], activeId, cx, cy, R } */
  function draw(ctx, opts) {
    const { view, sunLon, sites, activeId, cx, cy, R } = opts;

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();

    /* base fallback fill, so any sliver the grid skips near the limb still
       reads as dark far-side ground rather than a gap */
    ctx.fillStyle = '#0c1018';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    /* the sphere itself, as a coarse lat/lon grid of shaded quads — see the
       module doc comment for why this beats an analytic terminator curve
       for a hand-rolled, style-matched renderer */
    const LAT_STEP = 12, LON_STEP = 15;
    for (let lat = -90; lat < 90; lat += LAT_STEP) {
      for (let lon = -180; lon < 180; lon += LON_STEP) {
        const corners = [
          project(lat, lon, view), project(lat, lon + LON_STEP, view),
          project(lat + LAT_STEP, lon + LON_STEP, view), project(lat + LAT_STEP, lon, view)
        ];
        if (!corners.every(c => c.visible)) continue;
        const midLat = lat + LAT_STEP / 2, midLon = lon + LON_STEP / 2;
        const l = litness(midLat, midLon, sunLon);
        const midZ = project(midLat, midLon, view).z;
        const limbFactor = 0.55 + 0.45 * Math.max(0, midZ);
        const base = 150 * l * limbFactor;
        ctx.fillStyle = `rgb(${(base * 1.02) | 0},${(base * 0.97) | 0},${(base * 0.88) | 0})`;
        ctx.beginPath();
        const p0 = toScreen(corners[0], cx, cy, R);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < 4; i++) { const p = toScreen(corners[i], cx, cy, R); ctx.lineTo(p.x, p.y); }
        ctx.closePath(); ctx.fill();
      }
    }

    for (const f of FEATURES) drawFeature(ctx, f, view, cx, cy, R, sunLon);

    /* city markers, sized by population on a compressed scale so a
       thousand-fold difference in population is still just a modest size
       difference on screen rather than one dot swallowing the globe */
    for (const site of sites || []) {
      const p = project(site.lat, site.lon, view);
      if (!p.visible) continue;
      const q = toScreen(p, cx, cy, R);
      const rr = Math.max(2.4, Math.min(9, 2.4 + Math.sqrt(Math.max(0, site.pop)) * 0.09));
      const active = site.id === activeId;
      ctx.fillStyle = active ? '#6ee7a0' : '#ffd479';
      ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = active ? '#0b1a10' : '#241a06'; ctx.lineWidth = 1.2;
      ctx.stroke();
      if (active) {
        ctx.strokeStyle = 'rgba(110,231,160,0.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(q.x, q.y, rr + 3.5, 0, Math.PI * 2); ctx.stroke();
      }
    }

    ctx.restore();

    /* the limb itself, for a crisp edge against the pop-up's background */
    ctx.strokeStyle = 'rgba(180,195,215,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  }

  window.LM_GLOBE = {
    FEATURES, outlineOf, project, unproject, toScreen, litness, toUnit, draw
  };
})();
