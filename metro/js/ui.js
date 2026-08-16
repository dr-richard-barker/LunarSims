/* Lunar Metropolis — input, camera, panels and the main loop.

   Terrain tools paint on drag, networks drag out as lines, zones drag out as
   rectangles — the SimCity 2000 gestures. Network reachability is recomputed
   whenever the map actually changes rather than every frame: three flood
   fills over 16,384 tiles is cheap once a second and wasteful sixty times a
   second. */

(function () {
  const D = window.LM_DATA, T = window.LM_TERRAIN, G = window.LM_GRID;
  const Z = window.LM_ZONES, S = window.LM_SIM, R = window.LM_RENDER, B = window.LM_BUDGET;
  const E = window.LM_ERAS;
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
  /* Networks and civic coverage are both map-wide derived data. Recompute
     them together whenever the map actually changes, and cache — the
     renderer reads the cache rather than recomputing per frame. */
  function refreshNets() {
    ui.nets = G.services(s);
    ui.cov = window.LM_SERVICES ? window.LM_SERVICES.coverage(s, B.effects(s)) : null;
    /* This is the one place that already knows the map changed, so it is
       where the traffic layer is told its cached street graph is stale —
       cheaper than having agents.js hash 16,384 tiles to work it out. */
    if (window.LM_AGENTS) window.LM_AGENTS.invalidate();
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

  /* ---------- palette ---------- */

  const GROUPS = [
    { id: 'terrain', label: 'Terrain' },
    { id: 'network', label: 'Networks' },
    { id: 'plant', label: 'Power & Life Support' },
    { id: 'service', label: 'Civic Services' },
    { id: 'wonder', label: 'Wonders' },
    { id: 'zone', label: 'Zoning' },
    { id: 'district', label: 'Special Districts' }
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
        /* Sandbox lifts the era locks as well as the prices, so the palette
           has to agree with what canPlace will actually allow. The military
           brush is gated on the General's offer rather than on an era. */
        const zoneGate = t.zone ? S.canZoneKind(s, t.zone) : null;
        const locked = !!zoneGate ||
          (!s.sandbox && t.build && E && !E.unlocked(s, t.build));
        b.className = 'tool' + (ui.tool === t.id ? ' on' : '');
        if (locked) { b.disabled = true; b.style.opacity = 0.42; }
        const listed = t.build ? S.buildById(t.build).cost
          : t.zone ? S.zoneCost(t.zone, t.density) : null;
        const cost = listed === null ? null : (s.sandbox ? 0 : listed);
        b.innerHTML = `<span class="g">${locked ? '🔒' : t.glyph}</span><span class="n">${t.name}</span>` +
          (cost !== null ? `<span class="c">${cost.toLocaleString()}</span>` : `<span class="k">${t.key}</span>`);
        b.title = zoneGate ? zoneGate
          : locked ? E.lockReason(s, t.build)
          : (t.hint || (t.build ? S.buildById(t.build).desc : '') ||
             (t.zone ? Z.zoneById(t.zone).desc : ''));
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
  /* Zoom pinned to the cursor. Scaling without compensating the pan makes
     the world slide out from under the pointer — zoom in on a district and
     it drifts off screen, which is exactly the wrong behaviour when the map
     is 128 tiles across. Solving for the world point beneath the cursor and
     holding it fixed keeps whatever you are looking at under the mouse. */
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const z0 = ui.cam.z;
    /* Ceiling raised from 2.6 — the near detail tier only starts paying off
       above about 1.15, and there was very little zoom range left above that
       to actually see it in. */
    const z1 = clamp(z0 * (e.deltaY < 0 ? 1.1 : 0.9), 0.22, 4.0);
    if (z1 === z0) return;
    const wx = (sx - rect.width / 2 - ui.cam.x) / z0;
    const wy = (sy - 92 - ui.cam.y) / z0;
    ui.cam.z = z1;
    ui.cam.x = sx - rect.width / 2 - wx * z1;
    ui.cam.y = sy - 92 - wy * z1;
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
        <div class="row"><span class="k">Dust</span><span class="v${(t.dust || 0) > 0.35 ? ' bad' : (t.dust || 0) > 0.12 ? ' warn' : ''}">${Math.round((t.dust || 0) * 100)}%</span></div>
      </div>
      ${ui.cov ? `<h3 class="sec">Civic coverage</h3><div class="rows">${
        D.SERVICES.map(sv => {
          const c = Math.round(ui.cov[sv.id][T.idx(t.x, t.y)] * 100);
          return `<div class="row"><span class="k">${sv.name}</span><span class="v${c >= 50 ? ' good' : c === 0 ? ' bad' : ''}">${c}%</span></div>`;
        }).join('')}</div>` : ''}
      <p class="note">${t.b ? S.buildById(t.b.type).desc : t.zone ? Z.zoneById(t.zone.kind).desc : kind.note}</p>
      ${dep ? `<p class="note"><b>${dep.name}</b> — richness ${Math.round(t.deposit.richness * 100)}%. ${dep.note}</p>` : ''}`;
  }

  function bar(label, v) {
    const pct = Math.round(clamp((v + 1) / 2, 0, 1) * 100);
    return `<div class="meter"><div class="lab"><span>${label}</span><span>${v >= 0 ? '+' : ''}${Math.round(v * 100)}</span></div>
      <div class="track"><div class="fill" style="width:${pct}%;background:var(--accent)"></div></div></div>`;
  }

  function renderHUD() {
    /* Read the budget-adjusted figures, not the raw hardware ratings —
       a grid whose maintenance has been cut really does deliver less, and
       the readout should say so rather than flattering the player. */
    const eff = B.effects(s);
    const pw = Z.power(s);
    const tal = Z.tally(s);
    const gen = pw.gen * eff.genMul;
    const load = tal.draw + pw.o2Draw;
    const airCap = Math.floor(pw.o2Plants * K.AIR_PER_PLANT * eff.airMul);
    const net = s.revenue - s.expenses;

    document.getElementById('stats').innerHTML =
      `<div class="chip${s.credits < 0 ? ' bad' : ''}"><b>${Math.round(s.credits).toLocaleString()}</b><span>Credits</span></div>` +
      `<div class="chip${net < 0 ? ' warn' : ''}"><b>${net >= 0 ? '+' : '−'}${Math.abs(Math.round(net))}</b><span>Net / day</span></div>` +
      `<div class="chip"><b>${s.pop.toLocaleString()}/${s.housingCap.toLocaleString()}</b><span>Population</span></div>` +
      `<div class="chip"><b>${s.jobs.toLocaleString()}</b><span>Jobs</span></div>` +
      `<div class="chip${load > gen ? ' bad' : ''}"><b>${load.toFixed(1)}/${gen.toFixed(1)}</b><span>kW load/gen</span></div>` +
      `<div class="chip${s.pop > airCap ? ' bad' : ''}"><b>${airCap.toLocaleString()}</b><span>Air capacity</span></div>` +
      `<div class="chip"><b>${s.day.toLocaleString()}</b><span>Day</span></div>`;

    const warn = [];
    if (s.flareDays > 0) warn.push(`A solar flare has the grid in protective shutdown for another ${s.flareDays} day${s.flareDays === 1 ? '' : 's'}. Generation is cut until it passes — nothing has been damaged.`);
    if (s.credits < 0) warn.push('The treasury is in deficit. Every department is running at half effect until it recovers — raise tax, or cut spending.');
    if (load > gen) warn.push('The grid is over capacity and growth has stopped. Build more generation, or restore the Power Grid budget.');
    if (s.pop > airCap) warn.push('Not enough pressurisation for this population. Build another oxygen plant, or restore the Atmosphere budget.');
    if (eff.safety < 0.65) warn.push('Repair funding is short. A maintenance backlog is building and developed districts will start losing density.');
    document.getElementById('advisor').innerHTML = warn.length
      ? warn.map(w => `<p class="note" style="border-left-color:var(--bad)">${w}</p>`).join('')
      : '';

    document.getElementById('demand').innerHTML =
      bar('Habitation', s.demand.hab) + bar('Trade', s.demand.trade) + bar('Industry', s.demand.industry);

    /* Era readout. Shows both thresholds separately, because a city that has
       the population but not the research needs to be told to fund science
       rather than to keep building. */
    const eraBox = document.getElementById('era');
    if (eraBox && E) {
      const cur = E.current(s), nx = E.next(s);
      const pct = (v, label, need) =>
        `<div class="meter"><div class="lab"><span>${label}</span><span>${need}</span></div>
         <div class="track"><div class="fill" style="width:${Math.round(v * 100)}%;background:var(--accent)"></div></div></div>`;
      eraBox.innerHTML =
        `<div class="rows"><div class="row"><span class="k">Era</span><span class="v good">${cur.name}</span></div>
         <div class="row"><span class="k">Density ceiling</span><span class="v">stage ${cur.stageCap}</span></div>
         <div class="row"><span class="k">Research banked</span><span class="v">${Math.round(s.research).toLocaleString()}</span></div></div>
         <p class="note">${cur.blurb}</p>` +
        (nx ? `<p class="note" style="border-left-color:var(--accent-2)">Next: <b>${nx.era.name}</b></p>` +
              pct(nx.popPct, 'Population', `${(s.peakPop || 0).toLocaleString()} / ${nx.era.pop.toLocaleString()}`) +
              pct(nx.researchPct, 'Research', `${Math.round(s.research).toLocaleString()} / ${nx.era.research.toLocaleString()}`)
            : `<p class="note">This colony has reached its final era.</p>`);
    }
  }

  /* ---------- budget panel ---------- */

  /* Rebuilt wholesale only when the tab is opened or a dial moves; the live
     numbers inside it are refreshed separately every tick so dragging a
     slider does not fight with the simulation rewriting the DOM underneath
     the input the player is holding. */
  function buildBudget() {
    const el = document.getElementById('pane-budget');
    const m = B.monthly(s, Z.tally(s));
    el.innerHTML = `
      <h3 class="sec">Taxation</h3>
      <div class="ctrl">
        <label>Tax rate</label>
        <input type="range" id="taxRate" min="0" max="${K.MAX_TAX}" step="1" value="${s.taxRate}">
        <span class="v" id="taxRateVal" style="font-family:var(--mono);min-width:34px;text-align:right">${s.taxRate}%</span>
      </div>
      <p class="note">Above ${K.BASE_TAX}% the treasury takes more but every demand index is dragged
        down — a heavily taxed city is rich, well maintained and stops growing.</p>

      <h3 class="sec">Departments</h3>
      ${D.DEPARTMENTS.map(d => `
        <div class="ctrl">
          <label title="${d.effect}">${d.name}</label>
          <input type="range" class="fund" data-dept="${d.id}" min="0" max="100" step="5" value="${Math.round((s.funding[d.id] ?? 1) * 100)}">
          <span class="v" id="fund-${d.id}" style="font-family:var(--mono);min-width:34px;text-align:right">${Math.round((s.funding[d.id] ?? 1) * 100)}%</span>
        </div>`).join('')}

      <h3 class="sec">Monthly projection</h3>
      <div class="rows" id="budgetRows"></div>
      <p class="note" id="budgetNote"></p>`;

    el.querySelector('#taxRate').oninput = e => {
      s.taxRate = +e.target.value;
      el.querySelector('#taxRateVal').textContent = s.taxRate + '%';
      renderBudgetNumbers(); save();
    };
    el.querySelectorAll('.fund').forEach(inp => inp.oninput = e => {
      const id = e.target.dataset.dept;
      s.funding[id] = +e.target.value / 100;
      el.querySelector('#fund-' + id).textContent = e.target.value + '%';
      renderBudgetNumbers(); save();
    });
    renderBudgetNumbers();
  }

  function renderBudgetNumbers() {
    const rows = document.getElementById('budgetRows');
    if (!rows) return;
    const m = B.monthly(s, Z.tally(s));
    const money = v => (v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString();
    rows.innerHTML =
      `<div class="row"><span class="k">Taxable activity</span><span class="v">${Math.round(m.taxBase).toLocaleString()}</span></div>
       <div class="row"><span class="k">Revenue</span><span class="v good">+${money(m.revenue)}</span></div>` +
      D.DEPARTMENTS.map(d => `<div class="row"><span class="k">${d.name}</span><span class="v bad">−${money(m.byDept[d.id])}</span></div>`).join('') +
      `<div class="row"><span class="k">District upkeep</span><span class="v bad">−${money(s.zoneUpkeep * 30)}</span></div>
       <div class="row"><span class="k">Net per 30 days</span><span class="v ${m.net - s.zoneUpkeep * 30 >= 0 ? 'good' : 'bad'}">${m.net - s.zoneUpkeep * 30 >= 0 ? '+' : ''}${money(m.net - s.zoneUpkeep * 30)}</span></div>
       <div class="row"><span class="k">Research banked</span><span class="v">${Math.round(s.research).toLocaleString()}</span></div>`;

    const note = document.getElementById('budgetNote');
    if (note) {
      note.textContent = s.credits < 0
        ? 'The treasury is in deficit — every department is running at half effect until it recovers. Raise tax or cut spending.'
        : 'Departments are charged daily, in proportion to the infrastructure each one maintains.';
      note.style.borderLeftColor = s.credits < 0 ? 'var(--bad)' : '';
    }
  }

  /* ---------- trends ---------- */

  /* Inline SVG sparklines over s.history, which the simulation already keeps
     (the last 400 days). No library, no canvas, and no data that is not
     genuinely recorded — every series here is a field the tick actually
     writes. */
  function spark(series, colours, label, fmt) {
    const n = series[0].length;
    if (n < 2) return `<div class="meter"><div class="lab"><span>${label}</span><span>—</span></div>
      <p class="note">Not enough history yet.</p></div>`;
    let lo = Infinity, hi = -Infinity;
    for (const s2 of series) for (const v of s2) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi === lo) { hi = lo + 1; }
    const W = 260, H = 46;
    const path = arr => arr.map((v, i) =>
      `${i ? 'L' : 'M'}${(i / (n - 1) * W).toFixed(1)},${(H - (v - lo) / (hi - lo) * H).toFixed(1)}`).join('');
    const lines = series.map((s2, i) =>
      `<path d="${path(s2)}" fill="none" stroke="${colours[i]}" stroke-width="1.6"/>`).join('');
    const last = series.map(s2 => fmt(s2[n - 1])).join(' / ');
    return `<div class="meter">
      <div class="lab"><span>${label}</span><span style="font-family:var(--mono)">${last}</span></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
           style="width:100%;height:46px;display:block;background:rgba(255,255,255,.03);border-radius:4px">
        ${lines}
      </svg>
      <div class="lab" style="opacity:.6"><span>${fmt(lo)}</span><span>${fmt(hi)}</span></div>
    </div>`;
  }

  function buildTrends() {
    const el = document.getElementById('pane-trends');
    const h = s.history || [];
    const num = v => Math.round(v).toLocaleString();
    const pick = k => h.map(r => r[k] || 0);

    el.innerHTML = `
      <h3 class="sec">The city so far</h3>
      <div class="rows">
        <div class="row"><span class="k">Day</span><span class="v">${s.day.toLocaleString()}</span></div>
        <div class="row"><span class="k">Population</span><span class="v">${s.pop.toLocaleString()}</span></div>
        <div class="row"><span class="k">Peak population</span><span class="v">${(s.peakPop || 0).toLocaleString()}</span></div>
        <div class="row"><span class="k">Jobs</span><span class="v">${s.jobs.toLocaleString()}</span></div>
        <div class="row"><span class="k">Developed tiles</span><span class="v">${S.developedCount(s).toLocaleString()} of ${S.zonedCount(s).toLocaleString()} zoned</span></div>
        <div class="row"><span class="k">Era</span><span class="v good">${E ? E.current(s).name : '—'}</span></div>
        <div class="row"><span class="k">Research banked</span><span class="v">${num(s.research)}</span></div>
      </div>

      <h3 class="sec">Trends</h3>
      <p class="note">The last ${h.length} recorded days.</p>
      ${spark([pick('pop'), pick('housingCap')], ['#6ee7a0', '#5fc9ff'], 'Population / housing capacity', num)}
      ${spark([pick('gen'), pick('load')], ['#ffd479', '#ff9f6e'], 'Generation / load (kW)', v => v.toFixed(0))}
      ${spark([pick('revenue'), pick('expenses')], ['#6ee7a0', '#ff7a9c'], 'Revenue / expenses per day', num)}
      ${spark([pick('credits')], ['#c98bff'], 'Treasury', num)}

      <h3 class="sec">Modes</h3>
      <div class="rows">
        <div class="row"><span class="k">Auto-play</span><span class="v${s.autoPlay ? ' good' : ''}">${s.autoPlay ? 'on' : 'off'}</span></div>
        <div class="row"><span class="k">Sandbox</span><span class="v${s.sandbox ? ' good' : ''}">${s.sandbox ? 'on' : 'off'}</span></div>
        <div class="row"><span class="k">Disasters</span><span class="v${s.disastersOn ? ' warn' : ''}">${s.disastersOn ? 'armed' : 'off'}</span></div>
      </div>`;
  }

  document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
    document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + t.dataset.tab));
    if (t.dataset.tab === 'budget') buildBudget();
    if (t.dataset.tab === 'trends') buildTrends();
  });

  document.querySelectorAll('#viewBar button').forEach(b => b.onclick = () => {
    ui.view = b.dataset.view;
    document.querySelectorAll('#viewBar button').forEach(x => x.classList.toggle('on', x === b));
  });
  document.querySelectorAll('.sp').forEach(b => b.onclick = () => {
    ui.speed = +b.dataset.speed;
    document.querySelectorAll('.sp').forEach(x => x.classList.toggle('on', x === b));
  });

  /* ---------- modes ---------- */

  /* Three independent switches, all persisted with the save. Auto-play and
     Sandbox compose deliberately: the director building a free city is a
     legitimate way to watch the whole era arc play out quickly. */
  function markModes() {
    document.getElementById('btnAuto').classList.toggle('on', !!s.autoPlay);
    document.getElementById('btnSandbox').classList.toggle('on', !!s.sandbox);
    document.getElementById('btnDisasters').classList.toggle('on', !!s.disastersOn);
    document.getElementById('btnInvasion').classList.toggle('on', !!s.invasionOn);
  }

  document.getElementById('btnAuto').onclick = () => {
    s.autoPlay = !s.autoPlay;
    markModes();
    toast(s.autoPlay
      ? 'Auto-play on. The director will build and manage the city — your tools still work alongside it.'
      : 'Auto-play off. The city is yours again.');
    save();
  };
  document.getElementById('btnSandbox').onclick = () => {
    s.sandbox = !s.sandbox;
    markModes();
    /* Costs are shown on every palette button, so the palette has to be
       rebuilt for the prices — and the locks — to reflect the new mode. */
    buildPalette(); renderHUD();
    toast(s.sandbox
      ? 'Sandbox on. Everything is free and nothing is locked.'
      : 'Sandbox off. Costs and era locks are back.');
    save();
  };
  document.getElementById('btnDisasters').onclick = () => {
    s.disastersOn = !s.disastersOn;
    markModes();
    toast(s.disastersOn
      ? 'Disasters armed. Nothing here can end the run — the worst case is ground to rebuild.'
      : 'Disasters off.');
    save();
  };

  document.getElementById('btnInvasion').onclick = () => {
    s.invasionOn = !s.invasionOn;
    markModes();
    toast(s.invasionOn
      ? 'Invasion deck armed. Half of it is harmless and one card is good news.'
      : 'Invasion deck stood down.');
    save();
  };

  /* Stages the animation for whatever the invasion deck just did. The
     simulation returns a descriptor — the path a saucer flew, the tile a beam
     came down on — and this is the only place that turns one into a picture,
     so invasion.js never has to know a renderer exists. */
  function stageInvasionFx(ev) {
    const FX = window.LM_FX;
    if (!FX || !ev) return;
    if (ev.id === 'ufo') FX.spawn('saucer', { path: ev.path, dur: 7000 });
    else if (ev.id === 'worm') FX.spawn('worm', { path: ev.path, dur: 6500 });
    else if (ev.id === 'abduction' && ev.taken) FX.spawn('beam', { x: ev.taken.x, y: ev.taken.y, dur: 5200 });
    else if (ev.id === 'herald') {
      /* the herald leaves no path of its own, so give it one across the
         district it cleaned */
      const path = [];
      for (let i = -14; i <= 14; i++) path.push([ev.x + i, ev.y]);
      FX.spawn('herald', { path, dur: 7500 });
    }
  }

  /* ---------- the General's offer ----------

     A card in the City panel rather than a modal. SimCity 2000 stopped the
     world to ask; this game deliberately never blocks the clock — there is no
     fail state to protect you from, so an unanswered offer just sits there
     until you feel like answering it. */
  function renderOffer() {
    const box = document.getElementById('offer');
    if (!box) return;
    const m = s.military;
    if (!m || m.state !== 'pending') { box.innerHTML = ''; return; }
    const kind = S.BASE_KINDS[m.kind];
    box.innerHTML = `
      <h3 class="sec">A call from the General</h3>
      <p class="note" style="border-left-color:var(--accent-2)">
        The colony is large enough to warrant a military presence, and
        ${kind.why} — so they are offering a <b>${kind.name}</b>.
        Accepting unlocks the military brush; you site it yourself.
        It employs a standing complement, pays no tax, and nobody wants to
        live next door to it.</p>
      <div class="modes" style="justify-content:flex-start;gap:6px;margin:6px 0 10px">
        <button id="offerYes" class="mode">Accept the ${kind.name}</button>
        <button id="offerNo" class="mode">Decline</button>
      </div>`;
    box.querySelector('#offerYes').onclick = () => {
      S.acceptMilitary(s); buildPalette(); renderOffer(); renderLog(); save();
      toast('The military brush is now in Special Districts.');
    };
    box.querySelector('#offerNo').onclick = () => {
      S.declineMilitary(s); renderOffer(); renderLog(); save();
      toast('The General has been turned down.');
    };
  }

  /* ---------- log ---------- */

  function renderLog() {
    const box = document.getElementById('log');
    if (!box) return;
    if (!s.log || !s.log.length) {
      box.className = 'empty';
      box.textContent = 'Nothing has happened yet.';
      return;
    }
    box.className = '';
    box.innerHTML = s.log.slice(0, 8).map(e =>
      `<p class="note"><b style="font-family:var(--mono)">Day ${e.day}</b> — ${e.msg}</p>`).join('');
  }

  document.getElementById('btnNew').onclick = () => {
    if (!confirm('Start a new colony on fresh terrain? This clears the current city.')) return;
    /* The three mode switches are a statement about how the player wants to
       play, not part of the city — carry them across a new map rather than
       making them set them again. */
    const modes = { sandbox: s.sandbox, disastersOn: s.disastersOn, autoPlay: s.autoPlay };
    s = Object.assign(S.newGame(), modes);
    ui.selected = null; ui.levelTarget = null;
    if (window.LM_AGENTS) window.LM_AGENTS.reset();
    centreOn(K.COLS / 2, K.ROWS / 2);
    refreshNets(); buildPalette(); renderTile(); renderHUD(); renderLog();
    renderOffer(); markModes(); setHint(); save();
  };
  /* Centres on the city rather than on the map. The two are only the same
     thing on day one — a player settles wherever the terrain suited them, and
     the AI director picks its own site, which on a 128-tile map can be a long
     way from the middle. Centring on empty regolith and calling it "Centre"
     is how you lose a city you just built. */
  function cityCentre() {
    let sx = 0, sy = 0, n = 0;
    for (const t of s.map) {
      if (!t.b && !t.zone) continue;
      sx += t.x; sy += t.y; n++;
    }
    return n ? { x: sx / n, y: sy / n } : { x: K.COLS / 2, y: K.ROWS / 2 };
  }
  document.getElementById('btnCentre').onclick = () => {
    const c = cityCentre();
    centreOn(c.x, c.y);
  };

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
  const SAVE_EVERY_MS = 4000;
  let last = performance.now(), acc = 0, lastSave = 0, drawFailed = false;
  let lastLogLen = -1, lastEra = -1, agentsFailed = false;

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    /* Refresh the panels when the simulation actually advances rather than
       on a frame count — the readouts then track the city instead of the
       frame rate, which matters wherever rAF is throttled. */
    let ticked = 0;
    if (ui.speed > 0) {
      acc += dt * ui.speed;
      while (acc > DAY_MS / 1000 && ticked < 12) {
        try {
          const r = S.tick(s);
          if (r && r.invasion) stageInvasionFx(r.invasion);
        } catch (e) { console.error(e); }
        acc -= DAY_MS / 1000;
        ticked++;
      }
      if (ticked) {
        refreshNets(); renderHUD(); renderTile(); renderBudgetNumbers(); ui.dirty = true;
        /* The log only redraws when something was actually written to it, and
           the palette only rebuilds when the era moved — both are full DOM
           rewrites and neither belongs on every tick. */
        const n = s.log ? s.log.length : 0;
        if (n !== lastLogLen) { lastLogLen = n; renderLog(); renderOffer(); }
        const era = E ? E.index(s) : 0;
        if (era !== lastEra) { lastEra = era; buildPalette(); }
        /* Trends is a full rebuild, so it only redraws while it is the pane
           actually on screen. */
        const trends = document.getElementById('pane-trends');
        if (trends && trends.classList.contains('on')) buildTrends();
      }
    }
    /* Set pieces retire themselves on their own clock, which keeps running
       while the city is paused — an eight-second animation should finish
       playing even if you hit pause halfway through it. */
    if (window.LM_FX) window.LM_FX.update();
    /* Traffic moves only while the clock does — a paused city should be a
       still photograph, not a diorama with the cars still running. Scaled by
       game speed so 12x reads as rush hour. Guarded like everything else in
       this loop so a cosmetic layer can never take the frame down. */
    if (ui.speed > 0 && window.LM_AGENTS) {
      try { window.LM_AGENTS.update(s, dt * Math.min(ui.speed, 4)); }
      catch (e) { if (!agentsFailed) { agentsFailed = true; console.error('agents', e); } }
    }
    /* Guarded for the same reason the tick is: an exception thrown out of a
       single frame would otherwise stop requestAnimationFrame for good and
       leave a black canvas with no way back short of a reload. */
    try { R.draw(ctx, s, ui); }
    catch (e) { if (!drawFailed) { drawFailed = true; console.error('draw failed', e); } }
    /* A full save is well over a megabyte of JSON on a 128x128 map, so it is
       throttled and only written when something actually changed. Saving on
       a frame counter meant rewriting the whole world roughly twice a second
       — including while paused, with nothing to save. */
    if (ui.dirty && now - lastSave > SAVE_EVERY_MS) {
      save(); ui.dirty = false; lastSave = now;
    }
    requestAnimationFrame(frame);
  }

  /* Debug handle, matching farm/'s window.__lf. requestAnimationFrame is
     throttled hard in some embedded browsers, so the only reliable way to
     verify the renderer or the traffic layer is to drive them directly and
     put the camera exactly where the thing under test is. Read-only as far
     as the game is concerned — nothing in here is wired to gameplay. */
  window.__lm = {
    get s() { return s; }, ui, ctx, R, S, T, G, Z, E,
    centreOn, redraw: () => R.draw(ctx, s, ui),
    /* Centres on a tile AS DRAWN, not on its flat footprint. A tile at height
       12 is painted 168 world units above where centreOn puts it, which at
       high zoom is most of a screen — looking at a mountaintop with the plain
       version puts the thing you wanted off the top of the view. */
    look(tx, ty, z) {
      if (z) ui.cam.z = z;
      centreOn(tx, ty);
      const t = T.tileAt(s, Math.round(tx), Math.round(ty));
      if (t) ui.cam.y += t.h * K.LEVEL_PX * ui.cam.z;
      R.draw(ctx, s, ui);
    }
  };

  refreshNets();
  buildPalette(); setHint(); renderTile(); renderHUD(); renderLog(); renderOffer(); markModes();
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
})();
