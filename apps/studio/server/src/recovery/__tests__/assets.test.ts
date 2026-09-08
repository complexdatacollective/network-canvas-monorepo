import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';
import { BACKUP_ROLE, TENANT_ROLES } from '@codaco/studio-sync/rls';
import {
  revokeLargeObjectPrivilegesSql,
  runtimeRolesSql,
} from '@codaco/studio-sync/role-bootstrap';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
import { reachableDb, seedTeam } from '../../__tests__/support/postgres.ts';
import type { AssetStore } from '../../assets.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import { createBackupPool, createOwnerPool } from '../../db/pool.ts';
import type { DbEnv } from '../../env.ts';
import { verifyRecoveredAssets } from '../assets.ts';

const database = await reachableDb();
const FAILURE = 'STUDIO_RECOVERED_ASSET_VERIFICATION_FAILED';

type Fixture = {
  sourceDb: DbEnv;
  administrativeDb: DbEnv;
  owner: pg.Pool | undefined;
  administrator: pg.Pool;
  backup: pg.Pool;
  backupLogin: string;
  ownerLogin: string;
  runtimeLogin: string;
  maintenanceLogin: string;
  allowedLogins: string[];
  backupUrl: string;
};

let fixture: Fixture | undefined;

function requireFixture(): Fixture {
  if (!fixture) throw new Error('Recovery asset database fixture is required.');
  return fixture;
}

function chunks(bytes: Uint8Array, width = 2): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + width));
      offset += width;
    },
  });
}

function memoryStore(
  objects: ReadonlyMap<string, Uint8Array>,
  seen: string[] = [],
): AssetStore {
  return {
    async checkHealth() {},
    async put() {
      throw new Error('unused');
    },
    async get(hash) {
      seen.push(hash);
      const bytes = objects.get(hash);
      if (!bytes) return null;
      return {
        body: chunks(bytes),
        mediaType: 'application/octet-stream',
        size: bytes.byteLength,
      };
    },
  };
}

async function addAsset(teamId: string, bytes: Uint8Array): Promise<string> {
  const hash = createHash('sha256').update(bytes).digest('hex');
  await withTargetAdministrator(async (administrator) => {
    await seedTeam(administrator, teamId);
    await administrator.query(
      `INSERT INTO public.assets
        (team_id, hash, media_type, media_class, byte_size, original_filename, origin)
       VALUES ($1, $2, 'application/octet-stream', 'document', $3, 'recovery.bin', 'seed')`,
      [teamId, hash, bytes.byteLength],
    );
  });
  return hash;
}

async function withTargetAdministrator<T>(
  callback: (administrator: pg.Pool) => Promise<T>,
): Promise<T> {
  const administrator = createOwnerPool(requireFixture().administrativeDb);
  try {
    return await callback(administrator);
  } finally {
    await administrator.end();
  }
}

async function closeOwner(): Promise<void> {
  const f = requireFixture();
  await f.owner?.end();
  f.owner = undefined;
  await f.administrator.query(
    `ALTER ROLE ${pg.escapeIdentifier(f.ownerLogin)} NOLOGIN`,
  );
}

async function openOwner(): Promise<pg.Pool> {
  const f = requireFixture();
  if (f.owner) return f.owner;
  await f.administrator.query(
    `ALTER ROLE ${pg.escapeIdentifier(f.ownerLogin)} LOGIN`,
  );
  f.owner = createOwnerPool(f.sourceDb);
  return f.owner;
}

async function verify(store: AssetStore, overrides = {}) {
  const f = requireFixture();
  await closeOwner();
  return await verifyRecoveredAssets(f.backup, store, {
    allowedLogins: f.allowedLogins,
    administrativeLogins: [f.ownerLogin],
    pageSize: 1,
    requestTimeoutMs: 100,
    streamIdleTimeoutMs: 100,
    objectTimeoutMs: 100,
    operationTimeoutMs: 10_000,
    ...overrides,
  });
}

