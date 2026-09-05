/* E3 — the structure of the ice resource.

   Two things the calibration depends on. First, richness is BIMODAL rather
   than continuous, because it is derived from a quantised sun raycast; that
   is why a richness threshold can only meaningfully sit in one narrow band.
   Second, the raw ice available within a bore's reach, which is what sets
   ICE_REFERENCE — the divisor converting a local ice sum into a yield. */
import { loadGame, instrument, save } from './lib.mjs';

const W = loadGame();
const cost = instrument(W);
const { LM_SIM: S, LM_TERRAIN: T, LM_DEEP: DP } = W;
const SEEDS = [7, 99, 555, 2026, 4242, 12345, 31337, 88];
const POLAR = { class: 'polar', sunSlope: W.LM_SITES.slopeFor(-85) };

const richness = [], reachSums = [];
for (const seed of SEEDS) {
  const s = S.newGame(seed, POLAR);
  s.peakPop = 1e9; s.research = 1e9; s.credits = 1e9;
  for (const t of s.map) if (t.deposit && t.deposit.kind === 'ice') richness.push(t.deposit.richness);
  /* the raw sum only at sites a bore could actually be put on */
  for (const t of s.map) {
    if (S.canPlace(s, t, 'sinkwell') !== null) continue;
    let sum = 0;
    const R = DP.ICE_RADIUS;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const n = T.tileAt(s, t.x + dx, t.y + dy);
      if (n && n.deposit && n.deposit.kind === 'ice') sum += n.deposit.richness;
    }
    reachSums.push(+sum.toFixed(4));
  }
}
richness.sort((a, b) => a - b); reachSums.sort((a, b) => a - b);
const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];

/* What each candidate divisor would do to the yield distribution. The clamp
   ceiling matters: a divisor that pins sites against it hides the penalty for
   crowding two bores onto one deposit, which is the behaviour it exists for. */
const sweep = [6, 8, 10, 12, 14, 16, 18, 20].map(ref => {
  const ys = reachSums.map(v => Math.max(DP.YIELD_MIN, Math.min(DP.YIELD_MAX, v / ref)));
  return { reference: ref, median: +q(ys, 0.5).toFixed(3), p95: +q(ys, 0.95).toFixed(3),
           saturatedPct: +(100 * ys.filter(y => y >= DP.YIELD_MAX - 1e-9).length / ys.length).toFixed(1) };
});

save('e3-ice-structure', {
  seeds: SEEDS,
  richness: { n: richness.length, values: richness,
              min: richness[0], max: richness[richness.length - 1] },
  reachSum: { n: reachSums.length, values: reachSums,
              min: reachSums[0], p25: q(reachSums, .25), median: q(reachSums, .5),
              p75: q(reachSums, .75), p95: q(reachSums, .95),
              max: reachSums[reachSums.length - 1] },
  referenceSweep: sweep,
  chosen: { ICE_RADIUS: DP.ICE_RADIUS, ICE_REFERENCE: DP.ICE_REFERENCE,
            YIELD_MIN: DP.YIELD_MIN, YIELD_MAX: DP.YIELD_MAX }
}, cost);
