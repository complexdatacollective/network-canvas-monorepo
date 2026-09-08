---
'fresco': minor
---

Add a **Require Two-Factor Authentication** setting to the User Management card. When it is on, every account that signs in with a password must set up two-factor authentication immediately after signing in, before any dashboard page or signed-in request is served, and cannot turn it off afterwards. An administrator can still reset a locked-out colleague's authentication; that account sets two-factor authentication up again at its next sign-in. The setting cannot be turned on by an administrator whose own password account has no authenticator yet, and changing it is recorded in the activity feed like every other setting. Accounts that sign in with a passkey are not affected.
