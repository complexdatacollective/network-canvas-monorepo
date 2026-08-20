---
'@codaco/architect': patch
---

Attribute editors that ask the same question now answer it the same way.

Several stage editors had grown their own copy of the same rules — which
attributes a picker may offer, whether an attribute's options are fixed, and
what to say when a save has to be refused. The copies had begun to disagree,
so the answer a researcher got depended on which editor they happened to be
in. They now share one implementation each, with these visible effects:

- Categorical Bin, Ordinal Bin and Tie-Strength Census prompts now show a
  read-only option table for an attribute whose options were fixed when it was
  created, instead of offering an edit that could not be saved.
- The Form and Network Composer attribute editors now show the _canonical_
  option list for an attribute an interface owns. Previously they showed the
  copy stored in the protocol, which could differ in an imported file — so the
  editor presented the wrong list as authoritative.
- Binding a Family Pedigree's node label to an attribute another pedigree
  derives structurally is now refused with a message naming the interface that
  owns it, rather than a generic one.
- The Network Composer attribute editor's "input controls" documentation link
  was broken, and now points where the Form editor's does.
