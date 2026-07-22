---
'@codaco/fresco-ui': patch
---

Popover now honours a consumer's `event.cancel()` in `onOpenChange` for uncontrolled popovers: cancelling a close (as SegmentedToolbar's sticky popovers do for outside presses) previously left the internal mounted state closed anyway, so only controlled popovers stayed open.
