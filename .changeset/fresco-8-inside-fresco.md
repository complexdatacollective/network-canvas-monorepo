---
'fresco': major
---

Fresco now keeps schema 8 protocols and their interviews as they are, and runs
them in the schema 8 interview, which comes with Fresco. Studies running a
schema 8 protocol carry on exactly as before.

- Fresco never upgrades a protocol to schema 9. A schema 8 protocol is
  imported exactly as it is, and a schema 9 protocol likewise. A schema 7
  protocol is still brought up to schema 8 on import, as before, and runs as a
  schema 8 protocol. To use schema 9 features, upgrade the protocol in
  Architect and import the saved file.
- Updating Fresco no longer upgrades the protocols and interviews it already
  holds. A schema 8 protocol is marked with its schema version in the protocols
  table, and its interviews open in the schema 8 interview, at
  `/v8/interview/<id>`. Onboarding links, participant links and resumed
  interviews go there on their own.
- Exports, the interview API and generated test interviews read schema 8
  interviews with schema 8's own code, so their exported files are the same as
  before. An export can mix schema 8 and schema 9 interviews.
- A deployment still running a Fresco release before 4.0, which stored schema 7
  protocols, must update to the latest 4.x release before updating to this one.
