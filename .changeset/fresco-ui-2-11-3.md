---
'@codaco/fresco-ui': patch
---

`BaseField` now uses a uniform `not-last:mb-6` bottom margin between fields
instead of ramping the gap up on larger screens
(`tablet-landscape:not-last:mb-8`, `desktop:not-last:mb-10`), giving form
fields a tighter, consistent vertical rhythm across all breakpoints.
