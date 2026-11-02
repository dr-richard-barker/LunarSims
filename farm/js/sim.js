/* Lunar Farm — simulation.
   The farm is a tile map of lunar surface. Grow halls are dragged out as
   rectangles of any size and hold one crop each; everything else is a single
   tile structure. One tick is one hour of station time. */

(function () {
  const { K, CROPS, TRAITS, GMO, UPGRADES, BUILDINGS, EVENTS, MILESTONES, TANKS, STUDIES, FIELD_NOTES } = window.LF_DATA;

  /* Rates below are PER TILE of grow hall. One tile is a multi-tier rack of
     roughly 20 m2 of growing area. */
  const KCAL_SCALE = 9;
  const VALUE_SCALE = 3;
  const RTG_KW = 2.6;              // legacy radioisotope unit, always on
  const REACTOR_KW = 9.0;
  const ARRAY_KW = 2.5;
  const BATTERY_KWH = 60;
  const BASE_KWH = 60;
  const O2_PER_LIT_HOUR = 0.010;   // kg per tile-hour at crop.o2 = 1
  const CO2_PER_O2 = 1.375;        // mass ratio in photosynthesis
  const WATER_PER_TILE = 0.25;     // scales crop.water down to a per-tile draw
  const BASE_RECOVERY = 0.80;
  /* The farm serves the wider station, and the station's waste stream comes back
     to it as carbon. Without this the loop can only run down, because most of the
     carbon a surplus farm fixes leaves inside the food it exports. */
  const STATION_CO2 = 3.0;         // kg per day
  const UNSERVICED_PENALTY = 0.72; // growth factor for a hall with no track to the hab
  const RAIL_BONUS = 1.10;         // a hall on the rail head ships out by wagon
  const RAW_SOIL = 0.62;           // growth factor in unconditioned regolith
  const SOIL_PER_LIT_HOUR = 0.00004;
  const MAX_FIELD = 8;             // longest side you may drag

  /* Residue is the half of every harvest nobody can eat: straw, stover, roots and
     leaf trash. Photosynthetic crops leave it behind; the fungal and microbial
     cultures live on it. */
  const RESIDUE_PER_TILE = 2.2;

  /* ---------- the recycling compartments ----------

     Rates below are taken from the Lunar Palace 1 ("Yuegong-1") 105-day multi-crew
     closed bioregenerative run of February–May 2014, which is the only integrated
     experiment of its kind with published element budgets:

       Li et al. 2015, Life Sci Space Res 7:9-14   doi:10.1016/j.lssr.2015.08.002
         Tenebrio molitor: 8.13% of feed recovered as larval mass, 78.43% as frass,
         eight essential amino acids 41.30% of total. Larvae reared inside the
         closed system grew measurably slower than the open-air controls.
       Fu et al. 2016, Astrobiology 16(12):925-936 doi:10.1089/ast.2016.1477
         21 plant species coexisting, 20.5% nitrogen recovered from urine,
         41% solid waste degraded, 55% of the food regenerated.
       Dong et al. 2017, Astrobiology 17(1):78-86 doi:10.1089/ast.2016.1466
         247 g/d carbon imported inside stored food; >99% of water lost through
         leaf transpiration; 20.5% of nitrogen reused, 5.35 g/d to the solution.

     The ratios are theirs. The throughputs are scaled for play — a farm here is
     not three volunteers in a Beijing basement. */
  const WASTE_PER_CREW = 1.1;      // units a crew member sheds per day
  const WORM_FEED = 0.9;           // residue one mealworm tier eats per day
  const WORM_BIOCONV = 0.0813;     // Li et al. — feed to larval mass
  const WORM_FRASS = 0.7843;       // Li et al. — feed excreted as frass
  const WORM_KCAL = 16000;         // kcal per unit of larval mass, scaled for play
  const WORM_SLOWDOWN = 0.86;      // closed-system rearing is slower than open air
  const NITRO_FEED = 4.0;          // waste one bioreactor can oxidise per day
  const NITRO_RECOVERY = 0.205;    // Fu et al. — nitrogen recovered from urine
  const DIGEST_FEED = 3.2;         // residue + waste one digester takes per day
  const DIGEST_DEGRADE = 0.41;     // Fu et al. — solid waste degraded
  const REEF_KW = 0.6;
  const REEF_CARBONATE = 0.7;      // units of aragonite laid down per day

  /* What the station pays the farm. Selling food and oxygen was the only income
     the farm had; neither pays it for closing a loop, which is why every
     recycling compartment used to be a pure cost. */
  const SERVICE_RATE = 62;         // credits per crew per day at full life support
  const WASTE_FEE = 34;            // credits per unit of station waste processed

  /* The studio. Audience is the stock, revenue is the flow off it, and novelty is
     what stops a monoculture farming the camera as easily as it farms potatoes. */
  const AUD_PER_SEGMENT = 44;      // audience gained by one aired segment at full novelty
  const AUD_DECAY = 0.986;         // per day, so silence costs you the audience
  const AUD_CAP = 2400;
  const MEDIA_RATE = 0.75;         // credits per head of audience per day
  const SEGMENT_FEE = 210;         // paid on delivery of a segment, novelty-weighted
  const FEE_FLOOR = 0.22;          // a tired subject still gets a broadcast fee
  const NOVELTY_SPEND = 0.34;      // what a subject's novelty falls to when it airs
  const NOVELTY_RECOVER = 0.045;   // per day back toward 1
  const NOVELTY_FLOOR = 0.07;
  const SEGMENTS_PER_DAY = 2;

  /* ---------- light ----------

     Lamp settings and the shape of the light response come from the EDEN ISS
     Mobile Test Facility at Neumayer III, Antarctica, 7 Feb – 20 Nov 2018:

       Zabel et al. 2020, Front Plant Sci 11:656  doi:10.3389/fpls.2020.00656
       NASA OSDR OSD-895 (the per-crop protocols and harvest summaries)

     Lamps ran 15 h at full output with a 1 h half-power ramp either side — call
     it 16 h — at 330 µmol/m²/s for the leafy crops and 600 for radish and a
     high-light arugula trial. That trial is the calibration: 1.82× the light
     gave +50% fresh mass per day (126.0 -> 189.3 g/m²/d) but 17% less per mole
     of light (6.63 -> 5.48 g/mol). A saturating curve through both points,

       G = (1 - e^(-DLI/k)) / (1 - e^(-DLI_STD/k)),   k = 2.098 × crop.dli

     gives k = 35.67 for arugula (dli 17) and reproduces both figures; it is
     exactly 1 at Standard light and 16 h, so nothing changes until you touch a
     lamp. One crop, two points: the curve's shape and its scaling to every
     other crop's dli are assumptions. The ratios are theirs. The throughputs
     are scaled for play. */
  const PPFD = { low: 200, std: 330, high: 600 };   // µmol/m²/s; 200 is BVAD's floor for lettuce
  const DLI_PER_PPFD_HOUR = 0.0036;                  // µmol/m²/s × 3600 s ÷ 1e6
  const DLI_STD = PPFD.std * 16 * DLI_PER_PPFD_HOUR; // 19.008 mol/m²/d
  const LIGHT_K_PER_DLI = 2.098;
  const LED_EFFICACY = 3.0;        // µmol/J for a modern horticultural LED — display only
  const TILE_M2 = 20;              // growing area in one tile of racks
  /* A cut-and-come-again crop skips re-establishment, so a picking regrows a
     little faster than its share of a full cycle would suggest. */
  const SPREAD_BONUS = 1.1;

  /* ---------- greenhouse climate ----------

     EDEN ISS ran one shared climate for every crop: 21 °C under the lamps, 19 °C
     in the dark, 65% relative humidity, 1000 ppm CO₂ (Zabel et al. 2020, as
     above). It did not hold it. Through the Antarctic winter the nights fell to
     about 16 °C, humidity sat at up to 86% for hours at a time from April to
     July, and with no CO₂ removal the operator's own breathing kept the air at
     2000–4000 ppm. Those three excursions are the three dials here.

     The rest is sourced from this group's own modelling:
       Habitat_model — a 63.1 m³ module, 0.69 g CO₂ per crew-minute: with the
         ventilation off, two crew take it to 5000 ppm in 6.3 h, six in 2.1 h.
       Photorespiration_multiomics_microgravity — at 3500 ppm (ISS-cabin air)
         photorespiration falls to 2.6% of fixation, a twelve-fold drop. The
         +11% growth that implies at 3500 ppm is our inference (photorespiration
         taken as proportional to 1/ppm), not a measured yield.
       LunarLeaf-CFD — still air at 1/6 g leaves a leaf 71% of its Earth
         boundary-layer conductance, a dense canopy far less; fans at 2–6.5 cm/s
         restore it. A sealed, lit chamber draws its CO₂ to nothing in seven
         minutes and fixes about 1% of normal carbon. The enclosure effect is
         some 25 times the gravity effect: on the Moon, ventilation matters
         far more than gravity does.

     The setpoints and excursions are theirs. Heat-rejection sizing, the
     humidity gain, the infection odds and the fan penalty are scaled for play.
     Every factor is exactly 1 at the defaults. */
  const T_DAY = 21, T_NIGHT = 19;
  const CO2_SET = 1000;            // ppm, EDEN ISS's setpoint
  const CO2_KNEE = 14;             // kg of store per 1000 ppm in the halls
  const HEAT_REJECT = 1.5;         // radiator capacity, × the Standard lamp load
  const NOON_DERATE = 0.3;         // radiators see a hot sky at lunar noon
  const RADIATOR_STEP = 0.4;       // per Radiator Wings fitted
  const OVERHEAT_GAIN = 12;        // °C per unit of heat beyond capacity
  const COLD_SAG = 5;              // °C lost on a lunar night with the lamps shed
  const COLD_SHARE = 0.3;          // lamp load that keeps a night hall warm
  const DEHUM_PER_TILE = 4.16;     // condensing capacity, in crop-water units
  const RH_GAIN = 30;              // %RH per unit of transpiration beyond capacity
  const RH_RISK = 80;              // %RH above which mould gets going
  const RH_INFECT = 0.12;          // daily infection odds per hall, at a full day above it
  const ENRICH_MAX = 0.12, ENRICH_SCALE = 900;
  const ENRICH_LOSS = 0.08;        // kg CO₂ per tile-day vented, per 1000 ppm of enrichment
  const CREW_PPM_LIMIT = 2500;     // morale cost above this (a game choice)
  const CREW_PPM_SMAC = 5000;      // and a heavier one above this
  const CREW_PPM_RATE = 358;       // ppm per crew-hour in Habitat_model's 63.1 m³ module
  const HALL_M3_PER_TILE = 30;
  const FAN_KW = 0.006;            // per tile
  const STILL_FREE_TILES = 12;     // a hall this size mixes itself
  const STILL_MAX = 0.20;          // the still-air loss in an eight-by-eight hall
  const DEHUM_KW = 0.01;           // per tile, while boosted
  const CO2_SETTINGS = [1000, 2000, 3500];

  /* ---------- roots ----------

     Regolith: Paul et al. 2022, Commun Biol 5:382 (Arabidopsis in Apollo 11, 12
     and 17 soil against JSC-1A simulant; NASA OSDR OSD-476). Leaves initiated at
     0.21, 0.43 and 0.37 a day against 0.66 in simulant, and rosettes reached 0.84,
     5.30 and 5.98 mm² against 45.9. The farm's raw-bed growth factor, RAW_SOIL,
     already sits on the Apollo 12/17 leaf-rate mean (0.61). The more weathered
     the soil, the worse it grew — Apollo 11's mature regolith worst of all — so
     the freshly broken ejecta on a crater rim counts as immature, and kinder.
     The first-crop yield floors stand in for the stunted rosettes, scaled for
     play: n = 4 plants of one species in a gram of soil each.

     Sintered and aeroponic beds are encoded qualitatively, from the points our
     own regolith review anchors to the Apollo work: fired regolith keeps 25–30%
     air-filled porosity where raw keeps under 12%, sits at pH 5.8–6.2 where raw
     runs at 9–11, and comes out of a 500 °C kiln sterile.

     Tanks: EDEN ISS, as above. Two solutions, EC 2.21 ± 0.13 and 3.49 ± 0.17
     mS/cm, pH 6.06 ± 0.18 and 5.91 ± 0.12, held with 1.25% nitric acid and 1%
     potassium hydroxide, replaced about every three months (leafy) and two
     (fruit). EC here creeps to the edge of its band over exactly that interval;
     the creep rate, the pH drift and the dosing cost are scaled for play.

     Nursery: EDEN ISS raised every seedling 10–20 days in 2×2×4 cm rockwool at
     20 °C germination before transplanting it into the racks. */
  const RAW_SOIL_IMMATURE = 0.65;  // crater-rim ejecta, the Apollo 12 end of the range
  const YIELD_FLOOR = 0.35;        // first-crop yield in raw, mature regolith
  const YIELD_FLOOR_IMMATURE = 0.45;
  const SOIL_FULL_YIELD = 0.6;     // beds this worked yield in full
  const SINTER_FLOOR = 0.92, SINTER_CR = 260, SINTER_KWH = 3;
  const AERO_GROWTH = 1.08, AERO_CR = 380, AERO_KW = 0.008;
  const STRIP_CR = 60;
  const EXPOSURE = { aero: 1, sintered: 0.6, regolith: 0.3 };   // how much tank chemistry reaches the roots
  const BAND_EC = 0.3, BAND_PH = 0.3;
  const PH_DRIFT = 0.008;          // per lit hour, nitrate uptake pushing pH up
  const PH_ALK = 0.02;             // more, per unit of raw regolith on the tank
  const DOSE_N = 5;                // nutrients spent per pH unit of acid dosed
  const TANK_L = 6, TANK_N = 2;    // water and stock per served tile to refill a tank
  const TANK_ROOM_KW = 0.15;
  const NURSERY_TILES = 12, NURSERY_DAYS = 14, NURSERY_HEAD_MAX = 0.4, NURSERY_KW = 0.2;

  /* ---------- radiation ----------

     Plant_response_to_radiation (this group: 299 Arabidopsis samples from ten
     NASA OSDR studies). The response runs in three phases — recognition in the
     first two hours, a crisis at 2–6 h, recovery within the day — on a composite
     resilience index of 0.79, 0.79, 0.68, 0.75 and 0.78 across 0–0.5, 0.5–2,
     2–6, 6–12 and 12–30 h. At the 2–6 h nadir cosmic-ray samples read 0.56,
     gamma 0.81 and low-orbit spaceflight about 0.68. Solar particle events have
     no plant studies at all, though they are the most acute radiation hazard on
     the lunar surface, which is what makes a flare a research opportunity.

     The index measures how far the transcriptome is knocked off its networks,
     not growth; reading it as a growth multiplier is our interpretation. That
     a just-sown hall loses seedlings outright is a game device drawn from the
     seed stress work (deepspace-seed-stress-decoder: germination is the most
     vulnerable window). The crew's dose is the real cost of a flare. */
  const RRI_BASE = 0.7927;
  const RRI_PHASES = [[2, 0.7861], [6, 0.6848], [12, 0.7545], [30, 0.7846]];  // until hour, index
  const RAD_SEEDLING = 0.5;        // share of a just-sown stand lost per unit radSens, unshielded

  const co2Cap = s => (s.up.composter ? 400 : 260);

  /* ---------- crops, conventional and engineered ----------

     A GMO line is not authored as a whole crop; it is its base crop run through
     its trait list. `mods` keys multiply, keys written with a leading + add, and
     a handful are flags. Derived crops are cached because cropById is called
     several times per field per tick. */
  const FLAG_MODS = { keeps: 1, setFloor: 1, co2Shy: 1 };
  const derivedCache = {};

  function deriveCrop(g) {
    const base = CROPS.find(c => c.id === g.base);
    if (!base) return null;
    const c = Object.assign({}, base, {
      id: g.id, name: g.name, cultivar: g.cultivar, note: g.note,
      gmo: true, base: g.base, traits: g.traits.slice(),
      light: 1, flowers: 1, soilFloor: 0,
      /* nobody has measured a line that does not exist: its fresh yield is the
         parent's run through its traits, an estimate */
      eden: null, src: 'est'
    });
    for (const tid of g.traits) {
      const t = TRAITS.find(x => x.id === tid);
      if (!t) continue;
      for (const key of Object.keys(t.mods)) {
        const v = t.mods[key];
        if (key[0] === '+') { const k = key.slice(1); c[k] = (c[k] || 0) + v; }
        else if (key === 'soilFloor') c.soilFloor = (c.soilFloor || 0) + v;
        else if (FLAG_MODS[key]) c[key] = !!v;
        else c[key] = (c[key] || 0) * v;
      }
    }
    c.days = Math.max(6, Math.round(c.days));
    c.kcal = Math.round(c.kcal);
    c.value = Math.round(c.value);
    c.morale = Math.round(c.morale * 10) / 10;
    /* engineered seed is dearer to produce, and stays dearer */
    c.seed = Math.round(base.seed * 1.6);
    return c;
  }

  function cropById(id) {
    const base = CROPS.find(c => c.id === id);
    if (base) return base;
    if (derivedCache[id]) return derivedCache[id];
    const g = GMO.find(x => x.id === id);
    if (!g) return null;
    const made = deriveCrop(g);
    if (made) derivedCache[id] = made;
    return made;
  }

  /* everything sowable right now: the whole conventional roster plus developed lines */
  const gmoById = id => GMO.find(g => g.id === id);
  const sowable = s => CROPS.concat(GMO.filter(g => s.gmo && s.gmo[g.id]).map(g => cropById(g.id)));
  /* the gate: every conventional crop has to have gone in the ground once */
  const conventionalSown = s => CROPS.filter(c => s.stats.sown && s.stats.sown[c.id]).length;
  const biotechOpen = s => !!s.stats.labOpen || conventionalSown(s) >= CROPS.length;

  /* Lamp draw for one hall. A dark-grown culture needs none, and a low-light or
     fast-relaxing line needs less of it. Draw scales with the photon flux the
     hall is set to, so High costs 1.82× Standard. */
  function lampNeed(s, f) {
    const c = cropById(f.crop);
    if (!c || c.dark) return 0;
    const lamps = (f.w * f.h) * ledKW(s) * (c.light || 1) * (ppfdEff(s, f) / PPFD.std);
    /* the canopy fans are on the lighting circuit: shed a hall, its fans stop too */
    return f.fans ? lamps + f.w * f.h * FAN_KW : lamps;
  }

  /* transpiration rises with light, if more slowly — so High wants more water
     and puts more of it into the air */
  const transpFactor = (s, f) => Math.pow(ppfdEff(s, f) / PPFD.std, 0.8);

  /* Loads that are not lamps and not the crew's own life support. Charged in the
     tick and shown in the power panel from the same sum. */
  function auxLoad(s) {
    let kw = 0;
    if (s.dehumBoost) kw += totalTiles(s) * DEHUM_KW;
    if (count(s, 'tanks')) kw += TANK_ROOM_KW;
    kw += count(s, 'nursery') * NURSERY_KW;
    for (const f of s.fields) if (f.substrate === 'aero') kw += area(f) * AERO_KW;
    return kw;
  }

  /* ---------- beds and tanks ---------- */

  /* which solution a crop drinks: fruiting and seed crops the strong one */
  function tankFor(c) {
    if (!c || isCulture(c)) return null;
    return (c.kind === 'fruit' || c.kind === 'grain' || c.kind === 'fibre') ? 'fruit' : 'leafy';
  }
  const tankRoomLive = (s, touching) => built(s, 'tanks')
    .some(t => (touching || serviceSet(s)).has(idx(t.x, t.y)));

  /* how well a tank's chemistry suits the crop, 1 inside its band */
  function chemFactor(s, id) {
    const T = TANKS[id], k = s.tanks && s.tanks[id];
    if (!T || !k) return 1;
    return clamp(1 - 0.35 * Math.max(0, Math.abs(k.ec - T.ec) - BAND_EC)
                   - 0.20 * Math.max(0, Math.abs(k.ph - T.ph) - BAND_PH), 0.5, 1);
  }
  const inBand = (s, id) => {
    const T = TANKS[id], k = s.tanks[id];
    return Math.abs(k.ec - T.ec) <= BAND_EC && Math.abs(k.ph - T.ph) <= BAND_PH;
  };

  /* the bed's growth factor: raw regolith worked toward soil, fired aggregate,
     or bare roots in mist */
  function bedFactor(f, c) {
    if (f.substrate === 'aero') return AERO_GROWTH;
    if (f.substrate === 'sintered') return SINTER_FLOOR + (1 - SINTER_FLOOR) * f.soil;
    const floor = clamp(RAW_SOIL + (RAW_SOIL_IMMATURE - RAW_SOIL) * (f.immature || 0) + (c.soilFloor || 0), 0, 1);
    return floor + (1 - floor) * f.soil;
  }

  /* what a harvest yields against a worked bed: the stunted first crops of raw
     regolith, until roots and stubble have made it soil */
  function bedYield(f, c) {
    if (f.substrate === 'aero' || f.substrate === 'sintered' || f.soil >= SOIL_FULL_YIELD) return 1;
    const y0 = YIELD_FLOOR + (YIELD_FLOOR_IMMATURE - YIELD_FLOOR) * (f.immature || 0) + ((c && c.soilFloor) || 0);
    return clamp(y0 + (1 - y0) * f.soil / SOIL_FULL_YIELD, 0, 1);
  }

  /* the share of a hall's ground that is freshly broken crater-rim ejecta */
  function immatureShare(s, f) {
    const t = fieldTiles(s, f);
    return t.length ? t.filter(x => x.t === 'rough').length / t.length : 0;
  }

  function freshTanks() {
    return { leafy: { ec: TANKS.leafy.ec, ph: TANKS.leafy.ph, age: 0, auto: true },
             fruit: { ec: TANKS.fruit.ec, ph: TANKS.fruit.ph, age: 0, auto: true },
             recipeFixed: false };
  }

  /* One hour of the tanks: salts build with every lit hour, and nitrate uptake
     pushes pH up — faster with raw regolith on the line. Auto-dosing spends
     stock to hold pH; nothing but replacement clears the salts. */
  function tankStep(s, served) {
    for (const id of ['leafy', 'fruit']) {
      const k = s.tanks[id], T = TANKS[id];
      const halls = served.filter(f => tankFor(cropById(f.crop)) === id);
      const tiles = halls.reduce((a, f) => a + area(f), 0);
      k.age += 1 / 24;
      if (!tiles) continue;
      const lit = halls.reduce((a, f) => a + (f.litNow ? area(f) : 0), 0) / tiles;
      const raw = halls.reduce((a, f) => a + (f.substrate === 'regolith' ? area(f) * (1 - f.soil) : 0), 0) / tiles;
      k.ec += BAND_EC / (T.days * 16) * lit;
      const drift = (PH_DRIFT + PH_ALK * raw) * lit;
      if (k.auto && s.nutrients > 0) {
        s.nutrients = Math.max(0, s.nutrients - DOSE_N * drift);
        s.stats.dosedToday = (s.stats.dosedToday || 0) + DOSE_N * drift;
        s.stats.dosedTotal = (s.stats.dosedTotal || 0) + DOSE_N * drift;
      } else k.ph += drift;
    }
  }

  /* what a hall's lamps are actually delivering: a throttled farm runs every
     hall at Low whatever it is set to */
  function ppfdEff(s, f) {
    const p = f.ppfd || PPFD.std;
    return s.flags.throttle > 0 ? Math.min(p, PPFD.low) : p;
  }
  const hallDLI = (s, f) => ppfdEff(s, f) * s.photoperiod * DLI_PER_PPFD_HOUR;

  /* Growth relative to Standard light at 16 h. A crop with no light demand
     (a dark culture) is indifferent. */
  function lightGain(c, dli) {
    if (!c || !c.dli || dli === DLI_STD) return 1;
    const k = LIGHT_K_PER_DLI * c.dli;
    return (1 - Math.exp(-dli / k)) / (1 - Math.exp(-DLI_STD / k));
  }

  /* cut-and-come-again: what one later picking yields, as a share of a full cut */
  const isSpread = c => !!c && c.harvest === 'spread';
  const pickShare = c => (isSpread(c) ? Math.min(1, SPREAD_BONUS * c.pick / c.days) : 1);
  /* algae, microbes and fungi are cultures, not canopy — they stay out of the
     per-square-metre benchmark */
  const isCulture = c => !!c && (c.dark || c.kind === 'algae' || c.kind === 'microbe' || c.kind === 'fungal');
  const buildById = id => BUILDINGS.find(b => b.id === id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const idx = (x, y) => y * K.COLS + x;

  /* ---------- terrain ---------- */

  function rnd(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

  function makeMap(seed) {
    const tiles = [];
    for (let y = 0; y < K.ROWS; y++) {
      for (let x = 0; x < K.COLS; x++) {
        tiles.push({ x, y, t: 'flat', b: null, f: null, v: rnd(seed + x * 7.1 + y * 13.7) });
      }
    }
    for (let i = 0; i < 6; i++) {                    // crater bowls
      const cx = Math.floor(rnd(seed + i * 3.3) * K.COLS);
      const cy = Math.floor(rnd(seed + i * 5.9) * K.ROWS);
      const r = 1 + Math.floor(rnd(seed + i * 8.2) * 1.7);
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= K.COLS || y >= K.ROWS) continue;
          const d = Math.hypot(x - cx, y - cy);
          if (d <= r + 0.3) tiles[idx(x, y)].t = d > r - 0.5 ? 'rough' : 'crater';
        }
    }
    for (let i = 0; i < 34; i++) {                   // boulder fields
      const x = Math.floor(rnd(seed + i * 17.3) * K.COLS);
      const y = Math.floor(rnd(seed + i * 11.9) * K.ROWS);
      if (tiles[idx(x, y)].t === 'flat') tiles[idx(x, y)].t = 'boulder';
    }
    const sx = 3, sy = Math.floor(K.ROWS / 2);       // the lava tube skylight
    for (let y = sy - 1; y <= sy; y++)
      for (let x = sx; x <= sx + 1; x++) tiles[idx(x, y)].t = 'skylight';

    for (let y = 4; y <= 12; y++)                    // keep the starting plot clear
      for (let x = 8; x <= 19; x++)
        if (tiles[idx(x, y)].t !== 'skylight') tiles[idx(x, y)].t = 'flat';
    return tiles;
  }

  /* Bump when the stored shape changes. Anything older is brought forward by
     migrate() rather than thrown away. */
  const STATE_VERSION = 9;

  /* Bring a stored run up to the shape this code expects.

     Defaults are chosen to preserve what the player was actually seeing, not
     what a new hall would get. A run saved before bed conditioning existed
     behaved as fully worked ground, so that is what it becomes — starting it at
     raw dust would punish somebody for loading their own save. */
  function migrate(o) {
    if (!o || typeof o !== 'object') return { ok: false, why: 'unreadable' };
    if ((o.version || 0) > STATE_VERSION) return { ok: false, why: 'newer', from: o.version };
    /* the earliest builds laid the farm out differently — there is nothing here
       to carry forward, and pretending otherwise would load a broken run */
    if (!Array.isArray(o.map) || !Array.isArray(o.fields)) {
      return { ok: false, why: 'incompatible', from: o.version || 0 };
    }

    const from = o.version || 0;
    const def = (obj, k, v) => { if (obj[k] === undefined) obj[k] = v; };

    def(o, 'auto', false); def(o, 'sandbox', false); def(o, 'history', []);
    def(o, 'litFields', 0); def(o, 'wantFields', 0);
    def(o, 'litTiles', 0); def(o, 'wantTiles', 0);
    def(o, 'photoperiod', 16); def(o, 'isruOn', true);
    def(o, 'up', {}); def(o, 'flags', {}); def(o, 'stats', {});
    def(o, 'done', {}); def(o, 'log', []); def(o, 'over', null);
    def(o, 'nextField', o.fields.reduce((m, f) => Math.max(m, f.id || 0), 0) + 1);

    ['dust', 'leak', 'busfault', 'biofilm', 'thermal', 'shutter', 'seed', 'railout', 'mppt', 'throttle', 'scrubber', 'calcium']
      .forEach(k => def(o.flags, k, 0));
    def(o.up, 'led', 0); def(o.up, 'recovery', 0);

    /* v7 — the studio, the biotech tier and the vault.

       stats.sown is seeded from stats.kinds rather than left empty: a run that
       has already harvested twenty crops has plainly sown them, and starting its
       biotech gate from zero would be taking work away from somebody who did it. */
    def(o, 'residue', 0);
    /* v8 — the recycling compartments and what the station pays for them */
    def(o, 'waste', 0);
    def(o, 'carbonate', 0);
    def(o, 'offtake', false);
    def(o, 'gmo', {});
    def(o, 'media', null);
    if (!o.media) {
      o.media = { audience: 0, novelty: {}, aired: 0, revenue: 0, today: 0, reel: [], last: [] };
    }
    ['audience', 'aired', 'revenue', 'today'].forEach(k => def(o.media, k, 0));
    def(o.media, 'novelty', {}); def(o.media, 'reel', []); def(o.media, 'last', []);
    def(o, 'vault', null);
    if (!o.vault) o.vault = { accessions: {}, lost: 0, secured: false };
    def(o.vault, 'accessions', {}); def(o.vault, 'lost', 0); def(o.vault, 'secured', false);
    if (o.stats && o.stats.sown === undefined) {
      o.stats.sown = Object.assign({}, o.stats.kinds || {});
    }

    const st = o.stats;
    def(st, 'harvests', 0); def(st, 'kinds', {}); def(st, 'nightsSurvived', 0);
    def(st, 'closureStreak', 0); def(st, 'harvestedToday', 0);
    def(st, 'lastClosure', 0); def(st, 'brownouts', 0); def(st, 'seenNight', false);
    def(st, 'sown', {}); def(st, 'mediaTotal', 0); def(st, 'ateRecently', 0); def(st, 'lastEaten', '');
    def(st, 'lsShare', 0); def(st, 'wasteProcessed', 0); def(st, 'serviceTotal', 0);
    def(st, 'wasteToday', 0); def(st, 'serviceToday', 0);
    def(st, 'o2Today', 0); def(st, 'co2Today', 0); def(st, 'recycled', {});
    /* closure used to be a rolling window; it is now measured over the whole
       mission, so seed the totals from what the run has actually done */
    if (st.totalGrown === undefined) {
      st.totalGrown = 0;
      st.totalEaten = Math.max(0, (o.day || 1) - 1) * dailyNeed(o);
    }
    def(st, 'totalEaten', 0);
    delete st.recent;

    for (const f of o.fields) {
      def(f, 'soil', 1);            // it behaved as worked ground, so it stays worked
      /* v9 — lamps at the setting every hall ran at before there was a dimmer */
      def(f, 'ppfd', PPFD.std); def(f, 'picks', 0);
      def(f, 'fans', false); def(f, 'sealed', 0);
      def(f, 'substrate', 'regolith'); def(f, 'transplanted', false);
      def(f, 'ppmAcc', 0); def(f, 'litH', 0); def(f, 'radH', -1); def(f, 'stand', 1);
      if (f.immature === undefined) f.immature = immatureShare(o, f);
      def(f, 'serviced', true); def(f, 'railed', false);
      def(f, 'carbon', 0); def(f, 'warned', false); def(f, 'litNow', false);
      def(f, 'health', 1); def(f, 'moisture', 0.9); def(f, 'feed', 0.9);
      def(f, 'growth', 0); def(f, 'infected', false); def(f, 'dead', false);
      def(f, 'crop', null); def(f, 'plantedDay', o.day || 1);
    }
    for (const t of o.map) { def(t, 'b', null); def(t, 'f', null); def(t, 'v', 0.5); }

    /* v9 — EDEN ISS light and yield. The fresh-mass ledger starts now, credited
       with the growing time already standing in the halls. The biotech gate
       grew by five crops; a lab that was open under the old roster stays open. */
    ['freshKg', 'freshToday', 'kgm2d', 'kg30', 'picks', 'maxPicks', 'highLight', 'shedToday']
      .forEach(k => def(st, k, 0));
    /* the greenhouse air, at EDEN ISS's setpoints */
    def(o, 'co2Set', CO2_SET); def(o, 'dehumBoost', false);
    def(o, 'air', { t: T_DAY, rh: 65, ppm: CO2_SET, excess: 0 });
    def(o.up, 'radiator', 0);
    ['ppmPeak', 'rhHours', 'rhPeak'].forEach(k => def(st, k, 0));
    def(st, 'tLow', T_DAY); def(st, 'tHigh', T_DAY);
    /* roots: fresh tanks at EDEN ISS's setpoints, an empty nursery */
    def(o, 'tanks', freshTanks()); def(o, 'nursery', { stock: 0 });
    ['tankReplacements', 'tanksInBand', 'aeroHarvests', 'sinteredHalls', 'transplants', 'dosedToday']
      .forEach(k => def(st, k, 0));
    /* the farm's notebook, its studies and its field notes */
    def(o, 'records', []); def(o, 'studies', {}); def(o, 'notes', {}); def(o, 'flare', null);
    ['flares', 'infections', 'thinHarvest'].forEach(k => def(st, k, 0));
    if (st.rackM2Days === undefined) st.rackM2Days = standingM2Days(o);
    if (st.labOpen === undefined) {
      const legacy = CROPS.filter(c => !c.since).length;
      st.labOpen = conventionalSown(o) >= legacy || Object.keys(o.gmo || {}).length > 0;
    }

    o.version = STATE_VERSION;
    return { ok: true, from, carried: from !== STATE_VERSION };
  }

  function newGame() {
    const s = {
      version: STATE_VERSION,
      hour: 6, day: 1,
      credits: 12000, water: 900, o2: 240, co2: 200, nutrients: 400,
      food: 600000, science: 0, spares: 6, pressure: 100, stored: 120, residue: 0,
      waste: 0, carbonate: 0, offtake: false,
      crew: 3, morale: 72, photoperiod: 16, isruOn: true,
      co2Set: CO2_SET, dehumBoost: false,
      air: { t: T_DAY, rh: 65, ppm: CO2_SET, excess: 0 },
      tanks: freshTanks(), nursery: { stock: 0 },
      records: [], studies: {}, notes: {}, flare: null,
      auto: false, sandbox: false, history: [],
      map: makeMap(41), fields: [], nextField: 1,
      up: { led: 0, recovery: 0 },
      flags: { dust: 0, leak: 0, busfault: 0, biofilm: 0, thermal: 0, shutter: 0,
               seed: 0, railout: 0, mppt: 0, throttle: 0, scrubber: 0, calcium: 0 },
      stats: { harvests: 0, kinds: {}, sown: {}, nightsSurvived: 0, closureStreak: 0,
               harvestedToday: 0, totalGrown: 0, totalEaten: 0, lastClosure: 0, brownouts: 0,
               seenNight: false, mediaTotal: 0, ateRecently: 0, lastEaten: '',
               lsShare: 0, wasteProcessed: 0, serviceTotal: 0, wasteToday: 0, serviceToday: 0,
               o2Today: 0, co2Today: 0, recycled: {},
               freshKg: 0, freshToday: 0, rackM2Days: 0, kgm2d: 0, kg30: 0,
               picks: 0, maxPicks: 0, highLight: 0, shedToday: 0, labOpen: false,
               ppmPeak: 0, rhHours: 0, rhPeak: 0, tLow: T_DAY, tHigh: T_DAY,
               tankReplacements: 0, tanksInBand: 0, aeroHarvests: 0, sinteredHalls: 0,
               transplants: 0, dosedToday: 0, flares: 0, infections: 0, thinHarvest: 0 },
      gmo: {},
      media: { audience: 0, novelty: {}, aired: 0, revenue: 0, today: 0, reel: [], last: [] },
      vault: { accessions: {}, lost: 0, secured: false },
      done: {}, log: [], over: null, litFields: 0, wantFields: 0, litTiles: 0, wantTiles: 0
    };
    const put = (x, y, type) => { s.map[idx(x, y)].b = { type }; };
    put(12, 8, 'hab');
    [[11, 8], [13, 8], [14, 8], [12, 7], [12, 9], [10, 8], [15, 8]].forEach(([x, y]) => put(x, y, 'track'));
    [[11, 10], [13, 10], [14, 10], [10, 10]].forEach(([x, y]) => put(x, y, 'solar'));
    [[15, 9], [15, 7]].forEach(([x, y]) => put(x, y, 'battery'));
    /* The inherited hall must clear the pre-laid track at 12,7. The outgoing
       crew left a crop part-grown in it: a staple takes longer to mature than
       the handover stores last, so the farm has to start mid-cycle. */
    addField(s, 9, 4, 4, 3, true);
    /* the beds you inherit have been worked for years */
    Object.assign(s.fields[0], { crop: 'potato', growth: 0.55, plantedDay: 1, soil: 0.8 });
    s.stats.sown.potato = 1;
    /* that crop has been in the ground for half its cycle already, and the
       season's fresh-mass-per-square-metre figure has to count those days, or
       the first harvest reads as a farm out-growing EDEN ISS in six weeks */
    s.stats.rackM2Days = standingM2Days(s);
    return s;
  }

  /* ---------- fields ---------- */

  const fieldById = (s, id) => s.fields.find(f => f.id === id);
  const fieldAt = (s, t) => (t && t.f) ? fieldById(s, t.f) : null;
  const planted = s => s.fields.filter(f => f.crop && !f.dead);
  const area = f => f.w * f.h;
  const totalTiles = s => s.fields.reduce((a, f) => a + area(f), 0);

  function fieldTiles(s, f) {
    const out = [];
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++) out.push(s.map[idx(x, y)]);
    return out;
  }

  /* Can a rectangle become a hall? Returns null if fine, else why not. */
  function checkField(s, x, y, w, h) {
    if (w < 1 || h < 1) return 'Drag out at least one tile.';
    if (w > MAX_FIELD || h > MAX_FIELD) return `A hall can be at most ${MAX_FIELD} tiles a side.`;
    if (x < 0 || y < 0 || x + w > K.COLS || y + h > K.ROWS) return 'That runs off the plot.';
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const t = s.map[idx(xx, yy)];
        if (t.b || t.f) return 'Something is already built inside that outline.';
        if (t.t === 'crater') return 'A crater bowl is inside that outline.';
        if (t.t === 'skylight') return 'The tube skylight is inside that outline.';
        if (t.t === 'boulder') return 'Boulders are inside that outline — clear them first.';
      }
    }
    return null;
  }

  function fieldCost(w, h) { return buildById('greenhouse').cost * w * h; }

  function addField(s, x, y, w, h, free) {
    const err = checkField(s, x, y, w, h);
    if (err) return err;
    const cost = s.sandbox ? 0 : fieldCost(w, h);
    if (!free && s.credits < cost) return `That hall costs ${cost.toLocaleString()} credits.`;
    if (!free) s.credits -= cost;
    const f = {
      id: s.nextField++, x, y, w, h,
      crop: null, growth: 0, health: 1, moisture: 0.9, feed: 0.9,
      infected: false, dead: false, carbon: 0, litNow: false,
      plantedDay: 0, warned: false, serviced: true,
      /* Regolith is not soil until you make it soil: fresh beds are sharp,
         sterile dust with no structure and no biology. Conditioning comes from
         working roots and stubble back in, harvest after harvest. */
      soil: 0.15,
      ppfd: PPFD.std, picks: 0, fans: false, sealed: 0,
      substrate: 'regolith', transplanted: false, ppmAcc: 0, litH: 0, radH: -1, stand: 1
    };
    s.fields.push(f);
    for (const t of fieldTiles(s, f)) t.f = f.id;
    f.immature = immatureShare(s, f);
    return null;
  }

  function removeField(s, f) {
    for (const t of fieldTiles(s, f)) t.f = null;
    s.fields = s.fields.filter(x => x.id !== f.id);
  }

  /* ---------- queries ---------- */

  const tileAt = (s, x, y) =>
    (x < 0 || y < 0 || x >= K.COLS || y >= K.ROWS) ? null : s.map[idx(x, y)];
  const built = (s, type) => s.map.filter(t => t.b && t.b.type === type);
  const count = (s, type) => built(s, type).length;

  /* A hall or module is serviced if it touches the track network reaching a hab. */
  function serviceSet(s) {
    const net = new Set(), queue = [];
    for (const t of s.map) if (t.b && t.b.type === 'hab') { net.add(idx(t.x, t.y)); queue.push(t); }
    while (queue.length) {
      const t = queue.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tileAt(s, t.x + dx, t.y + dy);
        if (!n || !n.b) continue;
        const k = idx(n.x, n.y);
        const carries = n.b.type === 'track' || n.b.type === 'rail' || n.b.type === 'hab';
        if (net.has(k) || !carries) continue;
        net.add(k); queue.push(n);
      }
    }
    const touching = new Set(net);
    for (const k of net) {
      const t = s.map[k];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tileAt(s, t.x + dx, t.y + dy);
        if (n && (n.b || n.f)) touching.add(idx(n.x, n.y));
      }
    }
    return touching;
  }

  function fieldServiced(s, f, touching) {
    return fieldTiles(s, f).some(t => touching.has(idx(t.x, t.y)));
  }

  /* A hall whose outline touches rail ships its crop out by the wagonload. */
  function fieldRailed(s, f) {
    for (let y = f.y - 1; y <= f.y + f.h; y++) {
      for (let x = f.x - 1; x <= f.x + f.w; x++) {
        const inside = x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h;
        if (inside) continue;
        const t = tileAt(s, x, y);
        if (t && t.b && t.b.type === 'rail') return true;
      }
    }
    return false;
  }

  function sunElevation(s) {
    const phase = ((s.day + s.hour / 24) % K.LUNAR_CYCLE) / K.LUNAR_CYCLE;
    if (phase >= 0.5) return 0;
    return Math.sin(phase * 2 * Math.PI);
  }
  const isSunlit = s => sunElevation(s) > 0.02;
  const dustFactor = s => s.up.eds ? 1 : clamp(1 - s.flags.dust * 0.12, 0.4, 1);
  const ledKW = s => K.LED_KW * Math.pow(0.85, s.up.led || 0);   // per tile

  function lightsOn(s) {
    if (s.flags.shutter > 0) return false;
    return ((s.hour - 6 + 24) % 24) < s.photoperiod;
  }

  function generation(s) {
    const derate = s.flags.mppt > 0 ? 0.67 : 1;
    const solar = isSunlit(s) ? count(s, 'solar') * ARRAY_KW * sunElevation(s) * dustFactor(s) * derate : 0;
    const rtg = RTG_KW + count(s, 'reactor') * REACTOR_KW;
    return { solar, rtg, total: solar + rtg };
  }

  function demand(s) {
    const ls = K.BASE_LIFE_SUPPORT + s.crew * K.LS_PER_CREW
      + count(s, 'nitrifier') * 0.30 + count(s, 'reef') * REEF_KW + auxLoad(s);
    const lit = lightsOn(s) ? planted(s).reduce((a, f) => a + lampNeed(s, f), 0) : 0;
    const isru = (count(s, 'isru') && s.isruOn) ? K.ISRU_KW : 0;
    return { ls, lit, isru, total: ls + lit + isru };
  }

  function storageCap(s) {
    const cap = BASE_KWH + count(s, 'battery') * BATTERY_KWH;
    return s.flags.busfault ? cap * 0.5 : cap;
  }

  function recoveryRate(s) {
    let r = BASE_RECOVERY + (s.up.recovery || 0) * 0.06;
    if (s.flags.biofilm) r -= 0.10;
    return clamp(r, 0.3, 0.97);
  }

  const crewCapacity = s => Math.max(1, count(s, 'hab') * 3);
  const dailyNeed = s => s.crew * K.CREW_KCAL;

  function nightReserve(s) {
    const net = demand(s).total - (RTG_KW + count(s, 'reactor') * REACTOR_KW);
    return net <= 0 ? Infinity : s.stored / net;
  }

  /* ---------- what sets a hall's growth ---------- */

  const noop = () => {};

  /* The farm-wide figures every hall's growth reads, worked out once an hour. */
  function hourEnv(s, touching) {
    const air = s.air || { t: T_DAY, ppm: CO2_SET };
    const tankLive = count(s, 'tanks') > 0 && tankRoomLive(s, touching);
    /* The store sets how much CO₂ the halls can be held at. Written so that at
       the default setpoint it is the old clamp(co2 / 14) to the last bit. */
    const carbonLimit = clamp(Math.min(s.co2 / CO2_KNEE, (s.co2Set || CO2_SET) / CO2_SET), 0.15, 1);
    return { carbonLimit, ppm: air.ppm, t: air.t, tankLive };
  }

  /* what the tank chemistry is doing to one hall, through its bed */
  function hallChem(s, f, c, live) {
    const id = live ? tankFor(c) : null;
    if (!id) return 1;
    return 1 - EXPOSURE[f.substrate || 'regolith'] * (1 - chemFactor(s, id));
  }

  /* C₃ crops gain from enrichment above the setpoint, saturating. Algae and
     cyanobacteria already concentrate carbon and gain nothing. */
  function enrichGain(c, ppm) {
    if (!c || c.respires || c.dark || c.kind === 'algae' || c.kind === 'microbe' || ppm <= CO2_SET) return 1;
    return 1 + ENRICH_MAX * (1 - Math.exp(-(ppm - CO2_SET) / ENRICH_SCALE));
  }
  const tempFactor = t => clamp(1 - 0.05 * Math.max(0, t - 25) - 0.06 * Math.max(0, 18 - t), 0.4, 1);
  /* still air in a big hall, unless its fans are running */
  const stillAir = f => (f.fans ? 1 : 1 - STILL_MAX * clamp((area(f) - STILL_FREE_TILES) / 52, 0, 1));

  /* where a hall is in its response to a flare: 1 when there is none */
  function radResponse(f) {
    if (!(f.radH >= 0)) return 1;
    const phase = RRI_PHASES.find(([until]) => f.radH < until);
    if (!phase) return 1;
    return clamp(1 - (1 - phase[1] / RRI_BASE) * (f.radK || 1), 0.3, 1);
  }

  /* Everything that sets how fast a hall grows this hour, as one product. tick()
     and the hall panel both call this, so the panel can never disagree with the
     simulation. Pass an array as `parts` to get the breakdown as [label, factor]
     pairs. The multipliers are applied in the order they always were, and every
     research factor is exactly 1 at its default, so a farm that never touches a
     new dial reproduces the old arithmetic bit for bit. */
  function growthFactors(s, f, env, parts) {
    const c = cropById(f.crop);
    if (!c) return 0;
    const e = env || hourEnv(s);
    let g = 1, v;
    const note = parts ? (label, x) => parts.push([label, x]) : noop;

    v = c.dark ? 1 : lightGain(c, hallDLI(s, f)); g *= v; note('Light', v);
    v = clamp(f.moisture * 3, 0, 1); g *= v; note('Moisture', v);
    v = clamp(f.feed * 3, 0, 1); g *= v; note('Feed', v);
    v = f.health; g *= v; note('Health', v);
    /* a respiring culture is not carbon-limited — it is making the carbon */
    v = c.respires ? 1 : e.carbonLimit; g *= v; note('Carbon dioxide', v);
    v = enrichGain(c, e.ppm); g *= v; note('CO₂ enrichment', v);
    /* mushrooms run to stem instead of cap when the hall gets close */
    v = (c.co2Shy && (s.co2 > 150 || e.ppm > 1200)) ? 0.68 : 1; g *= v; note('Stale air (mushrooms)', v);
    v = f.serviced ? 1 : UNSERVICED_PENALTY; g *= v; note('Off the track network', v);
    v = (f.railed && !s.flags.railout) ? RAIL_BONUS : 1; g *= v; note('Rail head', v);
    v = bedFactor(f, c); g *= v;
    note(f.substrate === 'aero' ? 'Aeroponic roots' : f.substrate === 'sintered' ? 'Sintered beds' : 'Bed condition', v);
    v = hallChem(s, f, c, e.tankLive); g *= v; note('Tank chemistry', v);
    v = c.dark ? 1 : tempFactor(e.t); g *= v; note(e.t > 25 ? 'Too hot' : 'Too cold', v);
    v = c.dark ? 1 : stillAir(f); g *= v; note('Still air (no fans)', v);
    v = f.sealed > 0 ? 0.05 : 1; g *= v; note('Sealed — no air exchange', v);
    v = radResponse(f); g *= v; note('Recovering from the flare', v);
    v = f.infected ? 0.5 : 1; g *= v; note('Infection', v);
    v = s.pressure < 90 ? 0.6 : 1; g *= v; note('Low pressure', v);
    return g;
  }

  /* One hour of greenhouse air. Called after the lamps are settled, before the
     crops grow, so growth reads this hour's climate. */
  /* What the radiators can carry this hour. They were sized for the original
     lamps at Standard, so an LED retrofit leaves headroom and High eats it. */
  function heatBudget(s) {
    let stdKW = 0;
    for (const f of s.fields) {
      const c = cropById(f.crop);
      if (c && c.dark) continue;
      stdKW += area(f) * K.LED_KW;
    }
    const reject = HEAT_REJECT * stdKW * (1 + RADIATOR_STEP * (s.up.radiator || 0))
      * (s.flags.thermal > 0 ? 0.5 : 1) * (1 - NOON_DERATE * sunElevation(s));
    return { stdKW, reject };
  }

  function climateStep(s, usedKW, on) {
    const air = s.air;
    const { stdKW, reject } = heatBudget(s);
    let allTiles = 0, transp = 0;
    for (const f of s.fields) allTiles += area(f);
    const lampTiles = stdKW / K.LED_KW;
    /* temperature: lamp heat against radiator capacity, and the lamps are the
       only heaters a hall has on a lunar night */
    let t = on ? T_DAY : T_NIGHT;
    if (stdKW > 0) {
      t += OVERHEAT_GAIN * Math.max(0, usedKW / reject - 1);
      if (!isSunlit(s)) t -= COLD_SAG * clamp(1 - usedKW / (COLD_SHARE * stdKW), 0, 1);
    }
    /* humidity: what the lit canopy transpires against what the condensers can take */
    for (const f of s.fields) {
      const c = cropById(f.crop);
      if (!c || f.dead || !f.litNow || isCulture(c)) continue;
      transp += area(f) * c.water * transpFactor(s, f) * (1 + 0.03 * (t - T_DAY));
    }
    const cap = DEHUM_PER_TILE * Math.max(1, allTiles) * (1 + 0.15 * (s.up.recovery || 0))
      * (s.flags.biofilm ? 0.85 : 1) * (s.dehumBoost ? 1.4 : 1);
    const rh = clamp(65 + RH_GAIN * Math.max(0, transp / cap - 1) + (on ? 0 : 4)
      + 1.5 * Math.max(0, 18 - t), 35, 98);
    /* CO₂: what the store can hold the halls at, plus anything the crew are
       breathing into air that is not being scrubbed */
    if (s.flags.scrubber > 0 && allTiles > 0) {
      air.excess = Math.min(CREW_PPM_SMAC, air.excess
        + CREW_PPM_RATE * s.crew * 63.1 / (HALL_M3_PER_TILE * allTiles));
    } else air.excess *= 0.8;
    if (air.excess < 1) air.excess = 0;
    const held = Math.min(s.co2Set || CO2_SET, CO2_SET * s.co2 / CO2_KNEE);
    air.t = t; air.rh = rh; air.ppm = held + air.excess;

    /* enrichment is leaky: air held above the setpoint is lost from the store */
    if (held > CO2_SET && lampTiles > 0) {
      s.co2 = Math.max(0, s.co2 - ENRICH_LOSS / 24 * lampTiles * (held - CO2_SET) / 1000);
    }
    const st = s.stats;
    if (s.hour === 0) { st.ppmPeak = 0; st.rhHours = 0; st.rhPeak = 0; st.tLow = null; st.tHigh = null; }
    st.ppmPeak = Math.max(st.ppmPeak || 0, air.ppm);
    st.rhPeak = Math.max(st.rhPeak || 0, rh);
    if (rh > RH_RISK) st.rhHours = (st.rhHours || 0) + 1;
    /* the temperature range that matters is the one the canopy grows in */
    if (on) {
      st.tLow = st.tLow == null ? t : Math.min(st.tLow, t);
      st.tHigh = st.tHigh == null ? t : Math.max(st.tHigh, t);
    }
  }

  /* ---------- the tick ---------- */

  function tick(s) {
    if (s.over) return;
    const log = [];

    /* --- energy ---
       Load sheds in order of what the colony can least afford to lose: the ISRU
       plant first, then whole grow halls, life support last. A hall is lit or it
       is not — you cannot half-light a canopy. */
    const gen = generation(s);
    const crops = planted(s);
    const ls = K.BASE_LIFE_SUPPORT + s.crew * K.LS_PER_CREW + auxLoad(s);
    const per = ledKW(s);
    const on = lightsOn(s);

    let isruRan = !!(count(s, 'isru') && s.isruOn);
    let baseSurplus = gen.total - ls - (isruRan ? K.ISRU_KW : 0);
    if (baseSurplus < 0 && isruRan) { isruRan = false; baseSurplus = gen.total - ls; }

    let brownout = false, usedKW = 0, litFields = 0, litTiles = 0;
    for (const f of s.fields) f.litNow = false;

    /* A mushroom bed or a fermenter fruits in the dark. It is never shed, never
       counted against the lighting budget, and the fortnight of night costs it
       nothing — which is the whole reason to grow one. */
    const wantLight = crops.filter(f => lampNeed(s, f) > 0);
    const darkGrown = crops.filter(f => lampNeed(s, f) === 0);
    for (const f of darkGrown) f.litNow = true;

    if (baseSurplus < 0 && s.stored + baseSurplus < 0) {
      brownout = true;
      s.morale -= 0.6;
      s.o2 -= s.crew * K.CREW_O2 / 24 * 0.5;
      s.stored = 0;
      for (const f of darkGrown) f.litNow = true;   // a brownout does not reach them
    } else if (on) {
      const pool = baseSurplus + s.stored;
      for (const f of wantLight) {
        const need = lampNeed(s, f);
        if (usedKW + need <= pool) { f.litNow = true; usedKW += need; litFields++; litTiles += area(f); }
      }
      s.stored = clamp(s.stored + baseSurplus - usedKW, 0, storageCap(s));
      brownout = litFields < wantLight.length;
    } else {
      s.stored = clamp(s.stored + baseSurplus, 0, storageCap(s));
    }
    if (brownout) s.stats.brownouts++;
    /* hours today with lamps due and halls left dark — the crew dim on this */
    if (s.hour === 0) s.stats.shedToday = 0;
    if (on && wantLight.length && litFields < wantLight.length) s.stats.shedToday = (s.stats.shedToday || 0) + 1;
    s.litFields = litFields; s.wantFields = on ? wantLight.length : 0;
    s.litTiles = litTiles;
    s.wantTiles = on ? wantLight.reduce((a, f) => a + area(f), 0) : 0;
    s.darkFields = darkGrown.length;

    climateStep(s, usedKW, on);

    /* --- crops --- */
    const touching = serviceSet(s);
    let o2Made = 0, co2Used = 0, waterUsed = 0, nutrUsed = 0;
    const env = hourEnv(s, touching);
    const tankServed = [];

    let residueUsed = 0, nFixed = 0;

    for (const f of crops) {
      const c = cropById(f.crop);
      const A = area(f);
      /* c.days means days, so a dark culture running around the clock divides by
         24 where a lit canopy divides by its photoperiod. */
      const rate = 1 / (c.days * (c.dark ? 24 : s.photoperiod));
      f.serviced = fieldServiced(s, f, touching);
      f.railed = fieldRailed(s, f);

      /* Fungal and microbial beds eat the residue store. Run it dry and they stall
         where a plant would simply go dark. */
      const wantRes = c.residue ? (c.residue / (c.days * 24)) * A : 0;
      const fed = wantRes <= 0 || s.residue >= wantRes;
      f.starved = !fed;

      if (f.litNow && fed) {
        const g = growthFactors(s, f, env);

        f.growth = clamp(f.growth + rate * g, 0, 1);
        /* the air this crop grew in, for the harvest record */
        f.ppmAcc = (f.ppmAcc || 0) + env.ppm; f.litH = (f.litH || 0) + 1;

        const gas = O2_PER_LIT_HOUR * c.o2 * g * A;
        if (c.respires) {
          /* the reverse of a canopy: burns oxygen, hands back carbon dioxide */
          o2Made -= gas;
          co2Used -= gas * CO2_PER_O2;
          residueUsed += wantRes;
        } else {
          o2Made += gas; co2Used += gas * CO2_PER_O2; f.carbon += gas * CO2_PER_O2;
        }
        if (c.fixesN) nFixed += (c.fixesN / 24) * g * A * 0.25;

        if (f.substrate !== 'aero') f.soil = clamp(f.soil + SOIL_PER_LIT_HOUR, 0, 1);
        const tr = c.dark ? 1 : transpFactor(s, f);
        f.moisture -= (c.water / 24) * 0.020 * tr;
        f.feed -= (c.nutrients / 24) * 0.022;
        waterUsed += (c.water / 24) * WATER_PER_TILE * A * tr;
        nutrUsed += (c.nutrients / 24) * 0.25 * A;
      } else {
        f.moisture -= 0.0035;
        f.feed -= 0.0015;
        waterUsed += (c.water / 24) * WATER_PER_TILE * A * 0.15;
      }

      /* Aeroponic roots hang in mist: the pumps keep them wet and the tank keeps
         them fed, and the pumps run on the life-support bus. Lose that bus and
         bare roots dry within hours. */
      if (f.substrate === 'aero') {
        if (env.tankLive && !brownout) f.moisture = Math.max(f.moisture, 0.95);
        else { f.moisture -= 0.05; f.health = clamp(f.health - 0.01, 0, 1); }
      }
      /* the tank room feeds every serviced hall on the line, as irrigation does */
      if (env.tankLive && f.serviced && tankFor(c)) {
        tankServed.push(f);
        if (f.feed < 0.5 && s.nutrients > 0) {
          const a = Math.min(0.05, 0.9 - f.feed);
          f.feed += a; nutrUsed += a * 2 * A;
        }
      }
      f.moisture = clamp(f.moisture, 0, 1);
      f.feed = clamp(f.feed, 0, 1);

      let dh = 0;
      if (f.moisture < 0.12) dh -= 0.0025;
      if (f.feed < 0.08) dh -= 0.0018;
      if (f.infected) dh -= 0.004;
      if (!c.dark && env.t > 30) dh -= 0.002;
      if (hallChem(s, f, c, env.tankLive) < 0.75) dh -= 0.001;
      if (s.pressure < 85) dh -= 0.002;
      if (dh === 0 && f.moisture > 0.3 && f.feed > 0.25) dh = 0.005;
      f.health = clamp(f.health + dh, 0, 1);

      if (f.moisture < 0.22 && !f.warned) {
        f.warned = true;
        log.push(`The ${c.name} in the hall at ${f.x + 1},${f.y + 1} is drying out.`);
      } else if (f.moisture > 0.5) f.warned = false;

      if (f.health <= 0) {
        f.dead = true; f.growth = 0;
        log.push(`Lost the ${c.name} in the hall at ${f.x + 1},${f.y + 1}.`);
      }

      if (s.up.irrigation && f.serviced) {
        if (f.moisture < 0.55) {
          const a = Math.min(0.06, 0.9 - f.moisture);
          f.moisture += a; waterUsed += a * 4 * A;
        }
        if (f.feed < 0.5 && s.nutrients > 0) {
          const a = Math.min(0.05, 0.9 - f.feed);
          f.feed += a; nutrUsed += a * 2 * A;
        }
      }
      if (f.sealed > 0) f.sealed--;
      if (f.radH >= 0) { f.radH++; if (f.radH >= RRI_PHASES[RRI_PHASES.length - 1][0]) f.radH = -1; }
      if (s.up.uvc && f.infected) f.infected = false;
      if (s.up.harvester && f.growth >= 1) harvest(s, f, log);
    }

    if (env.tankLive) tankStep(s, tankServed);
    if (s.flare && s.flare.open) watchFlare(s);

    /* --- gases --- */
    /* what the canopy did for life support today, which is what the station pays on */
    if (s.hour === 0) { s.stats.o2Today = 0; s.stats.co2Today = 0; }
    s.stats.o2Today = (s.stats.o2Today || 0) + Math.max(0, o2Made);
    s.stats.co2Today = (s.stats.co2Today || 0) + Math.max(0, co2Used);
    s.o2 += o2Made - s.crew * K.CREW_O2 / 24;
    s.co2 += (s.crew * K.CREW_CO2 + STATION_CO2) / 24 - co2Used;
    s.o2 = clamp(s.o2, 0, 400 + (s.up.composter ? 200 : 0));
    s.co2 = clamp(s.co2, 0, co2Cap(s));

    /* --- consumables --- */
    const rec = recoveryRate(s);
    waterUsed += s.crew * K.CREW_WATER / 24;
    s.water -= waterUsed * (1 - rec);
    if (isruRan) s.water += 14 / 24;
    s.residue = Math.max(0, s.residue - residueUsed);
    s.nutrients = Math.max(0, s.nutrients - nutrUsed + nFixed);
    if (s.nutrients <= 0) for (const f of crops) f.feed = Math.min(f.feed, 0.05);
    s.food -= dailyNeed(s) / 24;
    s.water = Math.max(0, s.water);

    if (s.flags.leak) s.pressure -= 0.12;
    else if (s.pressure < 100) s.pressure = Math.min(100, s.pressure + 0.05);

    for (const fl of ['shutter', 'thermal', 'seed', 'railout', 'mppt', 'throttle', 'scrubber', 'calcium']) {
      if (s.flags[fl] > 0) s.flags[fl]--;
    }

    s.hour++;
    if (s.hour >= 24) { s.hour = 0; s.day++; endOfDay(s, log); }

    for (const m of log) pushLog(s, m);
    checkFail(s);
    return { brownout };
  }

  /* The farm crew running themselves: tend, harvest, replant, restock.
     Deliberately conservative — it keeps a farm alive, it does not expand it. */
  function autoManage(s, log) {
    for (const f of s.fields) {
      if (f.dead) { clearCrop(f); continue; }
      if (!f.crop) continue;
      if (f.moisture < 0.4) water(s, f);
      if (f.feed < 0.35) feed(s, f);
      if (f.infected && s.credits > 120 * area(f) * 3) treat(s, f);
      if (f.growth >= 1) harvest(s, f, log);
    }
    /* Replant anything standing empty. The crew keep the calories coming, but
       they also rotate deliberately: the studio pays for what has not been on
       screen lately, so the least recently aired line goes in first. */
    const empties = s.fields.filter(f => !f.crop && !f.dead);
    const staples = ['potato', 'wheat', 'sweetpotato', 'soybean', 'rice', 'peanut'];
    const rotation = ['romaine', 'radish', 'pakchoi', 'kale', 'duckweed', 'zinnia',
                      'mizuna', 'onion', 'arabidopsis', 'oyster', 'sunflower', 'basil',
                      'arugula', 'mustard', 'chard', 'kohlrabi'];
    empties.forEach((f, i) => {
      if (i % 2 === 0) return void plant(s, f, staples[i % staples.length]);
      /* freshest first, so novelty and therefore revenue stay up */
      const byNovelty = rotation.slice().sort((a, b) => novelty(s, b) - novelty(s, a));
      for (const id of byNovelty) if (!plant(s, f, id)) return;
      plant(s, f, 'potato');
    });
    if (s.flags.leak && s.spares >= 2) patchLeak(s);
    /* On a lunar night that is leaving halls dark, run the lamps at Low: two-
       thirds the growth for six-tenths of the power, so more of the farm stays
       lit. Sunrise puts them back. The crew never choose High — that is a call
       for whoever pays the power bill. */
    const night = !isSunlit(s);
    for (const f of s.fields) {
      if (night && s.stats.shedToday > 0 && (f.ppfd || PPFD.std) === PPFD.std) {
        f.ppfd = PPFD.low; f.dimmed = true;
      } else if (!night && f.dimmed) {
        f.ppfd = PPFD.std; f.dimmed = false;
      }
    }
    /* Climate, conservatively. Enrich only with carbon the store would vent
       anyway, and never past what the crew will tolerate; fans for any hall big
       enough to stagnate; the dehumidifiers boosted after a wet day. */
    const shy = planted(s).some(f => cropById(f.crop).co2Shy);
    if (s.co2 >= co2Cap(s) - 1 && !shy) s.co2Set = 2000;
    else if (s.co2 < 60 || shy) s.co2Set = CO2_SET;
    for (const f of s.fields) if (area(f) > STILL_FREE_TILES) f.fans = true;
    s.dehumBoost = (s.stats.rhHours || 0) > 0;
    /* Tanks: replace one that has drifted or reached EDEN ISS's interval, and
       keep the dosing on. Raw regolith gets conditioned when there is money to
       spare. The crew never refit a floor — that is a building decision. */
    if (count(s, 'tanks')) {
      for (const id of ['leafy', 'fruit']) {
        const k = s.tanks[id], T = TANKS[id], r = tankRefill(s, id);
        k.auto = true;
        if ((Math.abs(k.ec - T.ec) > 0.25 || k.age > T.days) && s.water > 300 && s.nutrients > r.nutrients + 60) {
          replaceTank(s, id);
        }
      }
    }
    for (const f of s.fields) {
      if ((f.substrate || 'regolith') !== 'regolith' || f.soil >= 0.3) continue;
      const cc = conditionCost(f);
      if (s.credits > 2500 + 2 * cc.credits && s.nutrients > cc.nutrients + 60) condition(s, f);
    }
    /* a farm running itself takes the waste contract — it is free money for
       work the compartments were going to do anyway */
    if (!s.offtake && count(s, 'nitrifier') + count(s, 'digester') > 0) s.offtake = true;

    /* restock, leaving a working float so the player still has money to build */
    const float = 2500;
    if (s.water < 260 && s.credits > float) trade(s, 'water', 200);
    if (s.nutrients < 120 && s.credits > float) trade(s, 'nutrients', 200);
    if (s.food < dailyNeed(s) * 9 && s.credits > float) trade(s, 'food', 30000);
    if (s.o2 < 80 && s.credits > float) trade(s, 'o2', 60);
    if (s.co2 < 25 && s.credits > float) trade(s, 'co2', 40);
    if (s.o2 > 330) sellO2(s, 60);
    if (s.food > dailyNeed(s) * 80) sellFood(s, 60000);
  }

  /* ---------- the recycling compartments ----------

     Each takes a waste stream nobody wants and returns something the farm can
     use. They are the difference between a farm that exports its carbon inside
     the food it sells and one that gets it back.

     A compartment only runs if it is on the track network — the crew have to
     reach it — and only to the extent its feedstock exists. Everything returns
     how much it actually processed, because that is what the station pays on. */

  function servedCount(s, type, touching) {
    return built(s, type).filter(t => touching.has(idx(t.x, t.y))).length;
  }

  function runCompartments(s, log) {
    const touching = serviceSet(s);
    const rec = s.stats.recycled = { worms: 0, nitrifier: 0, digester: 0, reef: 0 };
    let wasteDone = 0;

    /* --- mealworm tiers: residue -> protein + frass, in the dark --- */
    const worms = servedCount(s, 'worms', touching);
    if (worms > 0 && s.residue > 0) {
      const eaten = Math.min(s.residue, WORM_FEED * worms);
      s.residue -= eaten;
      const mass = eaten * WORM_BIOCONV * WORM_SLOWDOWN;
      const kcal = mass * WORM_KCAL;
      s.food += kcal;
      s.nutrients += eaten * WORM_FRASS * 3;
      /* larvae respire: they burn oxygen and hand back carbon dioxide */
      s.o2 = clamp(s.o2 - eaten * 0.30, 0, 400 + (s.up.composter ? 200 : 0));
      s.co2 = clamp(s.co2 + eaten * 0.41, 0, co2Cap(s));
      s.stats.harvestedToday += kcal;
      s.morale = clamp(s.morale + 0.35 * worms, 0, 100);
      rec.worms = eaten;
      queueSegment(s, 'standing', 'worms');
    }

    /* --- nitrifying bioreactor: crew waste -> nitrate --- */
    if (servedCount(s, 'nitrifier', touching) > 0 && s.waste > 0) {
      const took = Math.min(s.waste, NITRO_FEED);
      s.waste -= took;
      s.nutrients += took * NITRO_RECOVERY * 5;
      rec.nitrifier = took;
      wasteDone += took;
    }

    /* --- anaerobic digester: residue and waste -> carbon and minerals --- */
    if (servedCount(s, 'digester', touching) > 0) {
      const fromWaste = Math.min(s.waste, DIGEST_FEED * 0.5);
      const fromResidue = Math.min(s.residue, DIGEST_FEED - fromWaste);
      const took = fromWaste + fromResidue;
      if (took > 0) {
        s.waste -= fromWaste;
        s.residue -= fromResidue;
        const degraded = took * DIGEST_DEGRADE;
        /* biogas back to the canopy as carbon dioxide — the loop closing */
        s.co2 = clamp(s.co2 + degraded * 4.4, 0, co2Cap(s));
        s.nutrients += degraded * 2.4;
        rec.digester = took;
        wasteDone += fromWaste;
      }
    }

    /* --- reef microcosm: carbonate, morale, and something to film --- */
    if (servedCount(s, 'reef', touching) > 0) {
      s.carbonate += REEF_CARBONATE;
      s.morale = clamp(s.morale + 0.5, 0, 100);
      s.science += 0.05;
      rec.reef = REEF_CARBONATE;
      /* calcification is a local carbon dioxide source; the symbionts take some
         of it back. Net, a reef is close to neutral and is not a carbon fix. */
      s.co2 = clamp(s.co2 + 0.20, 0, co2Cap(s));
      s.o2 = clamp(s.o2 + 0.15, 0, 400 + (s.up.composter ? 200 : 0));
      queueSegment(s, 'standing', 'reef');
      bankAccession(s, 'reef_marine');
    }

    s.stats.wasteProcessed = (s.stats.wasteProcessed || 0) + wasteDone;
    s.stats.wasteToday = wasteDone;
    return wasteDone;
  }

  /* ---------- what the station pays ----------

     The farm used to be paid only for what it shipped out. Neither food nor
     oxygen sales reward closing a loop, so a recycling compartment could only
     ever be a cost. These two pay for the service instead of the product. */

  function lifeSupportShare(s) {
    const o2Need = s.crew * K.CREW_O2;
    const co2Made = s.crew * K.CREW_CO2;
    const o2 = o2Need > 0 ? clamp((s.stats.o2Today || 0) / o2Need, 0, 1) : 0;
    const co2 = co2Made > 0 ? clamp((s.stats.co2Today || 0) / co2Made, 0, 1) : 0;
    return (o2 + co2 + recoveryRate(s)) / 3;
  }

  function payStation(s, wasteDone) {
    const share = lifeSupportShare(s);
    s.stats.lsShare = share;
    let paid = Math.round(s.crew * SERVICE_RATE * share);
    if (s.offtake) paid += Math.round(wasteDone * WASTE_FEE);
    s.credits += paid;
    s.stats.serviceTotal = (s.stats.serviceTotal || 0) + paid;
    s.stats.serviceToday = paid;
    return paid;
  }

  /* ---------- the studio ----------

     Earth pays to watch the farm work, and what it will not pay for is the same
     shot again. Every subject carries a novelty that collapses when it airs and
     recovers slowly, so a farm growing one crop very well earns steadily less
     from the camera than a farm growing twelve indifferently. That is the whole
     mechanism: the audience is a biodiversity meter with a credit value. */

  function studioLive(s) {
    const t = built(s, 'studio')[0];
    if (!t) return false;
    return serviceSet(s).has(idx(t.x, t.y));
  }

  function queueSegment(s, kind, subject) {
    if (!s.media) return;
    s.media.reel.push({ kind, subject, day: s.day });
    if (s.media.reel.length > 14) s.media.reel.shift();
  }

  const novelty = (s, k) => (s.media.novelty[k] === undefined ? 1 : s.media.novelty[k]);
  const SEGMENT_WEIGHT = { bouquet: 1.45, harvest: 1.15, standing: 0.9, mess: 0.85 };

  function runStudio(s) {
    const m = s.media;
    m.today = 0;
    for (const k of Object.keys(m.novelty)) {
      m.novelty[k] = Math.min(1, m.novelty[k] + NOVELTY_RECOVER);
    }
    if (!studioLive(s)) {
      m.audience = Math.max(0, m.audience * AUD_DECAY);
      m.last = [];
      m.reel = [];
      return;
    }

    /* The mess table. The crew eat every day, so this is the one segment that is
       always available — it is the floor under the whole economy. Its subject is
       whatever they are eating, which is why a farm with a varied menu earns more
       from the same camera than a farm with one crop in the store. */
    if (s.crew >= 2 && s.food > dailyNeed(s) * 2) {
      queueSegment(s, 'mess', 'mess_' + (s.stats.lastEaten || 'rations'));
    }

    /* Anything standing in a hall is filmable, not only the day it is cut. This
       is what makes variety pay continuously rather than once a season: a farm
       with ten crops in the ground offers ten subjects every morning and can
       always lead with a fresh one, where a monoculture has exactly one and the
       audience has already seen it. */
    for (const f of planted(s)) {
      const c = cropById(f.crop);
      if (c) queueSegment(s, 'standing', c.id);
    }

    /* air the freshest subjects, never the same one twice in a day */
    const pool = m.reel.slice().sort((a, b) => novelty(s, b.subject) - novelty(s, a.subject));
    const aired = [], seen = {};
    for (const seg of pool) {
      if (aired.length >= SEGMENTS_PER_DAY) break;
      if (seen[seg.subject]) continue;
      seen[seg.subject] = 1;
      aired.push(seg);
    }
    m.reel = [];

    let gain = 0, fees = 0;
    for (const seg of aired) {
      const n = novelty(s, seg.subject);
      const w = SEGMENT_WEIGHT[seg.kind] || 1;
      gain += AUD_PER_SEGMENT * n * n * w;
      fees += SEGMENT_FEE * (FEE_FLOOR + (1 - FEE_FLOOR) * n) * w;
      m.novelty[seg.subject] = Math.max(NOVELTY_FLOOR, n * NOVELTY_SPEND);
      m.aired++;
      if (seg.kind === 'bouquet') s.morale = clamp(s.morale + 1.6, 0, 100);
    }
    m.audience = clamp(m.audience * AUD_DECAY + gain, 0, AUD_CAP);

    const pay = Math.round(fees + m.audience * MEDIA_RATE);
    s.credits += pay;
    m.today = pay;
    m.revenue += pay;
    s.stats.mediaTotal = (s.stats.mediaTotal || 0) + pay;
    m.last = aired.map(a => ({ kind: a.kind, subject: a.subject }));
  }

  /* ---------- the vault ----------

     An accession is a line held in living store. They accumulate from the first
     harvest, because a farm banks what it grows whether or not the chamber is
     finished; the vault in the tube is what makes them safe, and what makes them
     pay. */

  const accessions = s => Object.keys((s.vault && s.vault.accessions) || {});
  const vaultBuilt = s => count(s, 'vault') > 0;
  const vaultTarget = () => CROPS.length + GMO.length;

  function bankAccession(s, id) {
    if (!s.vault) return false;
    if (s.vault.accessions[id]) return false;
    s.vault.accessions[id] = s.day;
    return true;
  }

  function loseAccessions(s, n) {
    const held = accessions(s);
    let lost = 0;
    for (let i = 0; i < n && held.length; i++) {
      const j = Math.floor(Math.random() * held.length);
      delete s.vault.accessions[held[j]];
      held.splice(j, 1);
      lost++;
    }
    s.vault.lost += lost;
    return lost;
  }

  /* ---------- biotechnology ---------- */

  function developGmo(s, id) {
    const g = gmoById(id);
    if (!g) return 'Unknown line.';
    if (s.gmo[id]) return 'That line is already developed.';
    if (!biotechOpen(s)) {
      return `The lab wants the whole conventional roster in the ground first — ${conventionalSown(s)} of ${CROPS.length} sown so far.`;
    }
    if (!s.sandbox) {
      if (s.credits < g.cost) return `Developing that line costs ${g.cost.toLocaleString()} credits.`;
      if (s.science < g.science) return `Needs ${g.science} science.`;
      s.credits -= g.cost;
      s.science -= g.science;
    }
    s.gmo[id] = s.day;
    pushLog(s, `${g.name} ${g.cultivar} came out of the lab. It can be sown from now on.`);
    return null;
  }

  /* Follow the Arabidopsis through its response. If it comes out of the hall
     before the response has run its course, the data are incomplete. */
  function watchFlare(s) {
    const fl = s.flare, f = fieldById(s, fl.hall);
    if (!f || f.crop !== fl.crop || f.dead) {
      fl.open = false; fl.lost = true;
      pushLog(s, 'The Arabidopsis came out before the flare response had run its course. The data are incomplete.');
      return;
    }
    fl.nadir = Math.min(fl.nadir, radResponse(f));
    if (f.radH === -1) { fl.open = false; fl.complete = s.day; }
  }

  /* Studies and field notes are read off the farm as it stands: no dice, and
     nothing a farm that ignores them will notice. */
  function checkStudies(s, log) {
    for (const st of STUDIES) {
      if (s.studies[st.id]) continue;
      const r = st.check(s);
      if (!r) continue;
      s.studies[st.id] = Object.assign({ day: s.day }, r);
      s.science += st.science;
      log.push(`Study complete — ${st.name}. ${r.text} (+${st.science} science)`);
    }
    for (const n of FIELD_NOTES) {
      if (s.notes[n.id] || !n.unlock(s)) continue;
      s.notes[n.id] = s.day;
      log.push(`Field note filed: ${n.title}.`);
    }
  }

  /* rack area under canopy: every hall that is not a culture vat, sown or not */
  const rackM2 = s => s.fields.reduce((a, f) => a + (isCulture(cropById(f.crop)) ? 0 : area(f) * TILE_M2), 0);

  /* growing time already in the ground, in m²·days, for a run that predates
     the ledger or a crop inherited part-grown */
  function standingM2Days(s) {
    return planted(s).reduce((a, f) => {
      const c = cropById(f.crop);
      return isCulture(c) ? a : a + area(f) * TILE_M2 * f.growth * c.days;
    }, 0);
  }

  /* fresh kg per m² per day over the last `n` daily samples */
  function kgPerM2Day(s, n) {
    const h = s.history.slice(-n).filter(e => e.rm !== undefined);
    const m2d = h.reduce((a, e) => a + e.rm, 0);
    return m2d > 0 ? h.reduce((a, e) => a + (e.fk || 0), 0) / m2d : 0;
  }

  function endOfDay(s, log) {
    if (s.auto) autoManage(s, log);
    /* the crew shed waste whether or not anything is there to take it */
    s.waste = Math.min(400, s.waste + s.crew * WASTE_PER_CREW);
    const wasteDone = runCompartments(s, log);
    payStation(s, wasteDone);
    runStudio(s);
    /* the nursery raises its fortnight's worth of transplants */
    const beds = servedCount(s, 'nursery', serviceSet(s)) * NURSERY_TILES;
    s.nursery.stock = Math.min(beds, s.nursery.stock + beds / NURSERY_DAYS);
    /* the tanks, as an operator would log them */
    if (count(s, 'tanks')) {
      s.stats.tanksInBand = (inBand(s, 'leafy') && inBand(s, 'fruit')) ? (s.stats.tanksInBand || 0) + 1 : 0;
    }
    s.stats.dosedToday = 0;
    /* a finished vault pays a slow dividend in data on everything it holds */
    if (vaultBuilt(s)) s.science += accessions(s).length * 0.04;
    /* Food closure over the whole mission: everything grown divided by everything
       eaten. A windowed average is useless here — a staple takes longer to mature
       than any sensible window, so it reads zero between harvests. */
    const need = dailyNeed(s);
    s.stats.totalGrown = (s.stats.totalGrown || 0) + s.stats.harvestedToday;
    s.stats.totalEaten = (s.stats.totalEaten || 0) + need;
    s.stats.harvestedToday = 0;
    s.stats.lastClosure = s.stats.totalEaten > 0 ? s.stats.totalGrown / s.stats.totalEaten : 0;
    s.stats.closureStreak = s.stats.lastClosure >= 1 ? s.stats.closureStreak + 1 : 0;

    const kinds = Object.keys(s.stats.kinds).length;
    let target = 46 + Math.min(kinds, 8) * 3;
    if (s.stats.flowersRecent) target += 8;
    if (s.food < need * 3) target -= 25;
    if (s.pressure < 95) target -= 10;
    if (s.o2 < 40) target -= 20;
    /* the crew work in the halls, and enriched air is stuffy air */
    const peak = s.stats.ppmPeak || 0;
    if (peak > CREW_PPM_LIMIT) target -= 10;
    if (peak > CREW_PPM_SMAC) target -= 15;
    s.morale = clamp(s.morale + clamp(target - s.morale, -4, 2.5), 0, 100);
    s.stats.flowersRecent = false;

    const sunlit = isSunlit(s);
    if (!sunlit) s.stats.seenNight = true;
    if (sunlit && s.stats.seenNight && !s.stats.countedNight) {
      s.stats.nightsSurvived++; s.stats.countedNight = true;
      log.push('Sunrise over the Marius Hills. You brought the farm through the night.');
    }
    if (!sunlit) s.stats.countedNight = false;

    if (s.food > need * 20 && s.morale > 65 && s.crew < crewCapacity(s) && s.day % 12 === 0) {
      s.crew++;
      log.push(`A colonist transferred in. Crew is now ${s.crew}.`);
    }

    /* EDEN ISS's winter lesson: hours of air above 80% and the mould follows.
       No dice are thrown on a dry day, so a farm that never gets humid plays
       out exactly as it always did. */
    const rhHours = s.stats.rhHours || 0;
    if (!s.up.uvc && rhHours > 0) {
      for (const f of planted(s)) {
        const c = cropById(f.crop);
        if (f.infected || isCulture(c)) continue;
        if (Math.random() < infectionRisk(s, f)) {
          f.infected = true;
          s.stats.infections = (s.stats.infections || 0) + 1;
          log.push(`Mould in the hall at ${f.x + 1},${f.y + 1} — the air has been too wet for too long.`);
        }
      }
    }
    if (!s.up.uvc) {
      for (const f of planted(s)) {
        if (f.infected && Math.random() < 0.10 + 0.10 * rhHours / 24) {
          const n = neighbourFields(s, f).filter(x => x.crop && !x.infected && !x.dead);
          if (n.length) {
            const pick = n[Math.floor(Math.random() * n.length)];
            pick.infected = true;
            s.stats.infections = (s.stats.infections || 0) + 1;
            log.push(`Infection spread to the hall at ${pick.x + 1},${pick.y + 1}.`);
          }
        }
      }
    }

    if (s.day > 3 && !s.pendingEvent && Math.random() < 0.16) {
      const pool = EVENTS.filter(e => s.day >= e.minDay && (!e.when || e.when(s)));
      let r = Math.random() * pool.reduce((a, e) => a + e.weight, 0);
      for (const e of pool) { r -= e.weight; if (r <= 0) { s.pendingEvent = e.id; break; } }
    }

    checkStudies(s, log);
    for (const m of MILESTONES) {
      if (!s.done[m.id] && m.done(s)) { s.done[m.id] = s.day; log.push(`Milestone: ${m.text}.`); }
    }

    /* Fresh produce per square metre of rack per day — the figure EDEN ISS,
       Lunar Palace 1 and the KSC chamber all report. The season figure is the
       whole run; the 30-day one is what the report charts. */
    const rack = rackM2(s);
    s.stats.rackM2Days = (s.stats.rackM2Days || 0) + rack;
    s.stats.kgm2d = s.stats.rackM2Days > 0 ? s.stats.freshKg / s.stats.rackM2Days : 0;
    const freshToday = s.stats.freshToday || 0;
    s.stats.freshToday = 0;

    /* one telemetry sample a day, for the report dashboard */
    s.history.push({
      d: s.day,
      food: Math.round(s.food / Math.max(1, need) * 10) / 10,   // days of reserve
      closure: Math.round(s.stats.lastClosure * 100) / 100,
      o2: Math.round(s.o2), co2: Math.round(s.co2),
      water: Math.round(s.water), power: Math.round(s.stored),
      credits: Math.round(s.credits), crew: s.crew,
      morale: Math.round(s.morale), tiles: totalTiles(s),
      residue: Math.round(s.residue), waste: Math.round(s.waste),
      audience: Math.round(s.media.audience),
      accessions: Object.keys(s.vault.accessions || {}).length,
      lsShare: Math.round(lifeSupportShare(s) * 100) / 100,
      service: s.stats.serviceToday || 0,
      sun: isSunlit(s) ? 1 : 0,
      fk: Math.round(freshToday * 10) / 10, rm: rack,
      ppm: Math.round(s.stats.ppmPeak || 0), rh: Math.round(s.stats.rhPeak || 0),
      tmin: Math.round((s.stats.tLow == null ? T_DAY : s.stats.tLow) * 10) / 10
    });
    if (s.history.length > 400) s.history.shift();
    s.stats.kg30 = kgPerM2Day(s, 30);
    s.history[s.history.length - 1].kg = Math.round(s.stats.kg30 * 1000) / 1000;
  }

  /* the daily odds a hall goes mouldy, from yesterday's hours of wet air */
  function infectionRisk(s, f) {
    const h = (s.stats.rhHours || 0) / 24;
    if (h <= 0 || s.up.uvc) return 0;
    return RH_INFECT * h * (f.fans ? 0.5 : 1) * (f.substrate === 'sintered' ? 0.6 : 1);
  }

  /* halls whose outlines touch */
  function neighbourFields(s, f) {
    return s.fields.filter(o => o.id !== f.id &&
      o.x <= f.x + f.w && f.x <= o.x + o.w && o.y <= f.y + f.h && f.y <= o.y + o.h);
  }

  /* ---------- player actions ---------- */

  /* Why this tile will or will not take that structure. Mutates nothing, so the
     build tools can use it to colour a drag preview. */
  function canPlace(s, t, type, ignoreCost) {
    const B = buildById(type);
    if (!B) return 'Unknown structure.';
    if (!t) return 'That is off the plot.';

    /* The vault is the exception to the skylight rule, and the only one. It goes
       down the shaft into the tube, where the rock holds one temperature and
       tens of metres of basalt do what no surface structure can. */
    if (type === 'vault') {
      if (t.t !== 'skylight') return 'The vault goes into the tube. Build it on the skylight.';
      if (t.b) return 'Something is already built here.';
      if (count(s, 'vault') >= 1) return 'One vault is all the Moon needs.';
      if (!s.up.composter) return 'Sign-off needs the biomass oxidation loop running first.';
      if (!s.up.shield) return 'Sign-off needs regolith overburden fitted first.';
      const held = accessions(s).length;
      if (held < 12) return `Sign-off needs twelve accessions in hand. You have ${held}.`;
      if (!ignoreCost && !s.sandbox) {
        if (s.credits < B.cost) return 'Not enough credits.';
        if (B.science && s.science < B.science) return `Needs ${B.science} science.`;
      }
      return null;
    }
    if (t.f) return 'A grow hall covers that ground.';
    if (t.t === 'crater') return 'The ground drops away here — nothing will sit level.';
    if (t.t === 'skylight') return 'That is the tube skylight. It stays open.';
    if (t.t === 'boulder') return 'Clear the boulders first.';
    if (t.b) return t.b.type === type ? 'Already laid here.' : 'Something is already built here.';
    if (B.once && count(s, type) >= 1) return `The farm only needs one ${B.name.toLowerCase()}.`;
    if (!ignoreCost && !s.sandbox) {
      if (s.credits < B.cost) return 'Not enough credits.';
      if (B.science && s.science < B.science) return `Needs ${B.science} science.`;
    }
    return null;
  }

  function place(s, t, type) {
    const err = canPlace(s, t, type);
    if (err) return err;
    const B = buildById(type);
    if (!s.sandbox) {
      /* aragonite off the reef goes into the regolith mix, so construction is
         cheaper while the stockpile lasts */
      if (s.carbonate > 0) {
        const spend = Math.min(s.carbonate, B.cost / 900);
        s.carbonate -= spend;
        s.credits += Math.round(spend * 900 * 0.18);
      }
      s.credits -= B.cost;
      if (B.science) s.science -= B.science;
    }
    t.b = { type };
    if (type === 'composter') s.up.composter = true;
    return null;
  }

  function bulldoze(s, t) {
    const f = fieldAt(s, t);
    if (f) {
      if (f.crop) return 'Clear the crop out of the hall first.';
      if (s.credits < 60) return 'Demolition costs 60 credits.';
      s.credits -= 60; removeField(s, f);
      return null;
    }
    if (t.t === 'boulder') {
      if (s.credits < 120) return 'Clearing boulders costs 120 credits.';
      s.credits -= 120; t.t = 'flat';
      return null;
    }
    if (!t.b) return 'Nothing here to clear.';
    if (t.b.type === 'hab' && count(s, 'hab') <= 1) return 'The crew have to live somewhere.';
    if (s.credits < 60) return 'Demolition costs 60 credits.';
    s.credits -= 60;
    if (t.b.type === 'composter') s.up.composter = count(s, 'composter') > 1;
    t.b = null;
    if (s.crew > crewCapacity(s)) s.crew = crewCapacity(s);
    return null;
  }

  function seedCost(c, f) { return Math.round(c.seed * area(f) * 0.4); }

  function plant(s, f, cropId, opts) {
    const c = cropById(cropId);
    if (!c) return 'No such seed in the catalogue.';
    if (!f) return 'Crops only grow in a grow hall.';
    if (f.crop || f.dead) return 'That hall is not clear.';
    if (gmoById(cropId) && !(s.gmo && s.gmo[cropId])) {
      return 'That line has not been developed yet.';
    }
    const cost = seedCost(c, f);
    if (s.credits < cost) return `Seed for that hall costs ${cost.toLocaleString()} credits.`;
    s.credits -= cost;
    s.stats.sown[cropId] = (s.stats.sown[cropId] || 0) + 1;
    /* a line held in the vault is re-sown from secured stock, so a tired-seed
       year cannot touch it — which is most of the point of banking it */
    const secured = s.vault && s.vault.accessions[cropId] && vaultBuilt(s);
    Object.assign(f, { crop: cropId, growth: 0, health: (s.flags.seed > 0 && !secured && !c.keeps) ? 0.65 : 1,
                       infected: false, dead: false,
                       moisture: 0.9, feed: 0.9, carbon: 0, warned: false, plantedDay: s.day, picks: 0,
                       ppmAcc: 0, litH: 0, radH: -1, stand: 1 });
    /* the lab opens the day the roster is complete, and stays open — a crop
       added to the roster later does not shut it on somebody already inside */
    if (!s.stats.labOpen && conventionalSown(s) >= CROPS.length) s.stats.labOpen = true;
    /* Transplants from the nursery go in a fortnight ahead. A hall bigger than
       the stock on hand is part transplanted, part sown. */
    const n = s.nursery;
    if (n && n.stock >= 1 && !isCulture(c) && !c.dark && !(opts && opts.transplant === false)) {
      const used = Math.min(Math.floor(n.stock), area(f));
      n.stock -= used;
      f.growth = Math.min(NURSERY_HEAD_MAX, NURSERY_DAYS / c.days) * used / area(f);
      f.transplanted = true;
      s.stats.transplants = (s.stats.transplants || 0) + 1;
    }
    return null;
  }

  function water(s, f) {
    if (!f || !f.crop || f.dead) return 'Nothing planted there.';
    const need = (1 - f.moisture) * 4 * area(f);
    if (s.water < need) return 'Not enough water in the loop.';
    s.water -= need * (1 - recoveryRate(s));
    f.moisture = 1;
    return null;
  }

  function feed(s, f) {
    if (!f || !f.crop || f.dead) return 'Nothing planted there.';
    const need = (1 - f.feed) * 2 * area(f);
    if (s.nutrients < need) return 'Nutrient stock is empty.';
    s.nutrients -= need; f.feed = 1;
    return null;
  }

  function treat(s, f) {
    if (!f || !f.infected) return 'That hall is clean.';
    const cost = 120 * area(f);
    if (s.credits < cost) return `Sterilising that hall costs ${cost.toLocaleString()} credits.`;
    s.credits -= cost; f.infected = false;
    return null;
  }

  /* Bring a hall in. A batch crop is cleared; a cut-and-come-again crop is
     picked and left standing to regrow, until its stand is spent or `final` asks
     for the last cut. A picking pays its share of a full cut in everything. */
  function harvest(s, f, log, final) {
    if (!f || !f.crop || f.growth < 1) return 'Not ready yet.';
    const c = cropById(f.crop);
    /* stand: the share of the planting still alive — a flare can thin seedlings */
    const A = area(f), q = f.health * bedYield(f, c) * (f.stand || 1);
    const share = f.picks > 0 ? pickShare(c) : 1;
    /* fruit from a calcium-starved tank: blossom-end rot */
    const rot = s.flags.calcium > 0 && c.kind === 'fruit' && tankFor(c) === 'fruit' && count(s, 'tanks') > 0;
    const kcal = Math.round(c.kcal * KCAL_SCALE * A * q * share * (rot ? 0.85 : 1));
    const pay = Math.round(c.value * VALUE_SCALE * A * q * share * (rot ? 0.7 : 1));
    /* fresh edible mass, the unit every analogue facility reports in */
    const kg = isCulture(c) ? 0 : (c.fresh || 0) * TILE_M2 * A * q * share;
    s.food += kcal; s.credits += pay; s.science += c.science * share;
    s.morale = clamp(s.morale + c.morale * 0.25 * share, 0, 100);
    if (c.kind === 'flower') s.stats.flowersRecent = true;
    /* Stems, roots and leaf waste go back through the composter; the rest of the
       carbon leaves the loop inside the food. */
    s.co2 = clamp(s.co2 + f.carbon * (s.up.composter ? 0.75 : 0.42), 0, co2Cap(s));
    f.carbon = 0;
    if (s.up.composter) s.nutrients += 4 * A * share;
    /* Straw, stover and root trash. A photosynthetic crop leaves it behind; a
       fungal or microbial culture has already eaten its way through it. */
    if (!c.respires) s.residue += A * RESIDUE_PER_TILE * q * share;
    /* stubble and root mass go back into the beds */
    const worked = (s.up.composter ? 0.20 : 0.12) + (c.conditions || 0);
    s.stats.harvests++;
    if (f.picks > 0) s.stats.picks = (s.stats.picks || 0) + 1;
    s.stats.kinds[c.id] = (s.stats.kinds[c.id] || 0) + 1;
    s.stats.harvestedToday += kcal;
    s.stats.freshKg = (s.stats.freshKg || 0) + kg;
    s.stats.freshToday = (s.stats.freshToday || 0) + kg;
    if (!c.dark && ppfdEff(s, f) >= PPFD.high) s.stats.highLight = (s.stats.highLight || 0) + 1;
    if (f.substrate === 'aero') s.stats.aeroHarvests = (s.stats.aeroHarvests || 0) + 1;
    if (c.kcal > 0) { s.stats.ateRecently = s.day; s.stats.lastEaten = c.id; }
    /* the camera was there */
    queueSegment(s, c.kind === 'flower' ? 'bouquet' : 'harvest', c.id);
    /* and the line goes into store */
    if (bankAccession(s, c.id) && s.stats.harvests > 1) {
      const msg2 = `${c.name} banked as accession ${accessions(s).length} of ${vaultTarget()}.`;
      if (log) log.push(msg2); else pushLog(s, msg2);
    }
    /* every first cut goes in the farm's notebook: what grew, how, and how fast —
       the studies are read straight off it */
    if (!(f.picks > 0)) {
      if (bedYield(f, c) < 1) s.stats.thinHarvest = (s.stats.thinHarvest || 0) + 1;
      s.records.push({ d: s.day, c: c.id, a: A, p: f.ppfd || PPFD.std, pp: s.photoperiod,
        sub: f.substrate || 'regolith', fans: !!f.fans, tp: !!f.transplanted,
        n: Math.max(1, s.day - f.plantedDay), kg: Math.round(kg * 10) / 10, q: Math.round(q * 1000) / 1000,
        bed: Math.round(bedYield(f, c) * 1000) / 1000, bf: Math.round(bedFactor(f, c) * 1000) / 1000,
        ppm: f.litH ? Math.round(f.ppmAcc / f.litH) : CO2_SET });
      if (s.records.length > 160) s.records.shift();
    }
    const fresh = kg >= 1 ? `, ${Math.round(kg).toLocaleString()} kg fresh` : '';
    const msg = `${f.picks > 0 ? 'Picked' : 'Harvested'} ${c.name}: ${kcal.toLocaleString()} kcal, ${pay.toLocaleString()} cr${fresh}.`;
    if (log) log.push(msg); else pushLog(s, msg);

    /* a cut-and-come-again crop stays in for another picking if its stand allows */
    if (isSpread(c) && !final && (s.day - f.plantedDay) + c.pick <= c.stand) {
      f.picks = (f.picks || 0) + 1;
      f.growth = 1 - c.pick / c.days;
      s.stats.maxPicks = Math.max(s.stats.maxPicks || 0, f.picks);
      return null;
    }
    const keptSoil = f.substrate === 'aero' ? f.soil : clamp(f.soil + worked, 0, 1);
    clearCrop(f);
    f.soil = keptSoil;
    return null;
  }

  function clearCrop(f) {
    Object.assign(f, { crop: null, growth: 0, health: 1, moisture: 0.9, feed: 0.9,
                       infected: false, dead: false, carbon: 0, litNow: false, warned: false,
                       picks: 0, transplanted: false, ppmAcc: 0, litH: 0, radH: -1, stand: 1 });
  }

  /* Set a hall's lamps. Any of the three settings, any time — it is a dimmer,
     not a refit. */
  function setIntensity(s, f, ppfd) {
    if (!f) return 'Select a grow hall first.';
    if (![PPFD.low, PPFD.std, PPFD.high].includes(ppfd)) return 'The lamps have three settings.';
    f.ppfd = ppfd;
    f.dimmed = false;
    return null;
  }

  /* the CO₂ the halls are held at: EDEN ISS's 1000, or enriched */
  function setCo2(s, ppm) {
    if (!CO2_SETTINGS.includes(ppm)) return 'The controller holds 1000, 2000 or 3500 ppm.';
    s.co2Set = ppm;
    return null;
  }

  function setFans(s, f, on) {
    if (!f) return 'Select a grow hall first.';
    f.fans = !!on;
    return null;
  }

  function setDehum(s, on) {
    s.dehumBoost = !!on;
    return null;
  }

  function substrateCost(s, f, to) {
    const A = area(f);
    if (to === 'sintered') return { credits: SINTER_CR * A, kwh: SINTER_KWH * A };
    if (to === 'aero') return { credits: AERO_CR * A, kwh: 0 };
    return { credits: STRIP_CR * A, kwh: 0 };
  }

  /* Refit an empty hall's floor. Firing regolith takes stored energy as well as
     money; going back to regolith strips the hall to raw dust. */
  function setSubstrate(s, f, to) {
    if (!f) return 'Select a grow hall first.';
    if (!EXPOSURE[to]) return 'Unknown bed.';
    if (f.crop || f.dead) return 'Clear the crop out of the hall first.';
    if ((f.substrate || 'regolith') === to) return 'The hall is already floored that way.';
    if (to === 'aero' && !count(s, 'tanks')) return 'Aeroponic racks need the Nutrient Tank Room to feed them.';
    const cost = substrateCost(s, f, to);
    if (!s.sandbox && s.credits < cost.credits) return `That refit costs ${cost.credits.toLocaleString()} credits.`;
    if (cost.kwh && s.stored < cost.kwh) return `Firing the beds takes ${cost.kwh} kWh from storage — there is ${Math.floor(s.stored)}.`;
    if (!s.sandbox) s.credits -= cost.credits;
    s.stored -= cost.kwh;
    if (to === 'regolith') f.soil = 0.15;
    if (to === 'sintered') s.stats.sinteredHalls = (s.stats.sinteredHalls || 0) + 1;
    f.substrate = to;
    return null;
  }

  const tankTiles = (s, id) => planted(s).filter(f => tankFor(cropById(f.crop)) === id)
    .reduce((a, f) => a + area(f), 0);
  const tankRefill = (s, id) => {
    const tiles = tankTiles(s, id);
    return { water: Math.round(TANK_L * tiles * (1 - recoveryRate(s))), nutrients: Math.max(10, TANK_N * tiles) };
  };

  /* bring a tank's pH back to its setpoint by hand */
  function doseTank(s, id) {
    const k = s.tanks && s.tanks[id];
    if (!k) return 'No such tank.';
    if (!count(s, 'tanks')) return 'Build the Nutrient Tank Room first.';
    const need = DOSE_N * Math.abs(k.ph - TANKS[id].ph);
    if (need < 0.01) return 'That tank is on its setpoint.';
    if (s.nutrients < need) return `Dosing needs ${Math.ceil(need)} nutrients.`;
    s.nutrients -= need;
    k.ph = TANKS[id].ph;
    return null;
  }

  /* empty and refill a tank, as EDEN ISS did every two to three months */
  function replaceTank(s, id) {
    const k = s.tanks && s.tanks[id];
    if (!k) return 'No such tank.';
    if (!count(s, 'tanks')) return 'Build the Nutrient Tank Room first.';
    const r = tankRefill(s, id);
    if (s.water < r.water) return `A fresh tank takes ${r.water} L of water.`;
    if (s.nutrients < r.nutrients) return `A fresh tank takes ${r.nutrients} nutrients.`;
    s.water -= r.water; s.nutrients -= r.nutrients;
    Object.assign(k, { ec: TANKS[id].ec, ph: TANKS[id].ph, age: 0 });
    s.stats.tankReplacements = (s.stats.tankReplacements || 0) + 1;
    return null;
  }

  function setAutoDose(s, id, on) {
    const k = s.tanks && s.tanks[id];
    if (!k) return 'No such tank.';
    k.auto = !!on;
    return null;
  }

  function clear(s, f) {
    if (!f || (!f.crop && !f.dead)) return 'Nothing to clear.';
    clearCrop(f);
    return null;
  }

  const conditionCost = f => ({ credits: 90 * area(f), nutrients: 6 * area(f) });

  /* Work imported biomass through the beds: buys in one go what several
     harvests would eventually do on their own. */
  function condition(s, f) {
    if (!f) return 'Select a grow hall first.';
    if (f.soil >= 0.995) return 'Those beds are fully conditioned.';
    const c = conditionCost(f);
    if (!s.sandbox && s.credits < c.credits) return `Conditioning that hall costs ${c.credits.toLocaleString()} credits.`;
    if (s.nutrients < c.nutrients) return `Conditioning that hall needs ${Math.ceil(c.nutrients)} nutrients.`;
    if (!s.sandbox) s.credits -= c.credits;
    s.nutrients -= c.nutrients;
    f.soil = clamp(f.soil + 0.30, 0, 1);
    return null;
  }

  /* Deferring a hull patch used to be irreversible: only another micrometeorite
     alert could clear the flag, so a leak left alone bled pressure to the abort
     limit with nothing the player could do. Now it can always be worked. */
  function patchLeak(s) {
    if (!s.flags.leak) return 'The hull is holding.';
    if (s.spares < 2) return 'Patching the hull needs 2 spares.';
    s.spares -= 2;
    s.flags.leak = 0;
    s.pressure = Math.min(100, s.pressure + 1);
    pushLog(s, 'Hull patched. Pressure holding.');
    return null;
  }

  function research(s, id) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) return 'Unknown item.';
    if (!u.repeat && s.up[id]) return 'Already fitted.';
    if (!s.sandbox) {
      if (s.credits < u.cost) return 'Not enough credits.';
      if (u.science && s.science < u.science) return `Needs ${u.science} science.`;
      s.credits -= u.cost;
      if (u.science) s.science -= u.science;
    }
    s.up[id] = u.repeat ? (s.up[id] || 0) + 1 : true;
    pushLog(s, `Fitted ${u.name}.`);
    return null;
  }

  function trade(s, what, qty) {
    const prices = { water: 4.2, nutrients: 3.0, spares: 260, food: 0.024, co2: 22, o2: 20 };
    const cost = Math.round(prices[what] * qty * (count(s, 'pad') ? 0.85 : 1));
    if (s.credits < cost) return 'Not enough credits.';
    s.credits -= cost; s[what] += qty;
    if (what === 'co2') s.co2 = clamp(s.co2, 0, co2Cap(s));
    return null;
  }

  function sellFood(s, kcal) {
    if (s.food - kcal < dailyNeed(s) * 10) return 'That would cut into the ten-day reserve.';
    s.food -= kcal;
    s.credits += Math.round(kcal * (count(s, 'pad') ? 0.015 : 0.012));
    return null;
  }

  function sellO2(s, kg) {
    if (s.o2 - kg < 90) return 'That would cut into the oxygen reserve.';
    s.o2 -= kg; s.credits += Math.round(kg * 14);
    return null;
  }

  /* ---------- events ---------- */

  function resolveEvent(s, eventId, effect) {
    const L = m => pushLog(s, m);
    switch (effect) {
      case 'spe_shelter':
        s.flags.shutter = 12; s.stats.flares = (s.stats.flares || 0) + 1;
        L('Halls shuttered for the flare. Twelve hours of lost light.');
        break;
      case 'spe_ride': {
        /* the canopy dips and recovers inside a day; seedlings and the crew are
           what a flare actually costs */
        const factor = s.up.shield ? 0.5 : 1;
        let seedlings = 0;
        for (const f of planted(s)) {
          const c = cropById(f.crop);
          f.radH = 0; f.radK = (c.radSens / 0.5) * factor;
          if (f.growth < 0.1) {
            f.stand = (f.stand || 1) * (1 - RAD_SEEDLING * c.radSens * factor);
            seedlings++;
          }
        }
        s.morale -= 8 * factor;
        s.stats.flares = (s.stats.flares || 0) + 1;
        /* nobody has a plant transcriptome from a solar particle event — a hall
           of Arabidopsis under the lamps through one is the first */
        const arab = planted(s).find(f => cropById(f.crop).base === 'arabidopsis' || f.crop === 'arabidopsis');
        if (arab && !(s.studies && s.studies.flare) && !(s.flare && s.flare.open)) {
          s.flare = { hall: arab.id, crop: arab.crop, day: s.day, nadir: 1, open: true };
        }
        L(`Rode out the flare. The canopy will dip and recover within the day${seedlings ? `; ${seedlings} newly sown hall${seedlings === 1 ? '' : 's'} lost seedlings outright` : ''}, and the crew took a dose.`
          + (arab && s.flare && s.flare.open ? ' The Arabidopsis is logging the first plant data ever taken through a solar particle event.' : ''));
        break;
      }
      case 'micro_patch':
        if (s.spares < 2) { L('No spares to patch with — the leak continues.'); s.flags.leak = 1; }
        else { s.spares -= 2; s.flags.leak = 0; L('Puncture patched. Pressure holding.'); }
        break;
      case 'micro_ignore': s.flags.leak = 1; L('Leak logged and left. Pressure is falling.'); break;
      case 'dust_clean': s.flags.dust = 0; s.morale -= 2; L('Arrays cleaned. Everyone came back filthy.'); break;
      case 'dust_ignore': s.flags.dust = Math.min(5, s.flags.dust + 2); L('Dust left on the arrays.'); break;
      case 'fus_treat':
        if (s.credits < 400) { L('Could not afford the kit — infection spreading.'); infectRandom(s, 2); }
        else { s.credits -= 400; for (const f of planted(s)) f.infected = false; L('Halls sterilised.'); }
        break;
      case 'fus_ignore': infectRandom(s, 2); L('Airflow cut. The fungus is still there.'); break;
      case 'bus_fix':
        if (s.spares < 3) { L('Not enough spares — running on half the battery string.'); s.flags.busfault = 1; }
        else { s.spares -= 3; s.flags.busfault = 0; L('Bus rebuilt. Full storage restored.'); }
        break;
      case 'bus_ignore': s.flags.busfault = 1; L('Half the battery string stays isolated.'); break;
      case 'pump_fix':
        if (s.credits < 600) { s.flags.biofilm = 1; L('Could not afford the flush.'); }
        else { s.credits -= 600; s.flags.biofilm = 0; L('Loop flushed and re-inoculated.'); }
        break;
      case 'pump_ignore': s.flags.biofilm = 1; L('Water recovery is down ten points.'); break;
      case 'res_buy':
        if (s.credits < 2200) L('The broker left without a deal.');
        else { s.credits -= 2200; s.spares += 8; s.water += 300; L('Took delivery of spares and water.'); }
        break;
      case 'res_sell': {
        const spare = Math.max(0, s.food - dailyNeed(s) * 12);
        if (spare < 5000) L('Nothing spare to sell.');
        else { s.food -= spare; s.credits += Math.round(spare * 0.02); L(`Sold ${Math.round(spare).toLocaleString()} kcal at the premium rate.`); }
        break;
      }
      case 'grant_take':
        if (s.science < 20) L('Not enough data to package.');
        else { s.science -= 20; s.credits += 5200; L('Grant paid out: 5,200 credits.'); }
        break;
      case 'crew_add':
        if (s.crew + 2 > crewCapacity(s)) L('No quarters for them. The transfer was refused.');
        else { s.crew += 2; L('Two agronomists joined the crew.'); }
        break;
      case 'crew_decline': s.morale -= 3; L('Transfer declined.'); break;
      case 'seed_buy':
        if (s.credits < 1800) { s.flags.seed = 14 * 24; L('No budget for fresh seed — the old stock goes in.'); }
        else { s.credits -= 1800; L('Certified seed on the next lander.'); }
        break;
      case 'seed_sow': s.flags.seed = 14 * 24; L('Sowing the old stock. Anything planted this fortnight starts weak.'); break;

      case 'sub_fix':
        if (s.spares < 2) { s.flags.railout = 12 * 24; L('No spares to regrade with — the line runs slow.'); }
        else { s.spares -= 2; L('Line regraded and repacked.'); }
        break;
      case 'sub_ignore': s.flags.railout = 12 * 24; L('Running slow over the settled stretch. No wagonload rate.'); break;

      case 'ec_flush':
        if (s.nutrients < 120) { for (const f of planted(s)) f.feed = Math.min(f.feed, 0.2); L('Not enough stock to re-mix — the solution stays foul.'); }
        else {
          s.nutrients -= 120;
          if (count(s, 'tanks')) for (const id of ['leafy', 'fruit']) Object.assign(s.tanks[id], { ec: TANKS[id].ec, ph: TANKS[id].ph, age: 0 });
          L('Loop flushed and the solution re-mixed clean.');
        }
        break;
      case 'ec_ride':
        for (const f of planted(s)) f.feed = Math.min(f.feed, 0.2);
        if (count(s, 'tanks')) for (const id of ['leafy', 'fruit']) s.tanks[id].ec += 0.3;
        L('Diluted and carried on. Nutrient charge is down across the farm.');
        break;

      case 'ca_fix':
        if (s.nutrients < 40) { s.flags.calcium = 480; L('Not enough stock to re-mix the fruit tank. The fruit will show it.'); }
        else { s.nutrients -= 40; s.tanks.recipeFixed = true; s.flags.calcium = 0; L('Fruit recipe changed: calcium up, potassium down, as EDEN ISS did in 2018.'); }
        break;
      case 'ca_ride': s.flags.calcium = 480; L('Calcium sprayed on the leaves. The fruit will be marked for three weeks.'); break;

      case 'salad_cut': {
        const leafy = planted(s).find(f => cropById(f.crop).kind === 'leafy' && f.growth >= 0.6)
          || planted(s).find(f => cropById(f.crop).kind === 'leafy');
        if (!leafy) { s.morale -= 6; L('Nothing green anywhere near ready. The request goes unanswered.'); }
        else {
          const name = cropById(leafy.crop).name;
          clearCrop(leafy);
          s.morale = clamp(s.morale + 18, 0, 100);
          s.stats.flowersRecent = true;
          L(`Cut the ${name} for the mess. Best meal in a month.`);
        }
        break;
      }
      case 'salad_hold': s.morale -= 7; L('Everything went to the store. It was noticed.'); break;

      case 'inoc_take':
        if (s.credits < 3200) L('Could not afford the pallet; it flies home unopened.');
        else {
          s.credits -= 3200;
          for (const f of s.fields) f.soil = clamp(f.soil + 0.25, 0, 1);
          L('Inoculant worked through every bed on the farm.');
        }
        break;

      case 'vip_full': {
        /* judged on the farm as it actually stands */
        const good = (s.stats.lastClosure >= 1 ? 1 : 0) + (s.morale >= 60 ? 1 : 0)
          + (totalTiles(s) >= 24 ? 1 : 0);
        if (good >= 2) {
          s.credits += 6000; s.science += 8; s.morale = clamp(s.morale + 5, 0, 100);
          L('The inspection went well. Six thousand credits and a commendation.');
        } else {
          s.morale -= 8;
          L('The inspection did not go well. The manifest slot is under review.');
        }
        break;
      }
      case 'vip_brief': s.credits += 1200; L('A short tour and a small honorarium.'); break;

      case 'mppt_swap':
        if (s.spares < 2) { s.flags.mppt = 20 * 24; L('No spare controller — the string stays derated.'); }
        else { s.spares -= 2; L('Controller swapped. Arrays back to full output.'); }
        break;
      case 'mppt_run': s.flags.mppt = 20 * 24; L('Left in circuit. Solar output is down by a third.'); break;

      case 'samp_send':
        if (s.food < dailyNeed(s) * 12 + 40000) L('Not enough in the store to spare 40,000 kcal.');
        else { s.food -= 40000; s.science += 16; L('Samples frozen and away. Sixteen science.'); }
        break;
      case 'samp_keep': L('Request declined. The colony eats first.'); break;

      case 'offtake_take':
        s.offtake = true;
        L('Waste offtake contract signed. The station pays for every unit you actually process — now you need something that eats it.');
        break;
      case 'offtake_decline': L('The station will keep storing it. For now.'); break;

      case 'wild_bank':
        if (s.credits < 2400) L('No budget for the grow-out. The crate flies home.');
        else {
          s.credits -= 2400;
          s.science += 10;
          let n = 0;
          ['wild_aegilops', 'wild_solanum', 'wild_glycine'].forEach(id => { if (bankAccession(s, id)) n++; });
          L(`Wild relatives grown out and banked: ${n} accession${n === 1 ? '' : 's'} nobody will want until they do.`);
        }
        break;
      case 'wild_decline': L('The crate goes back up unopened.'); break;

      case 'land_take':
        if (bankAccession(s, 'landrace_maize')) {
          s.science += 6;
          s.morale = clamp(s.morale + 4, 0, 100);
          L('Nine hundred years of somebody else\u2019s careful work, accepted into store.');
        } else L('Already held in store.');
        break;
      case 'land_decline': L('Referred elsewhere. There may not be an elsewhere.'); break;

      case 'cold_fix':
        if (s.spares < 3 || s.credits < 900) {
          const lost = loseAccessions(s, 2);
          L(`Nothing to reseal the shaft with. ${lost} accession${lost === 1 ? '' : 's'} lost.`);
        } else {
          s.spares -= 3; s.credits -= 900;
          s.vault.secured = true;
          L('Shaft resealed. The chamber is back on its number.');
        }
        break;
      case 'cold_ignore': {
        const lost = loseAccessions(s, 3);
        L(lost ? `The store warmed through. ${lost} accession${lost === 1 ? '' : 's'} lost, and they do not come back.`
               : 'The store warmed through. Nothing in it yet to lose.');
        break;
      }

      case 'comm_take': {
        if (!studioLive(s)) { L('No studio on the network to shoot it with.'); break; }
        const fresh = Object.keys(s.stats.kinds).length;
        const fee = Math.round(600 + s.media.audience * 1.6 + fresh * 140);
        s.credits += fee;
        s.media.audience = clamp(s.media.audience * 1.12, 0, AUD_CAP);
        L(`Commission delivered: ${fee.toLocaleString()} credits, and the audience grew on the back of it.`);
        break;
      }
      case 'comm_decline': L('The broadcaster was told the farm is not a set.'); break;

      case 'therm_fix':
        if (s.credits < 500) { s.flags.thermal = 96; L('No budget for the scrub — the radiators reject half the heat they should.'); }
        else { s.credits -= 500; s.flags.thermal = 0; L('Radiators scrubbed.'); }
        break;
      case 'therm_throttle':
        s.flags.throttle = 96; s.flags.thermal = 96;
        L('Every hall on Low for four days while the radiators are worked clean.');
        break;

      /* Air-loop repairs are paid in credits, not spares: spares are what the
         hull is patched with, and a farm that spent them on its air should not
         lose the tube for it. */
      case 'scrub_fix':
        if (s.credits < 900) { s.flags.scrubber = 72; L('No budget for a fresh amine bed — the halls will take the crew\u2019s CO₂ until one lands.'); }
        else { s.credits -= 900; s.flags.scrubber = 0; L('Scrubber bed swapped. The air is clearing.'); }
        break;
      case 'scrub_ride':
        s.flags.scrubber = 72;
        L('Running without CO₂ removal. The canopy will enjoy it; the crew will not.');
        break;

      case 'air_fix':
        if (s.credits < 400) { sealWorstHall(s); L('No budget for the bearing. The hall is sealed until one comes.'); }
        else { s.credits -= 400; L('Bearing replaced. Air moving again.'); }
        break;
      case 'air_seal': sealWorstHall(s); L('The hall runs sealed for three days. Without air exchange the canopy stops fixing carbon within minutes.'); break;
      default: break;
    }
    s.morale = clamp(s.morale, 0, 100);
    s.pendingEvent = null;
  }

  /* the biggest lit hall loses its air handler for three days */
  function sealWorstHall(s) {
    const lit = planted(s).filter(f => !cropById(f.crop).dark).sort((a, b) => area(b) - area(a));
    if (lit.length) lit[0].sealed = 72;
  }

  function infectRandom(s, n) {
    const pool = planted(s).filter(f => !f.infected);
    for (let i = 0; i < n && pool.length; i++) {
      const j = Math.floor(Math.random() * pool.length);
      pool[j].infected = true; pool.splice(j, 1);
      s.stats.infections = (s.stats.infections || 0) + 1;
    }
  }

  /* ---------- bookkeeping ---------- */

  function pushLog(s, msg) {
    s.log.unshift({ day: s.day, msg });
    if (s.log.length > 120) s.log.pop();
  }

  function checkFail(s) {
    if (s.food <= 0) s.over = 'The stores ran out. The colony was evacuated on the next lander.';
    else if (s.o2 <= 0) s.over = 'Oxygen reserves hit zero. The farm could not keep up with the crew.';
    else if (s.water <= 0) s.over = 'The water loop ran dry.';
    else if (s.pressure <= 60) s.over = 'Pressure fell below the abort limit. The tube was sealed and abandoned.';
    else if (s.credits < -5000) s.over = 'The station cut your funding. Someone else will farm this tube.';
  }

  window.LF_SIM = {
    newGame, migrate, STATE_VERSION,
    /* studio, biotechnology and the vault */
    studioLive, runStudio, queueSegment, novelty, developGmo, sowable, gmoById, SEGMENT_FEE,
    runCompartments, lifeSupportShare, payStation, servedCount, WASTE_PER_CREW, SERVICE_RATE, WASTE_FEE,
    biotechOpen, conventionalSown, accessions, vaultBuilt, vaultTarget, bankAccession,
    lampNeed, deriveCrop, RESIDUE_PER_TILE, MEDIA_RATE, AUD_PER_SEGMENT, AUD_CAP,
    /* EDEN ISS light and yield */
    setIntensity, lightGain, hallDLI, ppfdEff, growthFactors, hourEnv, kgPerM2Day, rackM2,
    pickShare, isSpread, isCulture, PPFD, DLI_STD, LED_EFFICACY, TILE_M2, SPREAD_BONUS,
    /* greenhouse climate */
    setCo2, setFans, setDehum, climateStep, heatBudget, enrichGain, tempFactor, stillAir, infectionRisk,
    auxLoad, transpFactor, CO2_SETTINGS, CO2_SET, CREW_PPM_LIMIT, CREW_PPM_SMAC, RH_RISK, FAN_KW,
    STILL_FREE_TILES, HEAT_REJECT, RADIATOR_STEP,
    /* roots */
    setSubstrate, substrateCost, doseTank, replaceTank, setAutoDose, tankFor, tankRoomLive, chemFactor,
    hallChem, bedFactor, bedYield, inBand, tankRefill, tankTiles, freshTanks, immatureShare,
    EXPOSURE, BAND_EC, BAND_PH, NURSERY_TILES, NURSERY_DAYS, AERO_GROWTH, SINTER_FLOOR, YIELD_FLOOR,
    RAW_SOIL_IMMATURE, SOIL_FULL_YIELD,
    /* radiation, studies and field notes */
    radResponse, watchFlare, checkStudies, RRI_BASE, RRI_PHASES,
    tick, place, bulldoze, plant, water, feed, treat, harvest, clear, autoManage,
    research, trade, sellFood, sellO2, resolveEvent, condition, conditionCost, patchLeak, RAW_SOIL,
    addField, removeField, checkField, fieldCost, fieldAt, fieldById, fieldTiles, canPlace,
    planted, area, totalTiles, seedCost, serviceSet, fieldRailed,
    cropById, buildById, clamp, tileAt, built, count,
    generation, demand, storageCap, isSunlit, sunElevation, lightsOn,
    dailyNeed, nightReserve, recoveryRate, crewCapacity, dustFactor, ledKW, pushLog,
    KCAL_SCALE, VALUE_SCALE, RTG_KW, REACTOR_KW, ARRAY_KW, BATTERY_KWH, MAX_FIELD
  };
})();
