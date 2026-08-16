/* Lunar Metropolis — the things that move.

   Purely cosmetic. Pedestrians on the developed ground and in the biodomes,
   and moon cars, buses and trains on the transit tubes. None of this feeds
   back into the simulation and none of it is saved: it reads the same state
   the renderer does, which is the same one-way dependency every other
   DOM-free module here relies on.

   The pattern — a cached network graph, agents that interpolate edge to edge
   and retarget on arrival, spawn counts scaled to the settlement — is carried
   over from city/js/agents.js, where it is proven. Two things are different
   here, both because this map is 128x128 rather than 80x56:

   1. The graph is rebuilt on an explicit invalidate() rather than by hashing
      the map every scan. city/ builds a 16,384-character string to detect
      changes, which is cheap on its map and wasteful on this one. ui.js
      already knows exactly when the map changed — it recomputes the networks
      at that moment — so it says so instead.

   2. Trains run CORRIDORS, not the graph. A train that wandered the street
      lattice at random junctions would read as a very long car. Straight runs
      of tube are found once and followed end to end. */

(function () {
  const { K } = window.LM_DATA;
  const T = window.LM_TERRAIN;

  /* tiles per second */
  const WALK = 0.55, CAR = 2.6, BUS = 1.7, TRAIN = 4.2;

  const MAX_PED = 70, MAX_CAR = 55, MAX_BUS = 12, MAX_TRAIN = 5;
  const MIN_CORRIDOR = 8;          // tubes in a straight line before a train will use it

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const nkey = (x, y) => x + ',' + y;

  let agents = [];
  let cache = null;                // { streets, walk, corridors }
  let dirty = true;

  /* ---------- graphs ---------- */

  function graph(s, isNode) {
    const nodes = [], adj = new Map();
    for (const t of s.map) {
      if (!isNode(t)) continue;
      nodes.push(t);
      adj.set(nkey(t.x, t.y), []);
    }
    for (const t of nodes) {
      for (const [dx, dy] of DIRS) {
        const n = T.tileAt(s, t.x + dx, t.y + dy);
        if (isNode(n)) adj.get(nkey(t.x, t.y)).push(n);
      }
    }
    return { nodes, adj };
  }

  const isTube = t => !!(t && t.b && t.b.type === 'tube');
  /* Somewhere a person would actually be: developed ground, the biodomes and
     plazas, and the tubes that join them. */
  const isWalkable = t => !!t && (
    isTube(t) ||
    (t.zone && t.zone.stage >= 1) ||
    (t.b && (t.b.type === 'biodome' || t.b.type === 'medbay' ||
             t.b.type === 'training' || t.b.type === 'lab'))
  );

  /* A power conduit standing in a street has not stopped the street being a
     street — the AI director's lattice deliberately gives the conduit column
     the tile wherever it crosses a tube run (it has to; power is a flood fill
     and transit is not), and a human laying a conduit across an avenue does
     the same thing. Counting only tubes therefore found a longest run of
     THREE tiles in a fully built city, and no train could ever appear.
     Corridors span those crossings, but still have to be mostly tube so a
     line of pylons across open ground is not mistaken for an avenue. */
  const isConduitTile = t => !!(t && t.b && t.b.type === 'conduit');
  const isCorridorCell = t => isTube(t) || isConduitTile(t);

  /* Straight runs of street, long enough to be worth a train. Scanned along
     both axes; a run is stored as its two endpoints and its length. */
  function corridors(s) {
    const out = [];
    const scan = (fixed, len, get, make) => {
      for (let a = 0; a < fixed; a++) {
        let run = 0, tubes = 0;
        for (let b = 0; b <= len; b++) {
          const cell = b < len ? get(a, b) : null;
          if (isCorridorCell(cell)) { run++; if (isTube(cell)) tubes++; continue; }
          if (run >= MIN_CORRIDOR && tubes >= run * 0.6) out.push(make(a, b - run, b - 1));
          run = 0; tubes = 0;
        }
      }
    };
    scan(K.ROWS, K.COLS, (y, x) => T.tileAt(s, x, y),
         (y, x0, x1) => ({ ax: x0, ay: y, bx: x1, by: y, len: x1 - x0 }));
    scan(K.COLS, K.ROWS, (x, y) => T.tileAt(s, x, y),
         (x, y0, y1) => ({ ax: x, ay: y0, bx: x, by: y1, len: y1 - y0 }));
    return out;
  }

  function nets(s) {
    if (cache && !dirty) return cache;
    cache = {
      streets: graph(s, isTube),
      walk: graph(s, isWalkable),
      corridors: corridors(s)
    };
    dirty = false;
    return cache;
  }

  /* Called by ui.js at the moment it recomputes the utility networks — the
     one place that already knows the map changed. */
  function invalidate() { dirty = true; }

  /* ---------- spawning ---------- */

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  const LIVERY = ['#ffb84d', '#5fc9ff', '#6ee7a0', '#ff7a9c', '#c98bff'];

  function spawnOn(g, kind, speed, extra) {
    if (!g.nodes.length) return null;
    const start = pick(g.nodes);
    return Object.assign({
      kind, x: start.x, y: start.y, from: start, to: start, p: 1,
      speed: speed * (0.75 + Math.random() * 0.5),
      bob: Math.random() * 6.28
    }, extra || {});
  }

  function spawnTrain(list) {
    if (!list.length) return null;
    const c = pick(list);
    return {
      kind: 'train', corridor: c,
      x: c.ax, y: c.ay, p: 0, dir: 1,
      speed: TRAIN * (0.85 + Math.random() * 0.3),
      livery: pick(LIVERY), bob: 0
    };
  }

  function retarget(a, g) {
    const here = g.adj.get(nkey(a.to.x, a.to.y));
    if (!here || !here.length) {
      const n = pick(g.nodes);
      a.from = a.to = n; a.p = 1;
      return;
    }
    /* prefer not to double back, so the trip reads as purposeful */
    const forward = here.filter(n => !(n.x === a.from.x && n.y === a.from.y));
    a.from = a.to;
    a.to = pick(forward.length ? forward : here);
    a.p = 0;
  }

  /* ---------- update ---------- */

  /* How many of each the city should currently be showing. Everything scales
     with population and saturates, so a metropolis is busy without the agent
     count following it to ten thousand. */
  function quotas(s, g) {
    const pop = s.pop || 0;
    if (!g.walk.nodes.length) return { ped: 0, car: 0, bus: 0, train: 0 };
    return {
      ped: Math.min(MAX_PED, Math.floor(pop / 18)),
      car: g.streets.nodes.length ? Math.min(MAX_CAR, Math.floor(pop / 26)) : 0,
      bus: g.streets.nodes.length ? Math.min(MAX_BUS, Math.floor(pop / 320)) : 0,
      train: Math.min(MAX_TRAIN, g.corridors.length ? 1 + Math.floor(pop / 2200) : 0)
    };
  }

  function update(s, dt) {
    const g = nets(s);
    const want = quotas(s, g);
    const have = { ped: 0, car: 0, bus: 0, train: 0 };
    for (const a of agents) have[a.kind]++;

    for (let i = have.ped; i < want.ped; i++) {
      const a = spawnOn(g.walk, 'ped', WALK, { tint: Math.random() < 0.5 ? '#e8edf7' : '#d8c9a8' });
      if (a) agents.push(a);
    }
    for (let i = have.car; i < want.car; i++) {
      const a = spawnOn(g.streets, 'car', CAR, { livery: pick(LIVERY) });
      if (a) agents.push(a);
    }
    for (let i = have.bus; i < want.bus; i++) {
      const a = spawnOn(g.streets, 'bus', BUS, { livery: pick(LIVERY) });
      if (a) agents.push(a);
    }
    for (let i = have.train; i < want.train; i++) {
      const a = spawnTrain(g.corridors);
      if (a) agents.push(a);
    }
    /* trim whatever is now over quota, oldest first */
    for (const k of ['ped', 'car', 'bus', 'train']) {
      let over = have[k] - want[k];
      if (over <= 0) continue;
      agents = agents.filter(a => (a.kind === k && over > 0) ? (over--, false) : true);
    }

    for (const a of agents) {
      if (a.kind === 'train') {
        /* Corridors are straight, so the train is a single parameter sliding
           between the endpoints, turning round at each end. */
        const c = a.corridor;
        a.p += dt * a.speed * a.dir / Math.max(1, c.len);
        if (a.p >= 1) { a.p = 1; a.dir = -1; }
        else if (a.p <= 0) { a.p = 0; a.dir = 1; }
        a.x = c.ax + (c.bx - c.ax) * a.p;
        a.y = c.ay + (c.by - c.ay) * a.p;
        continue;
      }
      const net = a.kind === 'ped' ? g.walk : g.streets;
      if (!net.nodes.length) continue;
      /* the ground moved out from under it — put it somewhere that exists */
      if (!net.adj.has(nkey(a.to.x, a.to.y))) {
        const n = pick(net.nodes);
        a.from = a.to = n; a.p = 1;
      }
      a.p += dt * a.speed;
      while (a.p >= 1) { a.p -= 1; retarget(a, net); }
      a.x = a.from.x + (a.to.x - a.from.x) * a.p;
      a.y = a.from.y + (a.to.y - a.from.y) * a.p;
      a.bob += dt * 9;
    }
  }

  const all = () => agents;
  function reset() { agents = []; cache = null; dirty = true; }

  window.LM_AGENTS = {
    update, all, reset, invalidate,
    /* exposed for the harness */
    graph, corridors, quotas, isTube, isWalkable, isCorridorCell, MIN_CORRIDOR
  };
})();
