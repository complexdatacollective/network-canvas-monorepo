# Network Canvas Studio: IT FAQ

Short answers to the questions an institution's IT, security or
data-protection office asks about what Studio sends off the machine. The
[privacy notice](./privacy-notice.md) lists every event and field; the
self-host guide's [telemetry page](./self-host/telemetry.md) and
[requirements](./self-host/requirements.md#outbound-hosts) have the
configuration and the full list of outbound hosts.

### Does Studio send data to Codaco?

Yes, by default. With `STUDIO_TELEMETRY` on, which is the default, both
Studio server processes send telemetry (logs, traces, metrics and error
reports) and analytics (product events and participant usability events) to
Codaco's Studio project in PostHog Cloud US, at `us.i.posthog.com`. Only Level
1 (public) data is sent: fixed codes, numbers, durations, booleans, timestamps,
version strings, random ids Studio creates, and stack frames from Studio's
open-source code.

### What is never sent?

Researcher emails and names; team, study and protocol names; protocol content;
anything a participant enters, and any interview network data; URLs, request
headers and user agents; IP addresses; and the free-text message of any error.
An automated test seeds all of these and fails if any reaches anything Studio
sends.

Participants' browsers can't widen this. Their usability events are checked on
your server against a fixed catalogue of event names and properties in
Studio's source, and a batch containing anything outside it is dropped whole.

### Does PostHog store our server's IP address, or a location?

No. PostHog records the address of whatever sends it an event unless told
otherwise. Studio sets that address to `0.0.0.0` on every event and error
report it sends, overwriting your server's, and turns off PostHog's location
lookup, so neither is stored.

### Is anyone identified?

Researchers are known to PostHog by their Studio account id, a random id, and
nothing else: no email and no name. Participants are never identified; their
events carry a pseudonym the server derives per interview session, and PostHog
keeps no profile for it.

### Do our users' browsers contact PostHog or any other third party?

Not for telemetry or analytics. Researchers' and participants' browsers send
all of it to your Studio instance, which applies the rules above and forwards
it. No third-party
analytics or telemetry library runs in the browser, and nothing is stored in
cookies or local storage for it. The page's content security policy lets the
browser connect only to your instance and to `api.mapbox.com`: a protocol's
Geospatial stage, and the editor's map preview, load maps and place search
from Mapbox with the protocol's own Mapbox key, so a browser showing one does
contact that third party.

### How do we turn it off?

Set `STUDIO_TELEMETRY=false` in `.env` and recreate the `api` and `worker`
containers. Studio then builds no exporter, error reporter or analytics client
at all, so nothing can be sent. It also overrides an OpenTelemetry endpoint you
have set. A study can separately turn participant analytics off, which stops its
participant usability events and its interview product events.

### Can we keep telemetry and still stop analytics?

No. One switch governs both. You can send the telemetry to your own store
instead (next question), but product and participant usability events go to
Codaco while `STUDIO_TELEMETRY` is on, and the only way to stop them is to turn
it off, which stops telemetry too.

### Does Codaco see our instance's metrics?

Not today. Studio sends its gauges (event-loop delay, memory, job queue
depths) with the rest of its telemetry, but Codaco's PostHog project does not
have PostHog's metrics product, so Codaco cannot see or query them. Codaco
watches a queue backlog or a blocked event loop only through the log records
Studio writes when either stays over its threshold. If you send telemetry to
your own store, the metrics arrive there.

### Can we send logs, traces, metrics and errors to our own store?

Yes. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to an OpenTelemetry collector that
accepts OTLP over HTTP, and `OTEL_EXPORTER_OTLP_HEADERS` to its credential if
it needs one. Logs, traces, metrics and error reports then go there and not to
Codaco; error reports arrive as error-level log records. The
[telemetry page](./self-host/telemetry.md#example-azure-monitor-through-an-opentelemetry-collector)
has an Azure Monitor example.

### Which hosts must the firewall allow?

The fixed list, with the reason for each, is in
[requirements](./self-host/requirements.md#outbound-hosts). For telemetry and
analytics it is `us.i.posthog.com`, only while `STUDIO_TELEMETRY` is on, plus
your collector's host if you set `OTEL_EXPORTER_OTLP_ENDPOINT`. A CI job starts
the whole stack with telemetry off and fails if it contacts any host outside
that list; a second, with it on, fails if any telemetry or analytics host other
than `us.i.posthog.com` is contacted.

### Is the update check telemetry?

No, and it is not governed by `STUDIO_TELEMETRY`. Once a day the worker
downloads a version list from `releases.networkcanvas.com` with a plain `GET`
that carries nothing about your instance. To stop it, block the host.

### How long does Codaco keep the data?

Usage data (product events, participant usability events and error reports)
no longer than 24 months; on the PostHog plan Codaco uses today, PostHog keeps
events 1 year. Logs are kept 14 days today. What you send to your own store is
kept under your own policy.

### Are logs still available locally?

Yes. Every log record is written to the containers' standard output as one
JSON line, with telemetry on or off, so `docker compose logs` and any log
shipper you already run keep working.
