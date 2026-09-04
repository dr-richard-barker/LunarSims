/* Lunar Metropolis — static game data.

   A SimCity 2000-style sandbox on the Moon. Unlike Artemis City (this repo's
   other city game), there is no life-support survival clock here: the Moon
   shapes the *systems* — pressurisation, power through the long night, sun
   and shadow — rather than acting as a countdown to starvation.

   The defining difference is elevation. Every tile carries a height, and a
   tile's SOLAR EXPOSURE is derived from that height against its neighbours:
   crater rims approach the "peaks of eternal light" that make polar sites
   worth landing at, while permanently shadowed floors never see the sun and
   are exactly where the ice is. Choosing where to build is therefore a real
   trade between power and water, which is what makes the terrain tools a
   strategic instrument rather than scenery. */

const K = {
  COLS: 128,
  ROWS: 128,

  /* Height is an integer level, not a continuous value — terraced terrain
     reads far more clearly in a 2:1 isometric projection than smooth
     interpolation does, and it is what SimCity 2000 itself did. */
  MAX_H: 15,
  LEVEL_PX: 14,            // screen pixels of lift per height level

  /* Terrain editing keeps adjacent tiles within one level of each other,
     relaxing outward from any edit. Without this, sculpting produces
     unreadable spikes instead of landscape. */
  MAX_STEP: 1,

  /* Sun-exposure raycast. Near the lunar poles the sun tracks around the
     horizon at a very low elevation, so even modest relief casts enormous
     shadows — SUN_SLOPE is the horizon rise per tile of distance, and a
     small value is what makes crater floors permanently dark. */
  SUN_SLOPE: 0.16,
  RAY_DIRS: 8,
  RAY_LEN: 14,

  HOURS_PER_DAY: 24,
  LUNAR_CYCLE: 29.5,       // Earth days; sunlit for the first half

  /* A tile this well lit is treated as a peak of eternal light; this dark,
     as permanently shadowed. Both are used by map generation, by solar
     output, and by where ice survives. */
  SUN_PEAK: 0.88,
  SUN_SHADOW: 0.18,

  /* ---- city simulation ---- */
  START_CREDITS: 20000,
  DEMAND_SCALE: 60,        // divisor turning the jobs/population gap into an RCI index

  /* RCI ratios. These three have to be consistent with each other or the
     city hits a ceiling it can never grow through: habitation only develops
     while jobs outrun population, while trade and industry only develop
     while population outruns their own headcount. If the two job ratios sum
     to less than one, the equilibrium the city settles at has fewer jobs
     than residents — which leaves habitation demand permanently negative,
     stalls population for good, and puts the later eras out of reach of any
     player, however well they build.

     So the two job ratios sum to exactly 1: at equilibrium there is one job
     per resident. RESIDENTS_PER_JOB is then what makes a city grow at all —
     each job supports slightly more than one resident, because not everyone
     in a household works. That margin is the engine, and it stays bounded by
     land, power, pressurisation, land value and the era ceiling. */
  RESIDENTS_PER_JOB: 1.15,
  TRADE_JOBS_PER_HEAD: 0.55,
  IND_JOBS_PER_HEAD: 0.45,
  MAX_STAGE: 4,
  BASE_GROWTH: 0.16,       // stage progress per day under ideal conditions
  DECAY_RATE: 0.10,        // stage progress lost per day when demand is negative
  UNSERVED_LIMIT: 8,       // days off the networks before a developed tile loses a stage
  AIR_PER_PLANT: 45,       // colonists one oxygen plant can pressurise
  KW_PER_STAGE: 0.5,       // grid draw of a developed tile, per stage reached
  MIGRATION_RATE: 0.10,    // fraction of the housing gap that moves in per day
  MIGRATION_CAP: 8,       // floor on daily arrivals, for a city too small to scale
  MIGRATION_CAP_FRAC: 0.02, // and above that, arrivals scale with the city itself

  /* ---- budget ----
     BASE_TAX is the rate at which zone income arrives exactly as its stage
     table states, so the default game plays at the balance the zone tables
     were written for and the slider reads as a deviation from normal rather
     than an arbitrary multiplier. */
  BASE_TAX: 9,
  MAX_TAX: 20,
  HAB_TAX_PER_HEAD: 1.15,  // residents are taxable activity too, not just trade
  TAX_DEMAND_BITE: 0.02,   // demand lost per point of tax above the base rate
  BROKE_FUNDING: 0.5,      // services run at half effect while the treasury is negative

  /* ---- regolith dust ----
     Lunar dust is abrasive, electrostatically clingy and the single most
     documented nuisance of working on the Moon — Apollo crews lost seals and
     radiator efficiency to it. Here it is a diffusing field emitted by
     industry that fouls solar arrays and drags land value down, which makes
     where you put the refineries a real decision rather than a cosmetic one. */
  DUST_EMIT: 0.055,        // per industrial stage, per day
  DUST_DECAY: 0.982,       // settles out slowly
  DUST_SPREAD: 0.085,      // fraction bleeding to each orthogonal neighbour
  DUST_SOLAR_BITE: 0.55,   // most of an array's output a full dust load costs
  DUST_VALUE_BITE: 0.40,   // land value lost under a full dust load

  /* ---- disasters ----
     OFF by default. This is a sandbox city builder first: a player who wants
     to design a city should not have one deleted by a dice roll they never
     opted into. Nothing here can end a run either — the worst case is ground
     you have to rebuild.

     The rate is per day and deliberately low. It scales with how much there
     is to hit, so an empty map is quiet and a real city is not, and a
     cooldown stops two events landing on top of each other before the first
     has been repaired. */
  DISASTER_BASE_CHANCE: 0.0045,
  DISASTER_SCALE_TILES: 400,   // developed tiles at which the rate has doubled
  DISASTER_MAX_CHANCE: 0.02,
  DISASTER_COOLDOWN: 45,       // days of quiet after one fires
  DISASTER_GRACE: 20,          // no events at all before this day

  /* The invasion deck rolls on its own dice, on its own toggle. A little
     more often than the disasters, because half of it is harmless and the
     whole point of it is to be seen. */
  INVASION_BASE_CHANCE: 0.007,
  INVASION_MAX_CHANCE: 0.028,
  INVASION_COOLDOWN: 30,
  /* Matched to the earliest card in the deck. Set below it the grace period
     did nothing at all, because every card's own minDay was already later —
     a limit that can never be the binding one is a comment pretending to be
     a constant. */
  INVASION_GRACE: 15,
  SNATCH_DAYS: 60,             // how long a snatched district stays wrong

  /* ---- AI auto-play ----
     Block spacing for the director's lattice. Tube streets every third row
     put every tile within one of a tube, which is the adjacency the growth
     model needs. */
  AI_BLOCK: 3,
  /* Conduit columns are sparser than the streets, because current also flows
     through developed buildings and does not need its own tile everywhere.
     Every fourth column leaves exactly one mid-block column relying on that
     propagation; every sixth left three, which took visibly longer to light
     up and held back the ground in between. */
  AI_CONDUIT_EVERY: 4,
  AI_RESERVE_FLOOR: 2500,  // never spend the treasury below this

  /* ---- the General's offer ----
     SimCity 2000 offered a military base at 60,000 people and sited it for
     you. This city curve is nowhere near that scale — a large run here is a
     few thousand — so the threshold is scaled to the game rather than copied
     from it. Terrain still decides which KIND of base you get, as it did in
     the original. */
  MILITARY_OFFER_POP: 900,
  AI_POWER_MARGIN: 1.3,    // build generation until it clears load by this factor
  AI_AIR_MARGIN: 1.25      // and pressurisation until it clears population by this
};

