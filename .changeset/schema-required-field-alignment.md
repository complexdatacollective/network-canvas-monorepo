---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': patch
'@codaco/interview': patch
---

Align schema 8 with the fields Architect has always required, so a protocol
that validates is a protocol that renders correctly:

- Information stages require a `title` (the page heading).
- Name Generator forms require a `title` (the add-a-person dialog heading).
- Sociogram and NetworkComposer stages require a `background`, which must be
  exactly one of an image or a concentric-circles count (zero or more; 0
  renders no rings). Narrative stages require a concentric-circles `background`
  (it has no image variant).
- OrdinalBin prompts require a palette `color`.
- CategoricalBin prompts with an "other" option require both the bin label and
  the follow-up prompt; a lone empty-string `otherVariable`, or an "other"
  label/prompt set to an empty string without one, is now rejected too.
- A Sociogram prompt with highlighting enabled must name the variable to
  toggle, and an `edges` object must set `create` and/or `display`.

The conditional rules are also encoded in the inferred TypeScript types: the
background is a two-variant union (image or circles), and checking a Sociogram
prompt's `highlight.allowHighlighting` or a CategoricalBin prompt's
`otherVariable` narrows the dependent fields to present, so consumers need no
runtime fallbacks or non-null assertions.

- A codebook variable referenced by a form field must define a `component`
  (input control) — previously a missing one crashed the interview when the
  form rendered.
- Free-text fields the editor already requires are now required (non-empty) in
  the schema too: a prompt's `text`, a form field's `prompt`, an introduction
  panel's `title`/`text`, an Information item's `content`, a Narrative preset's
  `label`, a side panel's `title`, a FamilyPedigree `censusPrompt`, an
  Anonymisation `explanationText`, a NarrativePedigree disease's `label`/`color`,
  and a NameGeneratorRoster `dataSource` and `searchOptions.matchProperties`.

Protocols migrating from schema 7 are backfilled with the value the interview
already displayed (stage label or "Information", "Add {node type}", 4 rings,
the first palette color, "Other"/"Please specify"); empty required text is
backfilled from a natural source where one exists (a form field's prompt from
its variable name, a panel title from the stage label) or a plain default
otherwise, so migrated interviews look identical. Synthetic interviews seed the
default background for canvas stages.
