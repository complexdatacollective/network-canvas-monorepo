---
'@codaco/studio-client': patch
---

The protocol editor runs on the `@codaco/protocol-builder` host contract. The
screen used to build its own editing session — a lease it renewed on a timer,
a command queue, and a form of its own holding a screen name and a page
heading — and to draw undo, redo and a pending-change count beside it. All of
that belonged to a collaboration model the package no longer has: one editor
holds a screen while it is open, so the package owns the form, submits the
whole screen, and needs none of it.

The screen now mounts the package's own editor for whichever interface the
selected screen is, over one channel per open protocol. Studio keeps what is
Studio's: the outline and its reordering, the section selector, the validation
panel, and the save control — which is rendered through the editor's action
slot and still asks before unsaved values are discarded.
