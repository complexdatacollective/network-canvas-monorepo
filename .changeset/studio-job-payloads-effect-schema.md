---
'@codaco/studio-sync': patch
'@codaco/studio-server': patch
---

Job payloads are declared once, on Effect Schema. `@codaco/studio-sync/jobs`
now declares every queue's payload as a `Schema.Struct` in
`JOB_PAYLOAD_SCHEMAS`, beside `JOB_PAYLOAD_PARSE_OPTIONS`, and the server's
queue decodes through those rather than a second set of its own. The payload
policy is unchanged: a job carries row identifiers only, with sign-in email the
one documented exception, and a payload with a field its queue does not declare
is refused on enqueue and killed on claim rather than having the field dropped.

The sweep and denied-attempts summary queues now refuse any payload but an
empty object. Their previous declaration admitted any value that was not null
and kept an undeclared key as it was sent.
