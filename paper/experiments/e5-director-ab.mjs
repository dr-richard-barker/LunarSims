/* E5 — does the automated director reach the subsurface at all?

   Three revisions of the same director, each run on the same worlds:

     naive      takes any qualifying site the moment it can afford one
     serviced   refuses a site the utility networks do not reach
     reaching   walks a corridor out to one deliberately

   The measure is not how many structures it BUILDS but how many actually
   grow: a bore the networks never reach sits at one level forever and is
   worth precisely nothing, while still looking like a completed purchase
   from the outside. Baselines are extracted from git so the comparison is
   reproducible from the repository alone. */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { loadGame, instrument, save, REPO } from './lib.mjs';

const REVS = [
  ['naive',    'f2141a6'],   // deep arcologies, before the serviced guard
  ['serviced', 'bae50d4'],   // refuses unserviced sites, and walks a corridor
  ['reaching', null]         // working tree
];
const SEEDS = [7, 99, 555];
const TICKS = 900;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-ab-'));
const revFile = rev => {
  if (!rev) return null;
  const f = path.join(tmp, rev + '-autopilot.js');
  fs.writeFileSync(f, execSync(`git -C ${REPO} show ${rev}:metro/js/autopilot.js`).toString());
  return f;
};

const rows = [];
const cost = { ticks: 0, worlds: 0 };
for (const [label, rev] of REVS) {
  const override = rev ? { autopilot: revFile(rev) } : undefined;
  for (const seed of SEEDS) {
    const W = loadGame({ override });
    const c = instrument(W);
    const { LM_SIM: S, LM_DEEP: DP } = W;
    const s = S.newGame(seed);
    s.autoPlay = true;
    const t0 = Date.now();
    for (let i = 0; i < TICKS; i++) S.tick(s);
    const ms = Date.now() - t0;
    const subs = s.map.filter(t => t.b && DP.isSub && DP.isSub(t.b.type));
    const growing = subs.filter(t => t.b.levels > 1);
    rows.push({
      revision: label, gitRev: rev || 'working-tree', seed, ticks: TICKS, ms,
      population: s.pop,
      built: subs.length, growing: growing.length,
      stalled: subs.length - growing.length,
      detail: subs.map(t => `${t.b.type}:${t.b.levels}`).sort()
    });
    cost.ticks += c.ticks; cost.worlds += c.worlds;
  }
}
save('e5-director-ab', { revisions: REVS.map(r => r[0]), seeds: SEEDS, ticksPerRun: TICKS, rows }, cost);
