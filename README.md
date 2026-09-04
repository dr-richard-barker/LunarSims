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
- **Put the farm on air.** A broadcast studio films the harvest, the mess table and
  the flowers being arranged, and pays every day — see *Earth is watching* below.
- **Sink a seed vault into the tube** through the skylight the station was founded on.
- **Answer the station alerts.** Eighteen of them, each a decision rather than a
  dice roll: shelter from a flare or keep the lamps on, patch a puncture or log it,
  buy certified seed or sow the tired stock, cut a leafy crop for the mess or bank
  the calories. Eighteen milestones mark a farm that works.

Four things drive the difficulty:

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
- **Cash arrives in lumps.** A potato is three months away from the day you sow it,
  and until the studio is built there is nothing coming in between harvests. The
  first serious decision of the game is whether to spend the opening capital on
  another hall or on the thing that pays you while the hall grows.

### Earth is watching

The **Broadcast Studio** is the farm's second income, and the answer to running out
of money halfway through a potato. Every day it files what it has: the crop standing
in the halls, the crew at the mess table, a flower crop being cut and arranged.

It pays twice. A **delivery fee** arrives per segment — that is the floor that keeps
you solvent between harvests. Then it pays again on the **audience** the programme
has built, and the audience is where biodiversity becomes an economic force rather
than a nice idea:

- Every subject carries a **novelty** that collapses the moment it airs and recovers
  over the following fortnight.
- The fee falls off gently with novelty, so a monoculture still earns a living.
- Audience growth goes as novelty **squared**, so a tired subject adds almost nothing
  to it.

The measured effect, from `harness.html`: a farm rotating ten crops earns about
**2.7×** what the same farm growing only potatoes earns, and holds an audience
several times larger. Show Earth the same potato every week and the programme dies
quietly.

### Things that grow in the dark

Not everything in the catalogue is a plant. **Oyster mushrooms** fruit on the spent
straw and stover that every harvest leaves behind, and they need no lamp at all —
so they keep producing straight through the fortnight of lunar night, when every lit
hall is being shed one at a time. They also **respire**: they burn oxygen and hand
back carbon dioxide, the reverse of a canopy, which quietly refills the buffer that
an exporting farm runs down. They are also sensitive to it, and run to stem instead
of cap if the hall gets too rich — which is a real constraint on growing them in a
closed loop, not an invented one.

Yeast and rhizobia work the same way; cyanobacteria fix their own nitrogen and
return it to the nutrient tanks. All four are watched by the new **residue** figure,
which is what the cultures eat and only comes from harvesting something
photosynthetic. A farm of nothing but mushrooms starves.

### Biotechnology

Sow every conventional crop at least once and the **Biotech Lab** opens under
Research. Sixteen engineered lines are then available to develop, each a real crop
carrying real traits — improved harvest index, biofortification, a photorespiratory
bypass, faster relaxation of non-photochemical quenching, extended bloom, radiation
tolerance, reduced stomatal density, low-light tolerance, perchlorate tolerance, a
shortened cycle, molecular farming, seed longevity, assisted fruit set, a nitrogen
partnership, carbon dioxide tolerance.

A line is not authored as a whole crop; it is its base crop run through its trait
list, so the trait table *is* the design. The in-game reference under Research
describes what each trait is and what it does to the farm. Engineered seed costs
more than conventional, permanently.

