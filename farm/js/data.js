/* Lunar Farm — static game data.
   Crop roster is drawn from plants that have actually been flown or are
   long-standing candidates for space life-support work. Most numbers below are
   balanced for play, not measured values — the exception is any crop carrying
   an `eden` block, whose cycle length and fresh yield are the ones measured in
   the EDEN ISS greenhouse in Antarctica in 2018 (Zabel et al. 2020, Front Plant
   Sci 11:656, doi:10.3389/fpls.2020.00656; NASA OSDR OSD-895). */

const K = {
  COLS: 24,
  ROWS: 16,
  TILE: 64,
  HOURS_PER_DAY: 24,
  LUNAR_CYCLE: 29.5,      // Earth days, sunlit for the first half
  CREW_KCAL: 2800,        // per crew per day
  CREW_O2: 0.84,          // kg per crew per day
  CREW_CO2: 1.0,          // kg per crew per day
  CREW_WATER: 3.5,        // L per crew per day
  BASE_LIFE_SUPPORT: 1.5, // kW
  LS_PER_CREW: 0.30,      // kW
  LED_KW: 0.12,        // kW per greenhouse TILE
  ISRU_KW: 3.0
};
/* Opening conditions live in sim.js newGame(). */

/* kind drives how a plant is drawn:
   leafy | fruit | grain | root | flower | algae | research | fibre | fungal | microbe

   Three optional flags change how a crop is simulated rather than drawn:
     dark      grows without lamps, so the lunar night costs it nothing
     respires  consumes oxygen and gives back carbon dioxide, the reverse of a plant
     residue   tonnes of spent straw and stover it eats per tile-cycle

   dli is the daily light, in mol/m²/d, the crop is happy at; it sets where the
   light-response curve bends (see sim.js). fresh is edible fresh mass in kg per
   m² for one full cycle at Standard light. harvest: 'spread' marks a cut-and-
   come-again crop: first cut at `days`, then a picking every `pick` days until
   the planting has stood `stand` days. eden carries the EDEN ISS measurement
   verbatim — cycle days, kg/m² per planting, g/m²/d, number of cycles n, and the
   light it was grown under — for the catalogue to show. src: 'est' marks a fresh
   yield estimated from the crop's calories rather than measured, and since: 9
   marks a crop that joined the roster with the EDEN ISS data. */
