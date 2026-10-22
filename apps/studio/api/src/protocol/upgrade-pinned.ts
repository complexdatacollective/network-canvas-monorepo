import { and, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import {
  CURRENT_SCHEMA_VERSION,
  type CurrentProtocol,
  type SessionMigrator,
} from '@codaco/protocol-validation';
import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import {
  egoColumns,
  networkFromRows,
  decodeAttributes,
  decodeSecureAttributes,
} from '../network/mapping.ts';
import {
  readSessionNetwork,
  replaceSessionNetwork,
} from '../network/session-network.ts';
import { STUDY_TABLES } from '../study/schema.ts';
import { migrateStoredVersionToDraft } from './migrate.ts';
import { PROTOCOL_TABLES } from './schema.ts';
import { discardDraft, publishDraft } from './store.ts';

// The one-time upgrade that keeps studies pinned to a protocol version stored
// below the current schema runnable after the schema moves on. The interview
// runtime executes only the current schema (`participantProtocolPayload`), so
// a wave or an in-flight session left on an older version could not be
// opened. Each such version is migrated and published as a new version of its
// own line (recording `migrated_from_version_id`), the waves pinning it are
// re-pinned, and every in-flight session pinned to it is carried across with
// the session migrator from the same migration, as Fresco's deploy migration
// carries its interviews (apps/fresco/scripts/migrate-protocols.ts).
//
// Left untouched:
// - completed sessions: finalized and immutable, and their snapshot records
//   the schema version they were collected under;
// - closed studies: read-only by the database's own guards. Should a study be
//   reopened (the `studies_closed_read_only` trigger admits exactly that
//   write), its waves and in-flight sessions may still pin an older version;
//   the reopen must then run this same upgrade for that study before it
//   serves an interview.

const { protocolVersions } = PROTOCOL_TABLES;
const { interviewSessions, studies, studyWaves } = STUDY_TABLES;

/** The statuses of a session that can still be opened and written. */
const LIVE_SESSION_STATUSES = ['in_progress', 'abandoned'];

type PinnedUpgradeFailure = {
  readonly teamId: string;
  readonly versionId: string;
  /** The session that could not be carried across; null for the version itself. */
  readonly sessionId: string | null;
  readonly reason: string;
};

/** A pinned version that could not be migrated and published. */
class PinnedVersionMigrationError extends Schema.TaggedError<PinnedVersionMigrationError>()(
  'PinnedVersionMigrationError',
  {
    teamId: Schema.String,
    versionId: Schema.String,
    reason: Schema.String,
  },
) {
  override get message(): string {
    return `protocol version ${this.versionId} of team ${this.teamId}: ${this.reason}`;
  }
}

/**
 * Raised once everything has been tried, when any pinned version or any
 * in-flight session could not be upgraded. Raised inside the migration
 * transaction, it rolls the whole upgrade back, so the database stays as the
 * previous release wrote it and that release can still be restored.
 */
export class PinnedUpgradeFailed extends Schema.TaggedError<PinnedUpgradeFailed>()(
  'PinnedUpgradeFailed',
  {
    failures: Schema.Array(
      Schema.Struct({
        teamId: Schema.String,
        versionId: Schema.String,
        sessionId: Schema.NullOr(Schema.String),
        reason: Schema.String,
      }),
    ),
  },
) {
  override get message(): string {
    const count = this.failures.length;
    return (
      `${count} pinned protocol ${count === 1 ? 'version or interview' : 'versions or interviews'} ` +
      `could not be upgraded to schema version ${CURRENT_SCHEMA_VERSION}, so ` +
      'studies pinned to them could not run on this release. Report these:\n' +
      this.failures
        .map((failure) =>
          failure.sessionId === null
            ? `- protocol version ${failure.versionId} of team ${failure.teamId}: ${failure.reason}`
            : `- interview session ${failure.sessionId} (protocol version ${failure.versionId} of team ${failure.teamId}): ${failure.reason}`,
        )
        .join('\n')
    );
  }
}

export type PinnedUpgradeCounts = {
  readonly versions: number;
  readonly waves: number;
  readonly sessions: number;
};

type MigratedVersion = {
  readonly versionId: string;
  readonly protocol: CurrentProtocol;
  readonly migrateSession: SessionMigrator;
};

const describe = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const { cause } = error;
  return cause instanceof Error && cause.message !== ''
    ? `${error.message} ${cause.message}`
    : error.message;
};

