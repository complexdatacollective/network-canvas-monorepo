---
'@codaco/studio-client': patch
'@codaco/studio-server': patch
'@codaco/studio-rpc': patch
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

With the editing session gone, so are the RPC procedures only it called:
`protocols.acquireSection`, `commitSection`, `renewSection` and
`releaseSection`, their input and result schemas, and the command-patch wire
format they carried. Sections are locked and written through `protocolBuilder`
alone, which takes a whole section document rather than a list of commands, so
there is no second way to write a draft and no second lock model to keep in
step with the first. The audit properties those procedures carried — the event
a write records, that a retried write records no second one, that no
researcher value reaches the audit details, and that a failed audit insert
rolls the write back with it — are asserted against `protocolBuilder.submit`
instead of being dropped.
