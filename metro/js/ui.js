/* Lunar Metropolis — input, camera, panels and the main loop.

   Terrain tools paint on drag, the way SimCity 2000's do: press, sweep, and
   the landscape follows. Every edit re-relaxes the surrounding slope and
   then recomputes sun exposure locally, so shadows move as you sculpt. */

(function () {
  const D = window.LM_DATA, T = window.LM_TERRAIN, R = window.LM_RENDER;
  const K = D.K;
  const SAVE_KEY = 'lunar-metropolis.save.v1';

  let s = load() || newWorld(Math.floor(Math.random() * 9999));
  const ui = {
    cam: { x: 0, y: 0, z: 0.55 },
    tool: 'inspect', view: 'terrain',
    selected: null, hover: null,
    pointerDown: false, dragMoved: false, painting: false,
    pointerDownScreen: null, camAtDown: null,
    levelTarget: null, showDeposits: true
  };

  function newWorld(seed) {
    const w = T.makeMap(seed);
    w.seed = seed;
    return w;
  }

  /* ---------- canvas ---------- */

  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  let cssW = 800, cssH = 600;

  function fitCanvas() {
    const rect = cv.parentElement.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cssW = Math.max(320, rect.width - 20);
    cssH = Math.max(280, rect.height - 46);
    cv.width = cssW * dpr; cv.height = cssH * dpr;
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  function centreOn(tx, ty) {
    const p = R.iso(tx, ty);
    ui.cam.x = -p.x * ui.cam.z;
    ui.cam.y = cssH / 2 - 92 - p.y * ui.cam.z;
  }
  centreOn(K.COLS / 2, K.ROWS / 2);

  /* ---------- tools ---------- */

  function buildPalette() {
    const box = document.getElementById('tools');
    box.innerHTML = '';
    D.TOOLS.forEach(t => {
      const b = document.createElement('button');
      b.className = 'tool' + (ui.tool === t.id ? ' on' : '');
      b.innerHTML = `<span class="g">${t.glyph}</span><span class="n">${t.name}</span><span class="k">${t.key}</span>`;
      b.title = t.hint;
      b.onclick = () => { ui.tool = t.id; ui.levelTarget = null; buildPalette(); setHint(); };
      box.appendChild(b);
    });
  }

  function setHint() {
    const t = D.TOOLS.find(x => x.id === ui.tool);
    let msg = t ? t.hint : '';
    if (ui.tool === 'level') {
      msg = ui.levelTarget === null
        ? 'Level Land — click a tile to set the target height, then paint over the ground you want flattened to it.'
        : `Level Land — flattening toward height ${ui.levelTarget}. Pick the tool again to choose a new target.`;
    }
    document.getElementById('hint').textContent = msg;
  }

  /* Apply the active tool at a tile. Terrain edits re-relax the slope (inside
     terrain.js) and then recompute sun locally — a full-map sun pass per
     click would be wasted work on 16,384 tiles. */
  function applyTool(t) {
    if (!t) return false;
    let changed = false;
    switch (ui.tool) {
      case 'inspect':
        ui.selected = t; renderTile(); return false;
      case 'raise':  changed = T.raise(s, t.x, t.y); break;
      case 'lower':  changed = T.lower(s, t.x, t.y); break;
      case 'level':
        if (ui.levelTarget === null) { ui.levelTarget = t.h; setHint(); return false; }
        changed = T.levelTo(s, t.x, t.y, ui.levelTarget);
        break;
      case 'clear':  changed = T.clearBoulders(s, t.x, t.y); break;
    }
    if (changed) {
      T.computeSunNear(s, t.x, t.y, 2);
      ui.selected = t; renderTile();
    }
    return changed;
  }

  /* ---------- pointer ---------- */

  const TERRAIN_TOOLS = ['raise', 'lower', 'level', 'clear'];

  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    ui.pointerDown = true; ui.dragMoved = false;
    ui.pointerDownScreen = { x: e.clientX, y: e.clientY };
    ui.camAtDown = { x: ui.cam.x, y: ui.cam.y };
    ui.painting = TERRAIN_TOOLS.includes(ui.tool);
    if (ui.painting) {
      const rect = cv.getBoundingClientRect();
      applyTool(R.pickTile(s, ui, rect.width, e.clientX - rect.left, e.clientY - rect.top));
    }
  });

  cv.addEventListener('pointermove', e => {
    const rect = cv.getBoundingClientRect();
    const t = R.pickTile(s, ui, rect.width, e.clientX - rect.left, e.clientY - rect.top);
    ui.hover = t ? { x: t.x, y: t.y } : null;
    if (!ui.pointerDown) return;
    const dx = e.clientX - ui.pointerDownScreen.x, dy = e.clientY - ui.pointerDownScreen.y;
    if (Math.hypot(dx, dy) > 4) ui.dragMoved = true;
    if (ui.painting) applyTool(t);              // sweep to sculpt
    else { ui.cam.x = ui.camAtDown.x + dx; ui.cam.y = ui.camAtDown.y + dy; }
  });

  cv.addEventListener('pointerup', e => {
    if (ui.pointerDown && !ui.painting && !ui.dragMoved) {
      const rect = cv.getBoundingClientRect();
      applyTool(R.pickTile(s, ui, rect.width, e.clientX - rect.left, e.clientY - rect.top));
    }
    if (ui.pointerDown && ui.painting) save();
    ui.pointerDown = false; ui.painting = false;
  });

  cv.addEventListener('pointerleave', () => { ui.hover = null; });

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    ui.cam.z = clamp(ui.cam.z * (e.deltaY < 0 ? 1.1 : 0.9), 0.22, 2.6);
  }, { passive: false });

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  window.addEventListener('keydown', e => {
    const t = D.TOOLS.find(x => x.key === e.key);
    if (t) { ui.tool = t.id; ui.levelTarget = null; buildPalette(); setHint(); }
  });

  /* ---------- panels ---------- */

  function renderTile() {
    const box = document.getElementById('tileDetail');
    const t = ui.selected;
    if (!t) { box.className = 'empty'; box.textContent = 'Click a tile to read the ground.'; return; }
    box.className = '';
    const live = T.tileAt(s, t.x, t.y);
    const kind = T.terrainById(live.t);
    const dep = live.deposit ? T.depositById(live.deposit.kind) : null;
    const sunPct = Math.round(live.sun * 100);
    const sunLabel = live.sun >= K.SUN_PEAK ? 'peak of eternal light'
      : live.sun <= K.SUN_SHADOW ? 'permanently shadowed' : 'partial sun';

    box.innerHTML = `
      <div class="baytitle"><h2>${kind.name}</h2><span class="num">${live.x + 1}, ${live.y + 1}</span></div>
      <div class="rows">
        <div class="row"><span class="k">Elevation</span><span class="v">${live.h} / ${K.MAX_H}</span></div>
        <div class="row"><span class="k">Sunlight</span><span class="v${live.sun >= K.SUN_PEAK ? ' good' : live.sun <= K.SUN_SHADOW ? ' bad' : ''}">${sunPct}%</span></div>
        <div class="row"><span class="k">Exposure</span><span class="v">${sunLabel}</span></div>
        <div class="row"><span class="k">Buildable</span><span class="v">${kind.build ? 'yes' : 'no'}</span></div>
      </div>
      <p class="note">${kind.note}</p>
      ${dep ? `<p class="note"><b>${dep.name}</b> — richness ${Math.round(live.deposit.richness * 100)}%. ${dep.note}</p>` : ''}`;
  }

  function renderStats() {
    let peaks = 0, shadow = 0, lo = K.MAX_H, hi = 0, sum = 0;
    for (const t of s.map) {
      if (t.sun >= K.SUN_PEAK) peaks++;
      if (t.sun <= K.SUN_SHADOW) shadow++;
      if (t.h < lo) lo = t.h;
      if (t.h > hi) hi = t.h;
      sum += t.h;
    }
    const ice = s.map.filter(t => t.deposit && t.deposit.kind === 'ice').length;
    document.getElementById('stats').innerHTML = `
      <div class="chip"><b>${s.seed}</b><span>Seed</span></div>
      <div class="chip"><b>${lo}–${hi}</b><span>Elevation</span></div>
      <div class="chip"><b>${(sum / s.map.length).toFixed(1)}</b><span>Mean height</span></div>
      <div class="chip"><b>${peaks.toLocaleString()}</b><span>Sunlit peaks</span></div>
      <div class="chip"><b>${shadow.toLocaleString()}</b><span>Shadowed</span></div>
      <div class="chip"><b>${ice.toLocaleString()}</b><span>Ice tiles</span></div>`;
  }

  document.querySelectorAll('#viewBar button').forEach(b => b.onclick = () => {
    ui.view = b.dataset.view;
    document.querySelectorAll('#viewBar button').forEach(x => x.classList.toggle('on', x === b));
  });

  document.getElementById('btnNew').onclick = () => {
    const seed = Math.floor(Math.random() * 9999);
    s = newWorld(seed);
    ui.selected = null; ui.levelTarget = null;
    centreOn(K.COLS / 2, K.ROWS / 2);
    renderTile(); renderStats(); setHint(); save();
  };
  document.getElementById('btnCentre').onclick = () => centreOn(K.COLS / 2, K.ROWS / 2);

  /* ---------- save ---------- */

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o.map || o.map.length !== K.COLS * K.ROWS) return null;
      return o;
    } catch (e) { return null; }
  }

  /* ---------- loop ---------- */

  function frame() {
    R.draw(ctx, s, ui);
    requestAnimationFrame(frame);
  }

  buildPalette(); setHint(); renderTile(); renderStats();
  requestAnimationFrame(frame);
})();