const CROPS = [
  {
    id: 'romaine', name: 'Red Romaine', cultivar: "'Outredgeous'", kind: 'leafy',
    days: 38, dli: 17, water: 2.6, nutrients: 1.0, kcal: 2035, value: 258,
    o2: 1.0, morale: 6, science: 1, seed: 120, radSens: 0.5, colour: '#b8434f',
    fresh: 2.10,
    eden: { cultivar: "'Outredgeous'", days: 37.9, kg: 2.10, gpd: 55.4, n: 14, ppfd: 330 },
    note: "The red lettuce grown in Veggie on the ISS and eaten in orbit in 2015 — and grown again in EDEN ISS, where fourteen cycles averaged 2.1 kg a square metre in 38 days."
  },
  {
    id: 'mizuna', name: 'Mizuna Mustard', cultivar: '', kind: 'leafy',
    days: 22, dli: 15, water: 2.4, nutrients: 0.9, kcal: 1200, value: 155,
    o2: 0.95, morale: 5, science: 1, seed: 95, radSens: 0.45, colour: '#5faa4a',
    fresh: 4.20, harvest: 'spread', pick: 10, stand: 119,
    eden: { days: 119, kg: 23.11, gpd: 194.2, n: 1, ppfd: 330 },
    note: "Fast leafy green flown on the ISS. EDEN ISS cut a single planting for 119 days and took 23 kg a square metre off it — cut-and-come-again at its best, if only from one cycle."
  },
  {
    id: 'bekana', name: 'Tokyo Bekana', cultivar: '', kind: 'leafy',
    days: 26, dli: 16, water: 2.7, nutrients: 1.0, kcal: 1350, value: 170,
    o2: 1.0, morale: 5, science: 1, seed: 105, radSens: 0.5, colour: '#8fc45a',
    fresh: 2.4, src: 'est',
    note: "A loose-leaf Chinese cabbage selected for Veggie for its short stature."
  },
  {
    id: 'pakchoi', name: 'Pak Choi', cultivar: "'Extra Dwarf'", kind: 'leafy',
    days: 24, dli: 16, water: 2.5, nutrients: 0.95, kcal: 1300, value: 175,
    o2: 0.98, morale: 8, science: 1, seed: 100, radSens: 0.5, colour: '#7fc25e',
    fresh: 2.4, src: 'est',
    note: "Grown in Veggie for 64 days — the longest any leafy green has stood on station. The crew ate it marinated in a tortilla pack with soy sauce and garlic."
  },
  {
    id: 'kale', name: 'Red Russian Kale', cultivar: '', kind: 'leafy',
    days: 30, dli: 17, water: 2.8, nutrients: 1.1, kcal: 1700, value: 215,
    o2: 1.05, morale: 7, science: 1, seed: 115, radSens: 0.45, colour: '#6d8f6a',
    fresh: 2.9, src: 'est',
    note: "One of the VEG-04 salad crops, chosen for nutrient density rather than speed. Cut-and-come-again, and it keeps standing when a lettuce would bolt."
  },
  {
    id: 'basil', name: 'Sweet Basil', cultivar: "'Spicy Globe'", kind: 'leafy',
    days: 32, dli: 18, water: 2.6, nutrients: 1.0, kcal: 520, value: 265,
    o2: 0.9, morale: 15, science: 1, seed: 125, radSens: 0.5, colour: '#4e9a52',
    fresh: 1.88, harvest: 'spread', pick: 14, stand: 121,
    eden: { cultivar: "'Dolly'", days: 121, kg: 7.30, gpd: 60.3, n: 2, ppfd: 330 },
    note: "Herbs earn their tray on smell alone. A galley with basil in it is a different room, and the flight surgeons stopped arguing about that a long time ago. EDEN ISS kept cutting it back from the lamps for four months a planting."
  },
  {
    id: 'arugula', name: 'Arugula', cultivar: '', kind: 'leafy',
    days: 24, dli: 17, water: 2.5, nutrients: 1.0, kcal: 1300, value: 175,
    o2: 0.98, morale: 7, science: 1, seed: 100, radSens: 0.5, colour: '#5d9a3a',
    fresh: 3.05, since: 9,
    eden: { days: 24.2, kg: 3.05, gpd: 126.0, n: 9, ppfd: 330,
            high: { days: 29, kg: 5.49, gpd: 189.3, n: 8, ppfd: 600 } },
    note: "EDEN ISS grew it twice over: nine cycles at the standard 330 µmol and eight under 600. The bright cycles gave half as much again per day — and less from every mole of light. That pair of numbers is the curve every lamp on this farm runs on."
  },
  {
    id: 'chard', name: 'Swiss Chard', cultivar: '', kind: 'leafy',
    days: 30, dli: 16, water: 2.8, nutrients: 1.1, kcal: 1400, value: 180,
    o2: 1.02, morale: 6, science: 1, seed: 110, radSens: 0.45, colour: '#a8323e',
    fresh: 2.89, harvest: 'spread', pick: 12, stand: 90, since: 9,
    eden: { days: 90, kg: 9.26, gpd: 102.9, n: 3, ppfd: 330 },
    note: "Cut the outer leaves and the plant keeps making more from the middle. EDEN ISS stood three plantings for ninety days each and took 9.3 kg a square metre off every one."
  },
  {
    id: 'mustard', name: 'Red Mustard', cultivar: "'Red Giant'", kind: 'leafy',
    days: 26, dli: 16, water: 2.6, nutrients: 1.0, kcal: 1250, value: 170,
    o2: 0.97, morale: 7, science: 1, seed: 100, radSens: 0.45, colour: '#7b2d43',
    fresh: 3.46, harvest: 'spread', pick: 10, stand: 83, since: 9,
    eden: { cultivar: "'Red Giant'", days: 82.7, kg: 10.78, gpd: 130.4, n: 3, ppfd: 330 },
    note: "Peppery, purple and quick. EDEN ISS grew two red mustards side by side for 83 days at a time, and 'Red Giant' out-yielded 'Frizzy Lizzy' by a fifth."
  },
  {
    id: 'tomato', name: 'Dwarf Tomato', cultivar: "'Red Robin'", kind: 'fruit',
    days: 84, dli: 24, water: 4.4, nutrients: 1.9, kcal: 3400, value: 780,
    o2: 1.5, morale: 16, science: 3, seed: 340, radSens: 0.6, colour: '#e0553c',
    fresh: 4.18, harvest: 'spread', pick: 14, stand: 286,
    eden: { cultivar: 'F1 1202', days: 286, kg: 14.90, gpd: 52.1, n: 2, ppfd: 350 },
    note: "The dwarf tomato of the VEG-05 experiment — the first fruiting crop grown to harvest on station. EDEN ISS kept its tomatoes in for the whole 286-day season, picking as the trusses ripened."
  },
  {
    id: 'pepper', name: 'Chile Pepper', cultivar: "'Española Improved'", kind: 'fruit',
    days: 110, dli: 25, water: 4.6, nutrients: 2.0, kcal: 2600, value: 860,
    o2: 1.5, morale: 18, science: 3, seed: 380, radSens: 0.55, colour: '#d94a2b',
    fresh: 2.9, src: 'est',
    note: "Grown in Plant Habitat-04 in 2021 — one of the longest crop runs attempted in orbit."
  },
  {
    id: 'strawberry', name: 'Strawberry', cultivar: "'Seascape'", kind: 'fruit',
    days: 92, dli: 24, water: 4.3, nutrients: 1.8, kcal: 1900, value: 980,
    o2: 1.4, morale: 24, science: 3, seed: 410, radSens: 0.6, colour: '#e0455e',
    fresh: 2.7, src: 'est',
    note: "Day-neutral, so it fruits without waiting on a season. A long-standing candidate crop, and the single most requested thing on any closed-habitat menu."
  },
  {
    id: 'cucumber', name: 'Cucumber', cultivar: "'Picowell'", kind: 'fruit',
    days: 55, dli: 24, water: 4.6, nutrients: 1.9, kcal: 2200, value: 540,
    o2: 1.5, morale: 14, science: 2, seed: 300, radSens: 0.55, colour: '#4f8f3a',
    fresh: 16.4, harvest: 'spread', pick: 7, stand: 161, since: 9,
    eden: { cultivar: "'Picowell'", days: 161, kg: 50.88, gpd: 316.0, n: 4, ppfd: 500 },
    note: "The heaviest cropper EDEN ISS grew, by a distance: 51 kg a square metre from plants trained to two stems and picked for five months. Nearly all of it is water — 96% — which is worth remembering before reading anything into a fresh-mass league table."
  },
  {
    id: 'radish', name: 'Radish', cultivar: "'Cherry Belle'", kind: 'root',
    days: 27, dli: 18, water: 2.8, nutrients: 1.2, kcal: 1100, value: 210,
    o2: 1.0, morale: 7, science: 2, seed: 130, radSens: 0.5, colour: '#c8446a',
    fresh: 1.45,
    eden: { cultivar: "'Raxe'", days: 22.6, kg: 1.82, gpd: 80.5, n: 10, ppfd: 600 },
    note: "Plant Habitat-02 grew radishes on the ISS in 2020; quick, and the whole plant is usable. EDEN ISS ran its radishes under 600 µmol and pulled them in 23 days."
  },
  {
    id: 'onion', name: 'Bunching Onion', cultivar: "'Evergreen'", kind: 'root',
    days: 52, dli: 17, water: 2.9, nutrients: 1.1, kcal: 1000, value: 300,
    o2: 1.0, morale: 11, science: 1, seed: 145, radSens: 0.4, colour: '#9fc47a',
    fresh: 2.7, src: 'est',
    note: "Cut the green and it grows back. Flavour is a life-support requirement in its own right: a crew that will not eat its calories is not fed."
  },
  {
    id: 'kohlrabi', name: 'Kohlrabi', cultivar: '', kind: 'root',
    days: 59, dli: 20, water: 3.2, nutrients: 1.3, kcal: 2700, value: 360,
    o2: 1.2, morale: 6, science: 2, seed: 160, radSens: 0.45, colour: '#8e6bb0',
    fresh: 8.11, since: 9,
    eden: { days: 58.7, kg: 8.11, gpd: 138.1, n: 6, ppfd: 350 },
    note: "A swollen stem that eats like a sweet turnip, and the best batch crop EDEN ISS grew per day of floor. Its broad leaves shade whatever stands next to it, and the operator spent hours trimming them back."
  },
  {
    id: 'wheat', name: 'Dwarf Wheat', cultivar: "'USU-Apogee'", kind: 'grain',
    days: 70, dli: 30, water: 4.0, nutrients: 1.8, kcal: 8200, value: 520,
    o2: 1.8, morale: 3, science: 2, seed: 260, radSens: 0.35, colour: '#d9b452',
    fresh: 1.09, src: 'est',
    note: "A short-stature wheat bred at Utah State specifically for controlled-environment life support."
  },
  {
    id: 'rice', name: 'Dwarf Rice', cultivar: "'Nipponbare'", kind: 'grain',
    days: 96, dli: 29, water: 4.6, nutrients: 1.9, kcal: 9900, value: 580,
    o2: 1.8, morale: 5, science: 4, seed: 285, radSens: 0.35, colour: '#cfc27a',
    fresh: 1.24, src: 'est',
    note: "Taken from seed to seed aboard the Wentian module in 2022 — the first crop to complete a full life cycle in orbit. Where wheat is bread, rice is the proof the loop can close."
  },
  {
    id: 'potato', name: 'Potato', cultivar: "'Norland'", kind: 'root',
    days: 95, dli: 26, water: 4.2, nutrients: 1.7, kcal: 12500, value: 610,
    o2: 1.7, morale: 6, science: 2, seed: 300, radSens: 0.4, colour: '#c9a86a',
    fresh: 7.3, src: 'est',
    note: "The calorie workhorse of every closed life-support study since the 1980s."
  },
  {
    id: 'sweetpotato', name: 'Sweetpotato', cultivar: "'TU-82-155'", kind: 'root',
    days: 105, dli: 25, water: 4.0, nutrients: 1.6, kcal: 13800, value: 700,
    o2: 1.7, morale: 7, science: 2, seed: 330, radSens: 0.4, colour: '#d98a4a',
    fresh: 7.2, src: 'est',
    note: "A CELSS-era candidate crop: dense calories from a plant that tolerates a low canopy."
  },
  {
    id: 'soybean', name: 'Soybean', cultivar: "'Hoyt'", kind: 'grain',
    days: 88, dli: 28, water: 3.9, nutrients: 1.9, kcal: 9600, value: 690,
    o2: 1.7, morale: 5, science: 3, seed: 320, radSens: 0.45, colour: '#a8bf5c',
    fresh: 0.97, src: 'est',
    note: "Soybean was grown to seed on the ISS in Advanced Astroculture — protein and oil in one crop."
  },
  {
    id: 'peanut', name: 'Peanut', cultivar: "'Georgia Red'", kind: 'grain',
    days: 104, dli: 27, water: 4.1, nutrients: 1.9, kcal: 11800, value: 760,
    o2: 1.7, morale: 9, science: 3, seed: 350, radSens: 0.4, colour: '#c9a05c',
    fresh: 0.94, src: 'est',
    note: "Oil, protein and calories from one plant, and it fixes its own nitrogen into the bargain. A CELSS-era shortlist crop that never left the shortlist."
  },
  {
    id: 'rapeseed', name: 'Rapeseed', cultivar: "'Westar'", kind: 'grain',
    days: 78, dli: 26, water: 3.7, nutrients: 1.7, kcal: 7600, value: 660,
    o2: 1.6, morale: 4, science: 3, seed: 275, radSens: 0.45, colour: '#e2c94e',
    fresh: 0.68, src: 'est',
    note: "Flew in the Chang'e-4 canister and germinated on the far side. Cooking oil is not a luxury in a closed kitchen — it is most of what makes the staples edible."
  },
  {
    id: 'cotton', name: 'Cotton', cultivar: '', kind: 'fibre',
    days: 118, dli: 28, water: 4.4, nutrients: 1.8, kcal: 0, value: 1020,
    o2: 1.6, morale: 6, science: 5, seed: 320, radSens: 0.5, colour: '#e8e4d8',
    fresh: 0,
    note: "The first plant to germinate on the Moon, in the Chang'e-4 biosphere canister in January 2019. Feeds nobody, and a colony that cannot make cloth or wadding imports both forever."
  },
  {
    id: 'zinnia', name: 'Zinnia', cultivar: '', kind: 'flower',
    days: 60, dli: 20, water: 3.0, nutrients: 1.3, kcal: 0, value: 120,
    o2: 1.1, morale: 26, science: 2, seed: 150, radSens: 0.7, colour: '#e8994b',
    fresh: 0,
    note: "Flowered on the ISS in 2016 after a fungal scare — a study in crew morale as much as botany."
  },
  {
    id: 'sunflower', name: 'Dwarf Sunflower', cultivar: "'Elf'", kind: 'flower',
    days: 72, dli: 22, water: 3.6, nutrients: 1.4, kcal: 2500, value: 340,
    o2: 1.3, morale: 28, science: 2, seed: 175, radSens: 0.6, colour: '#f2b33d',
    fresh: 0.19, src: 'est',
    note: "Grown in orbit off-programme, in a bag, by a crew member who wanted something to look at. It tracked a light it could not see and everybody watched it do it."
  },
  {
    id: 'marigold', name: 'Marigold', cultivar: "'Nasturtium mix'", kind: 'flower',
    days: 48, dli: 19, water: 2.9, nutrients: 1.2, kcal: 90, value: 210,
    o2: 1.0, morale: 21, science: 1, seed: 130, radSens: 0.65, colour: '#ef8b3c',
    fresh: 0.3, src: 'est',
    note: "Edible petals, a fast turn and a colour nothing else in the hall provides. Cut for the table as often as for the vase."
  },
  {
    id: 'arabidopsis', name: 'Arabidopsis', cultivar: 'Col-0', kind: 'research',
    days: 42, dli: 14, water: 1.8, nutrients: 0.8, kcal: 0, value: 60,
    o2: 0.6, morale: 0, science: 14, seed: 80, radSens: 0.8, colour: '#7fbf6a',
    fresh: 0,
    note: "The model plant behind most spaceflight gene-expression work. Pays in data, not dinner."
  },
  {
    id: 'duckweed', name: 'Duckweed', cultivar: 'Wolffia', kind: 'algae',
    days: 16, dli: 12, water: 3.4, nutrients: 1.1, kcal: 2200, value: 180,
    o2: 1.4, morale: 1, science: 2, seed: 90, radSens: 0.3, colour: '#6fbf7a',
    note: "Doubles in days, edible whole, and needs no harvesting machinery."
  },
  {
    id: 'spirulina', name: 'Spirulina', cultivar: 'A. platensis', kind: 'algae',
    days: 14, dli: 13, water: 3.8, nutrients: 1.4, kcal: 2600, value: 250,
    o2: 2.2, morale: -2, science: 3, seed: 140, radSens: 0.25, colour: '#3f9f8a',
    note: "The photosynthetic compartment of the MELiSSA loop: oxygen and protein, at the cost of morale."
  },
  {
    id: 'oyster', name: 'Oyster Mushroom', cultivar: 'P. ostreatus', kind: 'fungal',
    days: 19, dli: 0, water: 3.0, nutrients: 0.4, kcal: 1500, value: 640,
    o2: 0.9, morale: 12, science: 4, seed: 210, radSens: 0.2, colour: '#c8b49a',
    dark: true, respires: true, residue: 3.0, co2Shy: true,
    note: "Fruits in the dark on spent straw and stover, turning the half of every harvest nobody can eat into something they can. Sporeless lines have been trialled on inedible crop biomass and cotton waste for exactly this reason."
  },
  {
    id: 'yeast', name: "Baker's Yeast", cultivar: 'S. cerevisiae', kind: 'microbe',
    days: 9, dli: 0, water: 2.6, nutrients: 0.5, kcal: 3000, value: 260,
    o2: 0.6, morale: 8, science: 2, seed: 75, radSens: 0.15, colour: '#e3d3a2',
    dark: true, respires: true, residue: 1.6,
    note: "Rode to the far side of the Moon in the Chang'e-4 canister as the decomposer of a three-species biosphere. Bread, and the CO₂ to raise it."
  },
  {
    id: 'anabaena', name: 'Cyanobacteria', cultivar: 'Anabaena sp.', kind: 'microbe',
    days: 21, dli: 11, water: 3.6, nutrients: 0.3, kcal: 1800, value: 290,
    o2: 2.0, morale: -1, science: 5, seed: 130, radSens: 0.2, colour: '#3f8f7a',
    fixesN: 2.4,
    note: "Fixes nitrogen straight out of the air in specialised cells, which is why the MELiSSA loop puts it where the nitrogen has to come from. Feeds the nutrient tanks as much as the crew."
  },
  {
    id: 'rhizobia', name: 'Rhizobial Inoculant', cultivar: 'B. japonicum', kind: 'microbe',
    days: 13, dli: 0, water: 2.2, nutrients: 0.3, kcal: 0, value: 180,
    o2: 0.2, morale: 0, science: 6, seed: 95, radSens: 0.15, colour: '#a88f6a',
    dark: true, respires: true, residue: 1.0, conditions: 0.16,
    note: "Not a crop — a culture. Grown out in the beds it colonises the legume roots that follow it, and leaves the ground better than it found it."
  }
];

