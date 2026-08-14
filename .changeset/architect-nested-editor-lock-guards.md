---
'@codaco/architect': patch
'@codaco/interview': patch
---

Architect no longer discards an editor you still have open when the same protocol is open in two tabs, and asks you once rather than twice about leaving a stage.

Opening a protocol in a second tab, or closing the tab that held it, could take away a variable, entity type, resource or rule editor you were part-way through — with nothing said and nothing to undo. The changes in those editors live only in the editor itself until you finish it, so neither the stage you were editing nor the saved protocol had any record of them. Two situations produced this:

**Another tab takes the protocol over.** Architect used to replace the whole editor with the read-only view, which took the open editor off the screen without its usual "you have unsaved changes" question. Your editor now stays open. The banner across the top explains that nothing here can be saved and offers the two ways forward: close the other tab to carry on editing here, or close that editor — which asks before discarding anything — to switch to a read-only view. Finishing that editor is refused while the tab cannot save, and says why, instead of accepting your changes and looking like it worked.

**The other tab is closed again.** Architect used to reload the saved protocol immediately, unmounting the open editor and taking its contents. It now stops and tells you the editor is still open, and waits until you finish or cancel it. Nothing is saved, reloaded or discarded while the question is open, and the banner can put it back if you dismiss it. Once the editor is dealt with, editing resumes here as before — and if you also have unsaved changes to a stage, you are asked what to do about those next.

**Leaving a stage editor asks once.** Cancel and the browser's Back button raise the same question in the same words, and pressing one after the other used to leave two identical confirmations stacked on top of each other. One decision now gets one question.

For researchers designing interviews: a question that compares one answer to another now names the answer it is comparing against wherever the participant meets it. A "must be different from" rule worded its error one way in a form and another in a categorical "other" box, a network composer's quick-add, or a family pedigree's name field, because those screens did not pass on the wording you had authored. They now do, using your own prompt or label — and never the variable name, which is yours and not the participant's.
