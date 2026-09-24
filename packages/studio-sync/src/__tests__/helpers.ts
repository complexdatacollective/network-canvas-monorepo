import { randomUUID } from 'node:crypto';

import { PgClient } from '@effect/sql-pg';
import {
  generateDrizzleJson,
  generateMigration,
} from 'drizzle-kit/api-postgres';
import {
  DefaultServices,
  make as makeDrizzle,
} from 'drizzle-orm/effect-postgres';
import { Context, Effect, Layer, ManagedRuntime, Redacted } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import pg from 'pg';

import type { SectionDoc } from '../apply.ts';
import { TEAM_GUC, TENANT_ROLES } from '../rls.ts';
import { SYNC_SIDECAR_SQL, SYNC_TABLES } from '../schema.ts';
import {
  type CommitParams,
  type CommitResult,
  forceExpire,
  type Lease,
  makeSyncServer,
  type ManifestChainEntry,
  type ResumeResult,
  type SectionValidator,
} from '../server.ts';
import { Transaction } from '../tenant.ts';
import { CI, PGPORT } from './test-env.ts';

export const TEST_TEAM_ID = 'team-test';

/** The isolation levels a test scope may ask Postgres for. */
export type TestIsolation = 'repeatable read' | 'serializable';

/**
 * Runs an effect inside ONE team-stamped transaction — the studio-sync half of
 * what `TenantScope.open` does in `apps/studio/server`, which this package
 * cannot import because that app depends on it. Same order for the same
 * reason: the role first, then the team, so no statement in the body runs
 * unpinned or unstamped.
 */
export type RunTenant = <A, E>(
  body: Effect.Effect<A, E, Transaction>,
  options?: {
    readonly isolation?: TestIsolation;
    /** `null` opens a scope that stamps no team, as a maintenance one does. */
    readonly teamId?: string | null;
  },
) => Promise<A>;

type SyncDbShape = {
  readonly sql: PgClient.PgClient;
  readonly db: Effect.Success<ReturnType<typeof makeDrizzle>>;
};

class SyncDb extends Context.Service<SyncDb, SyncDbShape>()(
  '@studio-sync/test/SyncDb',
) {}

const layerSyncDb = (url: string): Layer.Layer<SyncDb> =>
  Layer.effect(
    SyncDb,
    Effect.gen(function* () {
      const sql = yield* PgClient.make({
        url: Redacted.make(url),
        maxConnections: 20,
        applicationName: 'studio-sync-test',
      });
      const db = yield* makeDrizzle().pipe(
        Effect.provideService(PgClient.PgClient, sql),
        Effect.provide(DefaultServices),
      );
      return { sql, db };
    }),
  ).pipe(Layer.provide(Reactivity.layer), Layer.orDie);

/**
 * The promise-shaped facade the suites drive the server through.
 *
 * Every method opens its own team-stamped transaction, which is exactly the
 * boundary the node-postgres executor gave each operation before the
 * conversion — so the scenarios below still read as "the client makes a call".
 * `resume` opens its at `repeatable read`, because its two reads must come
 * from one snapshot; `transaction.test.ts` drives the Effect-native path,
 * where several operations share one.
 */
export type SyncFacade = {
  createDraft(
    draftId: string,
    sections: Record<string, SectionDoc>,
  ): Promise<Record<string, string>>;
  acquire(
    draftId: string,
    sectionId: string,
    owner: string,
  ): Promise<Lease | null>;
  takeover(
    draftId: string,
    sectionId: string,
    owner: string,
  ): Promise<Lease | null>;
  renew(
    draftId: string,
    sectionId: string,
    owner: string,
    epoch: bigint,
  ): Promise<Lease | null>;
  release(
    draftId: string,
    sectionId: string,
    owner: string,
    epoch: bigint,
  ): Promise<void>;
  commit(params: CommitParams): Promise<CommitResult>;
  resume(draftId: string, owner: string): Promise<ResumeResult>;
  getSection(hash: string): Promise<SectionDoc>;
  manifestChain(draftId: string): Promise<ManifestChainEntry[]>;
};

export function makeSyncFacade(
  run: RunTenant,
  options?: {
    readonly ttlMs?: number;
    readonly validateSection?: SectionValidator;
  },
): SyncFacade {
  const server = makeSyncServer({
    ttlMs: options?.ttlMs,
    validateSection: options?.validateSection,
  });
  return {
    createDraft: (draftId, sections) =>
      run(server.createDraft(draftId, sections)),
    acquire: (draftId, sectionId, owner) =>
      run(server.acquire(draftId, sectionId, owner)),
    takeover: (draftId, sectionId, owner) =>
      run(server.takeover(draftId, sectionId, owner)),
    renew: (draftId, sectionId, owner, epoch) =>
      run(server.renew(draftId, sectionId, owner, epoch)),
    release: (draftId, sectionId, owner, epoch) =>
      run(Effect.asVoid(server.release(draftId, sectionId, owner, epoch))),
    commit: (params) => run(server.commit(params)),
    resume: (draftId, owner) =>
      run(server.resume(draftId, owner), { isolation: 'repeatable read' }),
    getSection: (hash) => run(server.getSection(hash)),
    manifestChain: (draftId) => run(server.manifestChain(draftId)),
  };
}

export function expireLease(
  run: RunTenant,
  draftId: string,
  sectionId: string,
): Promise<void> {
  return run(Effect.asVoid(forceExpire(draftId, sectionId)));
}

export type SyncDatabase = {
  /** The superuser: provisioning, fixtures, and cross-team oracles. */
  db: pg.Pool;
  /** Pinned to the application role, so RLS is enforced on it. */
  app: pg.Pool;
  /** Pinned to the maintenance role the policies let across every team. */
  maintenance: pg.Pool;
  dispose: () => Promise<void>;
};

