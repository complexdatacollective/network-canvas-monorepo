---
'@codaco/architect': patch
---

The rule editor now tells you which field it is waiting for.

**An unfinished rule used to be refused by a dialog that named nothing.** The
skip-logic and filter rule editor ran its own validation, and it could only
report a problem with a field the researcher had already typed in — which is
never true of a field they simply had not filled in yet. So a rule missing an
attribute, an operator or a value was refused with one modal reading "Please
complete all fields", with nothing on the form itself to say which field that
was. The editor is now an ordinary Architect form: every control marks itself
required, and a save that cannot go through leaves the message on the control
that is missing and moves focus to it.

**An ego rule can no longer be saved with a selected-option count the protocol
rejects.** Counting selected options is a whole number of them, and the alter
rule editor already asked for one; the ego editor asked for any number at all,
so a rule with a fractional count could be authored and saved and then failed
validation later, away from the editor that produced it. Both now offer the
same whole-number control, because they are now the same control.

**A rule no longer keeps choices that its new subject cannot support.**
Changing the attribute a rule compares clears the operator and value chosen for
the previous one, rather than leaving a comparison behind that the new
attribute cannot be put through — including when the rule's target changes from
a node or edge to Ego.

**Closing the editor with unsaved work now asks first, everywhere.** The rule
editor used to run its own copy of that confirmation; it now uses the same one
as every other Architect editor dialog, so it is guarded on the same terms as
the rest — including by a browser refresh and a cross-tab reclaim.

**A rule reads the same in the printable protocol summary as it does in the
editor.** The two were rendered by separate copies of the same sentence, and
the summary's copy had lost the text describing the attribute being compared,
leaving a coloured chip that read as a bare name. There is now one renderer for
both.
