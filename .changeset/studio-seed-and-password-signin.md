---
'@codaco/studio-client': minor
'@codaco/studio-server': minor
'@codaco/studio-rpc': minor
---

A fresh Studio instance now seeds itself with synthetic demo data instead of an empty database: a handful of teams with members across every role, and a fixed admin account (`admin@studio.test` / `studio-admin-not-for-production`) that owns every seeded team. Email/password is now a full third sign-in method alongside magic-link and social — the sign-in screen offers a password form (toggling with magic-link when both are available), and the server accepts it through the real `/api/auth/sign-in/email` endpoint. `pnpm dev` resets and reseeds the database on every boot; the deploy-time `seed` command does the same against any target, refusing a non-local database unless `--force` makes that explicit, matching `db:reset` — and both refuse to give a non-local database the published admin password, taking `STUDIO_SEED_ADMIN_PASSWORD` instead. Existing databases gain the `account.issuer` column better-auth 1.7 keys account lookups on, backfilled for rows written before it existed.
