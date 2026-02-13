# @codaco/analytics

## 11.0.0

### Major Changes

- d0ace99: Add multi-app support with required `app` field on `AnalyticsConfig`. Multiple applications (Fresco, Architect, Studio, etc.) can now share a single PostHog project with events segmented by the `app` super property. Also exports `createAnalytics` for use in `instrumentation-client.ts` and adds `AppName` type and `appNames` constant.

## 9.0.1

### Patch Changes

- cb70e1f: Bump posthog-js to 1.304.0

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

## 10.0.0

### Major Changes

- b3d4d4b: Initial alpha release of the new analytics package with PostHog integration

## 9.0.0

### Major Changes

- Initial release of the new analytics package with PostHog integration

## 8.0.0

### Major Changes

- 3849e0e: Updated zod to version 4. Consumers must also use zod 4 to avoid type conflicts.