/* ---------- biotechnology ----------

   Each trait is a real line of plant biotechnology, described by what it does to
   the plant rather than by who published it. `mods` is how it changes a crop:
   multipliers unless the key is prefixed `+`, which adds. Applying several traits
   multiplies them together, so a GMO line is its base crop run through its list.

   `light` is a multiplier on that hall's lamp draw — the only trait effect that
   touches the power budget rather than the plant. */
const TRAITS = [
  { id: 'hi', name: 'Improved harvest index',
    basis: 'Reduced-stature alleles and altered assimilate partitioning: the plant spends less of its carbon on stem and more on the part you eat.',
    mods: { kcal: 1.35, value: 1.25, fresh: 1.35 },
    gain: 'More edible yield from the same floor and the same lamp hours.' },
  { id: 'biofort', name: 'Biofortification',
    basis: 'Provitamin-A, mineral and anthocyanin accumulation in the edible tissue.',
    mods: { value: 1.40, '+morale': 8, '+science': 1 },
    gain: 'Sells for far more, and a crew fed on it stays cheerful longer.' },
  { id: 'bypass', name: 'Photorespiratory bypass',
    basis: 'An engineered route around photorespiration, so less fixed carbon is thrown away recovering from it.',
    mods: { days: 0.85, kcal: 1.20, fresh: 1.20 },
    gain: 'Grows faster and heavier for the same light.' },
  { id: 'npq', name: 'Faster NPQ relaxation',
    basis: 'Tuned recovery from non-photochemical quenching, so the canopy stops wasting light in the minutes after it returns.',
    mods: { days: 0.93, light: 0.82 },
    gain: 'A smaller lamp bill — which is the whole lunar night problem.' },
  { id: 'bloom', name: 'Extended bloom',
    basis: 'Flowering-time regulation held open, so the plant sets far more flowers over a longer window.',
    mods: { value: 1.20, morale: 1.60, flowers: 1.8 },
    gain: 'Morale, and the arranging segments the studio pays most for.' },
  { id: 'radtol', name: 'Radiation tolerance',
    basis: 'Reactive-oxygen scavenging, enhanced DNA repair and protective proteins over the chromatin.',
    mods: { radSens: 0.45 },
    gain: 'Comes through a particle event that would have cost you the canopy.' },
  { id: 'stomata', name: 'Reduced stomatal density',
    basis: 'Stomatal-density regulators dialled down, so the leaf loses less water for the same exchange.',
    mods: { water: 0.75 },
    gain: 'Cuts the draw on a loop you can only refill from regolith.' },
  { id: 'lowlight', name: 'Low-light tolerance',
    basis: 'A lowered light-saturation point: the canopy reaches full rate under a dimmer lamp.',
    mods: { dli: 0.70, light: 0.74 },
    gain: 'Keeps growing on the power you can spare after sunset, and loses less when the lamps are turned down.' },
  { id: 'perchlorate', name: 'Perchlorate tolerance',
    basis: 'Microbial perchlorate reduction carried by the crop\u2019s root associates.',
    mods: { soilFloor: 0.20 },
    gain: 'Yields respectably in beds you have not finished conditioning.' },
  { id: 'short', name: 'Short cycle',
    basis: 'Early-flowering alleles worked with continuous light — speed breeding, moved into the crop itself.',
    mods: { days: 0.78 },
    gain: 'More harvests a year, and cash arrives sooner.' },
  { id: 'pharma', name: 'Molecular farming',
    basis: 'The crop expresses a recoverable pharmaceutical protein alongside its ordinary growth.',
    mods: { value: 3.20, kcal: 0.35, '+science': 4 },
    gain: 'The most valuable thing you can grow, and it will not feed anybody.' },
  { id: 'longevity', name: 'Seed longevity',
    basis: 'Desiccation tolerance and longevity traits that keep an embryo viable far longer in store.',
    mods: { '+science': 2, keeps: 1 },
    gain: 'Its vault accession never degrades, and tired-seed years cannot touch it.' },
  { id: 'fruitset', name: 'Assisted fruit set',
    basis: 'Reliable self-pollination without wind or insects to move the pollen.',
    mods: { kcal: 1.15, value: 1.15, fresh: 1.15, setFloor: 1 },
    gain: 'A fruiting crop that actually fruits, every time, in a sealed hall.' },
  { id: 'nfix', name: 'Nitrogen partnership',
    basis: 'An introduced diazotroph association fixing atmospheric nitrogen at the root.',
    mods: { nutrients: 0.55 },
    gain: 'Feeds itself, and leaves the nutrient tanks for everything else.' },
  { id: 'co2tol', name: 'Carbon dioxide tolerance',
    basis: 'Fruiting bodies that still form normally in the high carbon dioxide a sealed hall accumulates.',
    mods: { value: 1.25, co2Shy: 0 },
    gain: 'Removes the one thing that stops mushrooms working in a closed loop.' }
];

/* A GMO line is a base crop plus a short list of traits, developed once and then
   available to sow for ever. Curated rather than combinatorial: fifteen lines that
   are each worth building, instead of a catalogue nobody can read. */
const GMO = [
  { id: 'romaine_g', base: 'romaine', name: 'Red Romaine', cultivar: "'Outredgeous' HL-1",
    traits: ['biofort', 'npq'], cost: 5200, science: 12,
    note: 'The salad crop that started all of this, redrawn for a farm that pays its own power bill.' },
  { id: 'kale_g', base: 'kale', name: 'Red Russian Kale', cultivar: 'BF-2',
    traits: ['biofort', 'radtol'], cost: 5600, science: 14,
    note: 'Already the most nutrient-dense thing in the hall; now it also survives the weeks you spend shuttered.' },
  { id: 'tomato_g', base: 'tomato', name: 'Dwarf Tomato', cultivar: "'Red Robin' AS-4",
    traits: ['fruitset', 'hi'], cost: 8400, science: 22,
    note: 'Sets fruit without wind, insects or a crew member with a paintbrush.' },
  { id: 'pepper_g', base: 'pepper', name: 'Chile Pepper', cultivar: "'Espa\u00f1ola' RT-3",
    traits: ['radtol', 'hi'], cost: 8800, science: 24,
    note: 'Bred for the long runs, where the odds of meeting a flare stop being small.' },
  { id: 'strawberry_g', base: 'strawberry', name: 'Strawberry', cultivar: "'Seascape' BF-1",
    traits: ['biofort', 'bloom'], cost: 9600, science: 26,
    note: 'The most-requested crop in any closed habitat, made worth the floor it stands on.' },
  { id: 'potato_g', base: 'potato', name: 'Potato', cultivar: 'PT-7',
    traits: ['hi', 'perchlorate'], cost: 7600, science: 20,
    note: 'Yields in beds you have not finished conditioning — which is every bed, early on.' },
  { id: 'sweetpotato_g', base: 'sweetpotato', name: 'Sweetpotato', cultivar: 'LL-2',
    traits: ['hi', 'lowlight'], cost: 8200, science: 22,
    note: 'Calories that keep coming on the power left over after sunset.' },
  { id: 'wheat_g', base: 'wheat', name: 'Dwarf Wheat', cultivar: "'USU-Apogee' PB-1",
    traits: ['bypass', 'short'], cost: 8800, science: 25,
    note: 'Stops discarding the carbon it has already fixed, and finishes inside one lunar cycle.' },
  { id: 'rice_g', base: 'rice', name: 'Dwarf Rice', cultivar: "'Nipponbare' SC-2",
    traits: ['biofort', 'short'], cost: 8600, science: 24,
    note: 'The first crop to close its life cycle in orbit, shortened again and made worth more per grain.' },
  { id: 'soybean_g', base: 'soybean', name: 'Soybean', cultivar: "'Hoyt' NF-1",
    traits: ['nfix', 'hi'], cost: 8000, science: 21,
    note: 'Brings its own nitrogen. The nutrient tanks last twice as long with a hall of this standing.' },
  { id: 'duckweed_g', base: 'duckweed', name: 'Duckweed', cultivar: 'Wolffia HD-3',
    traits: ['hi', 'npq'], cost: 4600, science: 11,
    note: 'Already the fastest thing on the farm. Now it is the cheapest to light as well.' },
  { id: 'zinnia_g', base: 'zinnia', name: 'Zinnia', cultivar: 'EB-2',
    traits: ['bloom', 'radtol'], cost: 5000, science: 13,
    note: 'Flowers for weeks instead of days. The studio will take every one of them.' },
  { id: 'sunflower_g', base: 'sunflower', name: 'Dwarf Sunflower', cultivar: "'Elf' EB-1",
    traits: ['bloom', 'short'], cost: 5400, science: 14,
    note: 'Bred for the camera as much as the seed head, and quick enough to keep the reel fed.' },
  { id: 'cotton_g', base: 'cotton', name: 'Cotton', cultivar: 'SC-4',
    traits: ['short', 'stomata'], cost: 7400, science: 19,
    note: 'The first plant to germinate on the Moon, finally quick enough to be worth the floor.' },
  { id: 'oyster_g', base: 'oyster', name: 'Oyster Mushroom', cultivar: 'P. ostreatus CT-1',
    traits: ['co2tol', 'hi'], cost: 6400, science: 18,
    note: 'Fruits properly in the carbon dioxide a sealed hall accumulates, instead of running to stem.' },
  { id: 'arabidopsis_g', base: 'arabidopsis', name: 'Arabidopsis', cultivar: 'Col-0 MF-1',
    traits: ['pharma', 'longevity'], cost: 11000, science: 34,
    note: 'The model plant put to work: a pharmaceutical protein recovered from a crop that was only ever data before.' }
];

