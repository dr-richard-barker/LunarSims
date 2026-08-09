/* Artemis City — input, camera, HUD and the main loop.
   Mirrors Lunar Farm's ui.js conventions: a build tool active means drag
   draws (a line for roads/rail, a rectangle for zones/fields); any other
   tool means drag pans the map and a tap applies the tool. */

(function () {
  const S = window.LC_SIM, R = window.LC_RENDER, D = window.LC_DATA;
  const DASH = window.LC_DASH, LEAGUE = window.LC_LEAGUE;
  const K = D.K;
  const SAVE_KEY = 'artemis-city.save.v1';

  const OPS = [
    { id: 'inspect', name: 'Inspect', g: '🔍', key: '1' },
    { id: 'bulldoze', name: 'Bulldoze', g: '💥', key: '2' },
    { id: 'plant', name: 'Plant', g: '🌱', key: '3' },
    { id: 'water', name: 'Water', g: '💧', key: '4' },
    { id: 'feed', name: 'Feed', g: '🧪', key: '5' },
    { id: 'treat', name: 'Treat', g: '💉', key: '6' },
    { id: 'harvest', name: 'Harvest', g: '🌾', key: '7' },
    { id: 'clear', name: 'Clear', g: '✖', key: '8' }
  ];

  let s = load() || S.newGame();
  const ui = {
    cam: { x: 0, y: 0, z: 0.58 },
    tool: 'inspect', selected: null, preview: null,
    building: null, pointerDown: false, dragMoved: false,
    pointerDownScreen: null, camAtDown: null,
    speed: 1, tab: 'info', showDeposits: true, view: 'zones'
  };

  /* ---------- canvas ---------- */

  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');

  let cssW = 800, cssH = 600;
  function fitCanvas() {
    const rect = cv.parentElement.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cssW = Math.max(320, rect.width - 20); cssH = Math.max(280, rect.height - 46);
    cv.width = cssW * dpr; cv.height = cssH * dpr;
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  /* Centre the camera on the founding plot rather than the (0,0) map
     corner, which is off in empty regolith on a map this size. */
  function centreOn(tx, ty) {
    const p = R.iso(tx, ty);
    ui.cam.x = -p.x * ui.cam.z;
    ui.cam.y = cssH / 2 - 92 - p.y * ui.cam.z;
  }
  centreOn(K.COLS / 2, K.ROWS / 2);

  /* ---------- tile <-> screen ---------- */

  function screenToTile(clientX, clientY) {
    const rect = cv.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    const wx = (sx - rect.width / 2 - ui.cam.x) / ui.cam.z;
    const wy = (sy - 92 - ui.cam.y) / ui.cam.z;
    const tx = (wx / (R.TW / 2) + wy / (R.TH / 2)) / 2;
    const ty = (wy / (R.TH / 2) - wx / (R.TW / 2)) / 2;
    return { x: Math.round(tx), y: Math.round(ty) };
  }

  function tileAtPt(p) { return S.tileAt(s, p.x, p.y); }

  /* ---------- palette ---------- */

  function toolById(id) {
    if (id === 'inspect' || OPS.some(o => o.id === id)) return OPS.find(o => o.id === id) || { id };
    return D.BUILDINGS.find(b => b.id === id);
  }
  const currentTool = () => toolById(ui.tool);

  function toolRow(t, glyph) {
    const div = document.createElement('button');
    div.className = 'tool' + (ui.tool === t.id ? ' on' : '');
    div.innerHTML = `<span class="g">${glyph}</span><span class="n">${t.name}</span><span class="k">${t.key || ''}</span>`;
    div.title = t.desc || '';
    div.onclick = () => { ui.tool = t.id; ui.selected = null; buildPalette(); setHint(); };
    return div;
  }

  function buildPalette() {
    const op = document.getElementById('opTools'); op.innerHTML = '';
    OPS.forEach(o => op.appendChild(toolRow(o, o.g)));

    const groups = { roads: 'roadsTools', zones: 'zonesTools', power: 'powerTools', mining: 'miningTools' };
    Object.values(groups).forEach(id => { document.getElementById(id).innerHTML = ''; });
    D.BUILDINGS.filter(b => !b.hidden).forEach(b => {
      const el = document.getElementById(groups[b.group]);
      if (!el) return;
      const glyph = b.line ? (b.id === 'rail' ? '╬' : '═') : b.zone ? '▦' : (window.LC_RENDER_GLYPH || {})[b.id] || '■';
      el.appendChild(toolRow(b, glyph));
    });
  }

  /* Upgrades are a colony-wide one-off purchase, not a tile tool — clicking
     one buys it immediately rather than entering the drag/line/place state
     machine the rest of the palette uses. */
  function upgradeRow(u) {
    const owned = S.hasUpgrade(s, u.id);
    const cost = s.sandbox ? 0 : u.cost;
    const div = document.createElement('button');
    div.className = 'tool' + (owned ? ' on' : '');
    div.disabled = owned;
    div.innerHTML = `<span class="g">${owned ? '✔' : '🛠'}</span><span class="n">${u.name}</span><span class="k">${owned ? 'Owned' : cost.toLocaleString()}</span>`;
    div.title = u.desc || '';
    div.onclick = () => {
      const err = S.buyUpgrade(s, u.id);
      if (err) toast(err, true); else toast(`${u.name} fitted.`);
      buildUpgradesPalette(); save();
    };
    return div;
  }

  function buildUpgradesPalette() {
    const el = document.getElementById('upgradesTools');
    el.innerHTML = '';
    D.UPGRADES.forEach(u => el.appendChild(upgradeRow(u)));
  }

  function setHint() {
    const t = currentTool();
    const el = document.getElementById('toolHint');
    if (!t || t.id === 'inspect') { el.textContent = 'Inspect — click any tile to read it.'; return; }
    if (t.line) { el.textContent = `${t.name} — drag to run a line, one turn, SimCity-style.`; return; }
    if (t.drag) { el.textContent = `${t.name} — drag a rectangle over open ground.`; return; }
    el.textContent = `${t.name} — click a tile to place it.`;
  }

  /* ---------- build geometry ---------- */

  function linePath(a, b) {
    const pts = [];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      const sx = dx === 0 ? 1 : Math.sign(dx);
      for (let x = a.x; x !== b.x + sx; x += sx) { pts.push({ x, y: a.y }); if (x === b.x) break; }
      const sy = dy === 0 ? 1 : Math.sign(dy);
      if (dy !== 0) for (let y = a.y + sy; y !== b.y + sy; y += sy) { pts.push({ x: b.x, y }); if (y === b.y) break; }
    } else {
      const sy = dy === 0 ? 1 : Math.sign(dy);
      for (let y = a.y; y !== b.y + sy; y += sy) { pts.push({ x: a.x, y }); if (y === b.y) break; }
      const sx = dx === 0 ? 1 : Math.sign(dx);
      if (dx !== 0) for (let x = a.x + sx; x !== b.x + sx; x += sx) { pts.push({ x, y: b.y }); if (x === b.x) break; }
    }
    const seen = new Set(), out = [];
    for (const p of pts) { const k = p.x + ',' + p.y; if (!seen.has(k)) { seen.add(k); out.push(p); } }
    return out;
  }

  function rectFrom(a, b) {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
  }

  function computePreview(tool, start, cur) {
    if (tool.line) {
      const path = linePath(start, cur);
      return { cells: path.map(p => ({ x: p.x, y: p.y, ok: !S.canPlace(s, S.tileAt(s, p.x, p.y), tool.id) })) };
    }
    const r = rectFrom(start, cur);
    const err = tool.zone === 'ag' ? S.checkField(s, r.x, r.y, r.w, r.h) : window.LC_ZONES.checkZone(s, r.x, r.y, r.w, r.h);
    const cells = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push({ x, y, ok: !err });
    return { cells, rect: r, err };
  }

  function commitBuild(tool, start, cur) {
    if (tool.line) {
      const path = linePath(start, cur);
      let placed = 0, err = null;
      for (const p of path) {
        const t = S.tileAt(s, p.x, p.y);
        if (!t) continue;
        const e = S.place(s, t, tool.id);
        if (!e) placed++; else err = e;
      }
      if (!placed && err) toast(err);
    } else {
      const r = rectFrom(start, cur);
      const err = tool.zone === 'ag' ? S.addField(s, r.x, r.y, r.w, r.h) : S.paintZone(s, r.x, r.y, r.w, r.h, tool.zone);
      if (err) toast(err);
    }
    save(); renderColony(); renderGoals();
  }

  /* ---------- pointer input ---------- */

  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    ui.pointerDown = true; ui.dragMoved = false;
    ui.pointerDownScreen = { x: e.clientX, y: e.clientY };
    ui.camAtDown = { x: ui.cam.x, y: ui.cam.y };
    const tile = screenToTile(e.clientX, e.clientY);
    ui.pointerDownTile = tile;
    const tool = currentTool();
    ui.building = (tool && (tool.line || tool.drag)) ? { tool, start: tile, cur: tile } : null;
  });

  cv.addEventListener('pointermove', e => {
    if (!ui.pointerDown) return;
    const dx = e.clientX - ui.pointerDownScreen.x, dy = e.clientY - ui.pointerDownScreen.y;
    if (Math.hypot(dx, dy) > 4) ui.dragMoved = true;
    if (ui.building) {
      ui.building.cur = screenToTile(e.clientX, e.clientY);
      ui.preview = computePreview(ui.building.tool, ui.building.start, ui.building.cur);
    } else {
      ui.cam.x = ui.camAtDown.x + dx;
      ui.cam.y = ui.camAtDown.y + dy;
    }
  });

  cv.addEventListener('pointerup', e => {
    ui.pointerDown = false;
    if (ui.building) {
      commitBuild(ui.building.tool, ui.building.start, ui.building.cur);
      ui.building = null; ui.preview = null;
    } else if (!ui.dragMoved) {
      onTileClick(ui.pointerDownTile);
    }
  });

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    ui.cam.z = Math.max(0.4, Math.min(2.4, ui.cam.z * (e.deltaY < 0 ? 1.08 : 0.92)));
  }, { passive: false });

  function onTileClick(pt) {
    const t = tileAtPt(pt);
    if (!t) return;
    const tool = currentTool();
    if (!tool || tool.id === 'inspect') { ui.selected = t; renderTile(); switchTab('info'); return; }
    if (tool.id === 'bulldoze') { toastErr(S.bulldoze(s, t)); ui.selected = t; renderTile(); save(); return; }
    if (['plant', 'water', 'feed', 'treat', 'harvest', 'clear'].includes(tool.id)) {
      const f = S.fieldAt(s, t);
      if (!f) { toast('Not a grow hall.'); return; }
      ui.selected = t;
      if (tool.id === 'plant') { openPlant(f); return; }
      if (tool.id === 'water') toastErr(S.water(s, f));
      else if (tool.id === 'feed') toastErr(S.feed(s, f));
      else if (tool.id === 'treat') toastErr(S.treat(s, f));
      else if (tool.id === 'harvest') toastErr(S.harvest(s, f));
      else if (tool.id === 'clear') toastErr(S.clearField(s, f));
      renderTile(); save(); return;
    }
    // single-tile build
    toastErr(S.place(s, t, tool.id));
    ui.selected = t; renderTile(); save();
  }

  /* ---------- tile panel ---------- */

  function meter(label, frac, cls) {
    const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
    return `<div class="meter"><div class="lab"><span>${label}</span><span>${pct}%</span></div>
      <div class="track"><div class="fill" style="width:${pct}%;background:var(--${cls || 'accent'})"></div></div></div>`;
  }

  function renderTile() {
    const box = document.getElementById('tileDetail');
    const actions = document.getElementById('tileActions');
    actions.innerHTML = '';
    const t = ui.selected;
    if (!t) { box.className = 'empty'; box.textContent = 'Click a tile on the surface.'; return; }
    box.className = '';

    if (t.f) {
      const f = S.fieldById(s, t.f);
      const crop = f.crop ? D.CROPS.find(c => c.id === f.crop) : null;
      box.innerHTML = `<div class="baytitle"><h2>Grow Hall</h2><span class="num">${f.w}×${f.h}</span></div>
        ${crop ? `<p class="cultivar">${crop.name}${crop.cultivar ? ' ' + crop.cultivar : ''}</p>` : '<p class="cultivar">Empty — plant a crop.</p>'}
        ${crop ? meter('Growth', f.growth) : ''}
        ${meter('Moisture', f.moisture, f.moisture < 0.3 ? 'bad' : 'accent')}
        ${meter('Feed', f.feed, f.feed < 0.3 ? 'bad' : 'accent')}
        ${meter('Soil conditioning', f.soil)}
        ${meter('Health', f.health, f.health < 0.5 ? 'bad' : 'good')}
        ${crop && crop.note ? `<p class="note">${crop.note}</p>` : ''}`;
      if (!f.crop) act(actions, 'Plant', () => openPlant(f), true);
      else { act(actions, 'Water', () => { toastErr(S.water(s, f)); renderTile(); save(); });
        act(actions, 'Feed', () => { toastErr(S.feed(s, f)); renderTile(); save(); });
        if (f.growth >= 1) act(actions, 'Harvest', () => { toastErr(S.harvest(s, f)); renderTile(); save(); }, true);
        act(actions, 'Clear', () => { toastErr(S.clearField(s, f)); renderTile(); save(); }); }
      act(actions, 'Bulldoze hall', () => { toastErr(S.bulldoze(s, t)); ui.selected = null; renderTile(); save(); });
      return;
    }

    if (t.zone) {
      const z = t.zone, zd = window.LC_ZONES.zoneById(z.kind);
      const st = zd.stages[z.stage];
      box.innerHTML = `<div class="baytitle"><h2>${zd.name}</h2><span class="num">stage ${z.stage}/${K.MAX_STAGE}</span></div>
        ${meter('Density', z.growth)}
        <div class="rows">
          ${st.pop !== undefined ? `<div class="row"><span class="k">Housing</span><span class="v">${st.pop}</span></div>` : ''}
          ${st.jobs !== undefined ? `<div class="row"><span class="k">Jobs</span><span class="v">${st.jobs}</span></div>` : ''}
          ${st.income ? `<div class="row"><span class="k">Income/day</span><span class="v good">+${st.income}</span></div>` : ''}
          ${st.upkeep ? `<div class="row"><span class="k">Upkeep/day</span><span class="v bad">-${st.upkeep}</span></div>` : ''}
          <div class="row"><span class="k">Demand</span><span class="v">${(s.demand[z.kind] * 100).toFixed(0)}%</span></div>
        </div>
        <p class="note">${zd.desc}</p>`;
      act(actions, 'Unzone', () => { toastErr(S.bulldoze(s, t)); ui.selected = null; renderTile(); save(); });
      return;
    }

    if (t.b) {
      const B = S.buildById(t.b.type);
      box.innerHTML = `<div class="baytitle"><h2>${B.name}</h2></div>
        <p class="note">${B.desc}</p>
        ${t.b.type === 'spaceport' ? `<div class="rows"><div class="row"><span class="k">Cooldown</span><span class="v">${t.b.cooldown > 0 ? t.b.cooldown + 'h' : 'ready'}</span></div>
          <div class="row"><span class="k">Yard: He-3</span><span class="v">${Math.round(s.resources.he3)}</span></div>
          <div class="row"><span class="k">Yard: Regolith</span><span class="v">${Math.round(s.resources.regolith)}</span></div></div>` : ''}`;
      if (t.b.type === 'spaceport') act(actions, 'Launch rocket', () => { toastErr(S.launchRocket(s)); renderTile(); save(); }, true);
      if (t.b.type !== 'command') act(actions, 'Bulldoze', () => { toastErr(S.bulldoze(s, t)); ui.selected = null; renderTile(); save(); });
      return;
    }

    const dep = t.deposit ? D.DEPOSITS.find(d => d.id === t.deposit.kind) : null;
    box.innerHTML = `<div class="baytitle"><h2>Surveyed ground</h2><span class="num">${t.x + 1},${t.y + 1}</span></div>
      <p class="cultivar">${t.t}</p>
      ${dep ? `<p class="note"><b>${dep.name}</b> — richness ${(t.deposit.richness * 100).toFixed(0)}%. ${dep.note}</p>` : ''}`;
    if (t.t === 'boulder') act(actions, 'Clear boulders', () => { toastErr(S.bulldoze(s, t)); renderTile(); save(); });
  }

  function act(container, label, fn, primary) {
    const b = document.createElement('button');
    b.className = 'act' + (primary ? ' primary' : '');
    b.textContent = label;
    b.onclick = fn;
    container.appendChild(b);
  }

  /* ---------- plant modal ---------- */

  let plantField = null;
  function openPlant(f) {
    plantField = f;
    const list = document.getElementById('cropList'); list.innerHTML = '';
    document.getElementById('plantLede').textContent = `Choose what goes in the ${f.w}×${f.h} hall.`;
    D.CROPS.forEach(c => {
      const cost = S.seedCost(c, f);
      const btn = document.createElement('button');
      btn.className = 'crop';
      btn.disabled = s.credits < cost;
      btn.innerHTML = `<div class="top"><b>${c.name}</b><span class="seed">${cost.toLocaleString()} cr</span></div>
        <span class="cv">${c.cultivar || c.kind}</span>
        <div class="stats"><span><span class="dot" style="background:${c.colour}"></span>${c.days}d</span><span>${c.kcal} kcal</span></div>`;
      btn.onclick = () => { toastErr(S.plant(s, f, c.id)); closeModals(); renderTile(); save(); };
      list.appendChild(btn);
    });
    document.getElementById('mPlant').hidden = false;
  }

  /* ---------- colony / charter / log tabs ---------- */

  function renderColony() {
    const el = document.getElementById('pane-colony');
    const gen = S.generation(s), dem = S.gridDemand(s);
    const fill = S.fillRatio(s);
    const canExpand = S.canExpand(s);
    const cost = S.expandCost(s);
    const streak = S.selfSuffStreak(s);
    const todaySS = s.history.length ? !!s.history[s.history.length - 1].selfSufficient : false;
    el.innerHTML = `
      <h3 class="sec">Survey charter</h3>
      ${meter('Ground developed', fill, canExpand ? 'good' : 'accent')}
      <div class="rows">
        <div class="row"><span class="k">Charter size</span><span class="v">${s.revealed.x1 - s.revealed.x0 + 1}×${s.revealed.y1 - s.revealed.y0 + 1}</span></div>
      </div>
      ${cost > 0 ? `<button class="act wide${canExpand ? ' primary' : ''}" id="btnExpand"${canExpand ? '' : ' disabled'}>
        Expand survey — ${cost.toLocaleString()} cr${canExpand ? '' : ` (needs ${Math.round(K.EXPAND_FILL_THRESHOLD * 100)}% developed)`}
      </button>` : `<p class="note">The full survey charter has been revealed.</p>`}
      <h3 class="sec">Population</h3>
      <div class="rows">
        <div class="row"><span class="k">Population</span><span class="v">${s.pop} / ${s.housingCap}</span></div>
        <div class="row"><span class="k">Jobs</span><span class="v">${s.jobs || 0}</span></div>
      </div>
      <h3 class="sec">Demand</h3>
      ${meter('Habitation', (s.demand.hab + 1) / 2)}
      ${meter('Trade', (s.demand.trade + 1) / 2)}
      ${meter('Industry', (s.demand.industry + 1) / 2)}
      <h3 class="sec">Self-Sufficiency</h3>
      ${meter('Streak toward ten days', Math.min(1, streak / 10), streak >= 10 ? 'good' : 'accent')}
      <div class="rows">
        <div class="row"><span class="k">Today</span><span class="v${todaySS ? ' good' : ''}">${todaySS ? 'Self-sufficient' : 'Not yet'}</span></div>
        <div class="row"><span class="k">Current streak</span><span class="v">${streak} day${streak === 1 ? '' : 's'}</span></div>
      </div>
      <h3 class="sec">Power</h3>
      <div class="rows">
        <div class="row"><span class="k">Generation</span><span class="v">${gen.total.toFixed(1)} kW</span></div>
        <div class="row"><span class="k">Demand</span><span class="v">${dem.total.toFixed(1)} kW</span></div>
        <div class="row"><span class="k">Stored</span><span class="v">${Math.round(s.stored)} / ${Math.round(S.storageCap(s))} kWh</span></div>
      </div>
      <h3 class="sec">Life support</h3>
      <div class="rows">
        <div class="row"><span class="k">O₂</span><span class="v">${Math.round(s.resources.o2)} kg</span></div>
        <div class="row"><span class="k">Water</span><span class="v">${Math.round(s.resources.water)} L</span></div>
        <div class="row"><span class="k">Food reserve</span><span class="v">${(s.resources.food / Math.max(1, S.dailyFoodNeed(s))).toFixed(1)} days</span></div>
        <div class="row"><span class="k">Pressure</span><span class="v">${Math.round(s.pressure)}%</span></div>
      </div>
      <h3 class="sec">Yard</h3>
      <div class="rows">
        <div class="row"><span class="k">Regolith</span><span class="v">${Math.round(s.resources.regolith)}</span></div>
        <div class="row"><span class="k">Ice</span><span class="v">${Math.round(s.resources.ice)}</span></div>
        <div class="row"><span class="k">Helium-3</span><span class="v">${Math.round(s.resources.he3)}</span></div>
        <div class="row"><span class="k">Rockets launched</span><span class="v">${s.stats.launches || 0}</span></div>
      </div>`;
    const expandBtn = document.getElementById('btnExpand');
    if (expandBtn) expandBtn.onclick = () => { toastErr(S.expandSurvey(s)); renderColony(); save(); };
  }

  function renderGoals() {
    const el = document.getElementById('pane-goals');
    el.innerHTML = D.MILESTONES.map(m => {
      const done = !!s.done[m.id];
      return `<div class="goal${done ? ' done' : ''}"><span class="tick">${done ? '✔' : '○'}</span><span>${m.text}</span></div>`;
    }).join('');
  }

  function renderLog() {
    const el = document.getElementById('pane-log');
    el.innerHTML = s.log.length ? s.log.map(l => `<div class="logline"><b>D${l.day}</b>${l.msg}</div>`).join('')
      : '<div class="empty">Nothing logged yet.</div>';
  }

  /* ---------- report / league modals ---------- */

  function openReport() {
    document.getElementById('reportBody').innerHTML = DASH.render(s);
    document.getElementById('mReport').hidden = false;
    DASH.wireHover(document.getElementById('reportBody'), s, document.getElementById('dtip'));
  }

  function openLeague(justFiled) {
    const body = document.getElementById('leagueBody');
    body.innerHTML = LEAGUE.render(justFiled);
    document.getElementById('mLeague').hidden = false;
    const fileBtn = document.getElementById('lFile');
    if (fileBtn) fileBtn.onclick = () => { const r = LEAGUE.file(s); openLeague(r.r); };
    const exportBtn = document.getElementById('lExport');
    if (exportBtn) exportBtn.onclick = () => toast(`Exported ${LEAGUE.exportRuns()} run(s).`);
    const importBtn = document.getElementById('lImport');
    const importInput = document.getElementById('lFileInput');
    if (importBtn && importInput) {
      importBtn.onclick = () => importInput.click();
      importInput.onchange = () => {
        const file = importInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const result = LEAGUE.importRuns(reader.result);
          toast(typeof result === 'number' ? `Imported ${result} run(s).` : result, typeof result !== 'number');
          openLeague();
        };
        reader.readAsText(file);
      };
    }
  }

  function switchTab(id) {
    ui.tab = id;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === id));
    document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + id));
  }
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => switchTab(t.dataset.tab));

  /* ---------- HUD ---------- */

  function chip(label, value, cls) {
    return `<div class="chip${cls ? ' ' + cls : ''}"><b>${value}</b><span>${label}</span></div>`;
  }

  function renderHUD() {
    const foodDays = s.resources.food / Math.max(1, S.dailyFoodNeed(s));
    document.getElementById('chips').innerHTML =
      chip('Credits', Math.round(s.credits).toLocaleString()) +
      chip('Pop', `${s.pop}/${s.housingCap}`) +
      chip('Jobs', s.jobs || 0) +
      chip('O₂', Math.round(s.resources.o2), s.resources.o2 < 60 ? 'bad' : '') +
      chip('Water', Math.round(s.resources.water), s.resources.water < 100 ? 'warn' : '') +
      chip('Food', foodDays.toFixed(1) + 'd', foodDays < 5 ? 'bad' : '') +
      chip('Power', Math.round(s.stored), s.brownoutNow ? 'bad' : '');
    document.getElementById('dayN').textContent = 'Day ' + s.day;
    const hh = String(s.hour).padStart(2, '0');
    document.getElementById('clockT').textContent = hh + ':00';
    const phase = S.isSunlit(s) ? 'Sunlit' : 'Lunar night';
    document.getElementById('phase').textContent = phase;
  }

  /* ---------- events ---------- */

  function checkEvent() {
    const modal = document.getElementById('mEvent');
    if (!s.pendingEvent) { modal.hidden = true; return; }
    /* The modal gates the tick loop on being hidden (see frame() below), so
       an alert nobody answers freezes the colony outright — Automanage
       included, since sim ticks are what would otherwise let its own
       endOfDay-time resolution ever run. Answer it here instead of ever
       opening the modal. */
    if (s.auto && window.LC_AUTO) {
      const auto = [];
      window.LC_AUTO.resolveDisaster(s, auto);
      auto.forEach(m => S.pushLog(s, m));
      renderAll(); save();
      modal.hidden = true;
      return;
    }
    const e = D.EVENTS.find(x => x.id === s.pendingEvent);
    if (!e) { s.pendingEvent = null; return; }
    document.getElementById('evTitle').textContent = e.title;
    document.getElementById('evText').textContent = e.text;
    const box = document.getElementById('evChoices'); box.innerHTML = '';
    e.choices.forEach(c => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.innerHTML = `<b>${c.label}</b>${c.hint ? `<span>${c.hint}</span>` : ''}`;
      b.onclick = () => { S.resolveEvent(s, e.id, c.effect); modal.hidden = true; renderAll(); save(); };
      box.appendChild(b);
    });
    modal.hidden = false;
  }

  /* ---------- toast ---------- */

  let toastTimer = null;
  function toast(msg, bad) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.className = 'toast' + (bad ? ' bad' : ''); el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }
  function toastErr(err) { if (err) toast(err, true); return err; }

  /* ---------- modes / modals ---------- */

  function markModes() {
    document.getElementById('btnAuto').classList.toggle('on', !!s.auto);
    document.getElementById('btnDisasters').classList.toggle('on', !!s.disastersOn);
    document.getElementById('btnSandbox').classList.toggle('on', !!s.sandbox);
  }
  document.getElementById('btnAuto').onclick = () => { s.auto = !s.auto; markModes(); save(); };
  document.getElementById('btnDisasters').onclick = () => { s.disastersOn = !s.disastersOn; markModes(); save(); };
  document.getElementById('btnSandbox').onclick = () => { s.sandbox = !s.sandbox; markModes(); buildUpgradesPalette(); save(); };
  document.getElementById('btnReport').onclick = openReport;
  document.getElementById('btnLeague').onclick = () => openLeague();

  document.querySelectorAll('.sp').forEach(b => b.onclick = () => {
    ui.speed = +b.dataset.speed;
    document.querySelectorAll('.sp').forEach(x => x.classList.toggle('on', x === b));
  });

  const VIEW_LEGEND = {
    zones: '', roads: 'Green — reaches the Command Module by road. Grey — off the network.',
    power: 'Green — road-connected to a solar array, reactor or battery. Grey — unreached.',
    water: 'Green — road-connected to the ISRU plant or Command Module. Grey — unreached.',
    value: 'Blue — low land value. Gold — high (serviced, hazard-clear, near a grow hall).',
    density: 'Colour shows zone stage, 0 (bare) through 4 (fully developed).',
    resources: 'Marker colour and size show deposit kind and richness — cyan ice, amber regolith, gold helium-3.'
  };
  document.querySelectorAll('#viewBar button').forEach(b => b.onclick = () => {
    ui.view = b.dataset.view;
    document.querySelectorAll('#viewBar button').forEach(x => x.classList.toggle('on', x === b));
    document.getElementById('viewLegend').textContent = VIEW_LEGEND[ui.view] || '';
  });

  document.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModals);
  function closeModals() { document.querySelectorAll('.modal').forEach(m => m.hidden = true); }

  document.getElementById('btnHelp').onclick = () => { document.getElementById('mHelp').hidden = false; };
  document.getElementById('btnSave').onclick = () => { save(); toast('Colony saved.'); };
  document.getElementById('btnReset').onclick = () => {
    if (!confirm('Start a new colony? This clears the current save.')) return;
    s = S.newGame(); ui.selected = null; markModes(); buildUpgradesPalette(); save(); renderAll();
  };
  document.getElementById('overRestart').onclick = () => {
    s = S.newGame(); ui.selected = null; markModes(); buildUpgradesPalette(); save(); renderAll();
    document.getElementById('mOver').hidden = true;
  };
  document.getElementById('overLeague').onclick = () => {
    const r = LEAGUE.file(s, s.over);
    document.getElementById('mOver').hidden = true;
    openLeague(r.r);
  };

  function checkOver() {
    if (!s.over) return;
    document.getElementById('overText').textContent = s.over;
    document.getElementById('overStats').innerHTML =
      `<div><b>${s.day}</b><span>Days run</span></div><div><b>${s.pop}</b><span>Population</span></div>
       <div><b>${Math.round(s.credits).toLocaleString()}</b><span>Credits</span></div>
       <div><b>${s.stats.launches || 0}</b><span>Launches</span></div>`;
    document.getElementById('mOver').hidden = false;
  }

  /* ---------- save/load ---------- */

  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {} }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (o.version !== S.STATE_VERSION) return null;
      return o;
    } catch (e) { return null; }
  }

  /* ---------- main loop ---------- */

  function renderAll() {
    renderHUD(); renderTile(); renderColony(); renderGoals(); renderLog(); markModes(); checkEvent(); checkOver();
  }

  let last = performance.now();
  const DAY_MS = 3200;
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (ui.speed > 0 && !s.over && document.getElementById('mEvent').hidden) {
      acc += dt * ui.speed;
      let guard = 0;
      while (acc > DAY_MS / 24 / 1000 && guard++ < 48) {
        try { S.tick(s); } catch (e) { console.error(e); }
        acc -= DAY_MS / 24 / 1000;
        if (s.over) break;
      }
    }
    R.draw(ctx, s, ui);
    renderHUD();
    if (frame.tick++ % 20 === 0) { renderColony(); renderGoals(); checkEvent(); checkOver(); }
    requestAnimationFrame(frame);
  }
  frame.tick = 0;

  buildPalette(); buildUpgradesPalette(); setHint(); markModes(); renderAll();
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
})();
