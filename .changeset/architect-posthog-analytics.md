---
"@codaco/analytics": patch
---

Bump posthog-js to 1.304.0

**architect-vite (private):**
- Add PostHog analytics tracking with Redux middleware for protocol events:
  - Protocol opened
  - Protocol previewed
  - Stage added (with stage type)
  - Protocol validation failed (with Zod-formatted error details)
  - Protocol downloaded
- Enable session replay, pageview tracking, and automatic exception capture
- Add error tracking to AppErrorBoundary component
- Enable PostHog debug logging in development mode

**posthog-proxy-worker (private):**
- Simplify and refactor the Cloudflare Worker proxy implementation
- Add caching for static assets
- Forward client IP via X-Forwarded-For header
