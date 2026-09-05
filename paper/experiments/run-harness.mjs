/* Headless runner for metro/harness.html.
   The game modules are DOM-free and so are the scenarios; only the result
   rendering touches the DOM. So stub just enough document for the runner and
   report to stdout, with a per-scenario timer so a slow one is obvious. */
import fs from 'fs';
const ROOT = process.argv[2] || '/Users/drb_laptop/Documents/LunarSims/metro';

global.window = {};
global.localStorage = (() => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null),
           setItem: (k, v) => m.set(k, String(v)),
           removeItem: k => m.delete(k) };
})();
global.performance = globalThis.performance;

/* minimap.js and ui.js both build an offscreen canvas at load, so the DOM
   stub has to exist before the modules are evaluated, not just before the
   runner. Nothing under test draws, so a no-op 2D context is enough. */
const ctx2d = new Proxy({}, { get: (_, k) =>
  k === 'canvas' ? { width: 1, height: 1 }
  : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) })
  : k === 'createLinearGradient' || k === 'createRadialGradient'
      ? () => ({ addColorStop() {} })
  : k === 'measureText' ? () => ({ width: 0 })
  : () => {} });
const mkEl = () => ({ className: '', innerHTML: '', style: {}, width: 1, height: 1,
                      getContext: () => ctx2d, appendChild() {}, removeChild() {},
                      addEventListener() {}, removeEventListener() {}, remove() {},
                      querySelector: () => mkEl(), querySelectorAll: () => [], dataset: {},
                      getBoundingClientRect: () => ({ left: 0, top: 0, width: 176, height: 176 }) });
global.document = { getElementById: () => mkEl(), createElement: mkEl,
                    querySelector: () => mkEl(), querySelectorAll: () => [],
                    addEventListener() {}, body: mkEl(), documentElement: mkEl() };

const html = fs.readFileSync(`${ROOT}/harness.html`, 'utf8');
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g))
  eval(fs.readFileSync(`${ROOT}/${m[1]}`, 'utf8'));

const body = html.slice(html.indexOf('<script>\n(function'), html.lastIndexOf('</script>'));
const inner = body.slice(body.indexOf('(function'));

const results = [];

/* Swap the DOM-rendering tail for a collector, keeping judge() verbatim. */
const patched = inner
  .replace("const out = document.getElementById('out');",
           "const out = { appendChild(){} };")
  .replace('SCENARIOS.forEach(sc => {',
           'SCENARIOS.forEach(sc => { const __t0 = Date.now(); if (process.env.TRACE) process.stderr.write("> "+sc.name+"\\n");')
  .replace('out.appendChild(box);',
           'globalThis.__results.push({ name: sc.name, pass: scPass, crash, ms: Date.now() - __t0, rows: rows.map(([l,g,w]) => [l, g, w, judge(g,w)]) });')
  .replace("const el = document.getElementById('summary');", 'const el = { };');

globalThis.__results = results;
eval(patched);

let passed = 0, failed = 0, broke = 0;
for (const r of results) {
  if (r.crash) broke++;
  for (const [, , , ok] of r.rows) ok ? passed++ : failed++;
}
const slow = [...results].sort((a, b) => b.ms - a.ms).slice(0, 5);
console.log(`scenarios ${results.length}  passed ${passed}  failed ${failed}  threw ${broke}`);
console.log('slowest:', slow.map(r => `${r.ms}ms ${r.name.slice(0, 46)}`).join(' | '));
for (const r of results) {
  if (r.crash) console.log(`\nERROR  ${r.name}\n  ${r.crash.split('\n').slice(0, 3).join('\n  ')}`);
  for (const [l, g, w, ok] of r.rows)
    if (!ok) console.log(`FAIL   ${r.name}\n   ${l}\n   got ${g}  want ${w}`);
}
process.exit(failed + broke ? 1 : 0);
