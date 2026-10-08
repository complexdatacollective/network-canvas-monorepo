import { Effect, Exit, Redacted, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { noAuditMaintenanceTransaction } from '../../audit/no-audit.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { MaintenanceScope, Transaction } from '../../db/tenant.ts';
import type { ObjectStore } from '../../storage/object-store.ts';
import { exitSqlState, INSUFFICIENT_PRIVILEGE } from '../errors.ts';
import { maintenanceTeamAccess } from '../team-access.ts';
import type { HandledJob, JobOutcome } from '../worker.ts';
import { gcStagedResources } from './staged-resources-gc.ts';

export type GcResult = {
  manifestsDeleted: number;
  sectionsDeleted: number;
  commandLogDeleted: number;
};

export class GcRoleError extends Schema.TaggedError<GcRoleError>()(
  'GcRoleError',
  { role: Schema.String },
) {
  override get message(): string {
    return `garbage collection must run as ${TENANT_ROLES.maintenance}, not ${this.role}`;
  }
}

export class GcBoundsError extends Schema.TaggedError<GcBoundsError>()(
  'GcBoundsError',
  { bound: Schema.String, requirement: Schema.String },
) {
  override get message(): string {
    return `${this.bound} must be ${this.requirement}`;
  }
}

export type GcOptions = {
  retainManifestsPerDraft: number;
  sectionGraceMs: number;
  commandRetryHorizonMs: number;
};

/** The section grace must exceed the daily backup interval (#1901), or a restore can name a section no backup captured. */
export const PROTOCOL_STORE_GC_BOUNDS: GcOptions = {
  retainManifestsPerDraft: 1000,
  sectionGraceMs: 259_200_000,
  commandRetryHorizonMs: 86_400_000,
};

const assertNonNegativeFinite = (
  bound: string,
  value: number,
): Effect.Effect<void, GcBoundsError> =>
  Number.isFinite(value) && value >= 0
    ? Effect.void
    : Effect.fail(
        new GcBoundsError({
          bound,
          requirement: 'a non-negative finite number',
        }),
      );

const REFERENCED = `EXISTS (
      SELECT 1 FROM version_sections vs
      WHERE vs.team_id = s.team_id AND vs.section_hash = s.hash
    )
    OR EXISTS (
      SELECT 1 FROM template_version_sections tvs
      WHERE tvs.team_id = s.team_id AND tvs.section_hash = s.hash
    )
    OR EXISTS (
      SELECT 1 FROM manifests m
      CROSS JOIN LATERAL jsonb_each_text(m.section_hashes) kv
      WHERE m.team_id = s.team_id AND kv.value = s.hash
    )`;

export const gcProtocolStore = Effect.fn('protocol.gcProtocolStore')(function* (
  opts: GcOptions,
): Effect.fn.Return<
  GcResult,
  GcBoundsError | GcRoleError | SqlError.SqlError,
  MaintenanceDatabase
> {
  const { retainManifestsPerDraft, sectionGraceMs, commandRetryHorizonMs } =
    opts;
  if (
    !Number.isInteger(retainManifestsPerDraft) ||
    retainManifestsPerDraft < 0
  ) {
    return yield* new GcBoundsError({
      bound: 'retainManifestsPerDraft',
      requirement: 'a non-negative integer',
    });
  }
  yield* assertNonNegativeFinite('sectionGraceMs', sectionGraceMs);
  if (sectionGraceMs === 0) {
    return yield* new GcBoundsError({
      bound: 'sectionGraceMs',
      requirement: 'greater than zero',
    });
  }
  yield* assertNonNegativeFinite(
    'commandRetryHorizonMs',
    commandRetryHorizonMs,
  );

  // A login that may not assume the role is refused at connect with `42501`,
  // before any statement runs, so that failure is caught here.
  const identity = yield* Effect.exit(
    MaintenanceDatabase.use(
      ({ sql }) => sql<{ role: string }>`SELECT current_user AS role`,
    ),
  );
  if (Exit.isFailure(identity)) {
    if (exitSqlState(identity) !== INSUFFICIENT_PRIVILEGE) {
      return yield* Effect.failCause(identity.cause);
    }
    const login = yield* MaintenanceDatabase.use(({ sql }) =>
      Effect.succeed(
        sql.config.username ??
          (sql.config.url === undefined
            ? ''
            : decodeURIComponent(
                new URL(Redacted.value(sql.config.url)).username,
              )),
      ),
    );
    return yield* new GcRoleError({ role: login });
  }
  const role = identity.value[0]?.role ?? '';
  if (role !== TENANT_ROLES.maintenance) {
    return yield* new GcRoleError({ role });
  }

  const result: GcResult = {
    manifestsDeleted: 0,
    sectionsDeleted: 0,
    commandLogDeleted: 0,
  };

  // Deliberately cross-team; RLS admits this scan only to the maintenance role.
  // Enumerated from the swept tables, not `teams`: team_id has no foreign key into it.
  const tenants = yield* MaintenanceScope.open(
    Effect.flatMap(
      Transaction,
      ({ sql }) => sql<{ teamId: string }>`
          SELECT team_id AS "teamId" FROM drafts
           UNION
          SELECT team_id AS "teamId" FROM sections
           ORDER BY "teamId"`,
    ),
  );

  for (const { teamId } of tenants) {
    const drafts = yield* MaintenanceScope.openTenant(
      maintenanceTeamAccess(teamId),
      Effect.flatMap(
        Transaction,
        ({ sql }) => sql<{ id: string }>`
            SELECT id FROM drafts WHERE team_id = ${teamId} ORDER BY id`,
      ),
    );

    for (const { id: draftId } of drafts) {
      yield* noAuditMaintenanceTransaction(
        'protocol.gcDraftHistory',
        maintenanceTeamAccess(teamId),
        Effect.gen(function* () {
          const { sql } = yield* Transaction;
          const head = yield* sql<{ headSeq: string }>`
              SELECT head_seq::text AS "headSeq"
                FROM drafts
               WHERE id = ${draftId} AND team_id = ${teamId}
                 FOR UPDATE`;
          const headRow = head[0];
          if (headRow === undefined) return;
          const oldest = String(
            BigInt(headRow.headSeq) - BigInt(retainManifestsPerDraft),
          );

          const commandLog = yield* sql<{ deleted: number }>`
              DELETE FROM command_log cl
               WHERE cl.draft_id = ${draftId}
                 AND cl.team_id = ${teamId}
                 AND cl.manifest_seq < ${oldest}::bigint
                 AND cl.created_at < now() - make_interval(
                   secs => ${commandRetryHorizonMs}::float / 1000)
                 AND NOT EXISTS (
                   SELECT 1 FROM leases l
                   WHERE l.draft_id = cl.draft_id
                     AND l.team_id = cl.team_id
                     AND l.section_id = cl.section_id
                     AND l.owner = cl.owner
                     AND l.epoch = cl.epoch
                     AND l.expires_at > clock_timestamp()
                 )
              RETURNING 1 AS deleted`;
          const manifests = yield* sql<{ deleted: number }>`
              DELETE FROM manifests m
               WHERE m.draft_id = ${draftId}
                 AND m.team_id = ${teamId}
                 AND m.seq < ${oldest}::bigint
                 AND NOT EXISTS (
                   SELECT 1 FROM command_log cl
                   WHERE cl.draft_id = m.draft_id
                     AND cl.team_id = m.team_id
                     AND cl.manifest_seq = m.seq
                 )
              RETURNING 1 AS deleted`;
          result.commandLogDeleted += commandLog.length;
          result.manifestsDeleted += manifests.length;
        }),
      );
    }

    yield* noAuditMaintenanceTransaction(
      'protocol.gcReconcileReferencedSections',
      maintenanceTeamAccess(teamId),
      Effect.flatMap(
        Transaction,
        ({ sql }) => sql`
            UPDATE sections s SET unreferenced_at = NULL
             WHERE s.team_id = ${teamId} AND s.unreferenced_at IS NOT NULL
               AND (${sql.literal(REFERENCED)})`,
      ),
    );
    yield* noAuditMaintenanceTransaction(
      'protocol.gcMarkUnreferencedSections',
      maintenanceTeamAccess(teamId),
      Effect.flatMap(
        Transaction,
        ({ sql }) => sql`
            UPDATE sections s SET unreferenced_at = clock_timestamp()
             WHERE s.team_id = ${teamId} AND s.unreferenced_at IS NULL
               AND NOT (${sql.literal(REFERENCED)})`,
      ),
    );
    const sections = yield* noAuditMaintenanceTransaction(
      'protocol.gcDeleteUnreferencedSections',
      maintenanceTeamAccess(teamId),
      Effect.flatMap(
        Transaction,
        ({ sql }) => sql<{ deleted: number }>`
            DELETE FROM sections s
             WHERE s.team_id = ${teamId}
               AND s.unreferenced_at < now() - make_interval(
                 secs => ${sectionGraceMs}::float / 1000)
               AND NOT (${sql.literal(REFERENCED)})
            RETURNING 1 AS deleted`,
      ),
    );
    result.sectionsDeleted += sections.length;
  }

  return result;
});

export const protocolStoreGc = Effect.fn('job.protocol-store-gc')(function* (
  job: HandledJob<'protocol-store-gc'>,
): Effect.fn.Return<
  JobOutcome,
  GcBoundsError | GcRoleError | SqlError.SqlError,
  MaintenanceDatabase | ObjectStore
> {
  const swept = yield* Effect.exit(gcProtocolStore(PROTOCOL_STORE_GC_BOUNDS));
  if (Exit.isSuccess(swept)) {
    yield* Effect.logInfo(
      `protocol-store-gc ${job.id}: manifests ${swept.value.manifestsDeleted}, sections ${swept.value.sectionsDeleted}, command log ${swept.value.commandLogDeleted}`,
    );
  }
  // After the sweep, whether or not it succeeded, and apart from it: an
  // unreachable object store must not cost the protocol store its collection,
  // nor the reverse. A failed sweep still fails the job, once this has run.
  yield* gcStagedResources().pipe(
    Effect.tap((staged) =>
      Effect.logInfo(
        `protocol-store-gc ${job.id}: staged rows ${staged.stagedRowsDeleted}, staged objects ${staged.stagedObjectsDeleted}, connections ${staged.connectionsDeleted}`,
      ),
    ),
    Effect.catchCause((cause) =>
      Effect.logError('Collecting staged resources failed', cause),
    ),
  );
  if (Exit.isFailure(swept)) return yield* Effect.failCause(swept.cause);
  return 'completed';
});
