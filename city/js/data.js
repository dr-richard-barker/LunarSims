/* Artemis City — static game data.
   Shackleton Crater Colony: sited on the rim for near-constant sun, with the
   permanently shadowed floor below holding the water ice that is the whole
   reason Artemis missions target this pole. Zoning/growth numbers are
   balanced for play, not measured; the crop roster and deposit notes below
   are grounded in real spaceflight and lunar-ISRU work, same as Lunar Farm's. */

const K = {
  /* The generated world is much bigger than the founding survey — COLS/ROWS
     is the full map, REVEAL_HALF_* is how much of it is charted (buildable)
     at founding, centred on the Command Module. Expanding the survey later
     reveals more of this same pre-generated world rather than resizing the
     map array, which is what keeps every tile-index calculation in this
     codebase safe to leave untouched. */
  COLS: 80,
  ROWS: 56,
  REVEAL_HALF_W: 20,
  REVEAL_HALF_H: 14,
  REVEAL_STEP: 10,           // tiles added in each direction per expansion
  EXPAND_FILL_THRESHOLD: 0.5, // fraction of buildable revealed ground filled before expansion unlocks
  EXPAND_BASE_COST: 4000,
  EXPAND_COST_PER_TILE: 3,   // extra credits per newly-revealed tile
  TILE: 64,
  HOURS_PER_DAY: 24,
  LUNAR_CYCLE: 29.5,       // Earth days, sunlit for the first half

  POP_KCAL: 2600,          // per colonist per day
  POP_O2: 0.82,            // kg per colonist per day
  POP_CO2: 0.96,           // kg per colonist per day
  POP_WATER: 3.2,          // L per colonist per day

  BASE_GRID_KW: 4.0,       // colony hotel load, independent of population
  POP_KW: 0.16,            // kW per colonist housed
  JOB_KW: 0.05,             // kW per job (trade + industry)
  LED_KW: 0.12,             // kW per greenhouse tile, same fixture as Lunar Farm

  ZONE_SCALE: 42,           // demand-index scaling divisor
  MAX_STAGE: 4,             // highest per-tile zone growth stage (0..4)

  ISRU_KW: 3.0,             // draw of the water/prop plant while it runs
  MINER_KW: 0.4             // draw per mining rig
};

/* Reused near-verbatim from Lunar Farm — the Agriculture zone is the same
   grow-hall model, same crop roster, so the city's food loop is a direct
   continuation of the farming game rather than a reinvention.
   kind drives how a plant is drawn: leafy | fruit | grain | root | flower | algae | research */
