---
'@codaco/fresco-ui': minor
'@codaco/shared-consts': patch
'@codaco/architect': patch
---

`Modal`'s `forceBackdrop` prop is gone: every nested surface now dims what is
behind it, so there is nothing left for a caller to opt into.

A dialog opened from inside another dialog dims what is behind it. Reaching for
the attribute picker from an edit prompt dialog, or opening an attribute's
values, left the dialog underneath at full strength, so the two surfaces read as
one crowded screen rather than one on top of the other. Every nested surface now
carries its own dimmed, blurred layer, so the deeper you go the further back the
rest of the screen sits.

Editing a node type no longer restates its own title. The dialog said "Edit this
node type" and then immediately said "Edit node type" again above the first
field. Its fields are now grouped under the four topics they belong to — the
type's identity, its colour, how its nodes look, and the icon the interface
shows — and its Cancel and save buttons sit in the dialog's footer with the rest
of the dialogs', rather than partway down the form. The same restatement is gone
from the disease, nomination, content item and dyad-census prompt dialogs, whose
single group repeated the title it sat under; what that group explained now
introduces the dialog itself.

A node type can map its nodes' shapes to an attribute's answers again. The
feature was missing from the node type editor altogether, so a protocol that
already mapped shapes could be opened, saved and handed back with the mapping
intact but invisible and uneditable. Choose an attribute and each of its answers
takes the shape you give it; for a number or a scale, set one or two thresholds
and the shape changes as the answer crosses them. It says which answers still
have no shape of their own, refuses a save that has no threshold to act on, and
tells you when an attribute it was pointing at is no longer one shapes can be
mapped to.

The colour picker shows which colour is chosen. Each colour is a circle of
itself outlined in the ink around it; the chosen one carries the selection
outline the rest of the interface uses for the same purpose, and hovering an
unchosen one previews that outline at less than full strength. Previously the
chosen colour was ringed in its own colour, which is the one outline it cannot
be told apart from.

The buttons that create and edit a node type are the size every other button is.
They were drawn small, which read as a lesser action than the one they perform.

Architect's section list stays clear of the menu bar. The list down the left of a
stage editor is meant to hold still while the stage scrolls past it, but its top
was measured from the top of the page rather than from the bottom of the menu
bar, so its first entries slid underneath the bar and out of sight. It now
measures the bar, follows it if it changes height, and jumping to a section
leaves the section's own heading clear of the bar instead of tucked behind it.

A categorical or ordinal attribute's answers are edited where the attribute is
chosen. Choosing an attribute for a form field, a composer row, a bin prompt or
a tie-strength prompt put its answers behind a "change this attribute's values"
dialog; the list of answers, and a yes-or-no attribute's two words, now sit
under the attribute you picked, and are saved by the same button that saves the
rest of the row. An attribute whose answers an interface owns, or one you are
only allowed to read, shows them without offering to change them and says why.
A yes-or-no attribute you invent while filling in a row can be given its two
words as you invent it, rather than becoming editable only the next time the
row is opened.

The rules an answer has to satisfy are set in the Validation section, not a
dialog of their own. A button reading "set rules for this answer" opened a
dialog Architect never had, and in the edit prompt dialog that button and the
Validation section were both on screen at once, each offering to set the same
rules. There is now one Validation section, in the place Architect put it, built
from the same switches, boxes and menus as every other field — and the rule
groups are drawn the way Architect drew them, each group titled on its own
border with its rules reading as on or off at a glance, with the explanation of
what each rule needs beside it and any complaint about a value under that value.

The edit field dialog is arranged the way Architect arranged it. The input
control was under "Attribute selection", which is where the attribute is
chosen, not where the field is configured; it now sits at the end of "Field
configuration" after the question text, the hint and the validation-hints
switch, with the attribute's own answers and the Validation section below.

An attribute can be renamed from its pill again, wherever the pill is shown. The
only place an existing attribute's name could be changed was the attribute
editor, behind the buttons for its answers, parameters and rules — so renaming a
plain text attribute had become unreachable. Clicking the pill, or pressing
Enter or Space on it, opens a box on the name it already holds; the new name has
to be given, has to be one the entity type does not already use however it is
spelled, and has to be one the protocol can store. A name a colleague's open
section is holding says who is holding it and keeps the old name rather than
failing. Cancelling, pressing Escape or clicking away puts the old name back and
returns you to the pill, and each of editing, renaming and cancelling is
announced once.

An option's label is written as rich text everywhere it can be written. The
label of a categorical or ordinal answer is shown to participants as markdown,
so bold and italic have always reached them — but only the codebook's own
editor offered them, and the same label reached from a bin's stage editor was a
plain box. Every place a label can be edited now offers the same restricted
editor, with bold and italic and nothing else. A label that is typed with a
literal asterisk, underscore, hash or backtick keeps that character in the
interview rather than turning into emphasis or a heading, which the plain boxes
could not promise. The two answers of a yes-or-no attribute are written the
same way, and the check that refuses two answers with the same label now asks
one question from every surface instead of four slightly different ones.

A node type's shape is chosen from the shapes themselves. The default shape, and
the shape each answer or threshold of a shape mapping maps to, were dropdowns
listing the words circle, square and diamond; they are swatches again, drawn in
the type's own colour, as Architect drew them — so the choice is made by looking
at what a participant will see. A threshold box left empty now goes back to the
number that is actually stored rather than saving a number it is not showing,
adding a threshold starts it on a number you could have typed rather than on a
floating-point remainder, and no further threshold is offered once the
attribute's range is used up.

The warning that an attribute offers more answers than a screen can draw appears
while you are adding them. It counted the answers the codebook had already
stored, so adding a sixth value to a bin prompt or a tie-strength scale said
nothing until the save — which closes the dialog, so it was never read at all.

Saving a prompt no longer writes back answers you did not touch. The list of
answers under an attribute is filled in from the codebook, so every save used to
write it back; a colleague who added a value while you were rewording the prompt
had it taken away again by your save, with nothing on either screen saying so.
A list nobody edited is left alone.

Renaming an attribute from its pill holds until the codebook answers. Pressing
Escape or clicking away while the rename was still being written said the edit
was cancelled while the new name landed anyway. Both ways out now wait, as the
Cancel button already did, and what you are told is what actually happened.
