---
'@codaco/template-registry': minor
---

Add a verified-email account page for publisher profiles, one-time scoped
credentials and registry administration. Keep browser moderation bound to a
current operator session, preserve the public bearer API, and serve a validated,
bounded asset inventory from the separate registry image.

Verify the real restricted database login behind each serving role during startup
and readiness, refusing owner-backed connections and later privilege drift before
the service is admitted.
