#!/usr/bin/env python3
"""Figures for the Lunar Metropolis modelling report.

Reads only the JSON in ../results/ — never the game — so a figure can never
disagree with the number quoted beside it in the text. Re-run after any
experiment; the Makefile does this for you."""
import json, pathlib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
RESULTS, FIGS = HERE.parent / "results", HERE.parent / "figures"
FIGS.mkdir(exist_ok=True)
load = lambda n: json.loads((RESULTS / f"{n}.json").read_text())["data"]

plt.rcParams.update({
    "font.size": 8, "axes.grid": True, "grid.alpha": 0.25,
    "axes.spines.top": False, "axes.spines.right": False, "figure.dpi": 200,
})
INK, ICE, TUBE, SURF = "#2b2b2b", "#4b8fd0", "#e08a3c", "#7a9a5a"


def fig_site_availability():
    d = load("e2-site-availability")
    classes = d["classes"]
    fig, ax = plt.subplots(1, 2, figsize=(6.6, 2.5))
    med = lambda c, k: float(np.median([r[k] for r in d["rows"] if r["cls"] == c]))

    x = np.arange(len(classes))
    ax[0].bar(x - 0.2, [med(c, "iceTiles") for c in classes], 0.4, color=ICE, label="ice tiles")
    ax[0].bar(x + 0.2, [med(c, "tubeLength") for c in classes], 0.4, color=TUBE, label="tube tiles")
    ax[0].set_xticks(x); ax[0].set_xticklabels(classes)
    ax[0].set_ylabel("tiles (median of 8 seeds)")
    ax[0].set_title("subsurface resource by site class", loc="left")
    ax[0].legend(frameon=False)

    for k, col, lab in [("sinkwell", ICE, "bore (Sinkwell)"), ("core", "#8a6bbf", "bore (Core)")]:
        ax[1].plot(x, [med(c, k) for c in classes], "o-", color=col, label=lab)
    ax[1].plot(x, [1 if med(c, "tubeLength") > 0 else 0 for c in classes], "s-",
               color=TUBE, label="tube arcology (max 1)")
    ax[1].set_xticks(x); ax[1].set_xticklabels(classes)
    ax[1].set_ylabel("legal sites")
    ax[1].set_title("where each strategy may be built", loc="left")
    ax[1].legend(frameon=False)
    fig.tight_layout(); fig.savefig(FIGS / "site-availability.pdf"); plt.close(fig)


def fig_ice_structure():
    d = load("e3-ice-structure")
    fig, ax = plt.subplots(1, 2, figsize=(6.6, 2.4))
    ax[0].hist(d["richness"]["values"], bins=40, color=ICE, edgecolor="none")
    ax[0].set_xlabel("ice richness"); ax[0].set_ylabel("tiles")
    ax[0].set_title("richness is banded, not continuous", loc="left")

    sw = d["referenceSweep"]
    refs = [s["reference"] for s in sw]
    ax[1].plot(refs, [s["median"] for s in sw], "o-", color=INK, label="median yield")
    ax[1].plot(refs, [s["saturatedPct"] / 100 for s in sw], "s--", color="#c0392b",
               label="fraction at ceiling")
    ax[1].axvline(d["chosen"]["ICE_REFERENCE"], color=TUBE, lw=1.2)
    ax[1].annotate(f"chosen = {d['chosen']['ICE_REFERENCE']}",
                   (d["chosen"]["ICE_REFERENCE"], 1.25), fontsize=7, color=TUBE)
    ax[1].set_xlabel("ICE_REFERENCE divisor"); ax[1].set_ylabel("yield")
    ax[1].set_title("calibrating the yield divisor", loc="left")
    ax[1].legend(frameon=False)
    fig.tight_layout(); fig.savefig(FIGS / "ice-structure.pdf"); plt.close(fig)


def fig_habitat_economics():
    d = load("e4-habitat-economics")
    rows = d["rows"]
    labels = [r["unit"].replace(" Arcology", "").replace(
        "high-density habitation tile at final stage", "surface tile") for r in rows]
    col = [SURF if r["strategy"] == "surface" else TUBE if r["strategy"] == "tube" else ICE
           for r in rows]
    fig, ax = plt.subplots(1, 3, figsize=(6.9, 2.6))
    for a, key, title in [
        (ax[0], "creditsPerResident", "credits per resident"),
        (ax[1], "residentsPerKW", "residents per kW"),
        (ax[2], "residentsPerSurfaceTile", "residents per surface tile"),
    ]:
        y = np.arange(len(rows))
        a.barh(y, [r[key] for r in rows], color=col)
        a.set_yticks(y); a.set_yticklabels(labels, fontsize=6.5)
        a.invert_yaxis(); a.set_title(title, loc="left")
        if key == "residentsPerSurfaceTile":
            a.set_xscale("log")
    fig.tight_layout(); fig.savefig(FIGS / "habitat-economics.pdf"); plt.close(fig)


def fig_director():
    d = load("e5-director-ab")
    revs = d["revisions"]
    grow = [sum(r["growing"] for r in d["rows"] if r["revision"] == v) for v in revs]
    stall = [sum(r["stalled"] for r in d["rows"] if r["revision"] == v) for v in revs]
    fig, ax = plt.subplots(figsize=(3.4, 2.3))
    x = np.arange(len(revs))
    ax.bar(x, grow, 0.6, color=SURF, label="growing")
    ax.bar(x, stall, 0.6, bottom=grow, color="#c0392b", label="stalled")
    ax.set_xticks(x); ax.set_xticklabels(revs)
    ax.set_ylabel(f"structures over {len(d['seeds'])} seeds")
    ax.set_title("what the automated director builds", loc="left")
    ax.legend(frameon=False)
    fig.tight_layout(); fig.savefig(FIGS / "director-ab.pdf"); plt.close(fig)


for f in (fig_site_availability, fig_ice_structure, fig_habitat_economics, fig_director):
    f(); print("figure:", f.__name__)