**[Fifteen Traits for a Moon Farm](https://claude.ai/code/artifact/c1c0c544-7b36-4f5e-b1ae-8d853a8256af)**
sets the whole roster out in one page — what each trait is, what it buys, and an
interactive composer that runs the game's own derivation so you can stack traits on
any crop and watch credits per tile per day move. Its data is read from `data.js`,
so the page and the game cannot drift apart.

### The vault is the point

Everything you harvest is banked as an **accession**: a line held in living store.
The goal of the station is not the farm — it is the **Lunar Seed Vault**, sunk into
the lava tube through the skylight the settlement was founded on, where the rock
holds one temperature and tens of metres of basalt stop what no surface structure
can. It needs the oxidation loop running, regolith overburden fitted, and twelve
accessions in hand before it can be signed off. After that it pays a slow dividend
in data on everything it holds, and a line kept in the vault can be re-sown from
secured stock when a tired-seed year would otherwise ruin it.

The ledger sits at the top of the Goals tab. The target is every line the farm can
grow — twenty-nine conventional, sixteen engineered, plant and microbe alike — plus
the crop wild relatives and landraces that arrive by lander and are worth taking in.
That is the score that outlasts the run.

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
  harvest, replant and restock, keeping a working float in the bank. They rotate
  deliberately, sowing whatever has been off screen longest, because that is what
  the studio pays for.
- **Catalogue** opens the seed catalogue outside of sowing: every line the farm can
  grow, photographed and credited, with the engineered ones and their traits.
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
`Math.random` with a seeded generator so runs are reproducible, and plays sixteen scenarios out
over hundreds of simulated days — a careless farm failing, a competent one closing the food
loop, auto-manage surviving unattended, the unserviced and rail modifiers each biting by the
amount they claim, raw regolith yielding what the constant says, a monoculture costing morale,
the lunar night shedding load, every event choice resolving, saves carrying forward, and a run
surviving the JSON round trip it is stored as.

Five of those scenarios exist because of the systems above, and two are worth knowing about:

- **An expanding farm is never stranded** is the regression test for the reported fault —
  that money arrived only at harvest, so expanding left the player with nothing to spend for
  fifty days. It plays the same farm with and without a studio and measures the longest run
  of consecutive days spent unable to afford anything. Without one that run is thirty days or
  more; with one it is **three**.
- **The studio pays for variety, not volume** asserts the biodiversity incentive numerically:
  a rotation of ten crops must out-earn a monoculture by a clear margin (it manages **2.7×**),
  while a monoculture must still clear a survivable floor.

It needs no install and no build step. **Re-run it after any change to `sim.js` or `data.js`** —
balance is only visible over hundreds of days and cannot be judged by eye.

### Performance

Open **`farm/perf.html`**. It times the three things that happen every frame — the
simulation tick, the agent update and the render — across four farms, from a fresh plot
to the plot packed with the biggest halls it will hold, all in ripe wheat. It also counts
the canvas calls each render issues, so a slow frame can be traced rather than guessed at.

Measured on a development laptop, worst case (322 tiles under glass, 90 halls, 19 agents):

| | ms per call | share of a 60fps frame |
|---|---|---|
| Simulation tick (one game hour) | 0.03 | negligible — 12 ticks a second at 12× costs 0.04% of wall clock |
| Agent update | 0.008 | negligible |
| Render | 5.74 | 34% |

**The render is effectively the entire frame cost, and it is comfortable.** No optimisation
is warranted, which is the useful result: content can be deepened without fear. Two things
worth knowing before that changes:

- An **empty** plot already costs 1.3 ms and 6,890 canvas calls, most of it the regolith
  speckle — a fixed tax paid every frame for something that never moves. Caching the terrain
  to an offscreen bitmap is the obvious lever *if one is ever needed*; it is not needed now,
  and it would buy a saving at the cost of invalidating the cache whenever the light or the
  map changes.
- These are desktop numbers. A mid-range phone runs several times slower, so the ceiling case
  could fall below 60fps on mobile. **Measure on a real device before acting** — that is what
  this page is for, and guessing is what it exists to prevent.

### Layout

```
index.html          hub page
farm/
  index.html        game shell, help text
  harness.html      headless simulation tests — open it in a browser
  perf.html         frame-cost profile — open it in a browser
  style.css
  img/              catalogue photography, openly licensed
  img/credits.json  the manifest: source, creator and licence for every image
  img/CREDITS.md    generated from the manifest — do not hand-edit
  js/data.js        crops, traits, engineered lines, structures, equipment, events, milestones
  js/sim.js         the simulation — one tick is one hour
  js/agents.js      crew, rovers and build bots — cosmetic, reads the same state
  js/render.js      isometric canvas renderer, procedural throughout
  js/dashboard.js   the report dashboard
  js/league.js      scoring, the league table, export and import
  js/ui.js          tools, camera, panels, main loop, saving
```

## Artemis City

`city/` — you found a colony on the rim of Shackleton crater, near-permanent sun
for the array field and the permanently shadowed floor below holding the water
ice the whole Artemis program is chasing.

Where Lunar Farm is one plot with one purpose, Artemis City is a SimCity2000-style
zoning game: you paint ground, not finished buildings, and the colony develops it
on its own.

- **Zone Habitation, Trade or Industrial** ground by dragging a rectangle. Each
  tile inside grows independently through five stages of density, as long as it
  is serviced by a road reaching the Command Module, demand for that zone type is
  positive, and the land underneath it — terrain, hazard proximity, closeness to
  a grow hall — supports it. The three zones chase each other the way a real RCI
  loop does: Habitation wants jobs to outrun population, Trade and Industry each
  want population to outrun their own capacity.
- **The Agriculture zone is not a zone** — it is Lunar Farm's grow hall, ported
  directly: drag out a hall, sow it, water, feed, harvest. It is the one thing
  that feeds the colony rather than developing on its own, and it uses the same
  soil-conditioning mechanic as `farm/` and ten of its thirteen real spaceflight
  crops.
- **Drag out road and rail** with the same press-drag-release, longer-axis-first
  tool as Lunar Farm's track.
- **Mine what the survey found.** Regolith, ice and helium-3 are surveyed in at
  founding — ice concentrated on the permanently shadowed floor, helium-3 rare
  and patchy on sun-exposed ground, matching the real geology as far as a
  playable map allows. A Mining Rig only sits on a surveyed deposit and draws
  from it at a rate set by richness; an ISRU plant cracks water out of stockpiled
  ice.
- **Build the Launch Pad** and fly rockets to Earth: each launch loads
  helium-3 first, then bulk regolith, then any food genuinely surplus to a
  twenty-day reserve, and converts the payload to credits on a cooldown.
- **Ten solar-flare-to-moonquake colony alerts**, each a choice rather than a
  dice roll, and a charter of milestones tracking the colony's growth from its
  first zoned tile to its tenth rocket.
- **Six colony-wide Upgrades**, bought once rather than placed on a tile —
  dust shielding, a grow-hall lighting retrofit, better water recovery,
  blast shielding, self-tending grow halls, and harder mining-rig drill bits.
  Free under Free Mode, same as everything else.
- **A self-sufficiency signal**, read off the same numbers the sim already
  tracks: a day counts when the grid held without browning out, the larder
  has more than five days of food ahead of it, and the zoned districts
  brought in more than they cost. Hold it ten straight days for a milestone.

Three switches sit in the header, same shape as Lunar Farm's:

- **Free Mode** waives every cost, for experimenting with layouts.
- **Disasters** turns the random-event deck off entirely — off by default,
  so a first-time colony isn't opting out of anything, only in.
- **Automanage** hands the colony to a director that zones, roads, powers,
  mines and farms it without you — adapted from the priority-ladder autopilot
  in [Lunar Habitat](https://dr-richard-barker.github.io/lunar-arcade/games/lunar-habitat/).
  It survives its first hundred-plus days unattended and builds a real, if
  imperfect, city; a population boom released all at once by a long-suppressed
  migration backlog can still outrun it in the long run, which is a real,
  documented tuning edge rather than a hidden one. Once established, it also
  chases the self-sufficiency signal above — a colony whose books are
  trending backwards gets its zoning and survey expansion throttled in
  favour of the mining/ISRU/launch economy that actually pays for itself.

Same **Report** dashboard and **League** scoring as Lunar Farm, reading the
colony's own telemetry — population, housing capacity, jobs, credits, food,
oxygen, water and stored power over time.

### Testing

Same discipline as `farm/`: `city/js/{data,grid,zones,sim,autopilot}.js` have no
DOM references, so `city/harness.html` drives the whole simulation — map
generation, road connectivity, zoning and land value, population and migration,
Free Mode, the disaster deck, mining and the export economy, and the Automanage
director — headlessly, over hundreds of simulated days. Re-run it after any
change to those five files.

### Layout

```
city/
  index.html        game shell, help text
  harness.html       headless simulation tests — open it in a browser
  style.css
  js/data.js         zones, buildings, deposits, events, milestones
  js/grid.js          road-network connectivity (BFS from the Command Module)
  js/zones.js          RCI-style demand, land value, per-tile growth/decay
  js/sim.js             the simulation — one tick is one hour
  js/autopilot.js        the Automanage director
  js/render.js             isometric canvas renderer, procedural throughout
  js/dashboard.js           the report dashboard
  js/league.js               scoring, the league table, export and import
  js/ui.js                    tools, camera, panels, main loop, saving
```

## Lunar Metropolis

`metro/` — a sandbox city builder, and the largest of the three. Where Artemis
City is a colony simulation with zoning in it, Lunar Metropolis is a city
builder first: there is no survival clock, no starvation, and no fail state of
any kind. The worst thing that can happen to you is ground you have to rebuild.

The defining difference from `city/` is **elevation**. Every tile carries an
integer height, and a tile's sunlight is derived once from that height by
raycasting against its neighbours at a low polar sun angle. That single derived
field is what makes the terrain tools strategic rather than cosmetic:

- crater rims approach the **peaks of eternal light** that make polar landing
  sites worth having, and are where a solar array earns its keep;
- deep floors are **permanently shadowed**, and are exactly where the ice is.

So every site decision is a trade between power and water, and sculpting the
ground changes the economics of it.

### What the Moon does to the SimCity systems

The setting is not a skin over the usual subsystems — it motivates them.

| SimCity 2000 | Lunar Metropolis |
|---|---|
| Water pipes | **Atmosphere mains** — buried, so they coexist with anything on the tile |
| Power lines | **Power conduits** — current also flows through developed buildings |
| Roads | **Transit tubes** — pure adjacency, no network solve |
| Hills and waterfront | **Crater rims and shadowed floors** |
| Pollution | **Regolith dust** — a diffusing field that fouls the arrays and land value |
| Crime | **Maintenance backlog** — underfunded repair costs you density |
| Police and fire | **Repair depots and medbays**, with coverage radii |
| Arcologies | **Lava-tube megadome**, which must abut a real skylight |
| Neighbour connections | **Mass driver**, which needs a long level ridge to run along |

### Eras

Four of them — Outpost, Settlement, Colony, Metropolis — each unlocked by
reaching **both** a population high-water mark and a research total. Pairing the
two is what stops the science budget being safe to zero out forever, and stops a
small well-funded outpost building a skyline. Each era raises the density
ceiling, unlocks buildings, and changes what the city looks like: bermed
regolith cans, then domes and mid-rise, then radiator fins and lit viewports,
then towers with window grids and skyways between the dense blocks.

### Districts, wonders and traffic

Alongside the six RCI zoning brushes there are two **special districts**, both
demand-free — they answer no RCI index and build out whenever they are
serviced, because a garrison does not appear because consumers wanted one.

- **Military**, gated on the General's offer. SimCity 2000 offered a base once
  the city was big enough and sited it for you, choosing from the terrain; here
  you site it yourself but the ground still decides *which kind* you get —
  flat open ground a Landing Field, broken ground a Garrison, deep shadowed
  craters a Silo Field.
- **Launch Complex** — pads, gantries and fuel farms paying an export income,
  fouling their own ground with regolith every time something lifts off.

**Eight wonders**, each gated on terrain you had to find or sculpt rather than
on a bank balance: the Lava-Tube Megadome (beside a skylight), Mass Driver
(a long level ridge), Space Elevator (high ground), Lunar Eiffel (level
ground), Far-Side Radio Telescope (a shadowed crater floor), Heliostat Crown
(a peak of eternal light), Olympus Arena (a clear level site) and the Launch
Arcology (beside a working pad). Two are real proposals — the telescope is the
Lunar Crater Radio Telescope, and a space elevator genuinely *is* buildable at
one sixth of a gravity with materials that exist.

The city is also **populated**: suited pedestrians on the developed ground and
in the biodomes, moon cars and buses on the tube streets, and trains running
the long avenues. Purely cosmetic, never saved, and paused when the clock is.

### The sun moves

Not the way it would on Earth. At a polar site the sun does not rise and set —
it tracks around the horizon at very low elevation over the 29.5-day cycle,
which is the whole reason the peaks of eternal light and the permanently
shadowed floors exist at all. So the sun's **azimuth** sweeps a full turn each
month and the shading of every cliff and every building face swings round with
it. How *much* light a tile gets never changes; only the direction does.

### The four modes

All four are off by default and all four persist with the save.

- **🤖 Auto-play** — an AI director builds and manages the city on a priority
  ladder: budget, ground clearance, power, air, networks, zoning, civic
  services, wonders, expansion. Utilities before ground and ground before
  buildings, so it never widens the city while the part it has is browning out.
  Your own tools keep working alongside it.
- **∞ Sandbox** — everything free, nothing era-locked, for you and the director
  alike. It deliberately does not touch the era itself: the city still advances
  as it grows, so the architecture is still earned. Sandbox removes the price
  tag, not the progression.
- **☄ Disasters** — off by default, because this is a builder and having a city
  wrecked should be opted into. Four events that each cost you something
  different: a seal blowout takes networks, a dust surge takes economy, a solar
  flare takes power city-wide for a few days, and a meteor is the only one that
  rewrites terrain. Repair coverage mitigates all four. None can end a run.
- **👽 Invasion** — a second, entirely separate deck on its own toggle: crop
  circles, a UFO raid, an abduction beam, a regolith worm, body snatchers, and
  the Chrome Herald, who scours the dust field clean and is filed here for want
  of anywhere better to put him. Three of the six break nothing at all.

The two decks are kept apart on purpose. The disaster deck is grounded and is
what the Academy module leans on; the invasion deck is a 1950s B-movie. Nobody
who wants one is forced to take the other.

The dust event is electrostatic transport rather than a storm — the Moon has no
wind. Charging by UV and the solar wind lofts fine grains off the surface, which
is the phenomenon behind Surveyor's "horizon glow" and the reports from Apollo
crews near the terminator.

Everything in the invasion deck is a public-domain pulp archetype drawn from
scratch — saucers, tractor beams, burrowing monsters, body snatchers. There are
no named or licensed characters anywhere in it.

### Many cities, one Moon

The map is one patch of a sphere 10,921 km around, and the game now says so.

- **A minimap**, always up in the corner and full-size in a pop-up (Shift+M).
  One pixel per tile, painted once and cached rather than redrawn every
  frame; click or drag either copy to jump the camera there.
- **A globe** (Shift+G): the whole Moon, drawn as projected polygons rather
  than per-pixel — the same flat procedural style as everything else in this
  game, just wrapped around a sphere. Drag to rotate. The maria and named
  craters sit at real, if only roughly-approximated, selenographic
  coordinates — Imbrium, Serenitatis, Tranquillitatis and Crisium on the near
  side, Moscoviense and Ingenii on the far side, Shackleton and Peary at the
  poles — so the near side reads as patched with maria and the far side does
  not, the single most recognisable fact about the real Moon, for free,
  because the coordinates are genuine rather than scattered for balance. The
  terminator is tied to the same 29.5-day cycle the city view's own lighting
  already runs on, so it is a real place on the surface that stays where it
  is while you rotate the camera around it, not a lighting trick pinned to
  the screen.
- **Every colony is founded from the globe** — including the first one: a
  fresh browser opens the globe before anything else and asks where to land,
  rather than picking a spot silently. Click empty ground to found a colony
  there. Click an existing mark — sized by population — and it opens a
  **preview card** instead of switching outright: name, era, population, day,
  and a real thumbnail decoded straight from that colony's own save, with its
  own "Switch" button as the actual confirmation.
- **Away colonies keep running.** A background scheduler gives each founded
  colony you are not currently in an occasional turn — a real catch-up burst
  of the same simulation the active city runs, not a frozen snapshot or an
  approximation of one — on a slow round robin, one colony per turn, so a
  growing empire's pace tapers gracefully instead of hitting a hard cap on
  how many colonies can exist. A **Background sim** toggle, on by default,
  switches back to the original frozen behaviour if you'd rather it stayed
  that way. A **Colonies tab** lists every colony you have founded — era,
  population, age, and how recently it last got a turn — a click away from
  switching back.
- **Where you land changes what you get.** Terrain now comes in three
  classes — polar (the original), mare (flat, dark, lightly cratered, the
  smooth basaltic plains), highland (rough, heavily cratered, the highest
  relief) — and sunlight is driven by real latitude rather than one fixed
  constant: near a pole, permanent shadow and the peaks of eternal light both
  exist, the trade-off the game was built around; near the equator, permanent
  shadow (and the ice that depends on it) becomes rare — measured at more
  than an order of magnitude down — while open sky becomes the default state
  of nearly every tile, trading the pole's power-vs-ice puzzle for a
  different one: solar siting barely matters, and finding a floor still dark
  enough for a radio telescope becomes the hard search instead.
- **Colonies are cheap to keep.** A city is stored as its seed plus a sparse
  diff against what that seed would generate fresh — height edits, cleared
  boulders, buildings, zoning, dust, pipes — rather than as its whole
  16,384-tile map, because the map is fully deterministic from the seed and
  storing it twice would be pointless. Measured on a real, heavily-built
  260-day city: full map 1.9 MB, sparse snapshot under 200 KB including its
  complete history. That is the entire reason keeping dozens of colonies
  around is affordable.

### Testing

Everything under `metro/js/` except `render.js`, `ui.js` and `globe.js`'s own
`draw()` is DOM-free, so `metro/harness.html` drives the whole simulation
headlessly: terrain cascade invariants, sun derivation, three-network
reachability, RCI growth and decay, the budget, coverage radii, the dust
field, era gating, both event decks, every wonder's terrain gate, the traffic
graph, complete AI-director runs of several hundred simulated days, lossless
round-tripping of the sparse save format, generator-version isolation between
site classes, the globe's projection maths — a point at the sub-observer
position must land exactly at the disc's centre, one 90° away exactly on the
limb, anything further round correctly culled — and the background
scheduler's catch-up math, round-robin selection and catch-up cap, verified
against a scenario that ticks a colony through the scheduler and
independently through direct simulation calls and diffs the two states
byte-for-byte. **515 checks across 116 scenarios.** Open it in a browser and
re-run it after any change to those files.

Three things exist purely so this remains verifiable in a browser whose
`requestAnimationFrame` is throttled to a fraction of a frame per second:
`LM_FX` takes an **injectable clock**, so any moment of any animation can be
pinned and screenshotted; `window.__lm` (matching `farm/`'s `window.__lf`)
exposes the renderer and camera so a given tile — or a wonder on high ground,
which the naive version of that camera helper got wrong the first time — can
be looked at directly; and the globe's own projection functions are pure and
take their camera state as plain arguments rather than reading it off the
page, specifically so a sign error in the rotation math (which shipped once,
and stayed invisible to a round-trip test because both directions shared the
same mistake) can be caught by checking a known point rather than only by
checking self-consistency.

### Layout

```
metro/
  index.html        game shell
  harness.html       headless simulation tests — open it in a browser
  style.css
  js/data.js         constants, terrain, zones, buildings, eras, departments, both decks
  js/terrain.js       map generation, height editing, the sun raycast
  js/grid.js           one flood fill serving all three networks
  js/budget.js          tax rate, departmental funding, and what each dial does
  js/services.js         civic coverage fields and the diffusing dust field
  js/eras.js              era thresholds and what each one unlocks
  js/zones.js              RCI demand, land value, per-tile growth and decay
  js/disasters.js           the grounded four-event deck
  js/invasion.js             the B-movie six-event deck
  js/sim.js                   the simulation — one tick is one day
  js/autopilot.js              the AI auto-play director
  js/agents.js                  pedestrians, cars, buses and trains (cosmetic)
  js/fx.js                       transient set pieces, on an injectable clock
  js/colony-sites.js              many cities: sparse save/load, one per seed
  js/empire.js                     the background scheduler for away colonies
  js/globe.js                      the Moon as a projected sphere, and its own click/drag maths
  js/minimap.js                     one map, painted once, drawn at two sizes
  js/render.js                       isometric renderer, procedural, three detail tiers
  js/ui.js                            tools, camera, panels, colonies, main loop, saving
```

## On the crop list

Twenty-nine conventional lines and sixteen engineered ones. The conventional crops
are real, and so is the reason each is in the game:

- **From the ISS Veggie and Advanced Plant Habitat programmes** — `'Outredgeous'` red
  romaine, mizuna, Tokyo Bekana, `'Extra Dwarf'` pak choi and Red Russian kale (the
  last two both VEG-04 crops); the `'Red Robin'` dwarf tomato of VEG-05; the
  `'Española Improved'` chile and the radishes of Plant Habitat-04; the zinnia that
  flowered in 2016.
- **From the Chinese programme** — dwarf rice, taken from seed to seed aboard the
  Wentian module in 2022, the first crop to complete a full life cycle in orbit; and
  cotton, rapeseed and yeast, all of which flew in the Chang'e-4 biosphere canister,
  where the cotton became the first plant to germinate on the Moon in January 2019.
- **From the CELSS-era candidate lists** — potato, sweetpotato, soybean, peanut,
  `'USU-Apogee'` dwarf wheat bred at Utah State for controlled-environment life
  support, and strawberry.
- **Because a crew has to want to eat** — basil, bunching onion, marigold, sunflower.
- **Because not everything is a plant** — oyster mushroom on spent crop residue,
  baker's yeast, *Anabaena* for nitrogen, rhizobial inoculant for the beds, and
  spirulina, the photosynthetic compartment of the MELiSSA loop.
- **Because it pays in data** — Arabidopsis.

The **numbers attached to them are balanced for play, not measured.** Days to
maturity are in the right region for each crop, and the gas, water and energy
relationships behave qualitatively as they should, but nothing here should be cited.
The engineered lines are extrapolations from real lines of plant biotechnology; the
traits are described by what they do to a plant, not attributed to any publication.

### The photographs

The seed catalogue is illustrated with **openly licensed photography**, not with
anything generated. Public-domain NASA imagery covers the crops that have actually
been grown in orbit — the `'Outredgeous'` romaine the crew ate in 2015, the VEG-05
tomato, Plant Habitat radishes, the Expedition 20 crew at the mess table. Creative
Commons photography covers the rest.

Every image is credited by source, creator and licence in
[`farm/img/CREDITS.md`](farm/img/CREDITS.md), which is generated from
`farm/img/credits.json` and never hand-written; the same table is readable inside
the catalogue itself. Thirty-two photographs, about 1.7 MB.

**Engineered lines are illustrated with their conventional parent's photograph, and
captioned as such.** There is no photograph of a cultivar that does not exist, and
the game does not pretend otherwise.

## The rest of the arcade

Lunar Farm, Artemis City and Lunar Metropolis are three games in a set. The
**[CoSE Arcade](https://dr-richard-barker.github.io/cose-arcade/)** is the front door;
the **[Lunar Arcade](https://dr-richard-barker.github.io/lunar-arcade/)** holds the
other lunar titles, including
[Lunar Habitat](https://dr-richard-barker.github.io/lunar-arcade/games/lunar-habitat/) — the
vertical-builder formula upended, towering up for sunlight or digging down into the shielding, and
the direct source of Artemis City's Automanage director — and
[The Boring Mining Game](https://dr-richard-barker.github.io/lunar-arcade/games/boring-mining/), an ISRU
swarm where you pilot one drone and lay scent beacons the rest follow.

Those two cover the SimTower and SimAnt shapes, so this repository does not duplicate them. The
arcade's own **Regolith Farm** concept has been folded into Lunar Farm rather than built
separately — its regolith-into-soil premise is the bed-conditioning mechanic above.

## Provenance

Written from scratch. Lunar Farm takes its shape from *SimFarm* (Maxis, 1993), and Artemis City
and Lunar Metropolis both from *SimCity 2000* (Maxis, 1993) — Artemis City as a colony simulation
with zoning in it, Lunar Metropolis as a sandbox builder with elevation, a budget window and an era
arc. An open-source SimCity2000 clone, [OpenSC2K](https://github.com/nicholas-ochoa/OpenSC2K),
was surveyed early on as a possible base and rejected: it is GPL-3.0, its own simulation was never
finished, and its art pipeline requires proprietary game files that cannot be redistributed. Nothing
here shares code, art or data with any Maxis game, and none of those games is distributed in this
repository.

## Licence

MIT for the code. See `LICENSE`.