/* ---------- studies ----------

   Published trials the farm can re-run. Each watches the harvest records for a
   matching pair — the same crop grown two ways, alike in everything else — and
   when it finds one sets the farm's figure beside the published one. The farm's
   figure measures this model, not plants: the point is to watch the lesson play
   out, and to see where a game is kinder or harsher than the Moon. */
const baseOf = id => id.replace(/_g$/, '');
/* fresh mass per tile per day of hall occupancy; the area units cancel in a ratio */
const perDay = r => (r.n > 0 && r.a > 0 ? r.kg / r.a / r.n : 0);
/* two first cuts alike in every way the study is not about */
function pairUp(s, isA, isB, ignore) {
  const recs = s.records || [];
  const skip = new Set(ignore || []);
  const alike = (a, b) => baseOf(a.c) === baseOf(b.c) && Math.abs(a.d - b.d) <= 150
    && (skip.has('sub') || a.sub === b.sub) && Math.abs(a.bf - b.bf) <= 0.03
    && (skip.has('p') || a.p === b.p) && (skip.has('pp') || a.pp === b.pp)
    && (skip.has('fans') || a.fans === b.fans) && (skip.has('tp') || a.tp === b.tp)
    && (skip.has('ppm') || Math.abs(a.ppm - b.ppm) <= 300)
    && (skip.has('a') || a.a === b.a);
  for (const a of recs) {
    if (!isA(a)) continue;
    for (const b of recs) if (b !== a && isB(b) && alike(a, b)) return [a, b];
  }
  return null;
}
const x2 = v => v.toFixed(2);

const STUDIES = [
  { id: 'eden_light', name: 'The EDEN ISS light trial', science: 15,
    cite: 'Zabel et al. 2020, Front Plant Sci 11:656',
    protocol: 'Bring in arugula grown under High (600 µmol) and arugula grown under Standard (330), sown direct, in matching halls on matching beds.',
    published: 'EDEN ISS: 126.0 → 189.3 g/m²/d, ×1.50 for 1.82× the light (n = 9 and 8 cycles).',
    check: s => {
      const p = pairUp(s, r => baseOf(r.c) === 'arugula' && r.p === 600 && !r.tp && r.q >= 0.9,
                          r => baseOf(r.c) === 'arugula' && r.p === 330 && !r.tp && r.q >= 0.9, ['p', 'ppm', 'a']);
      if (!p) return null;
      const mine = perDay(p[0]) / perDay(p[1]);
      return { mine, text: `Your arugula under 600 µmol made ×${x2(mine)} the fresh mass a day; EDEN ISS measured ×1.50.` };
    } },
  { id: 'apollo', name: 'Arabidopsis in Apollo soil', science: 18,
    cite: 'Paul et al. 2022, Commun Biol 5:382',
    protocol: 'Bring in Arabidopsis from a raw regolith bed (its first crop or two) and from a fully worked or sintered bed.',
    published: 'In Apollo soil, rosettes reached 2–13% of their size in simulant, and leaves came 32–65% as fast; the most weathered soil grew worst.',
    check: s => {
      const recs = s.records || [];
      const raw = recs.find(r => baseOf(r.c) === 'arabidopsis' && r.sub === 'regolith' && r.bed < 0.8);
      const good = recs.find(r => baseOf(r.c) === 'arabidopsis' && r.bed >= 0.99);
      if (!raw || !good) return null;
      const mine = raw.q / Math.max(0.01, good.q);
      return { mine, text: `Your first Arabidopsis in raw regolith yielded ${Math.round(mine * 100)}% of a worked bed's. In Apollo soil the rosettes reached 2–13% of their size in simulant — the farm is kinder than the Moon.` };
    } },
  { id: 'flare', name: 'The first plant data from a solar particle event', science: 30,
    cite: 'Plant_response_to_radiation (this group)',
    protocol: 'Keep the lamps on through a solar flare with Arabidopsis growing, and leave it in until its response has run its course.',
    published: 'Resilience index at the 2–6 h nadir: cosmic rays 0.56, spaceflight 0.68, gamma 0.81, against a baseline of 0.79. Solar particle events: no plant studies at all.',
    check: s => {
      if (!s.flare || !s.flare.complete) return null;
      const mine = s.flare.nadir;
      return { mine, text: `Arabidopsis held through the flare bottomed at ×${x2(mine)} growth and recovered within the day — the first plant response ever logged through a solar particle event.` };
    } },
  { id: 'still_air', name: 'Still air at one-sixth g', science: 12,
    cite: 'LunarLeaf-CFD (this group)',
    protocol: 'Bring in the same crop from two halls of the same size, over twelve tiles, one with canopy fans and one without.',
    published: 'Still air at lunar gravity leaves a leaf 71% of its Earth boundary-layer conductance, a dense canopy far less; fans at 2–6.5 cm/s restore it.',
    check: s => {
      const p = pairUp(s, r => r.a > 12 && r.fans, r => r.a > 12 && !r.fans, ['fans', 'ppm']);
      if (!p) return null;
      const mine = p[1].n / p[0].n;
      return { mine, text: `Your fanned hall grew ×${x2(mine)} as fast as the still one. In the CFD, airflow — not gravity — decides how well a lunar canopy breathes.` };
    } },
  { id: 'nursery', name: 'Transplants against direct sowing', science: 10,
    cite: 'Zabel et al. 2020, Front Plant Sci 11:656',
    protocol: 'Bring in the same crop sown direct and sown from nursery transplants, in matching halls.',
    published: 'EDEN ISS raised every seedling 10–20 days in rockwool before it went into a rack.',
    check: s => {
      const p = pairUp(s, r => r.tp, r => !r.tp, ['tp', 'ppm']);
      if (!p) return null;
      const mine = p[0].n / p[1].n;
      return { mine, text: `Transplants stood in the hall ${Math.round(mine * 100)}% as long as direct-sown seed — the nursery's fortnight bought back.` };
    } },
  { id: 'enrich', name: 'Photorespiration and enriched air', science: 14,
    cite: 'Photorespiration_multiomics_microgravity (this group)',
    protocol: 'Bring in the same crop grown at the 1000 ppm setpoint and grown in air enriched to 1,800 ppm or more, in matching halls.',
    published: 'At 3,500 ppm photorespiration falls to 2.6% of fixation, a twelve-fold drop; the +8–11% growth that implies is our inference.',
    check: s => {
      const p = pairUp(s, r => r.ppm >= 1800, r => r.ppm <= 1050, ['ppm']);
      if (!p) return null;
      const mine = p[1].n / p[0].n;
      return { mine, text: `The enriched crop grew ×${x2(mine)} as fast. Most of what photorespiration throws away at 400 ppm is already saved at 1000; past that the returns are small.` };
    } }
];

/* ---------- field notes ----------

   The sources behind the farm, filed as the farm meets them. Each says what was
   found, by whom, and what it does here. */
