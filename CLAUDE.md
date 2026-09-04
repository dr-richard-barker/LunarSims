# LunarSims

Three browser games — `city/`, `farm/`, `metro/` — served straight from GitHub
Pages. No build step, no dependencies: every game is plain HTML/CSS/JS loaded by
`<script>` tags in its own `index.html`.

## The CoSE registry is hosted, not vendored

The cross-site CoSE nav registry (`window.BARKER_SITES`) is loaded from the
central copy at the foot of `index.html`:

    <script src="https://dr-richard-barker.github.io/Plant_response_to_radiation/cose/sites.js"></script>

**This repo keeps no local copy of that registry, and must not gain one.** Other
CoSE repos vendor it as `docs/assets/sites.js` or `assets/sites.js`; this one
does not, because it loads the hosted file directly.

If you are syncing the central registry across repos: **skip LunarSims entirely.**
There is nothing here to update.

### Why this warning exists

`metro/` has its own colony-site module — the sparse save/load registry that
defines `window.LM_SITES`. It used to be called `metro/js/sites.js`. A registry
sync matched on that filename and copied `BARKER_SITES` over it in commit
`2b461fb` (2026-08-26), then re-synced the same clobber in `41f381a` and
`98f93f3`. `window.LM_SITES` was undefined for nine days; 19 scenarios in
`metro/harness.html` threw, and the colony-founding flow was dead.

The module is now **`metro/js/colony-sites.js`**, so the filename collision that
caused it cannot recur. Do not rename it back, and do not add a `sites.js`
anywhere in this repo.

## Verifying metro

`metro/harness.html` is a self-contained scenario harness — open it and it runs
on load. It should report **all 557 checks passed across 124 scenarios**, with
no scenario marked ERROR or FAIL. Run it after any change to the `metro/js/`
modules.

Note that the Claude Code preview server cannot read `~/Documents` (no TCC
access), so serving this repo for the preview pane requires staging a copy
outside it — see `../.claude/sync-preview.sh` for the established pattern.
