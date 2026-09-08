---
'fresco': minor
---

Encrypt two-factor authentication (TOTP) secrets at rest. Fresco used to store each account's TOTP seed in the database as-is, so a copy of the database or a backup exposed the seed for every future code. Secrets are now sealed with AES-256-GCM under a key derived from a new `TOTP_ENCRYPTION_KEY` environment variable that only the deployment holds; the database receives only the sealed value.

**Deployments that use two-factor authentication must set `TOTP_ENCRYPTION_KEY` before upgrading.** Use a long random string of at least 32 characters (for example the output of `openssl rand -base64 32`) and keep it stable. On the first start with the key present, Fresco seals every existing plaintext secret in place; existing authenticator apps and recovery codes keep working, and nobody has to enrol again. If any account has two-factor authentication enabled and the variable is missing, or a later start finds a key that does not open the stored secrets, Fresco refuses to start and says which of the two it is. Deployments without two-factor accounts start as before (an enrolment that was started but never confirmed is discarded, and can be started again), but enabling two-factor authentication is refused until the variable is set — the Netlify deployment guide, `.env.example`, and the `docker-compose.*.yml` headers document it.
