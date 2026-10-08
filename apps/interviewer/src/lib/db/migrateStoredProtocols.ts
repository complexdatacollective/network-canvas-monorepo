import { getInterviewProgress } from '@codaco/interview';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  type CurrentProtocol,
  hashProtocol,
  type MigratedSession,
  migrateProtocolWithSessions,
  type PersistedSession,
  type SessionMigrator,
  validateProtocol,
} from '@codaco/protocol-validation';

import { db, type StoredProtocolMigrationRecord } from './db';
import {
  decryptAsset,
  decryptProtocol,
  type DecryptedSessionRecord,
  decryptSessionRecord,
  encryptAsset,
  encryptProtocol,
  encryptSession,
  type StoredAssetRow,
  type StoredProtocolRow,
  type StoredSessionRow,
} from './recordCrypto';
import type { StoredProtocol } from './types';

// Bring stored protocols up to the schema version this build's interview
// runtime executes (`COMPATIBLE_PROTOCOL_SCHEMA_VERSION`, read from the
// embedded `@codaco/interview` package rather than written down here).
//
// Why this has to be one transaction: a protocol is stored under its own
// content hash (`id` === `hash`), every session points at its protocol by that
// hash, and every asset row is keyed `${protocolHash}::${assetId}`. Migrating a
// protocol changes its content, so it changes its hash — the protocol row, its
// assets, and its sessions all have to move to the new hash together. Doing
// those writes separately is exactly what would orphan a session or an asset,
// so they happen in a single Dexie read-write transaction over all three
// tables. A row whose migration or validation fails never opens a transaction
// at all, so it and its sessions are left untouched and the sweep continues.
//
// A migration can move stages and change how a session represents its data,
// so repointing a session is not enough: every session of the protocol is
// also carried across the migration — its network, stage metadata and resume
// position (`currentStep`) — by the session migrator protocol-validation
// returns with the migrated protocol (`migrateProtocolWithSessions`), and
// written in the same transaction. A protocol and its sessions migrate
// together or not at all: if the migrator cannot carry even one session, the
// protocol and every one of its sessions are left exactly as stored, and the
// protocol is reported as unable to update (`kind: 'sessions'`), with each
// session's reason. A mixture of migrated and unmigrated sessions would leave
// some interviews readable only by the old app and some only by the new one.
// The protocol's interviews cannot run in this version (the runtime refuses a
// protocol below its schema version), but nothing is lost: every launch tries
// again, so a release that can migrate them picks them up.
//
// Transaction-liveness rule: Dexie auto-commits an open transaction the moment
// the body awaits a non-Dexie promise. Every `crypto.subtle` await (decrypt /
// re-encrypt) and every validation await therefore happens BEFORE the
// transaction opens; the transaction body performs Dexie reads and writes only.

export type MigratedStoredProtocol = {
  name: string;
  fromVersion: number;
  toVersion: number;
  previousHash: string;
  hash: string;
};

/** A session the session migrator could not carry, and why. */
export type UnmigratedSession = {
  id: string;
  reason: string;
};

/**
 * A stored protocol left exactly as it was, with all its sessions.
 *
 * - `protocol`: the protocol itself could not be migrated or validated.
 * - `sessions`: the protocol could be migrated, but at least one of its
 *   sessions could not, so neither the protocol nor any session was changed.
 *   `sessions` names each one that failed.
 */
export type FailedStoredProtocolMigration = {
  name: string;
  hash: string;
  reason: string;
  kind: 'protocol' | 'sessions';
  sessions: UnmigratedSession[];
};

export type StoredProtocolMigrationResult = {
  migrated: MigratedStoredProtocol[];
  failed: FailedStoredProtocolMigration[];
};

