---
'@codaco/architect': patch
---

Filter and skip-logic rules now read back exactly as they were written, and say
how they combine.

A rule's value was being formatted as Markdown before it was shown. Because the
value of a "contains" rule is a regular expression, the characters that make it
one were the characters Markdown treats as formatting: a rule matching `.*abc.*`
was displayed as `.abc.`, `a*b*c` as `abc`, and `^_id_[0-9]+$` as `^id[0-9]+$`.
Nothing on screen said the value had been changed, and the same wrong rule was
written into the printable protocol summary, so an archived summary described a
rule the protocol did not contain. Rule values are now shown literally. The one
exception is a rule on a categorical or ordinal attribute, where what is shown
is the option label the researcher wrote rather than the stored value, and is
formatted as their labels are everywhere else.

Alongside that:

- The rule builder shows "and" or "or" between the rules again, so the choice
  made in Rule Matching can be read where the rules are rather than only at the
  bottom of the list.
- A rule with several selected options no longer breaks the printable summary's
  layout. The second and subsequent options used to drop onto a line of their
  own underneath the wrong column.
- Adding a resource file while another tab holds the saved copy now explains the
  refusal in the same words every other refused action uses, and points at
  whichever thing is actually being waited on. It could previously send the
  researcher to answer a question about unsaved stage changes when the dialog on
  screen was asking them to finish an editor instead.
- Download and Save to source can no longer be started twice by one intent, even
  if the button is activated again before it has had a chance to show that it is
  busy. Save to source overwrites protocol source files, so running it twice at
  once could have lost work.
