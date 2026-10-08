# @codaco/protocol-validation

This npm package implements methods for validating Network Canvas protocol files against an appropriate JSON schema.

It exports three primary methods for protocol validation:

1. validateSchema - validates a schema against the JSON schema

```js
const { hasErrors, errors } = validateSchema(schemaJson);
```

2. validateLogic - validates the logic of the protocol to ensure there are no inconsistencies. This includes validations that cannot be implemented within the JSON schema.

```js
const { hasErrors, errors } = validateLogic(protocolJson);
```

3. validateProtocol - validates the protocol against the schema and logic.

```js
const result = await validateProtocol(protocolJson);
if (result.success) {
  // protocol is valid, validated data available in result.data
} else {
  // protocol is invalid
  // result.error contains the Zod error
  console.error(result.error);
}
```

It also exports several utility methods for managing protocol validation.

1. migrateProtocol - migrates protocols from one version to another

```js
// Migrates to the current schema version unless a target version is given.
const migratedProtocol = migrateProtocol(protocolJson, undefined, {
  name: 'My protocol',
});
```

A host that stores interview sessions against its protocols migrates the
sessions too, with `migrateProtocolWithSessions` (see
[Migrating stored sessions](#migrating-stored-sessions)).

2. canUpgrade - checks if protocol can be upgraded from one schema version to another

```js
const canProtocolUpgrade = canUpgrade(7, 8);
```

3. getMigrationNotes - returns migration notes on the changes between a source schema version and a target schema version.

```js
const migrationNotes = getMigrationNotes(7, 8);
```

4. getVariableNamesFromNetwork - returns variable names from an external network data source

```js
const variableNames = getVariableNamesFromNetwork(network);
```

5. validateNames - validates variable names against the rule for attribute names: they may use letters from any language, numbers, spaces and punctuation, but must not be empty, start or end with a space, or contain control characters

```js
const validationResult = validateNames(variableNamesArray);
```

## Migrating stored sessions

A host that migrates a stored protocol in place, so that the interviews
already recorded against it go on pointing at it, must migrate those
interviews with it. A migration can move stages (a session's resume position
and its stage metadata are keyed by stage index) and can change how a session
represents its data. `migrateProtocolWithSessions` migrates a protocol exactly
as `migrateProtocol` does, throwing the same errors, and also returns the
migrator for the sessions recorded against the protocol it was given:

```ts
import { migrateProtocolWithSessions } from '@codaco/protocol-validation';

const { protocol, migrateSession } = migrateProtocolWithSessions(
  storedProtocol,
  undefined, // the current schema version
  { name: 'My protocol' },
);

// In the same transaction as writing `protocol`:
for (const stored of sessionsOfThisProtocol) {
  const result = migrateSession({
    network: stored.network,
    stageMetadata: stored.stageMetadata, // keyed by stage index; may be null
    currentStep: stored.currentStep,
  });
  if (!result.success) {
    // result.error is a SessionMigrationError. Record it and leave this
    // session as it was; carry on with the others.
    continue;
  }
  if (result.changed) {
    write(stored.id, result.session); // { network, stageMetadata, currentStep }
  }
}
```

- **What a session is.** `network`, `stageMetadata` (each stage's record,
  keyed by the stage's index as a decimal string) and `currentStep` (the stage
  the session resumes at; `stages.length` is the engine's finish stage). These
  are typed loosely on the way in, because an old session holds what its
  schema version wrote. Everything else a host stores is the host's and is
  never touched.
- **Validation.** Each migrated session is checked against the current
  `NcNetworkSchema` and `StageMetadataSchema` from `@codaco/shared-consts`,
  and `session` holds the parsed result.
- **Failures are per session.** `migrateSession` never throws. A failure has
  a `reason`: `invalid-session` (what was passed is not a session),
  `step-failed` (a migration step threw; `version` names it and `cause` holds
  its error) or `invalid-result` (the migrated session does not satisfy the
  current schema, which includes a session that was already damaged). One bad
  session should not stop a host migrating its protocol or the other
  sessions.
- **Pure.** The migrator is deterministic and never modifies the session it is
  given, so it can be called for each session in any order, and inside a
  transaction. `changed` is false when the result equals the input, so the
  host can skip the write.
- **Already current.** When the protocol is already at the target version,
  the migrator only validates.

Fresco (`apps/fresco/scripts/migrate-protocols.ts`) and Interviewer
(`apps/interviewer/src/lib/db/migrateStoredProtocols.ts`) are the reference
hosts.

### Writing a migration step

The rule every step follows: **a migration that changes stage indices, or how
a session represents its data, must provide a session migration.** Declare it
as `migrateSession` in the same `createMigration` definition as the protocol
transform. It receives a copy of each session and the protocol before and
after the step (frozen), and returns the session as the target version reads
it. `remapStageIndices(session, before, after)` (`src/migration/session.ts`) moves stage records and the
resume position by matching stage ids; a step that adds, removes or reorders
stages starts with it. A step that needs neither leaves `migrateSession` out,
and sessions pass through it unchanged.