function describeFailure(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// Asset ciphertext is bound (as AAD) to the asset row's id, and that id carries
// the protocol hash — so an asset cannot simply be re-keyed, it has to be
// decrypted under the old id and re-encrypted under the new one. Sequential by
// design: a protocol's assets can include large video, and decrypting them all
// concurrently would hold every plaintext copy in memory at once.
async function rekeyAssets(
  previousHash: string,
  hash: string,
): Promise<StoredAssetRow[]> {
  const rows = await db.assets
    .where('protocolHash')
    .equals(previousHash)
    .toArray();
  const rekeyed: StoredAssetRow[] = [];
  for (const row of rows) {
    const asset = await decryptAsset(row);
    rekeyed.push(
      await encryptAsset({
        ...asset,
        id: `${hash}::${asset.assetId}`,
        protocolHash: hash,
      }),
    );
  }
  return rekeyed;
}

/**
 * The source row moved on (or disappeared) between this sweep's read and its
 * commit — another tab re-imported or deleted the protocol while decryption,
 * migration, validation, and encryption were awaiting. The peer's write wins;
 * the row is skipped and the next launch sweep re-evaluates whatever is
 * stored then.
 */
class SourceChangedError extends Error {
  constructor(name: string) {
    super(`"${name}" changed while it was being migrated.`);
    this.name = 'SourceChangedError';
  }
}

// `importedAt` refreshes on every import, so together with the version and
// name it identifies the revision that was read. The document body cannot be
// compared directly here — it may be ciphertext — and does not need to be:
// nothing rewrites a stored protocol in place except imports and this sweep.
const sourceUnchanged = (
  current: StoredProtocolRow | undefined,
  read: StoredProtocolRow,
): current is StoredProtocolRow =>
  current !== undefined &&
  current.importedAt === read.importedAt &&
  current.schemaVersion === read.schemaVersion &&
  current.name === read.name;

/**
 * Some of a protocol's sessions could not be migrated, so nothing of the
 * protocol is written. Thrown before any transaction opens.
 */
class SessionsNotMigratedError extends Error {
  readonly sessions: UnmigratedSession[];
  readonly protocolName: string;

  constructor(name: string, sessions: UnmigratedSession[]) {
    super(
      `${sessions.length} of the interviews recorded with "${name}" could not be migrated, so the protocol and all its interviews were left unchanged.`,
    );
    this.name = 'SessionsNotMigratedError';
    this.sessions = sessions;
    this.protocolName = name;
  }
}

/** The failure, with the error that caused it when a migration step threw. */
function describeSessionFailure(cause: unknown): string {
  const message = describeFailure(cause);
  const inner = cause instanceof Error ? cause.cause : undefined;
  return inner instanceof Error && inner.message !== ''
    ? `${message} ${inner.message}`
    : message;
}

/**
 * The protocol's sessions, migrated and re-encrypted for the transaction to
 * write, keyed to `hash`. Done before the transaction opens, because
 * decrypting and encrypting await `crypto.subtle`.
 */
type MigratedSessionRows = {
  /** Every session read, as read, for the transaction to check unchanged. */
  read: StoredSessionRow[];
  /** Every session, ready to write. */
  rows: StoredSessionRow[];
};

/**
 * Carries one session's payload onto the target protocol: the migrated
 * payload, or `null` when nothing it holds changed. A session migrator
 * (`carryWith`), or a replay of several in turn (`replayMigrations`).
 */
type CarrySession = (
  session: PersistedSession,
) =>
  | { success: true; migrated: MigratedSession | null }
  | { success: false; error: unknown };

const carryWith =
  (migrateSession: SessionMigrator): CarrySession =>
  (session) => {
    const result = migrateSession(session);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, migrated: result.changed ? result.session : null };
  };

/** Decrypts one stored session and carries it onto the target protocol. A
 * session that cannot be decrypted is reported like one that cannot be
 * migrated. */
async function migrateSessionRow(
  row: StoredSessionRow,
  carry: CarrySession,
): Promise<
  | {
      success: true;
      record: DecryptedSessionRecord;
      migrated: MigratedSession | null;
    }
  | { success: false; error: unknown }
> {
  let record: DecryptedSessionRecord;
  try {
    record = await decryptSessionRecord(row);
  } catch (error) {
    return { success: false, error };
  }
  const result = carry({
    network: record.network,
    stageMetadata: record.stageMetadata,
    currentStep: record.currentStep,
  });
  return result.success
    ? { success: true, record, migrated: result.migrated }
    : { success: false, error: result.error };
}

