# Studio process roles

`STUDIO_ROLE` defaults to `both`. `web` serves authentication, researcher RPC,
assets, static client files and WebSockets, and queues durable work without
claiming it. `worker` claims configured durable jobs and exposes only liveness,
readiness and protected metrics on its configured port. `both` combines those
responsibilities. A web process still needs the complete keyset: authentication
and authorized PII reads use it. A worker verifies the same schema and keys
before starting work.

There is exactly one web or combined process per database schema. Sync sessions
and denial-summary windows are process-local. Startup holds a dedicated
PostgreSQL session advisory lock; a competing web process refuses startup.
Losing that connection terminates the process, with a bounded heartbeat to
detect an otherwise idle failed connection. This is a deployment refusal and
failure detector, not a partition-fencing or highly available sync protocol.
Stop the old web process before starting its replacement. Worker processes do
not take this lock and coordinate claims using database leases.

SIGTERM/SIGINT stop new HTTP work and new job claims immediately, send 1001 to
open WebSockets, and await active requests and delivery attempts. The process
flushes denial summaries after HTTP drains, then releases its web lock and
closes both pools. A failed flush or drain exits nonzero. A ten-second hard
limit prevents a hung SMTP peer or unfinished client from blocking replacement
indefinitely; durable leases remain available for later retry. Give the
container at least fifteen seconds before forcing termination.

The ordinary connecting login should have no schema-owner, CREATE, CREATEROLE
or superuser privilege. It needs SET membership in the two NOLOGIN runtime
roles. Production pool constructors pin the intended role before the first
query, including when URL startup options are present. Readiness reads the
fingerprint as that restricted role; runtime processes have no access to the
migration history schema and no writes to the fingerprint. Migration0004
narrows that fingerprint grant without rewriting earlier migration artifacts.
The separate migrator login owns the schema and runs only the explicit offline
migration command.

The native process tests use PostgreSQL, real authenticated WebSockets, a real
SMTP connection with controlled acknowledgement, and an unfinished HTTP
request. They prove role separation, duplicate refusal, lock-loss exit, first
replacement, code1001, and no new claim while waiting for drain. The database
permission test additionally uses a non-superuser, non-owner login and verifies
readiness plus denied DDL and migration-evidence access. Deliberately starting
a worker in web mode, bypassing the lock, and delaying worker stop each cause
the corresponding behavioral assertion to fail.
