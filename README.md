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
- **Condition the beds.** Regolith is not soil until you make it soil: a new hall is sterile dust
  and grows at about two-thirds rate until roots and stubble have been worked through it. Each
  harvest improves it, the biomass loop improves it faster, or you can buy the conditioning
  outright. Bulldozing a hall throws that work away.
- **Drag out track and rail.** Press, drag, release: the run takes the longer axis
  first and turns once. The preview colours each tile green or red and totals the
  cost as you go; blocked tiles are skipped rather than charged for.
- A hall that does not touch a track reaching the habitat cannot be serviced and
  grows at about three-quarters speed.
- **Rail** carries service like track and gives any hall it touches a tenth again in
  throughput. Freight trains run the line by themselves; give them a loop or a long
  spine rather than a stub.
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
pan** (arrow keys and `+`/`-` also work). **On touch:** one finger builds when a
build tool is up and otherwise drags the map, a tap uses the current tool, and two
fingers pinch to zoom and pan together. One pointer-based code path serves mouse,
pen and touch alike. Zoom in and the settlement is alive —
suited crew walking the track network, rovers hauling between modules, freight
trains working the rail with their wagons swinging properly through the corners,
and build bots throwing sparks over anything newly raised until it tops out.
Habitats are drawn in full: regolith berms, ribbed hulls, an airlock cap with
chevrons, lit portholes that glow through the lunar night, radiator fins and a
comms mast with a blinking beacon.

Earth hangs over the plate, showing the phase opposite to the local lunar day, so
it is fullest at midnight. Modules sit on soft contact shadows and catch a rim
light along the roof edges the sun reaches; rovers kick up dust. Anyone who walks
behind a solid module returns as a pale silhouette rather than vanishing — glazed
halls need no such help, because you can see straight through them.

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

### Testing

`sim.js` and `data.js` contain no DOM references at all — the dependency runs one way,
renderer to simulation, never back. That is what makes the balance testable, and it is why the
simulation survived three renderer rewrites almost untouched.

Open **`farm/harness.html`** in a browser. It loads only the data and the simulation, replaces
`Math.random` with a seeded generator so runs are reproducible, and plays nine scenarios out
over hundreds of simulated days — a careless farm failing, a competent one closing the food
loop, auto-manage surviving unattended, the unserviced and rail modifiers each biting by the
amount they claim, raw regolith yielding what the constant says, a monoculture costing morale,
the lunar night shedding load, and a run surviving the JSON round trip it is stored as.

It needs no install and no build step. **Re-run it after any change to `sim.js` or `data.js`** —
balance is only visible over hundreds of days and cannot be judged by eye.

### Layout

```
index.html          hub page
farm/
  index.html        game shell, help text
  harness.html      headless simulation tests — open it in a browser
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

## The rest of the arcade

Lunar Farm is one game in a set. The **[CoSE Arcade](https://dr-richard-barker.github.io/cose-arcade/)**
is the front door; the **[Lunar Arcade](https://dr-richard-barker.github.io/lunar-arcade/)** holds the
other lunar titles, including
[Lunar Habitat](https://dr-richard-barker.github.io/lunar-arcade/games/lunar-habitat/) — the
vertical-builder formula upended, towering up for sunlight or digging down into the shielding — and
[The Boring Mining Game](https://dr-richard-barker.github.io/lunar-arcade/games/boring-mining/), an ISRU
swarm where you pilot one drone and lay scent beacons the rest follow.

Those two cover the SimTower and SimAnt shapes, so this repository does not duplicate them. The
arcade's own **Regolith Farm** concept has been folded into this game rather than built separately —
its regolith-into-soil premise is the bed-conditioning mechanic above.

## Provenance

Written from scratch. These games take their shape from *SimFarm*, *SimTower* and
*SimAnt* (Maxis, 1993–94) and share no code, art or data with them. None of those
games is distributed in this repository.

## Licence

MIT for the code. See `LICENSE`.