const CROPS = [
  { id: 'romaine', name: 'Red Romaine', cultivar: "'Outredgeous'", kind: 'leafy',
    days: 28, dli: 17, water: 2.6, nutrients: 1.0, kcal: 1500, value: 190,
    o2: 1.0, morale: 6, science: 1, seed: 120, radSens: 0.5, colour: '#b8434f',
    note: "The red lettuce grown in Veggie on the ISS and eaten in orbit in 2015." },
  { id: 'mizuna', name: 'Mizuna Mustard', cultivar: '', kind: 'leafy',
    days: 22, dli: 15, water: 2.4, nutrients: 0.9, kcal: 1200, value: 155,
    o2: 0.95, morale: 5, science: 1, seed: 95, radSens: 0.45, colour: '#5faa4a',
    note: "Fast leafy green flown on the ISS; tolerates repeated cut-and-come-again harvests." },
  { id: 'tomato', name: 'Dwarf Tomato', cultivar: "'Red Robin'", kind: 'fruit',
    days: 84, dli: 24, water: 4.4, nutrients: 1.9, kcal: 3400, value: 780,
    o2: 1.5, morale: 16, science: 3, seed: 340, radSens: 0.6, colour: '#e0553c',
    note: "The dwarf tomato of the VEG-05 experiment — the first fruiting crop grown to harvest on station." },
  { id: 'radish', name: 'Radish', cultivar: "'Cherry Belle'", kind: 'root',
    days: 27, dli: 18, water: 2.8, nutrients: 1.2, kcal: 1100, value: 210,
    o2: 1.0, morale: 7, science: 2, seed: 130, radSens: 0.5, colour: '#c8446a',
    note: "Plant Habitat-04 grew radishes in 2020; quick, and the whole plant is usable." },
  { id: 'wheat', name: 'Dwarf Wheat', cultivar: "'USU-Apogee'", kind: 'grain',
    days: 70, dli: 30, water: 4.0, nutrients: 1.8, kcal: 8200, value: 520,
    o2: 1.8, morale: 3, science: 2, seed: 260, radSens: 0.35, colour: '#d9b452',
    note: "A short-stature wheat bred at Utah State specifically for controlled-environment life support." },
  { id: 'potato', name: 'Potato', cultivar: "'Norland'", kind: 'root',
    days: 95, dli: 26, water: 4.2, nutrients: 1.7, kcal: 12500, value: 610,
    o2: 1.7, morale: 6, science: 2, seed: 300, radSens: 0.4, colour: '#c9a86a',
    note: "The calorie workhorse of every closed life-support study since the 1980s." },
  { id: 'soybean', name: 'Soybean', cultivar: "'Hoyt'", kind: 'grain',
    days: 88, dli: 28, water: 3.9, nutrients: 1.9, kcal: 9600, value: 690,
    o2: 1.7, morale: 5, science: 3, seed: 320, radSens: 0.45, colour: '#a8bf5c',
    note: "Soybean was grown to seed on the ISS in Advanced Astroculture — protein and oil in one crop." },
  { id: 'zinnia', name: 'Zinnia', cultivar: '', kind: 'flower',
    days: 60, dli: 20, water: 3.0, nutrients: 1.3, kcal: 0, value: 120,
    o2: 1.1, morale: 26, science: 2, seed: 150, radSens: 0.7, colour: '#e8994b',
    note: "Flowered on the ISS in 2016 after a fungal scare — a study in crew morale as much as botany." },
  { id: 'duckweed', name: 'Duckweed', cultivar: 'Wolffia', kind: 'algae',
    days: 16, dli: 12, water: 3.4, nutrients: 1.1, kcal: 2200, value: 180,
    o2: 1.4, morale: 1, science: 2, seed: 90, radSens: 0.3, colour: '#6fbf7a',
    note: "Doubles in days, edible whole, and needs no harvesting machinery." },
  { id: 'spirulina', name: 'Spirulina', cultivar: 'A. platensis', kind: 'algae',
    days: 14, dli: 13, water: 3.8, nutrients: 1.4, kcal: 2600, value: 250,
    o2: 2.2, morale: -2, science: 3, seed: 140, radSens: 0.25, colour: '#3f9f8a',
    note: "The photosynthetic compartment of the MELiSSA loop: oxygen and protein, at the cost of morale." }
];

/* The three growth zones. Painting a rectangle zones the ground; the city
   itself builds up each tile's density over time, one stage at a time, the
   way SimCity2000's RCI zones develop rather than the player placing a
   finished building. Agriculture is not here — it keeps Lunar Farm's
   single-crop grow-hall model in BUILDINGS/sim.js instead, because a zoned
   tile growing unevenly makes no sense for one shared crop. */
const ZONES = [
  { id: 'hab', name: 'Habitation Zone', costPerTile: 70, key: 'H',
    desc: 'Ground set aside for colonists. Pods rise on their own as jobs pull people in — you are zoning land, not building housing directly.',
    stages: [
      { pop: 0, upkeep: 0 },
      { pop: 3, upkeep: 2 },
      { pop: 7, upkeep: 5 },
      { pop: 13, upkeep: 9 },
      { pop: 20, upkeep: 14 }
    ] },
  { id: 'trade', name: 'Trade Zone', costPerTile: 80, key: 'R',
    desc: 'Depots, mess halls and the exchange floor. Grows with population — colonists want somewhere to spend and something to do.',
    stages: [
      { jobs: 0, income: 0, upkeep: 0 },
      { jobs: 3, income: 9, upkeep: 2 },
      { jobs: 7, income: 24, upkeep: 5 },
      { jobs: 13, income: 46, upkeep: 9 },
      { jobs: 20, income: 74, upkeep: 14 }
    ] },
  { id: 'industry', name: 'Industrial Zone', costPerTile: 90, key: 'I',
    desc: 'Fabrication, processing and eventually ore refining. Grows with export opportunity as much as with population.',
    stages: [
      { jobs: 0, income: 0, upkeep: 0 },
      { jobs: 4, income: 14, upkeep: 3 },
      { jobs: 9, income: 34, upkeep: 7 },
      { jobs: 16, income: 64, upkeep: 12 },
      { jobs: 24, income: 100, upkeep: 18 }
    ] }
];

