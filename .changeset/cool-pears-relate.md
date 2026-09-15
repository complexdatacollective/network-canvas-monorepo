---
'@codaco/studio-server': minor
'@codaco/studio-sync': minor
---

Rate limiting now counts in Valkey, so a limit means the same thing however
many API containers are running.

Every surface is limited: sign-in per client address and per email address,
invitation acceptance per token, internal RPC per user and per team, storage
reads, the public data API per token, and WebSocket upgrades per user. Limits
for participant redemption and interview sync are declared and take effect
with the participant routes. Each is one `RATE_LIMIT_*` variable written as
`count/window`, and each is documented in the environment catalogue.

A refused request answers 429 with `Retry-After` and problem JSON. Addresses
and email addresses are hashed before they are used as keys, and a refusal is
logged with its scope and never with whom it refused.

If the store cannot be reached, every request proceeds and readiness reports
the limiter as degraded — a rate limit protects against abuse and is not worth
an outage.

The audit log's denied-attempts window moves to the same store and the
summaries it produces are now written by a new `denied-attempts-summary` job on
the worker, every minute. They used to be written when the web process shut
down, which a container that was killed rather than stopped never did.