/* Ground types. Height does most of the work that terrain type did in
   Artemis City, so this roster stays deliberately small. */
const TERRAIN = [
  { id: 'flat', name: 'Regolith', build: true,
    note: 'Graded mare regolith. Builds without preparation.' },
  { id: 'rough', name: 'Broken Ground', build: true,
    note: 'Ejecta and small debris. Buildable, but worth less as ground.' },
  { id: 'boulder', name: 'Boulder Field', build: false,
    note: 'Metre-scale blocks. Must be cleared before anything is built here.' },
  { id: 'skylight', name: 'Lava Tube Skylight', build: false,
    note: 'A collapsed roof opening into an intact lava tube — the most valuable real estate on the Moon, and off-limits until you can build into it.' }
];

/* Deposits are surveyed in at map generation, driven by the elevation model
   rather than scattered independently of it: ice concentrates where the sun
   genuinely never reaches. */
const DEPOSITS = [
  { id: 'regolith', name: 'Regolith', colour: '#9a9088',
    note: 'Loose lunar soil, ubiquitous but variable in how easily it yields useful volatiles.' },
  { id: 'ice', name: 'Water Ice', colour: '#bfe3f2',
    note: 'Mixed into regolith on permanently shadowed ground — the resource the Artemis programme is actually chasing.' },
  { id: 'he3', name: 'Helium-3', colour: '#e8c96b',
    note: 'Solar-wind particles implanted in mature, sun-exposed regolith over billions of years — a speculative but often-cited fusion feedstock.' }
];

/* The three growth zones, each in a low and a high density. Painting a zone
   sets ground aside; the city raises the buildings itself as demand and land
   value allow — you are setting conditions, not placing structures.

   Low density tops out early and cheaply; high density costs more, and can
   climb to a real skyline, but is far more sensitive to land value. That
   split is what gives a lunar city a downtown instead of a uniform sprawl. */
