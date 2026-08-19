---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
'@codaco/interview': patch
---

Keyboard focus now survives the moment a control becomes unavailable, and a locked form stays locked.

**A toolbar no longer loses your place when a command runs out.** Undo, redo, next, previous, zoom in and zoom out all disable themselves the instant there is nothing left to do — and a toolbar is a single tab stop, so a control that leaves it while holding focus dropped keyboard focus to the top of the page. Pressing Undo until the history was empty therefore ended with focus nowhere, and the next Tab restarted from the beginning of the document. Disabled toolbar controls now stay where they are, announced as unavailable, so the arrow keys keep working and focus never leaves the toolbar. Every toolbar in Architect and in the interview behaves this way now, rather than the two that had been converted by hand.

**A greyed-out toolbar button no longer does anything when you click it.** Toolbar controls show they are unavailable without using the browser's own disabled setting, so that keyboard focus is not thrown out of the toolbar when a command runs out. But that setting was also the only thing stopping a click, so a greyed-out button still ran. Clicking the greyed-out "previous preset" arrow on the first narrative preset emptied the stage and removed the controls needed to get back to it; clicking Architect's "Downloading…" or "Saving…" button started a second download or a second write over the protocol's source files. Greyed-out toolbar buttons now ignore clicks and taps as well as key presses.

**Closing a panel or editor returns you to what opened it.** Architect's attribute-name editor, its variable picker and its mobile navigation drawer, and Fresco's mobile navigation drawer, were all built on the modal layer directly rather than on the standard dialog — so none of them remembered the control that opened them, and closing one could send focus to the page header instead. They now return focus the way every dialog does, including when the control they were told to return to no longer exists.

**A read-only or locked list can no longer be reordered.** The drag handle on side panels, options, multi-select items and dialog-edited lists accepted "this form is not editable" and ignored it: the item could still be dragged with the pointer and moved with the arrow keys. It now refuses both, and shows that it is unavailable. The handle also has a visible focus ring again, which matters for a control that moves while you are holding it.

**A sortable table column no longer announces a pressed state it does not have.** The column header opens a menu; it was also claiming to be a toggle button so that it could pick up the "selected" colours while its column was sorted, which meant a screen reader described a pressed state that opening the menu does not change. The colours are now a plain styling choice and the announcement is just the menu.

**Optional questions stop complaining about being left blank.** An untouched optional email field was reported as invalid, and a required one showed "Enter a valid email address." next to "You must answer this question before continuing.". A blank number, date or length-limited field could be told it was too small, too large or too short — a field left as spaces was measured as zero. Every rule now agrees on what "not answered" means and leaves it to the one message that is meant to say so. Clearing a multi-select no longer surfaces a raw internal type error either.
