# Build the Lunar Metropolis modelling report.
#
#   make            experiments (if results are missing) -> figures -> PDF
#   make experiments  re-run every experiment, overwriting results
#   make figures      regenerate figures from committed results
#   make clean        remove build artefacts, keep results
#   make distclean    also remove results and figures
#
# Results are committed, so a plain `make` typesets without re-running the
# simulation. Delete results/ to force a full regeneration.

NODE    := node
PY      := python3
LATEXMK := latexmk

EXPERIMENTS := e1-model-scale e2-site-availability e3-ice-structure \
               e4-habitat-economics e5-director-ab
RESULTS     := $(addprefix results/,$(addsuffix .json,$(EXPERIMENTS)))
FIGURES     := figures/site-availability.pdf figures/ice-structure.pdf \
               figures/habitat-economics.pdf figures/director-ab.pdf
SECTIONS    := $(wildcard sections/*.tex)

.PHONY: all experiments figures clean distclean
all: main.pdf

results/%.json: experiments/%.mjs experiments/lib.mjs
	$(NODE) $<

experiments:
	@for e in $(EXPERIMENTS); do $(NODE) experiments/$$e.mjs; done

$(FIGURES): experiments/make-figures.py $(RESULTS)
	$(PY) experiments/make-figures.py

figures: $(FIGURES)

main.pdf: main.tex refs.bib $(SECTIONS) $(FIGURES)
	$(LATEXMK) -pdf -quiet -halt-on-error main.tex

clean:
	$(LATEXMK) -C >/dev/null 2>&1 || true
	rm -f main.bbl main.blg main.run.xml

distclean: clean
	rm -f $(RESULTS) results/ledger.json $(FIGURES)
