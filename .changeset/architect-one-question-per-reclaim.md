---
'@codaco/architect': patch
---

Architect asks one question at a time when a protocol open in two tabs comes back to this one.

**Two dialogs at once.** Closing the other tab while you had an editor open here — a variable, an entity type, a resource, a rule — could put two modal dialogs on the screen together, one asking what to do with your unsaved changes to the stage and the other telling you an editor was still open. They gave different instructions about the same situation, and neither one mentioned the other. This happened whenever the open editor had nothing typed into it yet, which is the state an editor is in for as long as you are still reading it. Architect now asks about the open editor first and about the stage afterwards, in that order and never together — the order it already used everywhere else.

**Deleting an entity type that is in use.** The Codebook's confirmation reported success for a deletion it had not performed. If the type turned out to be used by a stage, the deletion was refused, but the dialog closed as though it had gone through and the Codebook still showed the type. The dialog now stays open and says why the type cannot be deleted, matching the attribute deletion beside it.

**An interface called two different things.** The heading of the stage editor worked out the interface's name from its internal type rather than reading the one the New Stage screen offers it under, so six interfaces were called something different depending on where you met them — One to Many Dyad Census, Tie-Strength Census, Per Alter Form, Per Alter Edge Form, Geospatial and Anonymisation. Every surface that names an interface now reads the same list, and there is no longer a way for one of them to hold its own name.

**Two spellings of one stage name.** When Architect suggests a name for a new stage it adds a number if a stage of that name already exists. It compared names by case alone, so an accented name typed one way and the same name typed another — identical on screen — counted as two different stages and both were suggested unnumbered. It now asks the same question about two names that the codebook, the protocol schema and the import repair all ask.
