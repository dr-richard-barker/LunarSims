/* Lunar Metropolis — the minimap.

   One renderer, drawn at two sizes: a small always-on map in the corner of
   the canvas, and a large one in a pop-up. Both are the same 128x128
   offscreen buffer scaled up with smoothing off, so a tile is a hard pixel
   rather than a blur, and the whole thing costs one paint per map change
   instead of one per frame.

   That caching matters. A 16,384-tile repaint is cheap once and wasteful
   sixty times a second, and the map only changes when the player or the
   director does something — which ui.js already knows, because it recomputes
   the utility networks at exactly that moment. So the minimap listens to the
   same signal agents.js does.

   No DOM: this module paints into canvases it is handed and answers questions
   about coordinates. Where those canvases live is ui.js's problem. */

(function () {
  const { K, ZONES } = window.LM_DATA;
  const T = window.LM_TERRAIN;

  /* the offscreen buffer — one pixel per tile, painted on demand */
  const buf = document.createElement('canvas');
  buf.width = K.COLS; buf.height = K.ROWS;
  const bctx = buf.getContext('2d');
  let dirty = true;

  const invalidate = () => { dirty = true; };

  const zoneColour = kind => {
    const z = ZONES.find(x => x.id === kind);
    return z ? z.colour : '#ffffff';
  };

  /* Structures worth a mark of their own. Networks are drawn as the thin
     connective tissue they are; plants and civic buildings as brighter
     points; wonders brightest of all, because on a map this size finding
     your own space elevator is most of what you want it for. */
  const BUILD_COLOUR = {
    tube: '#6f7a90', conduit: '#3f6f8a', o2: '#7fd8c8',
    solar: '#2f6fb0', reactor: '#ffd479',
    depot: '#ff9f6e', medbay: '#ff7a9c', training: '#8fd0ff',
    lab: '#c98bff', biodome: '#6ee7a0'
  };

  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const WONDERS = new Set(window.LM_DATA.BUILDINGS
    .filter(b => b.group === 'wonder').map(b => b.id));

  /* What colour is this tile on the minimap? Split out as a pure function
     rather than inlined in the paint loop, because it is the only part worth
     testing and canvas pixels cannot be read back in every browser — the
     harness checks the decision, not the bitmap. Returns [r, g, b]. */
  function colourFor(t) {
    /* Ground first: sun exposure sets the tone and height adds relief, so the
       crater floors read dark and the rims read bright — the same story the
       main view tells, at a glance. */
    const lit = 0.30 + 0.70 * (t.sun === undefined ? 1 : t.sun);
    const relief = 0.82 + (t.h / K.MAX_H) * 0.36;
    let r = 150 * lit * relief, g = 138 * lit * relief, b = 118 * lit * relief;
    if (t.t === 'skylight') return [12, 16, 26];

    if (t.b && WONDERS.has(t.b.type)) return [255, 246, 210];
    if (t.b && BUILD_COLOUR[t.b.type]) return hex(BUILD_COLOUR[t.b.type]);
    if (t.zone && t.zone.stage > 0) {
      /* developed ground in its kind's colour, brightening with density so a
         downtown is visibly the centre of the city */
      const c = hex(zoneColour(t.zone.kind));
      const k = 0.45 + (t.zone.stage / K.MAX_STAGE) * 0.55;
      return [c[0] * k, c[1] * k, c[2] * k];
    }
    if (t.zone) {
      const c = hex(zoneColour(t.zone.kind));     // zoned but not yet built
      return [c[0] * 0.30 + r * 0.4, c[1] * 0.30 + g * 0.4, c[2] * 0.30 + b * 0.4];
    }
    return [r, g, b];
  }

  /* The actual paint loop, over ANY 128x128 canvas and ANY decoded state —
     not just the live one this module caches. repaint() below is just this,
     called on the module's own singleton buffer; the globe's colony preview
     card (ui.js) calls it directly on a throwaway canvas of its own, for a
     state that was decoded once for the preview and is never the live game
     state, so it has no business sharing the cache this module invalidates
     on every map change. */
  function paintInto(canvas, s) {
    const c = canvas.getContext('2d');
    const img = c.createImageData(K.COLS, K.ROWS);
    const d = img.data;
    for (let i = 0; i < s.map.length; i++) {
      const col = colourFor(s.map[i]);
      const p = i * 4;
      d[p] = col[0] | 0; d[p + 1] = col[1] | 0; d[p + 2] = col[2] | 0; d[p + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }

  function repaint(s) {
    paintInto(buf, s);
    dirty = false;
  }

  /* Draws the map into a target canvas, with the current viewport outlined.
     `cam` is ui.cam; the box is worked out by inverting the same projection
     render.js uses rather than by guessing. */
  function draw(target, s, ui, R, viewW, viewH) {
    if (dirty) repaint(s);
    const ctx = target.getContext('2d');
    const w = target.width, h = target.height;

    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, w, h);

    /* the viewport rectangle. visibleRange gives tile bounds for the current
       camera, which is exactly the box we want — no second projection to
       drift out of step with the real one. */
    /* The view size is passed in rather than guessed: ui.js owns the canvas
       and knows its CSS dimensions, and a stale guess here would draw a
       viewport box that does not match what the player is looking at. */
    if (R && R.visibleRange && ui && viewW) {
      const rng = R.visibleRange(ui, viewW, viewH);
      const sx = w / K.COLS, sy = h / K.ROWS;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rng.xMin * sx, rng.yMin * sy,
                     (rng.xMax - rng.xMin) * sx, (rng.yMax - rng.yMin) * sy);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 0.75;
      ctx.strokeRect(rng.xMin * sx - 1, rng.yMin * sy - 1,
                     (rng.xMax - rng.xMin) * sx + 2, (rng.yMax - rng.yMin) * sy + 2);
    }
    ctx.strokeStyle = 'rgba(150,170,200,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  /* Where on the map did they click? Returned in tile coordinates. */
  function tileAtPoint(target, px, py) {
    const r = target.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(K.COLS - 1, Math.floor((px - r.left) / r.width * K.COLS))),
      y: Math.max(0, Math.min(K.ROWS - 1, Math.floor((py - r.top) / r.height * K.ROWS)))
    };
  }

  window.LM_MINIMAP = { draw, invalidate, tileAtPoint, repaint, paintInto, colourFor, buffer: buf };
})();