const FIELD_NOTES = [
  { id: 'eden', title: 'EDEN ISS: a greenhouse that fed a station',
    cite: 'Zabel et al. 2020, Front Plant Sci 11:656 · doi:10.3389/fpls.2020.00656 · NASA OSDR OSD-895',
    text: 'Through 2018 the EDEN ISS Mobile Test Facility at Neumayer III grew 268 kg of fresh food on 12.5 m² of racks for an Antarctic overwintering crew — 0.075 kg per square metre per day across the season. One operator ran it, a few hours a day.',
    farm: 'Ten crops carry its measured cycle lengths and yields; its lamps, climate setpoints, tanks and nursery are the farm’s defaults.',
    unlock: s => s.day >= 1 },
  { id: 'eden_light', title: 'More light, less per mole',
    cite: 'Zabel et al. 2020 — the arugula light trial',
    text: 'Arugula under 600 µmol/m²/s made half as much again a day as arugula under 330, but got 17% less from every mole of light. Light is a curve that bends over.',
    farm: 'Every lamp setting and photoperiod runs on a curve fitted to those two numbers.',
    unlock: s => s.photoperiod !== 16 || s.fields.some(f => (f.ppfd || 330) !== 330) },
  { id: 'benchmarks', title: 'Kilograms per square metre per day',
    cite: 'EDEN ISS; Lunar Palace 1 (Fu et al. 2016); CEEF, the South Pole chamber and NASA’s BPC as tabulated in the ISS_EDEN comparison',
    text: 'Every closed-agriculture facility reports fresh food per square metre per day: EDEN ISS 0.075, Lunar Palace 1 0.068, NASA’s Biomass Production Chamber about 0.17 under ideal control. Fresh mass flatters watery crops — a cucumber is 96% water.',
    farm: 'The Systems tab and the report track your farm against them.',
    unlock: s => s.day >= 30 },
  { id: 'lp1', title: 'Lunar Palace 1: closing the loop with people inside',
    cite: 'Li et al. 2015, Life Sci Space Res 7:9 · Fu et al. 2016, Astrobiology 16:925 · Dong et al. 2017, Astrobiology 17:78',
    text: 'Three volunteers sealed in for 105 days with 21 crops, mealworms and a waste loop. 8.13% of mealworm feed came back as larval mass, 20.5% of urine nitrogen was recovered, 41% of solid waste degraded.',
    farm: 'The recycling compartments run on those ratios.',
    unlock: s => ['worms', 'nitrifier', 'digester'].some(t => s.map.some(x => x.b && x.b.type === t)) },
  { id: 'apollo', title: 'Plants in Apollo soil',
    cite: 'Paul et al. 2022, Commun Biol 5:382 · NASA OSDR OSD-476',
    text: 'Arabidopsis grown in a gram each of Apollo 11, 12 and 17 regolith made leaves at a third to two-thirds the pace of plants in simulant, and rosettes a tenth the size. The more weathered the soil, the worse it grew.',
    farm: 'A first crop in raw regolith yields about half; freshly broken crater-rim ejecta is younger and kinder.',
    unlock: s => (s.stats.thinHarvest || 0) > 0 },
  { id: 'sinter', title: 'Firing the dust',
    cite: 'lunar-regolith-blss-review (this group), on Paul et al. 2022 and Hasenstein 2026',
    text: 'Raw regolith holds under 12% air at the roots and runs at pH 9–11; fired into aggregate it holds 25–30%, sits near neutral and comes out of a 500 °C kiln sterile. At one-sixth g water climbs only 4.2 mm by capillarity, so the grain size matters.',
    farm: 'Sintered beds yield nearly in full from the first crop and grow less mould. Encoded qualitatively: parts of the review’s reference list are still being checked.',
    unlock: s => (s.stats.sinteredHalls || 0) > 0 || s.fields.some(f => f.substrate === 'aero') },
  { id: 'tanks', title: 'Two tanks and a recipe change',
    cite: 'Zabel et al. 2020 · NASA OSDR OSD-895 (raw record)',
    text: 'EDEN ISS fed its racks from a leafy tank (EC 2.21, pH 6.06) and a fruit tank (EC 3.49, pH 5.91), held with nitric acid and potassium hydroxide and replaced every two to three months. When the tomatoes showed calcium deficiency the fruit recipe was changed mid-season.',
    farm: 'The tank room runs both, recipes and all.',
    unlock: s => s.map.some(x => x.b && x.b.type === 'tanks') },
  { id: 'nursery', title: 'Seedlings first',
    cite: 'Zabel et al. 2020 · deepspace-seed-stress-decoder (this group)',
    text: 'EDEN ISS raised every seedling 10–20 days in rockwool before it went into a rack. Germination is also when a plant is most exposed: the first hours are the window in which several stresses converge on the root tip.',
    farm: 'The nursery puts a hall a fortnight ahead, and a flare is hardest on a hall that has just been sown.',
    unlock: s => s.map.some(x => x.b && x.b.type === 'nursery') },
  { id: 'cfd', title: 'Still air on the Moon',
    cite: 'LunarLeaf-CFD (this group)',
    text: 'At one-sixth g warm air barely rises: a leaf keeps 71% of its Earth boundary-layer conductance, a dense canopy far less, and fans at 2–6.5 cm/s restore it. A sealed, lit chamber draws its CO₂ to nothing in seven minutes. The enclosure matters about 25 times more than the gravity does.',
    farm: 'Big halls need canopy fans, and a failed air handler seals a hall.',
    unlock: s => s.fields.some(f => f.w * f.h > 12 || f.fans || f.sealed > 0) },
  { id: 'photoresp', title: 'What enriched air buys',
    cite: 'Photorespiration_multiomics_microgravity (this group)',
    text: 'At ISS-cabin CO₂ (3,500 ppm) photorespiration falls to 2.6% of fixation, a twelve-fold drop from outdoor air. Leaf photosynthesis at lunar gravity is about 98% of Earth’s — the enclosure, not the gravity, sets the carbon supply.',
    farm: 'Enrichment buys up to a tenth more growth — our inference from those numbers, not a measured yield.',
    unlock: s => (s.co2Set || 1000) > 1000 },
  { id: 'habitat', title: 'The crew’s own breath',
    cite: 'Habitat_model (this group) · Zabel et al. 2020',
    text: 'In a 63.1 m³ module with the ventilation off, two crew take the air to 5,000 ppm in 6.3 hours and six in 2.1. EDEN ISS had no CO₂ removal at all, and spent most of its winter at 2,000–4,000 ppm because of it.',
    farm: 'A scrubber fault puts the crew’s breath in the halls; past 2,500 ppm, morale pays.',
    unlock: s => (s.stats.ppmPeak || 0) > 2500 || s.flags.scrubber > 0 },
  { id: 'radiation', title: 'How a plant takes a dose',
    cite: 'Plant_response_to_radiation (this group: 299 samples, 10 NASA OSDR studies)',
    text: 'The response runs in three phases: recognition in the first two hours, a crisis at 2–6 h, recovery within the day. Cosmic rays disrupt the networks most, gamma least. Solar particle events — the most acute hazard on the lunar surface — have no plant studies at all.',
    farm: 'A flare is a dip and a recovery for the canopy, real damage to a seedling, and a chance at data nobody has.',
    unlock: s => (s.stats.flares || 0) > 0 },
  { id: 'veg05', title: 'What flight does to a leaf’s microbes',
    cite: 'VEG-05 dwarf tomato, ISS · veg05-integrated-omics (this group)',
    text: 'Grown on the ISS, ‘Red Robin’ tomato leaves carried a fungal community 3.7 times as far from normal as ground controls (bacteria 2.1 times), and two Fusarium variants turned up. Under blue-rich light the leaves changed 4,716 genes in flight; under red-rich, 523.',
    farm: 'A closed farm is a gift to opportunists. Mould follows wet air, spreads hall to hall, and UV-C is the answer.',
    unlock: s => (s.stats.infections || 0) > 0 }
];

/* ---------- how the farm measures up ----------

   Fresh edible mass per square metre of growing area per day, over a whole
   season — the one figure every closed-agriculture facility reports. EDEN ISS
   is taken from its own data release; the others as tabulated beside it in the
   ISS_EDEN comparison (source papers named), not re-derived, so treat them as
   approximate. Fresh mass flatters watery crops: a cucumber is 96% water, and a
   farm of them out-scores a wheat farm that feeds far more people. */
const BENCHMARKS = [
  { id: 'lp1', name: 'Lunar Palace 1', year: 2016, kgm2d: 0.068,
    src: 'Fu et al. 2016, Astrobiology', note: 'a 21-crop bioregenerative run with three crew sealed inside' },
  { id: 'eden', name: 'EDEN ISS', year: 2018, kgm2d: 0.075,
    src: 'Zabel et al. 2020, Front Plant Sci', note: 'one Antarctic winter, 12.5 m² of racks, mostly salad and fruit' },
  { id: 'ceef', name: 'CEEF, Japan', year: 2005, kgm2d: 0.095, approx: true,
    src: 'Masuda et al. 2005', note: 'closed-ecology habitation trials at Rokkasho' },
  { id: 'spfgc', name: 'South Pole Food Growth Chamber', year: 2006, kgm2d: 0.13, approx: true,
    src: 'Patterson et al. 2012', note: 'heavy on cucumber and lettuce' },
  { id: 'bpc', name: 'KSC Biomass Production Chamber', year: 2008, kgm2d: 0.17, approx: true,
    src: 'Wheeler et al. 2008', note: 'NASA’s monoculture batches under ideal control' }
];
/* the EDEN ISS 2018 season, for the per-crew comparison: 268 kg of fresh food
   off 12.5 m² in 286 days, for a station of ten */
const EDEN_SEASON = { kg: 268, m2: 12.5, days: 286, crew: 10 };

/* ---------- the nutrient tanks ----------

   EDEN ISS fed its racks from two tanks, mixed automatically from concentrated
   stock and deionised water and misted onto bare roots for 30 s every 6 min.
   Setpoints, tolerances and the replacement interval are theirs (Zabel et al.
   2020; NASA OSDR OSD-895). The recipes are read from the raw OSDR record, in
   mol per 100 L (micronutrients in mmol per 100 L). The fruit recipe was changed
   mid-season when tomato showed calcium deficiency: calcium up, potassium down. */
const TANKS = {
  leafy: { name: 'Tank 1 · leafy', ec: 2.21, ph: 6.06, ecSd: 0.13, phSd: 0.18, days: 90,
    recipe: { 'NH₄⁺': 0.122, 'Ca²⁺': 0.419, 'K⁺': 1.028, 'Mg²⁺': 0.135, 'NO₃⁻': 1.785, 'Cl⁻': 0.068,
              'SO₄²⁻': 0.109, 'P': 0.189 },
    micro: { Fe: 3.795, Mn: 0.189, Zn: 0.244, B: 2.84, Cu: 0.068, Mo: 0.041 } },
  fruit: { name: 'Tank 2 · fruit', ec: 3.49, ph: 5.91, ecSd: 0.17, phSd: 0.12, days: 60,
    recipe: { 'NH₄⁺': 0.226, 'Ca²⁺': 0.597, 'K⁺': 1.503, 'Mg²⁺': 0.226, 'NO₃⁻': 2.347, 'Cl⁻': 0.104,
              'SO₄²⁻': 0.332, 'P': 0.267 },
    adjusted: { 'Ca²⁺': 0.711, 'K⁺': 1.378, 'NO₃⁻': 2.450 },
    micro: { Fe: 5.161, Mn: 2.059, Zn: 0.825, B: 4.321, Cu: 0.164, Mo: 0.103 } }
};

