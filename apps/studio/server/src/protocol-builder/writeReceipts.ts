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
import type pg from 'pg';

import type {
  ResourceDescriptor,
  Revision,
} from '@codaco/protocol-builder/contract/schemas';
import {
  sectionId as makeSectionId,
  parseSectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';
import type { TenantDb } from '@codaco/studio-sync/tenant';

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
  revision_seq: string;
  revision_hash: string;
  created_section_id: string | null;
  promoted: ResourceDescriptor[] | null;
};

const SELECT_RECEIPT = `
  SELECT revision_seq, revision_hash, created_section_id, promoted
  FROM protocol_write_receipts
  WHERE draft_id = $1 AND team_id = $2 AND request_id = $3 AND operation = $4`;

function toReceipt(row: ReceiptRow): WriteReceipt {
  return {
    revision: {
      sequence: BigInt(row.revision_seq),
      contentHash: row.revision_hash,
    },
    // Parsed and rebuilt rather than trusted as a section id: what comes back
    // out of the column has to be the branded id the contract answers with.
    ...(row.created_section_id === null
      ? {}
      : {
          createdSection: makeSectionId(parseSectionId(row.created_section_id)),
        }),
    ...(row.promoted === null ? {} : { promoted: row.promoted }),
  };
}

/**
 * The receipt for a key, read outside a write's transaction.
 *
 * The router asks before it plans a promotion: a retried promoting write finds
 * its staged resources gone — the first attempt committed them — so planning
 * again would refuse the retry rather than answer it.
 */
export async function readWriteReceipt(
  db: TenantDb,
  key: WriteKey,
): Promise<WriteReceipt | undefined> {
  const result = await db.query(SELECT_RECEIPT, [
    key.draftId,
    db.teamId,
    key.requestId,
    key.operation,
  ]);
  const row = (result.rows as ReceiptRow[])[0];
  return row === undefined ? undefined : toReceipt(row);
}

/**
 * The same read, inside the write's own transaction and under the draft-head
 * lock it has already taken. This is the one that decides: two calls carrying
 * one request id serialise behind that lock, so the second finds the first's
 * receipt rather than writing beside it.
 */
export async function lockedWriteReceipt(
  client: pg.PoolClient,
  teamId: string,
  key: WriteKey,
): Promise<WriteReceipt | undefined> {
  const result = await client.query(SELECT_RECEIPT, [
    key.draftId,
    teamId,
    key.requestId,
    key.operation,
  ]);
  const row = (result.rows as ReceiptRow[])[0];
  return row === undefined ? undefined : toReceipt(row);
}

/** Records what this write committed, in the transaction that committed it. */
export async function recordWriteReceipt(
  client: pg.PoolClient,
  teamId: string,
  key: WriteKey,
  receipt: WriteReceipt,
): Promise<void> {
  await client.query(
    `INSERT INTO protocol_write_receipts
       (draft_id, team_id, request_id, operation,
        revision_seq, revision_hash, created_section_id, promoted)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      key.draftId,
      teamId,
      key.requestId,
      key.operation,
      String(receipt.revision.sequence),
      receipt.revision.contentHash,
      receipt.createdSection ?? null,
      receipt.promoted === undefined ? null : JSON.stringify(receipt.promoted),
    ],
  );
}