const ZONES = [
  { id: 'hab', name: 'Habitation', colour: '#5fc9ff',
    desc: 'Pressurised living space. Grows as jobs pull colonists in.',
    low:  { cost: 60,  maxStage: 2, stages: [
      { pop: 0, upkeep: 0 }, { pop: 5, upkeep: 1 }, { pop: 11, upkeep: 3 }] },
    high: { cost: 150, maxStage: 4, stages: [
      { pop: 0, upkeep: 0 }, { pop: 9, upkeep: 3 }, { pop: 21, upkeep: 7 },
      { pop: 38, upkeep: 13 }, { pop: 62, upkeep: 21 }] } },

  { id: 'trade', name: 'Trade', colour: '#ffb84d',
    desc: 'Depots, exchanges and mess halls. Grows with population.',
    low:  { cost: 70,  maxStage: 2, stages: [
      { jobs: 0, income: 0, upkeep: 0 }, { jobs: 5, income: 11, upkeep: 1 },
      { jobs: 12, income: 28, upkeep: 4 }] },
    high: { cost: 165, maxStage: 4, stages: [
      { jobs: 0, income: 0, upkeep: 0 }, { jobs: 10, income: 26, upkeep: 4 },
      { jobs: 23, income: 62, upkeep: 9 }, { jobs: 40, income: 112, upkeep: 16 },
      { jobs: 64, income: 184, upkeep: 26 }] } },

  { id: 'industry', name: 'Industry', colour: '#c98bff',
    desc: 'Fabrication and refining. Grows with export opportunity.',
    low:  { cost: 80,  maxStage: 2, stages: [
      { jobs: 0, income: 0, upkeep: 0 }, { jobs: 7, income: 15, upkeep: 2 },
      { jobs: 15, income: 36, upkeep: 5 }] },
    high: { cost: 180, maxStage: 4, stages: [
      { jobs: 0, income: 0, upkeep: 0 }, { jobs: 13, income: 34, upkeep: 5 },
      { jobs: 28, income: 78, upkeep: 11 }, { jobs: 48, income: 138, upkeep: 19 },
      { jobs: 74, income: 220, upkeep: 30 }] } },

  /* ---- the two special districts ----

     Both are DEMAND-FREE: they carry no RCI index and build out whenever
     they are serviced. That is not a shortcut, it is the point. A military
     base does not appear because consumers wanted one, and neither did
     SimCity 2000's — the General offers it, you accept, and it gets built.
     The Launch Complex is the same shape of thing: a strategic decision by
     the city, not a market response.

     They still use the density bands so the zoning UI, the growth model and
     the era ceiling all apply unchanged; each simply offers one band. */

  { id: 'military', name: 'Military', colour: '#8fa87c',
    desc: 'A garrison the General asked for. Employs a standing complement and pays no local tax, and nobody wants to live next to it.',
    demandFree: true, offered: true, dragsValue: 0.10,
    low:  { cost: 240, maxStage: 3, stages: [
      { jobs: 0, income: 0, upkeep: 0 }, { jobs: 22, income: 0, upkeep: 6 },
      { jobs: 48, income: 0, upkeep: 14 }, { jobs: 85, income: 0, upkeep: 26 }] } },

  { id: 'launch', name: 'Launch Complex', colour: '#ff9f6e',
    desc: 'Pads, gantries and fuel farms. Pays a standing export income, and throws regolith every time something lifts off.',
    demandFree: true, dragsValue: 0.06, dustPerStage: 0.05,
    low:  { cost: 300, maxStage: 3, stages: [
      { jobs: 0, income: 0, upkeep: 0 }, { jobs: 18, income: 95, upkeep: 9 },
      { jobs: 40, income: 235, upkeep: 20 }, { jobs: 70, income: 430, upkeep: 34 }] } }
];

/* Placed structures.

   The three networks deliberately behave differently, mirroring how SimCity
   2000 separates roads, power lines and water pipes:

   - Transit tubes are surface infrastructure a zone must physically touch.
   - Power conduits carry current from a generator, and — as in SC2K —
     current also flows through developed buildings, so a dense block needs
     only one connection rather than a conduit on every tile.
   - Atmosphere mains are SUBSURFACE. They coexist with anything already on
     the tile, which is what stops routing three parallel networks from
     becoming tedious busywork. */
