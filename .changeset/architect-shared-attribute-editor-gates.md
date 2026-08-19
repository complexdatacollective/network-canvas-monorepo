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
- Saving a prompt whose interface-owned options merely arrive in a different
  order no longer fails with a refusal the researcher could do nothing about;
  the check now asks exactly what the protocol rule asks.
- Binding a Family Pedigree's node label to an attribute another pedigree
  derives structurally is now refused with a message naming the interface that
  owns it, rather than a generic one.
- The Narrative Pedigree disease editor now checks names and attributes
  against the diseases as they stand in the editor, not as they were last
  saved. Adding two diseases with the same name in one sitting was accepted and
  then rejected on save; freeing a name by deleting a disease did not free it
  until the stage was saved.
- The Network Composer attribute editor's "input controls" documentation link
  was broken, and now points where the Form editor's does.

Underneath, the rule that a prompt may not write to an attribute a form already
collects (and the reverse) is now one implementation shared by every prompt
editor that needs it, applied through the editing dialog itself. Editors that
had been carrying a hidden copy of each attribute's pre-edit value around in
the prompt in order to tell "I changed this" from "this was already like that"
no longer need to: the dialog already knows which row it opened on. Re-saving a
prompt whose attribute the edit did not touch is never refused for a problem
the edit did not introduce — including in a protocol that arrived with one,
which is reported on the timeline rather than by trapping the researcher in a
dialog that will not close.
