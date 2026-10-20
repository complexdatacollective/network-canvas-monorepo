---
'fresco': major
---

Fresco now keeps schema 8 protocols and their interviews as they are, and runs
them in the schema 8 interview, which comes with Fresco. Studies running a
schema 8 protocol carry on exactly as before.

- Importing a protocol made for schema 8 or earlier asks how to import it.
  **Keep schema 8** imports it unchanged (a schema 7 protocol is brought up to
  schema 8, as Fresco 4 did), and **Upgrade to schema 9** imports an upgraded
  copy, after showing what the upgrade changes. Your protocol file
  is never changed. Fresco no longer upgrades a protocol without asking.
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
