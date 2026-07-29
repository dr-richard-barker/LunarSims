/* Lunar Farm — the report dashboard.

   Small multiples, one metric per panel. Every panel is a single series, so
   identity is carried by the panel title rather than by hue, and one ink colour
   is used throughout; the only other fill is the recessive band marking the
   lunar night. Values come straight from s.history — nothing here is invented. */

(function () {
  const S = window.LF_SIM;

  const INK = '#8ab4ff';        // the one series colour
  const GOOD = '#6ee7a0';
  const WARN = '#ffc46b';
  const BAD = '#ff7a68';

  const PANELS = [
    { key: 'food', title: 'Food reserve', unit: 'days',
      good: v => v >= 20, warn: v => v >= 8 },
    { key: 'closure', title: 'Food closure (mission to date)', unit: '× crew need',
      good: v => v >= 1, warn: v => v >= 0.5, fmt: v => v.toFixed(2) },
    { key: 'o2', title: 'Oxygen store', unit: 'kg',
      good: v => v >= 120, warn: v => v >= 60 },
    { key: 'co2', title: 'Carbon dioxide buffer', unit: 'kg',
      good: v => v >= 55, warn: v => v >= 20 },
    { key: 'water', title: 'Water in the loop', unit: 'L',
      good: v => v >= 400, warn: v => v >= 150 },
    { key: 'power', title: 'Stored energy', unit: 'kWh',
      good: v => v >= 60, warn: v => v >= 20 },
    { key: 'tiles', title: 'Ground under glass', unit: 'tiles',
      good: () => true, warn: () => true },
    { key: 'credits', title: 'Credits', unit: '',
      good: v => v >= 4000, warn: v => v >= 800 }
  ];

  const fmtNum = v => Math.round(v).toLocaleString();

  /* ---------- one panel ---------- */

  function panel(hist, p) {
    const W = 300, H = 104, PADL = 4, PADR = 4, PADT = 12, PADB = 16;
    const vals = hist.map(h => h[p.key]);
    const last = vals[vals.length - 1];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = (hi - lo) || Math.max(1, Math.abs(hi) * 0.1);
    const y0 = lo - span * 0.12, y1 = hi + span * 0.12;
    const x = i => PADL + (i / Math.max(1, hist.length - 1)) * (W - PADL - PADR);
    const y = v => PADT + (1 - (v - y0) / (y1 - y0)) * (H - PADT - PADB);

    /* bands for the lunar night — recessive, behind everything */
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

    const line = hist.map((h, i) => `${x(i).toFixed(1)},${y(h[p.key]).toFixed(1)}`).join(' ');
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
          <polygon points="${areaPts}" fill="rgba(138,180,255,0.13)"/>
          <polyline points="${line}" fill="none" stroke="${INK}" stroke-width="2"
                    stroke-linejoin="round" stroke-linecap="round"/>
          <circle cx="${x(hist.length - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="3.5"
                  fill="${status}" stroke="#11141c" stroke-width="2"/>
          <rect class="dhit" x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
        </svg>
        <div class="dscale"><span>${p.fmt ? p.fmt(lo) : fmtNum(lo)}</span><span>${p.fmt ? p.fmt(hi) : fmtNum(hi)}</span></div>
      </figure>`;
  }

  /* ---------- the narrative ---------- */

  function facts(s) {
    const h = s.history;
    const now = h[h.length - 1];
    const back = h[Math.max(0, h.length - 31)];
    const closure = s.stats.lastClosure;
    const foodTrend = now.food - back.food;
    const shedding = s.wantFields > 0 && s.litFields < s.wantFields;
    const unserviced = s.fields.filter(f => !f.serviced).length;
    const infected = s.fields.filter(f => f.infected).length;
    const growing = [...new Set(S.planted(s).map(f => S.cropById(f.crop).name))];
    return { now, closure, foodTrend, shedding, unserviced, infected, growing,
             days: s.day, harvests: s.stats.harvests, nights: s.stats.nightsSurvived,
             crew: s.crew, tiles: S.totalTiles(s), morale: Math.round(s.morale),
             sunlit: S.isSunlit(s) };
  }

  function earthVoice(s, f) {
    const lines = [];
    lines.push(`Reporting day ${f.days} of continuous operation. Crew of ${f.crew} aboard, ${f.tiles} tiles under glass across ${s.fields.length} hall${s.fields.length === 1 ? '' : 's'}.`);
    lines.push(`Food closure to date measured at ${Math.round(f.closure * 100)} per cent of crew requirement; stores stand at ${f.now.food.toFixed(1)} days of reserve and are ${f.foodTrend >= 0 ? 'accumulating' : 'drawing down'}.`);
    lines.push(`Atmospheric reserves: oxygen ${fmtNum(f.now.o2)} kg, carbon dioxide ${fmtNum(f.now.co2)} kg. Water inventory ${fmtNum(f.now.water)} L. ${f.harvests} harvest${f.harvests === 1 ? '' : 's'} logged to date across ${f.nights} completed lunar night${f.nights === 1 ? '' : 's'}.`);
    if (f.growing.length) lines.push(`Crops presently under cultivation: ${f.growing.join(', ')}.`);
    const flags = [];
    if (f.shedding) flags.push(`grow lighting is load-shed to ${s.litFields} of ${s.wantFields} halls`);
    if (f.now.o2 < 90) flags.push('oxygen reserve below advisory threshold');
    if (f.now.co2 < 25) flags.push('carbon buffer depleted; canopy productivity limited');
    if (f.now.water < 180) flags.push('water inventory low');
    if (f.unserviced) flags.push(`${f.unserviced} hall${f.unserviced === 1 ? '' : 's'} off the track network`);
    if (f.morale < 50) flags.push('crew morale below advisory level; diet variety is the usual cause');
    if (f.infected) flags.push(`fungal contamination in ${f.infected} hall${f.infected === 1 ? '' : 's'}`);
    lines.push(flags.length
      ? `Exceptions requiring attention: ${flags.join('; ')}.`
      : `No exceptions to report. Station nominal.`);
    lines.push(`Crew morale index ${f.morale}. Station is presently in lunar ${f.sunlit ? 'day' : 'night'}. Ends.`);
    return lines;
  }

  function settlerVoice(s, f) {
    const lines = [];
    lines.push(`Day ${f.days} at the farm. There are ${f.crew} of us, working ${f.tiles} tiles across ${s.fields.length} hall${s.fields.length === 1 ? '' : 's'}.`);
    lines.push(f.closure >= 1
      ? `We are growing about ${Math.round(f.closure * 100)} per cent of what we eat — the farm is feeding itself and then some. The pantry holds ${f.now.food.toFixed(1)} days and is ${f.foodTrend >= 0 ? 'still filling' : 'going down'}.`
      : `We are growing about ${Math.round(f.closure * 100)} per cent of what we eat, so the rest still comes up from Earth. The pantry holds ${f.now.food.toFixed(1)} days and is ${f.foodTrend >= 0 ? 'filling again' : 'going down'}.`);
    lines.push(`There is ${fmtNum(f.now.o2)} kg of oxygen banked and ${fmtNum(f.now.co2)} kg of carbon dioxide for the plants to breathe, with ${fmtNum(f.now.water)} litres in the loop. We have brought in ${f.harvests} harvest${f.harvests === 1 ? '' : 's'} and come through ${f.nights} long night${f.nights === 1 ? '' : 's'}.`);
    if (f.growing.length) lines.push(`Growing right now: ${f.growing.join(', ')}.`);
    const worries = [];
    if (f.shedding) worries.push(`the lamps are off in some halls to save power — ${s.litFields} of ${s.wantFields} are lit`);
    if (f.now.o2 < 90) worries.push('the oxygen bank is lower than we would like');
    if (f.now.co2 < 25) worries.push('the plants are short of carbon dioxide and growing slowly');
    if (f.now.water < 180) worries.push('water is tight');
    if (f.unserviced) worries.push(`${f.unserviced} hall${f.unserviced === 1 ? ' is' : 's are'} still off the track, so nobody can service ${f.unserviced === 1 ? 'it' : 'them'} properly`);
    if (f.morale < 50) worries.push('morale is low — we have been eating the same thing for a long time');
    if (f.infected) worries.push(`there is fungus in ${f.infected} hall${f.infected === 1 ? '' : 's'}`);
    lines.push(worries.length
      ? `Things we are watching: ${worries.join('; ')}.`
      : `Nothing is going wrong today, which is worth saying out loud.`);
    lines.push(`Spirits are ${f.morale >= 70 ? 'good' : f.morale >= 50 ? 'holding up' : 'low'}. ${f.sunlit ? 'The sun is up.' : 'It is night outside, and will be for a while yet.'}`);
    return lines;
  }

  /* ---------- render ---------- */

  function render(s, audience) {
    const hist = s.history;
    if (!hist || hist.length < 2) {
      return `<div class="dempty">No telemetry yet — the farm files its first report at the end of day two.</div>`;
    }
    const f = facts(s);
    const toEarth = audience === 'earth';
    const lines = toEarth ? earthVoice(s, f) : settlerVoice(s, f);

    const tiles = [
      ['Days run', f.days],
      ['Harvests', f.harvests],
      ['Lunar nights', f.nights],
      ['Closure', Math.round(f.closure * 100) + '%']
    ].map(([k, v]) => `<div class="dstat"><b>${v}</b><span>${k}</span></div>`).join('');

    return `
      <header class="dhead">
        <div>
          <div class="deyebrow">${toEarth ? 'Marius Hills Agricultural Station · telemetry downlink'
                                          : 'Marius Hills · word from the farm'}</div>
          <h2>${toEarth ? `Situation report — day ${f.days}` : `How the farm is doing`}</h2>
          <div class="dto">${toEarth ? 'To: Earth Operations' : 'To: everyone at Marius Hills'}</div>
        </div>
        <button id="dAudience" class="daud">${toEarth ? 'Read as a note to the settlers' : 'Read as a report to Earth'}</button>
      </header>

      <div class="dstats">${tiles}</div>
      <div class="dnarr">${lines.map(l => `<p>${l}</p>`).join('')}</div>

      <div class="dgridhead">
        <span>Day ${hist[0].d} → ${hist[hist.length - 1].d}</span>
        <span class="dkey"><i class="dnight"></i> lunar night</span>
      </div>
      <div class="dgrid">${PANELS.map(p => panel(hist, p)).join('')}</div>`;
  }

  /* Hover readout: nearest sample under the pointer, shared tooltip. */
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
        const v = p.fmt ? p.fmt(h[p.key]) : fmtNum(h[p.key]);
        tip.innerHTML = `<b>Day ${h.d}</b> · ${p.title}: ${v}${p.unit ? ' ' + p.unit : ''}
          <span class="dtipsun">${h.sun ? 'lunar day' : 'lunar night'}</span>`;
        tip.hidden = false;
        tip.style.left = Math.min(window.innerWidth - 220, e.clientX + 14) + 'px';
        tip.style.top = (e.clientY - 44) + 'px';
      });
      svg.addEventListener('mouseleave', () => { tip.hidden = true; });
    });
  }

  window.LF_DASH = { render, wireHover };
})();