/* What a hall is floored with. The regolith figures are Paul et al. 2022
   (Arabidopsis in Apollo soil, NASA OSDR OSD-476): against a basalt simulant,
   leaves came 32–65% as fast and rosettes grew to 2–13% of the size, and the
   most weathered soil (Apollo 11) was the worst. Sintering and aeroponics are
   encoded qualitatively: fired regolith drains, holds air and sits near neutral
   pH where raw regolith runs at 9–11. */
const SUBSTRATES = {
  regolith: { name: 'Regolith beds', short: 'Regolith',
    desc: 'Raw lunar regolith, worked into soil harvest by harvest. Free, slow, and thin for the first crops: Arabidopsis grown in Apollo soil made rosettes a tenth the size of the same plant in simulant.' },
  sintered: { name: 'Sintered beds', short: 'Sintered',
    desc: 'Regolith fired into porous aggregate. Drains, holds air at the roots in one-sixth gravity, sits near neutral pH, and comes out of the kiln sterile — nearly full yield from the first crop, and less mould.' },
  aero: { name: 'Aeroponic racks', short: 'Aeroponic',
    desc: 'EDEN ISS’s system: bare roots misted with nutrient solution. The fastest bed there is, but it lives on the tank room and its pumps — in a brownout the roots dry within hours — and it feels every drift in the solution.' }
};

/* Structures you place on the surface. `once` means one is all the farm needs. */
const BUILDINGS = [
  { id: 'track', name: 'Regolith Track', cost: 120, science: 0, line: true, key: 'T',
    desc: 'Graded surface road. Modules must touch a track that reaches the habitat, or the crew cannot service them.' },
  { id: 'rail', name: 'Rail Line', cost: 320, science: 0, line: true, key: 'L',
    desc: 'Bulk haulage on rails. Counts as service like a track, and any hall it touches gains a tenth again in throughput because the crop leaves the hall by the wagonload instead of by hand. Trains run themselves.' },
  { id: 'greenhouse', name: 'Grow Hall', cost: 500, perTile: true, drag: true, science: 0, key: 'G',
    desc: 'Drag out a pressurised grow hall of any size. Crops fill the whole hall, and cost, yield, lighting and water all scale with its footprint. 500 credits a tile.' },
  { id: 'solar', name: 'Solar Array', cost: 2200, science: 0, key: 'S',
    desc: '+2.5 kW peak while the sun is up. Worth nothing at lunar night.' },
  { id: 'battery', name: 'Battery Bank', cost: 1500, science: 0, key: 'B',
    desc: '+60 kWh of storage to carry load into the dark.' },
  { id: 'hab', name: 'Habitat Module', cost: 5600, science: 0, key: 'H',
    desc: 'Quarters for three. More hands, more mouths, and more carbon dioxide for the canopy.' },
  { id: 'isru', name: 'Ilmenite Reduction Plant', cost: 7500, science: 25, once: true, key: 'I',
    desc: 'Cooks hydrogen out of regolith to make water. +14 L/day while it has power.' },
  { id: 'composter', name: 'Biomass Oxidation Loop', cost: 5200, science: 20, once: true, key: 'C',
    desc: 'Composts stems, roots and crew waste back into carbon dioxide and nutrients. Returns 75% of a crop’s fixed carbon at harvest instead of 42%, and enlarges the CO₂ buffer.' },
  { id: 'reactor', name: 'Fission Surface Power', cost: 14000, science: 35, once: true, key: 'R',
    desc: 'A Kilopower-class reactor: 9 kW day and night. Ends the night problem for good.' },
  { id: 'pad', name: 'Landing Pad', cost: 3000, science: 0, once: true, key: 'P',
    desc: 'Cuts resupply prices by 15% and gets you a better rate on produce.' },
  { id: 'studio', name: 'Broadcast Studio', cost: 4200, science: 0, once: true, key: 'V',
    desc: 'Earth will pay to watch this farm work. Films the harvest, the mess table and the flowers being arranged, and pays every day from the audience it builds. Repeat the same subject and the audience tires of it — the studio pays for variety, not volume.' },
  { id: 'worms', name: 'Mealworm Tier', cost: 5800, science: 15, key: 'W',
    desc: 'Yellow mealworm reared on spent straw and stover. Turns residue nobody can eat into animal protein and a fertiliser frass, in the dark, without a lamp. Reared through a 105-day closed life-support experiment at Lunar Palace 1, where 8.13% of the feed came back as larval mass and 78.43% left as frass. Build more than one if the residue can feed them.' },
  { id: 'nitrifier', name: 'Nitrifying Bioreactor', cost: 4600, science: 18, once: true, key: 'K',
    desc: 'The compartment the loop was missing: nitrifying bacteria oxidising crew waste ammonia to nitrate the crop can actually take up. Lunar Palace 1 recovered 20.5% of its nitrogen from urine this way. Draws 0.3 kW and pays for itself in nutrients you stop importing.' },
  { id: 'digester', name: 'Anaerobic Digester', cost: 5400, science: 16, once: true, key: 'D',
    desc: 'Thermophilic digestion of solid waste and crop residue into biogas and mineralised nutrients — 41% of the solid waste degraded, in the Lunar Palace 1 run. The carbon comes back to the hall as carbon dioxide instead of leaving inside the food, which is the one thing that stops an exporting farm starving its own canopy.' },
  { id: 'reef', name: 'Reef Microcosm', cost: 9800, science: 30, once: true, key: 'F',
    speculative: true,
    desc: 'A closed marine microcosm: calcifying corals, their algal symbionts and the invertebrates that live in them. SPECULATIVE — no reef has been flown, and calcification is a local carbon dioxide source, not a sink. It earns its floor on the carbonate it lays down for construction, on holding marine lines the vault could not otherwise take, and on being the most watchable thing on the station.' },
  { id: 'tanks', name: 'Nutrient Tank Room', cost: 4400, science: 14, once: true, key: 'M',
    desc: 'EDEN ISS’s two-tank system: a leafy solution and a fruit solution, dosed for pH and fed automatically to every hall on the network. The tanks drift — salts build, pH climbs — and need replacing every two to three months. Required for aeroponic racks. Draws 0.15 kW.' },
  { id: 'nursery', name: 'Seedling Nursery', cost: 3600, science: 10, key: 'E',
    desc: 'Rockwool blocks under their own lamps, where EDEN ISS raised every seedling for ten to twenty days before transplanting it. Each nursery raises up to twelve tiles of transplants a fortnight, and a hall sown from them starts a fortnight ahead. Draws 0.2 kW.' },
  { id: 'vault', name: 'Lunar Seed Vault', cost: 18000, science: 40, once: true, key: 'N',
    desc: 'Sunk into the lava tube through the skylight, where the rock holds one temperature and metres of basalt stop what the surface cannot. Banks a living accession of every line you have grown. Needs the oxidation loop and regolith overburden before anyone will sign it off.' }
];

/* Equipment you fit farm-wide rather than place on a tile. */
const UPGRADES = [
  { id: 'recovery', name: 'Condensate Recovery', cost: 4200, science: 15, repeat: true,
    desc: 'Better humidity capture. +6% of all water use returned to the loop, and +15% dehumidifier capacity in the halls.' },
  { id: 'radiator', name: 'Radiator Wings', cost: 3800, science: 14, repeat: true,
    desc: 'More deployed radiator area. +40% heat rejection, so the halls can run their lamps harder before the canopy cooks — and stay cool at lunar noon, when the radiators look at a hot sky.' },
  { id: 'led', name: 'Deep-Red LED Retrofit', cost: 3600, science: 18, repeat: true,
    desc: 'Cuts lighting draw per house by 15%. The single biggest power win.' },
  { id: 'shield', name: 'Regolith Overburden', cost: 6400, science: 22, repeat: false,
    desc: 'Three metres of bagged regolith over the modules. Halves radiation damage.' },
  { id: 'eds', name: 'Electrodynamic Dust Shield', cost: 3400, science: 12, repeat: false,
    desc: 'Sheds regolith fines off the arrays. Dust no longer degrades solar output.' },
  { id: 'irrigation', name: 'Automatic Irrigation Loop', cost: 4800, science: 16, repeat: false,
    desc: 'Serviced houses water and feed themselves. No more walking the rows.' },
  { id: 'uvc', name: 'UV-C Sterilisation Rig', cost: 4400, science: 20, repeat: false,
    desc: 'Treats fungal outbreaks automatically before they spread.' },
  { id: 'harvester', name: 'Robotic Harvester', cost: 8200, science: 30, repeat: false,
    desc: 'Collects any house the moment its crop reaches maturity.' }
];

/* Event deck. Each returns a modal with one or more choices. */
/* the fruiting crops the fruit tank feeds — what the calcium alert watches for */
const LF_FRUIT_TANK = ['tomato', 'pepper', 'strawberry', 'cucumber'];

