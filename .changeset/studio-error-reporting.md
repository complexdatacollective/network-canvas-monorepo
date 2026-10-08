---
'@codaco/studio-api': minor
'@codaco/studio-contract': minor
'@codaco/studio-web': minor
---

Studio reports unexpected failures to its telemetry destination, once each,
while `STUDIO_TELEMETRY` is on. A defect in an RPC or HTTP handler is reported
with its request id and team id, and a job that fails for good is reported
with its queue and job id. An interrupted request and a typed refusal are never
reported. Each report carries the error's type, its stack frames and the
installation id, never the error's message. With no OpenTelemetry endpoint set
the report is a PostHog Error Tracking event with no person profile, sent with
Effect's HTTP client. With an endpoint set it is an error-level log record with
`exception.*` attributes. With telemetry off the reporter is never built.

The public `status` RPC now says whether telemetry is on. The researcher web
app, and a participant page whose session says so, catch uncaught errors and
unhandled rejections and send the error's type and its frames inside Studio's
own bundle to a new same-origin `telemetry.report` RPC, without cookies. The
API drops these reports while telemetry is off, refuses any frame that does not
name a bundle file, and limits them to 30 a minute per client address
(`error_report_address`). Nothing is written to cookies or local storage, and
`posthog-js` is no longer part of the Studio bundle. A `studio-web` image
built with the BuildKit secrets `posthog_personal_api_key` and
`posthog_project_id` uploads the source maps of the bundle it ships to PostHog
and deletes them before the image is assembled; without them nothing is
uploaded.

Exported spans and log records no longer carry an error message, even one that
spans several lines, and span events no longer carry the `effect.cause` text.
