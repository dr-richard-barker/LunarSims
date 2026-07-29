/* Lunar Farm — isometric renderer.

   A 2:1 isometric projection of the plot, drawn with a painter's algorithm.
   Everything is procedural: no sprites, no textures, no external assets.
   Structures are extruded boxes lit by the real sun angle, halls are glazed so
   the canopy shows through, and the crew, rovers and build bots are drawn from
   the agent layer. */

(function () {
  const { K, CROPS } = window.LF_DATA;
  const S = window.LF_SIM;
  const A = window.LF_AGENTS;

  const TW = 68, TH = 34;          // tile footprint on screen
  const OX = K.ROWS * TW / 2 + 12; // origin: leaves room for the left corner
  const OY = 108;                  // headroom for tall structures
  const W = (K.COLS + K.ROWS) * TW / 2 + 24;
  const H = (K.COLS + K.ROWS) * TH / 2 + OY + 96;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const iso = (tx, ty) => ({ x: OX + (tx - ty) * (TW / 2), y: OY + (tx + ty) * (TH / 2) });

  /* ---------- light ---------- */

  function lightOf(s) {
    const e = S.sunElevation(s);
    return S.isSunlit(s) ? 0.62 + 0.38 * e : 0.10;
  }
  function sunVec(s) {
    const e = S.sunElevation(s);
    if (!S.isSunlit(s)) return null;
    const phase = ((s.day + s.hour / 24) % K.LUNAR_CYCLE) / (K.LUNAR_CYCLE / 2);
    const len = (1 - e) * 46 + 10;
    return { x: (phase - 0.5) * 2 * len, y: len * 0.34, a: clamp(0.26 + (1 - e) * 0.3, 0, 0.6) };
  }
  const grey = (v, l) => {
    const b = clamp(v * l, 0, 255);
    return `rgb(${Math.round(b)},${Math.round(b * 0.995)},${Math.round(b * 1.035)})`;
  };
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${Math.round(clamp(((n >> 16) & 255) + amt, 0, 255))},${
      Math.round(clamp(((n >> 8) & 255) + amt, 0, 255))},${
      Math.round(clamp((n & 255) + amt, 0, 255))})`;
  }
  function tone(hex, l, mul) {
    const n = parseInt(hex.slice(1), 16);
    const f = l * mul;
    return `rgb(${Math.round(clamp(((n >> 16) & 255) * f, 0, 255))},${
      Math.round(clamp(((n >> 8) & 255) * f, 0, 255))},${
      Math.round(clamp((n & 255) * f, 0, 255))})`;
  }

  /* ---------- primitives ---------- */

  function diamond(ctx, tx, ty, w, h, dz) {
    const z = dz || 0;
    const a = iso(tx, ty), b = iso(tx + w, ty), c = iso(tx + w, ty + h), d = iso(tx, ty + h);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - z);
    ctx.lineTo(b.x, b.y - z);
    ctx.lineTo(c.x, c.y - z);
    ctx.lineTo(d.x, d.y - z);
    ctx.closePath();
  }

  /* An extruded box over a tile rectangle. `col` is the base hex. */
  function box(ctx, tx, ty, w, h, z, col, l, opts) {
    const o = opts || {};
    const b = iso(tx + w, ty), c = iso(tx + w, ty + h), d = iso(tx, ty + h);

    /* right-facing wall */
    ctx.fillStyle = o.right || tone(col, l, 0.62);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y); ctx.lineTo(c.x, c.y);
    ctx.lineTo(c.x, c.y - z); ctx.lineTo(b.x, b.y - z);
    ctx.closePath(); ctx.fill();

    /* left-facing wall */
    ctx.fillStyle = o.left || tone(col, l, 0.42);
    ctx.beginPath();
    ctx.moveTo(d.x, d.y); ctx.lineTo(c.x, c.y);
    ctx.lineTo(c.x, c.y - z); ctx.lineTo(d.x, d.y - z);
    ctx.closePath(); ctx.fill();

    /* roof */
    if (!o.noTop) {
      ctx.fillStyle = o.top || tone(col, l, 1.0);
      diamond(ctx, tx, ty, w, h, z); ctx.fill();
    }
    if (o.stroke) {
      ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1;
      diamond(ctx, tx, ty, w, h, z); ctx.stroke();
    }
  }

  function groundShadow(ctx, tx, ty, w, h, z, sv) {
    if (!sv) return;
    const k = z / 26;
    const a = iso(tx, ty), b = iso(tx + w, ty), c = iso(tx + w, ty + h), d = iso(tx, ty + h);
    const sx = sv.x * k, sy = sv.y * k;
    ctx.fillStyle = `rgba(0,0,0,${sv.a * 0.72})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x + sx, c.y + sy); ctx.lineTo(d.x + sx, d.y + sy);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + sx, a.y + sy);
    ctx.lineTo(d.x + sx, d.y + sy); ctx.lineTo(d.x, d.y);
    ctx.closePath(); ctx.fill();
  }

  /* ---------- terrain ---------- */

  function drawGround(ctx, s, l, sv) {
    for (let d = 0; d <= K.COLS + K.ROWS - 2; d++) {
      for (let tx = 0; tx < K.COLS; tx++) {
        const ty = d - tx;
        if (ty < 0 || ty >= K.ROWS) continue;
        const t = s.map[ty * K.COLS + tx];
        const p = iso(tx, ty);

        if (t.t === 'skylight') {
          ctx.fillStyle = grey(120, l);
          diamond(ctx, tx, ty, 1, 1); ctx.fill();
          ctx.fillStyle = '#04060b';
          diamond(ctx, tx + 0.10, ty + 0.10, 0.8, 0.8); ctx.fill();
          ctx.strokeStyle = grey(210, l); ctx.lineWidth = 1.5;
          diamond(ctx, tx + 0.10, ty + 0.10, 0.8, 0.8); ctx.stroke();
          continue;
        }

        ctx.fillStyle = grey(t.t === 'rough' ? 148 : 162, l);
        diamond(ctx, tx, ty, 1, 1); ctx.fill();

        if (t.t === 'crater') {
          ctx.fillStyle = grey(132, l);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + TH / 2, TW * 0.40, TH * 0.40, 0, 0, 7);
          ctx.fill();
          if (sv) {
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(p.x, p.y + TH / 2, TW * 0.40, TH * 0.40, 0, 0, 7);
            ctx.clip();
            ctx.fillStyle = `rgba(0,0,0,${clamp(0.14 + sv.a * 0.45, 0, 0.46)})`;
            ctx.beginPath();
            ctx.ellipse(p.x + Math.sign(sv.x) * TW * 0.30, p.y + TH * 0.42,
              TW * 0.36, TH * 0.36, 0, 0, 7);
            ctx.fill();
            ctx.restore();
          }
          ctx.strokeStyle = grey(198, l); ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + TH / 2, TW * 0.40, TH * 0.40, 0, 0, 7);
          ctx.stroke();
        } else {
          /* regolith speckle */
          const n = t.t === 'rough' ? 12 : 7;
          for (let i = 0; i < n; i++) {
            const u = ((t.v * 977 + i * 131) % 100) / 100;
            const w = ((t.v * 613 + i * 271) % 100) / 100;
            const q = iso(tx + u * 0.86 + 0.07, ty + w * 0.86 + 0.07);
            ctx.fillStyle = ((t.v * 100 + i) % 2) < 1
              ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.065)';
            ctx.fillRect(q.x - 1, q.y - 1, 2, 2);
          }
        }
      }
    }
  }

  function drawBoulder(ctx, t, l, sv) {
    for (let i = 0; i < 3; i++) {
      const u = 0.22 + ((t.v * 700 + i * 150) % 56) / 100;
      const w = 0.22 + ((t.v * 430 + i * 90) % 56) / 100;
      const p = iso(t.x + u, t.y + w);
      const r = 5 + ((t.v * 100 + i * 33) % 6);
      if (sv) {
        ctx.fillStyle = `rgba(0,0,0,${sv.a})`;
        ctx.beginPath();
        ctx.ellipse(p.x + sv.x * 0.20, p.y + sv.y * 0.20, r * 1.7, r * 0.62, 0, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = grey(126, l);
      ctx.beginPath(); ctx.ellipse(p.x, p.y - r * 0.5, r, r * 0.86, 0, 0, 7); ctx.fill();
      ctx.fillStyle = grey(208, l);
      ctx.beginPath(); ctx.ellipse(p.x - r * 0.3, p.y - r * 0.8, r * 0.45, r * 0.38, 0, 0, 7); ctx.fill();
    }
  }

  /* ---------- plants ---------- */

  function drawPlant(ctx, c, g, health, px, py, scale) {
    const dim = -(1 - health) * 62;
    const hgt = (0.28 + g * 0.72) * 26 * scale;
    const wid = (0.3 + g * 0.7) * 15 * scale;
    const lw = Math.max(1, 1.7 * scale);

    switch (c.kind) {
      case 'grain':
        ctx.strokeStyle = shade(c.colour, -26 + dim);
        ctx.lineWidth = lw;
        for (let i = -2; i <= 2; i++) {
          const ox = px + i * wid * 0.26;
          ctx.beginPath();
          ctx.moveTo(ox, py);
          ctx.quadraticCurveTo(ox + i * 1.2, py - hgt * 0.6, ox + i * 2.2, py - hgt);
          ctx.stroke();
          if (g > 0.6) {
            ctx.fillStyle = shade(c.colour, 20 + dim);
            ctx.beginPath();
            ctx.ellipse(ox + i * 2.2, py - hgt - 2 * scale, 1.9 * scale, 4.2 * scale, 0, 0, 7);
            ctx.fill();
          }
        }
        break;
      case 'fruit':
        ctx.strokeStyle = shade('#3f7a3a', dim);
        ctx.lineWidth = lw * 1.5;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - hgt); ctx.stroke();
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = shade('#58a148', dim - i * 3);
          ctx.beginPath();
          ctx.ellipse(px + (i % 2 ? 1 : -1) * wid * 0.42, py - hgt * (0.28 + i * 0.2),
            wid * 0.4, 2.4 * scale, (i % 2 ? 0.3 : -0.3), 0, 7);
          ctx.fill();
        }
        if (g > 0.6) {
          const nf = Math.round((g - 0.6) / 0.4 * 3) + 1;
          for (let i = 0; i < nf; i++) {
            const fx = px + (i % 2 ? 1 : -1) * wid * 0.34;
            const fy = py - hgt * (0.42 + i * 0.17);
            ctx.fillStyle = shade(c.colour, dim);
            ctx.beginPath(); ctx.arc(fx, fy, 2.6 * scale, 0, 7); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.beginPath(); ctx.arc(fx - scale, fy - scale, 0.9 * scale, 0, 7); ctx.fill();
          }
        }
        break;
      case 'root':
        if (g > 0.4) {
          ctx.fillStyle = shade(c.colour, dim);
          ctx.beginPath();
          ctx.ellipse(px, py - 1.5 * scale, wid * 0.34, 2.8 * scale, 0, 0, 7);
          ctx.fill();
        }
        ctx.strokeStyle = shade('#5aa348', dim);
        ctx.lineWidth = lw;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(px, py - 2 * scale);
          ctx.quadraticCurveTo(px + i * wid * 0.22, py - hgt * 0.55,
            px + i * wid * 0.4, py - hgt * 0.92);
          ctx.stroke();
        }
        break;
      case 'flower':
        ctx.strokeStyle = shade('#4f9440', dim);
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - hgt * 0.8); ctx.stroke();
        if (g > 0.5) {
          const q = (g - 0.5) / 0.5;
          for (let i = 0; i < 7; i++) {
            const ang = (i / 7) * Math.PI * 2;
            ctx.fillStyle = shade(c.colour, dim);
            ctx.beginPath();
            ctx.ellipse(px + Math.cos(ang) * 4 * q * scale, py - hgt * 0.85 + Math.sin(ang) * 2.4 * q * scale,
              2.6 * q * scale, 1.6 * q * scale, ang, 0, 7);
            ctx.fill();
          }
          ctx.fillStyle = '#f2d24a';
          ctx.beginPath(); ctx.arc(px, py - hgt * 0.85, 1.7 * q * scale, 0, 7); ctx.fill();
        }
        break;
      case 'algae': {
        const tw = wid * 1.1, th = hgt * 0.8;
        ctx.fillStyle = 'rgba(195,225,240,0.16)';
        ctx.fillRect(px - tw / 2, py - th, tw, th);
        const fill = th * (0.16 + g * 0.8);
        ctx.fillStyle = shade(c.colour, dim);
        ctx.fillRect(px - tw / 2 + 1, py - fill, tw - 2, fill - 1);
        ctx.strokeStyle = 'rgba(210,235,250,0.45)'; ctx.lineWidth = 1;
        ctx.strokeRect(px - tw / 2, py - th, tw, th);
        break;
      }
      default: {
        const n = Math.max(4, Math.round(4 + g * 5));
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + g;
          ctx.fillStyle = shade(c.colour, (i % 2 ? -18 : 8) + dim);
          ctx.beginPath();
          ctx.ellipse(px + Math.cos(ang) * wid * 0.34, py - hgt * 0.45 + Math.sin(ang) * hgt * 0.2,
            wid * 0.4, hgt * 0.26, ang * 0.4, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = shade(c.colour, 24 + dim);
        ctx.beginPath();
        ctx.ellipse(px, py - hgt * 0.45, wid * 0.17, hgt * 0.12, 0, 0, 7);
        ctx.fill();
        if (c.kind === 'research' && g > 0.45) {
          ctx.strokeStyle = shade(c.colour, -16); ctx.lineWidth = 1;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(px + i * 2, py - hgt * 0.5);
            ctx.lineTo(px + i * 3, py - hgt * (0.5 + 0.5 * (g - 0.45) / 0.55));
            ctx.stroke();
          }
        }
      }
    }
  }

  /* ---------- grow halls ---------- */

  const HALL_Z = 30;

  function drawField(ctx, s, f, l, sv, hovered, selected) {
    const site = A && A.siteAt(f.x, f.y);
    groundShadow(ctx, f.x, f.y, f.w, f.h, HALL_Z, sv);

    if (f.litNow) {
      const p = iso(f.x + f.w / 2, f.y + f.h / 2);
      const g = ctx.createRadialGradient(p.x, p.y, 6, p.x, p.y, Math.max(f.w, f.h) * TW * 0.55);
      g.addColorStop(0, 'rgba(255,90,190,0.22)');
      g.addColorStop(1, 'rgba(255,90,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(iso(f.x, f.y + f.h).x - TW, iso(f.x, f.y).y - HALL_Z - TH,
        (f.w + f.h) * TW / 2 + TW * 2, (f.w + f.h) * TH / 2 + HALL_Z + TH * 3);
    }

    /* floor pan */
    ctx.fillStyle = f.litNow ? '#2a2130' : grey(58, Math.max(l, 0.5));
    diamond(ctx, f.x, f.y, f.w, f.h); ctx.fill();

    /* growing beds and the canopy itself */
    const c = f.crop ? S.cropById(f.crop) : null;
    for (let ty = 0; ty < f.h; ty++) {
      for (let tx = 0; tx < f.w; tx++) {
        ctx.fillStyle = f.dead ? 'rgba(74,66,54,0.9)' : 'rgba(60,50,42,0.9)';
        diamond(ctx, f.x + tx + 0.08, f.y + ty + 0.08, 0.84, 0.84); ctx.fill();
        const p = iso(f.x + tx + 0.5, f.y + ty + 0.5);
        if (c && !f.dead) {
          drawPlant(ctx, c, f.growth, f.health, p.x, p.y + TH * 0.18, 1);
        } else if (f.dead) {
          ctx.strokeStyle = '#6b5f4c'; ctx.lineWidth = 1.6;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(p.x + i * 3, p.y + 4); ctx.lineTo(p.x + i * 6, p.y - 7);
            ctx.stroke();
          }
        }
      }
    }

    /* lamp rails, hung under the roof */
    for (let ty = 0; ty < f.h; ty++) {
      const a = iso(f.x + 0.1, f.y + ty + 0.5), b = iso(f.x + f.w - 0.1, f.y + ty + 0.5);
      ctx.strokeStyle = f.litNow ? '#ff5fbd' : '#3a3040';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - HALL_Z + 5); ctx.lineTo(b.x, b.y - HALL_Z + 5);
      ctx.stroke();
    }

    if (site) return drawScaffold(ctx, f.x, f.y, f.w, f.h, HALL_Z, site, l);

    /* glass walls */
    const glassR = f.litNow ? 'rgba(255,140,210,0.20)' : 'rgba(150,185,220,0.15)';
    const glassL = f.litNow ? 'rgba(220,110,190,0.26)' : 'rgba(120,155,195,0.20)';
    box(ctx, f.x, f.y, f.w, f.h, HALL_Z, '#8fb4d8', l, {
      right: glassR, left: glassL,
      top: f.litNow ? 'rgba(255,150,215,0.17)' : 'rgba(175,205,235,0.13)'
    });

    /* frame: eaves, ridge ribs and corner posts */
    ctx.strokeStyle = f.litNow ? 'rgba(255,160,220,0.75)' : 'rgba(190,210,235,0.5)';
    ctx.lineWidth = 1.6;
    diamond(ctx, f.x, f.y, f.w, f.h, HALL_Z); ctx.stroke();
    diamond(ctx, f.x, f.y, f.w, f.h); ctx.stroke();
    for (let i = 1; i < f.w; i++) {
      const a = iso(f.x + i, f.y), b = iso(f.x + i, f.y + f.h);
      ctx.beginPath(); ctx.moveTo(a.x, a.y - HALL_Z); ctx.lineTo(b.x, b.y - HALL_Z); ctx.stroke();
    }
    for (let i = 1; i < f.h; i++) {
      const a = iso(f.x, f.y + i), b = iso(f.x + f.w, f.y + i);
      ctx.beginPath(); ctx.moveTo(a.x, a.y - HALL_Z); ctx.lineTo(b.x, b.y - HALL_Z); ctx.stroke();
    }
    for (const [cx, cy] of [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.h], [f.x, f.y + f.h]]) {
      const p = iso(cx, cy);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - HALL_Z); ctx.stroke();
    }

    /* label and pips float above the ridge */
    const top = iso(f.x + f.w / 2, f.y + f.h / 2);
    if (c) {
      ctx.font = '600 10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      const label = c.name.toUpperCase();
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(6,9,15,0.72)';
      ctx.fillRect(top.x - tw / 2 - 5, top.y - HALL_Z - 26, tw + 10, 14);
      ctx.fillStyle = 'rgba(233,240,252,0.95)';
      ctx.fillText(label, top.x, top.y - HALL_Z - 16);

      const barW = Math.min(74, tw + 10);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(top.x - barW / 2, top.y - HALL_Z - 11, barW, 3);
      ctx.fillStyle = f.growth >= 1 ? '#6ee7a0' : '#8ab4ff';
      ctx.fillRect(top.x - barW / 2, top.y - HALL_Z - 11, barW * f.growth, 3);
    }
    let pip = 0;
    const dot = col => {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(top.x - 22 + pip * 11, top.y - HALL_Z - 34, 3.4, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      pip++;
    };
    if (f.crop && f.growth >= 1) dot('#6ee7a0');
    if (f.infected) dot('#e8d24a');
    if (f.crop && f.moisture < 0.25) dot('#4aa8ff');
    if (f.crop && f.feed < 0.12) dot('#c58cff');
    if (!f.serviced) dot('#ff7a68');

    if (selected || hovered) {
      ctx.strokeStyle = selected ? '#ffd166' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = selected ? 2.5 : 1.5;
      diamond(ctx, f.x, f.y, f.w, f.h); ctx.stroke();
    }
  }

  /* ---------- construction ---------- */

  function drawScaffold(ctx, x, y, w, h, z, site, l) {
    const prog = 1 - site.t / site.born;
    const zz = z * clamp(prog * 1.25, 0.12, 1);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.6;
    diamond(ctx, x, y, w, h); ctx.stroke();
    ctx.setLineDash([]);
    for (const [cx, cy] of [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) {
      const p = iso(cx, cy);
      ctx.strokeStyle = 'rgba(255,209,102,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - zz); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,209,102,0.55)'; ctx.lineWidth = 1.2;
    diamond(ctx, x, y, w, h, zz); ctx.stroke();

    /* two bots and a shower of sparks */
    for (let i = 0; i < 2; i++) {
      const t = site.t * 3 + i * 2.1;
      const u = x + 0.5 + (w - 1) * (0.5 + 0.5 * Math.sin(t * 0.9 + i));
      const v = y + 0.5 + (h - 1) * (0.5 + 0.5 * Math.cos(t * 0.7 + i * 2));
      const p = iso(u, v);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 6, 2.6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = grey(190, Math.max(l, 0.55));
      ctx.fillRect(p.x - 4, p.y - 9, 8, 8);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(p.x, p.y - 12, 2.2, 0, 7); ctx.fill();
      /* welding arm */
      ctx.strokeStyle = grey(150, Math.max(l, 0.55)); ctx.lineWidth = 1.6;
      const ax = p.x + Math.cos(t * 6) * 7, ay = p.y - 6 + Math.sin(t * 6) * 4;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 6); ctx.lineTo(ax, ay); ctx.stroke();
      if (Math.sin(t * 12) > 0.2) {
        ctx.fillStyle = 'rgba(255,240,190,0.95)';
        ctx.beginPath(); ctx.arc(ax, ay, 2.4, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,200,90,0.5)';
        ctx.beginPath(); ctx.arc(ax, ay, 5.5, 0, 7); ctx.fill();
      }
    }
  }

  /* ---------- single-tile structures ---------- */

  function drawStruct(ctx, s, t, l, sv) {
    const site = A && A.siteAt(t.x, t.y);
    const x = t.x, y = t.y;
    const type = t.b.type;

    if (type === 'track') {
      ctx.fillStyle = grey(104, l);
      diamond(ctx, x + 0.06, y + 0.06, 0.88, 0.88); ctx.fill();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = S.tileAt(s, x + dx, y + dy);
        if (n && (n.b || n.f)) {
          diamond(ctx, x + 0.06 + dx * 0.45, y + 0.06 + dy * 0.45, 0.88, 0.88);
          ctx.fill();
        }
      }
      const a = iso(x + 0.1, y + 0.5), b = iso(x + 0.9, y + 0.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      return;
    }

    const Z = { solar: 20, battery: 18, hab: 26, isru: 32, composter: 24, reactor: 26, pad: 3 }[type] || 20;
    groundShadow(ctx, x + 0.1, y + 0.1, 0.8, 0.8, Z, sv);
    if (site) return drawScaffold(ctx, x, y, 1, 1, Z, site, l);

    const p = iso(x + 0.5, y + 0.5);

    switch (type) {
      case 'solar': {
        box(ctx, x + 0.42, y + 0.42, 0.16, 0.16, 12, '#8a8f9c', l);
        /* the panel plane, tilted toward the sun */
        const tilt = 7;
        const a = iso(x + 0.05, y + 0.05), b = iso(x + 0.95, y + 0.05);
        const c2 = iso(x + 0.95, y + 0.95), d = iso(x + 0.05, y + 0.95);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - Z - tilt); ctx.lineTo(b.x, b.y - Z);
        ctx.lineTo(c2.x, c2.y - Z + tilt); ctx.lineTo(d.x, d.y - Z);
        ctx.closePath();
        ctx.fillStyle = `rgb(${Math.round(26 + 34 * l)},${Math.round(44 + 56 * l)},${Math.round(92 + 88 * l)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(155,200,250,${0.25 + l * 0.35})`; ctx.lineWidth = 1;
        ctx.stroke();
        for (let i = 1; i < 4; i++) {
          const u = i / 4;
          const m1 = { x: a.x + (b.x - a.x) * u, y: a.y - Z - tilt + (b.y - a.y + tilt) * u };
          const m2 = { x: d.x + (c2.x - d.x) * u, y: d.y - Z + (c2.y - d.y + tilt) * u };
          ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();
        }
        if (S.isSunlit(s)) {
          ctx.fillStyle = `rgba(255,255,255,${0.05 + S.sunElevation(s) * 0.14})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y - Z - tilt); ctx.lineTo(b.x, b.y - Z);
          ctx.lineTo(p.x, p.y - Z + 2); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'battery': {
        box(ctx, x + 0.14, y + 0.14, 0.72, 0.72, Z, '#7f8593', l, { stroke: grey(170, l), lw: 1.2 });
        const frac = S.storageCap(s) > 0 ? clamp(s.stored / S.storageCap(s), 0, 1) : 0;
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = (i + 1) / 3 <= frac + 0.001 ? '#6ee7a0' : 'rgba(255,255,255,0.14)';
          ctx.fillRect(p.x - 9, p.y - Z + 4 + i * 5, 18, 3);
        }
        break;
      }
      case 'hab': {
        box(ctx, x + 0.1, y + 0.22, 0.8, 0.56, Z, '#b9bfcb', l, { stroke: grey(150, l), lw: 1.2 });
        /* rounded end cap and lit ports */
        ctx.fillStyle = tone('#cfd5e0', l, 1);
        ctx.beginPath(); ctx.ellipse(p.x, p.y - Z, TW * 0.30, TH * 0.30, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffd166';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.arc(p.x + i * 9, p.y - Z * 0.42, 2.2, 0, 7); ctx.fill();
        }
        break;
      }
      case 'isru': {
        box(ctx, x + 0.16, y + 0.16, 0.68, 0.68, Z * 0.55, '#8b909d', l);
        box(ctx, x + 0.30, y + 0.30, 0.4, 0.4, Z, '#9aa0ad', l, { stroke: grey(160, l) });
        ctx.fillStyle = 'rgba(200,230,255,0.55)';
        ctx.beginPath(); ctx.arc(p.x, p.y - Z - 3, 3.4, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(200,230,255,0.20)';
        ctx.beginPath(); ctx.arc(p.x, p.y - Z - 9, 6.5, 0, 7); ctx.fill();
        break;
      }
      case 'composter': {
        box(ctx, x + 0.16, y + 0.16, 0.68, 0.68, Z, '#7f8593', l, { stroke: grey(160, l) });
        ctx.fillStyle = '#4f9440';
        ctx.fillRect(p.x - 13, p.y - Z * 0.45, 26, 5);
        break;
      }
      case 'reactor': {
        /* radiator fins first, then the drum */
        ctx.strokeStyle = grey(150, l); ctx.lineWidth = 2;
        for (let i = -1; i <= 1; i += 2) {
          const a = iso(x + 0.5 + i * 0.42, y + 0.08), b = iso(x + 0.5 + i * 0.42, y + 0.92);
          ctx.beginPath(); ctx.moveTo(a.x, a.y - 8); ctx.lineTo(b.x, b.y - 8); ctx.stroke();
        }
        box(ctx, x + 0.28, y + 0.28, 0.44, 0.44, Z, '#9aa0ad', l, { stroke: '#ffd166', lw: 1.4 });
        ctx.fillStyle = '#ffd166';
        ctx.beginPath(); ctx.arc(p.x, p.y - Z, 3.2, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,209,102,0.22)';
        ctx.beginPath(); ctx.arc(p.x, p.y - Z, 9, 0, 7); ctx.fill();
        break;
      }
      case 'pad': {
        ctx.fillStyle = grey(104, l);
        diamond(ctx, x + 0.04, y + 0.04, 0.92, 0.92); ctx.fill();
        ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.6;
        diamond(ctx, x + 0.16, y + 0.16, 0.68, 0.68); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x - 10, p.y); ctx.lineTo(p.x + 10, p.y);
        ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x, p.y + 5);
        ctx.stroke();
        break;
      }
    }
  }

  /* ---------- agents ---------- */

  function drawAgent(ctx, a, l) {
    const p = iso(a.x + 0.5, a.y + 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, a.kind === 'rover' ? 9 : 4, 3, 0, 0, 7); ctx.fill();

    if (a.kind === 'rover') {
      ctx.fillStyle = grey(120, Math.max(l, 0.5));
      ctx.fillRect(p.x - 9, p.y - 4, 18, 4);
      ctx.fillStyle = grey(178, Math.max(l, 0.5));
      ctx.fillRect(p.x - 7, p.y - 11, 14, 7);
      if (a.cargo) {
        ctx.fillStyle = '#6ee7a0';
        ctx.fillRect(p.x - 5, p.y - 15, 10, 4);
      }
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(p.x + 8, p.y - 8, 1.6, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(20,24,32,0.9)';
      ctx.beginPath(); ctx.arc(p.x - 6, p.y - 1, 2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 6, p.y - 1, 2, 0, 7); ctx.fill();
      return;
    }

    /* a suited figure, bobbing as it walks */
    const bob = Math.abs(Math.sin(a.bob)) * 1.6;
    ctx.fillStyle = a.tint;
    ctx.fillRect(p.x - 2.2, p.y - 9 - bob, 4.4, 6);          // torso
    ctx.fillStyle = shade(a.tint === '#e8edf7' ? '#e8edf7' : '#d8c9a8', -40);
    ctx.fillRect(p.x - 2.2, p.y - 3.5 - bob, 1.8, 3.5);      // legs
    ctx.fillRect(p.x + 0.4, p.y - 3.5 - bob, 1.8, 3.5);
    ctx.fillStyle = a.tint;
    ctx.beginPath(); ctx.arc(p.x, p.y - 11 - bob, 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(90,150,220,0.85)';                 // visor
    ctx.beginPath(); ctx.arc(p.x + 0.5, p.y - 11.2 - bob, 1.4, 0, 7); ctx.fill();
  }

  /* ---------- frame ---------- */

  function draw(ctx, s, ui) {
    const l = lightOf(s);
    const sv = sunVec(s);

    /* space around the plate */
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 90; i++) {
      const q = Math.sin(i * 12.9898) * 43758.5453;
      const u = q - Math.floor(q);
      const r = Math.sin(i * 78.233) * 12345.678;
      const v = r - Math.floor(r);
      ctx.globalAlpha = 0.25 + u * 0.5;
      ctx.fillRect(u * W, v * H, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;

    /* the plate itself, with a rim so it reads as a solid slab */
    ctx.fillStyle = grey(70, Math.max(l, 0.35));
    const c0 = iso(0, 0), c1 = iso(K.COLS, 0), c2 = iso(K.COLS, K.ROWS), c3 = iso(0, K.ROWS);
    ctx.beginPath();
    ctx.moveTo(c3.x, c3.y); ctx.lineTo(c2.x, c2.y);
    ctx.lineTo(c2.x, c2.y + 16); ctx.lineTo(c3.x, c3.y + 16);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = grey(50, Math.max(l, 0.35));
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y);
    ctx.lineTo(c2.x, c2.y + 16); ctx.lineTo(c1.x, c1.y + 16);
    ctx.closePath(); ctx.fill();

    drawGround(ctx, s, l, sv);

    /* everything above ground, back to front */
    const items = [];
    for (const t of s.map) {
      if (t.t === 'boulder') items.push({ d: t.x + t.y, z: 0, fn: () => drawBoulder(ctx, t, l, sv) });
      if (t.b && t.b.type === 'track') items.push({ d: t.x + t.y, z: -1, fn: () => drawStruct(ctx, s, t, l, sv) });
      else if (t.b) items.push({ d: t.x + t.y, z: 1, fn: () => drawStruct(ctx, s, t, l, sv) });
    }
    const hoverField = ui.hover ? S.fieldAt(s, S.tileAt(s, ui.hover.x, ui.hover.y)) : null;
    const selField = ui.selected ? S.fieldAt(s, S.tileAt(s, ui.selected.x, ui.selected.y)) : null;
    for (const f of s.fields) {
      items.push({
        d: f.x + f.y, z: 1,
        fn: () => drawField(ctx, s, f, l, sv,
          !!(hoverField && hoverField.id === f.id), !!(selField && selField.id === f.id))
      });
    }
    if (A) for (const a of A.all()) items.push({ d: a.x + a.y, z: 2, fn: () => drawAgent(ctx, a, l) });

    items.sort((p, q) => (p.d - q.d) || (p.z - q.z));
    for (const it of items) it.fn();

    if (!S.isSunlit(s)) {
      ctx.fillStyle = 'rgba(12,22,52,0.30)';
      ctx.beginPath();
      ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y);
      ctx.closePath(); ctx.fill();
    }

    /* drag-out outline */
    if (ui.drag) {
      const r = ui.drag;
      const ok = !S.checkField(s, r.x, r.y, r.w, r.h);
      ctx.fillStyle = ok ? 'rgba(120,220,170,0.24)' : 'rgba(255,90,80,0.26)';
      diamond(ctx, r.x, r.y, r.w, r.h); ctx.fill();
      ctx.strokeStyle = ok ? '#6ee7a0' : '#ff7a68';
      ctx.lineWidth = 2.5; ctx.setLineDash([7, 5]);
      diamond(ctx, r.x, r.y, r.w, r.h); ctx.stroke();
      ctx.setLineDash([]);
      const p = iso(r.x + r.w / 2, r.y + r.h / 2);
      const label = `${r.w} × ${r.h} — ${S.fieldCost(r.w, r.h).toLocaleString()} cr`;
      ctx.font = '700 14px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(8,12,20,0.88)';
      ctx.fillRect(p.x - tw / 2 - 9, p.y - 12, tw + 18, 23);
      ctx.fillStyle = ok ? '#6ee7a0' : '#ff7a68';
      ctx.fillText(label, p.x, p.y + 4);
    } else if (ui.hover) {
      const t = S.tileAt(s, ui.hover.x, ui.hover.y);
      if (t && !S.fieldAt(s, t)) {
        ctx.fillStyle = ui.hoverOk === false ? 'rgba(255,90,80,0.20)' : 'rgba(120,220,170,0.18)';
        diamond(ctx, t.x, t.y, 1, 1); ctx.fill();
        ctx.strokeStyle = ui.hoverOk === false ? '#ff7a68' : '#6ee7a0';
        ctx.lineWidth = 2;
        diamond(ctx, t.x, t.y, 1, 1); ctx.stroke();
      }
    }
    if (ui.selected) {
      const t = S.tileAt(s, ui.selected.x, ui.selected.y);
      if (t && !S.fieldAt(s, t)) {
        ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
        diamond(ctx, t.x, t.y, 1, 1); ctx.stroke();
      }
    }

    const shed = s.wantFields > 0 && s.litFields < s.wantFields;
    ctx.textAlign = 'center';
    ctx.font = '700 15px ui-monospace, Menlo, monospace';
    if (shed) {
      ctx.fillStyle = 'rgba(22,6,6,0.78)';
      ctx.fillRect(0, 10, W, 26);
      ctx.fillStyle = '#ff8a7a';
      ctx.fillText(`LOAD SHED — LIGHTING ${s.litFields} OF ${s.wantFields} PLANTED HALLS`, W / 2, 28);
    } else if (s.flags.shutter > 0) {
      ctx.fillStyle = 'rgba(22,15,4,0.78)';
      ctx.fillRect(0, 10, W, 26);
      ctx.fillStyle = '#ffc46b';
      ctx.fillText(`HALLS SHUTTERED — ${s.flags.shutter}h REMAINING`, W / 2, 28);
    }
  }

  function hitTest(px, py) {
    const dx = px - OX, dy = py - OY;
    const tx = Math.floor(dy / TH + dx / TW);
    const ty = Math.floor(dy / TH - dx / TW);
    if (tx < 0 || ty < 0 || tx >= K.COLS || ty >= K.ROWS) return null;
    return { x: tx, y: ty };
  }

  window.LF_RENDER = { draw, hitTest, W, H, TW, TH, iso };
})();
