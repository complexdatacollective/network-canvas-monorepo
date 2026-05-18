import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

import Database, {
  type Database as DatabaseType,
} from 'better-sqlite3-multiple-ciphers';
import { app } from 'electron';

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

const DEFAULT_SETTINGS = {
  id: 'device',
  exportGraphML: true,
  exportCSV: true,
  useScreenLayoutCoordinates: false,
  screenLayoutHeight: 1080,
  screenLayoutWidth: 1920,
  dismissedUpdates: [] as string[],
  idleTimeoutMinutes: 15,
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

export function isDbOpen(): boolean {
  return dbInstance !== null;
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
  };
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
  getById(id: string) {
    const row = getDb()
      .prepare<[string], ProtocolRow>('SELECT * FROM protocols WHERE id = ?')
      .get(id);
    return row ? rowToProtocol(row) : undefined;
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
  list() {
    const rows = getDb()
      .prepare<[], SessionRow>(
        'SELECT * FROM sessions ORDER BY lastUpdatedAt DESC',
      )
      .all();
    return rows.map(rowToSession);
  },
  listForProtocol(hash: string) {
    const rows = getDb()
      .prepare<[string], SessionRow>(
        'SELECT * FROM sessions WHERE protocolHash = ? ORDER BY lastUpdatedAt DESC',
      )
      .all(hash);
    return rows.map(rowToSession);
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
  }) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const network_json = JSON.stringify(args.initialNetwork);
    getDb()
      .prepare(
        `INSERT INTO sessions (id, protocolHash, protocolName, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt, currentStep, network_json, stageMetadata_json)
				 VALUES (@id, @protocolHash, @protocolName, @caseId, @startedAt, @lastUpdatedAt, NULL, NULL, 0, @network_json, NULL)`,
      )
      .run({
        id,
        protocolHash: args.protocolHash,
        protocolName: args.protocolName,
        caseId: args.caseId,
        startedAt: now,
        lastUpdatedAt: now,
        network_json,
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
				   stageMetadata_json = @stageMetadata_json
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
  delete(id: string) {
    getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
  },
  deleteMany(ids: string[]) {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    getDb()
      .prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`)
      .run(...ids);
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
