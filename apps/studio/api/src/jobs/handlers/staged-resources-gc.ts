// Collects what protocol-builder tabs staged and never promoted or discarded:
// the rows of a tab no replica has heard from for the idle bound, staged
// objects no row names, and connection rows long expired.
//
// A tab that leaves cleanly releases its own staging (resources.ts); this is
// for the tab whose replica died with it, and for the object a stage wrote
// before failing to record it. Each row goes first, in the statement that asks
// whether it is abandoned, so a tab that came back keeps its row and its
// object together; the object is deleted after. One the store would not delete
// is unnamed from then on, and a later run's orphan sweep takes it.
import { and, asc, eq, gt, lt, notExists, sql } from 'drizzle-orm';
import { Clock, Effect, Option, Stream } from 'effect';

import { noAuditMaintenanceTransaction } from '../../audit/no-audit.ts';
import { MaintenanceScope, Transaction } from '../../db/tenant.ts';
import {
  IDLE_MS,
  PROTOCOL_BUILDER_TABLES,
} from '../../protocol-builder/schema.ts';
import {
  ObjectStore,
  removeStaged,
  STAGING_ROOT,
  StagingKey,
} from '../../storage/object-store.ts';
import { maintenanceTeamAccess } from '../team-access.ts';

const { protocolStagedResources: staged, protocolConnections: connections } =
  PROTOCOL_BUILDER_TABLES;

/**
 * How long an unnamed staged object is left alone: a stage writes its object
 * before the row naming it, so a younger one may be a stage still running.
 */
export const STAGED_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/** Far past any reconnect grace that reads an expired connection row. */
export const CONNECTION_RETENTION_MS = 60 * 60 * 1000;

const STAGED_BATCH = 1000;

type Tx = Transaction['Service']['tx'];

const before = (ms: number) =>
  sql`clock_timestamp() - make_interval(secs => ${ms}::float8 / 1000)`;

/** Staged before the idle bound, by a tab no replica has heard from since. */
const abandoned = (tx: Tx) =>
  and(
    lt(staged.createdAt, before(IDLE_MS)),
    notExists(
      tx
        .select({ connectionId: connections.connectionId })
        .from(connections)
        .where(
          and(
            eq(connections.teamId, staged.teamId),
            eq(connections.draftId, staged.draftId),
            eq(connections.owner, staged.owner),
            gt(connections.expiresAt, before(IDLE_MS)),
          ),
        ),
    ),
  );

type StagedGcResult = {
  stagedRowsDeleted: number;
  stagedObjectsDeleted: number;
  connectionsDeleted: number;
};

const teamOf = (key: StagingKey) =>
  key.slice(STAGING_ROOT.length).split('/')[0] ?? '';

/**
 * Logs a failure as one team's, so the work after it still runs and the next
 * run asks again.
 */
const contained =
  (message: string, teamId: string) =>
  <E, R>(effect: Effect.Effect<void, E, R>) =>
    effect.pipe(
      Effect.catchCause((cause) =>
        Effect.logError(message, cause).pipe(Effect.annotateLogs({ teamId })),
      ),
    );

