import { parseArgs } from 'node:util';

import type pg from 'pg';

import { checkSchema } from '../db/schema.ts';
import type { EncryptionEnv } from '../env/encryption.ts';
import {
  initializeCredentialMigration,
  initializeEncryption,
  resumeEncryptionMaintenance,
} from './initialize.ts';
import {
  migrateLegacyDataBatch,
  parseLegacyCursor,
  parseRotationCursor,
  rotateEncryptionBatch,
  type RotationCursor,
} from './maintenance.ts';

/** One bounded command; output contains only counts, stable IDs and cursor metadata. */
export async function runEncryptionCommand(
  args: string[],
  maintenancePool: pg.Pool,
  encryption: EncryptionEnv,
  admission: {
    allowedLogins: readonly string[];
    administrativeLogins?: readonly string[];
    schemaPool?: pg.Pool;
  },
  legacyOperatorPool?: pg.Pool,
) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      'limit': { type: 'string' },
      'cursor': { type: 'string' },
      'after-id': { type: 'string' },
    },
  });
  const operation = positionals[0];
  if (
    positionals.length !== 1 ||
    !['verify', 'rotate', 'migrate-legacy'].includes(operation ?? '')
  )
    throw new Error('Invalid encryption command.');
  if (
    (operation === 'verify' && Object.keys(values).length > 0) ||
    (operation !== 'rotate' && values.cursor !== undefined) ||
    (operation !== 'migrate-legacy' && values['after-id'] !== undefined)
  )
    throw new Error('Invalid encryption command options.');
  const limit = Number(values.limit ?? '100');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Encryption command limit must be between 1 and 100.');
  let cursor: RotationCursor | undefined;
  if (values.cursor !== undefined) {
    if (values.cursor.length > 4096)
      throw new Error('Invalid rotation cursor.');
    const value: unknown = JSON.parse(values.cursor);
    cursor = parseRotationCursor(value);
  }
  const afterId = parseLegacyCursor(values['after-id'] ?? null);
  if (
    (
      await checkSchema(admission.schemaPool ?? maintenancePool, {
        allowedLogins: admission.allowedLogins,
        administrativeLogins: admission.administrativeLogins,
      })
    ).kind !== 'current'
  )
    throw new Error('Encryption maintenance requires the current schema.');
  if (operation === 'migrate-legacy' && !legacyOperatorPool)
    throw new Error(
      'Legacy conversion requires its separate operator connection.',
    );
  const input = { maintenancePool, ...encryption };
  const resumed =
    (operation === 'rotate' && cursor !== undefined) ||
    (operation === 'migrate-legacy' && afterId !== null);
  const keys = await (resumed
    ? resumeEncryptionMaintenance(input)
    : operation === 'migrate-legacy'
      ? initializeCredentialMigration(input)
      : initializeEncryption(input));
  if (operation === 'verify') return { operation, verified: true } as const;
  if (operation === 'rotate')
    return {
      operation,
      ...(await rotateEncryptionBatch(maintenancePool, keys, {
        limit,
        cursor,
      })),
    };
  return {
    operation,
    ...(await migrateLegacyDataBatch(
      maintenancePool,
      legacyOperatorPool!,
      keys,
      {
        limit,
        afterId,
      },
    )),
  };
}
