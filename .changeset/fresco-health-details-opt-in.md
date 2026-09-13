---
"fresco": minor
---

Stop reporting the running Fresco version and process uptime from the unauthenticated `/api/health` endpoint. It still answers liveness probes with the service status, so container healthchecks and load balancers keep working, but an anonymous caller can no longer learn which release an instance runs. Signed-in researchers continue to see the version on the dashboard.
