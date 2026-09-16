import { Effect, Exit, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import {
  Database,
  Transaction,
  withTenantTransaction,
  withTransaction,
} from '../database.ts';
import { exitSqlState, INSUFFICIENT_PRIVILEGE } from '../errors.ts';
import type { HandledJob, JobOutcome } from '../worker.ts';

// The protocol store's hourly sweep, and the whole of the handler that runs it
// (#1895). `src/protocol/gc.ts` and `src/jobs/handlers/protocol-store-gc.ts`
// are the two halves this file joins: the sweep is nine statements of
// node-postgres over a maintenance pool and a `createTenantDb` per tenant,
// which become `sql` over `withTransaction` and `withTenantTransaction` on the
// maintenance `Database`.
//
// What the port did not change: which rows are eligible. Every predicate below
// is the one `gc.ts` runs, text for text — the `referenced` expression above
// all, which three statements share.
//
// What the port did change, and had to:
//
//  - `rowCount` has no equivalent: rc.115 hands back the rows a statement
//    returned, so each counted statement carries a `RETURNING` and the count
//    is that array's length.
//  - `runNoAuditTenantTransaction`'s policy lookup is gone with the audit
//    trigger it guarded; the operation names it passed are kept as the
//    comments they effectively were. Stage 4's `audited` seam is where a
//    tenant transaction becomes audited again, and these four stay outside it
//    for the same reason they are on the no-audit list today: a sweep is not
//    anybody's action.
//  - The role assertion reads `current_user` inside a transaction rather than
//    off the pool, and is a weaker check for it. What it still catches and
//    what it no longer catches are spelled out above the assertion itself.

export type GcResult = {
  manifestsDeleted: number;
  sectionsDeleted: number;
  commandLogDeleted: number;
};

/**
 * The sweep is not running as the maintenance role: either the `Database` it
 * was given carries another identity, or its login may not assume the role.
 * Under any other role the tenant enumeration below sees nothing, so the run
 * would report a clean sweep without having visited anyone.
 */
export class GcRoleError extends Schema.TaggedError<GcRoleError>()(
  'GcRoleError',
  { role: Schema.String },
) {
  override get message(): string {
    return `garbage collection must run as ${TENANT_ROLES.maintenance}, not ${this.role}`;
  }
}

/**
 * A bound that would widen deletion rather than narrow it. A typed failure
 * rather than a defect because it is what a misconfigured caller gets, and the
 * bound's name is the whole of the diagnosis.
 */
export class GcBoundsError extends Schema.TaggedError<GcBoundsError>()(
  'GcBoundsError',
  { bound: Schema.String, requirement: Schema.String },
) {
  override get message(): string {
    return `${this.bound} must be ${this.requirement}`;
  }
}

export type GcOptions = {
  /** Manifests kept per draft below the head. */
  retainManifestsPerDraft: number;
  /** Minimum age before an unreferenced section document is swept. */
  sectionGraceMs: number;
  /** How long a client may still retransmit a lost-acknowledgement commit. */
  commandRetryHorizonMs: number;
};

/**
 * What the deployment's sweep keeps. These are the production bounds rather
 * than a caller's choice, because the sweep is not addressed at anything — the
 * cron sends an empty payload and every tenant is visited the same way — so a
 * bound that varied by job would only ever be a way to get them wrong.
 *
 * A thousand manifests per draft is far more history than a researcher can
 * reach through the editor and small enough that a long-lived draft does not
 * grow without bound.
 *
 * The two windows answer different questions and are deliberately different
 * lengths. A command-log row survives a day because that is how long a client
 * whose acknowledgement was lost has to retransmit and find its recorded
 * result; nothing but that client reads it.
 *
 * A section's grace is three days because a deleted section is not only a
 * live client's problem: backups are taken daily (#1901), so a window shorter
 * than the backup interval can delete bytes that no backup ever captured, and
 * a restore then produces a manifest naming a section that exists nowhere. It
 * has to exceed the interval, not merely match it — a backup that runs late,
 * or a sweep that runs just before one, would otherwise close the gap — so
 * three days for a daily backup (#1909).
 */
export const PROTOCOL_STORE_GC_BOUNDS: GcOptions = {
  retainManifestsPerDraft: 1000,
  sectionGraceMs: 259_200_000,
  commandRetryHorizonMs: 86_400_000,
};

// A negative or non-finite bound would move a cutoff into the future, widening
// deletion to everything eligible regardless of age.
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

// Version-pinned sections are FK-protected regardless; these predicates only
// decide what is eligible. A command-log row survives while its (owner, epoch)
// lease is live and until the retry horizon passes, because a retransmitted
// client_seq must keep finding its recorded result — as must the manifest that
// result names.
//
// A section is referenced by any published protocol version, any draft
// manifest, or any published template version. Template pins are immutable
// like version pins, so a section only a template holds would otherwise
// be swept into their foreign key and abort the tenant's whole pass — on
// every pass thereafter.
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
  Database
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

  // What this verifies and what it cannot. `withTransaction` pins the identity
  // with `set local role` as its first statement (database.ts), so
  // `current_user` here reads back the label this module wrote one statement
  // earlier. That refuses a worker built on `Database.layer('app', …)` — the
  // misconfiguration the check exists for — but it cannot tell one maintenance
  // `Database` from another: a maintenance identity over the wrong login still
  // passes, because `set local role` succeeds for any login that is a member
  // of `studio_maintenance`, which rls.ts grants to the connecting login WITH
  // SET TRUE. The original asserted against a role a startup parameter had
  // negotiated (src/db/pool.ts), which no calling code could set; rc.116 adds
  // `startupParameters` to @effect/sql-pg, and when it lands this statement
  // moves back onto a bare connection, outside a transaction, and asserts that
  // property again.
  //
  // A login that may *not* assume the role fails one statement earlier, inside
  // the pin, so that failure is caught here and given the same diagnosis
  // rather than an opaque `SqlError`: `42501` out of this transaction can only
  // have come from `set local role`, since nothing else it runs — BEGIN, the
  // search-path pin, `SELECT current_user` — needs a privilege at all.
  const identity = yield* Effect.exit(
    withTransaction(
      Effect.flatMap(
        Transaction,
        ({ sql }) => sql<{ role: string }>`SELECT current_user AS role`,
      ),
    ),
  );
  if (Exit.isFailure(identity)) {
    if (exitSqlState(identity) !== INSUFFICIENT_PRIVILEGE) {
      return yield* Effect.failCause(identity.cause);
    }
    // Outside a transaction, where the absent `set local role` is the point:
    // this answers with the connecting login, which is the identity that could
    // not become the maintenance role and so the one to name.
    const login = yield* Database.use(
      ({ sql }) => sql<{ role: string }>`SELECT current_user AS role`,
    ).pipe(Effect.catch(() => Effect.succeed([])));
    return yield* new GcRoleError({ role: login[0]?.role ?? '' });
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

  // The one deliberately cross-team read: maintenance visits every tenant.
  // Enumerated from the swept tables rather than from `teams`, because
  // team_id carries no foreign key into it (studio-sync/src/schema.ts): a
  // tenant whose team row never existed or has since been deleted still owns
  // collectable rows, and driving the loop from `teams` would strand them
  // forever. Not a membership lookup, so the AuthService seam stays intact.
  // The row-level security policies admit this scan only to the maintenance
  // role checked above (studio-sync/src/rls.ts).
  const tenants = yield* withTransaction(
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
    const drafts = yield* withTenantTransaction(
      teamId,
      Effect.flatMap(
        Transaction,
        ({ sql }) => sql<{ id: string }>`
            SELECT id FROM drafts WHERE team_id = ${teamId} ORDER BY id`,
      ),
    );

    for (const { id: draftId } of drafts) {
      // protocol.gcDraftHistory: no audit event — a sweep is nobody's action.
      yield* withTenantTransaction(
        teamId,
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

    // protocol.gcReconcileReferencedSections: likewise unaudited.
    yield* withTenantTransaction(
      teamId,
      Effect.flatMap(
        Transaction,
        ({ sql }) => sql`
            UPDATE sections s SET unreferenced_at = NULL
             WHERE s.team_id = ${teamId} AND s.unreferenced_at IS NOT NULL
               AND (${sql.literal(REFERENCED)})`,
      ),
    );
    // protocol.gcMarkUnreferencedSections.
    yield* withTenantTransaction(
      teamId,
      Effect.flatMap(
        Transaction,
        ({ sql }) => sql`
            UPDATE sections s SET unreferenced_at = clock_timestamp()
             WHERE s.team_id = ${teamId} AND s.unreferenced_at IS NULL
               AND NOT (${sql.literal(REFERENCED)})`,
      ),
    );
    // protocol.gcDeleteUnreferencedSections.
    const sections = yield* withTenantTransaction(
      teamId,
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

/**
 * The job. The sweep itself has existed since #1247 and has never run in a
 * deployment: there was nothing to run it. This is that something, and the
 * whole of the handler is calling it and saying what it collected.
 *
 * The queue retries nothing (`retryLimit: 0`): the sweep is idempotent and the
 * next hour picks up whatever this pass left, which is a better answer than
 * retrying a pass that failed halfway through a tenant. So a failure here is
 * the end of the job, and `drainOnce`'s `failed` line is the only notice a
 * deployment gets that an hour was lost.
 */
export const protocolStoreGc = Effect.fn('job.protocol-store-gc')(function* (
  job: HandledJob<'protocol-store-gc'>,
): Effect.fn.Return<
  JobOutcome,
  GcBoundsError | GcRoleError | SqlError.SqlError,
  Database
> {
  const swept = yield* gcProtocolStore(PROTOCOL_STORE_GC_BOUNDS);
  // The counts are the only evidence a deployment has that the sweep is
  // keeping up; a pass that collects nothing and one that collects thousands
  // are both normal, and only the series tells them apart.
  yield* Effect.logInfo(
    `protocol-store-gc ${job.id}: manifests ${swept.manifestsDeleted}, sections ${swept.sectionsDeleted}, command log ${swept.commandLogDeleted}`,
  );
  return 'completed';
});
