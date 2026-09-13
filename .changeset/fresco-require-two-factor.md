---
'fresco': minor
---

Add a `REQUIRE_TWO_FACTOR` environment variable. When it is set to `true`, every account that signs in with a password must set up two-factor authentication immediately after signing in — or, for the first administrator of a new deployment, immediately after the setup wizard — before any dashboard page or signed-in request is served, and cannot turn it off afterwards. An administrator can still reset a locked-out colleague's authentication; that account sets two-factor authentication up again at its next sign-in. It is an environment variable rather than a dashboard setting because every Fresco account is an equal administrator, so anything switchable from the dashboard could be switched off by any of them; the User Management card reports whether it is in force. Accounts that sign in with a passkey are not affected.
