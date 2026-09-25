// What a `submit` or a `create` already committed, kept for the retry that
// asks about it again.
//
// The contract gives both procedures a `requestId` that is stable across an
// uncertain retry: a client whose answer was lost repeats the call with the
// same one and is told what that attempt wrote rather than writing again. A
// second submit would make a revision nothing changed in — refused outright
// once the editor had given its lock back, which turns a save that succeeded
// into one the researcher is told to discard a draft over — and a second
// create would leave the protocol holding the stage twice, with the client
// told about only one of them.
//
// Kept in the database rather than in the process, because the retry that
// matters most is the one that follows a restart: a client reconnecting to a
// server that came back up is exactly the client whose answer went missing.
// The row is written in the same transaction as the write it describes, so
// there is no window in which the write is committed and its receipt is not.
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

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

const { protocolWriteReceipts } = PROTOCOL_BUILDER_TABLES;

/** The two procedures the contract gives an idempotency key. */
export type WriteOperation = 'submit' | 'create';

/**
 * A write's identity: the draft it was made in, what it was, and the id the
 * client promised to repeat.
 *
 * The caller is deliberately absent. A tab that reconnects without presenting
 * the id it had is a new owner, and the retry it makes is still the same
 * intent — keying on the owner would refuse to recognise exactly the retry
 * this record exists for.
 */
export type WriteKey = {
  draftId: string;
  operation: WriteOperation;
  requestId: string;
};

/** What the first attempt wrote, as it answered the client. */
export type WriteReceipt = {
  revision: Revision;
  /** The section a `create` minted, so a retry names the one it made. */
  createdSection?: ProtocolSectionId;
  promoted?: ResourceDescriptor[];
};

type ReceiptRow = {
  revisionSeq: bigint;
  revisionHash: string;
  createdSectionId: string | null;
  promoted: ResourceDescriptor[] | null;
};

function toReceipt(row: ReceiptRow): WriteReceipt {
  return {
    // `revision_seq` is a bigint column read through the builder, which
    // decodes it as a bigint — the string this used to widen by hand.
    revision: { sequence: row.revisionSeq, contentHash: row.revisionHash },
    // Parsed and rebuilt rather than trusted as a section id: what comes back
    // out of the column has to be the branded id the contract answers with.
    ...(row.createdSectionId === null
      ? {}
      : {
          createdSection: makeSectionId(parseSectionId(row.createdSectionId)),
        }),
    ...(row.promoted === null ? {} : { promoted: row.promoted }),
  };
}

/**
 * The receipt for a key.
 *
 * One function where there were two. `readWriteReceipt` and
 * `lockedWriteReceipt` were the same SELECT, and differed only in whose
 * transaction they ran in — which is no longer something a data function can
 * decide, because every one of them now runs in the caller's. The distinction
 * survives where it always belonged, at the two call sites:
 *
 *   * the router asks in a scope of its own, before it plans a promotion, so
 *     that a retried promoting write is answered rather than refused for
 *     staged resources the first attempt already consumed;
 *   * the host asks inside the write's own transaction, under the draft-head
 *     lock it has already taken. That is the read that decides: two calls
 *     carrying one request id serialise behind that lock, so the second finds
 *     the first's receipt rather than writing beside it.
 */
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

/** Records what this write committed, in the transaction that committed it. */
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
      // A plain array: the jsonb codec stringifies it, and stringifying it
      // here — as the raw statement had to — would store the JSON of a JSON
      // string, which `toReceipt` would then answer with.
      promoted: receipt.promoted ?? null,
    })
    // `.returning()` because the row is inspected below; without it the
    // builder answers with the driver's result object wearing a rows array's
    // type, so the check would read `undefined` and fire on every write.
    .returning({ requestId: protocolWriteReceipts.requestId });
  if (rows.length === 0) {
    return yield* Effect.die(
      new Error(`write receipt ${key.operation}:${key.requestId} wrote no row`),
    );
  }
}, sqlErrorsOnly);
