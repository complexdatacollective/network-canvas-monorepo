# Studio telemetry

`STUDIO_TELEMETRY` is the one runtime switch for analytics and exception
reporting. It defaults to **true in both managed and self-hosted deployments**.
Set `STUDIO_TELEMETRY=false` in every web and worker process to disable it.
Restart those processes and reload existing browser tabs after changing the
setting. The client reads the existing status RPC before importing its SDK;
an unavailable or older server that supplies no positive decision leaves it off.
There is no `VITE_` override, browser consent store or per-user preference.

False creates no PostHog SDK, telemetry listeners or timers and sends no relay
requests. The executable's pre-existing fatal-exit handlers remain necessary
when telemetry is off. Structured operational logs, protected Prometheus metrics,
readiness checks and domain audit records are independent of this switch.

## What is reported

This foundation reports manual exceptions only. It does not implement #1321's
product analytics events. All SDK page views, interaction capture, exception
autocapture, flag requests, replay, surveys, tours and remote extensions are
disabled. A future product event must extend the reviewed Studio payload boundary
and pass through this same runtime gate.

Reports carry a fixed diagnostic code, Studio version, deployment mode and runtime
kind (`web`, `worker`, `both`, `function` or `client`). They use fixed service
identifiers with person-profile processing and geolocation disabled. They contain
no team, researcher, participant, session or installation identifiers. Raw error
messages, names, causes, properties, request bodies, URLs, headers, protocol
content, function names and filesystem paths never enter an SDK.

At most twelve stack frames identify executing chunks registered by the source-map
upload CLI. A frame contains a chunk UUID, platform, line/column and fixed
filename/function placeholders. The chunk UUID resolves its uploaded map without
the original URL or path. Unregistered frames, including third-party frames and
development source paths, are omitted. Builds without uploaded maps still report
diagnostic codes. The SDK's final `before_send` rebuilds the payload from the same
allowlist, removing browser properties that the SDK adds itself.

Each process/tab admits ten errors immediately, then replenishes one slot per ten
seconds, without a timer or an identifier-indexed error map. Client reports of the
same Error object are deduplicated using weak references. The existing SDK bot
filter still applies. Error hooks do not call `preventDefault` or consume browser
failures.

## Lifecycle and deployment

`createServerTelemetry(enabled, {mode, runtime, version})` returns `capture`,
`flush` and `close`. It installs no process listeners and works unchanged in a
web-only, worker-only or combined executable. The entrypoint owns fatal hooks,
closes HTTP/WebSocket admission before reporting, bounds fatal flush to one second
and retains exit code 1. Graceful shutdown closes the reporter after other work
drains. SDK requests have a 750ms timeout and no retries. A serverless invocation
flushes its shared reporter without shutting down a client another invocation uses.

The browser controller owns and removes its two global error hooks; route and
React error boundaries use that same controller. Closing it while its import is
pending prevents delayed initialization. SDK availability cannot block application
startup or turn an observed failure into a different application response.

Traffic uses the existing `ph-relay.networkcanvas.com` Cloudflare Worker and public
project key from `@codaco/shared-consts`. The client HTML permits that relay in
`connect-src`, allows scripts from its own origin, and applies `no-referrer` so a
page URL cannot escape in the browser's Referer header. Normal network transport
still reaches the configured relay; this is not a mechanism for hiding a client's
network address from the relay operator.

Client, Node and preview-function builds reuse
`scripts/posthog-source-maps-plugin.ts`. Only builds with
`POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` emit and upload hidden source
maps; the plugin deletes maps after upload. These are build credentials, never
runtime or client settings. `POSTHOG_CLI_BINARY_PATH` supports the existing local/CI
upload stub. Turbo hashes the shared plugin, Studio wrapper and upload settings.

## Verification

The server's telemetry tests inspect actual SDK output and execute Node processes
with a loopback receiver. They cover false/no imports or egress, both defaults,
uncaught errors, non-Error rejections, clean SIGTERM and a receiver that never
answers. The existing startup-log tests explicitly disable telemetry so their
deliberate faults cannot reach the live relay.

After building both deployables, run:

```sh
pnpm --filter @codaco/studio-client test:telemetry
```

This starts the built server and client in four mode/switch combinations, using
the real browser SDK. Every external browser request is intercepted; a preload
refuses server egress. The positive control sends both error types, and the false
control must load no SDK chunk and send nothing. Canary values in errors, protocol
objects and page URLs must be absent from the wire, including Referer. A remote
script probe also proves the browser enforces the generated CSP. The fixture
models an ordinary browser because the SDK otherwise recognizes browser automation
as a bot and drops the positive control before capture.

The payload follows PostHog's [manual error API](https://posthog.com/docs/error-tracking/installation/manual)
and [source-map upload model](https://posthog.com/docs/error-tracking/upload-source-maps).
