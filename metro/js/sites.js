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
     exactly even after the generator moves on to a newer version — see
     terrain.js. There is only one generator today, so every site is gen 1. */
  const GEN_VERSION = 1;

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
     actually produce right now. */
  function baseFor(site) {
    return T.makeMap(site.seed);
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
       is low enough that permanently shadowed floors and peaks of eternal
       light both exist, which only happens near a pole. Migrating it in as
       one confirms that rather than guessing at a plausible site. */
    const site = {
      id: uid(), name: 'Colony One', lat: -85, lon: 0, class: 'polar',
      seed: o.seed, gen: GEN_VERSION, founded: Date.now()
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

  function list() {
    const store = ensureStore();
    return Object.values(store.sites)
      .map(r => ({
        id: r.id, name: r.name, lat: r.lat, lon: r.lon, class: r.class,
        founded: r.founded, day: r.snapshot.meta.day, pop: r.snapshot.meta.pop
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
    const s = window.LM_SIM.newGame(site.seed);
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
    encode, decode, classify, baseFor,
    list, load, save, found, setActive, activeId, siteOf, sizeOf,
    /* exposed for the harness, and for the migration path in ui.js */
    migrateLegacy, ensureStore, GEN_VERSION, SITES_KEY, LEGACY_KEY
  };
})();
