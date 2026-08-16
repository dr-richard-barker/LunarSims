/* Lunar Metropolis — transient set pieces.

   The visible half of the invasion deck: a saucer crossing the city, a beam
   coming down, a worm going under. Purely cosmetic, and deliberately held
   OUTSIDE the game state — a large city already serialises to about two
   megabytes and an animation that is over in eight seconds has no business
   being in a save file.

   THE CLOCK IS INJECTABLE, and that is the whole reason this module exists
   as a module rather than as a few variables in the renderer.
   requestAnimationFrame is throttled to roughly a third of a frame per second
   in some embedded browsers, so a set piece that lives for eight seconds
   cannot be caught mid-flight by taking a screenshot and hoping. With a clock
   that can be pinned, any moment of any effect can be frozen and looked at:

     LM_FX.setClock(() => 4000);   // four seconds into whatever is running

   No DOM references, so the harness can drive it headlessly too. */

(function () {
  let items = [];
  let clock = () => Date.now();
  let seq = 0;

  const setClock = fn => { clock = fn || (() => Date.now()); };
  const now = () => clock();

  /* Spawns a set piece. `dur` is in milliseconds; everything else is whatever
     that particular effect needs to draw itself. */
  function spawn(kind, opts) {
    const o = opts || {};
    const fx = Object.assign({
      id: ++seq, kind,
      t0: now(),
      dur: o.dur || 6000
    }, o);
    items.push(fx);
    return fx;
  }

  /* How far through its life a set piece is, 0..1. Exposed rather than
     computed at each draw site so the renderer and the tests agree. */
  function progress(fx) {
    const p = (now() - fx.t0) / Math.max(1, fx.dur);
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  /* Retires anything that has run its course. Called once per frame; cheap
     enough that it does not need to be throttled. */
  function update() {
    if (!items.length) return items;
    const t = now();
    items = items.filter(fx => (t - fx.t0) < fx.dur);
    return items;
  }

  const all = () => items;
  const clear = () => { items = []; };
  const count = () => items.length;

  window.LM_FX = { spawn, update, all, clear, count, progress, setClock, now };
})();
