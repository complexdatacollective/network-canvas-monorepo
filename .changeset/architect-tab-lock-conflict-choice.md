---
'@codaco/architect': patch
---

Architect no longer offers Undo and Redo in a tab that cannot save, and no longer discards a stage you were editing when the tab holding the protocol closes.

When the same protocol is open in two tabs, only one of them holds the saved copy. The other tab still showed working Undo and Redo controls: pressing them changed the protocol on screen and then quietly dropped the change, so the version on this device was never what you were looking at. That tab now offers only the actions that read the protocol — Print and Download. The Summary report is unaffected: it is read-only because it is a report, not because the protocol is held elsewhere, so its history controls still work exactly as they do everywhere else.

Closing the other tab while you were part-way through editing a stage used to reload the saved version straight over your work. Everything unsaved went with it — the changes to the stage, and any variables you had added or renamed while the editor was open — with nothing said and nothing to undo. Architect now stops and asks. Your changes to the stage were made before the other tab saved its own version and there is no safe way to combine the two, so you are offered a copy of the protocol to download with your changes included in it, or the choice to discard them and load the saved version. Neither happens until you choose, and the version the other tab saved is never overwritten. If you dismiss the question, the banner across the top of the editor will put it back.

A stage editor with nothing left unsaved in it — never typed into, or undone all the way back — closes on its own when the saved version is loaded, and returns you to your list of stages, rather than staying open in a state where nothing could be saved.

Leaving a stage editor with unsaved changes now says which of those situations you are in. It used to ask "You have unsaved changes. Are you sure you want to leave without saving?" whatever was true of your protocol; it now tells you whether the last saved version of the stage is waiting for you, whether nothing in this tab is being saved at all, and what discarding takes with it.
