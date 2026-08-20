---
'@codaco/protocol-validation': minor
'@codaco/architect': patch
---

Colours a protocol holds are always visible in Architect, and which resources a protocol uses is worked out from the protocol schema itself.

**A colour past the end of its palette shows something.** A protocol can carry a node, edge, or ordinal colour beyond the eight the palette defines — some pickers used to offer ten swatches of an eight-colour palette, and an imported protocol carries whatever it was authored with. Those colours had no theme variable behind them, so the swatch, chip, edge preview or entity icon painted nothing at all: an invisible thing the researcher could not see in order to replace it. Every one of these now falls back to a visible colour. The colour picker already did; the codebook icons, the entity and edge previews, the disease swatches and the rule previews did not.

**Resource usage is derived from the protocol schema.** `@codaco/protocol-validation` now tags every asset-holding field in the schema and exports `collectAssetReferences`, alongside the existing entity-type and entity-attribute collectors, and Architect reads usage from it.
