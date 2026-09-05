/* E2 — where each habitat strategy can physically go.

   Surface zoning can go almost anywhere; a bore needs ice on a level pad; a
   tube arcology needs a tube, and only one class of site has one. This counts
   legal sites for each, per seed and per site class, using the game's own
   canPlace() rather than a reimplementation of its rules. */
import { loadGame, instrument, save } from './lib.mjs';

const W = loadGame();
const cost = instrument(W);
const { LM_SIM: S, LM_TERRAIN: T, LM_DEEP: DP } = W;

/* Each class is generated at a latitude that would ACTUALLY produce it, with
   the sun slope the game derives from that latitude, rather than at a uniform
   default slope. Holding the slope fixed while varying only the terrain shape
   compares three worlds none of which the game would ever build: the shadow
   budget is a function of latitude, and shadow is where the ice is. */
const LAT = { polar: -85, highland: -50, mare: -5 };
const CLASSES = ['polar', 'highland', 'mare'].map(c =>
  [c, { class: c, sunSlope: W.LM_SITES.slopeFor(LAT[c]) }]);
const SEEDS = [7, 99, 555, 2026, 4242, 12345, 31337, 88];

const rows = [];
for (const [cls, opts] of CLASSES) {
  for (const seed of SEEDS) {
    const s = S.newGame(seed, opts);
    s.peakPop = 1e9; s.research = 1e9; s.credits = 1e9;   // isolate SITING from progression
    const tube = (s.tubes || [])[0] || null;
    const count = id => {
      let n = 0;
      for (const t of s.map) if (S.canPlace(s, t, id) === null) n++;
      return n;
    };
    let iceTiles = 0, buildable = 0;
    for (const t of s.map) {
      if (t.deposit && t.deposit.kind === 'ice') iceTiles++;
      if (T.buildable(t) && !t.b && !t.zone) buildable++;
    }
    rows.push({
      cls, seed, lat: LAT[cls], sunSlope: +opts.sunSlope.toFixed(4), buildable, iceTiles,
      tubeLength: tube ? tube.path.length : 0,
      tubeSpan: tube ? tube.span : 0,
      sinkwell: count('sinkwell'), cistern: count('cistern'),
      foundry: count('foundry'), core: count('core'), tubeway: count('tubeway')
    });
  }
}
save('e2-site-availability', { seeds: SEEDS, latitudes: LAT, classes: CLASSES.map(c => c[0]), rows }, cost);
