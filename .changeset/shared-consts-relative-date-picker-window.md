---
'@codaco/shared-consts': minor
---

Export `relativeDatePickerWindow`, the two dates a `RelativeDatePicker` holds
an answer between. A relative picker names no `min`/`max` — it names an anchor
and a span either side of it — so every reader of one has to turn those into
the same pair of dates, defaulting the anchor to today and the span to the
shared before/after constants. That derivation now lives here, beside the
clamp and the defaults it is built from, rather than once per reader:
`@codaco/interview`'s `buildDatePickerBoundProps` calls it for the hard bounds
a submitted answer is validated against, and the protocol builder calls the
same function to decide whether a filter or skip-logic rule compares against a
date no participant could ever have given.

Export `datePickerWindows` alongside it, which does the same job for a plain
`DatePicker`: it resolves the `min`/`max` a protocol declares into the two
windows the control actually offers — the `native` pair a full-resolution
`<input type="date">` takes for its attributes, and the `coarse` pair the month
and year dropdowns are built from — together with `hasAuthoredBound`, which
says whether the protocol declared either. An undeclared bound falls back to
`DATE_PICKER_DEFAULT_MIN` below and today above, extending past an authored
bound that already sits outside that window, and each synthesized edge is
clamped to what its own control can represent. fresco-ui's `DatePickerField`
now renders from this rather than from its own copy of the rules, and
`@codaco/protocol-builder` calls it to decide whether a filter or skip-logic
rule compares a coarse date attribute against a year its dropdown does not
contain — a comparison no participant answer can ever satisfy.

Export `todayYmd`, the UTC day-stamp those windows default an undeclared bound
to, which was fresco-ui's. Both functions above take the day as an argument —
the clock belongs to the caller, so that a reader deriving several windows
derives them all on the same day and a test can ask what the window was on a
day of its choosing — and this is what a caller with no day in mind passes.
It moved here because the packages that have to PREDICT what the date controls
will accept cannot depend on a UI package to find out what day it is:
`@codaco/protocol-builder` reads a rule through a pure export a host calls with
no editing session, and reaching fresco-ui for a clock read pulled React into
that graph. `@codaco/fresco-ui/form/utils/ymd` re-exports it, so nothing
importing it from there has to change.

`@codaco/protocol-utilities` keeps its own, because it is deliberately free of
every dependency but its own; `@codaco/interview`'s `ymdParity.test.ts` holds
the two to the same answer. `@codaco/protocol-validation`'s contradiction
analyser deliberately keeps its own model of the same rules: protocol validity
must not depend on when validation runs, so it substitutes a fixed horizon for
today rather than calling this.
