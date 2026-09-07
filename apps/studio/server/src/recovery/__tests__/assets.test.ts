import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';
import { BACKUP_ROLE, TENANT_ROLES } from '@codaco/studio-sync/rls';
import { runtimeRolesSql } from '@codaco/studio-sync/role-bootstrap';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
import {
  createScratchDatabase,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import type { AssetStore } from '../../assets.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import { createBackupPool } from '../../db/pool.ts';
import { verifyRecoveredAssets } from '../assets.ts';

const database = await reachableDb();
const FAILURE = 'STUDIO_RECOVERED_ASSET_VERIFICATION_FAILED';

type Fixture = {
  source: Awaited<ReturnType<typeof createScratchDatabase>>;
  backup: pg.Pool;
  backupLogin: string;
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
  await seedTeam(requireFixture().source.pool, teamId);
  await requireFixture().source.pool.query(
    `INSERT INTO public.assets
      (team_id, hash, media_type, media_class, byte_size, original_filename, origin)
     VALUES ($1, $2, 'application/octet-stream', 'document', $3, 'recovery.bin', 'seed')`,
    [teamId, hash, bytes.byteLength],
  );
  return hash;
}

async function verify(store: AssetStore, overrides = {}) {
  const f = requireFixture();
  return await verifyRecoveredAssets(f.backup, store, {
    allowedLogins: f.allowedLogins,
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
  const source = await createScratchDatabase(database);
  const suffix = randomUUID().replaceAll('-', '');
  const backupLogin = `asset_backup_${suffix}`;
  const runtimeLogin = `asset_runtime_${suffix}`;
  const maintenanceLogin = `asset_maintenance_${suffix}`;
  const password = randomBytes(24).toString('hex');
  const loginOptions =
    'LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION';
  await source.pool.query(runtimeRolesSql([BACKUP_ROLE]));
  await source.pool.query(
    `CREATE ROLE ${pg.escapeIdentifier(backupLogin)} ${loginOptions} PASSWORD ${pg.escapeLiteral(password)};
     CREATE ROLE ${pg.escapeIdentifier(runtimeLogin)} ${loginOptions} PASSWORD ${pg.escapeLiteral(password)};
     CREATE ROLE ${pg.escapeIdentifier(maintenanceLogin)} ${loginOptions} PASSWORD ${pg.escapeLiteral(password)};
     GRANT ${BACKUP_ROLE} TO ${pg.escapeIdentifier(backupLogin)} WITH INHERIT FALSE, SET TRUE;
     GRANT ${TENANT_ROLES.app} TO ${pg.escapeIdentifier(runtimeLogin)} WITH INHERIT FALSE, SET TRUE;
     GRANT ${TENANT_ROLES.maintenance} TO ${pg.escapeIdentifier(maintenanceLogin)} WITH INHERIT FALSE, SET TRUE`,
  );
  const allowedLogins = await enrollMigrationTestDatabase(
    source.pool,
    database,
    [backupLogin, runtimeLogin, maintenanceLogin],
  );
  const migrations = await readMigrations(
    fileURLToPath(new URL('../../../migrations', import.meta.url)),
  );
  await migrateDatabase(
    source.pool,
    migrations,
    SCHEMA_FINGERPRINT,
    allowedLogins,
  );
  const url = new URL(source.db.url);
  url.username = backupLogin;
  url.password = password;
  const backup = createBackupPool({ url: url.toString() });
  await source.pool.query(
    `ALTER ROLE ${pg.escapeIdentifier(runtimeLogin)} NOLOGIN;
     ALTER ROLE ${pg.escapeIdentifier(maintenanceLogin)} NOLOGIN`,
  );
  fixture = {
    source,
    backup,
    backupLogin,
    runtimeLogin,
    maintenanceLogin,
    allowedLogins,
    backupUrl: url.toString(),
  };
});

beforeEach(async () => {
  if (!fixture) return;
  await fixture.source.pool.query('DELETE FROM public.assets');
  await fixture.source.pool.query(
    `ALTER ROLE ${pg.escapeIdentifier(fixture.runtimeLogin)} NOLOGIN;
     ALTER ROLE ${pg.escapeIdentifier(fixture.maintenanceLogin)} NOLOGIN`,
  );
});

afterAll(async () => {
  if (!fixture || !database) return;
  const { source, backup, backupLogin, runtimeLogin, maintenanceLogin } =
    fixture;
  await backup.end();
  await source.dispose();
  const cleanup = new pg.Pool({ connectionString: database.url });
  try {
    await cleanup.query(
      `DROP ROLE IF EXISTS ${pg.escapeIdentifier(backupLogin)},
        ${pg.escapeIdentifier(runtimeLogin)},
        ${pg.escapeIdentifier(maintenanceLogin)}`,
    );
  } finally {
    await cleanup.end();
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
      false,
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
    await requireFixture().source.pool.query(
      `ALTER ROLE ${pg.escapeIdentifier(requireFixture().runtimeLogin)} LOGIN`,
    );

    await expect(verify(store)).rejects.toThrow(FAILURE);
    expect(reads).toBe(0);
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
    await expect(
      verifyRecoveredAssets(f.source.pool, store, {
        allowedLogins: f.allowedLogins,
      }),
    ).rejects.toThrow(FAILURE);
    await f.source.pool.query(
      `UPDATE public."schemaFingerprint" SET fingerprint = 'stale'`,
    );
    await expect(verify(store)).rejects.toThrow(FAILURE);
    expect(reads).toBe(0);
    await f.source.pool.query(
      `UPDATE public."schemaFingerprint" SET fingerprint = $1`,
      [SCHEMA_FINGERPRINT],
    );
  });
});
