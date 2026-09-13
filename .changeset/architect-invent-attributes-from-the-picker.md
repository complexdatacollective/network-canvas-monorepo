---
'@codaco/architect': patch
---

Creating an attribute is now offered from inside the attribute window, in every
editor that offered it. Where a stage editor used to carry a separate **Create
a new … attribute** button beside the control, searching for an attribute and
finding that it does not exist are one act: type the name into the window, and
the first row offers to create it — on the name you just searched for, with a
name the type already holds, or one the export formats cannot carry, refused on
that row before anything is written. Kinds of answer a name cannot finish — a
list of values, a scale — open the codebook's own editor already holding the
name. Network composer form fields can invent an attribute this way too, which
they previously could not.

The window itself says what it can do. Where a control only chooses from what
already exists, its search box is called **Find an attribute** rather than
**Find or create an attribute**, so a researcher using a screen reader is told
the same thing its placeholder has always said. And a stage that stops taking
changes while the window is open — because a colleague took the section, or the
protocol was closed — stops offering to create as well as to choose, rather than
offering a write that would only be refused.

Rules for an attribute a form field is inventing can now be set before the field
is saved. Making a new answer required, or bounded, used to take saving the
field, reopening it, and finding the rules in a second dialog; they are now set
alongside the attribute and written with it.