/**
 * The row to write for a session carried onto the protocol stored under
 * `hash`, whose stages are `stages`: its migrated network, stage metadata and
 * resume position (re-encrypted only when the migration changed them), and,
 * for an unfinished session, its progress re-derived as the engine reports it
 * for that position in those stages. Progress is a share of the protocol's
 * stage count, so it moves whenever the stages do, even when nothing the
 * session holds had to change. A finished session's progress stands.
 */
async function carriedSessionRow(
  row: StoredSessionRow,
  record: DecryptedSessionRecord,
  migrated: MigratedSession | null,
  hash: string,
  stages: CurrentProtocol['stages'],
): Promise<StoredSessionRow> {
  const currentStep = migrated?.currentStep ?? row.currentStep;
  const progress =
    record.finishedAt === null
      ? { progress: getInterviewProgress(stages, currentStep).progress }
      : {};
  // Progress is a plaintext field, so an otherwise unchanged session keeps
  // its stored ciphertext.
  if (!migrated) return { ...row, protocolHash: hash, ...progress };
  return encryptSession({
    ...record,
    protocolHash: hash,
    network: migrated.network,
    stageMetadata: migrated.stageMetadata,
    currentStep,
    ...progress,
  });
}

/**
 * The sessions `read`, each carried onto the protocol stored under `hash` by
 * `carryFor(session)` and ready to write, or `SessionsNotMigratedError`
 * naming each one that could not be. Every session is tried, so the report is
 * complete.
 */
async function migrateSessionRows(
  read: readonly StoredSessionRow[],
  carryFor: (row: StoredSessionRow) => CarrySession,
  hash: string,
  stages: CurrentProtocol['stages'],
  name: string,
): Promise<StoredSessionRow[]> {
  const rows: StoredSessionRow[] = [];
  const unmigrated: UnmigratedSession[] = [];
  // Sequential, like the asset re-keying: one session's network at a time.
  for (const row of read) {
    const migration = await migrateSessionRow(row, carryFor(row));
    if (!migration.success) {
      unmigrated.push({
        id: row.id,
        reason: describeSessionFailure(migration.error),
      });
      continue;
    }
    // Nothing will be written once one session has failed.
    if (unmigrated.length > 0) continue;
    rows.push(
      await carriedSessionRow(
        row,
        migration.record,
        migration.migrated,
        hash,
        stages,
      ),
    );
  }
  if (unmigrated.length > 0)
    throw new SessionsNotMigratedError(name, unmigrated);
  return rows;
}

/** A protocol's sessions as read, and carried across its migration. */
async function migrateProtocolSessions(
  previousHash: string,
  hash: string,
  migrateSession: SessionMigrator,
  stages: CurrentProtocol['stages'],
  name: string,
): Promise<MigratedSessionRows> {
  const read = await db.sessions
    .where('protocolHash')
    .equals(previousHash)
    .toArray();
  const carry = carryWith(migrateSession);
  const rows = await migrateSessionRows(read, () => carry, hash, stages, name);
  return { read, rows };
}

/** The fields any session write changes, compared to detect one in the gap
 * between reading a protocol's sessions and committing their migration. */
const sessionUnchanged = (
  current: StoredSessionRow | undefined,
  read: StoredSessionRow,
) =>
  current !== undefined &&
  current.protocolHash === read.protocolHash &&
  current.lastUpdatedAt === read.lastUpdatedAt &&
  current.finishedAt === read.finishedAt &&
  current.exportedAt === read.exportedAt &&
  current.currentStep === read.currentStep &&
  current.localePreference === read.localePreference &&
  current.locale === read.locale;

/**
 * Inside the migration's transaction: the protocol's sessions must be exactly
 * the ones read and migrated, each unchanged since. Otherwise a write landed
 * in the gap, and writing the migrated copies would undo it.
 */
async function assertSessionsUnchanged(
  previousHash: string,
  sessions: MigratedSessionRows,
  name: string,
): Promise<void> {
  const ids = await db.sessions
    .where('protocolHash')
    .equals(previousHash)
    .primaryKeys();
  if (ids.length !== sessions.read.length) {
    throw new SourceChangedError(name);
  }
  for (const read of sessions.read) {
    if (!sessionUnchanged(await db.sessions.get(read.id), read)) {
      throw new SourceChangedError(name);
    }
  }
}

