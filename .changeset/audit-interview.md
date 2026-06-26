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

Further interview-runtime fixes from the medium/low conformance audit:

- DyadCensus: scope each prompt's answered-state per prompt so a sibling prompt sharing the same `createEdge` no longer auto-skips data collection on a later prompt. The shared edge is still reflected (the later prompt pre-selects "Yes" from the network), but the participant must still answer it. Edge creation is idempotent so re-selecting "Yes" cannot append a duplicate edge.
- TieStrengthCensus: replace the `'__none__'` decline sentinel with a collision-free key so an ordinal option whose value is literally `'__none__'` is recorded as a value rather than treated as a decline.
- OneToManyDyadCensus: backward navigation across a prompt boundary lands on the destination prompt's last focal node instead of the first.
- NameGeneratorRoster: honour an initial-sort property of `'*'` (data-file order), keep data-file order when no `sortOrder` is set, apply the full multi-key `sortOrder`, and rank ordinal/categorical sortable properties by codebook option order instead of lexicographically.
- External data: salt each roster row's primary key with its row index so byte-identical rows stay distinct; carry the asset `source` filename through so media MIME types and the CSV-vs-JSON decision use the real extension rather than the display name; render a visible placeholder for an Information item whose asset is missing or unsupported.
- OrdinalBin: a node whose stored value matches no option is shown as unplaced instead of silently disappearing, and missing-value styling triggers for a string `'-1'`. CategoricalBin: derive drop-target and motion ids from the option index so duplicate option labels no longer collide.
- FamilyPedigree: filter the override-path seed by the configured node/edge type so foreign-typed nodes/edges no longer leak into the nomination render.
- Narrative: out-of-codebook convex-hull group values get distinct colours and legend entries instead of colliding with the first option.
- NameGenerator NodePanel: render loading/error UI for an external-data panel whose asset fails to resolve, instead of a silently blank panel.
