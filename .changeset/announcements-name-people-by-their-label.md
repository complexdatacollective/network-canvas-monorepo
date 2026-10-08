---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Screen readers now name each person by the label their node shows, wherever
the interview names them.

- Dragging a person with the keyboard, from the Sociogram's drawer or within a
  list such as a bin, a dyad census or a name generator, announces them by
  their label. Before, a drawer drag announced "Node" unless the protocol's
  name variable was itself called `name`, and a list drag announced "Item"
  followed by an internal id.
- Returning a person from the Sociogram to the drawer names them when their
  name is protected by a passphrase and has been unlocked. Before, the
  announcement left the name out.
- In the narrative pedigree, a person the view cannot relate to the
  participant shows their own label, and is named and announced by it, rather
  than by an internal id.
- Typing in a list of people finds a protected name once it is unlocked, and
  never finds anyone by an internal id.
- While a protected name is still being unlocked, the person shows the lock
  rather than "Node".

Where a name is protected, the announcement says what the node shows: the lock
until the name is unlocked, and the warning sign when it cannot be read.
