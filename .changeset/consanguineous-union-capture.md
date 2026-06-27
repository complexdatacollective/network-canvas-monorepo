---
'@codaco/interview': minor
---

Family Pedigree: capture **consanguineous unions** — partner with an existing relative (e.g. ego with a first cousin) and attribute children to that union — and make the Narrative Pedigree genetics engine consanguinity-correct for the resulting recessive-homozygosity risk.

- Add-partner now offers an existing-or-new picker (existing candidates exclude only first-degree relatives); choosing an existing person creates a partner edge without duplicating the node (preserving the mating loop). The already-built NSGC double-line / loop rendering is exercised end-to-end.
- A new, non-lattice `atRiskHomozygous` flag surfaces the autozygosity/compound-het risk for the child of two carrier parents (autosomal recessive) and the daughter of an affected father + carrier mother (X-linked recessive), shown distinctly in the Sticker and Classic notation nodes. Genetic edges are de-duplicated at ingestion so carrier counts stay correct.

The genetics changes require research-team sign-off before merge (they fold into the existing PR #713 genetics gate).
