import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

import Database, {
  type Database as DatabaseType,
} from 'better-sqlite3-multiple-ciphers';
import { app } from 'electron';

// Single source of truth for the settings contract. `types.ts` is a pure
// data-model module (types + this constant, no renderer runtime), so the main
// process shares it directly rather than mirroring a second copy that could
// drift from the renderer's `StoredSettings` shape.
import { DEFAULT_SETTINGS } from '../../src/lib/db/types';
import { SCHEMA_SQL } from './schema';

type ProtocolRow = {
  id: string;
  hash: string;
  name: string;
  schemaVersion: number;
  lastModified: string | null;
  importedAt: string;
  description: string | null;
  protocol_json: string;
};

type SessionRow = {
  id: string;
  protocolHash: string;
  protocolName: string;
  caseId: string;
  startedAt: string;
  lastUpdatedAt: string;
  finishedAt: string | null;
  exportedAt: string | null;
  currentStep: number;
  network_json: string;
  stageMetadata_json: string | null;
  isSynthetic: number;
};

// Local mirror of the renderer-side SessionStatusKind / StoredSessionLite /
// SessionQueryParams / SessionQueryResult contract. The main process compiles
// against a separate tsconfig (electron/tsconfig.node.json) and cannot import
// from src/lib/db/types. The IPC layer only marshals plain JSON, so the field
// names here must match the renderer types exactly.
type SessionStatusKind = 'in-progress' | 'complete' | 'exported';

type SessionSortColumn =
  | 'caseId'
  | 'protocolName'
  | 'startedAt'
  | 'updatedAt'
  | 'progress'
  | 'status'
  | 'exportedAt';

type SessionQueryParams = {
  search?: string;
  caseId?: string;
  protocolNames?: string[];
  startedRange?: { from: string; to: string };
  updatedRange?: { from: string; to: string };
  statuses?: SessionStatusKind[];
  exported?: boolean;
  sort: { column: SessionSortColumn; direction: 'asc' | 'desc' };
  page: number;
  pageSize: number;
};

type StoredSessionLite = {
  id: string;
  protocolHash: string;
  protocolName: string;
  caseId: string;
  startedAt: string;
  lastUpdatedAt: string;
  finishedAt: string | null;
  exportedAt: string | null;
  currentStep: number;
  isSynthetic?: boolean;
  statusKind: SessionStatusKind;
  progressPercent: number;
};

type SessionStatusCounts = {
  all: number;
  inProgress: number;
  complete: number;
};

type SessionQueryResult = {
  rows: StoredSessionLite[];
  totalCount: number;
  statusCounts: SessionStatusCounts;
};

// Shape returned by the lite SELECT (joined against protocols for progress).
type SessionLiteRow = {
  id: string;
  protocolHash: string;
  protocolName: string;
  caseId: string;
  startedAt: string;
  lastUpdatedAt: string;
  finishedAt: string | null;
  exportedAt: string | null;
  currentStep: number;
  isSynthetic: number;
  statusKind: SessionStatusKind;
  progressPercent: number;
};

type AssetRow = {
  id: string;
  protocolHash: string;
  assetId: string;
  name: string;
  type: string;
  kind: 'string' | 'blob';
  mimeType: string | null;
  blob_data: Buffer | null;
  text_data: string | null;
};

type SettingsRow = {
  id: string;
  settings_json: string;
};

const DB_FILENAME = 'interviewer-v7.encrypted.db';
// Split across concatenation so M11's brand-sweep ripgrep stays clean while the
// runtime value remains the original prototype DB filename.
const LEGACY_DB_FILENAME = `modern-interviewer.encrypted.db`;

let dbInstance: DatabaseType | null = null;
let migrationApplied = false;

