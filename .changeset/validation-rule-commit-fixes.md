---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
---

Validation rules now save what the editor shows.

Nudging a rule's value with the plus or minus button changed the number on
screen without saving it, and if the value was being edited at the time, the
older number was saved instead. Switching on a rule that needs no value — such
as Required — saved it even where it could never be satisfied, for instance
alongside a maximum length of zero. A rule held back because it clashed with
another one stayed unsaved even after the clash was resolved, so a rule could
sit switched on with a sensible value that was never written. And undoing a
change left the rule switched on with the old value still showing, ready to be
written out again.

Each rule's plus and minus buttons are also now named after that rule, so a
screen reader announces "Increase Minimum value" rather than "Increase value"
on every numeric rule on the screen.

`InputField` gains two optional props to support this: `onStep`, which reports
a value settled by a stepper button or arrow key, and `stepperLabels`, which
names the stepper buttons. Both default to the previous behaviour.
