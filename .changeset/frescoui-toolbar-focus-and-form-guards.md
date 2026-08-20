---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
'@codaco/interview': patch
---

Keyboard focus now survives the moment a control becomes unavailable, and an optional question left blank is no longer reported as invalid.

**A toolbar no longer loses your place when a command runs out.** Undo, redo, next, previous, zoom in and zoom out all disable themselves the instant there is nothing left to do — and a toolbar is a single tab stop, so a control that leaves it while holding focus dropped keyboard focus to the top of the page. Pressing Undo until the history was empty therefore ended with focus nowhere, and the next Tab restarted from the beginning of the document. Disabled toolbar controls now stay where they are, announced as unavailable, so the arrow keys keep working and focus never leaves the toolbar. Every toolbar in Architect and in the interview behaves this way now.

**Optional questions stop complaining about being left blank.** An untouched optional email field was reported as invalid, and a required one showed "Enter a valid email address." next to "You must answer this question before continuing.". A blank number, date or length-limited field could be told it was too small, too large or too short — a field left as spaces was measured as zero. Every rule now agrees on what "not answered" means and leaves it to the one message that is meant to say so. Clearing a multi-select no longer surfaces a raw internal type error either.
