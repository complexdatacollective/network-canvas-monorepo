# Network Canvas Studio: usage data and telemetry

What Network Canvas Studio sends about itself and how it is used, where that
data goes, how long it is kept, and how to stop it. It covers every Studio
deployment: the managed service Codaco runs and every self-hosted instance.
Institutional IT teams will find the same facts as questions and answers in the
[IT FAQ](./it-faq.md), and self-hosting operators the configuration in the
[telemetry page](./self-host/telemetry.md) of the self-host guide.

## The rule: only public data

Studio sends only **Level 1 data** under Northwestern University's
[Data Classification Policy](https://policies.northwestern.edu/docs/data-classification-policy.pdf):
information that is already public. In practice that is:

- fixed codes defined in Studio's own source, such as an event name, a role, an
  interface type or an error type;
- numbers, durations, booleans and timestamps;
- version strings;
- random identifiers Studio itself creates, such as an account id, a team id or
  an installation id;
- stack frames pointing into Studio's open-source code.

Studio never sends researcher emails or names; team, study or protocol names;
protocol content; anything a participant enters or any network data from an
interview; URLs, request headers or user agents; IP addresses; or the
free-text message of an error. An automated test seeds all of these into one
scenario and fails if any of them appears in anything Studio sends.

**No IP address or location is stored.** PostHog would otherwise record the
address of the server that sends each event. Studio overwrites it with
`0.0.0.0` on every event and error report, and turns off PostHog's location
lookup, so neither an address nor a location derived from one is kept.

Nothing is identified beyond a random id. A researcher is known to PostHog by
their Studio account id and nothing else: no email, no name, no person
properties. A participant is never identified at all.

## Where it goes

Everything below goes, by default, to **Codaco's Studio project in PostHog
Cloud US** (`us.i.posthog.com`), sent directly by your Studio server over
HTTPS. Researchers' and participants' browsers never contact PostHog: they send
to the Studio server, which applies the rule above and forwards.

An instance's operator can send the **telemetry** (logs, traces, metrics and
error reports) to their own OpenTelemetry store instead, by setting
`OTEL_EXPORTER_OTLP_ENDPOINT`. **Analytics** (the product and participant
usability events) always go to Codaco's PostHog project while telemetry is on.

Studio's logs are also always written to the server's standard output, where
they stay on the operator's machine.

## Product events

The Studio server sends one event each time one of these actions happens. Each
is queued in the same database transaction as the action, so an action that is
rolled back sends nothing, and delivered within seconds.

| Event                      | When                                         | Properties                                                                                |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `researcher_signed_up`     | A researcher creates an account              | none beyond the common ones                                                               |
| `researcher_signed_in`     | A researcher signs in                        | none beyond the common ones                                                               |
| `team_invitation_sent`     | A team invites someone                       | `invitation_id`, `role` (`owner`, `admin` or `member`)                                    |
| `team_invitation_accepted` | An invitation is accepted                    | `invitation_id`, `role`                                                                   |
| `team_member_role_changed` | A member's role changes                      | `member_id`, `previous_roles`, `new_roles`                                                |
| `study_created`            | A study is created                           | `study_id`, `protocol_id`, `participation_mode` (`managed` or `anonymous`)                |
| `protocol_created`         | A protocol is created                        | `protocol_id`                                                                             |
| `protocol_draft_committed` | A protocol draft is saved                    | `protocol_id`, `interface_types` (the interview stage types it uses), `operation_count`   |
| `interview_started`        | A participant starts or resumes an interview | `study_id`, `wave_id`, `resumed`                                                          |
| `interview_completed`      | A participant completes an interview         | `study_id`, `wave_id`, `node_count`, `edge_count` (counts only, never the network itself) |

**On every researcher event:** `distinct_id`, the researcher's Studio account
id.

**On every interview event:** `distinct_id`, a pseudonym the server derives
from the installation id and the interview session's id, which cannot be
reversed to either; `$process_person_profile: false`, so PostHog keeps no
profile for it.

