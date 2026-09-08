---
'@codaco/documentation': minor
---

Documented that Fresco now encrypts two-factor authentication secrets at rest with a key derived from the database password, and the optional `TOTP_ENCRYPTION_KEY` variable that replaces it with an explicit key: the Advanced Deployment guide lists the variable and when to set it, the Upgrade guide explains that nothing is needed at upgrade and what to do before rotating the database password, the Accounts page says what happens if that password changes first, and the IT FAQ describes what a database copy now exposes.
