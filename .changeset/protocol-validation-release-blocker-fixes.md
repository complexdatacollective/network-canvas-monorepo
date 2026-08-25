---
'@codaco/protocol-validation': minor
---

Protocol validation now catches references and variable uses that could previously produce missing or conflicting interview data.

- Form fields cannot write the same variable twice, and Family or Narrative Pedigree attributes cannot be overwritten by incompatible prompts, diseases, or interactions.
- Pedigree prompts, forms, and diseases now resolve their Codebook references during validation rather than failing silently during an interview.
- Prompt sort orders and roster display, search, and sort variables are included when collecting Codebook usage.
- Asset references are derived from schema metadata through the new `collectAssetReferences` helper.
- Malformed `.netcanvas` archives now produce structured `MalformedNetcanvasError` failures, with `loadNetcanvasArchive` and `describeProtocolFileError` available for actionable import messages.
- The pedigree value sets a protocol must carry — `RELATIONSHIP_TYPES`, `GAMETE_ROLES`, `BIOLOGICAL_SEX_VALUES`, their option lists, `FRAMING_IDS`, and `INHERITANCE_PATTERNS` — are now defined and exported here rather than in `@codaco/shared-consts`. They live inside the schema version that defines them, so editing shared constants can no longer change what a released schema accepts.
- Protocol colors must be palette references. Narrative Pedigree disease colors and Geospatial map colors no longer accept raw or empty strings, and disease colors must name one of the eight available node colors.
- Migrating a version 7 protocol now wraps node colors 9 and 10 (which the classic Architect palette offered) onto the eight-color palette, so those protocols import successfully instead of failing validation.
- Migrating a version 7 protocol whose forms contain duplicate fields now reports a validation error naming the duplicate, instead of silently removing fields.

Protocols containing one of the newly detected problems may now be reported as invalid even though the underlying problem was already present. This includes protocols whose pedigree option sets were edited away from the canonical values, protocols with duplicate form fields, protocols with an empty panel data source, and protocols using an unavailable or raw disease or map color — including protocols created from the CEGRM starter template as previously released. The remedy is to correct the protocol in Architect's editor (for example, by re-picking the disease color). An exported `.netcanvas` file containing one of these problems cannot be imported until it is corrected, because import validates before anything is stored.