**On every event:** `installation_id` (a random id for the Studio deployment,
generated once when its database is created), `team_id` where the action
belongs to a team, PostHog's `$groups` (the installation, and the team where
there is one), `app` (`studio`), `$app_name` (`Network Canvas Studio`),
`$app_version` and `host_version` (Studio's version), `$ip: 0.0.0.0` and
`$geoip_disable: true`.

At sign-in the server also tells PostHog that the account id is a person
(`$identify`) with no person properties, so the same id in Studio's audit log
and in PostHog is the same researcher.

## Participant usability events

While telemetry is on and the study collects them (a study's creator can turn
"Collect anonymous usability analytics from participants" off), the interview
records how a participant moves through it: which stage they are on and for
how long, and which controls they use. It never records an answer, a name, a
node's or edge's attributes, or any free text. The participant's browser sends
these events to the Studio server, which replaces the browser's identifiers
with its own pseudonym and forwards them.

| Event                                                           | Properties                                                                                                            |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `interview_started`                                             | none beyond the common ones                                                                                           |
| `interview_finished`                                            | `stage_count`                                                                                                         |
| `stage_entered`                                                 | `stage_type`, `stage_index`, `direction` (`initial`, `forward`, `back` or `jumped`)                                   |
| `stage_exited`                                                  | `stage_type`, `stage_index`, `duration_ms`, `exit_direction` (`forward`, `back` or `jumped`)                          |
| `stage_validation_failed`                                       | `validation_kind`, `direction`                                                                                        |
| `node_added`                                                    | `node_id`, `node_type_index` (the node type's position in the protocol's codebook, not its name)                      |
| `node_removed`                                                  | `node_id`                                                                                                             |
| `edge_created`                                                  | `edge_id`, `edge_type_index`                                                                                          |
| `edge_removed`                                                  | `edge_id`                                                                                                             |
| `node_added_to_prompt`, `node_removed_from_prompt`              | `node_id`                                                                                                             |
| `node_binned`                                                   | `node_id`, `node_type_index`, `bin_index`                                                                             |
| `node_rebinned`                                                 | `node_id`, `node_type_index`, `from_bin_index`, `to_bin_index`                                                        |
| `bin_expanded`, `bin_collapsed`                                 | `bin_index`                                                                                                           |
| `pair_shown`                                                    | `node_a_id`, `node_b_id`                                                                                              |
| `focal_node`                                                    | `node_id`                                                                                                             |
| `form_opened`                                                   | `form_kind`, `field_details` (the input control used for each field), and `entity_id` for a form about a node or edge |
| `form_submitted`                                                | `form_kind`, and `entity_id` for a form about a node or edge                                                          |
| `form_validation_failed`                                        | `form_kind`, `field_errors` (each failing field's position and input control)                                         |
| `form_dismissed_without_save`                                   | `form_kind`                                                                                                           |
| `slides_form_slide_advanced`                                    | `slide_index`, `total_slides`                                                                                         |
| `simulation_started`                                            | `node_count`, `edge_count`                                                                                            |
| `simulation_finished`                                           | `duration_ms`, `node_count`, `edge_count`                                                                             |
| `node_initial_positioned`, `node_repositioned`, `node_unplaced` | `node_id`                                                                                                             |
| `geospatial_location_selected`                                  | `node_id`, `selection_kind`                                                                                           |
| `geospatial_search_performed`                                   | `node_id`                                                                                                             |
| `roster_loaded`                                                 | `entry_count`                                                                                                         |
| `roster_filter_changed`                                         | `has_filter`                                                                                                          |
| `narrative_preset_changed`                                      | `preset_index`, `direction`                                                                                           |
| `narrative_preset_updated`                                      | `preset_index`, `changed` (`highlight`, `group` or `edge_type`)                                                       |
| `annotation_drawn`, `annotations_reset`                         | none beyond the common ones                                                                                           |
| `pedigree_wizard_shown`, `pedigree_wizard_abandoned`            | none beyond the common ones                                                                                           |
| `pedigree_wizard_complete`                                      | `nodes_created`, `edges_created`                                                                                      |
| `passphrase_set`, `passphrase_validation_failed`                | none beyond the common ones (the passphrase itself is never sent)                                                     |
| `$exception`                                                    | the error's type only; `feature` and the other context the interview attaches (below)                                 |

`node_id`, `edge_id`, `node_a_id`, `node_b_id` and `entity_id` are not the
interview's own identifiers: each interview session gives every node and edge a
fresh random pseudonym, held only in that browser's memory, so events within
one interview join on the same node while nothing joins across interviews.

**On every participant usability event:** the server's pseudonym as
`distinct_id` (the same one its interview events carry),
`$process_person_profile: false`, the interview package's version
(`package_version`) and the protocol's content hash (`protocol_hash`), and the
same `installation_id`, `app`, `$app_name`, `$app_version`, `host_version`,
`$groups`, `$ip: 0.0.0.0` and `$geoip_disable: true` as the product events,
which the server sets itself whatever the browser sent.

An `$exception` from an interview carries only the error's type, never its
message or stack, plus the context the interview attaches: `feature` (where
it happened: `locale-load`, `stage-error-boundary`, `information-media`,
`external-data` or `geospatial-map-init`), and for some of those `locale`,
`media_kind`, `is_offline` or `component_stack`.

## Telemetry

Telemetry is how Codaco, or the operator who redirected it, keeps Studio
working. It follows the same Level 1 rule.

- **Logs.** Each record has a fixed message written in Studio's source (never
  one built from data), its level, and annotations of the kinds listed in the
  rule above: codes, ids and counts, plus `request_id`, `team_id`, `trace_id`
  and `span_id` to join records from one request. The researcher web app and
  participant pages can only send log entries from fixed catalogues in Studio's
  source, each with a constant message and a few attributes (a stage index, an
  interface type, an error code, an attempt count, a duration).
- **Traces.** A span for each request, command, database statement and
  background job. A request's span carries its method, route template (never
  the full URL), status code and duration; a statement's
  carries its SQL with every value left as a placeholder.
