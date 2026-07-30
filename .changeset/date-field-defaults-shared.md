---
'@codaco/shared-consts': minor
'@codaco/protocol-utilities': minor
'@codaco/fresco-ui': patch
'@codaco/interview': patch
---

The defaults a date field falls back on, when a protocol declares no bounds of its own, now live in one place.

`@codaco/shared-consts` exports `DATE_PICKER_DEFAULT_MIN`,
`DATE_PICKER_EARLIEST_DATE`, `DATE_PICKER_LATEST_DATE`,
`RELATIVE_DATE_PICKER_DEFAULT_BEFORE`, and
`RELATIVE_DATE_PICKER_DEFAULT_AFTER`. `@codaco/fresco-ui` renders its date
fields from them, `@codaco/interview` derives the bounds a submitted date is
validated against from them, `@codaco/protocol-validation` models those bounds
when detecting contradictions, and `@codaco/protocol-utilities` generates
synthetic dates to fit them. Each package previously kept some local copies and
tested only those copies, so widening or narrowing a bound in one place could
leave another package predicting a window that no longer existed. No default
or limit has changed value, and generated data is unchanged.

`@codaco/protocol-utilities` additionally exports `todayYmd`, the clock read behind `GenerationConfig.today`'s default.