/* Structures placed on a single tile (or dragged as a line/hall). `once`
   means the colony only ever needs one. Mining, ISRU processing and the
   launch pad are added in a later pass once the export economy lands —
   this roster covers roads, power, and the Agriculture zone. */
const BUILDINGS = [
  { id: 'track', name: 'Surface Road', cost: 100, line: true, key: 'T', group: 'roads',
    desc: 'Graded regolith road. Zoned ground and modules must touch a road reaching the Command Module, or nothing develops.' },
  { id: 'rail', name: 'Rail Line', cost: 280, line: true, key: 'L', group: 'roads',
    desc: 'Bulk haulage on rails. Services like a road, and gives Industrial tiles it touches a throughput bonus.' },
  { id: 'command', name: 'Command Module', cost: 0, once: true, hidden: true, key: 'M',
    desc: 'Mission control. Root of the road network — placed automatically at colony founding.' },
  { id: 'greenhouse', name: 'Grow Hall', cost: 500, perTile: true, drag: true, zone: 'ag', key: 'G', group: 'zones',
    desc: 'Drag out a pressurised grow hall of any size, exactly as in Lunar Farm. Crops fill the whole hall; cost, yield and draw scale with its footprint.' },
  { id: 'zone_hab', name: 'Habitation Zone', cost: 70, perTile: true, drag: true, zone: 'hab', key: 'H', group: 'zones',
    desc: ZONES[0].desc },
  { id: 'zone_trade', name: 'Trade Zone', cost: 80, perTile: true, drag: true, zone: 'trade', key: 'R', group: 'zones',
    desc: ZONES[1].desc },
  { id: 'zone_industry', name: 'Industrial Zone', cost: 90, perTile: true, drag: true, zone: 'industry', key: 'I', group: 'zones',
    desc: ZONES[2].desc },
  { id: 'solar', name: 'Solar Array', cost: 2200, key: 'S', group: 'power',
    desc: '+2.5 kW peak while the sun is up. Worth nothing at lunar night.' },
  { id: 'battery', name: 'Battery Bank', cost: 1500, key: 'B', group: 'power',
    desc: '+60 kWh of storage to carry load into the dark.' },
  { id: 'reactor', name: 'Fission Surface Power', cost: 14000, once: true, key: 'F', group: 'power',
    desc: 'A Kilopower-class reactor: 9 kW day and night. Ends the night problem for the whole grid.' },
  { id: 'miner', name: 'Mining Rig', cost: 1800, deposit: true, key: 'D', group: 'mining',
    desc: 'Only sits on surveyed ground. Pulls whatever the survey found — regolith, ice or helium-3 — at a rate set by how rich the deposit is. Idles during a brownout like everything else on the grid.' },
  { id: 'isru', name: 'ISRU Water & Prop Plant', cost: 7500, once: true, key: 'P', group: 'mining',
    desc: 'Electrolysis and Sabatier-style processing, cracking water out of stockpiled ice. Draws real power and needs ice on hand to run.' },
  { id: 'spaceport', name: 'Launch Pad', cost: 9000, once: true, instance: true, key: 'X', group: 'mining',
    desc: 'Build it, load it, launch it. Loads whatever is in the yard — helium-3 first, then regolith, then any food surplus — and converts it to credits on a cooldown, same as a real launch cadence.' }
];

/* Deposits are surveyed in at map generation and mined in a later pass.
   Distribution follows the real geology as far as a playable map allows:
   regolith is everywhere, ice concentrates in permanent shadow, helium-3 is
   rare and patchy. */
