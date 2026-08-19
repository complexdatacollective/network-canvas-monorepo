---
'@codaco/fresco-ui': minor
'@codaco/interview': patch
---

Two interview text boxes are announced properly again.

The box for quickly adding a name in a Name Generator, and the one for adding a
person in a Network Composer, both pointed a screen reader at surrounding text
that neither of them draws — a "required" marker, a hint, an error area, and a
label. Those pointers went nowhere. A description that goes nowhere is dropped
by some screen readers, and a label that goes nowhere outranks the name the box
does have, so the quick-add box could be announced with no name at all: the
participant is told to type something, without being told what.

Both boxes now point only at what they actually draw, and the quick-add box
says what it is asking for ("Person name", after the kind of person the study
is asking about). The Network Composer's box keeps naming its own error area,
so a name that breaks a rule is still announced.

The underlying cause was a shared form helper that assumed every control sits
inside the standard field layout, and pointed at that layout's parts whether or
not they were there. The assumption is now the other way round: the standard
field layout declares what it draws, and anything else starts from nothing. A
control built by hand is therefore correct without its author having to know
the setting exists.
