---
'fresco': minor
---

Encrypt two-factor authentication (TOTP) secrets at rest. Fresco used to store each account's TOTP seed in the database as-is, so a copy of the database or a backup exposed the seed for every future code. Secrets are now sealed with AES-256-GCM under a key that only the deployment holds, and the database receives only the sealed value.

Nothing is required when upgrading. The key is derived from the database password in `DATABASE_URL`, and the first start after the upgrade seals every stored secret in place; authenticator apps and recovery codes keep working, and nobody has to enrol again (an enrolment that was started but never confirmed is discarded and can be started again). Because the default key follows the database password, set the new optional `TOTP_ENCRYPTION_KEY` environment variable (a long random string, recommended for institutional deployments) **before** ever rotating that password: the next start re-seals the secrets under it. If the password is changed without that step, affected accounts are told their authenticator codes cannot be checked, can still sign in with a recovery code, and can be reset by an administrator to enrol again.
