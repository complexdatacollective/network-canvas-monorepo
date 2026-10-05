---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

The interview `Shell` accepts any posthog-js client that provides `capture`, `captureException` and `register`, rather than only the `PostHog` class of the default `posthog-js` entrypoint, so a host built on another posthog-js build (such as `posthog-js/dist/module.no-external`) can pass its client without a cast.
