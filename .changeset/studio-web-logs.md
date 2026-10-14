---
'@codaco/studio-api': minor
'@codaco/studio-contract': minor
'@codaco/studio-web': minor
---

The researcher web app and participant pages now send operational logs to the
same telemetry destination as the server, through the api, while
`STUDIO_TELEMETRY` is on. The public `status` RPC reports the configured
`STUDIO_LOG_LEVEL`, and `participant.session` reports it to an interview page
(`null` while telemetry is off), so a page logs at that level and sends nothing
while telemetry is off.

The researcher app logs RPC requests that never reached the server, editor
connections that dropped and came back, editing locks that were lost or
refused, screens that failed to render, and update checks that failed.
Participant pages log only entries from a fixed catalogue: a session that
failed to load, an answer save that failed or succeeded only after retrying, a
connection lost or restored, an asset that failed to load, and a stage that
failed to render. Every entry has a constant message, and its attributes are
limited to a stage index, an interface type, a fault code, an attempt count and
a duration.

The api receives these records at `/api/telemetry/researcher/logs` (signed-in
researchers) and `/api/telemetry/participant/logs` (a valid participant
session), same origin only, with a 64 KiB body bound and two new rate limits:
`researcher_log` (60 a minute per researcher) and `participant_log` (30 a minute
per participant session). It refuses a whole participant batch that holds any
record outside the catalogue or any extra or free-text attribute, drops any
researcher record that is not a catalogued entry, drops records below the
configured level, and forwards the rest as `service.name = studio-web` with the
installation id, the surface and, where it is known, the team.
