---
"fresco": minor
---

Stop reporting the running Fresco version and process uptime from the unauthenticated `/api/health` endpoint. It still answers liveness probes with the service status, so container healthchecks and load balancers keep working, but an anonymous caller can no longer learn which release an instance runs. Deployments whose monitoring reads those fields can restore them by setting `EXPOSE_HEALTH_DETAILS=true`.
