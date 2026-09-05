/* E1 — the size of the model, and what one verification pass costs.

   The headline reproducibility number: how much simulation the test suite
   actually performs. Counted by wrapping tick() and makeMap() around a real
   harness run rather than estimated from the scenario list. */
import fs from 'fs';
import path from 'path';
import { loadGame, instrument, save, METRO } from './lib.mjs';

const W = loadGame();
const D = W.LM_DATA, K = D.K;

const loc = {};
let total = 0;
for (const f of fs.readdirSync(path.join(METRO, 'js'))) {
  const n = fs.readFileSync(path.join(METRO, 'js', f), 'utf8').split('\n').length;
  loc[f] = n; total += n;
}
for (const f of ['harness.html', 'index.html', 'style.css']) {
  const n = fs.readFileSync(path.join(METRO, f), 'utf8').split('\n').length;
  loc[f] = n; total += n;
}

/* Run the real harness and count what it does. */
const cost = instrument(W);
const html = fs.readFileSync(path.join(METRO, 'harness.html'), 'utf8');
const inner = html.slice(html.indexOf('(function'), html.lastIndexOf('</script>'));
let scenarios = 0, passed = 0, failed = 0, threw = 0;
globalThis.__tally = (p, f, t) => { scenarios++; passed += p; failed += f; threw += t; };
globalThis.eval(inner
  .replace("const out = document.getElementById('out');", 'const out={appendChild(){}};')
  .replace('out.appendChild(box);',
    'globalThis.__tally(rows.filter(r=>judge(r[1],r[2])).length, rows.filter(r=>!judge(r[1],r[2])).length, crash?1:0);')
  .replace("const el = document.getElementById('summary');", 'const el={};'));

save('e1-model-scale', {
  sourceLines: { byFile: loc, total },
  constants: Object.keys(K).length,
  map: { cols: K.COLS, rows: K.ROWS, tiles: K.COLS * K.ROWS, heightLevels: K.MAX_H + 1 },
  catalogue: {
    terrain: D.TERRAIN.length, deposits: D.DEPOSITS.length, zones: D.ZONES.length,
    buildings: D.BUILDINGS.length,
    wonders: D.BUILDINGS.filter(b => b.group === 'wonder').length,
    deepArcologies: D.BUILDINGS.filter(b => b.group === 'deep').length,
    tubeArcologies: D.BUILDINGS.filter(b => b.group === 'tube').length,
    eras: D.ERAS.length, services: D.SERVICES.length, departments: D.DEPARTMENTS.length,
    tools: D.TOOLS.length, disasters: D.DISASTERS.length
  },
  verification: { scenarios, checks: passed + failed, passed, failed, threw }
}, cost);
