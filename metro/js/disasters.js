/* Lunar Metropolis — the disaster deck.

   OFF by default, and nothing here can end a run. The worst outcome is
   ground the player has to clear and rebuild, which is a setback rather than
   a loss — the same "no fail state" rule the rest of the game follows.

   Four events, each spending a different currency so that no one defence
   answers all of them:

     Seal Blowout    takes networks  — vents the mains under a district
     Dust Surge      takes economy   — fouls arrays and land value, breaks nothing
     Solar Flare     takes power     — city-wide, temporary, destroys nothing
     Meteor Strike   takes ground    — the only event that rewrites terrain

   Repair coverage mitigates all four. That is deliberate: it gives the
   Safety & Repair budget a second job besides holding density, so a player
   who runs disasters has a reason to fund it beyond the one it already had.

   No DOM references — harness.html drives every event headlessly, and the
   random source is injectable so the tests are deterministic. */

(function () {
  const { K, DISASTERS } = window.LM_DATA;
  const T = window.LM_TERRAIN, G = window.LM_GRID;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const byId = id => DISASTERS.find(d => d.id === id);

  /* ---------- where the city is ---------- */

  /* Events aim at the city, not at the map. A meteor landing on empty
     regolith 60 tiles from anything is not an event, it is a log line — so
     the target is drawn from the built-up area, with a little spill outside
     it so the edges of town are not magically safe. */
  function cityBounds(s) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    for (const t of s.map) {
      if (!t.b && !t.zone && !t.pipe) continue;
      n++;
      if (t.x < x0) x0 = t.x; if (t.x > x1) x1 = t.x;
      if (t.y < y0) y0 = t.y; if (t.y > y1) y1 = t.y;
    }
    if (!n) return null;
    return { x0, y0, x1, y1, n };
  }

  function pickTarget(s, rnd, spill) {
    const b = cityBounds(s);
    if (!b) return null;
    const pad = spill === undefined ? 2 : spill;
    const x = Math.round(b.x0 - pad + rnd() * (b.x1 - b.x0 + pad * 2));
    const y = Math.round(b.y0 - pad + rnd() * (b.y1 - b.y0 + pad * 2));
    return T.tileAt(s, clamp(x, 0, K.COLS - 1), clamp(y, 0, K.ROWS - 1));
  }

  /* How much of the damage the city's own repair cover absorbs, at the point
     of impact: 0 means nothing was funded or built, 1 means fully covered. */
  function mitigation(s, x, y) {
    const B = window.LM_BUDGET, SV = window.LM_SERVICES;
    if (!B) return 0;
    const eff = B.effects(s);
    let local = 0;
    if (SV) {
      const cov = SV.coverage(s, eff);
      local = cov.safety[G.idx(x, y)] || 0;
    }
    return clamp(eff.safety * 0.45 + local * 0.55, 0, 1);
  }

  /* ---------- the four events ----------
     Each returns a short past-tense sentence for the log, so the UI never has
     to know what any individual event does. */

  /* Vents the buried mains across a patch and knocks the district above them
     back a stage. The mains are the repair job — until they are relaid the
     ground has no atmosphere and cannot develop. */
  function blowout(s, t, mit) {
    const r = mit > 0.6 ? 1 : 2;
    let vented = 0, lost = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const n = T.tileAt(s, t.x + dx, t.y + dy);
        if (!n || Math.hypot(dx, dy) > r + 0.4) continue;
        if (n.pipe) { n.pipe = false; vented++; }
        if (n.zone && n.zone.stage > 0 && mit < 0.75) {
          n.zone.stage--; n.zone.growth = 0; lost++;
        }
      }
    }
    return `A seal blew at ${t.x + 1}, ${t.y + 1} — ${vented} tiles of atmosphere main vented` +
           (lost ? ` and ${lost} developed tiles lost density.` : ' but the district held.');
  }

  /* Lofts charged regolith across a wide area. Breaks nothing: it loads the
     existing dust field, which fouls solar output and land value until it
     settles out on its own. */
  function dustsurge(s, t, mit) {
    const r = 9;
    const load = 0.55 * (1 - mit * 0.5);
    let hit = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const n = T.tileAt(s, t.x + dx, t.y + dy);
        if (!n) continue;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        n.dust = clamp((n.dust || 0) + load * (1 - d / r), 0, 1);
        hit++;
      }
    }
    return `Charged dust lofted across ${hit} tiles around ${t.x + 1}, ${t.y + 1}. ` +
           'Arrays under it will earn less until it settles.';
  }

  /* Forces the grid into protective shutdown. City-wide, temporary, and the
     only event that destroys nothing at all. */
  function flare(s, t, mit) {
    const days = Math.max(2, Math.round(6 * (1 - mit * 0.6)));
    s.flareDays = Math.max(s.flareDays || 0, days);
    return `A particle event forced the grid into protective shutdown. ` +
           `Generation is cut for ${days} days.`;
  }

  /* The only event that touches terrain. Everything inside the crater is
     destroyed, the floor is driven down, and the rim is left as boulder
     field that has to be cleared before anything can be rebuilt. */
  function meteor(s, t, mit) {
    const r = mit > 0.7 ? 1 : 2;
    let razed = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const n = T.tileAt(s, t.x + dx, t.y + dy);
        if (!n) continue;
        const d = Math.hypot(dx, dy);
        if (d > r + 0.4) continue;
        if (n.b || n.zone || n.pipe) razed++;
        n.b = null; n.zone = null; n.pipe = false;
        n.t = d <= r - 1 ? 'rough' : 'boulder';
      }
    }
    /* Drive the floor down a level, then let the terrain module relax the
       surrounding ground back within the one-level step rule — the same
       cascade the player's own Lower Land tool uses, so a crater looks like
       terrain rather than a hole punched through it. */
    const centre = T.tileAt(s, t.x, t.y);
    if (centre) {
      T.lower(s, t.x, t.y);
      T.computeSunNear(s, t.x, t.y, r + K.RAY_LEN);
    }
    return `A meteoroid struck at ${t.x + 1}, ${t.y + 1}, cratering the ground and ` +
           `destroying ${razed} tiles of city.`;
  }

  const EFFECTS = { blowout, dustsurge, flare, meteor };

  /* ---------- firing ---------- */

  /* Only events whose minimum day has passed are in the deck, so a young
     colony sees the survivable ones first and the meteor arrives late. */
  function deck(s) {
    return DISASTERS.filter(d => s.day >= d.minDay);
  }

  function chance(s) {
    const b = cityBounds(s);
    const size = b ? b.n : 0;
    const scaled = K.DISASTER_BASE_CHANCE * (1 + size / K.DISASTER_SCALE_TILES);
    return Math.min(K.DISASTER_MAX_CHANCE, scaled);
  }

  /* Applies one named event at a chosen or random spot. Exposed separately
     from maybeFire so the harness — and any future "trigger disaster" debug
     control — can fire one on demand without waiting on the dice. */
  function fire(s, id, tile, rnd) {
    rnd = rnd || Math.random;
    const d = byId(id);
    if (!d) return null;
    const t = tile || pickTarget(s, rnd);
    if (!t) return null;
    const mit = mitigation(s, t.x, t.y);
    const msg = EFFECTS[id](s, t, mit);
    s.lastDisaster = s.day;
    s.lastDisasterId = id;
    if (window.LM_SIM) window.LM_SIM.pushLog(s, `${d.glyph} ${d.name}. ${msg}`);
    return { id, x: t.x, y: t.y, mitigation: mit, msg };
  }

  /* One roll per day. Returns the event that fired, or null. */
  function maybeFire(s, rnd) {
    rnd = rnd || Math.random;
    if (!s.disastersOn) return null;
    if (s.day < K.DISASTER_GRACE) return null;
    if (s.day - (s.lastDisaster ?? -999) < K.DISASTER_COOLDOWN) return null;
    const pool = deck(s);
    if (!pool.length) return null;
    if (rnd() > chance(s)) return null;

    const total = pool.reduce((a, d) => a + d.weight, 0);
    let roll = rnd() * total;
    let pick = pool[pool.length - 1];
    for (const d of pool) { roll -= d.weight; if (roll <= 0) { pick = d; break; } }
    return fire(s, pick.id, null, rnd);
  }

  window.LM_DISASTERS = {
    maybeFire, fire, chance, deck, mitigation, cityBounds, byId, DISASTERS
  };
})();