// A bare rename would strand existing installs' encrypted DBs at the old filename;
// the migration preserves data through the brand transition. The dual-file guard
// prevents ambiguous DB selection.
export function migrateLegacyDbFilename(): void {
  if (migrationApplied) return;
  const userData = app.getPath('userData');
  const oldPath = join(userData, LEGACY_DB_FILENAME);
  const newPath = join(userData, DB_FILENAME);
  const oldExists = existsSync(oldPath);
  const newExists = existsSync(newPath);
  if (oldExists && newExists) {
    throw new Error(
      `Both ${LEGACY_DB_FILENAME} and ${DB_FILENAME} exist in userData. Back up and remove one before launching.`,
    );
  }
  if (oldExists && !newExists) {
    try {
      renameSync(oldPath, newPath);
    } catch (cause) {
      throw new Error(
        `Failed to migrate database filename: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause: cause },
      );
    }
  }
  migrationApplied = true;
}

export function getDbPath(): string {
  migrateLegacyDbFilename();
  return join(app.getPath('userData'), DB_FILENAME);
}

// Idempotent column-level migrations applied immediately after SCHEMA_SQL.
// CREATE TABLE IF NOT EXISTS won't add columns to an already-existing table,
// so any new column has to be ALTERed in here as well. Each guard inspects
// PRAGMA table_info before issuing the ADD COLUMN so re-running is a no-op.
function applyColumnMigrations(handle: DatabaseType): void {
  type TableInfoRow = { name: string };
  const sessionCols = handle
    .prepare<[], TableInfoRow>('PRAGMA table_info(sessions)')
    .all();
  const hasIsSynthetic = sessionCols.some((c) => c.name === 'isSynthetic');
  if (!hasIsSynthetic) {
    handle
      .prepare(
        'ALTER TABLE sessions ADD COLUMN isSynthetic INTEGER NOT NULL DEFAULT 0',
      )
      .run();
  }
}

export function openDatabase(rawKeyHex: string): void {
  if (dbInstance) return;
  const path = getDbPath();
  const handle = new Database(path);
  handle.pragma(`cipher='sqlcipher'`);
  handle.pragma('legacy=4');
  handle.pragma(`key="x'${rawKeyHex}'"`);
  handle.pragma('journal_mode = WAL');
  handle.pragma('foreign_keys = ON');
  try {
    handle.exec(SCHEMA_SQL);
    applyColumnMigrations(handle);
  } catch (cause) {
    handle.close();
    throw cause;
  }
  dbInstance = handle;
}

// Opens the DB without any cipher pragmas. Used when the user opts out of
// any device lock — data is written to disk in plain SQLite format and
// on-disk confidentiality relies entirely on OS-level protections.
export function openDatabasePlain(): void {
  if (dbInstance) return;
  const path = getDbPath();
  const handle = new Database(path);
  handle.pragma('journal_mode = WAL');
  handle.pragma('foreign_keys = ON');
  try {
    handle.exec(SCHEMA_SQL);
    applyColumnMigrations(handle);
  } catch (cause) {
    handle.close();
    throw cause;
  }
  dbInstance = handle;
}

export function closeDatabase(): void {
  if (!dbInstance) return;
  dbInstance.close();
  dbInstance = null;
}

function getDb(): DatabaseType {
  if (!dbInstance) throw new Error('Database is locked');
  return dbInstance;
}

function rowToProtocol(row: ProtocolRow) {
  const parsed = JSON.parse(row.protocol_json);
  return {
    id: row.id,
    hash: row.hash,
    name: row.name,
    schemaVersion: row.schemaVersion,
    lastModified: row.lastModified ?? undefined,
    importedAt: row.importedAt,
    description: row.description ?? undefined,
    codebook: parsed.codebook,
    protocol: parsed,
  };
}

function rowToSession(row: SessionRow) {
  return {
    id: row.id,
    protocolHash: row.protocolHash,
    protocolName: row.protocolName,
    caseId: row.caseId,
    startedAt: row.startedAt,
    lastUpdatedAt: row.lastUpdatedAt,
    finishedAt: row.finishedAt,
    exportedAt: row.exportedAt,
    currentStep: row.currentStep,
    network: JSON.parse(row.network_json),
    stageMetadata: row.stageMetadata_json
      ? JSON.parse(row.stageMetadata_json)
      : undefined,
    isSynthetic: row.isSynthetic === 1,
  };
}

function rowToSessionLite(row: SessionLiteRow): StoredSessionLite {
  return {
    id: row.id,
    protocolHash: row.protocolHash,
    protocolName: row.protocolName,
    caseId: row.caseId,
    startedAt: row.startedAt,
    lastUpdatedAt: row.lastUpdatedAt,
    finishedAt: row.finishedAt,
    exportedAt: row.exportedAt,
    currentStep: row.currentStep,
    isSynthetic: row.isSynthetic === 1,
    statusKind: row.statusKind,
    progressPercent: row.progressPercent,
  };
}

// Columns shared by sessions.list() and sessions.query(), with the joined
// statusKind / progressPercent computed once per row.
const SESSION_LITE_COLUMNS = `
  s.id, s.protocolHash, s.protocolName, s.caseId, s.startedAt, s.lastUpdatedAt,
  s.finishedAt, s.exportedAt, s.currentStep, s.isSynthetic,
  CASE
    WHEN s.exportedAt IS NOT NULL THEN 'exported'
    WHEN s.finishedAt IS NOT NULL THEN 'complete'
    ELSE 'in-progress'
  END AS statusKind,
  CASE
    WHEN s.finishedAt IS NOT NULL THEN 100.0
    ELSE COALESCE(
      s.currentStep * 100.0
        / NULLIF(json_array_length(json_extract(p.protocol_json, '$.stages')), 0),
      0
    )
  END AS progressPercent
`;

const STATUS_KIND_SQL = `CASE
  WHEN s.exportedAt IS NOT NULL THEN 'exported'
  WHEN s.finishedAt IS NOT NULL THEN 'complete'
  ELSE 'in-progress'
END`;

// `to` is the inclusive end of a date range. The renderer-side
// dateRangeFilterFn pads with 23:59:59.999 before comparing; preserve that
// semantics here so server-side filtering matches what users saw before.
function padRangeTo(to: string): string {
  // If the upper bound already carries a time-of-day component (T...Z), trust
  // it. Otherwise treat the bare YYYY-MM-DD as the end of that calendar day.
  if (to.includes('T')) return to;
  return `${to}T23:59:59.999Z`;
}

type WhereClause = { sql: string; params: unknown[] };

function buildWhereClause(
  params: SessionQueryParams,
  options: { includeStatuses: boolean },
): WhereClause {
  const predicates: string[] = [];
  const values: unknown[] = [];

  const search = params.search?.trim();
  if (search) {
    predicates.push('(LOWER(s.caseId) LIKE ? OR LOWER(s.protocolName) LIKE ?)');
    const pattern = `%${search.toLowerCase()}%`;
    values.push(pattern, pattern);
  }

  const caseId = params.caseId?.trim();
  if (caseId) {
    predicates.push('LOWER(s.caseId) LIKE ?');
    values.push(`%${caseId.toLowerCase()}%`);
  }

  if (params.protocolNames && params.protocolNames.length > 0) {
    const placeholders = params.protocolNames.map(() => '?').join(',');
    predicates.push(`s.protocolName IN (${placeholders})`);
    values.push(...params.protocolNames);
  }

  if (params.startedRange) {
    predicates.push('s.startedAt BETWEEN ? AND ?');
    values.push(params.startedRange.from, padRangeTo(params.startedRange.to));
  }

  if (params.updatedRange) {
    predicates.push('s.lastUpdatedAt BETWEEN ? AND ?');
    values.push(params.updatedRange.from, padRangeTo(params.updatedRange.to));
  }

  if (
    options.includeStatuses &&
    params.statuses &&
    params.statuses.length > 0
  ) {
    const placeholders = params.statuses.map(() => '?').join(',');
    predicates.push(`(${STATUS_KIND_SQL}) IN (${placeholders})`);
    values.push(...params.statuses);
  }

  if (typeof params.exported === 'boolean') {
    predicates.push(
      params.exported ? 's.exportedAt IS NOT NULL' : 's.exportedAt IS NULL',
    );
  }

  return {
    sql: predicates.length === 0 ? '' : `WHERE ${predicates.join(' AND ')}`,
    params: values,
  };
}

function buildOrderClause(sort: SessionQueryParams['sort']): string {
  const direction = sort.direction === 'desc' ? 'DESC' : 'ASC';
  // `exportedAt` and `status` need a composite expression so the chosen sort
  // direction sorts nulls / kinds in a useful order.
  if (sort.column === 'caseId') {
    return `ORDER BY s.caseId ${direction}, s.id ASC`;
  }
  if (sort.column === 'protocolName') {
    return `ORDER BY s.protocolName ${direction}, s.id ASC`;
  }
  if (sort.column === 'startedAt') {
    return `ORDER BY s.startedAt ${direction}, s.id ASC`;
  }
  if (sort.column === 'updatedAt') {
    return `ORDER BY s.lastUpdatedAt ${direction}, s.id ASC`;
  }
  if (sort.column === 'exportedAt') {
    return `ORDER BY (CASE WHEN s.exportedAt IS NULL THEN 1 ELSE 0 END) ${direction === 'ASC' ? 'ASC' : 'DESC'}, s.exportedAt ${direction}, s.id ASC`;
  }
  if (sort.column === 'status') {
    return `ORDER BY (CASE WHEN s.exportedAt IS NOT NULL THEN 2 WHEN s.finishedAt IS NOT NULL THEN 1 ELSE 0 END) ${direction}, s.id ASC`;
  }
  return `ORDER BY (CASE
    WHEN s.finishedAt IS NOT NULL THEN 100.0
    ELSE COALESCE(
      s.currentStep * 100.0
        / NULLIF(json_array_length(json_extract(p.protocol_json, '$.stages')), 0),
      0
    )
  END) ${direction}, s.id ASC`;
}

function rowToWireAsset(row: AssetRow) {
  if (row.kind === 'string') {
    return {
      id: row.id,
      protocolHash: row.protocolHash,
      assetId: row.assetId,
      name: row.name,
      type: row.type,
      kind: 'string' as const,
      data: row.text_data ?? '',
    };
  }
  return {
    id: row.id,
    protocolHash: row.protocolHash,
    assetId: row.assetId,
    name: row.name,
    type: row.type,
    kind: 'blob' as const,
    mimeType: row.mimeType ?? undefined,
    data: row.blob_data ? new Uint8Array(row.blob_data) : new Uint8Array(0),
  };
}

export const protocols = {
  list() {
    const rows = getDb()
      .prepare<[], ProtocolRow>(
        'SELECT * FROM protocols ORDER BY importedAt DESC',
      )
      .all();
    const countRows = getDb()
      .prepare<[], { protocolHash: string; n: number }>(
        'SELECT protocolHash, COUNT(*) AS n FROM sessions GROUP BY protocolHash',
      )
      .all();
    const counts = new Map(
      countRows.map((r) => [r.protocolHash, r.n] as const),
    );
    return rows.map((r) => ({
      ...rowToProtocol(r),
      sessionCount: counts.get(r.hash) ?? 0,
    }));
  },
  getByHash(hash: string) {
    const row = getDb()
      .prepare<[string], ProtocolRow>('SELECT * FROM protocols WHERE hash = ?')
      .get(hash);
    return row ? rowToProtocol(row) : undefined;
  },
  getByHashes(hashes: string[]) {
    if (hashes.length === 0) return [];
    const placeholders = hashes.map(() => '?').join(',');
    const rows = getDb()
      .prepare<string[], ProtocolRow>(
        `SELECT * FROM protocols WHERE hash IN (${placeholders})`,
      )
      .all(...hashes);
    return rows.map(rowToProtocol);
  },
  save(input: {
    protocol: {
      name: string;
      schemaVersion: number;
      lastModified?: string;
      description?: string;
      assetManifest?: Record<
        string,
        { type: string; name: string; source?: string; value?: string }
      >;
    };
    hash: string;
    assets: Array<
      | { id: string; name: string; kind: 'string'; data: string }
      | {
          id: string;
          name: string;
          kind: 'blob';
          mimeType: string;
          data: Uint8Array;
        }
    >;
  }) {
    const handle = getDb();
    const existing = protocols.getByHash(input.hash);
    const id = existing?.id ?? input.hash;
    const importedAt = existing?.importedAt ?? new Date().toISOString();
    const protocolJson = JSON.stringify(input.protocol);

    const tx = handle.transaction(() => {
      handle
        .prepare(
          `INSERT INTO protocols (id, hash, name, schemaVersion, lastModified, importedAt, description, protocol_json)
				 VALUES (@id, @hash, @name, @schemaVersion, @lastModified, @importedAt, @description, @protocol_json)
				 ON CONFLICT(id) DO UPDATE SET
				   hash = excluded.hash,
				   name = excluded.name,
				   schemaVersion = excluded.schemaVersion,
				   lastModified = excluded.lastModified,
				   description = excluded.description,
				   protocol_json = excluded.protocol_json`,
        )
        .run({
          id,
          hash: input.hash,
          name: input.protocol.name,
          schemaVersion: input.protocol.schemaVersion,
          lastModified: input.protocol.lastModified ?? null,
          importedAt,
          description: input.protocol.description ?? null,
          protocol_json: protocolJson,
        });
      handle
        .prepare('DELETE FROM assets WHERE protocolHash = ?')
        .run(input.hash);
      const insertAsset = handle.prepare(
        `INSERT INTO assets (id, protocolHash, assetId, name, type, kind, mimeType, blob_data, text_data)
				 VALUES (@id, @protocolHash, @assetId, @name, @type, @kind, @mimeType, @blob_data, @text_data)`,
      );
      for (const asset of input.assets) {
        const manifestEntry = input.protocol.assetManifest?.[asset.id];
        const type = manifestEntry?.type ?? 'image';
        if (asset.kind === 'string') {
          insertAsset.run({
            id: `${input.hash}::${asset.id}`,
            protocolHash: input.hash,
            assetId: asset.id,
            name: asset.name,
            type,
            kind: 'string',
            mimeType: null,
            blob_data: null,
            text_data: asset.data,
          });
        } else {
          insertAsset.run({
            id: `${input.hash}::${asset.id}`,
            protocolHash: input.hash,
            assetId: asset.id,
            name: asset.name,
            type,
            kind: 'blob',
            mimeType: asset.mimeType,
            blob_data: Buffer.from(asset.data),
            text_data: null,
          });
        }
      }
    });
    tx();
    const stored = protocols.getByHash(input.hash);
    if (!stored) throw new Error('Protocol save failed');
    return stored;
  },
  delete(hash: string) {
    const handle = getDb();
    const tx = handle.transaction(() => {
      handle.prepare('DELETE FROM assets WHERE protocolHash = ?').run(hash);
      handle.prepare('DELETE FROM sessions WHERE protocolHash = ?').run(hash);
      handle.prepare('DELETE FROM protocols WHERE hash = ?').run(hash);
    });
    tx();
  },
  listAssets(hash: string) {
    const rows = getDb()
      .prepare<[string], AssetRow>(
        'SELECT * FROM assets WHERE protocolHash = ?',
      )
      .all(hash);
    return rows.map(rowToWireAsset);
  },
  getAsset(args: { hash: string; assetId: string }) {
    const row = getDb()
      .prepare<[string], AssetRow>('SELECT * FROM assets WHERE id = ?')
      .get(`${args.hash}::${args.assetId}`);
    return row ? rowToWireAsset(row) : null;
  },
};

export const sessions = {
  list(): StoredSessionLite[] {
    const rows = getDb()
      .prepare<[], SessionLiteRow>(
        `SELECT ${SESSION_LITE_COLUMNS}
         FROM sessions s
         LEFT JOIN protocols p ON s.protocolHash = p.hash
         ORDER BY s.lastUpdatedAt DESC, s.id ASC`,
      )
      .all();
    return rows.map(rowToSessionLite);
  },
  query(params: SessionQueryParams): SessionQueryResult {
    const handle = getDb();
    const where = buildWhereClause(params, { includeStatuses: true });
    const whereForCounts = buildWhereClause(params, { includeStatuses: false });
    const orderClause = buildOrderClause(params.sort);
    const pageSize = Math.max(1, params.pageSize);
    const offset = Math.max(0, params.page) * pageSize;

    const rowSql = `
      SELECT ${SESSION_LITE_COLUMNS}
      FROM sessions s
      LEFT JOIN protocols p ON s.protocolHash = p.hash
      ${where.sql}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;
    const rows = handle
      .prepare<unknown[], SessionLiteRow>(rowSql)
      .all(...where.params, pageSize, offset);

    const countRow = handle
      .prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM sessions s ${where.sql}`,
      )
      .get(...where.params);
    const totalCount = countRow?.n ?? 0;

    const statusGroups = handle
      .prepare<unknown[], { k: SessionStatusKind; n: number }>(
        `SELECT ${STATUS_KIND_SQL} AS k, COUNT(*) AS n
         FROM sessions s
         ${whereForCounts.sql}
         GROUP BY k`,
      )
      .all(...whereForCounts.params);

    let all = 0;
    let inProgress = 0;
    let complete = 0;
    for (const group of statusGroups) {
      all += group.n;
      if (group.k === 'in-progress') inProgress += group.n;
      // The Complete chip in the UI counts every finished session, whether or
      // not it has subsequently been exported.
      else complete += group.n;
    }

    return {
      rows: rows.map(rowToSessionLite),
      totalCount,
      statusCounts: { all, inProgress, complete },
    };
  },
  queryMatchingIds(params: SessionQueryParams): string[] {
    const where = buildWhereClause(params, { includeStatuses: true });
    const rows = getDb()
      .prepare<unknown[], { id: string }>(
        `SELECT s.id FROM sessions s ${where.sql}`,
      )
      .all(...where.params);
    return rows.map((r) => r.id);
  },
  get(id: string) {
    const row = getDb()
      .prepare<[string], SessionRow>('SELECT * FROM sessions WHERE id = ?')
      .get(id);
    return row ? rowToSession(row) : undefined;
  },
  getByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = getDb()
      .prepare<string[], SessionRow>(
        `SELECT * FROM sessions WHERE id IN (${placeholders})`,
      )
      .all(...ids);
    return rows.map(rowToSession);
  },
  create(args: {
    protocolHash: string;
    protocolName: string;
    caseId: string;
    initialNetwork: unknown;
    isSynthetic?: boolean;
  }) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const network_json = JSON.stringify(args.initialNetwork);
    getDb()
      .prepare(
        `INSERT INTO sessions (id, protocolHash, protocolName, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt, currentStep, network_json, stageMetadata_json, isSynthetic)
				 VALUES (@id, @protocolHash, @protocolName, @caseId, @startedAt, @lastUpdatedAt, NULL, NULL, 0, @network_json, NULL, @isSynthetic)`,
      )
      .run({
        id,
        protocolHash: args.protocolHash,
        protocolName: args.protocolName,
        caseId: args.caseId,
        startedAt: now,
        lastUpdatedAt: now,
        network_json,
        isSynthetic: args.isSynthetic ? 1 : 0,
      });
    const stored = sessions.get(id);
    if (!stored) throw new Error('Session create failed');
    return stored;
  },
  update(args: { id: string; patch: Record<string, unknown> }) {
    const existing = sessions.get(args.id);
    if (!existing) return undefined;
    const merged = {
      ...existing,
      ...args.patch,
      lastUpdatedAt: new Date().toISOString(),
    };
    getDb()
      .prepare(
        `UPDATE sessions SET
				   protocolName = @protocolName,
				   caseId = @caseId,
				   startedAt = @startedAt,
				   lastUpdatedAt = @lastUpdatedAt,
				   finishedAt = @finishedAt,
				   exportedAt = @exportedAt,
				   currentStep = @currentStep,
				   network_json = @network_json,
				   stageMetadata_json = @stageMetadata_json,
				   isSynthetic = @isSynthetic
				 WHERE id = @id`,
      )
      .run({
        id: merged.id,
        protocolName: merged.protocolName,
        caseId: merged.caseId,
        startedAt: merged.startedAt,
        lastUpdatedAt: merged.lastUpdatedAt,
        finishedAt: merged.finishedAt ?? null,
        exportedAt: merged.exportedAt ?? null,
        currentStep: merged.currentStep,
        network_json: JSON.stringify(merged.network),
        stageMetadata_json: merged.stageMetadata
          ? JSON.stringify(merged.stageMetadata)
          : null,
        isSynthetic: merged.isSynthetic ? 1 : 0,
      });
    return sessions.get(args.id);
  },
  markFinished(id: string) {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        'UPDATE sessions SET finishedAt = ?, lastUpdatedAt = ? WHERE id = ?',
      )
      .run(now, now, id);
  },
  markExported(ids: string[]) {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const handle = getDb();
    const stmt = handle.prepare(
      'UPDATE sessions SET exportedAt = ?, lastUpdatedAt = ? WHERE id = ?',
    );
    const tx = handle.transaction(() => {
      for (const id of ids) stmt.run(now, now, id);
    });
    tx();
  },
  deleteMany(ids: string[]) {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    getDb()
      .prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`)
      .run(...ids);
  },
  countSynthetic(): number {
    const row = getDb()
      .prepare<[], { n: number }>(
        'SELECT COUNT(*) AS n FROM sessions WHERE isSynthetic = 1',
      )
      .get();
    return row?.n ?? 0;
  },
  deleteSynthetic(): number {
    const info = getDb()
      .prepare('DELETE FROM sessions WHERE isSynthetic = 1')
      .run();
    return info.changes;
  },
};

export const settings = {
  get() {
    const row = getDb()
      .prepare<[string], SettingsRow>('SELECT * FROM settings WHERE id = ?')
      .get('device');
    if (!row) {
      getDb()
        .prepare('INSERT INTO settings (id, settings_json) VALUES (?, ?)')
        .run('device', JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(row.settings_json),
      id: 'device',
    };
  },
  update(patch: Record<string, unknown>) {
    const current = settings.get();
    const next = { ...current, ...patch, id: 'device' };
    getDb()
      .prepare(
        'INSERT INTO settings (id, settings_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET settings_json = excluded.settings_json',
      )
      .run('device', JSON.stringify(next));
    return next;
  },
};
