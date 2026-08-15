---
'@codaco/fresco-ui': patch
'@codaco/architect': patch
'@codaco/interview': patch
'@codaco/interviewer': patch
---

Two fixes for problems that only appeared once this release's changes were combined.

**A form that cannot be fixed on the first try still takes you to the problem on the second.** When a problem belongs to a whole section rather than to one control — a contradiction between two settings, say — submitting sent you to that section's message. Submitting again sent you nowhere at all: focus was dropped, and the next Tab restarted from the top of the page. It now takes you to the problem every time, however many attempts it takes. Clicking such a row in Architect's Issues panel works repeatedly for the same reason.

**Creating a Mapbox API key in a tab that cannot save now says so, rather than losing the key.** When the same protocol is open in another tab, or an editor is still open with unsaved changes, that tab cannot write to the saved copy. Adding a resource file already explained this and refused. Creating an API key did not: it reported the key as created and selected, and the key was then discarded. It now explains which situation you are in and what to do about it, keeps what you typed, and creates nothing until the protocol can actually be saved.
