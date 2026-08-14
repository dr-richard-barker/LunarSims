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
  MIGRATION_CAP: 8,

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

  /* ---- AI auto-play ----
     Block spacing for the director's lattice. Tube streets every third row
     put every tile within one of a tube, which is the adjacency the growth
     model needs. */
  AI_BLOCK: 3,
  AI_CONDUIT_EVERY: 6,     // conduit columns are sparser; developed ground carries the rest
  AI_RESERVE_FLOOR: 2500,  // never spend the treasury below this
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
      { jobs: 74, income: 220, upkeep: 30 }] } }
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
  { id: 'massdriver', name: 'Mass Driver', cost: 68000, group: 'wonder', era: 3,
    once: true, needsRidge: true, drawKw: 30, exportIncome: 640,
    desc: 'An electromagnetic launch track flinging refined cargo to Earth orbit without rockets. Needs a long, high, level run to sit on, and pays a standing export income once it does.' }
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

  { id: 'hab_low',   name: 'Habitation · Low',  glyph: '▨', key: 'Q', group: 'zone', zone: 'hab',      density: 'low',  drag: 'rect' },
  { id: 'hab_high',  name: 'Habitation · High', glyph: '▧', key: 'W', group: 'zone', zone: 'hab',      density: 'high', drag: 'rect' },
  { id: 'trade_low', name: 'Trade · Low',       glyph: '▨', key: 'E', group: 'zone', zone: 'trade',    density: 'low',  drag: 'rect' },
  { id: 'trade_high',name: 'Trade · High',      glyph: '▧', key: 'R', group: 'zone', zone: 'trade',    density: 'high', drag: 'rect' },
  { id: 'ind_low',   name: 'Industry · Low',    glyph: '▨', key: 'D', group: 'zone', zone: 'industry', density: 'low',  drag: 'rect' },
  { id: 'ind_high',  name: 'Industry · High',   glyph: '▧', key: 'G', group: 'zone', zone: 'industry', density: 'high', drag: 'rect' },

  { id: 'bulldoze', name: 'Bulldoze', glyph: '💥', key: 'X', group: 'terrain',
    hint: 'Remove whatever is on a tile — zoning, network or structure.' }
];

window.LM_DATA = { K, TERRAIN, DEPOSITS, ZONES, ERAS, BUILDINGS, DEPARTMENTS, SERVICES, TOOLS, DISASTERS };
