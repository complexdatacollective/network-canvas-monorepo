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

const results = sessionsOfThisProtocol.map((stored) => ({
  id: stored.id,
  result: migrateSession({
    network: stored.network,
    stageMetadata: stored.stageMetadata, // keyed by stage index; may be null
    currentStep: stored.currentStep,
  }),
}));
const failures = results.filter(({ result }) => !result.success);
if (failures.length > 0) {
  // Write nothing: leave the protocol and every one of its sessions as they
  // were, and report each failure (result.error is a SessionMigrationError).
} else {
  // In one transaction: write `protocol`, and each session whose
  // result.changed is true (result.session is { network, stageMetadata,
  // currentStep }).
}
```

- **What a session is.** `network`, `stageMetadata` (each stage's record,
  keyed by the stage's index as a decimal string) and `currentStep` (the stage
  the session resumes at; `stages.length` is the engine's finish stage). These
  are typed loosely on the way in, because an old session holds what its
  schema version wrote. Everything else a host stores is the host's and is
  never touched.
- **Stage positions.** When a migration adds, removes or reorders stages, each
  session's stage records and resume position follow their stages, matched by
  stage id between the protocol before and after each step. A session resumes
  at the same stage in its new position; if that stage was removed, at the
  next stage that survived. A stage inserted before the session's own is not
  visited retroactively (a session on a pedigree resumes on the pedigree, not
  on a new introduction inserted before it), and a session at the finish
  position stays there. The record of a removed stage is dropped. A step's
  own session step runs after this and may set a different resume position
  when the old interface had not yet shown the session what the inserted
  stage now holds: the 8 → 9 step resumes a session left on a Family
  Pedigree the participant had not started at the Information stage its
  introduction screen became, because the schema 8 pedigree showed that
  screen whenever it opened with no family on it.
- **Stages without ids.** Schema 9 requires a unique id on every stage, but an
  older protocol may lack one. When a step keeps the number of stages, every
  stage is taken to have stayed where it was (no step reorders stages). When a
  step changes the number of stages and some stage has no id or shares one,
  the stages cannot be matched, and every session fails with
  `stages-unmatched` rather than resume at a guessed stage.
- **Validation.** Each migrated session is checked against the current
  `NcNetworkSchema` and `StageMetadataSchema` from `@codaco/shared-consts`,
  and `session` holds the parsed result.
- **Failures are reported, never thrown.** `migrateSession` returns a failure
  with a `reason`: `invalid-session` (what was passed is not a session),
  `stages-unmatched` (see above), `step-failed` (a migration step threw;
  `version` names it and `cause` holds its error) or `invalid-result` (the
  migrated session does not satisfy the current schema, which includes a
  session that was already damaged).
- **All or nothing.** A host must never leave a mixture of migrated and
  unmigrated data, because that blocks going back to the previous version. If
  any session of a protocol fails, the host writes neither the protocol nor
  any of its sessions. Fresco, which migrates every protocol in one database
  transaction at deploy, aborts that transaction and stops starting up,
  naming each failed interview. Interviewer leaves that protocol and all its
  sessions exactly as stored, reports the protocol as unable to update, and
  tries again at the next launch.
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

The rule every step follows: **a migration that changes how a session
represents its data must provide a session step; stage-index changes are
handled by the framework.** A step that adds, removes or reorders stages needs
nothing more than its protocol transform, as long as every stage keeps its id:
the framework moves each session's stage records and resume position after the
step runs. A step that re-spells a recorded answer or changes the shape of a
stage's metadata declares `migrateSession` in the same `createMigration`
definition as the protocol transform. It receives a copy of each session,
already at the step's new stage positions, and the protocol before and after
the step (frozen), and returns the session as the target version reads it. A
step that changes neither leaves `migrateSession` out, and sessions pass
through it unchanged.
