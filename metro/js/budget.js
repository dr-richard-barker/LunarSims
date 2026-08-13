/* Lunar Metropolis — taxation and departmental funding.

   The management loop. A single tax rate sets how much of the city's
   economic activity the treasury takes; five departmental dials set how much
   it spends keeping the place running. Every dial has a real effect on the
   simulation — none of them are decorative.

   The tension is deliberately two-sided: raising tax funds the departments
   but suppresses demand, so a city taxed at 20% is rich, well maintained and
   stops growing. Nothing here can end the run. Running the treasury negative
   degrades every service to half effect until it recovers, which stalls a
   city and can shrink it, but is always something the player can build and
   tax their way back out of. No DOM references. */

(function () {
  const { K, DEPARTMENTS } = window.LM_DATA;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const deptById = id => DEPARTMENTS.find(d => d.id === id);

  /* Default state, merged into a new game. Departments start fully funded —
     a new player should see a working city, then discover the dials. */
  function initial() {
    const funding = {};
    for (const d of DEPARTMENTS) funding[d.id] = 1;
    return { taxRate: K.BASE_TAX, funding, research: 0 };
  }

  /* How much upkeep each department is responsible for. These are the counts
     the daily bill is charged against, so a department's cost scales with the
     infrastructure it actually maintains rather than being a flat fee. */
  function counts(s) {
    let gens = 0, conduits = 0, plants = 0, mains = 0, tubes = 0, developed = 0;
    for (const t of s.map) {
      if (t.pipe) mains++;
      if (t.b) {
        const ty = t.b.type;
        if (ty === 'solar' || ty === 'reactor') gens++;
        else if (ty === 'conduit') conduits++;
        else if (ty === 'o2') plants++;
        else if (ty === 'tube') tubes++;
      }
      if (t.zone && t.zone.stage > 0) developed++;
    }
    return {
      power: gens * 4 + conduits,
      /* A buried main is a sealed pipe with no moving parts, so it bills at
         a fraction of what a plant does. Charging both at full rate made
         atmosphere cost several times the grid purely because players quite
         reasonably run mains under everything. */
      air: plants * 8 + mains * 0.35,
      transit: tubes,
      safety: developed,
      science: developed + 8        // a small standing research base
    };
  }

  /* Daily cost of every department at its current dial setting. */
  function expenses(s) {
    const c = counts(s);
    const out = { total: 0, byDept: {} };
    for (const d of DEPARTMENTS) {
      const cost = (s.funding[d.id] ?? 1) * d.rate * c[d.id];
      out.byDept[d.id] = cost;
      out.total += cost;
    }
    return out;
  }

  /* Taxable activity, and what the treasury takes from it. Trade and industry
     contribute the income figure from their stage table; residents are
     taxable too, per head, so a hab-heavy city still funds itself. */
  function revenue(s, tally) {
    const base = tally.income + tally.housingCap * K.HAB_TAX_PER_HEAD;
    return { base, taken: base * (s.taxRate / K.BASE_TAX) };
  }

  /* Effective funding for a department. A treasury in deficit cannot pay its
     bills in full, so everything runs at reduced effect until it recovers —
     the "bankruptcy degrades services" rule, with no game over attached. */
  function effFunding(s, id) {
    const f = clamp(s.funding[id] ?? 1, 0, 1);
    return s.credits < 0 ? f * K.BROKE_FUNDING : f;
  }

  /* Everything the simulation needs from the budget, in one call. */
  function effects(s) {
    return {
      /* a starved grid delivers less than its rated output */
      genMul: 0.55 + 0.45 * effFunding(s, 'power'),
      /* and starved plants pressurise fewer people than their rating */
      airMul: 0.55 + 0.45 * effFunding(s, 'air'),
      /* tube access is worth less when the tubes are barely maintained */
      transitMul: 0.40 + 0.60 * effFunding(s, 'transit'),
      /* below this, a maintenance backlog starts eating developed density */
      safety: effFunding(s, 'safety'),
      /* research accrues per developed tile per day */
      sciencePerDay: effFunding(s, 'science') * 0.05,
      broke: s.credits < 0,
      /* high tax funds the city but suppresses every demand index */
      taxBite: (s.taxRate - K.BASE_TAX) * K.TAX_DEMAND_BITE
    };
  }

  /* A 30-day projection, for the budget panel. Purely a readout — the
     simulation itself settles daily so the treasury is never surprised by a
     lump sum it cannot pay. */
  function monthly(s, tally) {
    const rev = revenue(s, tally);
    const exp = expenses(s);
    return {
      revenue: rev.taken * 30,
      expenses: exp.total * 30,
      net: (rev.taken - exp.total) * 30,
      byDept: Object.fromEntries(DEPARTMENTS.map(d => [d.id, exp.byDept[d.id] * 30])),
      taxBase: rev.base
    };
  }

  window.LM_BUDGET = { initial, counts, expenses, revenue, effects, monthly, effFunding, deptById };
})();
