---
'@codaco/studio-api': minor
'@codaco/studio-sync': minor
---

With `STUDIO_TELEMETRY` on, Studio sends an event to Codaco's Studio PostHog
project as each tracked action happens: a researcher signs up or signs in, an
invitation is sent or accepted, a member's role changes, a study or protocol is
created, a protocol draft is committed (with the interface types the protocol
uses), and an interview starts or completes. These replace periodic counts read
from the database.

Each event carries only identifiers Studio minted, fixed codes, counts, booleans
and a timestamp: never a name, an email address or protocol content. Researchers
are identified in PostHog by their account id with no person properties.
Interview events use the participant id that session's usability events already
use and create no person profile, and a study created with participant analytics
off sends no interview events at all. Every event carries the installation id and is
grouped by installation and team.

An action queues its event in its own transaction on the new
`analytics-delivery` queue, and the worker sends it within seconds. An action
that rolls back sends nothing, and an event PostHog does not accept is retried
with backoff for about half a day rather than lost. With telemetry off, nothing
is queued, and a worker with telemetry off sends nothing it finds queued.