const BUILDINGS = [
  { id: 'tube', name: 'Transit Tube', cost: 14, line: true, group: 'network',
    desc: 'Pressurised surface tube. Zoned ground must touch one, or nothing will develop on it.' },
  { id: 'conduit', name: 'Power Conduit', cost: 9, line: true, group: 'network',
    desc: 'Carries current from a generator. Power also flows through developed buildings, so you need fewer of these than you might think.' },
  { id: 'main', name: 'Atmosphere Main', cost: 11, line: true, subsurface: true, group: 'network',
    desc: 'Buried pressurisation line. Runs underneath anything already built, so it never competes for surface space.' },

  { id: 'solar', name: 'Solar Array', cost: 380, group: 'power', kw: 7,
    desc: 'Output scales directly with how much sun the ground it stands on actually receives. On a peak of eternal light it runs near continuously; on a shadowed floor it is nearly worthless.' },
  { id: 'reactor', name: 'Fission Plant', cost: 5600, group: 'power', kw: 60, era: 1,
    desc: 'A Kilopower-class surface reactor. Expensive, and indifferent to sunlight — which is the entire point through the long night.' },
  { id: 'o2', name: 'Oxygen Plant', cost: 950, group: 'life', drawKw: 5, air: K.AIR_PER_PLANT,
    desc: 'Cracks oxygen and pressurises the mains. Draws real power, and pressurises a fixed number of colonists — build more as the city grows.' },

  /* Civic buildings. Each projects a circle of coverage that falls off with
     distance, exactly as SimCity 2000's police and fire stations do, and the
     relevant department's funding scales how far that circle reaches. They
     all draw power, so a service-rich city needs a bigger grid. */
  { id: 'depot', name: 'Repair Depot', cost: 1200, group: 'service', service: 'safety',
    radius: 9, drawKw: 2,
    desc: 'Crews and spares. Ground inside its reach works off maintenance backlog instead of accumulating it.' },
  { id: 'medbay', name: 'Medbay', cost: 1650, group: 'service', service: 'health',
    radius: 10, drawKw: 3,
    desc: 'Clinical care. Ground inside its reach is worth markedly more to live on.' },
  { id: 'training', name: 'Training Centre', cost: 1900, group: 'service', service: 'education',
    radius: 11, drawKw: 3,
    desc: 'Schooling and certification. Raises land value, and skilled ground is what lets trade and industry densify.' },
  { id: 'lab', name: 'Research Lab', cost: 2600, group: 'service', service: 'research',
    radius: 9, drawKw: 4, era: 1,
    desc: 'Multiplies research banked by developed ground inside its reach — the fastest way to buy your way into the next era.' },
  { id: 'biodome', name: 'Biodome', cost: 1400, group: 'service', service: 'amenity',
    radius: 7, drawKw: 3,
    desc: 'Green space under glass, descended directly from Lunar Farm. Nothing lifts land value faster, and it scrubs dust out of the air around it.' },

  /* Wonders — one to a colony, ruinously expensive, and each tied to a piece
     of the terrain rather than droppable anywhere. They are the payoff for
     an era, and the reason to have sculpted the map you did. */
  { id: 'megadome', name: 'Lava-Tube Megadome', cost: 42000, group: 'wonder', era: 2,
    once: true, needsSkylight: true, drawKw: 18, housing: 900,
    desc: 'A sealed city built down into an intact lava tube — the most valuable real estate on the Moon, and the only structure that can use a skylight. Must be built beside one. Houses more people than any amount of surface zoning.' },
  /* ---- the rest of the wonders ----

     Every one is gated on terrain the player either found or sculpted, so a
     wonder is a reward for reading the map rather than a thing you buy when
     the number gets big enough. They reuse the existing systems: `service`
     and `radius` feed the same coverage fields the civic buildings do, `kw`
     feeds generation, `housing` and `exportIncome` feed the tally. */

  { id: 'elevator', name: 'Space Elevator', cost: 120000, group: 'wonder', era: 3,
    once: true, needsHeight: 11, drawKw: 45, exportIncome: 2400,
    service: 'amenity', radius: 16,
    desc: 'A tether run out to the L1 balance point. The Moon is one of the few places a space elevator is actually buildable with materials that exist — low gravity and no weather. Must stand on high ground, at least 11 levels up.' },

  { id: 'eiffel', name: 'Lunar Eiffel', cost: 46000, group: 'wonder', era: 2,
    once: true, needsLevel: 1, drawKw: 8,
    service: 'amenity', radius: 20,
    desc: 'A wrought lattice tower, built absurdly tall because at one sixth of a gravity it can be. Pure civic pride, and the land around it knows it. Needs level ground.' },

  { id: 'telescope', name: 'Far-Side Radio Telescope', cost: 72000, group: 'wonder', era: 2,
    once: true, needsShadow: true, drawKw: 18, researchPerDay: 34,
    service: 'research', radius: 12,
    desc: 'A wire mesh strung across a crater that shields it from Earth\'s radio noise — the real Lunar Crater Radio Telescope proposal. Must sit on a permanently shadowed crater floor.' },

  { id: 'heliostat', name: 'Heliostat Crown', cost: 88000, group: 'wonder', era: 2,
    once: true, needsPeakSun: true, kw: 110, drawKw: 6,
    desc: 'A ring of steerable mirrors on a peak of eternal light, throwing sunlight down onto the floor below. Must be built where the sun genuinely never sets.' },

  { id: 'arena', name: 'Olympus Arena', cost: 54000, group: 'wonder', era: 3,
    once: true, needsOpen: 2, drawKw: 14,
    service: 'amenity', radius: 22,
    desc: 'Flying sports, only possible at one sixth of a gravity. Needs a clear, level five-by-five site — nobody wants the upper tiers looking at a crater wall.' },

  { id: 'arcology', name: 'Launch Arcology', cost: 210000, group: 'wonder', era: 3,
    once: true, needsLaunchPad: true, drawKw: 60, housing: 2600, departsEvery: 220,
    desc: 'A self-contained tower of tens of thousands, built to leave. SimCity 2000\'s Launch Arcologies eventually lifted off with their residents aboard; this one dispatches a colony ship every so often and keeps filling back up. Must be built beside a launch complex.' },

  { id: 'massdriver', name: 'Mass Driver', cost: 68000, group: 'wonder', era: 3,
    once: true, needsRidge: true, drawKw: 30, exportIncome: 640,
    desc: 'An electromagnetic launch track flinging refined cargo to Earth orbit without rockets. Needs a long, high, level run to sit on, and pays a standing export income once it does.' },

  /* ---- the deep arcologies ----

     SimCity 2000's arcologies were self-contained megastructures that housed
     a city inside one building. These are the lunar answer, and they go the
     other way: DOWN. A bore is sunk into a permanently shadowed crater floor
     and the habitation is terraced around the void, which is roughly what
     every serious proposal for long-term lunar settlement actually suggests
     — a few metres of regolith over your head is the cheapest radiation
     shielding available, and the temperature underground stops swinging.

     They are the first structures in the game that CONSUME a deposit. Ice
     only survives where the sun genuinely never reaches (see terrain.js's
     seedDeposits), so requiring ice puts them on exactly the ground the rest
     of the game has no use for: a shadowed floor earns nothing as land value
     and generates nothing from solar. Going down inverts that — the worst
     surface on the map becomes the best interior in the colony, and every
     watt has to be conduited in across the dark from a peak of eternal light
     or a reactor.

     Unlike every other wonder they do not open finished. One arrives as a
     collar and a single gallery and then sinks a level at a time, but only
     while all three networks reach it and the colony is neither browning out
     nor short of air — the same gate zoned ground grows under. Brown out the
     grid and the digging stops where it is; it never loses what it opened.

     `*PerLevel` fields are therefore rates, not totals: multiply by
     `t.b.levels`. `air` and `export` are additionally scaled by how much ice
     is actually within reach — see deep.js's iceYield.

     `needsIceRichness` is 0.62 wherever it appears, and that is not an
     arbitrary round number. seedDeposits derives richness from sun exposure,
     and because the sun raycast is quantised the result is bimodal: a
     shadowed tile is either around 0.5-0.6 or around 0.85, with nothing in
     between. 0.62 is the only value that can separate the two at all —
     anything from 0.66 to 0.85 selects exactly the same tiles, and anything
     at or below 0.5 selects all of them.

     It does not, on a generated map, refuse any site the pad requirement
     would have accepted: measured across seeds, EVERY tile flat enough for a
     3x3 pad already carries ice at 0.62 or better, because the lean ice lies
     on crater slopes and slopes are never level. What it actually gates is
     the sculpted case — levelling a pad out of a partially shadowed slope and
     dropping a cistern on it. That is the right thing to refuse, and it is
     worth knowing that this gate is quiet until a player goes looking for
     it. */

  { id: 'sinkwell', name: 'Sinkwell Arcology', cost: 64000, group: 'deep', era: 2,
    once: true, needsIce: true, needsPad: 1,
    maxLevels: 10, digDays: 24, drawKw: 34,
    housingPerLevel: 110, jobsPerLevel: 30, airPerLevel: 8,
    service: 'amenity', radius: 8,
    desc: 'A terraced bore sunk into a shadowed ice floor, with habitation galleries stepping down around an open shaft. The cheapest way to put a lot of people underground, and it cracks a little of the ice it stands on for air. Must be built on water ice.' },

  { id: 'cistern', name: 'Cistern Arcology', cost: 82000, group: 'deep', era: 2,
    once: true, needsIce: true, needsIceRichness: 0.62, needsPad: 1,
    maxLevels: 8, digDays: 26, drawKw: 40,
    housingPerLevel: 60, jobsPerLevel: 22, airPerLevel: 34,
    service: 'amenity', radius: 14,
    desc: 'The ice is melted rather than mined: the floor of the shaft is a lit reservoir, ringed by grow-decks, with mirror masts on the surface throwing daylight down the bore onto it. Houses fewer people than the others and pressurises far more of them. Must be built on rich water ice.' },

  { id: 'foundry', name: 'Foundry Arcology', cost: 74000, group: 'deep', era: 2,
    once: true, needsIce: true, needsPad: 1,
    maxLevels: 9, digDays: 22, drawKw: 52,
    housingPerLevel: 45, jobsPerLevel: 60, airPerLevel: 0, exportPerLevel: 76,
    dustPerLevel: 0.03,
    desc: 'Electrolysis and smelting at the bottom of the shaft, hoists running the wall, and a working town wrapped around it. Employs more people than it houses and pays a standing export income — and vents fines at the surface that foul everything downrange. Must be built on water ice.' },

  { id: 'core', name: 'Core Arcology', cost: 245000, group: 'deep', era: 3,
    once: true, needsIce: true, needsIceRichness: 0.62, needsPad: 2,
    maxLevels: 14, digDays: 30, drawKw: 96,
    housingPerLevel: 175, jobsPerLevel: 55, airPerLevel: 18,
    service: 'amenity', radius: 20,
    desc: 'A cavern bored so deep it widens as it goes, with inverted towers hanging from its ceiling around a suspended sun-lamp. The largest structure the colony can build and the only one that houses a city rather than a district. Needs a clear five-by-five pad over the richest ice on the map.' }
];

