/* Lunar Metropolis — colonies you are not looking at, still moving.

   Away colonies used to be frozen, deliberately, for a real reason: getting
   a background city's state into memory to tick it at all is not cheap.
   Measured directly, on a real 22,500-person, 1,085-tile city:

     decode()  makeMap + reapply ~4,700 edits          ~43ms
     encode()  makeMap + diff the live map back down    ~29ms
     one S.tick()                                        ~8ms

   Those three numbers are why this exists as a SCHEDULER rather than as
   "just also tick every founded site every frame": decode+encode overhead
   is fixed per operation, paid once whether you advance a colony by one day
   or by thirty, so the only sane design is to advance it in an occasional
   BURST rather than continuously. Measured end to end on that same large
   city, decode -> N ticks -> encode -> save:

     N=1   107ms      N=10  240ms
     N=5   161ms      N=30  511ms

   Half a second is a real, felt freeze — nowhere near the ~80ms this was
   sketched at before actually measuring the compounded cost. MAX_CATCHUP_DAYS
   below is chosen to keep the worst case under roughly 180ms, not 30 days'
   worth: still a burst, just a bounded one.

   Only ONE colony is ever advanced per scheduler tick, and only ever the
   one that has gone longest without a turn — never the active city, which
   the player's own tick loop already advances every frame. That is what
   lets founding more colonies taper the pace gracefully (each one simply
   waits longer for its turn) rather than needing an arbitrary cap on how
   many can exist.

   DOM-free, and deliberately does not own a timer itself — see ui.js for
   the setInterval that actually calls step() on a cadence, the same split
   openGlobe()/drawGlobe() already use. Kept this way so the scheduling
   DECISION (which colony, how many days) stays a pure function callable
   from the harness, and the one place with a side effect (tickOne) is a
   thin, obvious wrapper around LM_SITES/LM_SIM calls that already exist. */

(function () {
  /* Matches ui.js's own DAY_MS at 1x speed — a background colony that gets
     a turn reasonably often ends up advancing at roughly the pace it would
     have if it were the one you were playing, just in bursts rather than
     continuously, instead of visibly lagging real time. */
  const REAL_MS_PER_SIM_DAY = 1100;

  /* Measured, not guessed: caps the worst case around 180ms on a large,
     heavily-developed city — see the module doc comment above for the
     numbers this was picked against. A colony that has been neglected far
     longer than this simply stays behind rather than trying to fully catch
     up in one operation; it gets there over several of its own turns. */
  const MAX_CATCHUP_DAYS = 6;

  /* How many simulated days a site owes, given when it was last ticked.
     Pure function of primitives so it is trivial to test without faking a
     clock: pass `now` explicitly rather than reading Date.now() inside. */
  function daysOwed(lastRealTick, now, msPerDay, maxCatchup) {
    const perDay = msPerDay || REAL_MS_PER_SIM_DAY;
    const cap = maxCatchup === undefined ? MAX_CATCHUP_DAYS : maxCatchup;
    const elapsed = Math.max(0, now - (lastRealTick || 0));
    const owed = Math.floor(elapsed / perDay);
    return Math.max(1, Math.min(cap, owed));
  }

  /* The least-recently-ticked founded site, excluding the active one — the
     active city is the player's own, advanced every frame by the normal
     tick loop, and ticking it a second time here would double-advance it.
     Returns null when there is nothing to advance: no sites at all, or
     exactly one and it is the active one. */
  function pickNext(sites, activeId) {
    let best = null;
    for (const r of sites) {
      if (r.id === activeId) continue;
      if (!best || (r.lastRealTick || 0) < (best.lastRealTick || 0)) best = r;
    }
    return best ? best.id : null;
  }

  /* Advances exactly one site by its owed catch-up burst and persists it
     through the background write path — LM_SITES.saveBackground(), never
     save(), specifically so ticking a colony nobody is looking at can never
     make it "the" active site in storage. Returns the number of simulated
     days actually advanced, or 0 if the site could not be loaded (should
     not happen for anything pickNext() would ever return; defensive). */
  function tickOne(id, now) {
    const t = now === undefined ? Date.now() : now;
    const SITES = window.LM_SITES, S = window.LM_SIM;
    const row = SITES.list().find(r => r.id === id);
    if (!row) return 0;
    const owed = daysOwed(row.lastRealTick, t);
    const s = SITES.load(id);
    if (!s) return 0;
    for (let i = 0; i < owed; i++) S.tick(s);
    SITES.saveBackground(id, s);
    SITES.stampTick(id, t);
    return owed;
  }

  /* The whole scheduler step, in one call: pick, then advance. Returns the
     id ticked and how many days it moved, or null if nothing was eligible.
     This is the one function ui.js's setInterval actually calls. */
  function step(activeId, now) {
    const t = now === undefined ? Date.now() : now;
    const sites = window.LM_SITES ? window.LM_SITES.list() : [];
    const id = pickNext(sites, activeId);
    if (!id) return null;
    const days = tickOne(id, t);
    return { id, days };
  }

  window.LM_EMPIRE = {
    daysOwed, pickNext, tickOne, step,
    REAL_MS_PER_SIM_DAY, MAX_CATCHUP_DAYS
  };
})();
