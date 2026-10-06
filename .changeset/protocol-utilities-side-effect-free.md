---
'@codaco/protocol-utilities': patch
---

The package now declares itself free of import-time side effects
(`"sideEffects": false`). A bundle that imports only `SyntheticDataConstraintError`
or the message helpers no longer carries the synthetic network generator and its
`@faker-js/faker` dependency.
