---
'posthog-proxy-worker': patch
---

The relay no longer forwards the caller's IP address (`CF-Connecting-IP`) to PostHog as `X-Forwarded-For`. Network Canvas app and website analytics are described as anonymous; a participant's or researcher's IP address is not.

Deploying this fix requires a manual `wrangler deploy` from `workers/posthog-proxy` — this worker is not part of the automated release pipeline.