const EVENTS = [
  {
    id: 'spe', weight: 10, minDay: 12,
    title: 'Solar Particle Event',
    text: 'A flare on the near limb. Particle flux at the surface climbs fast, and the trays sit closest to the skylight. A plant takes a dose better than a person does: its stress response peaks at two to six hours and has settled within the day. A seedling is another matter.',
    choices: [
      { label: 'Shutter the bays and shelter', effect: 'spe_shelter',
        hint: 'Lights off for 12 hours. Crops idle, crew safe.' },
      { label: 'Keep the lights on', effect: 'spe_ride',
        hint: 'The canopy dips and recovers within a day. Newly sown halls lose seedlings, and the crew takes a dose. Arabidopsis in the halls would log the first plant data from a flare.' }
    ]
  },
  {
    id: 'micro', weight: 9, minDay: 6,
    title: 'Micrometeorite Puncture',
    text: 'Pressure telemetry is drifting down. Something small and very fast went through the outer skin near bay row two.',
    choices: [
      { label: 'Patch it now (2 spares)', effect: 'micro_patch',
        hint: 'Costs spares and half a day of crew time.' },
      { label: 'Log it and keep farming', effect: 'micro_ignore',
        hint: 'Pressure keeps bleeding until you deal with it.' }
    ]
  },
  {
    id: 'dust', weight: 8, minDay: 4,
    title: 'Regolith on the Arrays',
    text: 'A cargo lander came down two kilometres out and threw a sheet of fines across the farm. The panels are filthy.',
    choices: [
      { label: 'Send the crew out to clean', effect: 'dust_clean',
        hint: 'A day of work, and dust gets in everything.' },
      { label: 'Live with the loss', effect: 'dust_ignore',
        hint: 'Solar output stays degraded.' }
    ]
  },
  {
    id: 'fusarium', weight: 9, minDay: 10,
    title: 'Fusarium in the Trays',
    text: 'White fuzz on a stem, and the tray next to it is starting to wilt. Standing water in the wicks is the usual culprit.',
    choices: [
      { label: 'Sterilise the affected bays', effect: 'fus_treat',
        hint: 'Costs 400 credits. Stops it here.' },
      { label: 'Cut airflow and hope', effect: 'fus_ignore',
        hint: 'It will spread to neighbouring trays.' }
    ]
  },
  {
    id: 'busfault', weight: 6, minDay: 15,
    title: 'Power Bus Fault',
    text: 'An arc in the main distribution box. Half the battery string is isolated until someone rebuilds the connector.',
    choices: [
      { label: 'Rebuild it (3 spares)', effect: 'bus_fix', hint: 'Restores full storage.' },
      { label: 'Run degraded', effect: 'bus_ignore', hint: 'Storage stays halved until repaired.' }
    ]
  },
  {
    id: 'pump', weight: 7, minDay: 8,
    title: 'Biofilm in the Nutrient Loop',
    text: 'Flow rates are down across the manifold and the solution smells wrong. Biofilm has colonised the return line.',
    choices: [
      { label: 'Flush the loop (600 cr)', effect: 'pump_fix', hint: 'Recovery returns to normal.' },
      { label: 'Nurse it along', effect: 'pump_ignore', hint: 'Water recovery drops by 10%.' }
    ]
  },
  {
    id: 'resupply', weight: 8, minDay: 3,
    title: 'Resupply Window',
    text: 'A lander is inbound with spare mass to trade. The broker will deal in either direction while the window is open.',
    choices: [
      { label: 'Buy 8 spares and 300 L water (2200 cr)', effect: 'res_buy', hint: 'Stock up while you can.' },
      { label: 'Sell surplus produce at a premium', effect: 'res_sell', hint: 'Converts stored food into credits.' },
      { label: 'Wave it past', effect: 'none', hint: '' }
    ]
  },
  {
    id: 'grant', weight: 7, minDay: 20,
    title: 'Research Grant Review',
    text: 'Earth wants a data package from the tube. Your accumulated science is worth something to a funding panel.',
    choices: [
      { label: 'Submit the dataset', effect: 'grant_take', hint: 'Trades 20 science for credits.' },
      { label: 'Hold the data back', effect: 'none', hint: 'Keep the science for unlocks.' }
    ]
  },
  {
    id: 'transfer', weight: 6, minDay: 25,
    title: 'Colonist Transfer',
    text: 'Two agronomists are on the next rotation and the station wants to know if the farm can carry them.',
    choices: [
      { label: 'Accept them', effect: 'crew_add', hint: 'More CO₂ and more hands — and two more mouths.' },
      { label: 'Decline for now', effect: 'crew_decline', hint: 'Morale takes a small knock.' }
    ]
  },
  {
    id: 'seed', weight: 7, minDay: 22,
    title: 'Seed Stock Viability',
    text: 'The germination trays from the reserve locker are coming up patchy. Seed kept on the surface takes a dose year after year, and this batch has had enough of it.',
    choices: [
      { label: 'Order certified seed (1,800 cr)', effect: 'seed_buy',
        hint: 'Fresh stock from Earth. Nothing else changes.' },
      { label: 'Sow the old stock anyway', effect: 'seed_sow',
        hint: 'Everything planted for the next fortnight starts weak.' }
    ]
  },
  {
    id: 'subsidence', weight: 6, minDay: 30,
    title: 'Track Subsidence',
    text: 'A stretch of the line has settled. Unpacked regolith beneath the ballast has found somewhere to go, and the rails now sit a hand-width out of true.',
    choices: [
      { label: 'Regrade and repack (2 spares)', effect: 'sub_fix',
        hint: 'The haulage bonus keeps running.' },
      { label: 'Run slow over it', effect: 'sub_ignore',
        hint: 'No wagonload rate until it is fixed — halls lose the rail bonus.' }
    ]
  },
  {
    id: 'ec', weight: 8, minDay: 14,
    title: 'Nutrient Solution Drift',
    text: 'Conductivity is climbing across the manifold and the pH with it. Salts are accumulating faster than the crop is taking them up, which is the usual way of things in a tight loop.',
    choices: [
      { label: 'Flush and re-mix (120 nutrients)', effect: 'ec_flush',
        hint: 'Dump the solution and start clean. With a tank room, both tanks are replaced.' },
      { label: 'Dilute and carry on', effect: 'ec_ride',
        hint: 'Cheaper, but every hall loses most of its nutrient charge, and the tanks drift further.' }
    ]
  },
  {
    id: 'salad', weight: 9, minDay: 20,
    title: 'A Request From the Mess',
    text: 'Someone has asked, not entirely as a joke, whether anything green might reach a plate this month. Two weeks of the same reconstituted staple will do that to a crew.',
    choices: [
      { label: 'Cut a leafy crop for the mess', effect: 'salad_cut',
        hint: 'Loses that hall’s harvest. Worth a great deal to morale.' },
      { label: 'Everything goes to the store', effect: 'salad_hold',
        hint: 'The calories are banked and the mood is not.' }
    ]
  },
  {
    id: 'inoculant', weight: 7, minDay: 26,
    title: 'Mycorrhizal Inoculant',
    text: 'A pallet of fungal inoculant and composted biomass has come up on the lander. Worked through the beds it does in a week what a year of stubble does on its own.',
    choices: [
      { label: 'Work it through every hall (3,200 cr)', effect: 'inoc_take',
        hint: 'Conditions all beds a good deal further.' },
      { label: 'Leave it on the pad', effect: 'none', hint: '' }
    ]
  },
  {
    id: 'vip', weight: 6, minDay: 40,
    title: 'Programme Inspection',
    text: 'Someone from the programme office is coming through on the next rotation, with a clipboard and a view about whether this station is worth its manifest slot.',
    choices: [
      { label: 'Show them the whole operation', effect: 'vip_full',
        hint: 'Judged on closure and morale. A good farm is rewarded; a poor one is not.' },
      { label: 'Keep the tour short', effect: 'vip_brief',
        hint: 'A modest fee either way.' }
    ]
  },
  {
    id: 'mppt', weight: 6, minDay: 24,
    title: 'Charge Controller Fault',
    text: 'One string of arrays is not tracking its maximum power point. It still makes current; it simply makes noticeably less of it than the sun is offering.',
    choices: [
      { label: 'Swap the unit (2 spares)', effect: 'mppt_swap', hint: 'Back to full output.' },
      { label: 'Leave it in circuit', effect: 'mppt_run',
        hint: 'Solar output down by a third until it is replaced.' }
    ]
  },
  {
    id: 'samples', weight: 7, minDay: 35,
    title: 'Sample Return Request',
    text: 'A laboratory on Earth wants biomass grown in this regolith — roots, leaves and all, frozen and flown home. It is a real request, and it costs you food.',
    choices: [
      { label: 'Freeze and ship the samples', effect: 'samp_send',
        hint: 'Trades 40,000 kcal for a useful amount of science.' },
      { label: 'Decline — the colony eats first', effect: 'samp_keep',
        hint: 'No science, no loss.' }
    ]
  },
  {
    id: 'offtake', weight: 8, minDay: 16,
    title: 'The Station Wants Rid of Its Waste',
    text: 'Life support is storing more greywater sludge and solid waste than it has room for, and venting it means venting the nitrogen with it. The station would rather pay somebody to take the problem away.',
    choices: [
      { label: 'Take the contract', effect: 'offtake_take',
        hint: 'The station pays daily for every unit of waste you actually process. You need something that eats it.' },
      { label: 'The farm has enough to do', effect: 'offtake_decline',
        hint: 'No fee, and no waste stream to build on.' }
    ]
  },
  {
    id: 'wildrel', weight: 7, minDay: 34,
    title: 'Crop Wild Relatives',
    text: 'A crate of wild relatives has come up on the lander — the scruffy, unproductive ancestors of half the roster, carrying the drought and disease alleles that were bred out of the crops on the way to being useful. Nobody wants to eat them. Somebody will want them later.',
    choices: [
      { label: 'Grow them out and bank the seed (2,400 cr)', effect: 'wild_bank',
        hint: 'Costs a season of floor space. Adds accessions and science.' },
      { label: 'Send the crate back unopened', effect: 'wild_decline',
        hint: 'The floor stays under something that feeds people.' }
    ]
  },
  {
    id: 'landrace', weight: 6, minDay: 48,
    title: 'A Landrace, Offered',
    text: 'A seed bank on Earth is closing. They have written to ask whether the tube will take a landrace maize that has been grown by the same community for nine hundred years and is now held in one freezer with one compressor.',
    choices: [
      { label: 'Accept the accession', effect: 'land_take',
        hint: 'Banks it permanently. Costs nothing but the undertaking.' },
      { label: 'Refer them elsewhere', effect: 'land_decline',
        hint: 'It is not really what this farm is for. Yet.' }
    ]
  },
  {
    id: 'coldstore', weight: 6, minDay: 60,
    title: 'The Cold Store Is Drifting',
    text: 'The vault chamber is holding two degrees warmer than it should. The tube itself is stable — it is the seal at the skylight that is passing heat, and every accession below it is on the wrong side of that number.',
    choices: [
      { label: 'Reseal the shaft now (3 spares, 900 cr)', effect: 'cold_fix',
        hint: 'Whatever else is happening today, this comes first.' },
      { label: 'It will hold until the next window', effect: 'cold_ignore',
        hint: 'Risks losing banked accessions. They do not come back.' }
    ]
  },
  {
    id: 'commission', weight: 8, minDay: 30,
    title: 'A Commission From Earth',
    text: 'A broadcaster wants a made-to-order episode: one long unbroken shot of a harvest, start to finish, no narration. They are offering well above the usual rate, and they want it this week.',
    choices: [
      { label: 'Shoot it', effect: 'comm_take',
        hint: 'Pays on the size of your audience and how fresh your roster is.' },
      { label: 'The farm is not a set', effect: 'comm_decline',
        hint: 'Nothing gained, nothing lost.' }
    ]
  },
  {
    id: 'thermal', weight: 5, minDay: 18,
    title: 'Radiator Fouling',
    text: 'The farm is running warm. Dust on the radiator panels has halved their heat rejection, and the lamps are the biggest heat load in the halls. The canopy feels it first.',
    choices: [
      { label: 'Scrub the radiators (500 cr)', effect: 'therm_fix', hint: 'Back to nominal.' },
      { label: 'Throttle the lights instead', effect: 'therm_throttle',
        hint: 'Every hall on Low for four days: four-tenths less heat, two-thirds the growth.' }
    ]
  },
  {
    id: 'calcium', weight: 6, minDay: 30,
    when: s => s.map.some(t => t.b && t.b.type === 'tanks') && !(s.tanks && s.tanks.recipeFixed)
      && s.fields.some(f => f.crop && !f.dead && LF_FRUIT_TANK.includes(f.crop.replace(/_g$/, ''))),
    title: 'Calcium Deficiency in the Fruit',
    text: 'The newest tomato leaves are curling and the fruit is browning at the blossom end. Calcium moves only with the transpiration stream, and the fruit is not getting its share. EDEN ISS met exactly this in 2018, and changed the recipe mid-season.',
    choices: [
      { label: 'Change the fruit recipe (40 nutrients)', effect: 'ca_fix',
        hint: 'EDEN ISS’s fix: calcium 0.597 → 0.711, potassium 1.503 → 1.378 mol per 100 L. Permanent.' },
      { label: 'Spray calcium and carry on', effect: 'ca_ride',
        hint: 'For twenty days fruit from the fruit tank sells at 70% and feeds at 85%.' }
    ]
  },
  {
    id: 'scrubber', weight: 6, minDay: 20,
    title: 'CO\u2082 Scrubber Down',
    text: 'The amine bed in the hall air loop has stopped regenerating. With nothing taking CO\u2082 out, the crew\u2019s own breathing is the source — which is exactly how EDEN ISS spent most of an Antarctic winter at 2,000 to 4,000 ppm.',
    choices: [
      { label: 'Swap the bed (900 cr)', effect: 'scrub_fix', hint: 'Back to the setpoint within hours.' },
      { label: 'Run without it for three days', effect: 'scrub_ride',
        hint: 'The canopy grows faster on the extra carbon. The crew get headaches, and morale pays.' }
    ]
  },
  {
    id: 'airhandler', weight: 5, minDay: 16,
    when: s => s.fields.some(f => f.crop && !f.dead),
    title: 'Air Handler Seized',
    text: 'A fan bearing in one hall\u2019s air handler has seized. With the lamps on and no air exchange, a sealed canopy draws its CO\u2082 down to nothing in minutes — and then it simply stops.',
    choices: [
      { label: 'Replace the bearing (400 cr)', effect: 'air_fix', hint: 'Air moving again today.' },
      { label: 'Seal the hall until a part comes', effect: 'air_seal',
        hint: 'The biggest lit hall barely grows for three days.' }
    ]
  }
];

