---
"@codaco/fresco-ui": patch
---

Fix `DatePicker` becoming unanswerable, or silently collapsing to a single
forced value, when only one of `min`/`max` is authored outside the default
1920-to-today window (for example a `year` picker with only `max: '1800'`,
or only `min: '3000'`). The year dropdown, the month dropdown's
boundary-year filtering, and the full-resolution date input's `min`/`max`
attributes now all resolve from a range that extends the missing bound past
the authored one by the default window's own span (today's year minus
1920), so the control always offers a genuine multi-value range rather than
clipping to nothing or pinning to one option. Pickers with no authored
bounds, or with both bounds authored, are unaffected.

Also clamp that extended bound, for the year/month dropdowns only, to the
four-digit year range (1000-9999) those controls can actually store (they
emit an unpadded `y.toString()`): an authored bound near either edge — for
example `max: '1000'` or `min: '9999'` — no longer synthesizes a three- or
five-digit far bound the dropdown would offer but the protocol schema could
never validate. An authored bound itself is left exactly as authored, and
the full-resolution date input's `min`/`max` attributes are unaffected,
since they always zero-pad to four digits and so stay schema-valid at any
magnitude.
