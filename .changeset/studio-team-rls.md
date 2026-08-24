---
'@codaco/studio-server': minor
'@codaco/studio-sync': minor
---

Postgres row-level security now enforces the team boundary beneath the data layer. Every tenant table carries a `team_isolation` policy keyed on the transaction-local team id the team-pinned database handle already stamps, and row-level security is forced so no owner exemption applies: a statement that omits its team predicate sees no rows, and a write aimed at another team is refused. The schema apply creates two `NOLOGIN` roles, `studio_app` and `studio_maintenance`, and grants the connecting login the right to assume them; the server's pool starts every session as `studio_app`, which cannot bypass policies, while garbage collection runs as `studio_maintenance`, the one role the policies admit across teams — and refuses to run as anything else. The single `DATABASE_URL` is unchanged, but the login it names must hold `CREATEROLE` the first time the schema is applied.