const DEPOSITS = [
  { id: 'regolith', name: 'Regolith', colour: '#9a9088',
    note: 'Loose lunar soil, ubiquitous but variable in how easily it yields useful volatiles.' },
  { id: 'ice', name: 'Water Ice', colour: '#bfe3f2',
    note: 'Mixed into regolith on permanently shadowed crater floors near the pole — the resource the Artemis program is actually chasing.' },
  { id: 'he3', name: 'Helium-3', colour: '#e8c96b',
    note: 'Solar-wind particles implanted in mature, sun-exposed regolith over billions of years — a speculative but often-cited fusion feedstock.' }
];

/* Disaster deck. Wholly optional — toggling Disasters off in the HUD stops
   the daily roll outright, same switch shape as Free Mode. Each entry
   returns a modal with two or more choices, same convention as Lunar Farm's
   EVENTS, re-themed for a city instead of a single farm plot. */
const EVENTS = [
  { id: 'spe', weight: 10, minDay: 10,
    title: 'Solar Particle Event',
    text: 'A flare on the near limb. Surface radiation flux is climbing fast, and half the colony is still unshielded regolith-and-glass construction.',
    choices: [
      { label: 'Shelter the colony', effect: 'spe_shelter', hint: 'Grid load drops for 12 hours while everyone shelters. No harm done.' },
      { label: 'Keep the colony running', effect: 'spe_ride', hint: 'No lost output, but a health and land-value hit across unshielded zones.' }
    ] },
  { id: 'micro', weight: 9, minDay: 6,
    title: 'Micrometeorite Strike',
    text: 'Something small and very fast came down on the eastern spur. A stretch of road is cratered and impassable.',
    choices: [
      { label: 'Regrade it now (2 spares)', effect: 'micro_fix', hint: 'Costs spares. The road is back to full service immediately.' },
      { label: 'Route around it for now', effect: 'micro_ignore', hint: 'That stretch stops carrying service until it is repaired.' }
    ] },
  { id: 'dust', weight: 8, minDay: 4,
    title: 'Regolith on the Arrays',
    text: 'A cargo lander came down hard two kilometres out and threw a sheet of fines across the array field.',
    choices: [
      { label: 'Send a crew to clean', effect: 'dust_clean', hint: 'A day of work, but the arrays come back to full output.' },
      { label: 'Live with the loss', effect: 'dust_ignore', hint: 'Solar output stays degraded until someone deals with it.' }
    ] },
  { id: 'quake', weight: 6, minDay: 20,
    title: 'Moonquake',
    text: 'A shallow moonquake rattles the rim — rare, but Shackleton\'s slopes are not as dead as they look. Foundations across one district have shifted.',
    choices: [
      { label: 'Emergency-brace the district (1,200 cr)', effect: 'quake_brace', hint: 'Pays down the structural damage before it costs any density.' },
      { label: 'Assess and repair later', effect: 'quake_ignore', hint: 'The hardest-hit tiles lose a stage of development.' }
    ] },
  { id: 'breach', weight: 7, minDay: 8,
    title: 'Dome Seal Failure',
    text: 'Pressure telemetry is drifting down in the habitation ring. A seal has let go somewhere along the seam.',
    choices: [
      { label: 'Patch it now (2 spares)', effect: 'breach_fix', hint: 'Costs spares and a few hours. Pressure holds.' },
      { label: 'Log it and carry on', effect: 'breach_ignore', hint: 'Pressure keeps bleeding until someone deals with it.' }
    ] },
  { id: 'busfault', weight: 6, minDay: 15,
    title: 'Power Bus Fault',
    text: 'An arc in the main distribution trunk. Half the battery string is isolated until someone rebuilds the connector.',
    choices: [
      { label: 'Rebuild it (3 spares)', effect: 'bus_fix', hint: 'Restores full storage.' },
      { label: 'Run degraded', effect: 'bus_ignore', hint: 'Storage stays halved until repaired.' }
    ] },
  { id: 'resupply', weight: 8, minDay: 3,
    title: 'Resupply Window',
    text: 'A lander is inbound with spare mass to trade. The broker will deal in either direction while the window is open.',
    choices: [
      { label: 'Buy 10 spares and 300 L water (2,400 cr)', effect: 'res_buy', hint: 'Stock up while you can.' },
      { label: 'Sell surplus produce at a premium', effect: 'res_sell', hint: 'Converts stored food into credits.' },
      { label: 'Wave it past', effect: 'none', hint: '' }
    ] },
  { id: 'review', weight: 7, minDay: 25,
    title: 'Programme Review',
    text: 'Someone from the programme office is coming through on the next rotation, with a clipboard and a view about whether this colony is worth its manifest slot.',
    choices: [
      { label: 'Show them the whole colony', effect: 'review_full', hint: 'Judged on population and how developed your zones are. A thriving colony is rewarded; a struggling one is not.' },
      { label: 'Keep the tour short', effect: 'review_brief', hint: 'A modest fee either way.' }
    ] },
  { id: 'transfer', weight: 6, minDay: 18,
    title: 'Colonist Transfer',
    text: 'A rotation crew wants to know if the colony can take on a few more hands before the next window closes.',
    choices: [
      { label: 'Accept them', effect: 'transfer_take', hint: 'A quick population bump, if the housing is there to hold it.' },
      { label: 'Decline for now', effect: 'transfer_decline', hint: 'No change either way.' }
    ] },
  { id: 'grant', weight: 6, minDay: 22,
    title: 'Research Grant Review',
    text: 'Earth wants a data package on the ISRU survey work. Accumulated science is worth something to a funding panel.',
    choices: [
      { label: 'Submit the dataset', effect: 'grant_take', hint: 'Trades 15 science for credits.' },
      { label: 'Hold the data back', effect: 'none', hint: 'Keep the science for later.' }
    ] }
];

