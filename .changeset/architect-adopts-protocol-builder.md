---
'@codaco/architect': minor
---

Every stage editor is now the shared protocol-builder editor. Each interface
keeps the same sections, fields and saved protocol, and gains a section outline
that says which parts of the stage still need attention. Undo and redo now
cover saved changes to the protocol rather than unsaved typing inside an
editor, and changes made to the codebook while a stage is open are kept when
the stage edit is cancelled.
