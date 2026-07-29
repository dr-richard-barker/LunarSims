/* Lunar Farm — the things that move.

   Purely cosmetic: crew walking the track network, rovers hauling between
   modules, and build bots that swarm anything newly raised. None of this feeds
   back into the simulation; it reads the same state the renderer does. */

(function () {
  const S = window.LF_SIM;
  const K = window.LF_DATA.K;

  const WALK = 0.85;    // tiles per second
  const ROVE = 2.1;
  const MAX_CREW_DOTS = 14;
  const MAX_ROVERS = 5;

  let agents = [];
  let builds = [];      // {x,y,w,h,t} construction sites, t counts down
  let netCache = { key: '', nodes: [], adj: new Map() };

  const nkey = (x, y) => x + ',' + y;

  /* The walkable graph: track tiles, plus the doorway tile of anything they touch. */
  function network(s) {
    const key = s.map.reduce((a, t) => a + (t.b ? t.b.type[0] : '.') , '') + '|' + s.fields.length;
    if (key === netCache.key) return netCache;

    const nodes = [], adj = new Map();
    const isNode = t => t && t.b && (t.b.type === 'track' || t.b.type === 'hab');
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
    netCache = { key, nodes, adj };
    return netCache;
  }

  function spawnCrew(s, net) {
    const start = net.nodes[Math.floor(Math.random() * net.nodes.length)];
    return {
      kind: 'crew',
      x: start.x, y: start.y, tx: start.x, ty: start.y,
      from: start, to: start, p: 1, speed: WALK * (0.75 + Math.random() * 0.5),
      bob: Math.random() * 6.28, tint: Math.random() < 0.5 ? '#e8edf7' : '#d8c9a8'
    };
  }

  function spawnRover(s, net) {
    const a = spawnCrew(s, net);
    a.kind = 'rover';
    a.speed = ROVE * (0.8 + Math.random() * 0.4);
    a.cargo = Math.random() < 0.5;
    return a;
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

  function noteBuilt(x, y, w, h) {
    builds.push({ x, y, w: w || 1, h: h || 1, t: 4.5, born: 4.5 });
  }

  function update(s, dt) {
    const net = network(s);
    if (!net.nodes.length) { agents = []; return; }

    /* population scales with the settlement */
    const wantCrew = Math.min(MAX_CREW_DOTS, s.crew * 2 + Math.floor(S.totalTiles(s) / 8));
    const wantRover = Math.min(MAX_ROVERS, 1 + Math.floor(s.fields.length / 2));
    const crew = agents.filter(a => a.kind === 'crew').length;
    const rovers = agents.filter(a => a.kind === 'rover').length;
    for (let i = crew; i < wantCrew; i++) agents.push(spawnCrew(s, net));
    for (let i = rovers; i < wantRover; i++) agents.push(spawnRover(s, net));
    if (crew > wantCrew || rovers > wantRover) {
      let dc = crew - wantCrew, dr = rovers - wantRover;
      agents = agents.filter(a => {
        if (a.kind === 'crew' && dc > 0) { dc--; return false; }
        if (a.kind === 'rover' && dr > 0) { dr--; return false; }
        return true;
      });
    }

    for (const a of agents) {
      /* a node that was bulldozed away leaves the agent stranded — respawn it */
      if (!net.adj.has(nkey(a.to.x, a.to.y))) {
        const n = net.nodes[Math.floor(Math.random() * net.nodes.length)];
        a.from = a.to = n; a.p = 1;
      }
      a.p += dt * a.speed;
      while (a.p >= 1) { a.p -= 1; retarget(a, net); }
      a.x = a.from.x + (a.to.x - a.from.x) * a.p;
      a.y = a.from.y + (a.to.y - a.from.y) * a.p;
      a.bob += dt * 9;
    }

    for (const b of builds) b.t -= dt;
    builds = builds.filter(b => b.t > 0);
  }

  const all = () => agents;
  const sites = () => builds;
  const siteAt = (x, y) => builds.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  function reset() { agents = []; builds = []; netCache = { key: '', nodes: [], adj: new Map() }; }

  window.LF_AGENTS = { update, all, sites, siteAt, noteBuilt, reset };
})();
