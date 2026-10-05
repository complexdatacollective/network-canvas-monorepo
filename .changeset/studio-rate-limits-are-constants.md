---
'@codaco/studio-server': patch
---

Studio's rate limits are constants with a single source of truth, not settings.

All eleven — sign-in per client address and per email address, invitation
acceptance, the two participant-redemption scopes and participant sync, RPC per
user and per team, storage reads, the public data API, and WebSocket upgrades —
are now defined in one file, `server/src/rate-limit/scopes.ts`, each with its
count, its window, and why that number rather than another. The eleven
`RATE_LIMIT_*` environment variables that used to override them at boot are
removed, along with their entries in `.env.example`, the environment table, and
the development environment file.

A rate limit is a security default rather than a capacity setting: one a
deployer can raise is one an attacker meets only where nobody raised it, and the
instance that raised it is the one that fails silently. Changing a limit is now
a code change, in a single file, which is what makes it reviewable.

`REDIS_URL` is unchanged, and remains the only part of rate limiting a
deployment configures: it says where the counters live.