async function migrateStoredProtocolRow(
  row: StoredProtocolRow,
): Promise<MigratedStoredProtocol> {
  const previousHash = row.hash;
  const fromVersion = row.schemaVersion;

  const stored = await decryptProtocol(row);

  // The `name` dependency: v7 and below have no protocol name of their own, so
  // the migration is told the one this library already displays for the row.
  const { protocol: migrated, migrateSession } = migrateProtocolWithSessions(
    stored.protocol,
    COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    { name: stored.name },
  );

  const validation = await validateProtocol(migrated);
  if (!validation.success) throw validation.error;
  // `VersionedProtocol` is a schemaVersion-discriminated union, so this
  // comparison is also what narrows the validated document to the shape the
  // interview runtime executes.
  if (validation.data.schemaVersion !== COMPATIBLE_PROTOCOL_SCHEMA_VERSION) {
    throw new Error(
      `Migration produced schema version ${validation.data.schemaVersion}, not ${COMPATIBLE_PROTOCOL_SCHEMA_VERSION}.`,
    );
  }
  const validated: CurrentProtocol = validation.data;
  const hash = hashProtocol(validated);

  const nextStored: StoredProtocol = {
    ...stored,
    id: hash,
    hash,
    name: validated.name,
    schemaVersion: validated.schemaVersion,
    lastModified: validated.lastModified,
    description: validated.description,
    codebook: validated.codebook,
    protocol: validated,
    // `importedAt` is deliberately carried over from `...stored`: the protocol
    // entered this library when the researcher imported it, and the deck orders
    // cards by that timestamp.
  };
  const protocolRow = await encryptProtocol(nextStored);

  // The hash covers a protocol's structure only (codebook and stages, and from
  // schema 9 the localization declaration), so a migration that changed
  // nothing structural keeps the row's key. Nothing moves: rewrite the row in
  // place and leave sessions and assets alone. A migration to schema 9 always
  // moves the key, because it adds the localization declaration.
  if (hash === previousHash) {
    // The sessions still change: a migration that leaves the structure alone
    // can re-spell what a session holds.
    const sessions = await migrateProtocolSessions(
      previousHash,
      hash,
      migrateSession,
      validated.stages,
      nextStored.name,
    );
    // Guarded like every other commit in this sweep: the async work above
    // left a gap in which another tab may have re-imported (same hash, and —
    // because the hash excludes assets and experiments — possibly different
    // resources) or deleted this protocol, or written one of its sessions.
    // Only the revision that was read may be replaced.
    await db.transaction('rw', db.protocols, db.sessions, async () => {
      const source = await db.protocols.get(row.id);
      if (!sourceUnchanged(source, row)) {
        throw new SourceChangedError(row.name);
      }
      await assertSessionsUnchanged(previousHash, sessions, row.name);
      await db.protocols.put(protocolRow);
      if (sessions.rows.length > 0) await db.sessions.bulkPut(sessions.rows);
    });
    return {
      name: nextStored.name,
      fromVersion,
      toVersion: validated.schemaVersion,
      previousHash,
      hash,
    };
  }

  // Two different protocols migrating onto one hash share a structure, but
  // the hash covers structure only — the rows can still carry
  // different assets (images, API keys) and experiments. Merging them would
  // resume this row's interviews against the other row's resources, so a
  // cross-row collision is refused: this row, its sessions, and its assets
  // stay exactly as they are, and the failure is reported like any other
  // unmigratable protocol. Checked here so the asset re-encryption below is
  // skipped, and checked again inside the transaction, which is what actually
  // decides.
  const collisionError = () =>
    new Error(
      `Migrating "${nextStored.name}" produces the same content hash as ` +
        'another stored protocol. The two are not interchangeable (their ' +
        'media and settings can differ), so this protocol was left unchanged.',
    );
  if ((await db.protocols.where('hash').equals(hash).first()) !== undefined) {
    throw collisionError();
  }
  // Sessions first: if one cannot be migrated nothing is written, so the
  // assets, which can be large, are not re-encrypted for nothing.
  const sessions = await migrateProtocolSessions(
    previousHash,
    hash,
    migrateSession,
    validated.stages,
    nextStored.name,
  );
  const assetRows = await rekeyAssets(previousHash, hash);

  await db.transaction(
    'rw',
    db.protocols,
    db.sessions,
    db.assets,
    db.protocolMigrations,
    async () => {
      // The source must still be the revision that was read — another tab
      // re-importing or deleting it in the gap wins, and this row waits for
      // the next launch sweep.
      const source = await db.protocols.get(row.id);
      if (!sourceUnchanged(source, row)) {
        throw new SourceChangedError(row.name);
      }
      const existing = await db.protocols.where('hash').equals(hash).first();
      // A collider that appeared since the check above aborts the
      // transaction, rolling back everything, and reports the refusal.
      if (existing) throw collisionError();
      await db.protocols.put(protocolRow);
      if (assetRows.length > 0) await db.assets.bulkPut(assetRows);
      // The durable re-keying record: a writer still running the pre-update
      // bundle can restore `previousHash` onto a session after this commit,
      // and the next launch's heal pass follows this record to repair it.
      // It keeps the replaced row, so the heal pass can carry such a
      // session's data across this same migration.
      await db.protocolMigrations.put({
        previousHash,
        hash,
        migratedAt: new Date().toISOString(),
        source: { row, toVersion: validated.schemaVersion },
      });
      // The migrated sessions carry the new hash; a session written since
      // they were read aborts the commit, and the next launch tries again.
      await assertSessionsUnchanged(previousHash, sessions, row.name);
      if (sessions.rows.length > 0) await db.sessions.bulkPut(sessions.rows);
      await db.assets.where('protocolHash').equals(previousHash).delete();
      await db.protocols.delete(row.id);
    },
  );

  return {
    name: nextStored.name,
    fromVersion,
    toVersion: validated.schemaVersion,
    previousHash,
    hash,
  };
}