/* The five coverage services a civic building can project. Each names the
   department whose funding scales its reach, so cutting a budget visibly
   shrinks the circles on the map. */
const SERVICES = [
  { id: 'safety', name: 'Repair Cover', dept: 'safety', colour: '#ff9f6e' },
  { id: 'health', name: 'Medical Cover', dept: 'safety', colour: '#ff7a9c' },
  { id: 'education', name: 'Training Cover', dept: 'science', colour: '#8fd0ff' },
  { id: 'research', name: 'Research Cover', dept: 'science', colour: '#c98bff' },
  { id: 'amenity', name: 'Amenity', dept: 'transit', colour: '#6ee7a0' }
];

/* Eras. A colony earns its way forward by growing AND by funding research —
   both thresholds must be met, which is what stops the science dial being
   something a player can safely zero out forever.

   An era does three things: it raises the ceiling on how far any ground can
   develop, it unlocks buildings, and it changes what the city looks like.
   That last one is the point. Capping density by era is what gives the game
   an arc — you cannot build a skyline on day one, you have to become the
   kind of city that has one. */
const ERAS = [
  { id: 'outpost', name: 'Outpost', pop: 0, research: 0, stageCap: 1,
    blurb: 'Bermed cans and pressurised shelters. Everything is temporary, and looks it.' },
  { id: 'settlement', name: 'Settlement', pop: 60, research: 120, stageCap: 2,
    blurb: 'Proper domes with viewports, joined by surface walkways. The colony starts to look permanent.' },
  { id: 'colony', name: 'Colony', pop: 180, research: 500, stageCap: 3,
    blurb: 'Multi-dome clusters and mid-rise blocks with lit windows and radiator fins.' },
  { id: 'metropolis', name: 'Metropolis', pop: 450, research: 1400, stageCap: 4,
    blurb: 'Towers, skyways between the dense blocks, and a skyline worth the name.' }
];

