---
"@codaco/documentation": patch
---

Document Fresco's `/api/health` liveness endpoint in the Advanced Deployment guide and the IT FAQ: it is unauthenticated, reports only the service status by default, and names the running version and uptime only when the deployment sets `EXPOSE_HEALTH_DETAILS=true`.
