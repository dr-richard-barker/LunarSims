/* Lunar Metropolis — input, camera, panels and the main loop.

   Terrain tools paint on drag, networks drag out as lines, zones drag out as
   rectangles — the SimCity 2000 gestures. Network reachability is recomputed
   whenever the map actually changes rather than every frame: three flood
   fills over 16,384 tiles is cheap once a second and wasteful sixty times a
   second. */

(function () {
  const D = window.LM_DATA, T = window.LM_TERRAIN, G = window.LM_GRID;
  const Z = window.LM_ZONES, S = window.LM_SIM, R = window.LM_RENDER;
  const K = D.K;
  const SAVE_KEY = 'lunar-metropolis.save.v2';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let s = load() || S.newGame();
  const ui = {
    cam: { x: 0, y: 0, z: 0.55 },
    tool: 'inspect', view: 'terrain',
    selected: null, hover: null, preview: null,
    pointerDown: false, dragMoved: false, painting: false, dragging: null,
    pointerDownScreen: null, camAtDown: null,
    levelTarget: null, showDeposits: true,
    speed: 1, nets: null
  };

  const toolById = id => D.TOOLS.find(t => t.id === id);
  const current = () => toolById(ui.tool);
  function refreshNets() { ui.nets = G.services(s); }

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

  /* ---------- palette ---------- */

  const GROUPS = [
    { id: 'terrain', label: 'Terrain' },
    { id: 'network', label: 'Networks' },
    { id: 'plant', label: 'Power & Life Support' },
    { id: 'zone', label: 'Zoning' }
  ];

  function buildPalette() {
    const nav = document.getElementById('palette');
    nav.innerHTML = '';
    for (const g of GROUPS) {
      const wrap = document.createElement('div');
      wrap.className = 'palgroup';
      wrap.innerHTML = `<h4>${g.label}</h4>`;
      const box = document.createElement('div');
      box.className = 'tools';
      D.TOOLS.filter(t => t.group === g.id).forEach(t => {
        const b = document.createElement('button');
        b.className = 'tool' + (ui.tool === t.id ? ' on' : '');
        const cost = t.build ? S.buildById(t.build).cost
          : t.zone ? S.zoneCost(t.zone, t.density) : null;
        b.innerHTML = `<span class="g">${t.glyph}</span><span class="n">${t.name}</span>` +
          (cost !== null ? `<span class="c">${cost}</span>` : `<span class="k">${t.key}</span>`);
        b.title = t.hint || (t.build ? S.buildById(t.build).desc : '') ||
          (t.zone ? Z.zoneById(t.zone).desc : '');
        b.onclick = () => { ui.tool = t.id; ui.levelTarget = null; buildPalette(); setHint(); };
        box.appendChild(b);
      });
      wrap.appendChild(box);
      nav.appendChild(wrap);
    }
  }

  function setHint() {
    const t = current();
    let msg = t ? (t.hint || '') : '';
    if (t && t.build) msg = `${t.name} — ${S.buildById(t.build).desc}`;
    if (t && t.zone) msg = `${t.name} — drag a rectangle over open ground. ${Z.zoneById(t.zone).desc}`;
    if (t && t.drag === 'line') msg += ' Drag to run a line.';
    if (ui.tool === 'level') {
      msg = ui.levelTarget === null
        ? 'Level Land — click a tile to set the target height, then paint the ground you want flattened to it.'
        : `Level Land — flattening toward height ${ui.levelTarget}.`;
    }
    document.getElementById('hint').textContent = msg;
  }

  /* ---------- drag geometry ---------- */

  /* Longer axis first, then turn once — the SimCity road-drawing gesture. */
  function linePath(a, b) {
    const pts = [];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      const sx = dx === 0 ? 1 : Math.sign(dx);
      for (let x = a.x; ; x += sx) { pts.push({ x, y: a.y }); if (x === b.x) break; }
      const sy = dy === 0 ? 1 : Math.sign(dy);
      if (dy !== 0) for (let y = a.y + sy; ; y += sy) { pts.push({ x: b.x, y }); if (y === b.y) break; }
    } else {
      const sy = dy === 0 ? 1 : Math.sign(dy);
      for (let y = a.y; ; y += sy) { pts.push({ x: a.x, y }); if (y === b.y) break; }
      const sx = dx === 0 ? 1 : Math.sign(dx);
      if (dx !== 0) for (let x = a.x + sx; ; x += sx) { pts.push({ x, y: b.y }); if (x === b.x) break; }
    }
    const seen = new Set(), out = [];
    for (const p of pts) { const k = p.x + ',' + p.y; if (!seen.has(k)) { seen.add(k); out.push(p); } }
    return out;
  }

  const rectFrom = (a, b) => ({
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1
  });

  function computePreview(tool, a, b) {
    const cells = [];
    if (tool.drag === 'line') {
      for (const p of linePath(a, b)) {
        cells.push({ x: p.x, y: p.y, ok: !S.canPlace(s, T.tileAt(s, p.x, p.y), tool.build) });
      }
    } else {
      const r = rectFrom(a, b);
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++)
          cells.push({ x, y, ok: !S.canZone(s, T.tileAt(s, x, y)) });
    }
    return { cells };
  }

  function commitDrag(tool, a, b) {
    if (tool.drag === 'line') {
      let placed = 0, err = null;
      for (const p of linePath(a, b)) {
        const e = S.place(s, T.tileAt(s, p.x, p.y), tool.build);
        if (!e) placed++; else err = e;
      }
      if (!placed && err) toast(err);
    } else {
      const r = rectFrom(a, b);
      const n = S.paintZone(s, r.x, r.y, r.w, r.h, tool.zone, tool.density);
      if (!n) toast('Nothing there could be zoned.');
    }
    refreshNets(); renderHUD(); save();
  }

  /* ---------- tool application ---------- */

  const TERRAIN_TOOLS = ['raise', 'lower', 'level', 'clear'];

  function applyTool(t) {
    if (!t) return false;
    const tool = current();
    let changed = false;
    switch (ui.tool) {
      case 'inspect': ui.selected = t; renderTile(); return false;
      case 'raise': changed = T.raise(s, t.x, t.y); break;
      case 'lower': changed = T.lower(s, t.x, t.y); break;
      case 'level':
        if (ui.levelTarget === null) { ui.levelTarget = t.h; setHint(); return false; }
        changed = T.levelTo(s, t.x, t.y, ui.levelTarget); break;
      case 'clear': changed = T.clearBoulders(s, t.x, t.y); break;
      case 'bulldoze': changed = !S.bulldoze(s, t); if (changed) refreshNets(); break;
      default:
        if (tool && tool.build && !tool.drag) {
          const e = S.place(s, t, tool.build);
          if (e) toast(e); else { changed = true; refreshNets(); renderHUD(); }
        }
    }
    if (changed && TERRAIN_TOOLS.includes(ui.tool)) T.computeSunNear(s, t.x, t.y, 2);
    if (changed) { ui.selected = t; renderTile(); }
    return changed;
  }

  /* ---------- pointer ---------- */

  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    const rect = cv.getBoundingClientRect();
    const t = R.pickTile(s, ui, rect.width, e.clientX - rect.left, e.clientY - rect.top);
    ui.pointerDown = true; ui.dragMoved = false;
    ui.pointerDownScreen = { x: e.clientX, y: e.clientY };
    ui.camAtDown = { x: ui.cam.x, y: ui.cam.y };
    const tool = current();
    if (tool && tool.drag && t) {
      ui.dragging = { tool, start: { x: t.x, y: t.y }, cur: { x: t.x, y: t.y } };
      ui.preview = computePreview(tool, ui.dragging.start, ui.dragging.cur);
      ui.painting = false;
    } else {
      ui.painting = TERRAIN_TOOLS.includes(ui.tool) || ui.tool === 'bulldoze';
      if (ui.painting) applyTool(t);
    }
  });

  cv.addEventListener('pointermove', e => {
    const rect = cv.getBoundingClientRect();
    const t = R.pickTile(s, ui, rect.width, e.clientX - rect.left, e.clientY - rect.top);
    ui.hover = t ? { x: t.x, y: t.y } : null;
    if (!ui.pointerDown) return;
    const dx = e.clientX - ui.pointerDownScreen.x, dy = e.clientY - ui.pointerDownScreen.y;
    if (Math.hypot(dx, dy) > 4) ui.dragMoved = true;
    if (ui.dragging && t) {
      ui.dragging.cur = { x: t.x, y: t.y };
      ui.preview = computePreview(ui.dragging.tool, ui.dragging.start, ui.dragging.cur);
    } else if (ui.painting) applyTool(t);
    else { ui.cam.x = ui.camAtDown.x + dx; ui.cam.y = ui.camAtDown.y + dy; }
  });

  cv.addEventListener('pointerup', e => {
    const rect = cv.getBoundingClientRect();
    if (ui.dragging) {
      commitDrag(ui.dragging.tool, ui.dragging.start, ui.dragging.cur);
      ui.dragging = null; ui.preview = null;
    } else if (ui.painting) save();
    else if (ui.pointerDown && !ui.dragMoved) {
      applyTool(R.pickTile(s, ui, rect.width, e.clientX - rect.left, e.clientY - rect.top));
      save();
    }
    ui.pointerDown = false; ui.painting = false;
  });

  cv.addEventListener('pointerleave', () => { ui.hover = null; });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    ui.cam.z = clamp(ui.cam.z * (e.deltaY < 0 ? 1.1 : 0.9), 0.22, 2.6);
  }, { passive: false });

  window.addEventListener('keydown', e => {
    const t = D.TOOLS.find(x => x.key.toLowerCase() === e.key.toLowerCase());
    if (t) { ui.tool = t.id; ui.levelTarget = null; buildPalette(); setHint(); }
  });

  /* ---------- panels ---------- */

  function renderTile() {
    const box = document.getElementById('tileDetail');
    const sel = ui.selected;
    if (!sel) { box.className = 'empty'; box.textContent = 'Click a tile to read the ground.'; return; }
    box.className = '';
    const t = T.tileAt(s, sel.x, sel.y);
    const kind = T.terrainById(t.t);
    const dep = t.deposit ? T.depositById(t.deposit.kind) : null;
    const nets = ui.nets;
    const hasP = nets ? G.served(s, nets.power, t.x, t.y) : false;
    const hasA = nets ? G.served(s, nets.air, t.x, t.y) : false;
    const hasT = G.hasTransit(s, t.x, t.y);
    const yn = v => v ? '<span class="v good">yes</span>' : '<span class="v bad">no</span>';

    let what = kind.name;
    if (t.b) what = S.buildById(t.b.type).name;
    else if (t.zone) {
      const spec = Z.zoneById(t.zone.kind);
      what = `${spec.name} · ${t.zone.density === 'high' ? 'High' : 'Low'}`;
    }

    box.innerHTML = `
      <div class="baytitle"><h2>${what}</h2><span class="num">${t.x + 1}, ${t.y + 1}</span></div>
      <div class="rows">
        <div class="row"><span class="k">Elevation</span><span class="v">${t.h} / ${K.MAX_H}</span></div>
        <div class="row"><span class="k">Sunlight</span><span class="v${t.sun >= K.SUN_PEAK ? ' good' : t.sun <= K.SUN_SHADOW ? ' bad' : ''}">${Math.round(t.sun * 100)}%</span></div>
        ${t.zone ? `<div class="row"><span class="k">Development</span><span class="v">stage ${t.zone.stage} / ${Z.bandOf(t.zone).maxStage}</span></div>
        <div class="row"><span class="k">Land value</span><span class="v">${Math.round((t.zone.value || 0) * 100)}%</span></div>` : ''}
        <div class="row"><span class="k">Transit</span>${yn(hasT)}</div>
        <div class="row"><span class="k">Power</span>${yn(hasP)}</div>
        <div class="row"><span class="k">Atmosphere</span>${yn(hasA)}</div>
        ${t.pipe ? `<div class="row"><span class="k">Buried main</span><span class="v good">yes</span></div>` : ''}
      </div>
      <p class="note">${t.b ? S.buildById(t.b.type).desc : t.zone ? Z.zoneById(t.zone.kind).desc : kind.note}</p>
      ${dep ? `<p class="note"><b>${dep.name}</b> — richness ${Math.round(t.deposit.richness * 100)}%. ${dep.note}</p>` : ''}`;
  }

  function bar(label, v) {
    const pct = Math.round(clamp((v + 1) / 2, 0, 1) * 100);
    return `<div class="meter"><div class="lab"><span>${label}</span><span>${v >= 0 ? '+' : ''}${Math.round(v * 100)}</span></div>
      <div class="track"><div class="fill" style="width:${pct}%;background:var(--accent)"></div></div></div>`;
  }

  function renderHUD() {
    const pw = Z.power(s);
    const load = Z.tally(s).draw + pw.o2Draw;
    document.getElementById('stats').innerHTML =
      `<div class="chip"><b>${Math.round(s.credits).toLocaleString()}</b><span>Credits</span></div>` +
      `<div class="chip"><b>${s.pop.toLocaleString()}/${s.housingCap.toLocaleString()}</b><span>Population</span></div>` +
      `<div class="chip"><b>${s.jobs.toLocaleString()}</b><span>Jobs</span></div>` +
      `<div class="chip${load > pw.gen ? ' bad' : ''}"><b>${load.toFixed(1)}/${pw.gen.toFixed(1)}</b><span>kW load/gen</span></div>` +
      `<div class="chip${s.pop > pw.o2Plants * K.AIR_PER_PLANT ? ' bad' : ''}"><b>${(pw.o2Plants * K.AIR_PER_PLANT).toLocaleString()}</b><span>Air capacity</span></div>` +
      `<div class="chip"><b>${s.day.toLocaleString()}</b><span>Day</span></div>`;

    const warn = [];
    if (load > pw.gen) warn.push('Grid is over capacity — growth has stopped. Build more generation.');
    if (s.pop > pw.o2Plants * K.AIR_PER_PLANT) warn.push('Not enough pressurisation — build another oxygen plant.');
    document.getElementById('advisor').innerHTML = warn.length
      ? warn.map(w => `<p class="note" style="border-left-color:var(--bad)">${w}</p>`).join('')
      : '';

    document.getElementById('demand').innerHTML =
      bar('Habitation', s.demand.hab) + bar('Trade', s.demand.trade) + bar('Industry', s.demand.industry);
  }

  document.querySelectorAll('#viewBar button').forEach(b => b.onclick = () => {
    ui.view = b.dataset.view;
    document.querySelectorAll('#viewBar button').forEach(x => x.classList.toggle('on', x === b));
  });
  document.querySelectorAll('.sp').forEach(b => b.onclick = () => {
    ui.speed = +b.dataset.speed;
    document.querySelectorAll('.sp').forEach(x => x.classList.toggle('on', x === b));
  });

  document.getElementById('btnNew').onclick = () => {
    if (!confirm('Start a new colony on fresh terrain? This clears the current city.')) return;
    s = S.newGame();
    ui.selected = null; ui.levelTarget = null;
    centreOn(K.COLS / 2, K.ROWS / 2);
    refreshNets(); renderTile(); renderHUD(); setHint(); save();
  };
  document.getElementById('btnCentre').onclick = () => centreOn(K.COLS / 2, K.ROWS / 2);

  /* ---------- toast ---------- */

  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  /* ---------- save ---------- */

  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {} }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (o.version !== S.STATE_VERSION || !o.map || o.map.length !== K.COLS * K.ROWS) return null;
      return o;
    } catch (e) { return null; }
  }

  /* ---------- loop ---------- */

  const DAY_MS = 1100;
  let last = performance.now(), acc = 0, frames = 0;

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    /* Refresh the panels when the simulation actually advances rather than
       on a frame count — the readouts then track the city instead of the
       frame rate, which matters wherever rAF is throttled. */
    let ticked = 0;
    if (ui.speed > 0) {
      acc += dt * ui.speed;
      while (acc > DAY_MS / 1000 && ticked < 12) {
        try { S.tick(s); } catch (e) { console.error(e); }
        acc -= DAY_MS / 1000;
        ticked++;
      }
      if (ticked) { refreshNets(); renderHUD(); renderTile(); }
    }
    R.draw(ctx, s, ui);
    if (frames++ % 30 === 0) save();
    requestAnimationFrame(frame);
  }

  refreshNets();
  buildPalette(); setHint(); renderTile(); renderHUD();
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
})();
