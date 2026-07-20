---
'@codaco/protocol-utilities': minor
'@codaco/interview': minor
---

`generateNetwork` can now build name generator stages from real roster data. Pass
parsed roster nodes via the new `externalData` option, keyed by stage id, and
roster and roster-panel stages draw their people from those rows — preserving
each row's primary key and attributes — instead of inventing people from the
codebook. Draws are without replacement across prompts and stages, mirroring the
runtime's global exclusion of rows already in the network. A stage with no entry
still falls back to codebook-generated people.

`@codaco/interview` now exports `loadExternalData`, `makeVariableUUIDReplacer`,
and `getVariableTypeReplacements` so hosts can parse roster assets the same way
the interview runtime does.
