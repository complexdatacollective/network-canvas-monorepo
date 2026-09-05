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

The clock is passed in rather than read, because it belongs to the caller —
fresco-ui and `@codaco/protocol-utilities` each have their own `todayYmd`, and
this package stays free of both.
