# Telemetry

What an instance sends off the machine about itself, where it goes, how to
send the operational part to your own OpenTelemetry store instead, and how to
turn all of it off. One variable, `STUDIO_TELEMETRY`, governs everything on
this page, and it is on unless you set it to `false`.

The [privacy notice](../privacy-notice.md) lists every event field by field,
and the [IT FAQ](../it-faq.md) answers the questions an institution's IT or
data-protection office usually asks.

## What leaves the machine by default

With `STUDIO_TELEMETRY` on and nothing else set, both Studio processes (`api`
and `worker`) send two kinds of data to one place: Codaco's Studio project in
PostHog Cloud US, at `us.i.posthog.com`, over HTTPS. Nothing goes through a
relay, and nothing is sent to any other analytics or telemetry host.

| Kind              | What it is                                                                                                                                                                                                                                                                      | Sent to                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Logs**          | Every log record the processes write at or above `STUDIO_LOG_LEVEL` (`Info` unless you set it), and the researcher web app's and participant pages' log entries, each one from a fixed catalogue in Studio's source, which the api receives and forwards                        | `https://us.i.posthog.com/i/v1/logs`, over OTLP              |
| **Traces**        | A span for each request, command, database statement and job. A request's span carries the method, the route template, the status code and the duration; a statement's carries its SQL with every value left as a placeholder                                                   | `https://us.i.posthog.com/i/v1/traces`, over OTLP            |
| **Metrics**       | Gauges for event-loop delay, memory, and how many jobs sit on each queue in each state                                                                                                                                                                                          | `https://us.i.posthog.com/i/v1/metrics`, over OTLP           |
| **Error reports** | An unexpected failure in a request, a job, the researcher web app or a participant page, as its error type and stack frames                                                                                                                                                     | PostHog Error Tracking, at `https://us.i.posthog.com/batch/` |
| **Analytics**     | One product event each time a tracked action happens (a researcher signs up or in, an invitation is sent or accepted, a role changes, a study or protocol is created, a protocol draft is committed, an interview starts or completes), and participant pages' usability events | `https://us.i.posthog.com/batch/`                            |

The first four are **telemetry**: operational data about the instance. The
last is **analytics**: how Studio is used. The difference matters below,
because only telemetry can be sent somewhere else.