/* The disaster deck, rethemed for a city rather than a survival base.

   Each one damages the city in a different currency, so no single defence
   answers all four: the meteor takes ground, the blowout takes networks, the
   dust surge takes economy, and the flare takes power. All four are survivable
   and repairable — none can end a run.

   `mitigatedBy` names the coverage field that reduces the damage, which is
   what gives the Safety & Repair budget a second job besides holding density.

   A note on the dust event: the Moon has no wind, so there are no dust storms
   in the terrestrial sense. What it does have is electrostatic dust transport
   — UV and solar-wind charging lofts fine grains above the surface, seen as
   Surveyor's "horizon glow" and reported by Apollo crews near the terminator.
   That is the real phenomenon this event models, hence the name. */
const DISASTERS = [
  { id: 'blowout', name: 'Seal Blowout', glyph: '💨', weight: 1.6, minDay: 25,
    mitigatedBy: 'safety',
    desc: 'A pressure seal lets go. The atmosphere mains around it vent to vacuum and the district above them loses density until the run is relaid.' },

  { id: 'dustsurge', name: 'Electrostatic Dust Surge', glyph: '🌫', weight: 1.4, minDay: 20,
    mitigatedBy: 'safety',
    desc: 'Charged regolith lofts off the surface and settles over everything downrange, fouling solar arrays and dragging land value down until it clears.' },

  { id: 'flare', name: 'Solar Flare', glyph: '⚡', weight: 1.2, minDay: 30,
    mitigatedBy: 'safety',
    desc: 'A particle event forces the grid into protective shutdown. Generation is cut city-wide for several days, but nothing is destroyed.' },

  { id: 'meteor', name: 'Meteor Strike', glyph: '☄', weight: 0.8, minDay: 40,
    mitigatedBy: 'safety',
    desc: 'A meteoroid gets through. Everything inside the crater is gone and the ground itself is rewritten — the only event that changes the terrain.' }
];

