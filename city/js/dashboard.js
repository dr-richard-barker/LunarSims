/* Artemis City — the report dashboard.
   Same small-multiples technique as Lunar Farm's dashboard.js: one metric
   per panel, one ink colour, values read straight from s.history. */

(function () {
  const S = window.LC_SIM;

  const INK = '#5fc9ff';
  const GOOD = '#6ee7a0';
  const WARN = '#ffc46b';
  const BAD = '#ff7a68';

  const PANELS = [
    { key: 'pop', title: 'Population', unit: 'colonists', good: () => true, warn: () => true },
    { key: 'housingCap', title: 'Housing capacity', unit: 'colonists', good: () => true, warn: () => true },
    { key: 'jobs', title: 'Jobs', unit: '', good: () => true, warn: () => true },
    { key: 'credits', title: 'Credits', unit: '', good: v => v >= 4000, warn: v => v >= 500 },
    { key: 'food', title: 'Food reserve', unit: 'days', fmt: v => v.toFixed(1),
      good: v => v >= 20, warn: v => v >= 8 },
    { key: 'o2', title: 'Oxygen store', unit: 'kg', good: v => v >= 120, warn: v => v >= 60 },
    { key: 'water', title: 'Water in the loop', unit: 'L', good: v => v >= 400, warn: v => v >= 150 },
    { key: 'power', title: 'Stored energy', unit: 'kWh', good: v => v >= 60, warn: v => v >= 20 }
  ];

  const fmtNum = v => Math.round(v).toLocaleString();

  function panel(hist, p) {
    const W = 300, H = 104, PADL = 4, PADR = 4, PADT = 12, PADB = 16;
    const vals = hist.map(h => h[p.key] || 0);
    const last = vals[vals.length - 1];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = (hi - lo) || Math.max(1, Math.abs(hi) * 0.1);
    const y0 = lo - span * 0.12, y1 = hi + span * 0.12;
    const x = i => PADL + (i / Math.max(1, hist.length - 1)) * (W - PADL - PADR);
    const y = v => PADT + (1 - (v - y0) / (y1 - y0)) * (H - PADT - PADB);

    let bands = '', runStart = null;
    hist.forEach((h, i) => {
      if (!h.sun && runStart === null) runStart = i;
      if ((h.sun || i === hist.length - 1) && runStart !== null) {
        const a = x(runStart), b = x(i);
        bands += `<rect x="${a.toFixed(1)}" y="${PADT}" width="${Math.max(1, b - a).toFixed(1)}"
          height="${H - PADT - PADB}" fill="rgba(120,150,210,0.10)"/>`;
        runStart = null;
      }
    });

    const line = hist.map((h, i) => `${x(i).toFixed(1)},${y(h[p.key] || 0).toFixed(1)}`).join(' ');
    const areaPts = `${x(0).toFixed(1)},${(H - PADB).toFixed(1)} ${line} ${x(hist.length - 1).toFixed(1)},${(H - PADB).toFixed(1)}`;
    const status = p.good(last) ? GOOD : p.warn(last) ? WARN : BAD;
    const shown = p.fmt ? p.fmt(last) : fmtNum(last);

    return `
      <figure class="dpanel" data-key="${p.key}">
        <figcaption>
          <span class="dtitle">${p.title}</span>
          <span class="dnow" style="color:${status}">${shown}${p.unit ? ' <em>' + p.unit + '</em>' : ''}</span>
        </figcaption>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
             aria-label="${p.title} from day ${hist[0].d} to day ${hist[hist.length - 1].d}">
          ${bands}
          <line x1="${PADL}" y1="${H - PADB}" x2="${W - PADR}" y2="${H - PADB}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
          <polygon points="${areaPts}" fill="rgba(95,201,255,0.13)"/>
          <polyline points="${line}" fill="none" stroke="${INK}" stroke-width="2"
                    stroke-linejoin="round" stroke-linecap="round"/>
          <circle cx="${x(hist.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="3.5"
                  fill="${status}" stroke="#11141c" stroke-width="2"/>
          <rect class="dhit" x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
        </svg>
        <div class="dscale"><span>${p.fmt ? p.fmt(lo) : fmtNum(lo)}</span><span>${p.fmt ? p.fmt(hi) : fmtNum(hi)}</span></div>
      </figure>`;
  }

  function facts(s) {
    const h = s.history;
    const now = h[h.length - 1];
    const hab = s.map.filter(t => t.zone && t.zone.kind === 'hab' && t.zone.stage > 0).length;
    const trade = s.map.filter(t => t.zone && t.zone.kind === 'trade' && t.zone.stage > 0).length;
    const industry = s.map.filter(t => t.zone && t.zone.kind === 'industry' && t.zone.stage > 0).length;
    return { now, days: s.day, pop: s.pop, housingCap: s.housingCap, jobs: s.jobs || 0,
             hab, trade, industry, harvests: s.stats.harvests, launches: s.stats.launches || 0,
             sunlit: S.isSunlit(s), selfSuffStreak: S.selfSuffStreak(s) };
  }

  function narrative(s, f) {
    const lines = [];
    lines.push(`Day ${f.days} at Shackleton Rim. Population stands at ${f.pop} against a zoned capacity of ${f.housingCap}, with ${f.jobs} job${f.jobs === 1 ? '' : 's'} across the trade and industrial districts.`);
    lines.push(`Developed ground: ${f.hab} habitation tile${f.hab === 1 ? '' : 's'}, ${f.trade} trade tile${f.trade === 1 ? '' : 's'}, ${f.industry} industrial tile${f.industry === 1 ? '' : 's'}. The Agriculture zone has brought in ${f.harvests} harvest${f.harvests === 1 ? '' : 's'} to date.`);
    lines.push(`Reserves: ${f.now.food.toFixed(1)} days of food, ${fmtNum(f.now.o2)} kg oxygen, ${fmtNum(f.now.water)} L water, ${fmtNum(f.now.power)} kWh stored. Treasury holds ${fmtNum(f.now.credits)} credits.`);
    if (f.launches) lines.push(`${f.launches} rocket${f.launches === 1 ? '' : 's'} launched to Earth.`);
    lines.push(f.selfSuffStreak > 0
      ? `Self-sufficient — power surplus, fed, and net-positive income — for ${f.selfSuffStreak} straight day${f.selfSuffStreak === 1 ? '' : 's'}.`
      : `Not currently self-sufficient: at least one of power, food or the daily books is running a deficit.`);
    const flags = [];
    if (f.now.food < 10) flags.push('food reserve below advisory threshold');
    if (f.now.o2 < 60) flags.push('oxygen reserve low');
    if (f.now.power < 20) flags.push('grid storage low — expect brownouts');
    if (f.pop >= f.housingCap && f.housingCap > 0) flags.push('housing at capacity — zone more ground to keep growing');
    lines.push(flags.length ? `Exceptions: ${flags.join('; ')}.` : `No exceptions to report. Colony nominal.`);
    lines.push(`The colony is presently in lunar ${f.sunlit ? 'day' : 'night'}.`);
    return lines;
  }

  function render(s) {
    const hist = s.history;
    if (!hist || hist.length < 2) {
      return `<div class="dempty">No telemetry yet — the colony files its first report at the end of day two.</div>`;
    }
    const f = facts(s);
    const lines = narrative(s, f);

    const tiles = [
      ['Days run', f.days],
      ['Population', f.pop],
      ['Harvests', f.harvests],
      ['Launches', f.launches],
      ['Self-sufficient streak', f.selfSuffStreak + 'd']
    ].map(([k, v]) => `<div class="dstat"><b>${v}</b><span>${k}</span></div>`).join('');

    return `
      <header class="dhead">
        <div>
          <div class="deyebrow">Shackleton Rim Colony · telemetry</div>
          <h2>Situation report — day ${f.days}</h2>
        </div>
      </header>
      <div class="dstats">${tiles}</div>
      <div class="dnarr">${lines.map(l => `<p>${l}</p>`).join('')}</div>
      <div class="dgridhead">
        <span>Day ${hist[0].d} → ${hist[hist.length - 1].d}</span>
        <span class="dkey"><i class="dnight"></i> lunar night</span>
      </div>
      <div class="dgrid">${PANELS.map(p => panel(hist, p)).join('')}</div>`;
  }

  function wireHover(root, s, tip) {
    const hist = s.history;
    root.querySelectorAll('.dpanel').forEach(fig => {
      const svg = fig.querySelector('svg');
      const p = PANELS.find(x => x.key === fig.dataset.key);
      svg.addEventListener('mousemove', e => {
        const r = svg.getBoundingClientRect();
        const frac = (e.clientX - r.left) / r.width;
        const i = Math.max(0, Math.min(hist.length - 1, Math.round(frac * (hist.length - 1))));
        const h = hist[i];
        const v = p.fmt ? p.fmt(h[p.key] || 0) : fmtNum(h[p.key] || 0);
        tip.innerHTML = `<b>Day ${h.d}</b> · ${p.title}: ${v}${p.unit ? ' ' + p.unit : ''}
          <span class="dtipsun">${h.sun ? 'lunar day' : 'lunar night'}</span>`;
        tip.hidden = false;
        tip.style.left = Math.min(window.innerWidth - 220, e.clientX + 14) + 'px';
        tip.style.top = (e.clientY - 44) + 'px';
      });
      svg.addEventListener('mouseleave', () => { tip.hidden = true; });
    });
  }

  window.LC_DASH = { render, wireHover };
})();