const MILESTONES = [
  { id: 'first', text: 'Bring in your first harvest', done: s => s.stats.harvests >= 1 },
  { id: 'ten', text: 'Land ten harvests', done: s => s.stats.harvests >= 10 },
  { id: 'night', text: 'Bring the farm through a full lunar night', done: s => s.stats.nightsSurvived >= 1 },
  { id: 'closure', text: 'Hold food closure at 100% for 30 straight days', done: s => s.stats.closureStreak >= 30 },
  { id: 'crew8', text: 'Support a colony of eight', done: s => s.crew >= 8 },
  { id: 'reactor', text: 'Commission surface fission power',
    done: s => s.map.some(t => t.b && t.b.type === 'reactor') },
  { id: 'forty', text: 'Put forty tiles of ground under glass',
    done: s => s.fields.reduce((a, f) => a + f.w * f.h, 0) >= 40 },
  { id: 'bighall', text: 'Raise a single hall of twenty tiles or more',
    done: s => s.fields.some(f => f.w * f.h >= 20) },
  { id: 'variety', text: 'Harvest ten different crops', done: s => Object.keys(s.stats.kinds).length >= 10 },
  { id: 'everycrop', text: 'Grow every crop in the roster at least once',
    done: s => Object.keys(s.stats.kinds).length >= CROPS.length },
  { id: 'worked', text: 'Bring a hall to fully worked ground',
    done: s => s.fields.some(f => (f.soil || 0) >= 0.995) },
  { id: 'allworked', text: 'Have every hall on fully worked ground',
    done: s => s.fields.length >= 3 && s.fields.every(f => (f.soil || 0) >= 0.995) },
  { id: 'freight', text: 'Run freight: a hall served by its own rail head',
    done: s => s.map.filter(t => t.b && t.b.type === 'rail').length >= 8
      && s.fields.some(f => f.railed) },
  { id: 'shielded', text: 'Bury the farm under regolith shielding', done: s => !!s.up.shield },
  { id: 'science', text: 'Bank fifty science', done: s => s.science >= 50 },
  { id: 'abundance', text: 'Grow twice what the colony eats',
    done: s => s.stats.lastClosure >= 2 },
  { id: 'fivenights', text: 'Come through five lunar nights', done: s => s.stats.nightsSurvived >= 5 },
  { id: 'ayear', text: 'Farm for a full Earth year', done: s => s.day >= 365 },
  { id: 'onair', text: 'Put the farm on air',
    done: s => (s.media && s.media.aired) > 0 },
  { id: 'audience', text: 'Build an audience of five hundred',
    done: s => (s.media && s.media.audience || 0) >= 500 },
  { id: 'darkcrop', text: 'Bring in a crop that never needed a lamp',
    done: s => CROPS.some(c => c.dark && s.stats.kinds[c.id]) },
  { id: 'biotech', text: 'Develop a line that never existed on Earth',
    done: s => Object.keys(s.gmo || {}).length >= 1 },
  { id: 'accessions10', text: 'Bank ten accessions',
    done: s => Object.keys((s.vault && s.vault.accessions) || {}).length >= 10 },
  { id: 'accessions25', text: 'Bank twenty-five accessions',
    done: s => Object.keys((s.vault && s.vault.accessions) || {}).length >= 25 },
  { id: 'vaultbuilt', text: 'Commission the seed vault in the tube',
    done: s => s.map.some(t => t.b && t.b.type === 'vault') },
  { id: 'recycler', text: 'Put a recycling compartment to work',
    done: s => ['worms', 'nitrifier', 'digester', 'reef']
      .some(t => s.map.some(x => x.b && x.b.type === t)) },
  { id: 'fullloop', text: 'Run every recycling compartment at once',
    done: s => ['worms', 'nitrifier', 'digester', 'reef']
      .every(t => s.map.some(x => x.b && x.b.type === t)) },
  { id: 'serviced', text: 'Supply half the colony’s life support from the farm',
    done: s => (s.stats.lsShare || 0) >= 0.5 },
  { id: 'nowaste', text: 'Process a thousand units of station waste',
    done: s => (s.stats.wasteProcessed || 0) >= 1000 },
  { id: 'ark', text: 'Bank every line the farm can grow',
    done: s => Object.keys((s.vault && s.vault.accessions) || {}).length >= CROPS.length + GMO.length },
  /* the season figure, so a farm has to keep it up rather than spike it once */
  { id: 'lp1', text: 'Match Lunar Palace 1: 0.068 kg of fresh food per m² per day, over the season',
    done: s => s.day >= 60 && (s.stats.kgm2d || 0) >= 0.068 },
  { id: 'eden', text: 'Out-grow EDEN ISS: 0.075 kg per m² per day, over the season',
    done: s => s.day >= 60 && (s.stats.kgm2d || 0) >= 0.075 },
  { id: 'bpc', text: 'Reach the KSC Biomass Production Chamber: about 0.17 kg per m² per day',
    done: s => s.day >= 60 && (s.stats.kgm2d || 0) >= 0.17 },
  { id: 'highlight', text: 'Bring in a crop grown under 600 µmol of light',
    done: s => (s.stats.highLight || 0) >= 1 },
  { id: 'picks', text: 'Pick one cut-and-come-again planting ten times',
    done: s => (s.stats.maxPicks || 0) >= 10 },
  { id: 'aero', text: 'Bring in a crop grown on bare roots in mist',
    done: s => (s.stats.aeroHarvests || 0) >= 1 },
  { id: 'sintered', text: 'Fire a hall’s regolith into sintered beds',
    done: s => (s.stats.sinteredHalls || 0) >= 1 },
  { id: 'tanks90', text: 'Hold both nutrient tanks in band for ninety days',
    done: s => (s.stats.tanksInBand || 0) >= 90 },
  { id: 'transplant', text: 'Sow a hall from the nursery',
    done: s => (s.stats.transplants || 0) >= 1 },
  { id: 'flarestudy', text: 'Collect the first plant data from a solar particle event',
    done: s => !!(s.studies && s.studies.flare) },
  { id: 'studies3', text: 'Re-run three published trials on your own farm',
    done: s => Object.keys(s.studies || {}).length >= 3 },
  { id: 'notes', text: 'File every field note',
    done: s => Object.keys(s.notes || {}).length >= FIELD_NOTES.length }
];

window.LF_DATA = { K, CROPS, TRAITS, GMO, BUILDINGS, UPGRADES, EVENTS, MILESTONES, BENCHMARKS, EDEN_SEASON,
                   TANKS, SUBSTRATES, LF_FRUIT_TANK, STUDIES, FIELD_NOTES };
