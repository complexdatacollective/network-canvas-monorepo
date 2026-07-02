---
'@codaco/interview': minor
'@codaco/protocol-validation': minor
---

Refine the Family Pedigree and Narrative Pedigree interfaces.

**Narrative Pedigree** defaults to a plain pedigree with no status markers. The key panel lists the conditions and explains what each status symbol means; selecting a condition from that list switches to a single-condition view, drawn in that condition's colour in standard pedigree notation. Any person can be made the focal point once a condition is shown: the pedigree then keeps the relatives who contribute to that person's inheritance at full strength and fades everyone else by blending them toward the background, with a "Clear focus" control to return to the whole family. The fixed preset/behaviour configuration is removed from the stage (schema 8). The snapshot control (a camera action) produces a printable document — the whole pedigree at natural size on a white background with dark labels, a heading generated from the shown condition and any focal person, and the symbol key.

Narrative Pedigree also gains a researcher option, **"Show possible (at-risk) statuses"**, which defaults to off. When off, the pedigree shows only certain statuses; the inferred at-risk markers (may develop / may carry / may be affected, including the more-seriously-affected homozygous marker) are hidden from the people, the key panel, and the screen-reader summary. When on, those markers are drawn. The genetics engine is unchanged — this is a display gate intended for clinician-directed use.

**Family Pedigree** intro is simplified: the language selector now uses the standard rich option group with plain-language wording ("Mother & father" listed first), and the separate "biological parents" explainer step is folded into the editable Information step (pre-filled in Architect, so researchers can reword it, remove it, or add a video). The in-wizard intro screen renders its explanation as markdown, with any headings kept beneath the dialog's own heading level. When the framing is a participant choice made partway through the quick-start wizard, the choice is now reflected in the following step titles (e.g. "Mother"/"Father"), not just their body text.

The Narrative Pedigree genetics changes (inheritance-aware focal highlighting) require research-team sign-off before merge.
