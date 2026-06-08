---
'@codaco/fresco-ui': patch
---

`SegmentedCodeField`: only report blur to the form when focus leaves the whole segment group, not on the automatic focus moves between segments. The previous "is focus staying in the group" check looked for `closest('[role="group"]')`, which the rendered `<fieldset>` never matched, so the form ran validate-on-blur on every segment advance and surfaced "too short" errors mid-entry. Blur is now gated on a ref to the fieldset, so validation only runs once focus actually leaves the field.
