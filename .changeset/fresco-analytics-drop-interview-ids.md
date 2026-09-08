---
'fresco': patch
---

Optional analytics no longer carry interview identifiers. Error reports from the interview sync and finish endpoints, and the "Interview Opened" usage event, previously included the interview id (and, for researchers, the username) in what was sent to the analytics relay. An interview id is the participant's access link, so those properties are replaced with non-identifying context, matching the redaction the browser-side analytics already applied. The security policy is also corrected: TOTP secrets are stored as-is because they must remain readable to verify codes; recovery codes and API tokens are the values stored hashed.
