/* Lunar Farm — the league of past runs.

   There is no server behind this page, so the league lives in this browser's
   localStorage. Export writes a JSON file you can keep, share or merge, and
   import folds someone else's runs back in. */

(function () {
  const S = window.LF_SIM;
  const KEY = 'lunarfarm.league.v1';

  /* Transparent on purpose — the breakdown is shown next to the total. */
  const TERMS = [
    { k: 'days', label: 'Days run', per: 1, get: r => r.days },
    { k: 'nights', label: 'Lunar nights survived', per: 120, get: r => r.nights },
    { k: 'harvests', label: 'Harvests', per: 30, get: r => r.harvests },
    { k: 'variety', label: 'Different crops grown', per: 60, get: r => r.variety },
    { k: 'closure', label: 'Food closure', per: 400, get: r => Math.min(2.5, r.closure) },
    { k: 'tiles', label: 'Tiles under glass', per: 4, get: r => r.tiles },
    { k: 'crew', label: 'Crew supported', per: 80, get: r => r.crew },
    { k: 'reactor', label: 'Fission power commissioned', per: 300, get: r => r.reactor ? 1 : 0 }
  ];

  const scoreOf = r => TERMS.reduce((a, t) => a + t.per * t.get(r), 0);

  function record(s, ended) {
    return {
      id: 's' + s.day + '-' + s.stats.harvests + '-' + Math.round(s.stats.totalGrown || 0),
      day: new Date().toISOString().slice(0, 10),
      days: s.day,
      nights: s.stats.nightsSurvived,
      harvests: s.stats.harvests,
      variety: Object.keys(s.stats.kinds).length,
      closure: Math.round((s.stats.lastClosure || 0) * 100) / 100,
      tiles: S.totalTiles(s),
      crew: s.crew,
      credits: Math.round(s.credits),
      science: s.science,
      reactor: S.count(s, 'reactor') > 0,
      auto: !!s.auto,
      sandbox: !!s.sandbox,
      ending: ended || (s.over ? s.over : 'Filed while still running'),
      grown: Math.round(s.stats.totalGrown || 0)
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
      game: 'Lunar Farm', station: 'Marius Hills Skylight Station',
      exported: new Date().toISOString(), runs: rows
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lunar-farm-league-${new Date().toISOString().slice(0, 10)}.json`;
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

  /* ---------- rendering ---------- */

  function breakdown(r) {
    return TERMS.map(t => {
      const v = t.get(r);
      const pts = Math.round(t.per * v);
      const shown = t.k === 'closure' ? Math.round(v * 100) + '%' : (t.k === 'reactor' ? (v ? 'yes' : 'no') : v);
      return `<div class="lrow"><span>${t.label}</span><span class="lv">${shown}</span><span class="lp">${pts.toLocaleString()}</span></div>`;
    }).join('');
  }

  function render(justFiled) {
    const rows = load();
    const mine = justFiled ? justFiled.id + ':' + justFiled.days : null;

    const table = rows.length ? `
      <table class="ltable">
        <thead><tr>
          <th>#</th><th>Score</th><th>Days</th><th>Nights</th><th>Harvests</th>
          <th>Crops</th><th>Closure</th><th>Tiles</th><th>Crew</th><th>Filed</th><th>Mode</th>
        </tr></thead>
        <tbody>
          ${rows.slice(0, 40).map((r, i) => `
            <tr class="${mine && (r.id + ':' + r.days) === mine ? 'lmine' : ''}">
              <td>${i + 1}</td>
              <td class="lscore">${(r.score || Math.round(scoreOf(r))).toLocaleString()}</td>
              <td>${r.days}</td><td>${r.nights}</td><td>${r.harvests}</td>
              <td>${r.variety}</td><td>${Math.round(r.closure * 100)}%</td>
              <td>${r.tiles}</td><td>${r.crew}</td>
              <td class="ldim">${r.day}</td>
              <td class="ldim">${r.sandbox ? 'sandbox' : r.auto ? 'auto' : 'manual'}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : `<div class="dempty">No runs filed yet. Finish a run — or file this one — and it lands here.</div>`;

    return `
      <header class="dhead">
        <div>
          <div class="deyebrow">Marius Hills · station records</div>
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

  window.LF_LEAGUE = { render, file, exportRuns, importRuns, load, clear, scoreOf, record };
})();
