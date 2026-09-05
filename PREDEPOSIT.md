# Before depositing to Zenodo

Four pieces of metadata cannot be derived from this repository. They are left
as explicit placeholders rather than filled with plausible-looking values, so
that nothing in the deposit is invented. Fill them, then deposit.

## 1. ORCID

| file | what to do |
|---|---|
| `CITATION.cff` | uncomment the `orcid:` line under `authors`, full URL form: `https://orcid.org/0000-0000-0000-0000` |
| `codemeta.json` | add `"@id": "https://orcid.org/0000-0000-0000-0000"` to the author object |
| `.zenodo.json` | add `"orcid": "0000-0000-0000-0000"` to `creators[0]` — **digits only, no URL** |

The three files want the identifier in three different formats. That is not a
mistake in the files; it is what each schema specifies.

## 2. Affiliation

Add to `CITATION.cff` (uncomment `affiliation:`), `codemeta.json`
(`affiliation` on the author object), and `.zenodo.json`
(`creators[0].affiliation`).

Also in `paper/main.tex`, in the `\author{...\thanks{...}}` block, which
currently prints two visible **TODO** lines on the title page. They are
deliberately conspicuous so a draft cannot be submitted with them still there.

## 3. Version and tag

Decide the release version, then make these agree:

- `CITATION.cff` — `version` and `date-released`
- `codemeta.json` — `version` and `dateModified`
- `.zenodo.json` — add `"version"`
- the git tag you actually archive

Zenodo archives a **tag**, so tag first, then deposit:

```
git tag -a v0.1.0 -m "..." && git push origin v0.1.0
```

## 4. DOI

Do **not** set a DOI anywhere. Zenodo mints it on deposit. Afterwards, add it
back to `CITATION.cff` as `doi:` and to `codemeta.json` as `identifier`, and
add the badge to `README.md`.

---

## Checks worth running first

```bash
make -C paper distclean && make -C paper     # rebuilds every figure and the PDF from scratch
node paper/experiments/run-harness.mjs       # verification suite must be green
```

The paper build regenerates all results from the model, so if either of these
fails the deposit would contain figures that disagree with the code.

## What is deliberately not in the deposit

`paper/results/*.json` **are** committed, so the manuscript builds without
re-running anything. `paper/results/ledger.json` records what each experiment
executed — simulated days, worlds generated, and the source revision. It is
provenance, not output; keep it.
