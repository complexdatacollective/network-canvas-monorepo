---
"@codaco/analytics": major
---

Simplified analytics configuration for use with PostHog reverse proxy

Breaking changes:
- Removed `apiKey` from `AnalyticsConfig` - authentication is now handled by the Cloudflare Worker proxy
- Removed `eventTypes` and `legacyEventTypeMap` - event types are now any string

New features:
- Added singleton pattern (`initAnalyticsClient`, `getAnalyticsClient`, `getAnalyticsReady`) for accessing analytics outside React context
- Added optional console logging with styled output via `logging: true` config option
- Added `disable_compression` PostHog option (enabled by default) to support proxy API key injection

Other changes:
- Updated PostHog JS SDK to 1.304.0
- Configured automatic JSX runtime for proper React 19 compatibility
