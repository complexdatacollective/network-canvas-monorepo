import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import type {
  ResourceDescriptor,
  Revision,
} from '@codaco/protocol-builder-core/contract/schemas';
import {
  sectionId as makeSectionId,
  parseSectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { PROTOCOL_BUILDER_TABLES } from './schema.ts';
import {
  descriptorOf,
  storedDescriptor,
  type StoredResourceDescriptor,
} from './stored-shapes.ts';

const { protocolWriteReceipts } = PROTOCOL_BUILDER_TABLES;

export type WriteOperation = 'submit' | 'create';

/**
 * The caller is deliberately absent: a tab that reconnects as a new owner still
 * makes the same retry.
 */
export type WriteKey = {
  draftId: string;
  operation: WriteOperation;
  requestId: string;
};

export type WriteReceipt = {
  revision: Revision;
  createdSection?: ProtocolSectionId;
  promoted?: ResourceDescriptor[];
};

type ReceiptRow = {
  revisionSeq: bigint;
  revisionHash: string;
  createdSectionId: string | null;
  promoted: StoredResourceDescriptor[] | null;
};

function toReceipt(row: ReceiptRow): WriteReceipt {
  return {
    revision: { sequence: row.revisionSeq, contentHash: row.revisionHash },
    ...(row.createdSectionId === null
      ? {}
      : {
          createdSection: makeSectionId(parseSectionId(row.createdSectionId)),
        }),
    ...(row.promoted === null
      ? {}
      : { promoted: row.promoted.map((stored) => descriptorOf(stored)) }),
  };
}

export const readWriteReceipt: (
  teamId: string,
  key: WriteKey,
) => Effect.Effect<WriteReceipt | undefined, SqlError.SqlError, Transaction> =
  Effect.fn('protocolBuilder.readWriteReceipt')(function* (
    teamId: string,
    key: WriteKey,
  ) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select({
        revisionSeq: protocolWriteReceipts.revisionSeq,
        revisionHash: protocolWriteReceipts.revisionHash,
        createdSectionId: protocolWriteReceipts.createdSectionId,
        promoted: protocolWriteReceipts.promoted,
      })
      .from(protocolWriteReceipts)
      .where(
        and(
          eq(protocolWriteReceipts.draftId, key.draftId),
          eq(protocolWriteReceipts.teamId, teamId),
          eq(protocolWriteReceipts.requestId, key.requestId),
          eq(protocolWriteReceipts.operation, key.operation),
        ),
      );
    const row = rows[0];
    return row === undefined ? undefined : toReceipt(row);
  }, sqlErrorsOnly);

export const recordWriteReceipt: (
  teamId: string,
  key: WriteKey,
  receipt: WriteReceipt,
) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'protocolBuilder.recordWriteReceipt',
)(function* (teamId: string, key: WriteKey, receipt: WriteReceipt) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .insert(protocolWriteReceipts)
    .values({
      draftId: key.draftId,
      teamId,
      requestId: key.requestId,
      operation: key.operation,
      revisionSeq: receipt.revision.sequence,
      revisionHash: receipt.revision.contentHash,
      createdSectionId: receipt.createdSection ?? null,
      promoted:
        receipt.promoted?.map((descriptor) => storedDescriptor(descriptor)) ??
        null,
    })
    // Without `.returning()` the check below reads `undefined` and fires on
    // every write.
    .returning({ requestId: protocolWriteReceipts.requestId });
  if (rows.length === 0) {
    return yield* Effect.die(
      new Error(`write receipt ${key.operation}:${key.requestId} wrote no row`),
    );
  }
}, sqlErrorsOnly);