export const gcStagedResources = Effect.fn('protocol.gcStagedResources')(
  function* () {
    const store = yield* ObjectStore;
    const result: StagedGcResult = {
      stagedRowsDeleted: 0,
      stagedObjectsDeleted: 0,
      connectionsDeleted: 0,
    };

    // Deliberately cross-team; RLS admits this scan only to the maintenance
    // role. A team whose only trace is an unnamed object is found by the
    // orphan sweep, by its key.
    const teams = yield* MaintenanceScope.open(
      Effect.gen(function* () {
        const { tx } = yield* Transaction;
        const withStaging = yield* tx
          .selectDistinct({ teamId: staged.teamId })
          .from(staged);
        const withConnections = yield* tx
          .selectDistinct({ teamId: connections.teamId })
          .from(connections);
        return [
          ...new Set(
            [...withStaging, ...withConnections].map((row) => row.teamId),
          ),
        ].toSorted();
      }),
    );

    /** Keys a delete was already asked for this run, by a row or the sweep. */
    const asked = new Set<string>();
    const remove = Effect.fnUntraced(function* (key: StagingKey) {
      asked.add(key);
      if (yield* removeStaged(store, key, 'collect')) {
        result.stagedObjectsDeleted += 1;
      }
    });

    const collectRows = Effect.fnUntraced(function* (teamId: string) {
      const access = maintenanceTeamAccess(teamId);

      // Each batch locks its rows in key order, as a promotion's consume
      // does, before deleting them.
      for (;;) {
        const deleted = yield* noAuditMaintenanceTransaction(
          'protocol.gcStagedResources',
          access,
          Effect.flatMap(Transaction, ({ tx }) => {
            const batch = tx
              .select({
                draftId: staged.draftId,
                owner: staged.owner,
                editId: staged.editId,
                resourceId: staged.resourceId,
              })
              .from(staged)
              .where(and(eq(staged.teamId, teamId), abandoned(tx)))
              .orderBy(
                asc(staged.draftId),
                asc(staged.owner),
                asc(staged.editId),
                asc(staged.resourceId),
              )
              .limit(STAGED_BATCH)
              .for('update');
            return tx
              .delete(staged)
              .where(
                and(
                  eq(staged.teamId, teamId),
                  sql`(${staged.draftId}, ${staged.owner}, ${staged.editId}, ${staged.resourceId}) IN ${batch}`,
                ),
              )
              .returning({ objectKey: staged.objectKey });
          }),
        );
        result.stagedRowsDeleted += deleted.length;
        if (store.configured) {
          for (const { objectKey } of deleted) {
            const key =
              objectKey === null ? Option.none() : StagingKey.option(objectKey);
            if (Option.isSome(key)) yield* remove(key.value);
          }
        }
        if (deleted.length < STAGED_BATCH) break;
      }
    });

    const collectConnections = Effect.fnUntraced(function* (teamId: string) {
      const expired = yield* noAuditMaintenanceTransaction(
        'protocol.gcProtocolConnections',
        maintenanceTeamAccess(teamId),
        Effect.flatMap(Transaction, ({ tx }) =>
          tx
            .delete(connections)
            .where(
              and(
                eq(connections.teamId, teamId),
                lt(connections.expiresAt, before(CONNECTION_RETENTION_MS)),
              ),
            )
            .returning({ connectionId: connections.connectionId }),
        ),
      );
      result.connectionsDeleted += expired.length;
    });

    /** Deletes the keys, all one team's, that no staged row names. */
    const sweepUnnamed = Effect.fnUntraced(function* (
      teamId: string,
      keys: ReadonlyArray<StagingKey>,
    ) {
      const named = yield* noAuditMaintenanceTransaction(
        'protocol.gcStagedResources',
        maintenanceTeamAccess(teamId),
        Effect.flatMap(Transaction, ({ tx }) =>
          tx
            .select({ objectKey: staged.objectKey })
            .from(staged)
            .where(
              and(
                eq(staged.teamId, teamId),
                sql`${staged.objectKey} = ANY(${sql.param(keys)}::text[])`,
              ),
            ),
        ),
      );
      const kept = new Set(named.map((row) => row.objectKey));
      for (const key of keys) {
        if (!kept.has(key)) yield* remove(key);
      }
    });

    for (const teamId of teams) {
      yield* collectRows(teamId).pipe(
        contained('Collecting a team’s staged resources failed', teamId),
      );
      yield* collectConnections(teamId).pipe(
        contained('Collecting a team’s expired connections failed', teamId),
      );
    }

    if (!store.configured) return result;

    // The whole staging area rather than each team's prefix, so the objects
    // of a team with no rows left are still found; a page at a time, so the
    // listing is never held in memory whole.
    const now = yield* Clock.currentTimeMillis;
    yield* store
      .listStaged(STAGING_ROOT, new Date(now - STAGED_ORPHAN_GRACE_MS))
      .pipe(
        Stream.runForEach(
          Effect.fnUntraced(function* (page) {
            const byTeam = Map.groupBy(
              page.filter((key) => !asked.has(key)),
              teamOf,
            );
            for (const [teamId, keys] of byTeam) {
              yield* sweepUnnamed(teamId, keys).pipe(
                contained(
                  'Sweeping a team’s unnamed staged objects failed',
                  teamId,
                ),
              );
            }
          }),
        ),
        // A store that will not list leaves its unnamed objects to a later run.
        Effect.catch((error) =>
          Effect.logWarning('Listing staged objects failed', error),
        ),
      );

    return result;
  },
);
