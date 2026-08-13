/* Lunar Metropolis — network connectivity.

   Three networks, one algorithm. Each is a flood fill from a set of source
   tiles through a set of conducting tiles, differing only in the two
   predicates handed in — so power reach, atmosphere reach and any future
   network share exactly one implementation rather than three that can drift
   apart. No DOM references.

   The lunar reframing of SimCity 2000's three utilities:
     transit tubes  -> roads:       zoned ground must physically touch one
     power conduits -> power lines: current spreads through developed
                                    buildings too, so a dense block needs
                                    only one connection
     atmosphere     -> water pipes: buried, so it coexists with whatever is
                                    already on the tile                        */

(function () {
  const { K } = window.LM_DATA;

  const idx = (x, y) => y * K.COLS + x;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < K.COLS && y < K.ROWS;
  const tileAt = (s, x, y) => inBounds(x, y) ? s.map[idx(x, y)] : null;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /* Flood fill from every source through every conductor. Sources are always
     included in the result whether or not they conduct, so a lone generator
     with no conduit still powers itself and its immediate neighbours. */
  function reach(s, isSource, conducts) {
    const set = new Set(), q = [];
    for (const t of s.map) {
      if (!isSource(t)) continue;
      const k = idx(t.x, t.y);
      if (!set.has(k)) { set.add(k); q.push(t); }
    }
    while (q.length) {
      const t = q.pop();
      for (const [dx, dy] of DIRS) {
        const n = tileAt(s, t.x + dx, t.y + dy);
        if (!n) continue;
        const k = idx(n.x, n.y);
        if (set.has(k) || !conducts(n)) continue;
        set.add(k); q.push(n);
      }
    }
    return set;
  }

  /* A tile counts as served if it is itself on the network or orthogonally
     touches it — the same "adjacent counts" rule SimCity 2000 uses, and what
     lets a block of zoning share one spur rather than needing its own. */
  function served(s, set, x, y) {
    if (set.has(idx(x, y))) return true;
    for (const [dx, dy] of DIRS) {
      if (inBounds(x + dx, y + dy) && set.has(idx(x + dx, y + dy))) return true;
    }
    return false;
  }

  const isGenerator = t => t.b && (t.b.type === 'solar' || t.b.type === 'reactor');
  const developed = t => t.zone && t.zone.stage > 0;

  /* Current flows along conduits, through the plants themselves, and through
     developed buildings. */
  function powerNet(s) {
    return reach(s, isGenerator,
      t => (t.b && (t.b.type === 'conduit' || t.b.type === 'solar' ||
                    t.b.type === 'reactor' || t.b.type === 'o2')) || developed(t));
  }

  /* Atmosphere runs through the buried mains and through pressurised
     buildings, out from each oxygen plant. */
  function airNet(s) {
    return reach(s, t => t.b && t.b.type === 'o2',
      t => t.pipe || developed(t) || (t.b && t.b.type === 'o2'));
  }

  /* Transit needs no source — a tube is useful simply by existing next to
     the ground it serves, exactly as a road is. */
  const isTube = t => !!(t && t.b && t.b.type === 'tube');
  function hasTransit(s, x, y) {
    if (isTube(tileAt(s, x, y))) return true;
    for (const [dx, dy] of DIRS) if (isTube(tileAt(s, x + dx, y + dy))) return true;
    return false;
  }

  /* Everything the growth model needs, computed once per simulated day
     rather than per tile — three flood fills over the map instead of
     thousands of independent searches. */
  function services(s) {
    return { power: powerNet(s), air: airNet(s) };
  }

  window.LM_GRID = {
    reach, served, services, powerNet, airNet, hasTransit,
    isGenerator, developed, idx, inBounds, tileAt, DIRS
  };
})();
