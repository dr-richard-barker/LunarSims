/* Lunar Metropolis — many cities, one seed apiece.

   A city is not stored as its 16,384-tile map. T.makeMap(seed) is fully
   deterministic, so a founded colony is stored as its SEED plus a SPARSE
   list of what differs from freshly generated ground: height changes,
   cleared boulders, buildings, zoning, dust, pipes. Everything else —
   sunlight, deposits, the per-tile texture seed — is never mutated after
   generation, so it is never stored either. decode() regenerates all of it
   by regenerating the base and recomputing sun from the same heights a full
   makeMap always would.

   Measured on a 260-day, 618-person AI-run city: the full map serialises to
   1.92 MB. The sparse edit list for the same city is 48 KB — about a 40x
   reduction — plus up to 30 KB of daily history (bounded at 400 entries
   regardless of how old the city is) and under 1 KB of everything else.
   That is the entire reason keeping many cities is affordable: the measured
   localStorage quota in this environment is around 12 MB, which is two
   full-map cities, or dozens of sparse ones.

   No DOM references. ui.js owns *when* to save; this module owns *how*. */

(function () {
  const { K } = window.LM_DATA;
  const T = window.LM_TERRAIN;

  const SITES_KEY = 'lunar-metropolis.sites.v1';
  const LEGACY_KEY = 'lunar-metropolis.save.v2';

  /* Bumped only when makeMap's algorithm changes in a way that would
     regenerate different terrain from the same seed. A site records which
     generator built it, so an already-founded site keeps reproducing
     exactly even after the generator moves on to a newer version.

     gen 1 is every site founded before terrain classes existed — makeMap's
     original, unparameterised, polar-only algorithm. gen 2 is the
     class-aware generator: mare, highland and polar sites sited anywhere on
     the Moon, each with a sunSlope drawn from its own latitude rather than
     the one fixed global constant gen 1 always used. baseFor() below is the
     one place that reads this field and decides which of the two to call —
     a gen 1 site is never handed to the parameterised path, so it can never
     regenerate even slightly different ground. */
  const GEN_VERSION = 2;

  /* Near a pole the sun barely clears the horizon, so a low ridge throws a
     shadow for a long way — SUN_SLOPE is that threshold, and until this
     phase it was the one fixed number every site in the game used, because
     there was only ever one site. Interpolated by latitude: unchanged at
     the pole (so gen 1 sites and a freshly founded polar gen 2 site read
     identically), and much higher at the equator.

     Measured on real generated terrain rather than assumed: at the pole
     (0.16) 8.9% of tiles are permanently shadowed and 660 hold ice; at 0.9,
     that is 0.5% shadowed and 31 ice deposits — better than an order of
     magnitude down, which is what "almost no ice at the equator" actually
     means in this engine (seedDeposits in terrain.js keys ice off exactly
     this derived field, unchanged).

     What does NOT hold at the equator is the polar game's other half —
     scarce peaks of eternal light. Permanent light gets MORE common as
     shadow gets rarer (68% of tiles read as a "peak" at 0.9, against 26% at
     the pole), not rarer: there is no equatorial equivalent of hunting for
     the one well-lit rim. What replaces it is a different siting puzzle,
     for the two wonders that read sun directly — a heliostat crown (needs
     peak sun AND height 8+) is easy to justify almost anywhere sun-wise on
     a highland site, and nearly impossible on a mare one no matter how
     bright, because mare's own relief rarely reaches height 8 at all; a
     radio telescope (needs a genuinely shadowed crater floor) goes from a
     five-minute search at a pole to a real hunt once shadow itself is this
     rare. The trade the player is solving changes shape by latitude rather
     than staying the same trade at a smaller scale. */
  const SLOPE_POLE = 0.16, SLOPE_EQUATOR = 0.9;
  function slopeFor(lat) {
    const frac = 1 - Math.min(1, Math.abs(lat) / 90);   // 0 at the pole, 1 at the equator
    return SLOPE_POLE + (SLOPE_EQUATOR - SLOPE_POLE) * frac;
  }

  /* The UI only ever displays dust to the nearest percent (see ui.js's tile
     panel), so storing more precision than the player can see buys nothing
     — this is the one field where rounding is a deliberate size choice
     rather than something JSON forces on us. Every other field round-trips
     exactly: JSON.stringify/parse recovers a JS number bit for bit
     regardless of its decimal length, so nothing else needs rounding to be
     lossless. */
  const EPS_DUST = 0.01;

  const uid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* Coarse classification from latitude — used to label a site, and (from
     Phase 3 on) to decide how terrain.js generates it. Kept here, about site
     IDENTITY, rather than in terrain.js, which is about generation. */
  function classify(lat) {
    const a = Math.abs(lat);
    if (a >= 75) return 'polar';
    if (a <= 20) return 'mare';
    return 'highland';
  }

  /* The pristine terrain a site would generate today, before any player
     edit. Regenerated on every encode AND decode rather than cached, so the
     base a diff is measured against can never drift from what makeMap would
     actually produce right now.

     Dispatches on the site's OWN generator version, not the current
     GEN_VERSION — a gen 1 site calls makeMap with no options at all, the
     exact call every site in the game made before terrain classes existed,
     so it can never regenerate as anything but what it always has been. */
  function baseFor(site) {
    if (!site.gen || site.gen <= 1) return T.makeMap(site.seed);
    return T.makeMap(site.seed, { class: site.class, sunSlope: slopeFor(site.lat) });
  }

  /* ---------- sparse encode / decode ---------- */

  function encode(s, site) {
    const base = baseFor(site);
    const edits = [];
    for (let i = 0; i < s.map.length; i++) {
      const a = s.map[i], b = base.map[i];
      const e = {};
      if (a.h !== b.h) e.h = a.h;
      if (a.t !== b.t) e.t = a.t;
      if ((a.dust || 0) > EPS_DUST) e.du = Math.round(a.dust * 100) / 100;
      if (a.b) e.b = a.b;
      if (a.pipe) e.p = 1;
      if (a.zone) e.z = a.zone;
      if (a.pattern) e.pa = a.pattern;
      if (a.snatched) e.sn = a.snatched;
      if (Object.keys(e).length) { e.i = i; edits.push(e); }
    }
    const meta = {};
    for (const k in s) if (k !== 'map') meta[k] = s[k];
    return { edits, meta };
  }

  /* The inverse. Regenerates the base, applies every edit, and — only if an
     edit could have changed what blocks the sun — recomputes sun for the
     whole map, the same call makeMap itself ends with. h and t are the only
     fields sun depends on, so a save with neither in its edit list never
     pays for the raycast at all. */
  function decode(site, snapshot) {
    const w = baseFor(site);
    let geom = false;
    for (const e of snapshot.edits) {
      const t = w.map[e.i];
      if (e.h !== undefined) { t.h = e.h; geom = true; }
      if (e.t !== undefined) { t.t = e.t; geom = true; }
      if (e.du !== undefined) t.dust = e.du;
      if (e.b !== undefined) t.b = e.b;
      if (e.p) t.pipe = true;
      if (e.z !== undefined) t.zone = e.z;
      if (e.pa !== undefined) t.pattern = e.pa;
      if (e.sn !== undefined) t.snatched = e.sn;
    }
    if (geom) T.computeSun(w);
    return Object.assign({}, snapshot.meta, { map: w.map, seed: site.seed });
  }

  /* ---------- the store ---------- */

  function readStore() {
    try {
      const raw = localStorage.getItem(SITES_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || o.version !== 1 || !o.sites) return null;
      return o;
    } catch (e) { return null; }
  }

  function writeStore(store) {
    try { localStorage.setItem(SITES_KEY, JSON.stringify(store)); return true; }
    catch (e) { return false; }
  }

  /* Reads the pre-v3 single-city save and gives it a site of its own, so the
     player's existing colony becomes colony one rather than being discarded
     the day this ships. Runs at most once: once the new store exists at all,
     migration never runs again, even if the legacy key is still sitting in
     localStorage untouched (it is never deleted). */
  function migrateLegacy() {
    let raw;
    try { raw = localStorage.getItem(LEGACY_KEY); } catch (e) { return null; }
    if (!raw) return null;
    let o;
    try { o = JSON.parse(raw); } catch (e) { return null; }
    if (!o || !window.LM_SIM || o.version !== window.LM_SIM.STATE_VERSION ||
        !o.map || o.map.length !== K.COLS * K.ROWS) return null;

    /* The game's terrain has always been tuned for a polar site — SUN_SLOPE
       was low enough that permanently shadowed floors and peaks of eternal
       light both exist, which only happens near a pole. Migrating it in as
       one confirms that rather than guessing at a plausible site.

       gen is hardcoded to 1 here, deliberately never GEN_VERSION: this save
       was built by makeMap's original, unparameterised call, and baseFor()
       has to keep calling it exactly that way forever, however many
       generator versions come after it. */
    const site = {
      id: uid(), name: 'Colony One', lat: -85, lon: 0, class: 'polar',
      seed: o.seed, gen: 1, founded: Date.now()
    };
    return { site, snapshot: encode(o, site) };
  }

  function ensureStore() {
    let store = readStore();
    if (store) return store;
    const migrated = migrateLegacy();
    store = { version: 1, activeId: null, sites: {} };
    if (migrated) {
      store.sites[migrated.site.id] = Object.assign({}, migrated.site, { snapshot: migrated.snapshot });
      store.activeId = migrated.site.id;
    }
    writeStore(store);
    return store;
  }

  /* ---------- public surface ---------- */

  /* peakPop and research are included alongside pop specifically so a
     caller can compute a site's ERA (LM_ERAS.index only ever reads those
     two fields) without decoding its full map — a Colonies list showing
     twenty cities should not have to regenerate twenty maps just to say
     what era each one has reached. */
  function list() {
    const store = ensureStore();
    return Object.values(store.sites)
      .map(r => ({
        id: r.id, name: r.name, lat: r.lat, lon: r.lon, class: r.class,
        founded: r.founded, day: r.snapshot.meta.day, pop: r.snapshot.meta.pop,
        peakPop: r.snapshot.meta.peakPop || 0, research: r.snapshot.meta.research || 0,
        credits: r.snapshot.meta.credits || 0
      }))
      .sort((a, b) => a.founded - b.founded);
  }

  const activeId = () => ensureStore().activeId;

  /* Loads the live state for a site, or null if it has no snapshot to decode
     (should not happen through found(), which always seeds one). */
  function load(id) {
    const rec = ensureStore().sites[id];
    if (!rec || !rec.snapshot) return null;
    return decode(rec, rec.snapshot);
  }

  /* Writes the live state back into its site's slot and makes it active. */
  function save(id, s) {
    const store = ensureStore();
    const rec = store.sites[id];
    if (!rec) return false;
    rec.snapshot = encode(s, rec);
    store.activeId = id;
    return writeStore(store);
  }

  /* Founds a new site and seeds it with a freshly generated, untouched city,
     so it has something to decode from the instant anyone switches to it. */
  function found(name, lat, lon, seed) {
    const store = ensureStore();
    const id = uid();
    const site = {
      id, name, lat, lon, class: classify(lat),
      seed: seed === undefined ? Math.floor(Math.random() * 999999) : seed,
      gen: GEN_VERSION, founded: Date.now()
    };
    const s = window.LM_SIM.newGame(site.seed, { class: site.class, sunSlope: slopeFor(site.lat) });
    store.sites[id] = Object.assign({}, site, { snapshot: encode(s, site) });
    writeStore(store);
    return id;
  }

  function setActive(id) {
    const store = ensureStore();
    if (!store.sites[id]) return false;
    store.activeId = id;
    return writeStore(store);
  }

  /* True only for a site nobody has actually played yet: day one, no edits.
     What "founded but not lived in" means, and the one condition relocate()
     is allowed to act on. */
  function isUntouched(id) {
    const r = ensureStore().sites[id];
    if (!r || !r.snapshot) return false;
    return r.snapshot.meta.day === 1 && r.snapshot.edits.length === 0;
  }

  /* Moves a site to a different landing spot IN PLACE — same id, fresh
     terrain at the new coordinates. Deliberately narrow: refuses anything
     that is not isUntouched(), because relocating a city with real
     buildings on it is not a coherent operation and nothing in the game
     asks for that. This exists for exactly one caller — the first-boot
     flow, which silently founds a default colony so the rest of the UI
     always has something valid to render, then immediately offers the
     globe to pick somewhere else. Without this, declining the default spot
     would leave that auto-created colony behind as a dead, empty stub
     cluttering the Colonies list forever. */
  function relocate(id, lat, lon, seed) {
    if (!isUntouched(id)) return false;
    const store = ensureStore();
    const rec = store.sites[id];
    const site = {
      id, name: rec.name, lat, lon, class: classify(lat),
      seed: seed === undefined ? Math.floor(Math.random() * 999999) : seed,
      gen: GEN_VERSION, founded: rec.founded
    };
    const s = window.LM_SIM.newGame(site.seed, { class: site.class, sunSlope: slopeFor(site.lat) });
    store.sites[id] = Object.assign({}, site, { snapshot: encode(s, site) });
    return writeStore(store);
  }

  function siteOf(id) {
    const r = ensureStore().sites[id];
    if (!r) return null;
    return { id: r.id, name: r.name, lat: r.lat, lon: r.lon, class: r.class,
             seed: r.seed, gen: r.gen, founded: r.founded };
  }

  const sizeOf = id => {
    const r = ensureStore().sites[id];
    return r ? JSON.stringify(r).length : 0;
  };

  window.LM_SITES = {
    encode, decode, classify, slopeFor, baseFor,
    list, load, save, found, relocate, isUntouched, setActive, activeId, siteOf, sizeOf,
    /* exposed for the harness, and for the migration path in ui.js */
    migrateLegacy, ensureStore, GEN_VERSION, SITES_KEY, LEGACY_KEY
  };
})();
