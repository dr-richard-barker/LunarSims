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
     as permanently shadowed. Both are used by map generation and, later,
     by solar output and ice yield. */
  SUN_PEAK: 0.88,
  SUN_SHADOW: 0.18
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

/* Deposits are surveyed in at map generation. Distribution follows the real
   geology as far as a playable map allows, and — unlike Artemis City — it is
   now driven by the elevation model rather than scattered independently of
   it: ice concentrates where the sun genuinely never reaches. */
const DEPOSITS = [
  { id: 'regolith', name: 'Regolith', colour: '#9a9088',
    note: 'Loose lunar soil, ubiquitous but variable in how easily it yields useful volatiles.' },
  { id: 'ice', name: 'Water Ice', colour: '#bfe3f2',
    note: 'Mixed into regolith on permanently shadowed ground — the resource the Artemis programme is actually chasing.' },
  { id: 'he3', name: 'Helium-3', colour: '#e8c96b',
    note: 'Solar-wind particles implanted in mature, sun-exposed regolith over billions of years — a speculative but often-cited fusion feedstock.' }
];

/* Phase 1 tool roster: terrain sculpting and inspection. Zoning, networks
   and services join this list in later phases. */
const TOOLS = [
  { id: 'inspect', name: 'Inspect', glyph: '🔍', key: '1',
    hint: 'Click any tile to read its height, sunlight and deposits.' },
  { id: 'raise', name: 'Raise Land', glyph: '▲', key: '2',
    hint: 'Raise ground one level. Neighbours are pulled up to keep the slope walkable.' },
  { id: 'lower', name: 'Lower Land', glyph: '▼', key: '3',
    hint: 'Lower ground one level. Neighbours are pulled down to keep the slope walkable.' },
  { id: 'level', name: 'Level Land', glyph: '▬', key: '4',
    hint: 'Flatten a tile to match the first tile you click — the tool for building pads.' },
  { id: 'clear', name: 'Clear Boulders', glyph: '✖', key: '5',
    hint: 'Clear a boulder field back to open regolith.' }
];

window.LM_DATA = { K, TERRAIN, DEPOSITS, TOOLS };
