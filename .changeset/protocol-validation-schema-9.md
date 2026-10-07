---
'@codaco/protocol-validation': major
---

Adds protocol schema 9, in which attribute (variable) names can use any
script, spaces and punctuation, and encrypted attributes are no longer
experimental.

**Breaking:**

- `CURRENT_SCHEMA_VERSION` is now `9`, and `CurrentProtocolSchema` and
  `CurrentProtocol` describe schema 9. `migrateProtocol` and
  `protocolMigrator.migrate` called without a target version now produce
  schema 9 documents. A host that stores or runs protocols must accept
  schema 9; the matching `@codaco/interview` major runs it.
- `migrateProtocol(document, targetVersion, dependencies)` accepts only a
  target it can validate (7, 8 or 9), and its return type follows the target:
  `Protocol<V>` for an explicit target, `CurrentProtocol` without one. The
  result is validated against the target version's own schema, so a migration
  to 8 refuses names only schema 9 allows. `ProtocolMigrator`'s `migrate` has
  the same overloads.
- `detectSchemaVersion` throws `VersionMismatchError` for a document newer
  than `CURRENT_SCHEMA_VERSION`, instead of `SchemaVersionDetectionError`, so
  `getProtocolFileErrorKind` reports it as `'newerVersion'`.
- A codebook ID of `__proto__` is refused. `validateProtocol` and
  `migrateProtocol` look for it in the document as it was read, before a
  schema parse can drop the key, so pass them the raw document.
  `validateProtocol` now takes `unknown`.

Schema 9:

- The v8 to v9 migration keeps existing names as they are. Its migration
  notes tell researchers what the new version allows.
- Schema 9 has no `experiments` property, and refuses a document that has one:
  an attribute marked `encrypted` is always encrypted. Schema 8 still accepts
  `experiments`, which `ExperimentsSchema` and the `Experiments` type describe.
- The v8 to v9 migration removes `experiments`. If
  `experiments.encryptedVariables` was not `true`, it also removes `encrypted`
  from every node attribute, because schema 8 interviews stored those
  attributes without encryption. A host that stores `experiments` apart from
  the rest of the protocol must put it back into the document it migrates, or
  an encrypted protocol loses its encryption.
- Schema 9 refuses an Anonymisation stage whose minimum passphrase length is
  longer than its maximum, since no participant could choose a passphrase.
  The v8 to v9 migration removes both lengths from such a stage, so the
  interview's default minimum applies, and its migration notes say so.
- Schema 8 still refuses names outside `a-z`, `A-Z`, digits and `. _ - :`, with
  a message that says so. `VersionlessProtocolSchema`, the version 8 body
  without its `schemaVersion`, is now exported.
- The v3 to v4 migration no longer strips characters outside `[a-zA-Z0-9._:-]`
  from type names, variable names and option values. It turns tabs and line
  breaks into spaces, removes other control characters, trims the result, and
  falls back to the record's ID when nothing is left. Filter, skip logic and
  panel rules that refer to an option value it changed are updated to match.
  A migration to schema 7 or 8 still applies the old rule, which those schemas
  enforce: each migration step now receives the target version as a third
  argument to `migrate`.

Participant data files (rosters):

- `validateNames` and the new `isUsableExternalAttributeName` accept any name
  the codebook allows once it is in NFC.
- `readRosterCsv(text)` reads a CSV roster the way an interview loads it, and
  keeps a column called `__proto__` or `constructor`, or one whose name
  contains a dot, exactly as written. The package now depends on `csvtojson`.
- `findRosterCharacterProblems(text, format)` finds characters XML 1.0 can't
  carry in a CSV or JSON roster, placed by column, row and cell, node and
  attribute, or line, so a host can refuse the file before it reaches an
  interview. Its types are `RosterCharacterProblem`, `RosterCharacterReport`
  and `RosterFormat`.
