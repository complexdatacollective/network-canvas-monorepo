---
'@codaco/studio-server': minor
---

Sign-in now runs on Studio's own database client. Signing up, and linking a
Google or Microsoft account to an existing one, now either completes or leaves
nothing behind. Before, an interrupted sign-up could leave a half-created
account.

Every request is now charged against its caller's rate limit before any other
work is done. Sign-in, storage, public API and WebSocket limits still answer
`429` with a `Retry-After` header and a problem-JSON body. The limits, and the
shared Valkey store they count in, are unchanged.

`studio-api maintenance on [reason]` and `studio-api maintenance off` now work.
While maintenance is on, every request except `/healthz` and `/readyz` answers
`503` with `Retry-After: 30`. `/readyz` reports `failing` and names
`maintenance`, and the worker stops claiming jobs until maintenance is turned
off. The same `503` is served automatically while a migration holds its lock,
or while the database is not on this build's schema.
