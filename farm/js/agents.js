/* Lunar Farm — the things that move.

   Purely cosmetic: crew walking the track network, rovers hauling between
   modules, freight trains working the rail, and build bots that swarm anything
   newly raised. None of this feeds back into the simulation; it reads the same
   state the renderer does. */

(function () {
  const S = window.LF_SIM;
  const K = window.LF_DATA.K;

  const WALK = 0.85;    // tiles per second
  const ROVE = 2.1;
  const TRAIN = 2.9;
  const CAR_GAP = 0.62; // tiles between coupled wagons
  const MAX_CREW_DOTS = 14;
  const MAX_ROVERS = 5;
  const MAX_TRAINS = 3;

  let agents = [];
  let trains = [];
  let builds = [];      // {x,y,w,h,t} construction sites, t counts down
  let netCache = { key: '', nodes: [], adj: new Map() };
  let railCache = { key: '', nodes: [], adj: new Map() };

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

  const mapKey = s => s.map.reduce((a, t) => a + (t.b ? t.b.type[0] : '.'), '') + '|' + s.fields.length;

  /* The walkable graph: tracks, rail and habitats. */
  function network(s) {
    const key = mapKey(s);
    if (key === netCache.key) return netCache;
    const g = graph(s, t => t && t.b && (t.b.type === 'track' || t.b.type === 'rail' || t.b.type === 'hab'));
    netCache = { key, nodes: g.nodes, adj: g.adj };
    return netCache;
  }

  /* Rail is its own graph — trains cannot leave the metals. */
  function railway(s) {
    const key = mapKey(s);
    if (key === railCache.key) return railCache;
    const g = graph(s, t => t && t.b && t.b.type === 'rail');
    railCache = { key, nodes: g.nodes, adj: g.adj };
    return railCache;
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

  /* ---------- trains ----------
     A consist is a path of rail nodes plus a scalar distance along it. Wagons sit
     a fixed distance behind the locomotive on the same path, which is what makes
     them swing through corners properly instead of sliding sideways. */

  function newTrain(rail) {
    /* start somewhere with somewhere to go — a stranded single tile is no use */
    const usable = rail.nodes.filter(n => (rail.adj.get(nkey(n.x, n.y)) || []).length > 0);
    const pool = usable.length ? usable : rail.nodes;
    const start = pool[Math.floor(Math.random() * pool.length)];
    return {
      path: [{ x: start.x, y: start.y }],
      dist: 0,
      cars: 2 + Math.floor(Math.random() * 2),
      speed: TRAIN * (0.85 + Math.random() * 0.3),
      cargo: Math.random() < 0.6,
      blink: Math.random() * 6.28
    };
  }

  function extend(rail, tr, want) {
    let guard = 0;
    while (pathLen(tr.path) < tr.dist + want && guard++ < 64) {
      const head = tr.path[tr.path.length - 1];
      const prev = tr.path[tr.path.length - 2];
      const here = rail.adj.get(nkey(head.x, head.y));
      if (!here || !here.length) return false;
      const forward = here.filter(n => !prev || !(n.x === prev.x && n.y === prev.y));
      const pool = forward.length ? forward : here;
      const n = pool[Math.floor(Math.random() * pool.length)];
      tr.path.push({ x: n.x, y: n.y });
    }
    return true;
  }

  function pathLen(path) {
    let d = 0;
    for (let i = 1; i < path.length; i++) {
      d += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    }
    return d;
  }

  /* point at distance d along the path, with the heading there */
  function pointAt(path, d) {
    if (d < 0) return null;
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      const seg = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
      if (acc + seg >= d) {
        const u = seg > 0 ? (d - acc) / seg : 0;
        return {
          x: path[i - 1].x + (path[i].x - path[i - 1].x) * u,
          y: path[i - 1].y + (path[i].y - path[i - 1].y) * u,
          dx: path[i].x - path[i - 1].x,
          dy: path[i].y - path[i - 1].y
        };
      }
      acc += seg;
    }
    return null;
  }

  function updateTrains(s, dt) {
    const rail = railway(s);
    if (rail.nodes.length < 3) { trains = []; return; }

    const want = Math.min(MAX_TRAINS, Math.max(1, Math.floor(rail.nodes.length / 7)));
    while (trains.length < want) trains.push(newTrain(rail));
    while (trains.length > want) trains.pop();

    for (const tr of trains) {
      /* a line torn up under the train — put it back on the metals */
      if (!rail.adj.has(nkey(tr.path[tr.path.length - 1].x, tr.path[tr.path.length - 1].y))) {
        Object.assign(tr, newTrain(rail));
      }
      tr.dist += tr.speed * dt;
      tr.blink += dt * 3;
      if (!extend(rail, tr, tr.cars * CAR_GAP + 4)) {
        /* the line runs out under it — park at the buffers rather than vanish */
        tr.dist = Math.min(tr.dist, Math.max(0, pathLen(tr.path) - 0.02));
        continue;
      }
      /* drop consumed track behind the last wagon */
      const keepFrom = tr.dist - (tr.cars * CAR_GAP + 1.2);
      while (tr.path.length > 2) {
        const seg = Math.hypot(tr.path[1].x - tr.path[0].x, tr.path[1].y - tr.path[0].y);
        if (seg > keepFrom) break;
        tr.path.shift();
        tr.dist -= seg;
      }
      if (tr.path.length > 220) Object.assign(tr, newTrain(rail));
    }
  }

  /* Positions of every carriage, nose first — what the renderer draws. */
  function trainCars() {
    const out = [];
    for (const tr of trains) {
      for (let i = 0; i <= tr.cars; i++) {
        const p = pointAt(tr.path, tr.dist - i * CAR_GAP);
        if (p) out.push({ ...p, lead: i === 0, cargo: tr.cargo, blink: tr.blink, idx: i });
      }
    }
    return out;
  }

  function update(s, dt) {
    updateTrains(s, dt);
    for (const b of builds) b.t -= dt;
    builds = builds.filter(b => b.t > 0);

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

  }

  const all = () => agents;
  const rail = () => trainCars();
  const sites = () => builds;
  const siteAt = (x, y) => builds.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  function reset() {
    agents = []; trains = []; builds = [];
    netCache = { key: '', nodes: [], adj: new Map() };
    railCache = { key: '', nodes: [], adj: new Map() };
  }

  window.LF_AGENTS = { update, all, rail, sites, siteAt, noteBuilt, reset, _trains: () => trains };
})();
