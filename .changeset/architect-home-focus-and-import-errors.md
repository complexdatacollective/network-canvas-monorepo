---
'@codaco/protocol-validation': minor
'@codaco/fresco-ui': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
---

Keyboard focus stays where you put it on Architect's start screen, and a protocol that will not open now says why in plain language.

**A row's action menu is finally usable from the keyboard.** Tabbing to a protocol's "..." button used to bounce focus onto the row behind it, so the button could not be reached at all; and once the menu was open, pressing an arrow key threw focus back to the list — sometimes leaving the menu visibly open while the list scrolled underneath it. Arrow keys now move between Open, See more info, Download and Delete, and Escape closes the menu and puts you back on the button you opened it with.

**Actions return you to where you were.** After See more info, Download or a cancelled Delete, focus comes back to that row's actions button instead of the whole row, so the next thing you press does what you expect. Confirming a delete removes the row and its button, so focus moves to a neighbouring protocol — or to the list itself when you have just deleted the last one — rather than jumping to the top of the page. Dismissing the "Looking for more?" card now hands focus to the Templates tab instead of dropping it, which used to send the next Tab press back to the site header. The actions button also stays available while a download runs — only the Download entry is unavailable — so a download can no longer take your place on the page with it.

**Protocol files that cannot be opened are explained, not dumped.** Choosing the wrong file used to produce a message from the zip library Architect happens to use, complete with a link to that library's own documentation. The same was true of a protocol whose contents were damaged, one with a missing resource, and one that could not be upgraded. Each now says what is wrong with the file and what to try, and anything technical is tucked behind a "Technical details" section you can open if you are reporting a problem. Nothing about your saved protocols changes when an import fails — the library is untouched and you can pick another file straight away.

**Interviewer got the same treatment.** Importing a damaged or non-protocol file on a study device showed the identical zip-library text, and a device that had run out of room reported a database error. Both now say something a researcher in the field can act on.

For developers: `@codaco/protocol-validation` adds `MalformedNetcanvasError` (with a `reason` naming which part of the archive failed), `loadNetcanvasArchive`, and `describeProtocolFileError` for turning any of this package's own failures into researcher-facing copy. The four places that previously threw bare `Error`s while extracting a `.netcanvas` now throw `MalformedNetcanvasError`, keeping their original wording on `message` and the underlying failure on `cause`.
