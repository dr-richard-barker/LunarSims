/* Artemis City — network connectivity and survey bounds.
   The road network is a straight port of Lunar Farm's serviceSet() BFS
   (farm/js/sim.js), except the flood starts from the Command Module — the
   one fixed root every save has — rather than from every habitat tile,
   since housing here is grown by zoning, not placed one module at a time.
   serviceSet() is now one call of the more general networkFrom(), which
   the Power/Water map-view layers reuse with a different source predicate
   — same algorithm, not a second implementation of it. */

(function () {
  const { K } = window.LC_DATA;
  const idx = (x, y) => y * K.COLS + x;
  const tileAt = (s, x, y) =>
    (x < 0 || y < 0 || x >= K.COLS || y >= K.ROWS) ? null : s.map[idx(x, y)];

  /* Has this ground actually been surveyed? Placement, zoning and mining
     all gate on this — the map is generated at full size up front (see
     sim.js's makeMap), but only the charter's revealed rectangle is
     buildable until it's expanded. */
  function inRevealed(s, x, y) {
    const r = s.revealed;
    if (!r) return true; // defensive default for any state predating this field
    return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  }

  /* Tiles that carry the network: roads, rail, and the command root itself. */
  function carries(t) {
    return t.b && (t.b.type === 'track' || t.b.type === 'rail' || t.b.type === 'command');
  }

  /* BFS flood from every tile matching `isSource`, across road/rail exactly
     as serviceSet() always did, then expanded to every tile orthogonally
     touching the flooded network (so a zoned or built tile counts as
     reached the moment its edge meets a road, without having to sit on
     one). This is the whole connectivity model — service coverage, and
     (as map-view data only, per the Power/Water layers) power and water
     reach are all this same flood from a different starting set. */
  function networkFrom(s, isSource) {
    const net = new Set(), queue = [];
    for (const t of s.map) {
      if (isSource(t)) { net.add(idx(t.x, t.y)); queue.push(t); }
    }
    while (queue.length) {
      const t = queue.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tileAt(s, t.x + dx, t.y + dy);
        if (!n || !carries(n)) continue;
        const k = idx(n.x, n.y);
        if (net.has(k)) continue;
        net.add(k); queue.push(n);
      }
    }
    const touching = new Set(net);
    for (const k of net) {
      const t = s.map[k];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tileAt(s, t.x + dx, t.y + dy);
        if (n && (n.b || n.f || n.zone)) touching.add(idx(n.x, n.y));
      }
    }
    return touching;
  }

  function serviceSet(s) {
    return networkFrom(s, t => t.b && t.b.type === 'command');
  }

  function isServiced(s, touching, x, y) { return touching.has(idx(x, y)); }

  /* Straight-line distance in tiles to the nearest tile matching `pred`,
     capped at `cap` — used by the land-value composite for hazard/amenity
     proximity. Cheap brute-force scan over the full generated map; still
     fine at one call per zoned tile per day, not per frame. */
  function nearestDist(s, x, y, pred, cap) {
    let best = cap;
    for (const t of s.map) {
      if (!pred(t)) continue;
      const d = Math.abs(t.x - x) + Math.abs(t.y - y);
      if (d < best) best = d;
      if (best === 0) break;
    }
    return best;
  }

  window.LC_GRID = { serviceSet, networkFrom, isServiced, nearestDist, inRevealed, idx, tileAt, carries };
})();