/**
 * A scratch database carrying the sync schema. Connects as the postgres
 * superuser to a disposable instance — never point it at a real one. It lives
 * here rather than beside the schema because ../schema.ts is on the Studio
 * server's production boot path.
 */
async function createSyncDatabase(
  port: number,
  name: string,
): Promise<SyncDatabase> {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`unsafe scratch database name: ${name}`);
  }
  const admin = new pg.Client({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password: 'spike',
    database: 'postgres',
  });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const connect = (role?: string) =>
    new pg.Pool({
      host: '127.0.0.1',
      port,
      user: 'postgres',
      password: 'spike',
      database: name,
      max: 20,
      ...(role === undefined ? {} : { options: `-c role=${role}` }),
    });
  const db = connect();
  const statements = await generateMigration(
    await generateDrizzleJson({}),
    await generateDrizzleJson(SYNC_TABLES),
  );
  await db.query([...statements, SYNC_SIDECAR_SQL].join('\n'));
  const app = connect(TENANT_ROLES.app);
  const maintenance = connect(TENANT_ROLES.maintenance);
  return {
    db,
    app,
    maintenance,
    dispose: async () => {
      await Promise.all([app.end(), maintenance.end(), db.end()]);
    },
  };
}

/**
 * Whether a Postgres is reachable for the DB-backed conformance suites. The
 * pure suites (apply-engine properties, golden canonicalization) always run;
 * everything touching real transactions skips without one.
 */
export const dbAvailable = await (async () => {
  const probe = new pg.Client({
    host: '127.0.0.1',
    port: PGPORT,
    user: 'postgres',
    password: 'spike',
    database: 'postgres',
    connectionTimeoutMillis: 1_500,
  });
  try {
    await probe.connect();
    await probe.end();
    return true;
  } catch (err) {
    if (CI) {
      throw new Error(
        `the sync conformance suites cannot run: 127.0.0.1:${PGPORT} is unreachable (${String(err)})`,
        { cause: err },
      );
    }
    console.warn(
      `[studio-sync] Postgres not reachable on 127.0.0.1:${PGPORT} — skipping the DB-backed conformance suites. ` +
        `Start one with: docker run -d -e POSTGRES_PASSWORD=spike -p ${PGPORT}:5432 postgres:18`,
    );
    return false;
  }
})();

export type SyncHarness = {
  db: pg.Pool;
  app: pg.Pool;
  maintenance: pg.Pool;
  /** Opens one team-stamped transaction and runs the effect inside it. */
  run: RunTenant;
  server: SyncFacade;
  dispose: () => Promise<void>;
};

/** The server under test runs as the application role, as it does in Studio. */
export async function makeServer(
  dbName: string,
  ttlMs?: number,
): Promise<SyncHarness> {
  const { db, app, maintenance, dispose } = await createSyncDatabase(
    PGPORT,
    dbName,
  );
  const url = `postgres://postgres:spike@127.0.0.1:${PGPORT}/${dbName}`;
  const runtime = ManagedRuntime.make(layerSyncDb(url));

  const run: RunTenant = (body, options) =>
    runtime.runPromise(
      SyncDb.use(({ sql, db: drizzle }) => {
        const teamId =
          options?.teamId === undefined ? TEST_TEAM_ID : options.teamId;
        return drizzle.transaction(
          (tx) =>
            Effect.provideService(
              Effect.gen(function* () {
                yield* sql.unsafe(`set local role ${TENANT_ROLES.app}`);
                if (teamId !== null) {
                  yield* sql`select set_config(${TEAM_GUC}, ${teamId}, true)`;
                }
                return yield* body;
              }),
              Transaction,
              Transaction.of({ tx, sql, teamId }),
            ),
          options?.isolation === undefined
            ? undefined
            : { isolationLevel: options.isolation },
        );
      }),
    );

  return {
    db,
    app,
    maintenance,
    run,
    server: makeSyncFacade(run, ttlMs === undefined ? {} : { ttlMs }),
    dispose: async () => {
      await runtime.dispose();
      await dispose();
    },
  };
}

export const DEFAULT_SECTIONS: Record<string, SectionDoc> = {
  'stage-1': { type: 'NameGenerator', label: 'People', prompts: [] },
  'stage-2': { type: 'Sociogram', label: 'Support', prompts: [] },
  'codebook-person': { name: 'Person', variables: {} },
};

export async function makeDraft(
  server: SyncFacade,
  sections: Record<string, SectionDoc> = DEFAULT_SECTIONS,
) {
  const draftId = randomUUID();
  await server.createDraft(draftId, sections);
  return draftId;
}

/**
 * Wait until some backend in this database is blocked on a lock — the signal
 * that a transaction under test has reached its `FOR UPDATE` and is queueing
 * behind another one. Takes the superuser pool: pg_stat_activity hides other
 * sessions' wait state from a session running as a different role.
 */
export async function waitForLockWait(db: pg.Pool): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const res = await db.query(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if ((res.rows[0] as { waiting: number }).waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('no backend ever blocked on a lock');
}

export async function assertLinearChain(
  server: SyncFacade,
  draftId: string,
): Promise<number> {
  const chain = await server.manifestChain(draftId);
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    if (entry === undefined) throw new Error('sparse chain');
    if (Number(entry.seq) !== i) {
      throw new Error(`non-contiguous seq at ${i}: ${entry.seq}`);
    }
    if (i > 0 && entry.parentHash !== chain[i - 1]?.hash) {
      throw new Error(`fork at seq ${entry.seq}: parent does not match`);
    }
  }
  return chain.length;
}
