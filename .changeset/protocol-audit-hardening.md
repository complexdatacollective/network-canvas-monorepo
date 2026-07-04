---
'@codaco/protocol-validation': patch
'@codaco/protocol-utilities': patch
---

Harden protocol validation and synthetic-network generation.

`@codaco/protocol-validation`: asset `source` is now constrained to a safe
filename (no path separators or `..`), so a malformed protocol can no longer
carry a path-traversal entry name into an exported archive. `NameGeneratorRoster`
now reuses the shared name-generator node-count bounds (`minNodes`/`maxNodes`
lower bounds and the `maxNodes >= minNodes` check) instead of accepting
unbounded values.

`@codaco/protocol-utilities`: `generateNetwork` clamps the requested node range
so an inflated `minNodes` with no `maxNodes` can no longer produce an inverted
range (previously this threw and left synthetic preview loading forever).
