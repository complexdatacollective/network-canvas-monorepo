import { createHash } from 'node:crypto';

import type pg from 'pg';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { AssetStore } from '../assets.ts';
import { assertBackupAccess } from '../db/backup.ts';
import { checkSchema } from '../db/schema.ts';

const FAILURE = 'STUDIO_RECOVERED_ASSET_VERIFICATION_FAILED';
const MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 250;
const DEFAULT_ACQUISITION_TIMEOUT_MS = 10_000;
const DEFAULT_QUERY_TIMEOUT_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_OBJECT_TIMEOUT_MS = 60 * 60_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 4 * 60 * 60_000;

type AssetRow = {
  team_id: string;
  hash: string;
  byte_size: string;
};

export type RecoveredAssetVerificationOptions = {
  allowedLogins: readonly string[];
  administrativeLogins?: readonly string[];
  pageSize?: number;
  acquisitionTimeoutMs?: number;
  queryTimeoutMs?: number;
  requestTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
  objectTimeoutMs?: number;
  operationTimeoutMs?: number;
};

function positiveInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0)
    throw new Error(FAILURE);
  return resolved;
}

function aborted(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error(FAILURE);
}

async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw aborted(signal);
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(aborted(signal));
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
        return undefined;
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
        return undefined;
      },
    );
  });
}

async function connectBounded(
  pool: pg.Pool,
  signal: AbortSignal,
): Promise<pg.PoolClient> {
  const pending = pool.connect();
  try {
    return await abortable(pending, signal);
  } catch (error) {
    void pending.then(
      (client) => client.release(true),
      () => undefined,
    );
    throw error;
  }
}

async function assertRecoveryQuarantine(
  client: pg.PoolClient,
  allowedLogins: readonly string[],
  administrativeLogins: readonly string[],
): Promise<void> {
  await client.query('SELECT pg_catalog.pg_stat_clear_snapshot()');
  const result = await client.query<{ safe: boolean }>(
    `WITH runtime_logins AS MATERIALIZED (
       SELECT login.oid, login.rolcanlogin
       FROM pg_catalog.pg_roles login
       WHERE login.rolname = ANY($1::pg_catalog.text[])
         AND NOT login.rolname = ANY($2::pg_catalog.text[])
         AND EXISTS (
           SELECT 1 FROM pg_catalog.pg_auth_members membership
           JOIN pg_catalog.pg_roles role ON role.oid = membership.roleid
           WHERE membership.member = login.oid
             AND role.rolname = ANY($3::pg_catalog.text[])
         )
     ) SELECT
       pg_catalog.current_setting('transaction_read_only') = 'on'
       AND pg_catalog.current_setting('transaction_isolation') = 'repeatable read'
       AND (SELECT count(*) FROM runtime_logins) = $4::pg_catalog.int4
       AND NOT EXISTS (SELECT 1 FROM runtime_logins WHERE rolcanlogin)
       AND NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_stat_activity activity
         WHERE activity.datname = pg_catalog.current_database()
           AND activity.usesysid IN (SELECT oid FROM runtime_logins)
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_prepared_xacts prepared
         WHERE prepared.database = pg_catalog.current_database()
       ) AS safe`,
    [
      allowedLogins,
      administrativeLogins,
      Object.values(TENANT_ROLES),
      Object.values(TENANT_ROLES).length,
    ],
  );
  if (result.rows[0]?.safe !== true) throw new Error(FAILURE);
}

async function readWithIdleDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
  timeoutMs: number,
) {
  const idle = new AbortController();
  const timer = setTimeout(() => idle.abort(new Error(FAILURE)), timeoutMs);
  try {
    return await abortable(
      reader.read(),
      AbortSignal.any([signal, idle.signal]),
    );
  } finally {
    clearTimeout(timer);
  }
}

