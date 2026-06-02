---
'@codaco/shared-consts': minor
---

Add session stage-metadata schemas as a cross-package contract for code that produces or consumes interview session state. New exports from `./stage-metadata`:

- `StageMetadataSchema` (zod) — record of stage ID → either a FamilyPedigree metadata object or an array of DyadCensus/TieStrengthCensus tuples.
- `DyadCensusMetadataItem` (type) — the `[promptIndex, fromId, toId, isPresent]` tuple shape.
- `StageMetadata` (type) — inferred from `StageMetadataSchema`.

Previously lived inside `@codaco/interview`'s session reducer; relocated here so `@codaco/protocol-utilities` (which generates conforming metadata) and `@codaco/interview` (which validates and stores it) can share a single definition.
