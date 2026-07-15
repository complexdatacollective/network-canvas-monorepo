---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': patch
'@codaco/interview': patch
---

Align schema 8 with the fields Architect has always required, so a protocol
that validates is a protocol that renders correctly:

- Information stages require a `title` (the page heading).
- Name Generator forms require a `title` (the add-a-person dialog heading);
  the interview also falls back to "Add {node type}" if a title is missing.
- Sociogram and Narrative stages require a `background`, which must be exactly
  one of an image or a positive concentric-circles count.
- OrdinalBin prompts require a palette `color`.
- CategoricalBin prompts with an "other" option require both the bin label and
  the follow-up prompt.
- A Sociogram prompt with highlighting enabled must name the variable to
  toggle, and an `edges` object must set `create` and/or `display`.
- A codebook variable referenced by a form field must define a `component`
  (input control) — previously a missing one crashed the interview when the
  form rendered.

Protocols migrating from schema 7 are backfilled with the value the interview
already displayed (stage label or "Information", "Add {node type}", 4 rings,
position-cycled palette colours, "Other"/"Please specify"), so migrated
interviews look identical. Synthetic interviews seed the default background
for canvas stages.
