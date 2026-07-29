/* Lunar Farm — top-down surface renderer. Everything is drawn procedurally. */

(function () {
  const { K } = window.LF_DATA;
  const S = window.LF_SIM;

  const T = K.TILE;
  const W = K.COLS * T, H = K.ROWS * T;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function lightOf(s) {
    const e = S.sunElevation(s);
    /* Even a low sun on the Moon is fiercely bright; the darkness is in the
       shadows, not on the lit ground. */
    return S.isSunlit(s) ? 0.62 + 0.38 * e : 0.09;
  }

  function grey(v, l) {
    const b = clamp(v * l, 0, 255);
    return `rgb(${Math.round(b)},${Math.round(b * 0.995)},${Math.round(b * 1.03)})`;
  }

  function shadowVec(s) {
    const e = S.sunElevation(s);
    if (!S.isSunlit(s)) return null;
    const phase = ((s.day + s.hour / 24) % K.LUNAR_CYCLE) / (K.LUNAR_CYCLE / 2);
    const len = (1 - e) * T * 1.2 + 5;
    return { x: (phase - 0.5) * 2 * len, y: len * 0.42, a: clamp(0.24 + (1 - e) * 0.3, 0, 0.58) };
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${Math.round(clamp(((n >> 16) & 255) + amt, 0, 255))},${
      Math.round(clamp(((n >> 8) & 255) + amt, 0, 255))},${
      Math.round(clamp((n & 255) + amt, 0, 255))})`;
  }

  /* ---------- terrain ---------- */

  function drawTerrain(ctx, s, l, sh) {
    ctx.fillStyle = grey(158, l);
    ctx.fillRect(0, 0, W, H);

    for (const t of s.map) {
      const x = t.x * T, y = t.y * T;

      if (t.t === 'crater') {
        ctx.fillStyle = grey(142, l);
        ctx.beginPath();
        ctx.ellipse(x + T / 2, y + T / 2, T * 0.44, T * 0.40, 0, 0, 7);
        ctx.fill();
        if (sh) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(x + T / 2, y + T / 2, T * 0.44, T * 0.40, 0, 0, 7);
          ctx.clip();
          ctx.fillStyle = `rgba(0,0,0,${clamp(0.16 + sh.a * 0.5, 0, 0.46)})`;
          ctx.beginPath();
          ctx.ellipse(x + T / 2 + Math.sign(sh.x) * T * 0.36, y + T / 2 - T * 0.05,
            T * 0.36, T * 0.34, 0, 0, 7);
          ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = grey(196, l);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x + T / 2, y + T / 2, T * 0.44, T * 0.40, 0, 0, 7);
        ctx.stroke();
      } else if (t.t === 'skylight') {
        ctx.fillStyle = '#05070c';
        ctx.fillRect(x, y, T, T);
        ctx.strokeStyle = grey(205, l);
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x + 1.5, y + 1.5, T - 3, T - 3);
      } else {
        /* regolith speckle: fine pits and highlights, no per-tile tint */
        const n = t.t === 'rough' ? 34 : 18;
        for (let i = 0; i < n; i++) {
          const px = x + ((t.v * 977 + i * 131) % T);
          const py = y + ((t.v * 613 + i * 271) % T);
          ctx.fillStyle = ((t.v * 100 + i) % 2) < 1
            ? 'rgba(0,0,0,0.11)' : 'rgba(255,255,255,0.07)';
          ctx.fillRect(px, py, 2, 2);
        }
        if (t.t === 'rough') {
          ctx.fillStyle = 'rgba(0,0,0,0.06)';
          ctx.fillRect(x, y, T, T);
        }
      }
    }
  }

  function drawBoulders(ctx, s, l, sh) {
    for (const t of s.map) {
      if (t.t !== 'boulder') continue;
      const x = t.x * T, y = t.y * T;
      for (let i = 0; i < 3; i++) {
        const bx = x + 12 + ((t.v * 700 + i * 150) % (T - 26));
        const by = y + 14 + ((t.v * 430 + i * 90) % (T - 30));
        const r = 6 + ((t.v * 100 + i * 33) % 6);
        if (sh) {
          ctx.fillStyle = `rgba(0,0,0,${sh.a})`;
          ctx.beginPath();
          ctx.ellipse(bx + sh.x * 0.22, by + sh.y * 0.22, r * 1.6, r * 0.7, 0, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = grey(136, l);
        ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.fill();
        ctx.fillStyle = grey(206, l);
        ctx.beginPath(); ctx.arc(bx - r * 0.32, by - r * 0.32, r * 0.48, 0, 7); ctx.fill();
      }
    }
  }

  /* ---------- crops ---------- */

  /* One plant, drawn at (cx,cy) within a cell of `size`. */
  function drawPlant(ctx, c, g, health, cx, cy, size, seed) {
    const dim = -(1 - health) * 60;
    const R = size * (0.24 + g * 0.76) * 0.5;

    switch (c.kind) {
      case 'grain': {
        ctx.strokeStyle = shade(c.colour, -28 + dim);
        ctx.lineWidth = Math.max(1, size * 0.05);
        for (let i = 0; i < 5; i++) {
          const ox = cx + (i - 2) * (size * 0.13);
          const lean = ((seed + i) % 3 - 1) * size * 0.04;
          ctx.beginPath();
          ctx.moveTo(ox, cy + R * 0.8);
          ctx.quadraticCurveTo(ox + lean * 0.5, cy, ox + lean, cy - R * 0.85);
          ctx.stroke();
          if (g > 0.6) {
            ctx.fillStyle = shade(c.colour, 18 + dim);
            ctx.beginPath();
            ctx.ellipse(ox + lean, cy - R * 0.92, size * 0.045, size * 0.12, 0, 0, 7);
            ctx.fill();
          }
        }
        break;
      }
      case 'fruit': {
        ctx.strokeStyle = shade('#3f7a3a', dim);
        ctx.lineWidth = Math.max(1.2, size * 0.06);
        ctx.beginPath(); ctx.moveTo(cx, cy + R * 0.9); ctx.lineTo(cx, cy - R * 0.85); ctx.stroke();
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = shade('#57a047', dim - i * 3);
          const ly = cy + R * 0.7 - i * (R * 0.5);
          ctx.beginPath();
          ctx.ellipse(cx + (i % 2 ? 1 : -1) * R * 0.5, ly, R * 0.44, R * 0.2,
            (i % 2 ? 0.35 : -0.35), 0, 7);
          ctx.fill();
        }
        if (g > 0.6) {
          const nf = Math.round((g - 0.6) / 0.4 * 3) + 1;
          for (let i = 0; i < nf; i++) {
            const fx = cx + (i % 2 ? 1 : -1) * R * 0.42;
            const fy = cy - R * 0.2 - i * R * 0.3;
            ctx.fillStyle = shade(c.colour, dim);
            ctx.beginPath(); ctx.arc(fx, fy, R * 0.24, 0, 7); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath(); ctx.arc(fx - R * 0.08, fy - R * 0.09, R * 0.07, 0, 7); ctx.fill();
          }
        }
        break;
      }
      case 'root': {
        if (g > 0.4) {
          ctx.fillStyle = shade(c.colour, dim);
          ctx.beginPath();
          ctx.ellipse(cx, cy + R * 0.55, R * 0.42, R * 0.32, 0, 0, 7);
          ctx.fill();
        }
        ctx.strokeStyle = shade('#5aa348', dim);
        ctx.lineWidth = Math.max(1.2, size * 0.055);
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(cx, cy + R * 0.4);
          ctx.quadraticCurveTo(cx + i * R * 0.25, cy - R * 0.1, cx + i * R * 0.42, cy - R * 0.75);
          ctx.stroke();
        }
        break;
      }
      case 'flower': {
        ctx.strokeStyle = shade('#4f9440', dim);
        ctx.lineWidth = Math.max(1.2, size * 0.055);
        ctx.beginPath(); ctx.moveTo(cx, cy + R * 0.85); ctx.lineTo(cx, cy - R * 0.2); ctx.stroke();
        ctx.fillStyle = shade('#4f9440', dim);
        ctx.beginPath();
        ctx.ellipse(cx - R * 0.35, cy + R * 0.3, R * 0.3, R * 0.13, -0.5, 0, 7); ctx.fill();
        if (g > 0.5) {
          const p = (g - 0.5) / 0.5;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            ctx.fillStyle = shade(c.colour, dim);
            ctx.beginPath();
            ctx.ellipse(cx + Math.cos(a) * R * 0.42 * p, cy - R * 0.3 + Math.sin(a) * R * 0.42 * p,
              R * 0.3 * p, R * 0.15 * p, a, 0, 7);
            ctx.fill();
          }
          ctx.fillStyle = '#f2d24a';
          ctx.beginPath(); ctx.arc(cx, cy - R * 0.3, R * 0.18 * p, 0, 7); ctx.fill();
        }
        break;
      }
      case 'algae': {
        const w = size * 0.62, hh = size * 0.5;
        ctx.fillStyle = 'rgba(190,220,235,0.16)';
        rr(ctx, cx - w / 2, cy - hh / 2, w, hh, 3); ctx.fill();
        const fill = hh * (0.14 + g * 0.82);
        ctx.fillStyle = shade(c.colour, dim);
        rr(ctx, cx - w / 2 + 1, cy + hh / 2 - fill, w - 2, fill - 1, 2); ctx.fill();
        ctx.strokeStyle = 'rgba(205,230,245,0.42)'; ctx.lineWidth = 1;
        rr(ctx, cx - w / 2, cy - hh / 2, w, hh, 3); ctx.stroke();
        break;
      }
      default: {   /* leafy + research rosettes */
        const n = Math.max(4, Math.round(4 + g * 6));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + seed * 0.7;
          ctx.fillStyle = shade(c.colour, (i % 2 ? -18 : 8) + dim);
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * R * 0.44, cy + Math.sin(a) * R * 0.44,
            R * 0.5, R * 0.32, a, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = shade(c.colour, 24 + dim);
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.22, 0, 7); ctx.fill();
        if (c.kind === 'research' && g > 0.45) {
          ctx.strokeStyle = shade(c.colour, -18);
          ctx.lineWidth = 1.4;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + i * R * 0.3, cy);
            ctx.lineTo(cx + i * R * 0.4, cy - R * 1.1 * (g - 0.45) / 0.55);
            ctx.stroke();
          }
        }
      }
    }
  }

  /* ---------- grow halls ---------- */

  function drawField(ctx, s, f, l, sh, hovered, selected) {
    const x = f.x * T + 3, y = f.y * T + 3;
    const w = f.w * T - 6, h = f.h * T - 6;
    const c = f.crop ? S.cropById(f.crop) : null;

    if (sh) {
      ctx.fillStyle = `rgba(0,0,0,${sh.a})`;
      ctx.beginPath();
      ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w + sh.x, y + h + sh.y); ctx.lineTo(x + sh.x, y + h + sh.y);
      ctx.closePath(); ctx.fill();
    }

    /* lamp spill onto the regolith */
    if (f.litNow) {
      const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2,
        x + w / 2, y + h / 2, Math.max(w, h) * 0.85);
      g.addColorStop(0, 'rgba(255,90,190,0.22)');
      g.addColorStop(1, 'rgba(255,90,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - T, y - T, w + T * 2, h + T * 2);
    }

    ctx.fillStyle = f.litNow ? '#241c2b' : grey(46, Math.max(l, 0.55));
    rr(ctx, x, y, w, h, 9); ctx.fill();

    /* growing beds, one per tile */
    for (let ty = 0; ty < f.h; ty++) {
      for (let tx = 0; tx < f.w; tx++) {
        const cx = f.x * T + tx * T + T / 2;
        const cy = f.y * T + ty * T + T / 2;
        ctx.fillStyle = f.dead ? 'rgba(70,62,50,0.85)' : 'rgba(58,48,40,0.85)';
        rr(ctx, cx - T * 0.40, cy - T * 0.40, T * 0.80, T * 0.80, 4); ctx.fill();
        if (c && !f.dead) {
          drawPlant(ctx, c, f.growth, f.health, cx, cy, T * 0.74, (tx * 3 + ty * 5) % 7);
        } else if (f.dead) {
          ctx.strokeStyle = '#6b5f4c'; ctx.lineWidth = 2;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + i * 6, cy + 9); ctx.lineTo(cx + i * 11, cy - 8);
            ctx.stroke();
          }
        }
      }
    }

    /* glazing tint and the frame between bays */
    ctx.fillStyle = f.litNow ? 'rgba(255,120,205,0.10)' : 'rgba(150,180,215,0.06)';
    rr(ctx, x, y, w, h, 9); ctx.fill();

    ctx.strokeStyle = f.litNow ? 'rgba(255,150,215,0.5)' : 'rgba(180,200,225,0.22)';
    ctx.lineWidth = 1.2;
    for (let i = 1; i < f.w; i++) {
      ctx.beginPath();
      ctx.moveTo(f.x * T + i * T, y + 4); ctx.lineTo(f.x * T + i * T, y + h - 4);
      ctx.stroke();
    }
    for (let i = 1; i < f.h; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 4, f.y * T + i * T); ctx.lineTo(x + w - 4, f.y * T + i * T);
      ctx.stroke();
    }

    /* lamp bar along the top of each row */
    for (let ty = 0; ty < f.h; ty++) {
      const ly = f.y * T + ty * T + 7;
      ctx.fillStyle = f.litNow ? '#ff5fbd' : '#39303f';
      rr(ctx, x + 7, ly, w - 14, 3.5, 2); ctx.fill();
      if (f.litNow) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        rr(ctx, x + 7, ly, w - 14, 1.4, 1); ctx.fill();
      }
    }

    ctx.strokeStyle = f.litNow ? '#ff5fbd' : 'rgba(170,190,215,0.55)';
    ctx.lineWidth = 2;
    rr(ctx, x, y, w, h, 9); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    rr(ctx, x + 3, y + 3, w - 6, h - 6, 7); ctx.stroke();

    if (f.crop && !f.dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      rr(ctx, x + 8, y + h - 8, w - 16, 4, 2); ctx.fill();
      ctx.fillStyle = f.growth >= 1 ? '#6ee7a0' : '#8ab4ff';
      rr(ctx, x + 8, y + h - 8, (w - 16) * f.growth, 4, 2); ctx.fill();
    }

    let pip = 0;
    const dot = col => {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x + 10 + pip * 11, y + h - 18, 3.6, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
      pip++;
    };
    if (f.crop && f.growth >= 1) dot('#6ee7a0');
    if (f.infected) dot('#e8d24a');
    if (f.crop && f.moisture < 0.25) dot('#4aa8ff');
    if (f.crop && f.feed < 0.12) dot('#c58cff');
    if (!f.serviced) dot('#ff7a68');

    if (c) {
      ctx.font = `600 ${Math.min(12, 7 + f.w)}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'left';
      const label = c.name.toUpperCase();
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      rr(ctx, x + 7, y + 13, tw + 8, 13, 3); ctx.fill();
      ctx.fillStyle = 'rgba(232,240,252,0.92)';
      ctx.fillText(label, x + 11, y + 23);
    }

    if (selected) {
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2.5;
      rr(ctx, x - 2, y - 2, w + 4, h + 4, 10); ctx.stroke();
    } else if (hovered) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
      rr(ctx, x - 1, y - 1, w + 2, h + 2, 10); ctx.stroke();
    }
  }

  /* ---------- single-tile structures ---------- */

  function drawShadow(ctx, sh, x, y, w, h) {
    if (!sh) return;
    ctx.fillStyle = `rgba(0,0,0,${sh.a})`;
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w + sh.x, y + h + sh.y); ctx.lineTo(x + sh.x, y + h + sh.y);
    ctx.closePath(); ctx.fill();
  }

  function drawTrack(ctx, s, t, l) {
    const x = t.x * T, y = t.y * T, m = T * 0.22;
    ctx.fillStyle = grey(104, l);
    ctx.fillRect(x + m, y + m, T - m * 2, T - m * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = S.tileAt(s, t.x + dx, t.y + dy);
      if (n && (n.b || n.f)) {
        ctx.fillRect(
          x + (dx === 1 ? T / 2 : dx === -1 ? 0 : m),
          y + (dy === 1 ? T / 2 : dy === -1 ? 0 : m),
          dx ? T / 2 : T - m * 2,
          dy ? T / 2 : T - m * 2);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + m, y + T / 2 - 4); ctx.lineTo(x + T - m, y + T / 2 - 4);
    ctx.moveTo(x + m, y + T / 2 + 4); ctx.lineTo(x + T - m, y + T / 2 + 4);
    ctx.stroke();
  }

  function drawSolar(ctx, s, t, l, sh) {
    const x = t.x * T, y = t.y * T;
    const px = x + 6, py = y + 10, pw = T - 12, ph = T - 26;
    drawShadow(ctx, sh, px, py + ph * 0.4, pw, ph * 0.6);
    ctx.fillStyle = grey(74, Math.max(l, 0.45));
    ctx.fillRect(x + T / 2 - 3, y + T - 18, 6, 13);
    ctx.fillStyle = `rgb(${Math.round(24 + 34 * l)},${Math.round(42 + 54 * l)},${Math.round(88 + 84 * l)})`;
    rr(ctx, px, py, pw, ph, 3); ctx.fill();
    ctx.strokeStyle = `rgba(150,195,245,${0.22 + l * 0.32})`;
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(px + (pw / 4) * i, py); ctx.lineTo(px + (pw / 4) * i, py + ph); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(px, py + ph / 2); ctx.lineTo(px + pw, py + ph / 2); ctx.stroke();
    if (S.isSunlit(s)) {
      ctx.fillStyle = `rgba(255,255,255,${0.04 + S.sunElevation(s) * 0.13})`;
      rr(ctx, px, py, pw, ph * 0.38, 3); ctx.fill();
    }
    ctx.strokeStyle = grey(128, Math.max(l, 0.5)); ctx.lineWidth = 1.4;
    rr(ctx, px, py, pw, ph, 3); ctx.stroke();
  }

  function drawBattery(ctx, s, t, l, sh) {
    const x = t.x * T, y = t.y * T;
    const px = x + 11, py = y + 16, pw = T - 22, ph = T - 30;
    drawShadow(ctx, sh, px, py, pw, ph);
    ctx.fillStyle = grey(100, Math.max(l, 0.5));
    rr(ctx, px, py, pw, ph, 5); ctx.fill();
    ctx.fillStyle = grey(140, Math.max(l, 0.5));
    rr(ctx, px, py, pw, 6, 3); ctx.fill();
    const frac = S.storageCap(s) > 0 ? clamp(s.stored / S.storageCap(s), 0, 1) : 0;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = (i + 1) / 3 <= frac + 0.001 ? '#6ee7a0' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(px + 5, py + ph - 8 - i * 7, pw - 10, 5);
    }
    ctx.strokeStyle = grey(156, Math.max(l, 0.5)); ctx.lineWidth = 1.4;
    rr(ctx, px, py, pw, ph, 5); ctx.stroke();
  }

  function drawHab(ctx, s, t, l, sh) {
    const x = t.x * T, y = t.y * T;
    const px = x + 5, py = y + 14, pw = T - 10, ph = T - 28;
    drawShadow(ctx, sh, px, py, pw, ph);
    ctx.fillStyle = grey(176, Math.max(l, 0.5));
    rr(ctx, px, py, pw, ph, ph / 2); ctx.fill();
    ctx.fillStyle = grey(216, Math.max(l, 0.5));
    rr(ctx, px, py, pw, ph * 0.44, ph / 2); ctx.fill();
    ctx.fillStyle = '#ffd166';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(px + 12 + i * (pw - 24) / 2, py + ph * 0.64, 3, 0, 7);
      ctx.fill();
    }
    ctx.strokeStyle = grey(120, Math.max(l, 0.5)); ctx.lineWidth = 1.5;
    rr(ctx, px, py, pw, ph, ph / 2); ctx.stroke();
  }

  function drawIsru(ctx, s, t, l, sh) {
    const x = t.x * T, y = t.y * T;
    drawShadow(ctx, sh, x + 10, y + 18, T - 20, T - 30);
    ctx.fillStyle = grey(118, Math.max(l, 0.5));
    rr(ctx, x + 10, y + 20, T - 20, T - 32, 4); ctx.fill();
    ctx.fillStyle = grey(84, Math.max(l, 0.5));
    ctx.beginPath();
    ctx.moveTo(x + 15, y + 20); ctx.lineTo(x + T - 15, y + 20);
    ctx.lineTo(x + T - 21, y + 9); ctx.lineTo(x + 21, y + 9);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = grey(152, Math.max(l, 0.5));
    ctx.fillRect(x + T - 21, y + 11, 6, T - 26);
    ctx.fillStyle = 'rgba(195,225,255,0.55)';
    ctx.beginPath(); ctx.arc(x + T - 18, y + 9, 4, 0, 7); ctx.fill();
  }

  function drawComposter(ctx, s, t, l, sh) {
    const x = t.x * T, y = t.y * T;
    const px = x + 12, py = y + 16, pw = T - 24, ph = T - 30;
    drawShadow(ctx, sh, px, py, pw, ph);
    ctx.fillStyle = grey(112, Math.max(l, 0.5));
    rr(ctx, px, py, pw, ph, 6); ctx.fill();
    ctx.fillStyle = '#4f9440';
    ctx.fillRect(px, py + ph * 0.5, pw, ph * 0.26);
    ctx.strokeStyle = grey(154, Math.max(l, 0.5)); ctx.lineWidth = 1.4;
    rr(ctx, px, py, pw, ph, 6); ctx.stroke();
    ctx.fillStyle = grey(164, Math.max(l, 0.5));
    ctx.fillRect(px + pw * 0.28, py - 7, pw * 0.44, 8);
  }

  function drawReactor(ctx, s, t, l, sh) {
    const x = t.x * T, y = t.y * T;
    drawShadow(ctx, sh, x + 12, y + 18, T - 24, T - 32);
    ctx.fillStyle = grey(98, Math.max(l, 0.5));
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 5, y + 16 + i * 9, T - 10, 4);
    ctx.fillStyle = grey(166, Math.max(l, 0.55));
    ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, T * 0.21, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, T * 0.21, 0, 7); ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, 4, 0, 7); ctx.fill();
  }

  function drawPad(ctx, s, t, l) {
    const x = t.x * T, y = t.y * T;
    ctx.fillStyle = grey(100, Math.max(l, 0.4));
    ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, T * 0.42, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, T * 0.42, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, T * 0.28, 0, 7); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + T / 2 - T * 0.14, y + T / 2); ctx.lineTo(x + T / 2 + T * 0.14, y + T / 2);
    ctx.moveTo(x + T / 2, y + T / 2 - T * 0.14); ctx.lineTo(x + T / 2, y + T / 2 + T * 0.14);
    ctx.stroke();
  }

  const DRAW = {
    solar: drawSolar, battery: drawBattery, hab: drawHab, isru: drawIsru,
    composter: drawComposter, reactor: drawReactor, pad: drawPad
  };

  /* ---------- frame ---------- */

  function draw(ctx, s, ui) {
    const l = lightOf(s);
    const sh = shadowVec(s);

    ctx.clearRect(0, 0, W, H);
    drawTerrain(ctx, s, l, sh);
    drawBoulders(ctx, s, l, sh);

    ctx.strokeStyle = 'rgba(255,255,255,0.026)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= K.COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * T + 0.5, 0); ctx.lineTo(x * T + 0.5, H); ctx.stroke();
    }
    for (let y = 0; y <= K.ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * T + 0.5); ctx.lineTo(W, y * T + 0.5); ctx.stroke();
    }

    for (const t of s.map) if (t.b && t.b.type === 'track') drawTrack(ctx, s, t, l);
    for (const t of s.map) {
      if (!t.b || t.b.type === 'track') continue;
      (DRAW[t.b.type] || drawBattery)(ctx, s, t, l, sh);
    }

    const hoverField = ui.hover ? S.fieldAt(s, S.tileAt(s, ui.hover.x, ui.hover.y)) : null;
    const selField = ui.selected ? S.fieldAt(s, S.tileAt(s, ui.selected.x, ui.selected.y)) : null;
    for (const f of s.fields) {
      drawField(ctx, s, f, l, sh,
        !!(hoverField && hoverField.id === f.id),
        !!(selField && selField.id === f.id));
    }

    if (!S.isSunlit(s)) {
      ctx.fillStyle = 'rgba(10,20,48,0.30)';
      ctx.fillRect(0, 0, W, H);
    }

    /* drag-out rectangle for a new hall */
    if (ui.drag) {
      const r = ui.drag;
      const ok = !S.checkField(s, r.x, r.y, r.w, r.h);
      ctx.fillStyle = ok ? 'rgba(120,220,170,0.20)' : 'rgba(255,90,80,0.22)';
      ctx.fillRect(r.x * T, r.y * T, r.w * T, r.h * T);
      ctx.strokeStyle = ok ? '#6ee7a0' : '#ff7a68';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 5]);
      ctx.strokeRect(r.x * T + 1, r.y * T + 1, r.w * T - 2, r.h * T - 2);
      ctx.setLineDash([]);
      const label = `${r.w} × ${r.h} — ${S.fieldCost(r.w, r.h).toLocaleString()} cr`;
      ctx.font = '700 14px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      const cx = r.x * T + r.w * T / 2, cy = r.y * T + r.h * T / 2;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(8,12,20,0.85)';
      rr(ctx, cx - tw / 2 - 9, cy - 12, tw + 18, 23, 5); ctx.fill();
      ctx.fillStyle = ok ? '#6ee7a0' : '#ff7a68';
      ctx.fillText(label, cx, cy + 4);
    } else if (ui.hover) {
      const t = S.tileAt(s, ui.hover.x, ui.hover.y);
      if (t && !S.fieldAt(s, t)) {
        ctx.fillStyle = ui.hoverOk === false ? 'rgba(255,90,80,0.18)' : 'rgba(120,220,170,0.16)';
        ctx.fillRect(t.x * T, t.y * T, T, T);
        ctx.strokeStyle = ui.hoverOk === false ? '#ff7a68' : '#6ee7a0';
        ctx.lineWidth = 2;
        ctx.strokeRect(t.x * T + 1, t.y * T + 1, T - 2, T - 2);
      }
    }

    if (ui.selected) {
      const t = S.tileAt(s, ui.selected.x, ui.selected.y);
      if (t && !S.fieldAt(s, t)) {
        ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
        ctx.strokeRect(t.x * T + 1, t.y * T + 1, T - 2, T - 2);
      }
    }

    const shed = s.wantFields > 0 && s.litFields < s.wantFields;
    ctx.textAlign = 'center';
    ctx.font = '700 15px ui-monospace, Menlo, monospace';
    if (shed) {
      ctx.fillStyle = 'rgba(22,6,6,0.76)';
      ctx.fillRect(0, 8, W, 26);
      ctx.fillStyle = '#ff8a7a';
      ctx.fillText(`LOAD SHED — LIGHTING ${s.litFields} OF ${s.wantFields} PLANTED HALLS`, W / 2, 26);
    } else if (s.flags.shutter > 0) {
      ctx.fillStyle = 'rgba(22,15,4,0.76)';
      ctx.fillRect(0, 8, W, 26);
      ctx.fillStyle = '#ffc46b';
      ctx.fillText(`HALLS SHUTTERED — ${s.flags.shutter}h REMAINING`, W / 2, 26);
    }
  }

  function hitTest(px, py) {
    const x = Math.floor(px / T), y = Math.floor(py / T);
    if (x < 0 || y < 0 || x >= K.COLS || y >= K.ROWS) return null;
    return { x, y };
  }

  window.LF_RENDER = { draw, hitTest, W, H, T };
})();
