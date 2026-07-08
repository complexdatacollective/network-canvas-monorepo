---
'@codaco/interview': minor
---

Add an optional `navigationClassnames` prop to `Shell`. It accepts per-orientation class strings (`{ vertical?, horizontal? }`) that are merged onto the interview navigation surface, letting a host apply device-specific styling — e.g. safe-area padding for an installed PWA — without the shared component owning it. Omitting the prop leaves the navigation exactly as before, so existing consumers are unaffected.
