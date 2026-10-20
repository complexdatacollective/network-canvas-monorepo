import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  type CurrentProtocol,
  hashProtocol,
  migrateProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

import { getProtocolByHash, saveProtocol } from '../db/api';
import { isCurrentUpgrade } from '../db/db';
import { readLegacyProtocolSnapshot } from '../db/legacyLibrary';
import { getLegacyUpgrade } from '../db/protocols';

// "Upgrade to schema 9" for a protocol in Interviewer 8's library: a new
// schema 9 protocol in this app's database, made from the schema 8 one.
//
// - The original stays exactly as it is in Interviewer 8's database, which is
//   only ever read (see `legacyLibrary`), and keeps working there.
// - No interview is carried over: interviews collected with the schema 8
//   protocol stay with it, in Interviewer 8.
// - The copy is recorded in `legacyUpgrades`, in the same transaction that
//   saves it, so the deck can say so and a second upgrade opens the existing
//   copy rather than making another, while the original is as it was then.
//   Once Interviewer 8 has re-imported it, upgrading again makes the copy
//   afresh (in place when the upgraded hash is unchanged, as a re-import here
//   would).

export type LegacyUpgradeFailureReason =
  /** The device is locked, or Interviewer 8's database could not be read. */
  'read-failed' | 'migration-failed' | 'validation-failed' | 'save-failed';

export type LegacyUpgradeResult =
  | { status: 'upgraded'; hash: string; protocol: CurrentProtocol }
  /** Upgraded before, and that copy is still here: open it. */
  | { status: 'existing'; hash: string }
  /** Interviewer 8 has no such schema 8 protocol (any more). */
  | { status: 'not-found' }
  | {
      status: 'failed';
      reason: LegacyUpgradeFailureReason;
      cause?: unknown;
      issues?: { path: string; message: string }[];
    };

const failed = (
  reason: LegacyUpgradeFailureReason,
  extra: { cause?: unknown; issues?: { path: string; message: string }[] } = {},
): LegacyUpgradeResult => ({ status: 'failed', reason, ...extra });

/**
 * The hash of the copy an earlier upgrade of `legacy` made, when that copy is
 * still in this app's library and was made from the original as it is now;
 * otherwise null (never upgraded, the copy has since been deleted, or
 * Interviewer 8 has re-imported the original, so upgrading makes it afresh).
 */
export async function findUpgradedCopy(legacy: {
  hash: string;
  importedAt: string;
}): Promise<string | null> {
  const previous = await getLegacyUpgrade(legacy.hash);
  if (
    previous &&
    isCurrentUpgrade(previous, legacy) &&
    (await getProtocolByHash(previous.upgradedHash))
  ) {
    return previous.upgradedHash;
  }
  return null;
}

export async function upgradeLegacyProtocol(
  legacyHash: string,
  now: () => Date = () => new Date(),
): Promise<LegacyUpgradeResult> {
  let snapshot: Awaited<ReturnType<typeof readLegacyProtocolSnapshot>>;
  try {
    snapshot = await readLegacyProtocolSnapshot(legacyHash);
  } catch (cause) {
    return failed('read-failed', { cause });
  }
  if (!snapshot) return { status: 'not-found' };
  const { protocol: legacy, assets } = snapshot;

  const existing = await findUpgradedCopy(legacy);
  if (existing) return { status: 'existing', hash: existing };

  let migrated: unknown;
  try {
    // A schema 8 document need not carry its name (Interviewer 8 keeps it on
    // the row, from the file name); schema 9 requires one, so the copy gets
    // the name the researcher knows it by.
    const document: unknown = { name: legacy.name, ...legacy.protocol };
    migrated = migrateProtocol(document, COMPATIBLE_PROTOCOL_SCHEMA_VERSION, {
      name: legacy.name,
    });
  } catch (cause) {
    return failed('migration-failed', { cause });
  }

  const validation = await validateProtocol(migrated);
  if (!validation.success) {
    return failed('validation-failed', {
      issues: validation.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
  }
  if (validation.data.schemaVersion !== COMPATIBLE_PROTOCOL_SCHEMA_VERSION) {
    return failed('validation-failed');
  }
  const protocol: CurrentProtocol = validation.data;
  const hash = hashProtocol(protocol);

  try {
    await saveProtocol(
      protocol,
      hash,
      assets.map(({ assetId, name, data }) => ({ id: assetId, name, data })),
      {
        legacyUpgrade: {
          legacyHash,
          upgradedHash: hash,
          legacyImportedAt: legacy.importedAt,
          upgradedAt: now().toISOString(),
        },
      },
    );
  } catch (cause) {
    return failed('save-failed', { cause });
  }

  return { status: 'upgraded', hash, protocol };
}