/* The Invasion deck — a second, entirely separate roster from DISASTERS.

   Kept apart on purpose. The disaster deck is grounded and is what the CoSE
   Academy module leans on; this one is a 1950s B-movie and has its own
   toggle, so a player choosing one is never forced into the other.

   Every character here is a public-domain pulp archetype — flying saucers,
   tractor beams, burrowing monsters, body snatchers — drawn originally. No
   named or licensed characters: the chrome figure on a board is an archetype
   older and broader than any one publisher's version of it, so this one is
   the Chrome Herald, with its own design and its own joke.

   The joke being that it is filed under invasions and is entirely good news. */
const INVASIONS = [
  { id: 'circles', name: 'Crop Circles', glyph: '◎', weight: 1.6, minDay: 15,
    harmless: true,
    desc: 'Geometric figures appear pressed into the regolith overnight. Nobody saw anything. Nothing is damaged and no one can explain them.' },

  { id: 'ufo', name: 'UFO Raid', glyph: '🛸', weight: 1.3, minDay: 40,
    desc: 'A saucer crosses the city at low altitude with a cutting beam lit, and burns a line straight through whatever was under it.' },

  { id: 'abduction', name: 'Abduction Beam', glyph: '🔦', weight: 1.1, minDay: 35,
    desc: 'A tractor beam settles over one structure and lifts it clean off the Moon, leaving a suspiciously tidy circle of swept ground.' },

  { id: 'herald', name: 'The Chrome Herald', glyph: '✧', weight: 0.9, minDay: 30,
    boon: true,
    desc: 'A silver figure on a board passes overhead trailing light, and every speck of regolith dust in the district goes with it. The arrays have never been cleaner. Filed here for want of anywhere better to put it.' },

  { id: 'worm', name: 'Regolith Worm', glyph: '🪱', weight: 0.9, minDay: 55,
    desc: 'Something enormous surfaces, crosses the city and goes back under, leaving a trench where it went.' },

  { id: 'snatchers', name: 'Body Snatchers', glyph: '🌱', weight: 0.8, minDay: 45,
    desc: 'The residents of a district are all subtly, politely wrong. Land value collapses. It wears off, mostly.' }
];

/* City departments. Each dial runs 0..100% and every one of them has a real,
   present-tense effect — there are no placeholder sliders here. Funding a
   department costs credits every day in proportion to how much of that
   department's infrastructure exists, so a bigger city genuinely costs more
   to run, which is the pressure the tax rate exists to answer.

   `rate` is credits per day, per unit of upkeep, at full funding. */
const DEPARTMENTS = [
  { id: 'power', name: 'Power Grid', rate: 0.85,
    effect: 'Underfunded, the grid delivers less than its rated output — the same arrays produce less usable power.',
    unit: 'generators and conduits' },
  { id: 'air', name: 'Atmosphere', rate: 1.05,
    effect: 'Underfunded, plants pressurise fewer colonists than their rating, tightening the population ceiling.',
    unit: 'oxygen plants and mains' },
  { id: 'transit', name: 'Transit', rate: 0.30,
    effect: 'Underfunded, tube access is worth less to the ground it serves, dragging land value down.',
    unit: 'transit tubes' },
  { id: 'safety', name: 'Safety & Repair', rate: 0.55,
    effect: 'Underfunded, a maintenance backlog builds and developed ground slowly loses the density it gained.',
    unit: 'developed tiles' },
  { id: 'science', name: 'Science', rate: 0.70,
    effect: 'Funds research. Accumulated findings are what later unlock the next era of construction.',
    unit: 'developed tiles' }
];

/* Tool roster. Terrain sculpting, the three networks, generation and life
   support, and the six zoning brushes. */