/**
 * Migrates one stored version to the current schema and publishes the result
 * as a new version of its line, through the same draft a researcher's
 * "migrate" would make, then discards that draft. A version whose migrated
 * content was already published (by a researcher, or by an earlier run) is
 * reused rather than published twice. Runs in the version's team: the
 * transaction must carry `teamId`.
 */
const migratePinnedVersion: (
  teamId: string,
  versionId: string,
) => Effect.Effect<
  MigratedVersion,
  PinnedVersionMigrationError | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.migratePinnedVersion')(function* (
  teamId: string,
  versionId: string,
) {
  const refused = (reason: string) =>
    new PinnedVersionMigrationError({ teamId, versionId, reason });
  const draft = yield* migrateStoredVersionToDraft(teamId, { versionId }).pipe(
    Effect.catchTag('MigrationTargetError', (error) =>
      Effect.fail(refused(error.reason)),
    ),
    // A document the migration chain refuses throws; it is reported with the
    // rest rather than ending the run at the first one.
    Effect.catchDefect((defect) => Effect.fail(refused(describe(defect)))),
  );
  const published = yield* publishDraft(teamId, {
    draftId: draft.draftId,
  }).pipe(
    Effect.catchTag('ProtocolStoreError', (error) =>
      Effect.fail(refused(error.reason)),
    ),
  );
  yield* discardDraft(teamId, draft.draftId);
  switch (published.status) {
    case 'published':
    case 'unchanged':
      return {
        versionId: published.versionId,
        protocol: draft.protocol,
        migrateSession: draft.migrateSession,
      };
    case 'invalid':
      return yield* refused(
        `the migrated protocol is invalid: ${published.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      );
    case 'conflict':
      return yield* refused('its migrated draft changed while publishing');
  }
});

type PinnedVersion = { readonly teamId: string; readonly versionId: string };

/**
 * Every (team, version) below the current schema that a study which is not
 * closed still runs: pinned by a wave, or by a session that can still be
 * opened.
 */
const findPinnedVersions = Effect.fn('protocol.findPinnedVersions')(
  function* () {
    const { tx } = yield* Transaction;
    const pinnedByWaves = tx
      .selectDistinct({
        teamId: studyWaves.teamId,
        versionId: protocolVersions.id,
      })
      .from(studyWaves)
      .innerJoin(
        studies,
        and(
          eq(studies.id, studyWaves.studyId),
          eq(studies.teamId, studyWaves.teamId),
        ),
      )
      .innerJoin(
        protocolVersions,
        and(
          eq(protocolVersions.id, studyWaves.protocolVersionId),
          eq(protocolVersions.teamId, studyWaves.teamId),
        ),
      )
      .where(
        and(
          ne(studies.state, 'closed'),
          lt(protocolVersions.schemaVersion, CURRENT_SCHEMA_VERSION),
        ),
      );
    const pinnedBySessions = tx
      .selectDistinct({
        teamId: interviewSessions.teamId,
        versionId: protocolVersions.id,
      })
      .from(interviewSessions)
      .innerJoin(
        studies,
        and(
          eq(studies.id, interviewSessions.studyId),
          eq(studies.teamId, interviewSessions.teamId),
        ),
      )
      .innerJoin(
        protocolVersions,
        and(
          eq(protocolVersions.id, interviewSessions.protocolVersionId),
          eq(protocolVersions.teamId, interviewSessions.teamId),
        ),
      )
      .where(
        and(
          ne(studies.state, 'closed'),
          inArray(interviewSessions.status, LIVE_SESSION_STATUSES),
          lt(protocolVersions.schemaVersion, CURRENT_SCHEMA_VERSION),
        ),
      );
    const rows: PinnedVersion[] = [
      ...(yield* pinnedByWaves),
      ...(yield* pinnedBySessions),
    ];
    const unique = new Map<string, PinnedVersion>();
    for (const row of rows) unique.set(row.versionId, row);
    return [...unique.values()].toSorted(
      (a, b) =>
        a.teamId.localeCompare(b.teamId) ||
        a.versionId.localeCompare(b.versionId),
    );
  },
  sqlErrorsOnly,
);

const openStudiesOf = (teamId: string) =>
  Effect.map(Transaction, ({ tx }) =>
    tx
      .select({ id: studies.id })
      .from(studies)
      .where(and(eq(studies.teamId, teamId), ne(studies.state, 'closed'))),
  );

const repinWaves = Effect.fn('protocol.repinWaves')(function* (
  teamId: string,
  from: string,
  to: string,
) {
  const { tx } = yield* Transaction;
  const open = yield* openStudiesOf(teamId);
  const rows = yield* tx
    .update(studyWaves)
    .set({ protocolVersionId: to, updatedAt: sql`now()` })
    .where(
      and(
        eq(studyWaves.teamId, teamId),
        eq(studyWaves.protocolVersionId, from),
        inArray(studyWaves.studyId, open),
      ),
    )
    .returning({ id: studyWaves.id });
  return rows.length;
}, sqlErrorsOnly);

const liveSessionsOf = Effect.fn('protocol.liveSessionsPinnedTo')(function* (
  teamId: string,
  versionId: string,
) {
  const { tx } = yield* Transaction;
  const open = yield* openStudiesOf(teamId);
  return yield* tx
    .select({
      id: interviewSessions.id,
      currentStageIndex: interviewSessions.currentStageIndex,
      stageMetadata: interviewSessions.stageMetadata,
      egoUid: interviewSessions.egoUid,
      egoAttributes: interviewSessions.egoAttributes,
      egoSecureAttributes: interviewSessions.egoSecureAttributes,
    })
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.teamId, teamId),
        eq(interviewSessions.protocolVersionId, versionId),
        inArray(interviewSessions.status, LIVE_SESSION_STATUSES),
        inArray(interviewSessions.studyId, open),
      ),
    )
    .orderBy(interviewSessions.id)
    .for('update');
}, sqlErrorsOnly);

type SessionRow = Effect.Success<ReturnType<typeof liveSessionsOf>>[number];

/**
 * Moves one session onto the migrated version: its network, stage records,
 * ego and resume position as the session migrator rewrote them, its pin, and
 * a new holder epoch, so a tab still open on the old protocol is taken over
 * rather than syncing data in the old shape.
 */
const writeMigratedSession = Effect.fn('protocol.writeMigratedSession')(
  function* (
    teamId: string,
    session: SessionRow,
    target: MigratedVersion,
    migrated: Extract<ReturnType<SessionMigrator>, { success: true }>,
  ) {
    const { tx } = yield* Transaction;
    const { network, stageMetadata, currentStep } = migrated.session;
    if (migrated.changed) {
      yield* replaceSessionNetwork({ sessionId: session.id, network });
    }
    const ego = egoColumns(network.ego);
    const rows = yield* tx
      .update(interviewSessions)
      .set({
        protocolVersionId: target.versionId,
        currentStageIndex: currentStep,
        currentStageId: target.protocol.stages[currentStep]?.id ?? null,
        stageMetadata: stageMetadata ?? {},
        egoUid: ego.egoUid,
        egoAttributes: ego.egoAttributes,
        egoSecureAttributes: ego.egoSecureAttributes,
        holderEpoch: sql`${interviewSessions.holderEpoch} + 1`,
      })
      .where(
        and(
          eq(interviewSessions.teamId, teamId),
          eq(interviewSessions.id, session.id),
        ),
      )
      .returning({ id: interviewSessions.id });
    if (rows.length !== 1) {
      return yield* Effect.die(
        new Error(
          `session ${session.id} was not moved to its migrated version`,
        ),
      );
    }
  },
  sqlErrorsOnly,
);

/**
 * Upgrades one team's pinned version: migrates and publishes it, re-pins its
 * waves, and carries its in-flight sessions across. Failures are collected,
 * not raised; once one is recorded nothing more is written, since the whole
 * upgrade will be rolled back.
 */
const upgradeVersion = Effect.fn('protocol.upgradePinnedVersion')(function* (
  pinned: PinnedVersion,
  failures: PinnedUpgradeFailure[],
) {
  const migrated = yield* migratePinnedVersion(
    pinned.teamId,
    pinned.versionId,
  ).pipe(
    Effect.catchTag('PinnedVersionMigrationError', (error) =>
      Effect.sync(() => {
        failures.push({
          teamId: error.teamId,
          versionId: error.versionId,
          sessionId: null,
          reason: error.reason,
        });
        return null;
      }),
    ),
  );
  if (migrated === null) return { migrated: false, waves: 0, sessions: 0 };

  const waves =
    failures.length === 0
      ? yield* repinWaves(pinned.teamId, pinned.versionId, migrated.versionId)
      : 0;

  let sessions = 0;
  for (const session of yield* liveSessionsOf(
    pinned.teamId,
    pinned.versionId,
  )) {
    const rows = yield* readSessionNetwork(session.id);
    const result = migrated.migrateSession({
      network: networkFromRows({
        nodes: rows.nodes,
        edges: rows.edges,
        ego: {
          egoUid: session.egoUid,
          egoAttributes: decodeAttributes(session.egoAttributes),
          egoSecureAttributes: decodeSecureAttributes(
            session.egoSecureAttributes,
          ),
        },
      }),
      stageMetadata: session.stageMetadata,
      currentStep: session.currentStageIndex,
    });
    if (!result.success) {
      failures.push({
        ...pinned,
        sessionId: session.id,
        reason: describe(result.error),
      });
      continue;
    }
    if (failures.length > 0) continue;
    yield* writeMigratedSession(pinned.teamId, session, migrated, result);
    sessions += 1;
  }
  return { migrated: true, waves, sessions };
});

const SET_MAINTENANCE_ROLE = `SET LOCAL ROLE ${TENANT_ROLES.maintenance}`;

/**
 * The upgrade itself, run by `studio-api migrate` inside its transaction, as
 * the owner, before the commit. Every pinned version and every in-flight
 * session is tried, so the report names each one that could not be upgraded;
 * then any failure raises `PinnedUpgradeFailed`, which rolls the whole
 * migration back. Idempotent: once every pin is current, it finds nothing and
 * writes nothing.
 *
 * It reads and writes as `studio_maintenance`, whose policies see every
 * team, on the migration's own connection (`SET LOCAL ROLE` … `RESET ROLE`),
 * and stamps each version's team on the transaction it hands the stores.
 *
 * A session's version pin is immutable to every writer
 * (`interview_sessions_writable`), so that guard is disabled for the
 * duration, as the owner, and enabled again before this returns; the sessions
 * written are only in-flight ones of studies that are not closed, which the
 * guard would otherwise have admitted.
 */
export const upgradePinnedStudies: () => Effect.Effect<
  PinnedUpgradeCounts,
  PinnedUpgradeFailed | SqlError.SqlError,
  Transaction
> = Effect.fn('protocol.upgradePinnedStudies')(function* () {
  const outer = yield* Transaction;
  const { sql: client } = outer;

  yield* client.unsafe(SET_MAINTENANCE_ROLE);
  const pinned = yield* findPinnedVersions();
  yield* client.unsafe('RESET ROLE');
  if (pinned.length === 0) return { versions: 0, waves: 0, sessions: 0 };

  yield* client.unsafe(
    'ALTER TABLE interview_sessions DISABLE TRIGGER interview_sessions_writable',
  );
  yield* client.unsafe(SET_MAINTENANCE_ROLE);
  const failures: PinnedUpgradeFailure[] = [];
  const counts = { versions: 0, waves: 0, sessions: 0 };
  for (const version of pinned) {
    const done = yield* upgradeVersion(version, failures).pipe(
      Effect.provideService(
        Transaction,
        Transaction.of({ ...outer, teamId: version.teamId }),
      ),
    );
    counts.versions += done.migrated ? 1 : 0;
    counts.waves += done.waves;
    counts.sessions += done.sessions;
  }
  yield* client.unsafe('RESET ROLE');
  yield* client.unsafe(
    'ALTER TABLE interview_sessions ENABLE TRIGGER interview_sessions_writable',
  );

  if (failures.length > 0) {
    return yield* new PinnedUpgradeFailed({ failures });
  }
  return counts;
});
