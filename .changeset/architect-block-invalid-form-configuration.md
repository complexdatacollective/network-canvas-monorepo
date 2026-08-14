---
'@codaco/architect': patch
'@codaco/fresco-ui': patch
---

Architect no longer saves a form field whose validation rules are unfinished or impossible to satisfy.

Setting a minimum longer than the maximum — or a minimum selection larger than the maximum, or a comparison rule with no variable chosen — used to show a warning and then save anyway, with the offending rule quietly removed. Where the rule already had a working value, that value was destroyed too: editing a maximum length of 20 down to a contradictory 3 left the variable with no maximum length at all, and nothing said so.

Now the editor stays open, keeps what you entered so you can correct it, explains which rule it is waiting on, and writes nothing to the codebook until the rules agree. Correcting the value clears the message as you go. Switching a rule on and leaving it blank is likewise refused, rather than saving as though the rule had never been switched on.

Two options whose labels look identical are now recognised as duplicates. Accented text can be written more than one way — `Café` may be stored as one character or as `e` plus a separate accent — and the two spellings were treated as different labels, so a participant could be shown two choices with nothing to tell them apart. Option labels and values are now compared, and stored, in a single canonical form.

Changing a date field's resolution still clears its start and end range, because those dates are stored at the resolution you choose; the field now says so before you change it, and confirms it afterwards when there was a range to clear.

Fresco UI: when a form refuses to submit, focus now moves to the first control the researcher can actually use, rather than to a hidden element that some switches and checkboxes keep alongside their visible control.
