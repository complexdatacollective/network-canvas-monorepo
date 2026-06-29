---
'@codaco/protocol-utilities': patch
---

Source `StageType` from `@codaco/protocol-validation` (the schema's canonical,
`z.infer`-derived union) instead of a hand-maintained copy, which had already
drifted from the schema. The duplicated union — previously re-exported
incidentally via the package barrel — is removed; import `StageType` from
`@codaco/protocol-validation` instead.