/**
 * The re-keying records from `start` to the hash its protocol is stored
 * under now, in order. A protocol migrated more than once leaves a chain of
 * records. The bound guards against a corrupt cycle looping.
 */
function followMigrations(
  records: ReadonlyMap<string, StoredProtocolMigrationRecord>,
  start: string,
): { hops: StoredProtocolMigrationRecord[]; hash: string } {
  const hops: StoredProtocolMigrationRecord[] = [];
  let hash = start;
  for (let hop = 0; hop <= records.size; hop += 1) {
    const record = records.get(hash);
    if (record === undefined) break;
    hops.push(record);
    hash = record.hash;
  }
  return { hops, hash };
}

/**
 * The superseded hashes whose chain of re-keying records leads to `hash`:
 * the records to delete with the protocol stored under it.
 */
export function supersededHashesOf(
  records: readonly StoredProtocolMigrationRecord[],
  hash: string,
): string[] {
  const byPreviousHash = new Map(
    records.map((record) => [record.previousHash, record]),
  );
  return records
    .map((record) => record.previousHash)
    .filter(
      (previousHash) =>
        followMigrations(byPreviousHash, previousHash).hash === hash,
    );
}

/**
 * The session migrator of the migration a record describes, rebuilt from the
 * protocol row it replaced; `null` for a record from before sessions were
 * migrated, whose migration repointed sessions without changing them.
 */
async function recordedSessionMigrator(
  record: StoredProtocolMigrationRecord,
): Promise<SessionMigrator | null> {
  if (!record.source) return null;
  const stored = await decryptProtocol(record.source.row);
  return migrateProtocolWithSessions(stored.protocol, record.source.toVersion, {
    name: stored.name,
  }).migrateSession;
}

/**
 * Carries a session across each migration in `hops` in turn, as each carried
 * the sessions it found when it ran. A migration that cannot be rebuilt fails
 * every session that has to cross it.
 */
async function replayMigrations(
  hops: readonly StoredProtocolMigrationRecord[],
  migrators: Map<string, Promise<SessionMigrator | null>>,
): Promise<CarrySession> {
  const steps: (SessionMigrator | null)[] = [];
  try {
    for (const hop of hops) {
      const migrator =
        migrators.get(hop.previousHash) ?? recordedSessionMigrator(hop);
      migrators.set(hop.previousHash, migrator);
      steps.push(await migrator);
    }
  } catch (error) {
    return () => ({ success: false, error });
  }
  return (session) => {
    let current: PersistedSession = session;
    let migrated: MigratedSession | null = null;
    for (const step of steps) {
      if (!step) continue;
      const result = step(current);
      if (!result.success) return { success: false, error: result.error };
      current = result.session;
      if (result.changed || migrated) migrated = result.session;
    }
    return { success: true, migrated };
  };
}

