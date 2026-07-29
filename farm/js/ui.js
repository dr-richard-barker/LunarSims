/* Lunar Farm — interface, loop and persistence. */

(function () {
  const { K, CROPS, BUILDINGS, UPGRADES, EVENTS, MILESTONES } = window.LF_DATA;
  const S = window.LF_SIM;
  const R = window.LF_RENDER;
  /* One stable key from now on. The versioned keys are what earlier builds
     wrote; they are read once, carried forward and then cleared away. */
  const SAVE_KEY = 'lunarfarm.save';
  const LEGACY_KEYS = ['lunarfarm.save.v5', 'lunarfarm.save.v4', 'lunarfarm.save.v3'];

  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const fmt = n => Math.round(n).toLocaleString();
  const pct = n => Math.round(n * 100) + '%';

  const OPS = [
    { id: 'inspect', glyph: '⌖', name: 'Inspect', key: '1', hint: 'Click anything to read it.' },
    { id: 'plant', glyph: '❀', name: 'Plant', key: '2', hint: 'Click an empty grow hall to sow the whole floor.' },
    { id: 'water', glyph: '≋', name: 'Water', key: '3', hint: 'Click a planted hall to refill its moisture.' },
    { id: 'feed', glyph: '✦', name: 'Feed', key: '4', hint: 'Click a planted hall to recharge nutrients.' },
    { id: 'treat', glyph: '✛', name: 'Treat', key: '5', hint: 'Sterilise a fungal outbreak. 120 cr a tile.' },
    { id: 'harvest', glyph: '✄', name: 'Harvest', key: '6', hint: 'Click a hall whose crop is ready.' },
    { id: 'clear', glyph: '⌫', name: 'Clear', key: '7', hint: 'Strip a crop out of a hall.' }
  ];
  const GLYPH = {
    track: '═', rail: '╬', greenhouse: '⌂', solar: '▤', battery: '▬', hab: '◍',
    isru: '⚗', composter: '♻', reactor: '☢', pad: '◎'
  };

  /* Declared before load() runs: load() writes to it, and a `let` further down
     the file would still be in its temporal dead zone at that point. */
  let loadNote = null;
  let s = load() || S.newGame();
  let speed = 1, acc = 0, last = performance.now();
  let tool = { kind: 'op', id: 'inspect' };
  const ui = { hover: null, hoverOk: true, selected: null, drag: null, line: null };
  let dragStart = null;

  /* ---------- canvas ---------- */
  const cv = $('#cv');
  const ctx = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = R.W * dpr; cv.height = R.H * dpr;
  cv.style.aspectRatio = `${R.W} / ${R.H}`;

  /* Camera over the plate. The canvas keeps a fixed logical size; the camera
     scales and offsets the world inside it, so zooming in shows the settlement
     at a size where you can actually watch people walk about. */
  const cam = { x: R.W / 2, y: R.H / 2, z: 1, min: 0.55, max: 3.4 };
  function applyCam() {
    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z,
      dpr * (R.W / 2 - cam.x * cam.z), dpr * (R.H / 2 - cam.y * cam.z));
  }
  function clampCam() {
    cam.z = Math.max(cam.min, Math.min(cam.max, cam.z));
    const halfW = R.W / (2 * cam.z), halfH = R.H / (2 * cam.z);
    cam.x = Math.max(Math.min(halfW, R.W - halfW), Math.min(cam.x, Math.max(R.W - halfW, halfW)));
    cam.y = Math.max(Math.min(halfH, R.H - halfH), Math.min(cam.y, Math.max(R.H - halfH, halfH)));
  }

  /* canvas pixel -> world coordinate the renderer draws in */
  function canvasPoint(e) {
    const r = cv.getBoundingClientRect();
    const sx = (e.clientX - r.left) * (R.W / r.width);
    const sy = (e.clientY - r.top) * (R.H / r.height);
    return {
      x: (sx - (R.W / 2 - cam.x * cam.z)) / cam.z,
      y: (sy - (R.H / 2 - cam.y * cam.z)) / cam.z
    };
  }

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const before = canvasPoint(e);
    cam.z *= e.deltaY < 0 ? 1.12 : 1 / 1.12;
    clampCam();
    const after = canvasPoint(e);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
    clampCam();
  }, { passive: false });

  /* 'rect' drags out a hall; 'line' runs a road or a railway. */
  function dragMode() {
    if (tool.kind !== 'build') return null;
    const B = BUILDINGS.find(b => b.id === tool.id);
    if (!B) return null;
    return B.drag ? 'rect' : B.line ? 'line' : null;
  }
  const isDragTool = () => !!dragMode();

  function rectFrom(a, b) {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
  }

  /* An L-shaped run from a to b, longer axis first — the way a road tool has
     behaved since SimCity. Each tile carries whether it can actually be laid. */
  function lineFrom(a, b) {
    const pts = [];
    const push = (x, y) => {
      const t = S.tileAt(s, x, y);
      const err = S.canPlace(s, t, tool.id, true);
      pts.push({ x, y, ok: !err, why: err });
    };
    let x = a.x, y = a.y;
    push(x, y);
    if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
      while (x !== b.x) { x += Math.sign(b.x - x); push(x, y); }
      while (y !== b.y) { y += Math.sign(b.y - y); push(x, y); }
    } else {
      while (y !== b.y) { y += Math.sign(b.y - y); push(x, y); }
      while (x !== b.x) { x += Math.sign(b.x - x); push(x, y); }
    }
    const B = BUILDINGS.find(z => z.id === tool.id);
    const buildable = pts.filter(p => p.ok).length;
    pts.cost = s.sandbox ? 0 : buildable * B.cost;
    pts.buildable = buildable;
    return pts;
  }

  /* ---------- input ----------
     One pointer-based path serves mouse, pen and touch. On a mouse nothing has
     changed: left builds or applies the tool, the right button pans, the wheel
     zooms. On touch, one finger builds when a build tool is up and otherwise
     drags the map about, a tap applies the tool, and two fingers pinch to zoom
     and pan together. */

  const pointers = new Map();          // live pointers, by id
  let gesture = null;                  // 'build' | 'pan' | 'pinch' | 'tap'
  let panFrom = null;
  let pinch = null;
  let travelled = 0;                   // how far this gesture has moved, in CSS px
  const TAP_SLOP = 10;                 // beyond this it is a drag, not a tap

  const midpoint = pts => {
    const a = [...pts.values()];
    return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
  };
  const spread = pts => {
    const a = [...pts.values()];
    return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  };
  const worldPerCssPx = () => (R.W / cv.getBoundingClientRect().width) / cam.z;

  function beginPan(e) {
    gesture = 'pan';
    panFrom = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
  }
  function beginBuild(h, mode) {
    gesture = 'build';
    dragStart = h;
    if (mode === 'line') ui.line = lineFrom(h, h); else ui.drag = rectFrom(h, h);
  }
  function beginPinch() {
    gesture = 'pinch';
    cancelBuild();
    pinch = { dist: spread(pointers), mid: midpoint(pointers), z: cam.z, cx: cam.x, cy: cam.y };
  }
  function cancelBuild() {
    dragStart = null; ui.drag = null; ui.line = null;
  }

  cv.addEventListener('contextmenu', e => e.preventDefault());

  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    travelled = 0;

    if (pointers.size === 2) { beginPinch(); e.preventDefault(); return; }
    if (pointers.size > 2) return;

    const mode = dragMode();
    if (e.button === 2 || e.button === 1) { beginPan(e); e.preventDefault(); return; }

    const h = R.hitTest(canvasPoint(e).x, canvasPoint(e).y);
    if (mode && h) { beginBuild(h, mode); e.preventDefault(); return; }

    /* No build tool up: a mouse waits to see if this is a click, while a finger
       is free to start dragging the map straight away. */
    gesture = 'tap';
    if (e.pointerType !== 'mouse') panFrom = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
  });

  cv.addEventListener('pointermove', e => {
    const prev = pointers.get(e.pointerId);
    if (prev) {
      travelled += Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (gesture === 'pinch' && pointers.size >= 2) {
      const dist = spread(pointers), mid = midpoint(pointers);
      const k = worldPerCssPx() * cam.z;                 // world px per CSS px at zoom 1
      cam.z = pinch.z * (dist / (pinch.dist || dist));
      clampCam();
      cam.x = pinch.cx - (mid.x - pinch.mid.x) * (k / cam.z);
      cam.y = pinch.cy - (mid.y - pinch.mid.y) * (k / cam.z);
      clampCam();
      e.preventDefault();
      return;
    }

    if (gesture === 'pan' || (gesture === 'tap' && panFrom && travelled > TAP_SLOP)) {
      if (gesture === 'tap') gesture = 'pan';
      const k = worldPerCssPx();
      cam.x = panFrom.cx - (e.clientX - panFrom.x) * k;
      cam.y = panFrom.cy - (e.clientY - panFrom.y) * k;
      clampCam();
      e.preventDefault();
      return;
    }

    const p = canvasPoint(e);
    const h = R.hitTest(p.x, p.y);
    /* a finger has no hover state to leave behind */
    if (e.pointerType === 'mouse' || gesture === 'build') {
      ui.hover = h;
      ui.hoverOk = h ? previewOk(h) : true;
    }
    if (gesture === 'build' && dragStart && h) {
      if (dragMode() === 'line') ui.line = lineFrom(dragStart, h);
      else ui.drag = rectFrom(dragStart, h);
      e.preventDefault();
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);

    if (gesture === 'pinch') {
      /* lifting one finger of a pinch leaves the other panning, not building */
      if (pointers.size === 1) {
        const only = [...pointers.values()][0];
        gesture = 'pan';
        panFrom = { x: only.x, y: only.y, cx: cam.x, cy: cam.y };
      } else if (pointers.size === 0) { gesture = null; pinch = null; }
      return;
    }
    if (pointers.size > 0) return;

    const wasTap = gesture === 'tap' && travelled <= TAP_SLOP;
    const wasBuild = gesture === 'build';
    gesture = null; panFrom = null;

    if (wasTap) {
      const h = R.hitTest(canvasPoint(e).x, canvasPoint(e).y);
      if (h) applyTool(h);
      if (e.pointerType !== 'mouse') ui.hover = null;
      return;
    }
    if (!wasBuild) { if (e.pointerType !== 'mouse') ui.hover = null; return; }

    commitBuild();
    if (e.pointerType !== 'mouse') ui.hover = null;
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', e => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) { gesture = null; panFrom = null; pinch = null; cancelBuild(); ui.hover = null; }
  });
  cv.addEventListener('pointerleave', e => {
    if (e.pointerType === 'mouse' && gesture !== 'build') ui.hover = null;
  });

  function commitBuild() {
    const r = ui.drag, line = ui.line;
    dragStart = null; ui.drag = null; ui.line = null;

    if (line) {
      const B = BUILDINGS.find(z => z.id === tool.id);
      let laid = 0, blocked = 0, broke = null;
      for (const p of line) {
        const err = S.place(s, S.tileAt(s, p.x, p.y), tool.id);
        if (!err) { laid++; if (window.LF_AGENTS) window.LF_AGENTS.noteBuilt(p.x, p.y, 1, 1); }
        else if (err === 'Not enough credits.') { broke = err; break; }
        else blocked++;
      }
      if (laid) {
        const skipped = blocked ? `, ${blocked} tile${blocked === 1 ? '' : 's'} skipped` : '';
        toast(`${B.name}: ${laid} tile${laid === 1 ? '' : 's'} laid${skipped}.`);
      } else {
        toast(broke || (line[0] && line[0].why) || 'Nothing could be laid there.', true);
      }
      ui.selected = { x: line[line.length - 1].x, y: line[line.length - 1].y };
      showTab('info');
      renderAll();
      return;
    }

    if (!r) return;
    const err = S.addField(s, r.x, r.y, r.w, r.h);
    if (err) toast(err, true);
    else {
      toast(`Grow hall raised: ${r.w} × ${r.h} tiles.`);
      if (window.LF_AGENTS) window.LF_AGENTS.noteBuilt(r.x, r.y, r.w, r.h);
      ui.selected = { x: r.x, y: r.y };
      showTab('info');
    }
    renderAll();
  }

  function previewOk(h) {
    const t = S.tileAt(s, h.x, h.y);
    if (!t) return false;
    const f = S.fieldAt(s, t);
    if (tool.kind === 'build') {
      if (tool.id === 'bulldoze') return !!t.b || !!f || t.t === 'boulder';
      if (tool.id === 'greenhouse') return !t.b && !f && t.t !== 'crater' && t.t !== 'skylight' && t.t !== 'boulder';
      return !t.b && !f && t.t !== 'crater' && t.t !== 'skylight' && t.t !== 'boulder';
    }
    if (tool.id === 'inspect') return true;
    if (!f) return false;
    if (tool.id === 'plant') return !f.crop && !f.dead;
    if (tool.id === 'harvest') return !!f.crop && f.growth >= 1;
    if (tool.id === 'treat') return !!f.infected;
    if (tool.id === 'clear') return !!f.crop || f.dead;
    return !!f.crop && !f.dead;
  }

  function applyTool(h) {
    const t = S.tileAt(s, h.x, h.y);
    if (!t) return;
    ui.selected = { x: h.x, y: h.y };
    const f = S.fieldAt(s, t);

    if (tool.kind === 'build') {
      const err = tool.id === 'bulldoze' ? S.bulldoze(s, t) : S.place(s, t, tool.id);
      if (err) toast(err, true);
      else if (tool.id !== 'bulldoze' && window.LF_AGENTS) window.LF_AGENTS.noteBuilt(t.x, t.y, 1, 1);
      showTab('info'); renderAll();
      return;
    }
    switch (tool.id) {
      case 'inspect': break;
      case 'plant':
        if (!f) { toast('Crops only grow in a grow hall. Drag one out first.', true); break; }
        if (f.crop || f.dead) { toast('That hall is not clear.', true); break; }
        showTab('info'); openPlant(); return;
      case 'water': act(S.water(s, f)); break;
      case 'feed': act(S.feed(s, f)); break;
      case 'treat': act(S.treat(s, f)); break;
      case 'harvest': act(S.harvest(s, f)); break;
      case 'clear': act(S.clear(s, f)); break;
    }
    showTab('info');
    renderAll();
  }

  /* ---------- palette ---------- */
  function buildPalette() {
    const op = $('#opTools'); op.innerHTML = '';
    for (const o of OPS) {
      const b = el('button', 'tool',
        `<span class="g">${o.glyph}</span><span class="n">${o.name}</span><span class="k">${o.key}</span>`);
      b.onclick = () => setTool({ kind: 'op', id: o.id }, o.hint);
      b.dataset.tool = 'op:' + o.id;
      op.appendChild(b);
    }
    const bt = $('#buildTools'); bt.innerHTML = '';
    for (const B of BUILDINGS) {
      const short = B.name.replace(/ (Module|Array|Bank|Plant|Loop|Power|Pad)$/, '');
      const cost = B.perTile ? `${fmt(B.cost)}/tile` : fmt(B.cost) + (B.science ? ' · ' + B.science + 's' : '');
      const b = el('button', 'tool',
        `<span class="g">${GLYPH[B.id] || '▪'}</span><span class="n">${short}</span>
         <span class="k">${B.key}</span><span class="c">${cost}</span>`);
      b.onclick = () => setTool({ kind: 'build', id: B.id },
        B.drag ? `${B.name} — drag out a rectangle. ${fmt(B.cost)} credits a tile.`
               : `${B.name} — ${fmt(B.cost)} credits. ${B.desc}`);
      b.dataset.tool = 'build:' + B.id;
      bt.appendChild(b);
    }
    const bd = el('button', 'tool danger',
      `<span class="g">✖</span><span class="n">Bulldoze</span><span class="k">X</span><span class="c">60</span>`);
    bd.onclick = () => setTool({ kind: 'build', id: 'bulldoze' },
      'Bulldoze — remove a structure or empty hall (60 cr), or clear boulders (120 cr).');
    bd.dataset.tool = 'build:bulldoze';
    bt.appendChild(bd);
    markTool();
  }

  function setTool(t, hint) {
    tool = t;
    $('#toolHint').textContent = hint || '';
    cv.style.cursor = isDragTool() ? 'cell' : 'crosshair';
    markTool();
  }
  function markTool() {
    document.querySelectorAll('.tool').forEach(b =>
      b.classList.toggle('on', b.dataset.tool === tool.kind + ':' + tool.id));
  }

  /* ---------- toast ---------- */
  let toastT = null;
  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function act(err) { if (err) toast(err, true); else renderAll(); }

  /* ---------- HUD ---------- */
  function renderHUD() {
    const gen = S.generation(s), dem = S.demand(s);
    const foodDays = s.food / Math.max(1, S.dailyNeed(s));
    const chips = [
      ['Credits', fmt(s.credits), s.credits < 500 ? 'bad' : ''],
      ['Food', foodDays.toFixed(1) + ' d', foodDays < 5 ? 'bad' : foodDays < 12 ? 'warn' : 'good'],
      ['Power', fmt(s.stored) + ' kWh', s.stored < 10 ? 'bad' : s.stored < 30 ? 'warn' : ''],
      ['Net', (gen.total - dem.total >= 0 ? '+' : '') + (gen.total - dem.total).toFixed(1) + ' kW',
        gen.total - dem.total < 0 ? 'warn' : 'good'],
      ['Water', fmt(s.water) + ' L', s.water < 80 ? 'bad' : s.water < 200 ? 'warn' : ''],
      ['Oxygen', s.o2.toFixed(0) + ' kg', s.o2 < 40 ? 'bad' : s.o2 < 90 ? 'warn' : ''],
      ['CO₂', s.co2.toFixed(0) + ' kg', s.co2 < 20 ? 'bad' : s.co2 < 55 ? 'warn' : ''],
      ['Nutrients', fmt(s.nutrients), s.nutrients < 40 ? 'warn' : ''],
      ['Crew', `${s.crew}/${S.crewCapacity(s)}`, ''],
      ['Morale', Math.round(s.morale) + '%', s.morale < 35 ? 'bad' : s.morale < 55 ? 'warn' : 'good'],
      ['Science', fmt(s.science), '']
    ];
    $('#chips').innerHTML = chips.map(([k, v, c]) =>
      `<div class="chip ${c}"><b>${v}</b><span>${k}</span></div>`).join('');

    $('#dayN').textContent = 'Day ' + s.day;
    $('#clockT').textContent = String(s.hour).padStart(2, '0') + ':00';
    const phase = ((s.day + s.hour / 24) % K.LUNAR_CYCLE);
    const sunlit = S.isSunlit(s);
    const left = sunlit ? (K.LUNAR_CYCLE / 2 - phase) : (K.LUNAR_CYCLE - phase);
    $('#phase').textContent = sunlit
      ? `Lunar day — ${left.toFixed(1)} d of sun left`
      : `Lunar night — ${left.toFixed(1)} d until sunrise`;
  }

  /* ---------- info panel ---------- */
  function meter(label, val, colour, extra) {
    return `<div class="meter"><div class="lab"><span>${label}</span><span>${extra || pct(val)}</span></div>
      <div class="track"><div class="fill" style="width:${Math.max(0, Math.min(1, val)) * 100}%;background:${colour}"></div></div></div>`;
  }

  const TERRAIN = {
    flat: 'Graded regolith. Level enough to build on.',
    rough: 'Broken ejecta. Buildable, if untidy.',
    boulder: 'A boulder field. Bulldoze it before anything can go here.',
    crater: 'A crater bowl. Nothing will sit level here.',
    skylight: 'The lava-tube skylight the station was founded on. It stays open.'
  };

  function renderInfoPane() {
    const box = $('#tileDetail'), acts = $('#tileActions');
    acts.innerHTML = '';
    const t = ui.selected ? S.tileAt(s, ui.selected.x, ui.selected.y) : null;
    if (!t) { box.className = 'empty'; box.textContent = 'Click a tile on the surface.'; return; }
    box.className = '';
    const f = S.fieldAt(s, t);

    if (f) return renderFieldPane(f, box, acts);

    const coord = `${t.x + 1},${t.y + 1}`;
    if (!t.b) {
      box.innerHTML = `<div class="baytitle"><h2>Open ground</h2><span class="num">${coord}</span></div>
        <p class="cultivar">${t.t.charAt(0).toUpperCase() + t.t.slice(1)}</p>
        <p style="font-size:12px;line-height:1.55;color:var(--ink-soft)">${TERRAIN[t.t]}</p>
        <p class="note">Pick the Grow Hall tool and drag a rectangle across open ground to raise a hall.</p>`;
      return;
    }

    const B = S.buildById(t.b.type);
    const extra = {
      solar: `Rated ${S.ARRAY_KW} kW at local noon. The farm's arrays are making ${S.generation(s).solar.toFixed(2)} kW right now.`,
      battery: `Holds ${S.BATTERY_KWH} kWh. Farm storage is ${fmt(s.stored)} of ${fmt(S.storageCap(s))} kWh.`,
      hab: `Quarters for three. Crew is ${s.crew} of ${S.crewCapacity(s)}.`,
      reactor: `${S.REACTOR_KW} kW, day and night.`,
      isru: s.isruOn ? 'Running: +14 L of water a day.' : 'Idle.',
      composter: 'Returning 75% of each crop’s fixed carbon at harvest.',
      pad: 'Resupply is 15% cheaper and produce sells for more.',
      track: 'Graded surface road. Halls and modules touching the network are serviced by the crew.'
    }[t.b.type] || '';
    box.innerHTML = `<div class="baytitle"><h2>${B.name}</h2><span class="num">${coord}</span></div>
      <p class="cultivar">Structure</p>
      <p style="font-size:12px;line-height:1.55;color:var(--ink-soft)">${extra}</p>
      <p class="note">${B.desc}</p>`;
  }

  function renderFieldPane(f, box, acts) {
    const A = S.area(f);
    const coord = `${f.x + 1},${f.y + 1} · ${f.w}×${f.h}`;

    if (!f.crop) {
      box.innerHTML = `<div class="baytitle"><h2>Grow hall</h2><span class="num">${coord}</span></div>
        <p class="cultivar">${A} tiles under glass, beds flushed and ready.</p>
        ${meter('Bed conditioning', f.soil,
          f.soil > 0.66 ? '#c9a86a' : f.soil > 0.33 ? 'var(--warn)' : 'var(--bad)')}
        <div class="rows" style="margin-top:10px">
          <div class="row"><span class="k">Lighting draw</span><span class="v">${(A * S.ledKW(s)).toFixed(2)} kW</span></div>
          <div class="row"><span class="k">Service</span><span class="v ${f.serviced ? 'good' : 'bad'}">${f.serviced ? 'ON TRACK NETWORK' : 'NO TRACK'}</span></div>
        </div>
        ${f.serviced ? '' : '<p class="note" style="border-left-color:var(--bad)">No track connection — the crew cannot service this hall, and it grows at about three-quarters speed.</p>'}`;
      const cond = S.conditionCost(f);
      const cb = el('button', 'act wide',
        `Condition beds (${fmt(cond.credits)} cr · ${Math.ceil(cond.nutrients)} nutrients)`);
      cb.disabled = f.soil >= 0.995;
      cb.onclick = () => act(S.condition(s, f));
      acts.appendChild(cb);
      const btn = el('button', 'act primary wide', 'Sow a crop');
      btn.onclick = openPlant;
      acts.appendChild(btn);
      return;
    }

    const c = S.cropById(f.crop);
    const daysIn = s.day - f.plantedDay;
    const remain = f.growth >= 1 ? 0 : Math.ceil((1 - f.growth) * c.days * (24 / Math.max(1, s.photoperiod)));
    box.innerHTML = `
      <div class="baytitle"><h2>${c.name}</h2><span class="num">${coord}</span></div>
      <p class="cultivar">${c.cultivar || '&nbsp;'}</p>
      ${meter('Growth', f.growth, f.growth >= 1 ? 'var(--accent)' : 'var(--accent-2)', f.growth >= 1 ? 'READY' : pct(f.growth))}
      ${meter('Health', f.health, f.health > 0.6 ? 'var(--accent)' : f.health > 0.3 ? 'var(--warn)' : 'var(--bad)')}
      ${meter('Moisture', f.moisture, f.moisture < 0.15 ? 'var(--bad)' : '#4aa8ff')}
      ${meter('Nutrient charge', f.feed, f.feed < 0.1 ? 'var(--bad)' : '#7bd88f')}
      ${meter('Bed conditioning', f.soil,
        f.soil > 0.66 ? '#c9a86a' : f.soil > 0.33 ? 'var(--warn)' : 'var(--bad)')}
      <div class="rows" style="margin-top:12px">
        <div class="row"><span class="k">Hall size</span><span class="v">${A} tiles</span></div>
        <div class="row"><span class="k">Sown</span><span class="v">${daysIn} d ago</span></div>
        <div class="row"><span class="k">Est. to harvest</span><span class="v">${f.growth >= 1 ? '—' : remain + ' d'}</span></div>
        <div class="row"><span class="k">Yield at full health</span><span class="v">${fmt(c.kcal * S.KCAL_SCALE * A)} kcal</span></div>
        <div class="row"><span class="k">Station pays</span><span class="v good">${fmt(c.value * S.VALUE_SCALE * A)} cr</span></div>
        <div class="row"><span class="k">Lamps</span><span class="v ${f.litNow ? 'good' : 'warn'}">${f.litNow ? 'ON' : 'OFF'}</span></div>
        <div class="row"><span class="k">Beds yielding</span><span class="v ${f.soil > 0.66 ? 'good' : 'warn'}">${pct(S.RAW_SOIL + (1 - S.RAW_SOIL) * (f.soil))}</span></div>
        ${f.serviced ? '' : '<div class="row"><span class="k">Service</span><span class="v bad">NO TRACK</span></div>'}
        ${f.infected ? '<div class="row"><span class="k">Status</span><span class="v bad">FUNGAL INFECTION</span></div>' : ''}
        ${f.dead ? '<div class="row"><span class="k">Status</span><span class="v bad">CROP LOST</span></div>' : ''}
      </div>
      <p class="note">${c.note}</p>`;

    const mk = (label, cls, fn, disabled) => {
      const b = el('button', 'act ' + (cls || ''), label);
      b.disabled = !!disabled; b.onclick = fn;
      acts.appendChild(b);
    };
    if (f.dead) { mk('Clear the beds', 'primary wide', () => act(S.clear(s, f))); return; }
    mk('Water', '', () => act(S.water(s, f)), f.moisture > 0.95);
    mk('Feed', '', () => act(S.feed(s, f)), f.feed > 0.95);
    mk(`Treat (${fmt(120 * A)} cr)`, '', () => act(S.treat(s, f)), !f.infected);
    mk('Clear', '', () => act(S.clear(s, f)));
    const cc = S.conditionCost(f);
    mk(`Condition (${fmt(cc.credits)} cr)`, '', () => act(S.condition(s, f)), f.soil >= 0.995);
    mk(f.growth >= 1 ? 'Harvest' : 'Not ready', 'primary wide', () => act(S.harvest(s, f)), f.growth < 1);
  }

  /* ---------- crop picker ---------- */
  function openPlant() {
    const t = ui.selected ? S.tileAt(s, ui.selected.x, ui.selected.y) : null;
    const f = S.fieldAt(s, t);
    if (!f) return toast('Select a grow hall first.', true);
    const A = S.area(f);
    $('#plantLede').textContent =
      `${A} tiles under glass. The whole hall takes one crop, and seed, yield and water all scale with the floor.`;
    const list = $('#cropList');
    list.innerHTML = '';
    for (const c of CROPS) {
      const cost = S.seedCost(c, f);
      const btn = el('button', 'crop');
      btn.disabled = s.credits < cost;
      btn.innerHTML = `
        <div class="top">
          <b><span class="dot" style="background:${c.colour}"></span>${c.name}</b>
          <span class="seed">${fmt(cost)} cr</span>
        </div>
        <div class="cv">${c.cultivar || '&nbsp;'}</div>
        <div class="stats">
          <span>${c.days} d</span>
          <span>${c.kcal ? fmt(c.kcal * S.KCAL_SCALE * A) + ' kcal' : 'no calories'}</span>
          <span>${fmt(c.value * S.VALUE_SCALE * A)} cr</span>
          ${c.science > 2 ? `<span>+${c.science} sci</span>` : ''}
          ${c.morale > 10 ? `<span>+morale</span>` : ''}
        </div>`;
      btn.onclick = () => {
        const err = S.plant(s, f, c.id);
        if (err) return toast(err, true);
        $('#mPlant').hidden = true;
        toast(`${c.name} sown across ${A} tiles.`);
        renderAll();
      };
      list.appendChild(btn);
    }
    $('#mPlant').hidden = false;
  }

  /* ---------- systems ---------- */
  function renderSystems() {
    const gen = S.generation(s), dem = S.demand(s);
    const net = gen.total - dem.total;
    const res = S.nightReserve(s);
    const rec = S.recoveryRate(s);
    const tiles = S.totalTiles(s);
    const plantedTiles = S.planted(s).reduce((a, f) => a + S.area(f), 0);
    const row = (k, v, cls) => `<div class="row"><span class="k">${k}</span><span class="v ${cls || ''}">${v}</span></div>`;
    const padDisc = S.count(s, 'pad') ? 0.85 : 1;

    $('#pane-systems').innerHTML = `
      <h3 class="sec">Power</h3>
      <div class="rows">
        ${row('Solar (' + S.count(s, 'solar') + ')', gen.solar.toFixed(2) + ' kW', gen.solar > 0 ? 'good' : 'warn')}
        ${row('RTG + reactor', gen.rtg.toFixed(2) + ' kW')}
        ${row('Life support', '−' + dem.ls.toFixed(2) + ' kW')}
        ${row('Grow lighting', '−' + dem.lit.toFixed(2) + ' kW')}
        ${row('ISRU plant', '−' + dem.isru.toFixed(2) + ' kW')}
        ${row('Net', (net >= 0 ? '+' : '') + net.toFixed(2) + ' kW', net >= 0 ? 'good' : 'bad')}
        ${row('Stored', fmt(s.stored) + ' / ' + fmt(S.storageCap(s)) + ' kWh')}
        ${row('Halls lit', s.litFields + ' of ' + s.wantFields, s.litFields < s.wantFields ? 'bad' : 'good')}
        ${row('Reserve at this draw', res === Infinity ? 'indefinite' : (res / 24).toFixed(1) + ' d',
          res === Infinity ? 'good' : res < 24 ? 'bad' : 'warn')}
        ${s.flags.dust ? row('Array soiling', '−' + pct(1 - S.dustFactor(s)), 'warn') : ''}
        ${s.flags.busfault ? row('Bus fault', 'storage halved', 'bad') : ''}
      </div>

      <h3 class="sec">Photoperiod</h3>
      <div class="seg" id="ppSeg">
        ${[8, 12, 16, 20].map(h => `<button data-pp="${h}" class="${s.photoperiod === h ? 'on' : ''}">${h} h</button>`).join('')}
      </div>
      <p style="font-size:11px;color:var(--ink-soft);margin:8px 0 0;line-height:1.5">
        Lighting is ${S.ledKW(s).toFixed(2)} kW a tile. ${plantedTiles} of ${tiles} tiles are sown,
        so a full photoperiod costs ${(plantedTiles * S.ledKW(s) * s.photoperiod).toFixed(0)} kWh a day.</p>

      <h3 class="sec">Water and nutrients</h3>
      <div class="rows">
        ${row('In the loop', fmt(s.water) + ' L', s.water < 120 ? 'bad' : '')}
        ${row('Recovery', pct(rec), rec < 0.7 ? 'warn' : 'good')}
        ${row('Nutrient stock', fmt(s.nutrients), s.nutrients < 40 ? 'warn' : '')}
        ${row('ISRU output', S.count(s, 'isru') ? (s.isruOn ? '+14 L/d' : 'idle') : 'not built', S.count(s, 'isru') && s.isruOn ? 'good' : '')}
        ${s.flags.biofilm ? row('Biofilm', 'recovery −10 pts', 'bad') : ''}
      </div>
      ${S.count(s, 'isru') ? `<div class="ctrl"><label>Run the ISRU plant</label>
        <div class="seg"><button id="isruOn" class="${s.isruOn ? 'on' : ''}">On</button>
        <button id="isruOff" class="${!s.isruOn ? 'on' : ''}">Off</button></div></div>` : ''}

      <h3 class="sec">Atmosphere</h3>
      <div class="rows">
        ${row('Oxygen', s.o2.toFixed(1) + ' kg', s.o2 < 60 ? 'bad' : 'good')}
        ${row('Carbon dioxide', s.co2.toFixed(1) + ' kg', s.co2 < 20 ? 'bad' : s.co2 < 55 ? 'warn' : 'good')}
        ${row('Pressure', s.pressure.toFixed(1) + ' %', s.pressure < 95 ? 'bad' : 'good')}
        ${row('Spares', s.spares, s.spares < 2 ? 'warn' : '')}
        ${s.flags.leak ? `<div class="row"><span class="k">Hull</span>
          <button class="ghost" data-buy="patch" ${s.spares < 2 ? 'disabled' : ''}>LEAKING — patch (2 spares)</button></div>` : ''}
        ${s.flags.thermal ? row('Radiators', 'fouled — growth slowed', 'warn') : ''}
      </div>

      <h3 class="sec">Colony</h3>
      <div class="rows">
        ${row('Crew', `${s.crew} / ${S.crewCapacity(s)}`)}
        ${row('Daily requirement', fmt(S.dailyNeed(s)) + ' kcal')}
        ${row('Ground under glass', tiles + ' tiles')}
        ${row('Food closure (to date)', pct(s.stats.lastClosure), s.stats.lastClosure >= 1 ? 'good' : 'warn')}
        ${row('Closure streak', s.stats.closureStreak + ' d')}
        ${row('Harvests', s.stats.harvests)}
      </div>

      <h3 class="sec">Resupply</h3>
      <div class="rows">
        <div class="row"><span class="k">Water, 200 L</span><button class="ghost" data-buy="water">${fmt(840 * padDisc)} cr</button></div>
        <div class="row"><span class="k">Nutrients, 200</span><button class="ghost" data-buy="nutrients">${fmt(600 * padDisc)} cr</button></div>
        <div class="row"><span class="k">Spares, 4</span><button class="ghost" data-buy="spares">${fmt(1040 * padDisc)} cr</button></div>
        <div class="row"><span class="k">Rations, 30,000 kcal</span><button class="ghost" data-buy="food">${fmt(720 * padDisc)} cr</button></div>
        <div class="row"><span class="k">CO₂ cylinder, 40 kg</span><button class="ghost" data-buy="co2">${fmt(880 * padDisc)} cr</button></div>
        <div class="row"><span class="k">O₂ cylinder, 60 kg</span><button class="ghost" data-buy="buyo2">${fmt(1200 * padDisc)} cr</button></div>
        <div class="row"><span class="k">Sell 20,000 kcal</span><button class="ghost" data-buy="sell">+${fmt(20000 * (S.count(s, 'pad') ? .015 : .012))} cr</button></div>
        <div class="row"><span class="k">Sell 60 kg oxygen</span><button class="ghost" data-buy="o2">+840 cr</button></div>
      </div>`;

    const p = $('#pane-systems');
    p.querySelectorAll('[data-pp]').forEach(b => b.onclick = () => { s.photoperiod = +b.dataset.pp; renderAll(); });
    const on = p.querySelector('#isruOn'), off = p.querySelector('#isruOff');
    if (on) on.onclick = () => { s.isruOn = true; renderAll(); };
    if (off) off.onclick = () => { s.isruOn = false; renderAll(); };
    p.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
      const w = b.dataset.buy;
      if (w === 'patch') act(S.patchLeak(s));
      else if (w === 'sell') act(S.sellFood(s, 20000));
      else if (w === 'o2') act(S.sellO2(s, 60));
      else if (w === 'buyo2') act(S.trade(s, 'o2', 60));
      else if (w === 'co2') act(S.trade(s, 'co2', 40));
      else if (w === 'food') act(S.trade(s, 'food', 30000));
      else if (w === 'water') act(S.trade(s, 'water', 200));
      else if (w === 'nutrients') act(S.trade(s, 'nutrients', 200));
      else act(S.trade(s, 'spares', 4));
    });
  }

  /* ---------- research ---------- */
  function renderResearch() {
    const p = $('#pane-research');
    p.innerHTML = `<p style="font-size:11.5px;color:var(--ink-soft);line-height:1.55;margin:0 0 12px">
      Credits ${fmt(s.credits)} · Science ${fmt(s.science)}. Structures go on the map — this is
      equipment fitted across the whole farm.</p>`;
    for (const u of UPGRADES) {
      const owned = s.up[u.id];
      const has = u.repeat ? (owned || 0) : !!owned;
      const affordable = s.credits >= u.cost && (!u.science || s.science >= u.science);
      const item = el('div', 'item');
      item.innerHTML = `
        <h4><span>${u.name}</span><span class="cost">${fmt(u.cost)} cr${u.science ? ` · ${u.science} sci` : ''}</span></h4>
        <p>${u.desc}</p>
        ${u.repeat ? `<div class="owned" style="margin-bottom:6px">Fitted: ${owned || 0}</div>` : ''}`;
      const btn = el('button', '', has && !u.repeat ? 'Fitted' : 'Fit');
      btn.disabled = (has && !u.repeat) || !affordable;
      btn.onclick = () => act(S.research(s, u.id));
      item.appendChild(btn);
      p.appendChild(item);
    }
  }

  function renderGoals() {
    $('#pane-goals').innerHTML = `<p style="font-size:11.5px;color:var(--ink-soft);line-height:1.55;margin:0 0 10px">
      There is no ending. These are the marks of a farm that works.</p>` +
      MILESTONES.map(m => {
        const d = s.done[m.id];
        return `<div class="goal ${d ? 'done' : ''}"><span class="tick">${d ? '✔' : '○'}</span>
          <span>${m.text}${d ? ` <span style="opacity:.6">— day ${d}</span>` : ''}</span></div>`;
      }).join('');
  }

  function renderLog() {
    $('#pane-log').innerHTML = s.log.length
      ? s.log.map(l => `<div class="logline"><b>D${l.day}</b>${l.msg}</div>`).join('')
      : '<div class="empty">Nothing logged yet.</div>';
  }

  function renderPanel() {
    if (currentTab === 'info') renderInfoPane();
    if (currentTab === 'systems') renderSystems();
    if (currentTab === 'research') renderResearch();
    if (currentTab === 'goals') renderGoals();
    if (currentTab === 'log') renderLog();
  }
  function renderAll() { renderHUD(); renderPanel(); }

  /* ---------- tabs ---------- */
  let currentTab = 'info';
  function showTab(name) {
    currentTab = name;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    document.querySelectorAll('.tabpane').forEach(t => t.classList.toggle('on', t.id === 'pane-' + name));
    renderPanel();
  }
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => showTab(t.dataset.tab));

  /* ---------- speed ---------- */
  document.querySelectorAll('.sp').forEach(b => b.onclick = () => setSpeed(+b.dataset.speed));
  function setSpeed(v) {
    speed = v;
    document.querySelectorAll('.sp').forEach(x => x.classList.toggle('on', +x.dataset.speed === v));
  }

  /* ---------- modes and the report ---------- */
  function markModes() {
    $('#btnAuto').classList.toggle('on', !!s.auto);
    $('#btnSandbox').classList.toggle('on', !!s.sandbox);
  }
  $('#btnAuto').onclick = () => {
    s.auto = !s.auto;
    markModes();
    toast(s.auto
      ? 'Auto-manage on. The crew will tend, harvest, replant and restock each day.'
      : 'Auto-manage off. The farm is yours again.');
    S.pushLog(s, s.auto ? 'Handed day-to-day running to the crew.' : 'Took back day-to-day running of the farm.');
    renderAll();
  };
  $('#btnSandbox').onclick = () => {
    s.sandbox = !s.sandbox;
    markModes();
    toast(s.sandbox
      ? 'Sandbox on. Halls, structures and equipment cost nothing.'
      : 'Sandbox off. Everything costs credits again.');
    renderAll();
  };

  let audience = 'earth';
  function openReport() {
    const body = $('#reportBody');
    body.innerHTML = window.LF_DASH.render(s, audience);
    const swap = body.querySelector('#dAudience');
    if (swap) swap.onclick = () => { audience = audience === 'earth' ? 'settlers' : 'earth'; openReport(); };
    window.LF_DASH.wireHover(body, s, $('#dtip'));
    $('#mReport').hidden = false;
  }
  $('#btnReport').onclick = openReport;

  /* ---------- league ---------- */
  function openLeague(justFiled) {
    const body = $('#leagueBody');
    body.innerHTML = window.LF_LEAGUE.render(justFiled);
    body.querySelector('#lFile').onclick = () => {
      const res = window.LF_LEAGUE.file(s, s.over || null);
      toast(res.added ? `Run filed: ${res.r.score.toLocaleString()} points.` : 'That run is already on file.');
      openLeague(res.r);
    };
    body.querySelector('#lExport').onclick = () => {
      const n = window.LF_LEAGUE.exportRuns();
      toast(n ? `Exported ${n} run${n === 1 ? '' : 's'}.` : 'Nothing on file to export.', !n);
    };
    const input = body.querySelector('#lFileInput');
    body.querySelector('#lImport').onclick = () => input.click();
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const res = window.LF_LEAGUE.importRuns(String(reader.result));
        if (typeof res === 'string') toast(res, true);
        else { toast(`Merged ${res} run${res === 1 ? '' : 's'}.`); openLeague(); }
      };
      reader.readAsText(f);
    };
    $('#mLeague').hidden = false;
  }
  $('#btnLeague').onclick = () => openLeague();
  $('#overLeague').onclick = () => {
    const res = window.LF_LEAGUE.file(s, s.over);
    $('#mOver').hidden = true;
    openLeague(res.r);
  };

  /* ---------- events ---------- */
  function showEvent(id) {
    const e = EVENTS.find(x => x.id === id);
    if (!e) { s.pendingEvent = null; return; }
    $('#evTitle').textContent = e.title;
    $('#evText').textContent = e.text;
    const box = $('#evChoices');
    box.innerHTML = '';
    for (const c of e.choices) {
      const btn = el('button', 'choice', `<b>${c.label}</b>${c.hint ? `<span>${c.hint}</span>` : ''}`);
      btn.onclick = () => {
        S.resolveEvent(s, e.id, c.effect);
        $('#mEvent').hidden = true;
        renderAll();
      };
      box.appendChild(btn);
    }
    $('#mEvent').hidden = false;
  }

  /* ---------- persistence ---------- */
  function save() {
    try {
      s.version = S.STATE_VERSION;
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
      return true;
    } catch (err) { return false; }
  }

  /* loadNote is declared at the top of this module, because load() runs there. */
  function load() {
    let raw = null, legacy = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        for (const k of LEGACY_KEYS) {
          const v = localStorage.getItem(k);
          if (v) { raw = v; legacy = k; break; }
        }
      }
    } catch (err) { return null; }
    if (!raw) return null;

    let o = null;
    try { o = JSON.parse(raw); }
    catch (err) { loadNote = { why: 'unreadable' }; return null; }

    const res = S.migrate(o);
    if (!res.ok) { loadNote = res; return null; }
    /* The old key is not cleared here: it stays as the only copy until the run
       has been rewritten under the stable one, so closing the tab in between
       cannot lose it. */
    if (res.carried || legacy) loadNote = { why: 'carried', from: res.from, legacy };
    return o;
  }

  function announceLoad() {
    if (!loadNote) return;
    const from = loadNote.from;
    const said = {
      carried: `Your run was carried forward from an earlier version of the game${from ? ` (save v${from})` : ''}.`,
      newer: 'That saved run comes from a newer version of Lunar Farm than this page. Reload to pick up the latest version — a new run has been started meanwhile.',
      incompatible: 'The saved run is from an early build whose farm was laid out differently, so it could not be carried over. Starting a new one.',
      unreadable: 'The saved run could not be read, so a new one has been started.'
    }[loadNote.why];
    if (!said) return;
    toast(said, loadNote.why !== 'carried');
    S.pushLog(s, said);
    /* Write it forward straight away, then retire the old key — in that order,
       so the run is never the only copy of nothing. */
    if (loadNote.why === 'carried' && save() && loadNote.legacy) {
      try { localStorage.removeItem(loadNote.legacy); } catch (err) {}
    }
    loadNote = null;
  }

  $('#btnSave').onclick = () => { const ok = save(); toast(ok ? 'Saved to this browser.' : 'Could not save.', !ok); };
  function restart() {
    try { [SAVE_KEY, ...LEGACY_KEYS].forEach(k => localStorage.removeItem(k)); } catch (err) {}
    s = S.newGame();
    ui.selected = null; ui.drag = null; ui.line = null; dragStart = null;
    if (window.LF_AGENTS) window.LF_AGENTS.reset();
    $('#mOver').hidden = true;
    setSpeed(1);
    renderAll();
  }
  $('#btnReset').onclick = () => { if (confirm('Abandon this run and start a new one?')) restart(); };
  $('#overRestart').onclick = restart;
  $('#btnHelp').onclick = () => { $('#mHelp').hidden = false; };
  /* Every pop-up gets a cross in the corner, closes on the backdrop, and closes
     on Escape. Dismissing a station alert takes no action either way. */
  function closeModal(m) {
    if (!m || m.hidden) return;
    if (m.id === 'mEvent' && s.pendingEvent) {
      S.pushLog(s, 'Alert dismissed without action.');
      s.pendingEvent = null;
    }
    m.hidden = true;
    $('#dtip').hidden = true;
    renderAll();
  }
  function topModal() {
    const open = [...document.querySelectorAll('.modal')].filter(m => !m.hidden);
    return open[open.length - 1];
  }
  document.querySelectorAll('.modal').forEach(m => {
    const sheet = m.querySelector('.sheet');
    if (sheet && !sheet.querySelector('.xclose')) {
      const x = el('button', 'xclose', '&times;');
      x.type = 'button';
      x.title = 'Close';
      x.setAttribute('aria-label', 'Close');
      x.onclick = () => closeModal(m);
      sheet.prepend(x);
    }
    m.addEventListener('mousedown', e => { if (e.target === m) closeModal(m); });
  });
  document.querySelectorAll('[data-close]').forEach(b => {
    b.onclick = () => closeModal(b.closest('.modal'));
  });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') { closeModal(topModal()); return; }
    if (e.key === ' ') { e.preventDefault(); setSpeed(speed === 0 ? 1 : 0); }
    const op = OPS.find(o => o.key === e.key);
    if (op) setTool({ kind: 'op', id: op.id }, op.hint);
    const B = BUILDINGS.find(b => b.key.toLowerCase() === e.key.toLowerCase());
    if (B) setTool({ kind: 'build', id: B.id },
      B.drag ? `${B.name} — drag out a rectangle. ${fmt(B.cost)} credits a tile.`
             : `${B.name} — ${fmt(B.cost)} credits. ${B.desc}`);
    const pan = 90 / cam.z;
    if (e.key === 'ArrowLeft') { cam.x -= pan; clampCam(); }
    if (e.key === 'ArrowRight') { cam.x += pan; clampCam(); }
    if (e.key === 'ArrowUp') { cam.y -= pan; clampCam(); }
    if (e.key === 'ArrowDown') { cam.y += pan; clampCam(); }
    if (e.key === '+' || e.key === '=') { cam.z *= 1.2; clampCam(); }
    if (e.key === '-' || e.key === '_') { cam.z /= 1.2; clampCam(); }
    if (e.key.toLowerCase() === 'x') setTool({ kind: 'build', id: 'bulldoze' },
      'Bulldoze — remove a structure or empty hall (60 cr), or clear boulders (120 cr).');
  });

  function showOver() {
    $('#overText').textContent = s.over;
    $('#overStats').innerHTML = `
      <div><b>${s.day}</b><span>days run</span></div>
      <div><b>${s.stats.harvests}</b><span>harvests</span></div>
      <div><b>${Object.keys(s.stats.kinds).length}</b><span>crops grown</span></div>
      <div><b>${s.stats.nightsSurvived}</b><span>lunar nights</span></div>`;
    $('#mOver').hidden = false;
    setSpeed(0);
  }

  /* ---------- main loop ---------- */
  let lastDaySaved = s.day;
  /* An exception anywhere in the frame used to kill the loop silently, because
     the next requestAnimationFrame sat after the work. The farm would simply
     freeze with nothing said. Now the loop always reschedules and says so. */
  let crashed = null;
  function reportCrash(err) {
    const msg = (err && err.message) || String(err);
    if (crashed === msg) return;
    crashed = msg;
    console.error('Lunar Farm — frame error:', err);
    const bar = $('#toolHint');
    if (bar) bar.textContent = `Something went wrong in the last frame: ${msg} — the game is still running; a reload will clear it.`;
    setSpeed(0);
  }

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    try {
      const blocked = !$('#mEvent').hidden || !$('#mOver').hidden || !$('#mPlant').hidden
        || !$('#mReport').hidden || !$('#mLeague').hidden;

      if (speed > 0 && !blocked && !s.over) {
        acc += dt * speed;
        let guard = 0;
        while (acc >= 1 && guard < 40) {
          acc -= 1; guard++;
          S.tick(s);
          if (s.pendingEvent) { showEvent(s.pendingEvent); break; }
          if (s.over) { showOver(); break; }
        }
        renderHUD();
        if (currentTab === 'info' || currentTab === 'systems') renderPanel();
        if (s.day !== lastDaySaved) { lastDaySaved = s.day; save(); }
      }

      if (window.LF_AGENTS) window.LF_AGENTS.update(s, dt);
      applyCam();
      R.draw(ctx, s, ui);
    } catch (err) {
      reportCrash(err);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- boot ---------- */
  markModes();
  if (!s.log.length) {
    S.pushLog(s, 'Farm handover complete: one 3×2 grow hall, a habitat, four arrays and two battery banks.');
    S.pushLog(s, 'Drag out more halls with the Grow Hall tool. The sun sets on day 15 — plan for it.');
  }
  announceLoad();
  buildPalette();
  setTool({ kind: 'op', id: 'inspect' }, OPS[0].hint);
  showTab('info');
  renderAll();
  if (s.over) showOver();
  requestAnimationFrame(frame);

  window.__lf = {
    get s() { return s; }, set s(v) { s = v; }, S, R, ui, cam,
    tick: n => { for (let i = 0; i < n; i++) S.tick(s); renderAll(); }
  };
})();
