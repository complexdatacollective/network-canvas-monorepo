---
'@codaco/studio-sync': minor
'@codaco/studio-server': minor
---

Add Postmark as a configurable Studio email transport alongside SMTP. Sign-in
and invitation email share single-recipient validation, bounded delivery waits,
disabled tracking, and private diagnostic errors. Ambiguous provider outcomes
stop automatic retries so a possibly accepted message is not sent again.
