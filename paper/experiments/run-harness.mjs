/* Headless runner for a game's harness.html — metro by default, or any game
   folder named on the command line:

     node paper/experiments/run-harness.mjs          # metro
     node paper/experiments/run-harness.mjs farm

   The game modules are DOM-free and so are the scenarios; only the result
   rendering touches the DOM. So stub just enough document for the runner and
   report to stdout, with a per-scenario timer so a slow one is obvious. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = path.resolve(REPO, process.argv[2] || 'metro');

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

/* The scenarios are the inline block that opens with `(function`. It ends at
   the first </script> after it — not the last in the file, since the pages now
   carry an analytics tag below it. */
const start = html.indexOf('<script>\n(function');
if (start < 0) throw new Error(`run-harness: no inline scenario block in ${ROOT}/harness.html`);
const body = html.slice(start, html.indexOf('</script>', start));
const inner = body.slice(body.indexOf('(function'));

const results = [];

/* Swap the DOM-rendering tail for a collector, keeping judge() verbatim. Each
   marker must be found: a silent miss used to leave __t0 undefined and take the
   whole eval down with an error that pointed nowhere near the cause. */
function swap(src, from, to) {
  const hit = typeof from === 'string' ? src.includes(from) : from.test(src);
  if (!hit) throw new Error(`run-harness: marker not found in ${ROOT}/harness.html: ${from}`);
  return src.replace(from, to);
}
let patched = inner;
patched = swap(patched, "const out = document.getElementById('out');",
               "const out = { appendChild(){} };");
/* metro writes `sc => {`, farm writes `(sc, i) => {` */
patched = swap(patched, /SCENARIOS\.forEach\((\(sc(?:, *\w+)?\)|sc) => \{/,
               m => m + ' const __t0 = Date.now(); if (process.env.TRACE) process.stderr.write("> "+sc.name+"\\n");');
patched = swap(patched, 'out.appendChild(box);',
               'globalThis.__results.push({ name: sc.name, pass: scPass, crash, ms: Date.now() - __t0, rows: rows.map(([l,g,w]) => [l, g, w, judge(g,w)]) });');
patched = swap(patched, "const el = document.getElementById('summary');", 'const el = { };');

globalThis.__results = results;
eval(patched);
/* DUMP=file.json keeps every check's value, so two revisions can be diffed */
if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(results, null, 1));

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
