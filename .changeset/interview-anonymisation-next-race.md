---
'@codaco/interview': patch
---

Fix the Anonymisation stage blocking a valid direct-Next attempt: forward navigation now awaits form validation against the current values instead of reading the render-time validity, which was stale while a field validation was still in flight and forced an extra Next click.
