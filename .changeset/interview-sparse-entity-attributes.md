---
'@codaco/interview': major
---

Interview session updates now remove cleared entity attributes instead of retaining null-valued keys. Legacy session payloads remain readable and are normalized without losing valid empty values such as `false`, `0`, empty text, or empty selections.

This is a breaking data-shape change for hosts that inspect `SessionPayload` or sync callbacks: attribute absence is now the unset state.
