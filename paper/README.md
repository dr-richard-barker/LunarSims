# The modelling report

An academic report on *Lunar Metropolis* as a model of lunar settlement growth:
what it represents, how its parameters were calibrated, how it is verified, and
what it says about the balance between building on the lunar surface and
building underneath it.

Build the whole thing — experiments, figures, PDF:

```
make
```

## How it fits together

```
experiments/   one script per claim; each writes JSON to results/
results/       committed, so the paper builds without re-running anything
figures/       generated from results/ only, never from the model directly
sections/      the manuscript
```

The one rule worth knowing: **figures are generated from `results/`, never from
the model.** A figure therefore cannot silently disagree with the number quoted
beside it in the text — both come from the same JSON file.

`results/ledger.json` records what every experiment run actually executed:
simulated days, worlds generated, and the source revision. That is the only
honest answer to "how many times was this simulated", and it only works
going forward — see the manuscript's verification section.

## The experiments

| script | what it establishes |
|---|---|
| `e1-model-scale.mjs` | size of the model; cost of one verification pass |
| `e2-site-availability.mjs` | where each habitat strategy may physically be built |
| `e3-ice-structure.mjs` | ice richness banding; the yield-divisor calibration |
| `e4-habitat-economics.mjs` | the three strategies costed against each other |
| `e5-director-ab.mjs` | what the automated director builds, across three revisions |
| `run-harness.mjs` | the verification suite, headless |

`e5` extracts its baselines from git by commit hash, so the A/B is reproducible
from the repository alone rather than from a working copy.

## Targets

- `make` — experiments if results are missing, then figures, then the PDF
- `make experiments` — re-run everything, overwriting results
- `make figures` — regenerate figures from committed results
- `make distclean && make` — full regeneration from scratch
