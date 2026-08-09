/* Artemis City — the things that move.

   Purely cosmetic: suited crew walking the road network between developed
   ground, and rovers hauling along whatever rail has been laid. Modeled
   directly on farm/js/agents.js's proven pattern — a cached walkable graph,
   agents that interpolate edge-to-edge and retarget on arrival, spawn counts
   scaled to the settlement. None of this feeds back into the simulation; it
   reads the same state the renderer does, same one-way dependency the
   README's testing section relies on for data/grid/zones/sim/autopilot.js. */

(function () {
  const S = window.LC_SIM, GRID = window.LC_GRID;
  const K = window.LC_DATA.K;

  const WALK = 0.8;     // tiles per second
  const ROVE = 2.0;
  const MAX_CREW = 16;
  const MAX_ROVERS = 6;

  let agents = [];
  let netCache = { key: '', nodes: [], adj: new Map(), scannedAt: 0 };
  let railCache = { key: '', nodes: [], adj: new Map(), scannedAt: 0 };

  /* City's map (80x56) is roughly 12x the tile count of Lunar Farm's — a
     full-map scan every animation frame (farm's own cadence) would be real
     work at this scale. Roads/zones/fields only change from discrete player
     or Automanage actions, never mid-frame, so rescanning a few times a
     second is still instant to the eye and bounds the cost regardless of
     map size. */
  const SCAN_INTERVAL_MS = 700;

  const nkey = (x, y) => x + ',' + y;

  function graph(s, isNode) {
    const nodes = [], adj = new Map();
    for (const t of s.map) {
      if (!isNode(t)) continue;
      nodes.push(t);
      adj.set(nkey(t.x, t.y), []);
    }
    for (const t of nodes) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = S.tileAt(s, t.x + dx, t.y + dy);
        if (isNode(n)) adj.get(nkey(t.x, t.y)).push(n);
      }
    }
    return { nodes, adj };
  }

  const mapKey = s => s.map.reduce((a, t) => a + (t.b ? t.b.type[0] : (t.zone ? t.zone.kind[0] : (t.f ? 'F' : '.'))), '') + '|' + s.fields.length;

  /* Walkable for crew: the road network, the Command Module, any zoned
     tile with a real building on it (stage >= 1), and grow-hall ground —
     i.e. anywhere there is actually somewhere to walk to or from. */
  const isCrewNode = t => t && (
    (t.b && (t.b.type === 'track' || t.b.type === 'rail' || t.b.type === 'command')) ||
    (t.zone && t.zone.stage >= 1) || t.f
  );

  /* Rail is its own graph — rovers stay on the metals, same separation
     Lunar Farm's trains keep from its general crew/rover network. */
  const isRailNode = t => t && t.b && t.b.type === 'rail';

  function network(s) {
    const now = Date.now();
    if (now - netCache.scannedAt < SCAN_INTERVAL_MS) return netCache;
    const key = mapKey(s);
    if (key !== netCache.key) {
      const g = graph(s, isCrewNode);
      netCache = { key, nodes: g.nodes, adj: g.adj, scannedAt: now };
    } else {
      netCache.scannedAt = now;
    }
    return netCache;
  }

  function railway(s) {
    const now = Date.now();
    if (now - railCache.scannedAt < SCAN_INTERVAL_MS) return railCache;
    const key = mapKey(s);
    if (key !== railCache.key) {
      const g = graph(s, isRailNode);
      railCache = { key, nodes: g.nodes, adj: g.adj, scannedAt: now };
    } else {
      railCache.scannedAt = now;
    }
    return railCache;
  }

  function spawnCrew(net) {
    const start = net.nodes[Math.floor(Math.random() * net.nodes.length)];
    return {
      kind: 'crew',
      x: start.x, y: start.y, from: start, to: start, p: 1,
      speed: WALK * (0.75 + Math.random() * 0.5),
      bob: Math.random() * 6.28, tint: Math.random() < 0.5 ? '#e8edf7' : '#d8c9a8'
    };
  }

  function spawnRover(net) {
    const start = net.nodes[Math.floor(Math.random() * net.nodes.length)];
    return {
      kind: 'rover',
      x: start.x, y: start.y, from: start, to: start, p: 1,
      speed: ROVE * (0.8 + Math.random() * 0.4),
      cargo: Math.random() < 0.5, bob: 0
    };
  }

  function retarget(a, net) {
    const here = net.adj.get(nkey(a.to.x, a.to.y));
    if (!here || !here.length) {
      const n = net.nodes[Math.floor(Math.random() * net.nodes.length)];
      a.from = a.to = n; a.p = 1;
      return;
    }
    /* prefer not to double back, so the walk reads as purposeful */
    const forward = here.filter(n => !(n.x === a.from.x && n.y === a.from.y));
    const pool = forward.length ? forward : here;
    a.from = a.to;
    a.to = pool[Math.floor(Math.random() * pool.length)];
    a.p = 0;
  }

  function update(s, dt) {
    const net = network(s);
    const rail = railway(s);

    const wantCrew = net.nodes.length ? Math.min(MAX_CREW, 2 + Math.floor(s.pop / 2)) : 0;
    const wantRover = rail.nodes.length >= 2 ? Math.min(MAX_ROVERS, 1 + Math.floor(S.count(s, 'miner') / 2)) : 0;

    const crew = agents.filter(a => a.kind === 'crew').length;
    const rovers = agents.filter(a => a.kind === 'rover').length;
    for (let i = crew; i < wantCrew; i++) agents.push(spawnCrew(net));
    for (let i = rovers; i < wantRover; i++) agents.push(spawnRover(rail));
    if (crew > wantCrew || rovers > wantRover) {
      let dc = crew - wantCrew, dr = rovers - wantRover;
      agents = agents.filter(a => {
        if (a.kind === 'crew' && dc > 0) { dc--; return false; }
        if (a.kind === 'rover' && dr > 0) { dr--; return false; }
        return true;
      });
    }

    for (const a of agents) {
      const g = a.kind === 'rover' ? rail : net;
      /* a node bulldozed out from under it — respawn somewhere valid */
      if (!g.adj.has(nkey(a.to.x, a.to.y)) || !g.nodes.length) {
        if (!g.nodes.length) continue;
        const n = g.nodes[Math.floor(Math.random() * g.nodes.length)];
        a.from = a.to = n; a.p = 1;
      }
      a.p += dt * a.speed;
      while (a.p >= 1) { a.p -= 1; retarget(a, g); }
      a.x = a.from.x + (a.to.x - a.from.x) * a.p;
      a.y = a.from.y + (a.to.y - a.from.y) * a.p;
      a.bob += dt * 9;
    }
  }

  const all = () => agents;
  function reset() {
    agents = [];
    netCache = { key: '', nodes: [], adj: new Map(), scannedAt: 0 };
    railCache = { key: '', nodes: [], adj: new Map(), scannedAt: 0 };
  }

  window.LC_AGENTS = { update, all, reset };
})();
