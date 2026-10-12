---
'fresco': patch
---

Two expected outcomes are no longer reported as crashes. When GitHub answers the
update check with an error (for example because its rate limit is exhausted),
the settings page says update information is unavailable without reporting a
schema error. Finishing setup with "Go to the dashboard" now runs the action as
a form submission, so the redirect to the dashboard is no longer reported as an
unhandled error.