/**
 * Carry the sessions `read`, each written back under a superseded hash, onto
 * the protocol their chain of re-keying records leads to, `hash` — all of
 * them or none, like the migration itself.
 */
async function healSessionsOnto(
  hash: string,
  read: readonly StoredSessionRow[],
  records: ReadonlyMap<string, StoredProtocolMigrationRecord>,
): Promise<void> {
  const target = await db.protocols.get(hash);
  // The protocol was deleted: there is nothing to carry the sessions onto,
  // so they stay where they are.
  if (!target) return;
  const { name, protocol } = await decryptProtocol(target);

  const migrators = new Map<string, Promise<SessionMigrator | null>>();
  const carries = new Map<string, CarrySession>();
  for (const start of new Set(read.map((row) => row.protocolHash))) {
    carries.set(
      start,
      await replayMigrations(followMigrations(records, start).hops, migrators),
    );
  }
  const rows = await migrateSessionRows(
    read,
    (row) => {
      const carry = carries.get(row.protocolHash);
      if (!carry) throw new Error(`No migration path for ${row.id}.`);
      return carry;
    },
    hash,
    protocol.stages,
    name,
  );

  // Guarded like the migration's own commit: a write in the gap wins, and
  // the next launch tries again.
  await db.transaction('rw', db.protocols, db.sessions, async () => {
    if (!sourceUnchanged(await db.protocols.get(hash), target)) {
      throw new SourceChangedError(name);
    }
    for (const row of read) {
      if (!sessionUnchanged(await db.sessions.get(row.id), row)) {
        throw new SourceChangedError(name);
      }
    }
    await db.sessions.bulkPut(rows);
  });
}

/**
 * Carry any session still referencing a superseded protocol hash across the
 * migrations that superseded it.
 *
 * A tab still executing the pre-update bundle writes sessions
 * unconditionally — and the PWA deliberately lets an interview tab keep its
 * old bundle while other tabs update. Such a late write restores a hash the
 * migration deleted, together with data in that protocol's schema. A tab
 * running a bundle with `updateSession`'s write basis does the same on
 * purpose: it stores a whole-state write under the protocol it was computed
 * against, and refuses a partial one. Every
 * launch therefore follows the durable re-keying records and replays each
 * migration's session migrator over whatever a legacy writer left behind:
 * no session may point at a protocol whose schema its data has not been
 * migrated to.
 *
 * Healing is all or nothing per protocol, like the migration: if one late
 * session cannot be carried, none is, and the protocol is reported in the
 * returned failures (`kind: 'sessions'`) — which leaves it unavailable, so
 * none of its interviews runs until every one can.
 */
async function healSupersededSessions(): Promise<
  FailedStoredProtocolMigration[]
> {
  const records = new Map(
    (await db.protocolMigrations.toArray()).map((record) => [
      record.previousHash,
      record,
    ]),
  );
  // The late sessions, by the hash of the protocol they belong to now.
  const late = new Map<string, StoredSessionRow[]>();
  for (const previousHash of records.keys()) {
    const rows = await db.sessions
      .where('protocolHash')
      .equals(previousHash)
      .toArray();
    if (rows.length === 0) continue;
    const { hash } = followMigrations(records, previousHash);
    late.set(hash, [...(late.get(hash) ?? []), ...rows]);
  }

  const failed: FailedStoredProtocolMigration[] = [];
  for (const [hash, read] of late) {
    try {
      await healSessionsOnto(hash, read, records);
    } catch (cause) {
      if (cause instanceof SourceChangedError) continue;
      if (cause instanceof SessionsNotMigratedError) {
        failed.push(reportFailure(cause.protocolName, hash, cause));
        continue;
      }
      // No other signal: these sessions stay under their superseded hash for
      // this launch, and the next launch retries. Only the console says why.
      // oxlint-disable-next-line no-console -- only diagnostic for a healing failure that is otherwise silently retried
      console.error('Could not heal superseded session references', cause);
    }
  }
  return failed;
}

