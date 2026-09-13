import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

import { z } from 'zod';

import { canonicalize } from '@codaco/studio-sync/apply';
import { normalizeMailbox } from '@codaco/studio-sync/email-sender';
import {
  parseBoundedJson,
  templateBytesHash,
} from '@codaco/studio-sync/template-exchange';
import { OrcidSchema } from '@codaco/studio-sync/template-metadata';
import { RegistryPublisherNameSchema } from '@codaco/studio-sync/template-registry-contract';

const userId = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => value.isWellFormed() && !value.includes('\0'));

const canonicalUuid = z.uuid().transform((value) => value.toLowerCase());
const sha256 = z
  .string()
  .length(64)
  .regex(/^[0-9a-f]+$/);
const artifactRoot = sha256;
const inventoryCount = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/)
  .refine(
    (value) =>
      BigInt(value).toString() === value &&
      BigInt(value) <= 9_223_372_036_854_775_807n,
  );
const inventory = z.strictObject({
  count: inventoryCount,
  sha256,
});

const inventoryRows = {
  users: z.strictObject({
    id: userId,
    email: z.email().max(254).transform(normalizeMailbox),
    emailVerified: z.boolean(),
  }),
  publishers: z.strictObject({
    id: canonicalUuid,
    userId,
    name: RegistryPublisherNameSchema,
    orcid: OrcidSchema.nullable(),
    suspended: z.boolean(),
  }),
  operators: z.strictObject({ userId }),
  artifacts: z.strictObject({
    root: artifactRoot,
    blocked: z.boolean(),
    deleted: z.boolean(),
  }),
  entries: z.strictObject({
    id: canonicalUuid,
    publisherId: canonicalUuid,
    artifactRoot,
    yanked: z.boolean(),
  }),
};

export type RegistryRecoveryInventoryKind = keyof typeof inventoryRows;
export type RegistryRecoveryInventory = z.infer<typeof inventory>;
export type RegistryRecoveryInventoryRow = {
  [Kind in RegistryRecoveryInventoryKind]: z.input<
    (typeof inventoryRows)[Kind]
  >;
};

type ParsedInventoryRow =
  | z.output<(typeof inventoryRows)['users']>
  | z.output<(typeof inventoryRows)['publishers']>
  | z.output<(typeof inventoryRows)['operators']>
  | z.output<(typeof inventoryRows)['entries']>
  | z.output<(typeof inventoryRows)['artifacts']>;

function parseInventoryRow<Kind extends RegistryRecoveryInventoryKind>(
  kind: Kind,
  value: RegistryRecoveryInventoryRow[Kind],
): ParsedInventoryRow {
  switch (kind) {
    case 'users':
      return inventoryRows.users.parse(value);
    case 'publishers':
      return inventoryRows.publishers.parse(value);
    case 'operators':
      return inventoryRows.operators.parse(value);
    case 'entries':
      return inventoryRows.entries.parse(value);
    case 'artifacts':
      return inventoryRows.artifacts.parse(value);
  }
  throw new Error('Unknown recovery inventory kind.');
}

function inventoryRowKey(
  kind: RegistryRecoveryInventoryKind,
  value: ParsedInventoryRow,
): string {
  if (kind === 'operators' && 'userId' in value) return value.userId;
  if ('id' in value) return value.id;
  if ('root' in value) return value.root;
  throw new Error('Recovery inventory row does not match its kind.');
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

/**
 * Hash a pre-sorted independently reviewed authority inventory without keeping
 * its population in memory. Rows use UTF-8 byte ordering by their stable ID.
 */
export function createRegistryRecoveryInventoryAccumulator<
  Kind extends RegistryRecoveryInventoryKind,
>(kind: Kind) {
  const hash = createHash('sha256');
  let count = 0n;
  let previousKey: string | undefined;
  let finished = false;
  return {
    add(value: RegistryRecoveryInventoryRow[Kind]): void {
      if (finished) throw new Error('Recovery inventory is already complete.');
      const row = parseInventoryRow(kind, value);
      const key = inventoryRowKey(kind, row);
      if (previousKey !== undefined && compareUtf8(previousKey, key) >= 0)
        throw new Error('Recovery inventory rows are not strictly ordered.');
      hash.update(canonicalize({ kind, value: row }));
      hash.update('\n');
      previousKey = key;
      count += 1n;
    },
    finish(): RegistryRecoveryInventory {
      if (finished) throw new Error('Recovery inventory is already complete.');
      finished = true;
      return { count: count.toString(), sha256: hash.digest('hex') };
    },
  };
}

export function createRegistryRecoveryInventory<
  Kind extends RegistryRecoveryInventoryKind,
>(
  kind: Kind,
  rows: Iterable<RegistryRecoveryInventoryRow[Kind]>,
): RegistryRecoveryInventory {
  const accumulator = createRegistryRecoveryInventoryAccumulator(kind);
  for (const row of rows) accumulator.add(row);
  return accumulator.finish();
}

const reconciliationSchema = z.strictObject({
  format: z.literal('template-registry-recovery-reconciliation'),
  version: z.literal(4),
  inventories: z.strictObject({
    users: inventory,
    publishers: inventory,
    operators: inventory,
    entries: inventory,
    artifacts: inventory,
  }),
});

export type RegistryRecoveryReconciliation = z.infer<
  typeof reconciliationSchema
>;

export function copyRegistryRecoveryReconciliation(
  value: RegistryRecoveryReconciliation,
): RegistryRecoveryReconciliation {
  return reconciliationSchema.parse(value);
}

/** Read independently obtained current permission evidence, never the restore. */
export async function readRegistryRecoveryReconciliation(
  path: string,
  expectedSha256: string,
): Promise<RegistryRecoveryReconciliation> {
  try {
    if (expectedSha256.length !== 64 || !/^[0-9a-f]+$/.test(expectedSha256))
      throw new Error();
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
      throw new Error();
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.dev !== info.dev ||
        opened.ino !== info.ino ||
        (opened.mode & 0o077) !== 0 ||
        opened.size > 16 * 1024 * 1024 ||
        opened.size === 0
      )
        throw new Error();
      const buffer = Buffer.alloc(opened.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(
          buffer,
          length,
          buffer.length - length,
          null,
        );
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      const after = await handle.stat();
      const bytes = buffer.subarray(0, length);
      if (
        length !== opened.size ||
        after.size !== opened.size ||
        (after.mode & 0o077) !== 0 ||
        templateBytesHash(bytes) !== expectedSha256
      )
        throw new Error();
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return reconciliationSchema.parse(parseBoundedJson(text));
    } finally {
      await handle.close();
    }
  } catch {
    throw new Error('REGISTRY_RECOVERY_RECONCILIATION_INVALID');
  }
}
