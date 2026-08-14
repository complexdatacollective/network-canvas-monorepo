---
'@codaco/fresco-ui': minor
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
---

Protect unsaved work in nested editors, and keep keyboard focus inside the dialog you are working in.

Opening an editor from inside a stage — a form field, a nomination prompt, an
ordinal option, a skip-logic rule, a new variable, an entity type — now warns
before its changes are thrown away. Cancel, the close button, Escape, a click on
the backdrop, browser Back and a page refresh all ask first, and only when
something has actually changed: undoing an edit by hand makes the warning go
away again. The warning that appears when you leave the protocol no longer
claims your work is saved automatically while an editor is still open, and you
are asked once rather than twice.

Focus now stays where you are working. Dismissing the variable picker returns
focus to the button that opened it instead of dropping it on the page behind,
from where Tab used to walk out of the still-open field editor and reach the
"Return to start screen" control. Closing or cancelling any dialog returns focus
to the control that opened it, including after a row has been removed and after
a dialog that outlives the control it came from. Submitting a form with missing
values moves focus to the first field that needs attention, including fields
whose control is a button rather than a text input.

While a dialog is open the rest of the page — and any dialog behind it — is now
properly inert, so it can be neither tabbed into nor read by a screen reader,
while status announcements continue to be heard. A dialog's scrollable body is
only a tab stop when there is something to scroll, and it is announced with the
dialog's own title rather than as an unnamed stop after the close button.

In Interviewer and Fresco, confirmations shown during an interview — including
the one before finishing — now return focus to the control that raised them.
