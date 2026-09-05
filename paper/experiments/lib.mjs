/* Shared loader for the headless experiments.

   Every number in the paper comes from a script in this directory, and every
   script loads the game the same way: the real modules, unmodified, in the
   order index.html loads them. Nothing here reimplements any part of the
   simulation, so a figure can never drift away from the thing it describes.

   The game is browser code with no build step and no module system — each
   file assigns onto `window`. So the loader supplies a `window`, a minimal
   `document` (two modules build an offscreen canvas at load), and evaluates
   the files in dependency order. */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PAPER = path.resolve(HERE, '..');
export const REPO = path.resolve(PAPER, '..');
export const METRO = path.join(REPO, 'metro');

/* Read from harness.html's own <script> tags rather than listed here, so the
   experiments load exactly what the test suite loads, in exactly its order.
   Listing them by hand meant loading twelve of twenty modules, and the eight
   missing ones took 37 scenarios down with them without the count of PASSING
   checks ever looking wrong. */
function moduleList() {
  const html = fs.readFileSync(path.join(METRO, 'harness.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
}

/* A DOM stub good enough to load modules that touch it. Nothing under test
   draws, so a no-op 2D context is sufficient. */
function stubDom(g) {
  const ctx2d = new Proxy({}, { get: (_, k) =>
    k === 'canvas' ? { width: 1, height: 1 }
    : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) })
    : k === 'createLinearGradient' || k === 'createRadialGradient'
        ? () => ({ addColorStop() {} })
    : k === 'measureText' ? () => ({ width: 0 }) : () => {} });
  const el = () => ({ className: '', innerHTML: '', style: {}, width: 1, height: 1,
    getContext: () => ctx2d, appendChild() {}, removeChild() {}, remove() {},
    addEventListener() {}, removeEventListener() {}, dataset: {},
    querySelector: () => el(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 176, height: 176 }) });
  g.document = { getElementById: () => el(), createElement: el, querySelector: () => el(),
                 querySelectorAll: () => [], addEventListener() {}, body: el(),
                 documentElement: el() };
  const store = new Map();
  g.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null),
                     setItem: (k, v) => store.set(k, String(v)),
                     removeItem: k => store.delete(k) };
}

/* A fresh, isolated copy of the game. Each call gets its own `window`, so an
   experiment can hold two builds side by side — which is how the A/B against
   an earlier revision works. */
export function loadGame(opts = {}) {
  const g = globalThis;
  g.window = {};
  stubDom(g);
  for (const rel of moduleList()) {
    const key = path.basename(rel, '.js');
    const override = opts.override && opts.override[key];
    g.eval(fs.readFileSync(override || path.join(METRO, rel), 'utf8'));
  }
  return g.window;
}

/* Counting is the point: the paper reports how much simulation each result
   cost, so every experiment wraps tick() and makeMap() and reports totals. */
export function instrument(W) {
  const c = { ticks: 0, worlds: 0 };
  const ot = W.LM_SIM.tick, om = W.LM_TERRAIN.makeMap;
  W.LM_SIM.tick = (...a) => { c.ticks++; return ot(...a); };
  W.LM_TERRAIN.makeMap = (...a) => { c.worlds++; return om(...a); };
  return c;
}

export const gitRev = () => {
  try { return execSync('git -C ' + REPO + ' rev-parse --short HEAD').toString().trim(); }
  catch { return 'unknown'; }
};

/* Results are written next to the paper and committed, so the manuscript
   builds without re-running anything — and the ledger records what it cost,
   which is the only honest way to answer "how many times was this run". */
export function save(name, data, cost) {
  const out = { experiment: name, generatedAt: new Date().toISOString(),
                gitRev: gitRev(), cost: cost || null, data };
  const f = path.join(PAPER, 'results', name + '.json');
  fs.writeFileSync(f, JSON.stringify(out, null, 2) + '\n');

  const lf = path.join(PAPER, 'results', 'ledger.json');
  let ledger = [];
  try { ledger = JSON.parse(fs.readFileSync(lf, 'utf8')); } catch {}
  ledger.push({ experiment: name, at: out.generatedAt, gitRev: out.gitRev,
                simulatedDays: cost ? cost.ticks : null,
                worldsGenerated: cost ? cost.worlds : null });
  fs.writeFileSync(lf, JSON.stringify(ledger, null, 2) + '\n');
  console.log(name, '->', path.relative(REPO, f),
    cost ? `(${cost.ticks.toLocaleString()} simulated days, ${cost.worlds} worlds)` : '');
  return out;
}
