/* E4 — the three habitat strategies, costed against each other.

   The paper's central comparison. For each strategy: what it houses, what it
   costs to build, what it draws, how much SURFACE it occupies, and whether it
   gives the atmosphere budget anything back.

   Accounting note, because the comparison is only honest if it is stated. A
   surface unit here is one high-density habitation tile at its final stage —
   the best the surface can do per tile, not the average. It is credited only
   with its own tile, but a zoned tile is worthless without transit, power and
   atmosphere within one tile of it, so the lattice overhead is reported
   separately rather than hidden: the director's own spacing is a tube street
   every third row and a conduit column every fourth, and mains are
   subsurface and free of surface area. */
import { loadGame, instrument, save } from './lib.mjs';

const W = loadGame();
const cost = instrument(W);
const { LM_SIM: S, LM_TERRAIN: T, LM_DEEP: DP, LM_DATA: D } = W;
const K = D.K;
const POLAR = { class: 'polar', sunSlope: W.LM_SITES.slopeFor(-85) };
const SEEDS = [7, 99, 555, 2026, 4242, 12345, 31337, 88];

const rows = [];

/* --- surface --- */
const hab = D.ZONES.find(z => z.id === 'hab').high;
const top = hab.stages[hab.maxStage];
rows.push({
  strategy: 'surface', unit: 'high-density habitation tile at final stage',
  residents: top.pop, credits: hab.cost, kW: K.KW_PER_STAGE * hab.maxStage,
  surfaceTiles: 1, upkeep: top.upkeep, airMade: 0,
  ceiling: 'land value and era; unbounded in area'
});

/* --- bored --- */
for (const B of D.BUILDINGS.filter(b => b.group === 'deep')) {
  const pad = B.needsPad ? (B.needsPad * 2 + 1) ** 2 : 1;
  /* air is scaled by the ice within reach, so quote it at the median yield
     this map class actually offers rather than at an implied 1.0 */
  rows.push({
    strategy: 'bored', unit: B.name,
    residents: B.housingPerLevel * B.maxLevels,
    credits: B.cost, kW: B.drawKw, surfaceTiles: pad, upkeep: 0,
    airMadeAtUnitYield: (B.airPerLevel || 0) * B.maxLevels,
    ceiling: `${B.maxLevels} levels, fixed in data`
  });
}

/* --- tube: measured, because its ceiling is the map's not the designer's --- */
const TB = D.BUILDINGS.find(b => b.id === 'tubeway');
const tubeRuns = [];
for (const seed of SEEDS) {
  const s = S.newGame(seed, POLAR);
  s.peakPop = 1e9; s.research = 1e9; s.credits = 1e9;
  const tube = (s.tubes || [])[0];
  if (!tube) continue;
  const [x, y] = tube.path[Math.floor(tube.path.length / 2)];
  const t = T.tileAt(s, x, y);
  if (t.t !== 'flat') t.t = 'flat';
  if (S.place(s, t, 'tubeway')) continue;
  const cap = DP.capOf(s, t);
  t.b.levels = cap;
  const o = DP.outputOf(s, t);
  tubeRuns.push({ seed, tubeLength: tube.path.length, span: tube.span, cap,
                  boundBy: cap < TB.maxReach ? 'geology' : 'structure',
                  residents: Math.round(o.housing), jobs: Math.round(o.jobs) });
}
const res = tubeRuns.map(r => r.residents).sort((a, b) => a - b);
rows.push({
  strategy: 'tube', unit: TB.name,
  residents: res.length ? res[Math.floor(res.length / 2)] : 0,
  residentsMin: res[0], residentsMax: res[res.length - 1],
  credits: TB.cost, kW: TB.drawKw, surfaceTiles: 1, upkeep: 0, airMade: 0,
  ceiling: 'the length of the tube the map generated'
});

for (const r of rows) {
  r.creditsPerResident = +(r.credits / r.residents).toFixed(1);
  r.residentsPerKW = +(r.residents / r.kW).toFixed(1);
  r.residentsPerSurfaceTile = +(r.residents / r.surfaceTiles).toFixed(1);
}

save('e4-habitat-economics', {
  rows, tubeRuns,
  latticeOverhead: { streetEveryRows: K.AI_BLOCK, conduitEveryCols: K.AI_CONDUIT_EVERY,
    note: 'surface habitation additionally needs transit and power within one tile; '
        + 'mains are subsurface and consume no surface area' }
}, cost);
