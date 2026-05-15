---
'@codaco/interview': prerelease
---

**Breaking** (still pre-1.0): replace `onError` callback with built-in PostHog analytics.

- New required Shell prop `analytics: InterviewAnalyticsMetadata` — `installationId` and `hostApp` are required, `hostVersion` optional.
- New optional `posthogClient` (host can supply its own client) and `disableAnalytics` (default `false`, set `true` for E2E and synthetic-interview runs).
- `ProtocolPayload.hash` is now required — host computes via `hashProtocol` from `@codaco/protocol-validation` at protocol-import time; the package forwards as `protocol_hash` super-property.
- `onError` Shell prop and `ErrorHandler` exported type are removed; render errors and asset-load failures now report via `posthog.captureException` internally.

Per-interface and stage-level events instrumented across name generators, sociogram, censuses, bins, narrative, family pedigree, anonymisation, geospatial, and the form family. PII is enforced by construction: events never include protocol-author content, codebook variable names, alter labels, free-text input, or passphrases — only structural identifiers, codebook internal ids, counts, durations, and package-defined discriminators.
