---
'@codaco/documentation': minor
---

Documented Fresco's new `TOTP_ENCRYPTION_KEY` environment variable, which encrypts two-factor authentication secrets at rest: the Netlify and Vercel deployment guides add it alongside the database variables, the Advanced Deployment guide lists it with the other `.env` variables, the Upgrade guide tells existing deployments with two-factor accounts to set it before upgrading, the Accounts page says what to do if enabling two-factor reports the key is missing, and the IT FAQ describes what a database copy now exposes.
