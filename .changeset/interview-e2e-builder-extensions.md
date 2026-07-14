---
'@codaco/protocol-utilities': patch
---

Extend the `SyntheticInterview` builder for the interview e2e configuration
matrix: stage inputs now accept `interviewScript`, `skipLogic`, `filter`, and
`validation`; prompt inputs accept `additionalAttributes` and `sortOrder`; and
variable inputs accept `encrypted` and `parameters`. Consolidate stage
assembly so the builder emits schema-valid output directly — form fields no
longer carry a stray `component` (the codebook variable supplies it), EgoForm
joins AlterForm/AlterEdgeForm in stripping the form `title`, and FamilyPedigree
no longer emits a top-level `subject`. `quickAdd` defaults now resolve to the
seeded name variable's id rather than its display name.
