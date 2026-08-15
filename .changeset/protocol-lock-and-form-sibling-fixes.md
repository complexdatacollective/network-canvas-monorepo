---
'@codaco/shared-consts': minor
'@codaco/fresco-ui': minor
'@codaco/protocol-validation': patch
'@codaco/architect': patch
'@codaco/interview': patch
---

Architect no longer lets one tab's repair overwrite another tab's edits, form field pickers keep up with the fields you have just added or removed, and a scrollable panel stays reachable by keyboard when its contents grow.

**A repair is never written over a newer save.** Approving Architect's offer to fix an older protocol wrote the whole protocol back to your library. If the same protocol was open in another tab, that tab could have saved something in the moment it took to check and repair — and the repair replaced it, with nothing said. The write now happens only if the saved copy is still the one the repair was worked out from; if it is not, Architect says the protocol was saved somewhere else and asks you to open it again. Nothing is merged, and nothing you did in the other tab is lost.

**An editor you have open holds the handover, even if you have not typed in it.** When the other tab closed, Architect waited for a variable, entity-type, resource or rule editor only while it had unsaved changes in it. An editor with nothing typed into it was still filled in from the version this tab had before, and it does not refill itself — so carrying on in it and saving would have written those older settings back over what the other tab saved. Any open editor now holds the handover until you finish or cancel it, which for an untouched editor asks nothing and takes nothing away.

**Field pickers follow the form you are building.** In an ordinary form and in a Family Pedigree's family-member form, the check for "this variable is already collected" read the last saved version of the stage instead of the fields on screen. A field you had just added could have its variable chosen a second time, leaving a stage that would not save; a variable freed up by a row you had just deleted went on being refused. Both now read the form as it stands.

**Deleting the last row leaves the keyboard where you are.** Removing the only item from a list of fields, prompts, options or rules left focus nowhere, so the next Tab restarted from the top of the page. It now goes to the list's own add button.

**Two disease names that look the same are treated as the same, everywhere.** A Narrative Pedigree refuses two diseases with the same name, so that its key means something to the participant. That comparison depended on your computer's language settings and on which of two identical-looking spellings you had typed, so one protocol could be fine on one researcher's machine and need repairing on another's. The editor, the validator and the automatic repair now compare names the same way, and the same way everywhere.

**A panel whose contents grow can still be scrolled by keyboard.** A scrollable region worked out whether it needed to be reachable by keyboard when its contents changed size — but not when they grew on their own, as when an image finishes loading or a font arrives and reflows the text. A panel that started off fitting and then overflowed could not be scrolled without a mouse.

**Location search announces the place you ended on.** Choosing a place, reopening the search and choosing another could leave a screen reader announcing the first place, because each announcement waited for its own answer from the map server and they could come back in either order. A selection you have replaced — or left behind by moving on to the next person — now says nothing.

Also fixed: a resource whose internal id was `__proto__` crashed the Resource Library, and a question whose variable id was `__proto__` had its wording replaced by `[object Object]` in the hints a participant reads; both are now handled as ordinary data. And a participant who picks a location, reopens the search and types again no longer starts a second billable Mapbox session for one lookup.
