---
'@codaco/architect': patch
'@codaco/protocol-validation': minor
---

Architect's stage editors now reach the protocol they edit through an
in-process Effect rpc host instead of an oRPC router. Nothing about editing
changes: locks, refusals, undo and imported resources behave as before.

`@codaco/protocol-validation` exports `isSafeAssetSource`, the predicate
`assetSourceSchema` applies to an asset's `source`, so a host that validates
with a different schema library can apply the same rule.
