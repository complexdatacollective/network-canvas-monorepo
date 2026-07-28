---
"@codaco/fresco-ui": patch
---

Fix `DatePicker` becoming unanswerable when a single authored `min` or `max`
bound falls outside the default 1920-to-today window (for example a `year`
picker with only `max: '1800'`, or only `min: '3000'`). The year dropdown, the
month dropdown's boundary-year filtering, and the full-resolution date
input's `min`/`max` attributes now all resolve from one range that extends
the missing bound to meet the authored one instead of clipping it away,
so the control always offers at least one selectable value. Pickers with no
authored bounds, or with both bounds authored, are unaffected.