const TOOLS = [
  { id: 'inspect', name: 'Inspect', glyph: '🔍', key: '1', group: 'terrain',
    hint: 'Click any tile to read its height, sunlight, services and deposits.' },
  { id: 'raise', name: 'Raise Land', glyph: '▲', key: '2', group: 'terrain',
    hint: 'Raise ground one level. Neighbours are pulled up to keep the slope walkable.' },
  { id: 'lower', name: 'Lower Land', glyph: '▼', key: '3', group: 'terrain',
    hint: 'Lower ground one level. Neighbours are pulled down to keep the slope walkable.' },
  { id: 'level', name: 'Level Land', glyph: '▬', key: '4', group: 'terrain',
    hint: 'Flatten toward the first tile you click — the tool for cutting building pads.' },
  { id: 'clear', name: 'Clear Boulders', glyph: '✖', key: '5', group: 'terrain',
    hint: 'Clear a boulder field back to open regolith.' },

  { id: 'tube', name: 'Transit Tube', glyph: '═', key: 'T', group: 'network', build: 'tube', drag: 'line' },
  { id: 'conduit', name: 'Power Conduit', glyph: '⌇', key: 'C', group: 'network', build: 'conduit', drag: 'line' },
  { id: 'main', name: 'Atmosphere Main', glyph: '┅', key: 'A', group: 'network', build: 'main', drag: 'line' },

  { id: 'solar', name: 'Solar Array', glyph: '☀', key: 'S', group: 'plant', build: 'solar' },
  { id: 'reactor', name: 'Fission Plant', glyph: '⚛', key: 'F', group: 'plant', build: 'reactor' },
  { id: 'o2', name: 'Oxygen Plant', glyph: '◍', key: 'O', group: 'plant', build: 'o2' },

  { id: 'depot', name: 'Repair Depot', glyph: '🛠', key: 'Z', group: 'service', build: 'depot' },
  { id: 'medbay', name: 'Medbay', glyph: '✚', key: 'M', group: 'service', build: 'medbay' },
  { id: 'training', name: 'Training Centre', glyph: '🎓', key: 'N', group: 'service', build: 'training' },
  { id: 'lab', name: 'Research Lab', glyph: '🔬', key: 'B', group: 'service', build: 'lab' },
  { id: 'biodome', name: 'Biodome', glyph: '🌿', key: 'V', group: 'service', build: 'biodome' },

  { id: 'megadome', name: 'Lava-Tube Megadome', glyph: '◈', key: 'J', group: 'wonder', build: 'megadome' },
  { id: 'massdriver', name: 'Mass Driver', glyph: '⇗', key: 'K', group: 'wonder', build: 'massdriver' },
  { id: 'elevator',  name: 'Space Elevator',  glyph: '↥', key: 'L', group: 'wonder', build: 'elevator' },
  { id: 'eiffel',    name: 'Lunar Eiffel',    glyph: '⩕', key: 'P', group: 'wonder', build: 'eiffel' },
  { id: 'telescope', name: 'Radio Telescope', glyph: '◠', key: 'H', group: 'wonder', build: 'telescope' },
  { id: 'heliostat', name: 'Heliostat Crown', glyph: '❈', key: 'I', group: 'wonder', build: 'heliostat' },
  /* Digits, because every letter on the keyboard is already a tool — the
     first TOOLS entry matching a key wins, so a duplicate would silently
     shadow whichever tool was declared earlier. */
  { id: 'arena',     name: 'Olympus Arena',   glyph: '◎', key: '6', group: 'wonder', build: 'arena' },
  { id: 'arcology',  name: 'Launch Arcology', glyph: '⬢', key: '7', group: 'wonder', build: 'arcology' },

  /* The deep arcologies run on past the digits into the key beside them,
     because 1-5 are the terrain tools and 6-7 are already spoken for above.
     They are their own palette group rather than more wonders: they share a
     siting rule (ice), a lifecycle (they sink over time) and a silhouette,
     and reading them as one family is the point. */
  { id: 'sinkwell', name: 'Sinkwell Arcology', glyph: '◉', key: '8', group: 'deep', build: 'sinkwell' },
  { id: 'cistern',  name: 'Cistern Arcology',  glyph: '◍', key: '9', group: 'deep', build: 'cistern' },
  { id: 'foundry',  name: 'Foundry Arcology',  glyph: '◭', key: '0', group: 'deep', build: 'foundry' },
  { id: 'core',     name: 'Core Arcology',     glyph: '◎', key: '-', group: 'deep', build: 'core' },

  { id: 'hab_low',   name: 'Habitation · Low',  glyph: '▨', key: 'Q', group: 'zone', zone: 'hab',      density: 'low',  drag: 'rect' },
  { id: 'hab_high',  name: 'Habitation · High', glyph: '▧', key: 'W', group: 'zone', zone: 'hab',      density: 'high', drag: 'rect' },
  { id: 'trade_low', name: 'Trade · Low',       glyph: '▨', key: 'E', group: 'zone', zone: 'trade',    density: 'low',  drag: 'rect' },
  { id: 'trade_high',name: 'Trade · High',      glyph: '▧', key: 'R', group: 'zone', zone: 'trade',    density: 'high', drag: 'rect' },
  { id: 'ind_low',   name: 'Industry · Low',    glyph: '▨', key: 'D', group: 'zone', zone: 'industry', density: 'low',  drag: 'rect' },
  { id: 'ind_high',  name: 'Industry · High',   glyph: '▧', key: 'G', group: 'zone', zone: 'industry', density: 'high', drag: 'rect' },

  { id: 'military', name: 'Military Base',   glyph: '★', key: 'Y', group: 'district', zone: 'military', density: 'low', drag: 'rect' },
  { id: 'launch',   name: 'Launch Complex', glyph: '▲', key: 'U', group: 'district', zone: 'launch',   density: 'low', drag: 'rect' },

  { id: 'bulldoze', name: 'Bulldoze', glyph: '💥', key: 'X', group: 'terrain',
    hint: 'Remove whatever is on a tile — zoning, network or structure.' }
];

window.LM_DATA = { K, TERRAIN, DEPOSITS, ZONES, ERAS, BUILDINGS, DEPARTMENTS, SERVICES, TOOLS, DISASTERS, INVASIONS };
