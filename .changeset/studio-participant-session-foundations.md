---
'@codaco/studio-api': minor
'@codaco/studio-contract': minor
'@codaco/studio-web': patch
---

Studio gains the server foundations for participant interview sessions. No
participant route uses them yet; the participant procedures and pages that do
are still to come.

An interview session can now hold its own credential: a session token stored
only as the SHA-256 of its secret, unique within a team. The token travels in
a dedicated `x-studio-participant-session` header, never a cookie, and a new
`RequireSession` middleware looks it up inside the team it names, refusing an
unknown, malformed or foreign token. A finished interview's token still
resolves, so a reopened finished interview can be told apart from an invalid
link. Request traces record the header as redacted.

The session store records the newest write a participant's browser has had
applied, so a replayed or out-of-order write changes nothing, and lets a
second page take a session over, after which the first page's writes are
refused.

The participant procedures' contract now matches the interview runtime's
payload, with every field declared except the protocol document, so a column
added to the session later cannot reach a participant by accident.

Audit events can now name a participant as their actor. Team activity labels
such an actor "Participant", beside their participant code, or a short session
reference in an anonymous study.
