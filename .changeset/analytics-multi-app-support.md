---
"@codaco/analytics": major
---

Add multi-app support with required `app` field on `AnalyticsConfig`. Multiple applications (Fresco, Architect, Studio, etc.) can now share a single PostHog project with events segmented by the `app` super property. Also exports `createAnalytics` for use in `instrumentation-client.ts` and adds `AppName` type and `appNames` constant.