/** The failure entry for a protocol left unchanged, logged with its cause. */
function reportFailure(
  name: string,
  hash: string,
  cause: unknown,
): FailedStoredProtocolMigration {
  const sessions =
    cause instanceof SessionsNotMigratedError ? cause.sessions : [];
  // `reason` is only `cause.message`, not the full error/stack — the console
  // call is the only place that survives for debugging.
  // oxlint-disable-next-line no-console -- keeps the full error/stack; `reason` only carries the message string
  console.error(
    `Could not migrate stored protocol "${name}"`,
    cause,
    ...(sessions.length > 0 ? [sessions] : []),
  );
  return {
    name,
    hash,
    reason: describeFailure(cause),
    kind: cause instanceof SessionsNotMigratedError ? 'sessions' : 'protocol',
    sessions,
  };
}

/**
 * Migrate every stored protocol below the runtime's compatible schema version,
 * repointing its sessions and assets onto the recomputed hash.
 *
 * Never rejects. A row that cannot be migrated or validated, or whose sessions
 * cannot all be migrated with it, is reported in `failed` and left exactly as
 * it was together with all its sessions — the caller surfaces that, and the
 * app still launches. Safe to re-run, and re-run on every launch: a row
 * already at the compatible version is not looked at, and a row left behind
 * is tried again.
 */
export async function migrateStoredProtocols(): Promise<StoredProtocolMigrationResult> {
  const migrated: MigratedStoredProtocol[] = [];
  const failed: FailedStoredProtocolMigration[] = [];

  // Heal first, and on every launch — the legacy write this repairs can land
  // long after the migration that re-keyed the protocol.
  try {
    failed.push(...(await healSupersededSessions()));
  } catch (cause) {
    // No other signal: this healing step is silently skipped for this launch,
    // and the next launch retries it. Only the console records why.
    // oxlint-disable-next-line no-console -- only diagnostic for a healing-step failure that is otherwise silently skipped
    console.error('Could not heal superseded session references', cause);
  }
  // A protocol whose late sessions could not be healed is left exactly as it
  // is, so it is not migrated either.
  const unhealed = new Set(failed.map((entry) => entry.hash));

  let outdatedIds: string[];
  try {
    // Streamed rather than `toArray()`d: `schemaVersion` is not indexed, so the
    // scan has to read the rows, and there is no reason to hold every stored
    // protocol in memory to answer a question about one field of each.
    const ids: string[] = [];
    await db.protocols.each((row) => {
      if (
        row.schemaVersion < COMPATIBLE_PROTOCOL_SCHEMA_VERSION &&
        !unhealed.has(row.hash)
      ) {
        ids.push(row.id);
      }
    });
    outdatedIds = ids;
  } catch (cause) {
    // No other signal: the caller only sees an empty result, indistinguishable
    // from "nothing needed migrating". Only the console records why the scan
    // itself failed.
    // oxlint-disable-next-line no-console -- only diagnostic for a scan failure the caller cannot otherwise distinguish from "nothing to migrate"
    console.error(
      'Could not read stored protocols to check their schema version',
      cause,
    );
    return { migrated, failed };
  }

  for (const id of outdatedIds) {
    // The read is inside the try with everything else: this function's contract
    // is that it never rejects, and its caller holds the app's first paint on
    // that promise resolving.
    let row: StoredProtocolRow | undefined;
    try {
      // Re-read rather than reuse the streamed row: nothing else writes during
      // launch, but a fresh read is what makes each row's work self-contained.
      row = await db.protocols.get(id);
      if (!row) continue;
      migrated.push(await migrateStoredProtocolRow(row));
    } catch (cause) {
      if (cause instanceof SourceChangedError) {
        // Not a failure: a peer's write superseded this row mid-migration and
        // nothing was changed. The next launch sweep re-evaluates it.
        continue;
      }
      failed.push(reportFailure(row?.name ?? id, row?.hash ?? id, cause));
    }
  }

  return { migrated, failed };
}
