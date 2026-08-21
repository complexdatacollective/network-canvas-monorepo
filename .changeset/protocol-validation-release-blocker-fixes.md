---
'@codaco/protocol-validation': minor
---

Protocol validation now catches references and variable uses that could previously produce missing or conflicting interview data.

- Form fields cannot write the same variable twice, and Family or Narrative Pedigree attributes cannot be overwritten by incompatible prompts, diseases, or interactions.
- Pedigree prompts, forms, and diseases now resolve their Codebook references during validation rather than failing silently during an interview.
- Prompt sort orders and roster display, search, and sort variables are included when collecting Codebook usage.
- Asset references are derived from schema metadata through the new `collectAssetReferences` helper.
- Malformed `.netcanvas` archives now produce structured `MalformedNetcanvasError` failures, with `loadNetcanvasArchive` and `describeProtocolFileError` available for actionable import messages.

Protocols containing one of the newly detected problems may now be reported as invalid even though the underlying broken reference was already present.
