/* Artemis City — the league of past runs.
   Same shape as Lunar Farm's league.js: no server, localStorage only,
   export/import as a portable JSON file. */

(function () {
  const S = window.LC_SIM, D = window.LC_DATA;
  const KEY = 'artemis-city.league.v1';

  const TERMS = [
    { k: 'days', label: 'Days run', per: 1, get: r => r.days },
    { k: 'pop', label: 'Peak population', per: 40, get: r => r.pop },
    { k: 'housingCap', label: 'Housing capacity built', per: 5, get: r => r.housingCap },
    { k: 'harvests', label: 'Harvests', per: 25, get: r => r.harvests },
    { k: 'launches', label: 'Rockets launched', per: 250, get: r => r.launches },
    { k: 'developed', label: 'Developed zone tiles', per: 15, get: r => r.developed },
    { k: 'milestones', label: 'Charter milestones', per: 60, get: r => r.milestones },
    { k: 'credits', label: 'Credits', per: 0.02, get: r => Math.max(0, r.credits) }
  ];

  const scoreOf = r => TERMS.reduce((a, t) => a + t.per * t.get(r), 0);

  function record(s, ended) {
    const developed = s.map.filter(t => t.zone && t.zone.stage > 0).length;
    return {
      id: 's' + s.day + '-' + s.stats.harvests + '-' + Math.round(s.credits),
      day: new Date().toISOString().slice(0, 10),
      days: s.day,
      pop: s.pop,
      housingCap: s.housingCap,
      jobs: s.jobs || 0,
      harvests: s.stats.harvests,
      launches: s.stats.launches || 0,
      developed,
      milestones: Object.keys(s.done).length,
      credits: Math.round(s.credits),
      science: s.science,
      auto: !!(s.autoCity || s.autoExpand),
      sandbox: !!s.sandbox,
      ending: ended || (s.over ? s.over : 'Filed while still running')
    };
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (err) { return []; }
  }
  function save(rows) {
    try { localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 200))); return true; }
    catch (err) { return false; }
  }

  function file(s, ended) {
    const r = record(s, ended);
    r.score = Math.round(scoreOf(r));
    const rows = load();
    if (rows.some(x => x.id === r.id && x.days === r.days)) return { r, added: false, rows };
    rows.push(r);
    rows.sort((a, b) => b.score - a.score);
    save(rows);
    return { r, added: true, rows };
  }

  function exportRuns() {
    const rows = load();
    const blob = new Blob([JSON.stringify({
      game: 'Artemis City', station: 'Shackleton Rim Colony',
      exported: new Date().toISOString(), runs: rows
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `artemis-city-league-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return rows.length;
  }

  function importRuns(text) {
    let incoming;
    try { incoming = JSON.parse(text); } catch (err) { return 'That file is not readable JSON.'; }
    const runs = Array.isArray(incoming) ? incoming : incoming.runs;
    if (!Array.isArray(runs)) return 'No runs found in that file.';
    const rows = load();
    const seen = new Set(rows.map(r => r.id + ':' + r.days));
    let added = 0;
    for (const r of runs) {
      if (!r || typeof r.days !== 'number') continue;
      const key = r.id + ':' + r.days;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...r, score: Math.round(scoreOf(r)) });
      added++;
    }
    rows.sort((a, b) => b.score - a.score);
    save(rows);
    return added;
  }

  function clear() { try { localStorage.removeItem(KEY); } catch (err) {} }

  function breakdown(r) {
    return TERMS.map(t => {
      const v = t.get(r);
      const pts = Math.round(t.per * v);
      return `<div class="lrow"><span>${t.label}</span><span class="lv">${v.toLocaleString ? v.toLocaleString() : v}</span><span class="lp">${pts.toLocaleString()}</span></div>`;
    }).join('');
  }

  function render(justFiled) {
    const rows = load();
    const mine = justFiled ? justFiled.id + ':' + justFiled.days : null;

    const table = rows.length ? `
      <table class="ltable">
        <thead><tr>
          <th>#</th><th>Score</th><th>Days</th><th>Pop</th><th>Harvests</th>
          <th>Launches</th><th>Developed</th><th>Milestones</th><th>Filed</th><th>Mode</th>
        </tr></thead>
        <tbody>
          ${rows.slice(0, 40).map((r, i) => `
            <tr class="${mine && (r.id + ':' + r.days) === mine ? 'lmine' : ''}">
              <td>${i + 1}</td>
              <td class="lscore">${(r.score || Math.round(scoreOf(r))).toLocaleString()}</td>
              <td>${r.days}</td><td>${r.pop}</td><td>${r.harvests}</td>
              <td>${r.launches}</td><td>${r.developed}</td><td>${r.milestones}</td>
              <td class="ldim">${r.day}</td>
              <td class="ldim">${r.sandbox ? 'sandbox' : r.auto ? 'auto' : 'manual'}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : `<div class="dempty">No runs filed yet. Finish a run — or file this one — and it lands here.</div>`;

    return `
      <header class="dhead">
        <div>
          <div class="deyebrow">Shackleton Rim · colony records</div>
          <h2>League of past runs</h2>
          <div class="dto">${rows.length} run${rows.length === 1 ? '' : 's'} on file in this browser</div>
        </div>
        <div class="lbtns">
          <button id="lFile" class="daud">File this run</button>
          <button id="lExport" class="daud">Export JSON</button>
          <button id="lImport" class="daud">Import</button>
        </div>
      </header>

      ${justFiled ? `
        <div class="lfiled">
          <div class="lfscore"><b>${(justFiled.score).toLocaleString()}</b><span>score</span></div>
          <div class="lfbreak">${breakdown(justFiled)}</div>
        </div>` : ''}

      <div class="ltablewrap">${table}</div>
      <p class="lfoot">The league is stored in this browser only — there is no server behind this page.
        Export writes a JSON file you can keep or pass on; import merges someone else's file into yours.</p>
      <input type="file" id="lFileInput" accept="application/json,.json" hidden>`;
  }

  window.LC_LEAGUE = { render, file, exportRuns, importRuns, load, clear, scoreOf, record };
})();
