# posthog-proxy-worker

## 0.0.1

### Patch Changes

- 245fcf6: The relay no longer forwards the caller's IP address (`CF-Connecting-IP`) to PostHog as `X-Forwarded-For`. Network Canvas app and website analytics are described as anonymous; a participant's or researcher's IP address is not.

  Deploying this fix requires a manual `wrangler deploy` from `workers/posthog-proxy` — this worker is not part of the automated release pipeline.

- d6cb713: The relay also strips `CF-Connecting-IPv6`, `True-Client-IP`, and `X-Real-IP` before forwarding a request to PostHog, alongside the `X-Forwarded-For`/`CF-Connecting-IP` stripping added previously. An IPv6 client behind Cloudflare's Pseudo-IPv4 overwrite mode has its real address in `CF-Connecting-IPv6`, which the earlier fix did not cover.

  Deploying this fix requires a manual `wrangler deploy` from `workers/posthog-proxy` — this worker is not part of the automated release pipeline.