const MILESTONES = [
  { id: 'founded', text: 'Found the colony', done: s => true },
  { id: 'firstzone', text: 'Zone your first tile', done: s => s.map.some(t => t.zone) },
  { id: 'firstpop', text: 'Welcome your first colonists', done: s => s.pop >= 1 },
  { id: 'ten', text: 'Grow the colony to ten', done: s => s.pop >= 10 },
  { id: 'fifty', text: 'Grow the colony to fifty', done: s => s.pop >= 50 },
  { id: 'hundred', text: 'Grow the colony to a hundred', done: s => s.pop >= 100 },
  { id: 'fullstage', text: 'Bring a tile to full density', done: s => s.map.some(t => t.zone && t.zone.stage >= K.MAX_STAGE) },
  { id: 'allzones', text: 'Develop all three zone types past stage one',
    done: s => ['hab', 'trade', 'industry'].every(k => s.map.some(t => t.zone && t.zone.kind === k && t.zone.stage >= 2)) },
  { id: 'reactor', text: 'Commission surface fission power',
    done: s => s.map.some(t => t.b && t.b.type === 'reactor') },
  { id: 'firstharvest', text: 'Bring in your first harvest', done: s => s.stats.harvests >= 1 },
  { id: 'firstmine', text: 'Sink your first mining rig', done: s => s.map.some(t => t.b && t.b.type === 'miner') },
  { id: 'isru', text: 'Commission the ISRU water plant', done: s => s.map.some(t => t.b && t.b.type === 'isru') },
  { id: 'spaceport', text: 'Raise the launch pad', done: s => s.map.some(t => t.b && t.b.type === 'spaceport') },
  { id: 'firstlaunch', text: 'Launch your first rocket to Earth', done: s => s.stats.launches >= 1 },
  { id: 'tenlaunches', text: 'Fly ten rockets to Earth', done: s => s.stats.launches >= 10 },
  { id: 'firstexpansion', text: 'Expand the survey charter beyond its founding bounds',
    done: s => s.revealed && (s.revealed.x1 - s.revealed.x0 + 1) > K.REVEAL_HALF_W * 2 + 1 },
  { id: 'year', text: 'Run the colony for a full Earth year', done: s => s.day >= 365 }
];

window.LC_DATA = { K, CROPS, ZONES, BUILDINGS, DEPOSITS, EVENTS, MILESTONES };
