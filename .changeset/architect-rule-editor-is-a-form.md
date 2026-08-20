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

**Closing the editor with unsaved work now asks first, everywhere.** The rule
editor used to close without asking, discarding the rule in progress; it now
uses the same confirmation as every other Architect editor dialog, so it is
guarded on the same terms as the rest.
