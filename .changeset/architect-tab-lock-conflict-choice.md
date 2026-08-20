---
'@codaco/architect': patch
---

Architect no longer offers Undo and Redo in a tab that cannot save.

When the same protocol is open in two tabs, only one of them holds the saved copy. The other tab still showed working Undo and Redo controls: pressing them changed the protocol on screen and then quietly dropped the change, so the version on this device was never what you were looking at. That tab now offers only the actions that read the protocol — Print and Download. The Summary report is unaffected: it is read-only because it is a report, not because the protocol is held elsewhere, so its history controls still work exactly as they do everywhere else.

Leaving a stage editor with unsaved changes now says more than that they are unsaved. It used to ask "You have unsaved changes. Are you sure you want to leave without saving?" whatever was true of your protocol; it now tells you when nothing in this tab is being saved at all, and what discarding takes with it.
