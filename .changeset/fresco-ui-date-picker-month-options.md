---
'@codaco/fresco-ui': minor
---

Export `datePickerMonthOptions` from `@codaco/fresco-ui/form/fields/DatePicker`.
It builds the twelve month options the date picker offers, named from the
reader's own locale but anchored in UTC against the Gregorian calendar — the
option VALUES are `01` to `12` and are stored as part of an ISO date, so a
locale that defaults to another calendar would otherwise name them in that
calendar's months and picking one would store a different month. A control
outside this package now offers the same twelve months for the same stored
values, and a second table would be a second chance to lose that pinning. No
behaviour change for `DatePickerField` itself.
