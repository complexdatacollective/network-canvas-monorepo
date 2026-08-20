---
'@codaco/fresco-ui': minor
'@codaco/interview': patch
'@codaco/interviewer': patch
'fresco': patch
---

Keep keyboard focus inside the dialog you are working in.

Focus now stays where you are working. Dismissing a picker returns focus to the
button that opened it instead of dropping it on the page behind, from where Tab
used to walk out of the dialog you were still working in. Closing or cancelling
any dialog returns focus to the control that opened it, including after a row
has been removed and after a dialog that outlives the control it came from.
Submitting a form with missing values moves focus to the first field that needs
attention, including fields whose control is a button rather than a text input.

While a dialog is open the rest of the page — and any dialog behind it — is now
properly inert, so it can be neither tabbed into nor read by a screen reader,
while status announcements continue to be heard. A dialog's scrollable body is
only a tab stop when there is something to scroll, and it is announced with the
dialog's own title rather than as an unnamed stop after the close button.

In Interviewer and Fresco, confirmations shown during an interview — including
the one before finishing — now return focus to the control that raised them.
