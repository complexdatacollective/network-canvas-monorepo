---
'@codaco/studio-api': patch
---

The reference stack now passes `STUDIO_DEPLOYMENT_MODE` from `.env` to the
`api`, `worker` and `migrate` containers. Before, the compose file dropped it,
so every deployment from the stack ran as `self-hosted` whatever `.env` said.
Leaving it unset still means `self-hosted`; set `STUDIO_DEPLOYMENT_MODE=managed`
to run the managed service from the same stack.