**Only public data is sent.** Studio sends only Level 1 data under
Northwestern's
[Data Classification Policy](https://policies.northwestern.edu/docs/data-classification-policy.pdf):
fixed codes defined in Studio's source, numbers, durations, booleans,
timestamps, version strings, random ids Studio mints, and stack frames pointing
into Studio's own open-source code. Researcher emails and names; team, study
and protocol names; protocol content; anything a participant enters;
URLs, request headers, user agents and IP addresses; and the free-text message
of an error never leave, whatever the destination. A test seeds all of those
into one scenario and fails if any of them reaches a log record, a span, a
metric, an error report or an analytics event.

**No IP address or location is stored.** Every event and error report Studio
sends to PostHog sets the address PostHog records to `0.0.0.0`, overwriting
the sending server's address that PostHog would otherwise store, and turns off
PostHog's location lookup.

**Participants' browsers never contact PostHog**, and neither do researchers'.
The browser sends its usability events, log entries and error reports to your
instance, which applies the rules above and forwards them. The Studio page's
content security policy lets browsers connect only to your instance and to
`api.mapbox.com` (see [requirements](./requirements.md#outbound-hosts)).

Every record carries your instance's **installation id**, a random UUID
`migrate` generates once and stores in the database. It is how Codaco tells
deployments apart; it is not derived from your hostname or anything else about
the instance.

**Logs always go to stdout as well**, one JSON line per record, whatever the
switch says. `docker compose logs` keeps working with telemetry off.

## Turning it off

Set this in `.env`, then recreate the two processes:

```bash
STUDIO_TELEMETRY=false
```

```bash
docker compose up -d api worker
```

With the switch off, Studio builds no exporter, no error reporter and no
analytics client at all, rather than building them and muting them, so nothing
exists that could send. The api accepts and drops anything a browser sends it.
`STUDIO_TELEMETRY=false` overrides `OTEL_EXPORTER_OTLP_ENDPOINT`: an endpoint
you set is not used either.

The daily update check is not telemetry and is not governed by this switch: it
fetches a version manifest from `releases.networkcanvas.com` and sends nothing
about your instance. See [the outbound hosts](./requirements.md#outbound-hosts).

A study can also be created with participant analytics off, which stops that
study's participant usability events while leaving the rest on.

## Sending telemetry to your own store

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to an OpenTelemetry collector's base URL,
and Studio sends its **logs, traces, metrics and error reports** there instead
of to Codaco:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20your-collector-token
```

- The endpoint takes OTLP over HTTP with JSON bodies. Studio appends
  `/v1/logs`, `/v1/traces` and `/v1/metrics` to the URL you give, so name the
  base, not one of those paths. OTLP over gRPC is not supported.
- `OTEL_EXPORTER_OTLP_HEADERS` is sent with every export, in the OpenTelemetry
  format `key=value,key=value` with URL-encoded values: `%20` for the space in
  `Bearer <token>`. It is treated as a secret and never appears in a log line or
  an error. Leave it unset if your collector needs no credential.
- **Error reports become log records.** With an endpoint set, an unexpected
  failure is an error-level log record with the message
  `An unexpected failure was reported`, carrying `exception.type` and
  `exception.stacktrace` (the stack frames only, never the error's message),
  and `error_origin`, `program` and, where they apply, `request_id`,
  `team_id`, `job_queue` and `job_id`. PostHog Error Tracking receives nothing.
- The browser's logs and error reports follow the server's: the api forwards
  the researcher web app's and participant pages' log records to your endpoint
  under the service name `studio-web`.
- Every exported record names its source in the resource attributes:
  `service.name` (`studio-api` for both processes), `service.version`,
  `studio.program` (`serve`, `worker`, `migrate`, `maintenance` or
  `rotate-secrets`) and `studio.installation_id`.
- The same Level 1 rule applies to your store as to Codaco's. Pointing
  telemetry at your own collector does not add names, emails, URLs or
  participant data to it.

**Analytics still go to Codaco.** Product events and participant usability
events always go to Codaco's PostHog project at `us.i.posthog.com` while
`STUDIO_TELEMETRY` is on; there is no setting that sends them anywhere else.
If your institution needs its own telemetry and no Codaco analytics, that is
not available: the only way to stop analytics is `STUDIO_TELEMETRY=false`,
which stops telemetry too.

Your collector's host joins the instance's
[outbound hosts](./requirements.md#outbound-hosts) in place of
`us.i.posthog.com` for telemetry; `us.i.posthog.com` stays on the list for
analytics.

### Example: Azure Monitor through an OpenTelemetry Collector

Studio speaks OTLP and Azure Monitor's Application Insights does not take it
directly, so run the OpenTelemetry Collector's contrib distribution beside the
stack and let its `azuremonitor` exporter do the translation. The collector
receives all three signals from Studio and sends them on: spans, log records
(including the error reports above) and metrics all reach the same Application
Insights resource, so no alert you build there depends on a second metrics
destination.

You need the Application Insights resource's **connection string** (Azure
portal → the resource → Overview). Put it and a token of your choosing in
`.env`; the token is what Studio presents to the collector:

```bash
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/
STUDIO_COLLECTOR_TOKEN=a-long-random-string
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20a-long-random-string
```

Then add the collector in `docker-compose.override.yml` beside
`docker-compose.yml`, which Compose reads on its own. If you already have one
for [a second API replica](./run.md#running-more-than-one-api), add these
blocks to it:

```yaml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.111.0
    restart: unless-stopped
    command: ['--config=/etc/otelcol-contrib/config.yaml']
    environment:
      APPLICATIONINSIGHTS_CONNECTION_STRING: ${APPLICATIONINSIGHTS_CONNECTION_STRING}
      STUDIO_COLLECTOR_TOKEN: ${STUDIO_COLLECTOR_TOKEN}
    configs:
      - source: otel-collector
        target: /etc/otelcol-contrib/config.yaml

configs:
  otel-collector:
    content: |
      extensions:
        bearertokenauth:
          token: $${env:STUDIO_COLLECTOR_TOKEN}

      receivers:
        otlp:
          protocols:
            http:
              endpoint: 0.0.0.0:4318
              auth:
                authenticator: bearertokenauth

      processors:
        batch: {}

      exporters:
        azuremonitor:
          connection_string: $${env:APPLICATIONINSIGHTS_CONNECTION_STRING}

      service:
        extensions: [bearertokenauth]
        pipelines:
          logs:
            receivers: [otlp]
            processors: [batch]
            exporters: [azuremonitor]
          traces:
            receivers: [otlp]
            processors: [batch]
            exporters: [azuremonitor]
          metrics:
            receivers: [otlp]
            processors: [batch]
            exporters: [azuremonitor]
```

`$$` stops Compose from substituting the variable itself, so the collector
reads it from its own environment. The collector publishes no port: it is on
the stack's network, where `api` and `worker` reach it as `otel-collector`.

Start it and recreate the two Studio processes so they read the new
variables:

```bash
docker compose up -d otel-collector
docker compose up -d api worker
```

The collector, not Studio, now contacts Azure: the host in the connection
string's `IngestionEndpoint` (`eastus-8.in.applicationinsights.azure.com` in
the example). Allow it outbound from this host, along with Docker Hub's hosts
for the collector image, which [the outbound list](./requirements.md#outbound-hosts)
already names.

In Application Insights, spans appear as requests and dependencies, log
records (Studio's own, the browser's forwarded ones, and the error reports) in
the `traces` table, and the gauges in `customMetrics` under their Studio names,
such as `studio_jobs_queue_depth` and `studio_runtime_event_loop_delay_p99_ms`.

If Studio runs on Azure Container Apps rather than this stack, the same
collector can run as its own container app on the environment's internal
network, with `OTEL_EXPORTER_OTLP_ENDPOINT` naming it. Do not rely on Container
Apps' managed OpenTelemetry agent for this: it sends logs and traces to
Application Insights but not metrics.

## Retention at Codaco

What Codaco's PostHog project keeps, and for how long, is in the
[privacy notice](../privacy-notice.md#how-long-it-is-kept). Data you send to
your own store is kept under your own policy.
