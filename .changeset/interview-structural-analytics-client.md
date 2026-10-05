---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

The interview `Shell` accepts any posthog-js client that provides `capture`, `captureException` and `register`, rather than only the `PostHog` class of the default `posthog-js` entrypoint, so a host built on another posthog-js build (such as `posthog-js/dist/module.no-external`) can pass its client without a cast. The runtime's own instance, used when a host passes no client, now loads that no-external build as well: it carries no remote script loader, so it works under a host's `script-src 'self'` policy.
