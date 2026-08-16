/* Lunar Metropolis — the invasion deck.

   A second, entirely separate roster from disasters.js, on its own toggle.
   The disaster deck is grounded and is what the teaching module leans on;
   this one is a 1950s B-movie. Keeping them apart means a player who wants
   one is never forced into the other, and the Academy module's framing
   survives the game also having flying saucers in it.

   Same contract as disasters.js: no DOM, an injectable random source so the
   tests are deterministic, every event returns a past-tense sentence for the
   log, and nothing here can end a run. Two of the six do no damage at all.

   Every effect is a change to the SIMULATION. The matching animation is
   spawned separately through LM_FX by whoever called fire() — the sim knows
   nothing about the renderer, same one-way dependency as everywhere else. */

(function () {
  const { K, INVASIONS } = window.LM_DATA;
  const T = window.LM_TERRAIN, G = window.LM_GRID;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const byId = id => INVASIONS.find(d => d.id === id);
  const DIS = () => window.LM_DISASTERS;

  /* Reuses the disaster deck's idea of where the city is — an event aimed at
     empty regolith sixty tiles from anything is a log line, not an event. */
  function targetFrom(s, rnd, spill) {
    const b = DIS() ? DIS().cityBounds(s) : null;
    if (!b) return null;
    const pad = spill === undefined ? 2 : spill;
    const x = Math.round(b.x0 - pad + rnd() * (b.x1 - b.x0 + pad * 2));
    const y = Math.round(b.y0 - pad + rnd() * (b.y1 - b.y0 + pad * 2));
    return T.tileAt(s, clamp(x, 0, K.COLS - 1), clamp(y, 0, K.ROWS - 1));
  }

  /* ---------- the six ---------- */

  /* Harmless by design. Marks empty ground with a pattern the renderer draws
     and nothing else reads. Half the deck being pure spectacle is the point:
     an invasion roster where every card costs you something is just the
     disaster deck wearing a rubber mask. */
  function circles(s, t, rnd) {
    let marked = 0;
    const rings = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < rings; i++) {
      const cx = t.x + Math.round((rnd() - 0.5) * 12);
      const cy = t.y + Math.round((rnd() - 0.5) * 12);
      const r = 2 + Math.floor(rnd() * 3);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const n = T.tileAt(s, cx + dx, cy + dy);
          if (!n || n.b || n.zone) continue;
          const d = Math.hypot(dx, dy);
          if (Math.abs(d - r) > 0.6) continue;      // the ring itself, not the disc
          n.pattern = (n.pattern || 0) + 1;
          marked++;
        }
      }
    }
    return `Figures were found pressed into the regolith near ${t.x + 1}, ${t.y + 1} ` +
           `— ${rings} rings, ${marked} tiles, no tracks leading in or out.`;
  }

  /* Cuts a line across the city. Everything under the beam loses what was on
     it; the ground is left scorched rather than cratered, which is what
     distinguishes it from the meteor. */
  function ufo(s, t, rnd) {
    const horiz = rnd() < 0.5;
    const len = 16 + Math.floor(rnd() * 14);
    const half = Math.floor(len / 2);
    let razed = 0;
    const path = [];
    for (let i = -half; i <= half; i++) {
      const n = T.tileAt(s, t.x + (horiz ? i : 0), t.y + (horiz ? 0 : i));
      if (!n) continue;
      path.push([n.x, n.y]);
      if (n.b || n.zone) razed++;
      n.b = null; n.zone = null;
      n.dust = clamp((n.dust || 0) + 0.5, 0, 1);
      if (n.t === 'flat') n.t = 'rough';
    }
    return { msg: `A saucer crossed at ${t.x + 1}, ${t.y + 1} with its beam lit and ` +
                  `burned a line through ${razed} tiles of city.`,
             path, horiz };
  }

  /* Takes exactly one structure and leaves the ground immaculate. */
  function abduction(s, t, rnd) {
    /* aimed at something worth taking, not at open ground */
    let best = null, bestD = 1e9;
    for (const n of s.map) {
      if (!n.b && !(n.zone && n.zone.stage > 0)) continue;
      const d = Math.hypot(n.x - t.x, n.y - t.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (!best) return { msg: 'A beam swept the surface and found nothing worth taking.', taken: null };
    const what = best.b ? best.b.type : `${best.zone.kind} block`;
    best.b = null; best.zone = null;
    /* the tidy circle of swept ground it leaves behind */
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const n = T.tileAt(s, best.x + dx, best.y + dy);
        if (!n || Math.hypot(dx, dy) > 2.2) continue;
        n.dust = 0;
        if (n.t === 'rough') n.t = 'flat';
      }
    }
    return { msg: `Something took the ${what} at ${best.x + 1}, ${best.y + 1} clean off the Moon, ` +
                  `and swept the ground around it on the way out.`,
             taken: { x: best.x, y: best.y } };
  }

  /* The one card in the deck that is good news. Scrubs the dust field across
     a wide area — which the arrays under it feel immediately — and leaves
     enough material behind to be worth studying. */
  function herald(s, t, rnd) {
    const r = 14;
    let cleaned = 0, before = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const n = T.tileAt(s, t.x + dx, t.y + dy);
        if (!n || Math.hypot(dx, dy) > r) continue;
        if ((n.dust || 0) > 0.02) cleaned++;
        before += n.dust || 0;
        n.dust = 0;
      }
    }
    const windfall = 400 + Math.round(before * 90);
    s.research = (s.research || 0) + windfall;
    return `A silver figure on a board crossed the district at ${t.x + 1}, ${t.y + 1} and took ` +
           `every speck of dust with it — ${cleaned} tiles scoured clean, and ${windfall.toLocaleString()} ` +
           `worth of research out of what it left on the instruments.`;
  }

  /* Surfaces, crosses, goes back under. Reuses the terrain-editing path the
     meteor already established, but as a trench rather than a crater. */
  function worm(s, t, rnd) {
    const horiz = rnd() < 0.5;
    const len = 14 + Math.floor(rnd() * 12);
    const half = Math.floor(len / 2);
    let wrecked = 0;
    const path = [];
    for (let i = -half; i <= half; i++) {
      const n = T.tileAt(s, t.x + (horiz ? i : 0), t.y + (horiz ? 0 : i));
      if (!n) continue;
      path.push([n.x, n.y]);
      if (n.b || n.zone) wrecked++;
      n.b = null; n.zone = null; n.pipe = false;
      n.t = 'rough';
      T.lower(s, n.x, n.y);
    }
    if (path.length) T.computeSunNear(s, t.x, t.y, half + K.RAY_LEN);
    return { msg: `Something enormous surfaced at ${t.x + 1}, ${t.y + 1}, crossed ${path.length} tiles ` +
                  `of city and went back under. ${wrecked} tiles went with it.`,
             path, horiz };
  }

  /* A district goes quietly wrong. No structural damage at all — the cost is
     entirely in land value, and it wears off. */
  function snatchers(s, t, rnd) {
    const r = 4;
    const until = s.day + K.SNATCH_DAYS;
    let taken = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const n = T.tileAt(s, t.x + dx, t.y + dy);
        if (!n || Math.hypot(dx, dy) > r) continue;
        if (!n.zone || n.zone.stage === 0) continue;
        n.snatched = until;
        taken++;
      }
    }
    return `Everyone in the district around ${t.x + 1}, ${t.y + 1} is subtly, politely wrong. ` +
           (taken ? `${taken} blocks affected; it should wear off in ${K.SNATCH_DAYS} days.`
                  : 'There was nobody there to replace.');
  }

  const EFFECTS = { circles, ufo, abduction, herald, worm, snatchers };

  /* ---------- firing ---------- */

  const deck = s => INVASIONS.filter(d => s.day >= d.minDay);

  function chance(s) {
    const b = DIS() ? DIS().cityBounds(s) : null;
    const size = b ? b.n : 0;
    return Math.min(K.INVASION_MAX_CHANCE,
      K.INVASION_BASE_CHANCE * (1 + size / K.DISASTER_SCALE_TILES));
  }

  /* Applies one named event. Returns a descriptor including whatever the
     renderer needs to stage the matching animation — the path a saucer flew,
     the tile a beam came down on — without this module knowing the renderer
     exists. */
  function fire(s, id, tile, rnd) {
    rnd = rnd || Math.random;
    const d = byId(id);
    if (!d) return null;
    const t = tile || targetFrom(s, rnd);
    if (!t) return null;
    const raw = EFFECTS[id](s, t, rnd);
    const out = typeof raw === 'string' ? { msg: raw } : raw;
    s.lastInvasion = s.day;
    s.lastInvasionId = id;
    if (window.LM_SIM) window.LM_SIM.pushLog(s, `${d.glyph} ${d.name}. ${out.msg}`);
    return Object.assign({ id, x: t.x, y: t.y }, out);
  }

  function maybeFire(s, rnd) {
    rnd = rnd || Math.random;
    if (!s.invasionOn) return null;
    if (s.day < K.INVASION_GRACE) return null;
    if (s.day - (s.lastInvasion ?? -999) < K.INVASION_COOLDOWN) return null;
    const pool = deck(s);
    if (!pool.length) return null;
    if (rnd() > chance(s)) return null;

    const total = pool.reduce((a, d) => a + d.weight, 0);
    let roll = rnd() * total;
    let pick = pool[pool.length - 1];
    for (const d of pool) { roll -= d.weight; if (roll <= 0) { pick = d; break; } }
    return fire(s, pick.id, null, rnd);
  }

  /* Snatched districts recover on their own. Called from the tick. */
  function expireSnatched(s) {
    for (const t of s.map) {
      if (t.snatched && s.day >= t.snatched) t.snatched = 0;
    }
  }

  const isSnatched = (s, t) => !!(t.snatched && s.day < t.snatched);

  window.LM_INVASION = {
    maybeFire, fire, chance, deck, byId, expireSnatched, isSnatched, INVASIONS
  };
})();
