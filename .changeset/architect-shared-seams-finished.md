---
'@codaco/protocol-validation': minor
'@codaco/architect': patch
---

Colours a protocol holds are always visible in Architect, duplicate names are judged the same way everywhere, and a resource is only ever reported unused when it genuinely is.

**A colour past the end of its palette shows something.** A protocol can carry a node, edge, or ordinal colour beyond the eight the palette defines — some pickers used to offer ten swatches of an eight-colour palette, and an imported protocol carries whatever it was authored with. Those colours had no theme variable behind them, so the swatch, chip, edge preview or entity icon painted nothing at all: an invisible thing the researcher could not see in order to replace it. Every one of these now falls back to a visible colour. The colour picker already did; the codebook icons, the entity and edge previews, the disease swatches and the rule previews did not.

**Two names that differ only in case, or only in how an accented character was typed, are one name in every control.** Architect's array fields already treated `Café` written two different ways as the same answer — they look identical on screen and reach the participant as two choices nothing distinguishes — but the create-an-option control and the API key browser still compared raw text. Either would accept a name the protocol schema then rejected on save.

**A tab that cannot save says so the same way wherever it refuses.** Creating an API key in a tab that does not hold the saved copy of the protocol was refused with its own wording, drifting from what the stage editor and nested editors say in exactly the same situation. All three now say the same thing about what is true of the protocol, and differ only in what to do about it.

**Resource usage is derived from the protocol schema.** Which assets a protocol uses was worked out from a hand-kept list of paths in Architect, so a resource named by a stage type added after that list was written read as unused — and the Resource Library offers an unused resource for deletion. `@codaco/protocol-validation` now tags every asset-holding field in the schema and exports `collectAssetReferences`, alongside the existing entity-type and entity-attribute collectors, and Architect reads usage from it.

Also: the timeline announces each stage's interface using the same names the New Stage screen offers them under (the two were kept separately and disagreed for six interfaces), and reorders stages with the keyboard through the shared `useKeyboardReorder` behaviour rather than its own copy of it. The rule editor's two save gates now share one implementation of the checks they both make, which had already begun to diverge.
