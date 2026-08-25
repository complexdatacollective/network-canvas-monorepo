import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  type CurrentProtocol,
  hashProtocol,
  migrateProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

import { db } from './db';
import {
  decryptAsset,
  decryptProtocol,
  encryptAsset,
  encryptProtocol,
  type StoredAssetRow,
  type StoredProtocolRow,
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
// This is a no-op for every library in the field today: the only schema version
// Interviewer has ever stored is the current one. It ships built and tested so
// that the release which introduces a new schema version cannot orphan the
// sessions of a protocol it migrates.
//
// Two properties of a migration are what make repointing sessions sufficient,
// and protocol-validation's migration module states both as binding invariants:
// a migration never adds, removes, or reorders stages (so a session's
// `currentStep` still names the same stage), and never changes the shape of a
// collected answer (so `network` needs no rewriting). A future migration rule
// that breaks either one forces this file to be redesigned in the same change.
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

export type FailedStoredProtocolMigration = {
  name: string;
  hash: string;
  reason: string;
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

async function migrateStoredProtocolRow(
  row: StoredProtocolRow,
): Promise<MigratedStoredProtocol> {
  const previousHash = row.hash;
  const fromVersion = row.schemaVersion;

  const stored = await decryptProtocol(row);

  // The `name` dependency: v7 and below have no protocol name of their own, so
  // the migration is told the one this library already displays for the row.
  const migrated = migrateProtocol(
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

  // The hash covers a protocol's structure (codebook + stages) only, so a
  // migration that changed nothing structural — an empty protocol, say — keeps
  // the row's key. Nothing moves: rewrite the row in place and leave sessions
  // and assets alone.
  if (hash === previousHash) {
    // Guarded like every other commit in this sweep: the async work above
    // left a gap in which another tab may have re-imported (same hash, and —
    // because the hash excludes assets and experiments — possibly different
    // resources) or deleted this protocol. Only the revision that was read
    // may be replaced.
    await db.transaction('rw', db.protocols, async () => {
      const source = await db.protocols.get(row.id);
      if (!sourceUnchanged(source, row)) {
        throw new SourceChangedError(row.name);
      }
      await db.protocols.put(protocolRow);
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
  // the hash covers codebook and stages only — the rows can still carry
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
      await db.protocolMigrations.put({
        previousHash,
        hash,
        migratedAt: new Date().toISOString(),
      });
      // Query the sessions by primary key rather than by the `protocolHash`
      // index we are about to rewrite: Dexie leaves the result undefined when a
      // `modify` changes the very index it is iterating.
      const sessionIds = await db.sessions
        .where('protocolHash')
        .equals(previousHash)
        .primaryKeys();
      if (sessionIds.length > 0) {
        await db.sessions
          .where('id')
          .anyOf(sessionIds)
          .modify({ protocolHash: hash });
      }
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
 * Repoint any session still referencing a superseded protocol hash.
 *
 * The commit-time guard in `updateSession` protects writers running THIS
 * bundle, but a tab still executing the pre-update bundle writes sessions
 * unconditionally — and the PWA deliberately lets an interview tab keep its
 * old bundle while other tabs update. Such a late write can restore a hash
 * the migration deleted. Every launch therefore follows the durable
 * re-keying records and repairs whatever a legacy writer left behind.
 */
async function healSupersededSessionReferences(): Promise<void> {
  const records = await db.protocolMigrations.toArray();
  if (records.length === 0) return;
  const forward = new Map(
    records.map((record) => [record.previousHash, record.hash]),
  );
  // A protocol migrated more than once leaves a chain of records; follow it
  // to the live hash. The bound guards against a corrupt cycle looping.
  const terminal = (start: string): string => {
    let current = start;
    for (let hop = 0; hop <= forward.size; hop += 1) {
      const next = forward.get(current);
      if (next === undefined) return current;
      current = next;
    }
    return current;
  };
  await db.transaction('rw', db.sessions, async () => {
    for (const previousHash of forward.keys()) {
      const sessionIds = await db.sessions
        .where('protocolHash')
        .equals(previousHash)
        .primaryKeys();
      if (sessionIds.length === 0) continue;
      const hash = terminal(previousHash);
      await db.sessions
        .where('id')
        .anyOf(sessionIds)
        .modify({ protocolHash: hash });
    }
  });
}

/**
 * Migrate every stored protocol below the runtime's compatible schema version,
 * repointing its sessions and assets onto the recomputed hash.
 *
 * Never rejects. A row that cannot be migrated or validated is reported in
 * `failed` and left exactly as it was — the caller surfaces that, and the app
 * still launches. Safe to re-run: a row already at the compatible version is
 * not looked at.
 */
export async function migrateStoredProtocols(): Promise<StoredProtocolMigrationResult> {
  const migrated: MigratedStoredProtocol[] = [];
  const failed: FailedStoredProtocolMigration[] = [];

  // Heal first, and on every launch — the legacy write this repairs can land
  // long after the migration that re-keyed the protocol.
  try {
    await healSupersededSessionReferences();
  } catch (cause) {
    console.error('Could not heal superseded session references', cause);
  }

  let outdatedIds: string[];
  try {
    // Streamed rather than `toArray()`d: `schemaVersion` is not indexed, so the
    // scan has to read the rows, and there is no reason to hold every stored
    // protocol in memory to answer a question about one field of each.
    const ids: string[] = [];
    await db.protocols.each((row) => {
      if (row.schemaVersion < COMPATIBLE_PROTOCOL_SCHEMA_VERSION) {
        ids.push(row.id);
      }
    });
    outdatedIds = ids;
  } catch (cause) {
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
        console.info(cause.message);
        continue;
      }
      const name = row?.name ?? id;
      console.error(`Could not migrate stored protocol "${name}"`, cause);
      failed.push({
        name,
        hash: row?.hash ?? id,
        reason: describeFailure(cause),
      });
    }
  }

  return { migrated, failed };
}
