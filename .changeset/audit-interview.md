---
'@codaco/interview': patch
---

Fix interview-runtime schema-conformance bugs found in a release audit:

- Look up edge attributes against the edge codebook (not the node codebook) in `updateEdge`, so AlterEdgeForm / TieStrengthCensus answers are no longer silently dropped.
- Stop negating boolean `additionalAttributes` when a node is removed from a NameGenerator prompt; recompute from the prompts the node still belongs to.
- Scope a TieStrengthCensus prompt's answered-state to its own `edgeVariable` so a shared edge from a sibling prompt doesn't skip data collection.
- Read census decline metadata at stage index 0, and prune it when a node is deleted.
- Auto-advance past a skipped entry stage instead of rendering it.
- Process bucket/bin sort rules exactly once (fixing numeric/date/ordinal ordering), honour CategoricalBin `binSortOrder`, and fix categorical/zero/false sorting.
- Coerce number answers to their native type at the form boundary; enforce Anonymisation passphrase length.
- Inject the computed relationship-to-ego on FamilyPedigree finalize, supply a concrete stage subject for pedigree form validators, and stop duplicating pre-existing nodes/edges on finalize.
