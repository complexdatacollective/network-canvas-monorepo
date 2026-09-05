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

The clock is passed in rather than read, because it belongs to the caller —
fresco-ui and `@codaco/protocol-utilities` each have their own `todayYmd`, and
this package stays free of both. `@codaco/protocol-validation`'s contradiction
analyser deliberately keeps its own model of the same rules: protocol validity
must not depend on when validation runs, so it substitutes a fixed horizon for
today rather than calling this.