- **Metrics.** Gauges for the server's event-loop delay and memory use, and
  for the number of background jobs in each state on each queue.
- **Error reports.** For an unexpected failure on the server or in a browser,
  the error's type and its stack frames, with `error_origin` (`request`, `job`
  or `browser`), `program`, `surface` for a browser, and where they apply
  `request_id`, `team_id`, `job_queue` and `job_id`. Never the error's
  message. They are attributed to the installation
  (`studio-installation:<installation id>`), never to a person, and also carry
  `$ip: 0.0.0.0` and `$geoip_disable: true`.

Every log record, span and metric names the service that produced it and
carries the installation id; the server's own also carry Studio's version and
which process sent them.

## What Studio does not do

- No PostHog library, or any other third-party analytics or telemetry
  library, runs in the browser. Studio's pages connect only to the Studio server and, for map
  stages, to Mapbox.
- No session replay, no automatic capture of clicks or page views, and no
  cookies or local storage used for analytics or telemetry.

## How long it is kept

- **Usage data** (product events, participant usability events and error
  reports) is kept **no longer than 24 months**. On the PostHog plan Codaco
  uses today, PostHog keeps events for 1 year.
- **Logs** are kept 14 days today.

## How to stop it

An instance's operator sets `STUDIO_TELEMETRY=false` and restarts Studio's two
server processes. With it off, Studio does not build its exporters, error
reporter or analytics client at all, so nothing is sent, and the server drops
anything a browser offers it. This also stops telemetry sent to an operator's
own store. The [telemetry page](./self-host/telemetry.md#turning-it-off) has the
steps.

A study's creator can also turn participant usability events off for that study
alone.

Studio's daily update check is separate: it downloads a version list from
`releases.networkcanvas.com` and sends nothing about the instance.