beforeAll(async () => {
  if (!database) return;
  const suffix = randomUUID().replaceAll('-', '');
  const databaseName = `studio_test_db_${suffix.slice(0, 12)}`;
  const ownerLogin = `asset_owner_${suffix}`;
  const backupLogin = `asset_backup_${suffix}`;
  const runtimeLogin = `asset_runtime_${suffix}`;
  const maintenanceLogin = `asset_maintenance_${suffix}`;
  const password = randomBytes(24).toString('hex');
  const loginOptions =
    'LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION';
  const administrator = createOwnerPool(database);
  await administrator.query(runtimeRolesSql([BACKUP_ROLE]));
  await administrator.query(
    `CREATE ROLE ${pg.escapeIdentifier(ownerLogin)} ${loginOptions} PASSWORD ${pg.escapeLiteral(password)};
     CREATE ROLE ${pg.escapeIdentifier(backupLogin)} ${loginOptions} PASSWORD ${pg.escapeLiteral(password)};
     CREATE ROLE ${pg.escapeIdentifier(runtimeLogin)} ${loginOptions} PASSWORD ${pg.escapeLiteral(password)};
     CREATE ROLE ${pg.escapeIdentifier(maintenanceLogin)} ${loginOptions} PASSWORD ${pg.escapeLiteral(password)};
     GRANT ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance}, ${BACKUP_ROLE}
       TO ${pg.escapeIdentifier(ownerLogin)} WITH ADMIN OPTION, INHERIT FALSE, SET TRUE;
     GRANT ${BACKUP_ROLE} TO ${pg.escapeIdentifier(backupLogin)} WITH INHERIT FALSE, SET TRUE;
     GRANT ${TENANT_ROLES.app} TO ${pg.escapeIdentifier(runtimeLogin)} WITH INHERIT FALSE, SET TRUE;
     GRANT ${TENANT_ROLES.maintenance} TO ${pg.escapeIdentifier(maintenanceLogin)} WITH INHERIT FALSE, SET TRUE`,
  );
  await administrator.query(
    `CREATE DATABASE ${pg.escapeIdentifier(databaseName)}
       OWNER ${pg.escapeIdentifier(ownerLogin)} TEMPLATE template0
       LOCALE_PROVIDER icu ICU_LOCALE 'en-US'`,
  );
  const url = new URL(database.url);
  url.pathname = `/${databaseName}`;
  url.username = ownerLogin;
  url.password = password;
  const sourceDb = { url: url.toString() };
  const owner = createOwnerPool(sourceDb);
  const administrativeTarget = new URL(database.url);
  administrativeTarget.pathname = `/${databaseName}`;
  const administrativeDb = { url: administrativeTarget.toString() };
  const targetAdministrator = createOwnerPool(administrativeDb);
  await targetAdministrator.query(revokeLargeObjectPrivilegesSql());
  await targetAdministrator.end();
  await owner.query(
    `REVOKE CONNECT, TEMPORARY ON DATABASE ${pg.escapeIdentifier(databaseName)} FROM PUBLIC`,
  );
  const allowedLogins = await enrollMigrationTestDatabase(owner, database, [
    backupLogin,
    runtimeLogin,
    maintenanceLogin,
  ]);
  const migrations = await readMigrations(
    fileURLToPath(new URL('../../../migrations', import.meta.url)),
  );
  await migrateDatabase(owner, migrations, SCHEMA_FINGERPRINT, allowedLogins);
  await owner.end();
  const backupUrl = new URL(sourceDb.url);
  backupUrl.username = backupLogin;
  backupUrl.password = password;
  const backup = createBackupPool({ url: backupUrl.toString() });
  await administrator.query(
    `ALTER ROLE ${pg.escapeIdentifier(ownerLogin)} NOLOGIN;
     ALTER ROLE ${pg.escapeIdentifier(runtimeLogin)} NOLOGIN;
     ALTER ROLE ${pg.escapeIdentifier(maintenanceLogin)} NOLOGIN`,
  );
  fixture = {
    sourceDb,
    administrativeDb,
    owner: undefined,
    administrator,
    backup,
    backupLogin,
    ownerLogin,
    runtimeLogin,
    maintenanceLogin,
    allowedLogins,
    backupUrl: backupUrl.toString(),
  };
});

beforeEach(async () => {
  if (!fixture) return;
  await closeOwner();
  await withTargetAdministrator(async (administrator) => {
    await administrator.query('DELETE FROM public.assets');
  });
  await fixture.administrator.query(
    `ALTER ROLE ${pg.escapeIdentifier(fixture.runtimeLogin)} NOLOGIN;
     ALTER ROLE ${pg.escapeIdentifier(fixture.maintenanceLogin)} NOLOGIN`,
  );
});