async function verifyObject(
  store: AssetStore,
  row: AssetRow,
  parentSignal: AbortSignal,
  requestTimeoutMs: number,
  streamIdleTimeoutMs: number,
  timeoutMs: number,
): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(row.hash)) throw new Error(FAILURE);
  let expected: bigint;
  try {
    expected = BigInt(row.byte_size);
  } catch {
    throw new Error(FAILURE);
  }
  if (expected < 1n || expected > BigInt(MAX_ASSET_BYTES))
    throw new Error(FAILURE);

  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([parentSignal, deadline]);
  const request = new AbortController();
  const requestTimer = setTimeout(
    () => request.abort(new Error(FAILURE)),
    requestTimeoutMs,
  );
  const requestSignal = AbortSignal.any([signal, request.signal]);
  let asset: Awaited<ReturnType<AssetStore['get']>>;
  try {
    asset = await abortable(store.get(row.hash, requestSignal), requestSignal);
  } finally {
    clearTimeout(requestTimer);
  }
  if (!asset) throw new Error(FAILURE);
  if (
    asset.size !== undefined &&
    (!Number.isSafeInteger(asset.size) || BigInt(asset.size) !== expected)
  )
    throw new Error(FAILURE);

  const reader = asset.body.getReader();
  const digest = createHash('sha256');
  let actual = 0n;
  let complete = false;
  const cancel = () => {
    void reader.cancel(aborted(signal)).catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      const chunk = await readWithIdleDeadline(
        reader,
        signal,
        streamIdleTimeoutMs,
      );
      if (chunk.done) {
        complete = true;
        break;
      }
      actual += BigInt(chunk.value.byteLength);
      if (actual > expected || actual > BigInt(MAX_ASSET_BYTES))
        throw new Error(FAILURE);
      digest.update(chunk.value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (actual !== expected || digest.digest('hex') !== row.hash)
    throw new Error(FAILURE);
}

async function verifyInventory(
  client: pg.PoolClient,
  store: AssetStore,
  signal: AbortSignal,
  pageSize: number,
  requestTimeoutMs: number,
  streamIdleTimeoutMs: number,
  objectTimeoutMs: number,
): Promise<number> {
  const inventory = await client.query<{ count: string }>(
    'SELECT count(*)::pg_catalog.text AS count FROM public.assets',
  );
  const expectedCount = BigInt(inventory.rows[0]?.count ?? '-1');
  if (expectedCount < 0n) throw new Error(FAILURE);

  let team: string | null = null;
  let hash: string | null = null;
  let verified = 0n;
  for (;;) {
    if (signal.aborted) throw aborted(signal);
    const page: pg.QueryResult<AssetRow> = await client.query<AssetRow>(
      `SELECT team_id, hash, byte_size::pg_catalog.text AS byte_size
       FROM public.assets
       WHERE $1::pg_catalog.text IS NULL
          OR (team_id, hash) > ($1::pg_catalog.text, $2::pg_catalog.text)
       ORDER BY team_id, hash LIMIT $3::pg_catalog.int4`,
      [team, hash, pageSize],
    );
    if (page.rows.length === 0) break;
    for (const row of page.rows) {
      if (
        team !== null &&
        (row.team_id < team ||
          (row.team_id === team && row.hash <= (hash ?? '')))
      )
        throw new Error(FAILURE);
      await verifyObject(
        store,
        row,
        signal,
        requestTimeoutMs,
        streamIdleTimeoutMs,
        objectTimeoutMs,
      );
      team = row.team_id;
      hash = row.hash;
      verified += 1n;
      if (verified > expectedCount) throw new Error(FAILURE);
    }
  }
  if (verified !== expectedCount || verified > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error(FAILURE);
  return Number(verified);
}

/**
 * Verify a restored database's complete asset inventory without admitting any
 * serving identity. The one backup session owns admission, snapshot and scan.
 */
export async function verifyRecoveredAssets(
  pool: pg.Pool,
  store: AssetStore,
  options: RecoveredAssetVerificationOptions,
): Promise<number> {
  let allowedLogins: string[];
  let administrativeLogins: string[];
  let pageSize: number;
  let acquisitionTimeoutMs: number;
  let queryTimeoutMs: number;
  let requestTimeoutMs: number;
  let streamIdleTimeoutMs: number;
  let objectTimeoutMs: number;
  let operationTimeoutMs: number;
  try {
    if (!Array.isArray(options.allowedLogins)) throw new Error();
    allowedLogins = [...options.allowedLogins];
    administrativeLogins = [...(options.administrativeLogins ?? [])];
    if (
      !allowedLogins.every((login) => typeof login === 'string') ||
      !administrativeLogins.every((login) => typeof login === 'string')
    )
      throw new Error();
    pageSize = positiveInteger(options.pageSize, DEFAULT_PAGE_SIZE);
    if (pageSize > 1_000) throw new Error();
    acquisitionTimeoutMs = positiveInteger(
      options.acquisitionTimeoutMs,
      DEFAULT_ACQUISITION_TIMEOUT_MS,
    );
    queryTimeoutMs = positiveInteger(
      options.queryTimeoutMs,
      DEFAULT_QUERY_TIMEOUT_MS,
    );
    requestTimeoutMs = positiveInteger(
      options.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
    );
    streamIdleTimeoutMs = positiveInteger(
      options.streamIdleTimeoutMs,
      DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    );
    objectTimeoutMs = positiveInteger(
      options.objectTimeoutMs,
      DEFAULT_OBJECT_TIMEOUT_MS,
    );
    operationTimeoutMs = positiveInteger(
      options.operationTimeoutMs,
      DEFAULT_OPERATION_TIMEOUT_MS,
    );
  } catch {
    throw new Error(FAILURE);
  }

  const operationSignal = AbortSignal.timeout(operationTimeoutMs);
  const acquisitionSignal = AbortSignal.any([
    operationSignal,
    AbortSignal.timeout(acquisitionTimeoutMs),
  ]);
  let client: pg.PoolClient | undefined;
  let released = false;
  let transaction = false;
  const release = (destroy: boolean) => {
    if (!client || released) return;
    released = true;
    client.release(destroy);
  };
  const interrupt = () => release(true);
  try {
    client = await connectBounded(pool, acquisitionSignal);
    operationSignal.addEventListener('abort', interrupt, { once: true });
    const begin = {
      text: 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      query_timeout: queryTimeoutMs,
    };
    await client.query(begin);
    transaction = true;
    const configureDeadline = {
      text: `SELECT pg_catalog.set_config('statement_timeout', $1, true)`,
      values: [`${queryTimeoutMs}ms`],
      query_timeout: queryTimeoutMs,
    };
    await client.query(configureDeadline);
    await assertBackupAccess(client, async (checked) => {
      const schema = await checkSchema(
        checked,
        { allowedLogins, administrativeLogins },
        { allowClosedEnrolledLogins: true },
      );
      if (schema.kind !== 'current') throw new Error(FAILURE);
      await assertRecoveryQuarantine(
        checked,
        allowedLogins,
        administrativeLogins,
      );
    });
    const count = await verifyInventory(
      client,
      store,
      operationSignal,
      pageSize,
      requestTimeoutMs,
      streamIdleTimeoutMs,
      objectTimeoutMs,
    );
    const rollback = { text: 'ROLLBACK', query_timeout: queryTimeoutMs };
    await client.query(rollback);
    transaction = false;
    release(false);
    return count;
  } catch {
    if (client && transaction && !released) {
      try {
        const rollback = { text: 'ROLLBACK', query_timeout: queryTimeoutMs };
        await client.query(rollback);
        transaction = false;
      } catch {
        release(true);
      }
    }
    release(true);
    throw new Error(FAILURE);
  } finally {
    operationSignal.removeEventListener('abort', interrupt);
    release(true);
  }
}
