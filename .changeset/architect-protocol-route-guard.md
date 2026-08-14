---
'@codaco/architect': patch
---

Architect no longer shows an editor in situations where nothing it accepts could be saved.

Opening a protocol that is already open in another tab now shows a read-only view of that protocol, rather than an editor whose every change was quietly thrown away. The other tab keeps the saved copy; this one shows the whole protocol — stages, codebook and resources — with the editing controls and the editor tabs removed, and can still print or download it. Resources can no longer be added from it either, which previously wrote the file into storage under the other tab's protocol while the entry naming it was discarded.

Closing the other tab hands editing straight back, on the same page you were looking at. Before it does, the tab reloads the saved copy of the protocol, so anything the other tab changed in the meantime is picked up rather than overwritten by what was on screen here.

The banner now says all of this plainly, and the "return to start screen" dialog no longer tells a tab whose changes are not being saved that its work is saved automatically — it describes what is actually true, including when the protocol could not be saved to this device at all, where downloading now leads.

If a tab loses editing to another tab while a stage was part-way through being edited, that work is no longer taken off the screen. The stage editor stays exactly as it was, with a message explaining that nothing changed there can be saved while the other tab is open, and offering the two things that resolve it: close the other tab and carry on, or discard the changes and switch to the read-only view. "Finished Editing" is unavailable until one of those happens, rather than appearing to save.

Opening a `/protocol` address with no protocol open — a bookmark, a typed address, a restored session — now returns to the start screen instead of rendering an editable "Untitled protocol" that discarded everything typed into it. That phantom accepted new variables, node and edge types, protocol names and descriptions, and even whole stages, saving none of them; its resource library reported a failure only after the file had been chosen, and its summary page waited for a protocol that was never going to arrive.

Error messages shown when something goes wrong are now written for researchers. A failed download, or a file that could not be added to the resource library, now explains itself in a sentence instead of showing internal diagnostic text, which in some cases included a stack trace.
