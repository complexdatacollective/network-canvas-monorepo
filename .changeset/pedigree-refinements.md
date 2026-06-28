---
'@codaco/interview': minor
'@codaco/protocol-validation': minor
---

Refine the Family Pedigree and Narrative Pedigree interfaces.

**Narrative Pedigree** now defaults to showing every disease as stickers around each person. A persistent disease legend doubles as the colour key and the disease selector: choosing a disease (from the legend or by clicking a person's sticker) switches to a single-disease view drawn in that disease's colour. Any person can be made the focal point at any time — the pedigree then highlights only the relatives who contribute to that person's inheritance of the shown disease(s) and dims everyone else, with a "Clear focus" control to return to the whole family. The fixed preset/behaviour configuration is removed from the stage (schema 8); the snapshot control is now a camera action button. Disease-status markers are shared between the sticker and single-disease views so they always match.

**Family Pedigree** intro is simplified: the language selector now uses the standard rich option group with plain-language wording, and the separate "biological parents" explainer step is folded into the editable Information step (pre-filled in Architect, so researchers can reword it, remove it, or add a video).

The Narrative Pedigree genetics changes (inheritance-aware focal highlighting) require research-team sign-off before merge.