afterAll(async () => {
  if (!fixture || !database) return;
  const {
    owner,
    administrator,
    backup,
    backupLogin,
    ownerLogin,
    runtimeLogin,
    maintenanceLogin,
  } = fixture;
  await owner?.end();
  await backup.end();
  try {
    await administrator.query(
      `DROP DATABASE IF EXISTS ${pg.escapeIdentifier(new URL(fixture.sourceDb.url).pathname.slice(1))} WITH (FORCE)`,
    );
    await administrator.query(
      `DROP ROLE IF EXISTS ${pg.escapeIdentifier(ownerLogin)},
        ${pg.escapeIdentifier(backupLogin)},
        ${pg.escapeIdentifier(runtimeLogin)},
        ${pg.escapeIdentifier(maintenanceLogin)}`,
    );
  } finally {
    await administrator.end();
  }
});

describe.skipIf(!database)('recovered Studio asset verification', () => {
  it('streams every counted composite-key page and verifies duplicate object hashes', async () => {
    const first = new TextEncoder().encode('first recovery object');
    const second = new TextEncoder().encode('second recovery object');
    const firstHash = await addAsset('asset-team-a', first);
    const secondHash = await addAsset('asset-team-b', second);
    await addAsset('asset-team-c', first);
    const objects = new Map([
      [firstHash, first],
      [secondHash, second],
    ]);
    const seen: string[] = [];

    await expect(verify(memoryStore(objects, seen))).resolves.toBe(3);
    expect(seen).toEqual([firstHash, secondHash, firstHash]);
  });

  it('uses the database collation for composite-key traversal', async () => {
    const lower = new TextEncoder().encode('lowercase-collation-object');
    const upper = new TextEncoder().encode('uppercase-collation-object');
    const lowerHash = await addAsset('asset-a', lower);
    const upperHash = await addAsset('asset-B', upper);
    const ordered = await requireFixture().backup.query<{ hash: string }>(
      `SELECT hash FROM public.assets
       WHERE team_id = ANY($1::pg_catalog.text[]) ORDER BY team_id, hash`,
      [['asset-a', 'asset-B']],
    );
    const databaseOrder = ordered.rows.map(({ hash }) => hash);
    const javascriptRows: [string, string][] = [
      ['asset-a', lowerHash],
      ['asset-B', upperHash],
    ];
    const javascriptOrder = javascriptRows
      .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([, hash]) => hash);
    expect(databaseOrder).not.toEqual(javascriptOrder);
    const seen: string[] = [];

    await expect(
      verify(
        memoryStore(
          new Map([
            [lowerHash, lower],
            [upperHash, upper],
          ]),
          seen,
        ),
      ),
    ).resolves.toBe(2);
    expect(seen).toEqual(databaseOrder);
  });

  it('fails when a later keyset page has no matching object', async () => {
    const first = new TextEncoder().encode('complete first page');
    const second = new TextEncoder().encode('missing second page');
    const firstHash = await addAsset('asset-page-a', first);
    const secondHash = await addAsset('asset-page-b', second);
    const seen: string[] = [];

    await expect(
      verify(memoryStore(new Map([[firstHash, first]]), seen)),
    ).rejects.toThrow(FAILURE);
    expect(seen).toEqual([firstHash, secondHash]);
  });

  it.each([
    ['missing', () => null],
    [
      'truncated',
      (bytes: Uint8Array) => ({
        body: chunks(bytes.slice(0, -1)),
        mediaType: 'application/octet-stream',
        size: undefined,
      }),
    ],
    [
      'corrupt',
      (bytes: Uint8Array) => ({
        body: chunks(new Uint8Array(bytes.byteLength).fill(7)),
        mediaType: 'application/octet-stream',
        size: bytes.byteLength,
      }),
    ],
    [
      'oversize',
      (bytes: Uint8Array) => ({
        body: chunks(new Uint8Array(bytes.byteLength + 1)),
        mediaType: 'application/octet-stream',
        size: undefined,
      }),
    ],
  ])(
    'refuses a %s object without losing the database borrower',
    async (_name, result) => {
      const bytes = new TextEncoder().encode('negative recovery object');
      const hash = await addAsset('asset-team-negative', bytes);
      const store: AssetStore = {
        async checkHealth() {},
        async put() {
          throw new Error('unused');
        },
        async get() {
          return result(bytes);
        },
      };
      await expect(verify(store)).rejects.toThrow(FAILURE);
      await expect(
        requireFixture().backup.query('SELECT 1 AS available'),
      ).resolves.toMatchObject({ rows: [{ available: 1 }] });
      expect(hash).toHaveLength(64);
    },
  );

  it.each([
    [
      'stream-idle',
      {
        streamIdleTimeoutMs: 20,
        objectTimeoutMs: 1_000,
        operationTimeoutMs: 10_000,
      },
      true,
    ],
    [
      'whole-object',
      {
        streamIdleTimeoutMs: 1_000,
        objectTimeoutMs: 20,
        operationTimeoutMs: 10_000,
      },
      true,
    ],
    [
      'overall operation',
      {
        streamIdleTimeoutMs: 1_000,
        objectTimeoutMs: 1_000,
        operationTimeoutMs: 250,
      },
      true,
    ],
  ])(
    'cancels a stalled stream at the %s deadline',
    async (_label, deadlines, requestSignalAborted) => {
      const bytes = new TextEncoder().encode('stalled recovery object');
      await addAsset('asset-team-stalled', bytes);
      let cancelled = false;
      let suppliedSignal: AbortSignal | undefined;
      const store: AssetStore = {
        async checkHealth() {},
        async put() {
          throw new Error('unused');
        },
        async get(_hash, signal) {
          suppliedSignal = signal;
          return {
            body: new ReadableStream<Uint8Array>({
              pull() {
                return new Promise<void>(() => undefined);
              },
              cancel() {
                cancelled = true;
              },
            }),
            mediaType: 'application/octet-stream',
            size: bytes.byteLength,
          };
        },
      };

      await expect(verify(store, deadlines)).rejects.toThrow(FAILURE);
      expect(suppliedSignal?.aborted).toBe(requestSignalAborted);
      expect(cancelled).toBe(true);
    },
  );

  it('cancels an object request that does not produce headers', async () => {
    const bytes = new TextEncoder().encode('stalled request object');
    await addAsset('asset-team-request', bytes);
    let suppliedSignal: AbortSignal | undefined;
    const store: AssetStore = {
      async checkHealth() {},
      async put() {
        throw new Error('unused');
      },
      get(_hash, signal) {
        suppliedSignal = signal;
        return new Promise(() => undefined);
      },
    };

    await expect(verify(store, { requestTimeoutMs: 20 })).rejects.toThrow(
      FAILURE,
    );
    expect(suppliedSignal?.aborted).toBe(true);
  });

  it('does not await a stream cancellation that never resolves', async () => {
    const bytes = new TextEncoder().encode('non-resolving cancellation');
    await addAsset('asset-team-cancel', bytes);
    let cancelled = false;
    let suppliedSignal: AbortSignal | undefined;
    const reader = {
      read: () => new Promise<never>(() => {}),
      cancel: () => {
        cancelled = true;
        return new Promise<void>(() => {});
      },
      releaseLock() {},
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;
    const store: AssetStore = {
      async checkHealth() {},
      async put() {
        throw new Error('unused');
      },
      async get(_hash, signal) {
        suppliedSignal = signal;
        return {
          body: {
            getReader: () => reader,
          } as ReadableStream<Uint8Array>,
          mediaType: 'application/octet-stream',
          size: bytes.byteLength,
        };
      },
    };

    const started = performance.now();
    await expect(
      verify(store, {
        streamIdleTimeoutMs: 1_000,
        objectTimeoutMs: 1_000,
        operationTimeoutMs: 250,
      }),
    ).rejects.toThrow(FAILURE);
    expect(performance.now() - started).toBeLessThan(750);
    expect(suppliedSignal?.aborted).toBe(true);
    expect(cancelled).toBe(true);
  });

  it('disposes a body rejected from its size metadata', async () => {
    const bytes = new TextEncoder().encode('metadata mismatch');
    await addAsset('asset-team-metadata', bytes);
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });

    await expect(
      verify({
        async checkHealth() {},
        async put() {
          throw new Error('unused');
        },
        async get() {
          return {
            body,
            mediaType: 'application/octet-stream',
            size: bytes.byteLength + 1,
          };
        },
      }),
    ).rejects.toThrow(FAILURE);
    expect(cancelled).toBe(true);
  });

  it('disposes a body returned after its object request timed out', async () => {
    const bytes = new TextEncoder().encode('late request body');
    await addAsset('asset-team-late', bytes);
    let resolveRequest:
      | ((asset: Awaited<ReturnType<AssetStore['get']>>) => void)
      | undefined;
    let cancelled = false;
    const pending = new Promise<Awaited<ReturnType<AssetStore['get']>>>(
      (resolve) => {
        resolveRequest = resolve;
      },
    );
    const verification = verify(
      {
        async checkHealth() {},
        async put() {
          throw new Error('unused');
        },
        get() {
          return pending;
        },
      },
      { requestTimeoutMs: 20 },
    );
    await expect(verification).rejects.toThrow(FAILURE);
    resolveRequest?.({
      body: new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      }),
      mediaType: 'application/octet-stream',
      size: bytes.byteLength,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(cancelled).toBe(true);
  });

  it('bounds pool acquisition and cleans up a late borrower', async () => {
    const f = requireFixture();
    const pool = createBackupPool({ url: f.backupUrl });
    pool.options.max = 1;
    const held = await pool.connect();
    try {
      await expect(
        verifyRecoveredAssets(pool, memoryStore(new Map()), {
          allowedLogins: f.allowedLogins,
          acquisitionTimeoutMs: 20,
          operationTimeoutMs: 1_000,
        }),
      ).rejects.toThrow(FAILURE);
    } finally {
      held.release();
      await pool.end();
    }
  });

  it('refuses a live writer identity before touching object storage', async () => {
    const bytes = new TextEncoder().encode('quarantine recovery object');
    await addAsset('asset-team-quarantine', bytes);
    let reads = 0;
    const store = memoryStore(new Map());
    store.get = async () => {
      reads += 1;
      return null;
    };
    await requireFixture().administrator.query(
      `ALTER ROLE ${pg.escapeIdentifier(requireFixture().runtimeLogin)} LOGIN`,
    );

    await expect(verify(store)).rejects.toThrow(FAILURE);
    expect(reads).toBe(0);
  });

  it('refuses an admitted or active administrative writer', async () => {
    const f = requireFixture();
    const reads: string[] = [];
    const owner = await openOwner();
    await expect(
      verifyRecoveredAssets(f.backup, memoryStore(new Map(), reads), {
        allowedLogins: f.allowedLogins,
        administrativeLogins: [f.ownerLogin],
      }),
    ).rejects.toThrow(FAILURE);
    expect(reads).toEqual([]);

    const active = await owner.connect();
    await f.administrator.query(
      `ALTER ROLE ${pg.escapeIdentifier(f.ownerLogin)} NOLOGIN`,
    );
    try {
      await expect(
        verifyRecoveredAssets(f.backup, memoryStore(new Map(), reads), {
          allowedLogins: f.allowedLogins,
          administrativeLogins: [f.ownerLogin],
        }),
      ).rejects.toThrow(FAILURE);
      expect(reads).toEqual([]);
    } finally {
      active.release();
    }
  });

  it('rechecks fresh quarantine state after the inventory snapshot', async () => {
    const f = requireFixture();
    const bytes = new TextEncoder().encode('fresh quarantine check');
    const hash = await addAsset('asset-team-fresh-check', bytes);
    let reads = 0;
    const store = memoryStore(new Map([[hash, bytes]]));
    store.get = async () => {
      reads += 1;
      await f.administrator.query(
        `ALTER ROLE ${pg.escapeIdentifier(f.ownerLogin)} LOGIN`,
      );
      return {
        body: chunks(bytes),
        mediaType: 'application/octet-stream',
        size: bytes.byteLength,
      };
    };

    await expect(verify(store)).rejects.toThrow(FAILURE);
    expect(reads).toBe(1);
  });

  it('refuses the owner identity and a stale schema before object reads', async () => {
    const f = requireFixture();
    const bytes = new TextEncoder().encode('schema recovery object');
    await addAsset('asset-team-schema', bytes);
    const store = memoryStore(new Map());
    let reads = 0;
    store.get = async () => {
      reads += 1;
      return null;
    };
    const owner = await openOwner();
    await expect(
      verifyRecoveredAssets(owner, store, {
        allowedLogins: f.allowedLogins,
        administrativeLogins: [f.ownerLogin],
      }),
    ).rejects.toThrow(FAILURE);
    await owner.query(
      `UPDATE public."schemaFingerprint" SET fingerprint = 'stale'`,
    );
    await expect(verify(store)).rejects.toThrow(FAILURE);
    expect(reads).toBe(0);
    const reopened = await openOwner();
    await reopened.query(
      `UPDATE public."schemaFingerprint" SET fingerprint = $1`,
      [SCHEMA_FINGERPRINT],
    );
  });
});
