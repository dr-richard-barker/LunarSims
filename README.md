# Lunar Sims

Original browser simulation games set on the lunar surface, in the spirit of the
Maxis management sims of the early nineties. No build step, no dependencies, no
emulator — static HTML, CSS and JavaScript.

**Live:** https://dr-richard-barker.github.io/LunarSims/

## Lunar Farm

`farm/` — you run the farm that feeds a lava-tube colony at the Marius Hills
skylight.

Pick a tool from the palette, then click or drag on the ground:

- **Drag out a grow hall** of any size up to 8×8. A hall is one field: it takes a
  single crop across its whole floor, and cost, yield, lighting draw and water all
  scale with its footprint.
- **Sow, water, feed, treat and harvest** whole halls.
- **Lay regolith track** — a hall that does not touch a track reaching the habitat
  cannot be serviced and grows at about three-quarters speed.
- **Build** solar arrays, battery banks, habitats, an ilmenite reduction plant for
  water, a biomass oxidation loop for carbon, a landing pad and, eventually,
  fission surface power.

Three things drive the difficulty:

- **The lunar night.** The cycle runs 29.5 Earth days, half of it dark. Solar gives
  you nothing for a fortnight, and lighting is shed one whole hall at a time as the
  batteries drain. Batteries bridge part of it; a reactor ends the problem.
- **The carbon loop.** Plants consume CO₂ and the crew produce it. A farm that
  exports food exports carbon with it, so the buffer runs down unless you build the
  oxidation loop or buy cylinders.
- **Calories versus everything else.** Leafy greens are quick and barely feed
  anyone; potato, sweetpotato, wheat and soybean close the gap. Zinnias feed nobody
  and lift morale. Arabidopsis pays only in science, which is what unlocks the
  serious hardware.

### The view

The plot is drawn in 2:1 isometric projection: extruded structures lit by the real
sun angle, long shadows that swing round as the lunar day passes, and glazed halls
you can see the canopy through. **Scroll to zoom, drag with the right button to
pan** (arrow keys and `+`/`-` also work). Zoom in and the settlement is alive —
suited crew walking the track network, rovers hauling between modules, and build
bots throwing sparks over anything newly raised until it tops out.

### Extras in the header

- **Auto-manage** hands the daily tending to the crew: they water, feed, treat,
  harvest, replant and restock, keeping a working float in the bank.
- **Report** opens a telemetry dashboard — eight metrics over time with the lunar
  nights banded behind them — written either as a situation report to Earth
  Operations or, at one click, as a note to the settlers. Same facts, different room.
- **League** scores the run and files it against previous ones. Export writes a JSON
  file; import merges someone else's back in.
- **Sandbox** makes all construction free.

Progress saves to `localStorage` once a day and on demand. The league is stored the
same way — there is no server behind the page, which is why export exists.

### Layout

```
index.html          hub page
farm/
  index.html        game shell, help text
  style.css
  js/data.js        crops, structures, equipment, events, milestones
  js/sim.js         the simulation — one tick is one hour
  js/agents.js      crew, rovers and build bots — cosmetic, reads the same state
  js/render.js      isometric canvas renderer, procedural throughout
  js/dashboard.js   the report dashboard
  js/league.js      scoring, the league table, export and import
  js/ui.js          tools, camera, panels, main loop, saving
```

## On the crop list

The crops are real ones: `'Outredgeous'` red romaine, mizuna and Tokyo Bekana from
the ISS Veggie experiments; the `'Red Robin'` dwarf tomato of VEG-05; the
`'Española Improved'` chile of Plant Habitat-04; `'USU-Apogee'` dwarf wheat, bred at
Utah State for controlled-environment life support; potato, sweetpotato and soybean
from the CELSS-era candidate lists; Arabidopsis, which pays in data; and spirulina,
the photosynthetic compartment of the MELiSSA loop.

The **numbers attached to them are balanced for play, not measured.** Days to
maturity are in the right region for each crop, and the gas, water and energy
relationships behave qualitatively as they should, but nothing here should be cited.

## Provenance

Written from scratch. These games take their shape from *SimFarm*, *SimTower* and
*SimAnt* (Maxis, 1993–94) and share no code, art or data with them. None of those
games is distributed in this repository.

## Licence

MIT for the code. See `LICENSE`.
