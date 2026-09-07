---
'@codaco/studio-sync': minor
'@codaco/studio-rpc': minor
---

A section command can now address a value nested inside a section document, not
only a top-level key of it. A list a stage keeps somewhere other than the top
level — a Family Pedigree's family-member form at `nodeConfig.form` — is edited
with the document's own `insertItem`/`removeItem`/`moveItem`, so an editor and a
collaborator working on the same list can merge their changes to it instead of
replacing each other's whole node configuration.

The new address form is an array of object keys (`["nodeConfig", "form"]`);
a top-level key is still written as the bare string it always was, so every
command already in a command log means exactly what it meant before. A server
built before this change refuses a nested command outright rather than reading
it as a key that happens to contain a dot. Array indices are deliberately not
addressable: a position stops meaning the same thing as soon as anything inserts
a row above it.
