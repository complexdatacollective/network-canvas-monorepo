import { Dexie, type EntityTable } from 'dexie';

import type {
  Finding,
  ReviewProvider,
} from '@codaco/protocol-review-worker/contract';
import { reportError } from '~/utils/reportError';
import { isStorageUnavailableError } from '~/utils/storageErrors';
import { PROTOCOL_REVIEW_DB_NAME } from '~/utils/storageNames';

import type {
  StoredOperation,
  TargetSnapshot,
  WrittenSnapshot,
} from './fixEngine';

/**
 * Each protocol's automated review and the researcher's choices about it,
 * kept in this browser beside the protocol and never in the protocol file.
 * One record per library protocol id.
 */

/** What the researcher chose for one finding. */
export const FINDING_DECISIONS = [
  'undecided',
  'fix',
  'mine',
  'done',
  'dismissed',
] as const;

export type FindingDecision = (typeof FINDING_DECISIONS)[number];

export type StoredFinding = {
  /** As the service wrote it (its `fix.operations` unchanged). */
  finding: Finding;
  /** The edits Architect applies: the fix's, in the protocol's terms (`normalizeOperations`). */
  operations: StoredOperation[];
  /** What the reviewed protocol held at each target; null when the edits never applied to it. */
  targets: TargetSnapshot[] | null;
  decision: FindingDecision;
  /** The edits that take an applied fix back out; null until it is applied. */
  inverse: StoredOperation[] | null;
  /**
   * Everything the applied fix wrote, as it left it; null until it is
   * applied. The fix holds, and may be undone, only while all of it is still
   * so. Absent from records written before it existed, which read as null.
   */
  written?: WrittenSnapshot[] | null;
};

export type StoredReview = {
  reviewId: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** The language the findings are written in. */
  locale: string;
  /**
   * Who wrote it. Absent from reviews saved before there was a choice, all
   * of which Anthropic wrote.
   */
  provider?: ReviewProvider;
  stageIds?: string[];
  findings: StoredFinding[];
};

export type StoredReviewRecord = {
  protocolId: string;
  /**
   * Whether reviews are shared with the Network Canvas team; null until the
   * researcher has chosen. Nothing is shared on a choice that was not made.
   */
  shareReviews: boolean | null;
  review: StoredReview | null;
};

export const emptyReviewRecord = (protocolId: string): StoredReviewRecord => ({
  protocolId,
  shareReviews: null,
  review: null,
});

type ReviewDb = Dexie & {
  reviews: EntityTable<StoredReviewRecord, 'protocolId'>;
};

let reviewDb: ReviewDb | null = null;

// Created on first use: a researcher who never reviews a protocol never gets
// the database.
const getReviewDb = (): ReviewDb => {
  if (!reviewDb) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Dexie's documented TypeScript pattern: the tables are added at runtime by version().stores(), so the instance is typed with them
    const db = new Dexie(PROTOCOL_REVIEW_DB_NAME) as ReviewDb;
    db.version(1).stores({ reviews: 'protocolId' });
    reviewDb = db;
  }
  return reviewDb;
};

/**
 * This session's copy of every record it has read or written. When storage
 * fails (Safari private browsing, a full disk) the feature keeps working from
 * here for the rest of the session, as the library does from its in-memory
 * copy; nothing is kept past it.
 */
const memory = new Map<string, StoredReviewRecord>();

/**
 * The protocols whose session copy is newer than what storage holds, because
 * writing it failed. Until a write succeeds the session copy is the record:
 * reading storage would bring back an older one — older decisions, and a
 * sharing choice the researcher has since withdrawn.
 */
const unsaved = new Set<string>();

const noteFailure = (error: unknown, operation: string) => {
  if (!isStorageUnavailableError(error)) {
    reportError(error, { operation });
  }
};

/** The protocol's record; an empty one when it has none. */
export const readReviewRecord = async (
  protocolId: string,
): Promise<StoredReviewRecord> => {
  const pending = unsaved.has(protocolId) ? memory.get(protocolId) : undefined;
  if (pending) return pending;
  try {
    const stored = await getReviewDb().reviews.get(protocolId);
    // A record written while this read was out is newer than what it found:
    // a decision made in that moment must not be replaced by the copy from
    // before it, here or in whoever asked.
    const written = unsaved.has(protocolId)
      ? memory.get(protocolId)
      : undefined;
    if (written) return written;
    if (stored) {
      memory.set(protocolId, stored);
      return stored;
    }
  } catch (error) {
    noteFailure(error, 'protocolReviewRead');
  }
  return memory.get(protocolId) ?? emptyReviewRecord(protocolId);
};

/** Saves the record. Never throws: a failed write leaves the session copy. */
export const writeReviewRecord = async (
  record: StoredReviewRecord,
): Promise<void> => {
  memory.set(record.protocolId, record);
  unsaved.add(record.protocolId);
  try {
    await getReviewDb().reviews.put(record);
    // Only if no newer write was made meanwhile is this one the latest.
    if (memory.get(record.protocolId) === record) {
      unsaved.delete(record.protocolId);
    }
  } catch (error) {
    noteFailure(error, 'protocolReviewWrite');
  }
};

/**
 * Removes every protocol's record, with the whole library (Clear all), and
 * answers with the way to put them all back. The library is a database of its
 * own, cleared after this one, and no transaction spans the two: when that
 * clear fails the caller calls what this returned, so a library that is still
 * there keeps its reviews.
 *
 * Throws when storage refuses, so the caller can say the library was not
 * cleared; nothing is removed then, the session copy included.
 */
export const clearReviewRecords = async (): Promise<() => Promise<void>> => {
  const db = getReviewDb();
  const stored = await db.reviews.toArray();
  await db.reviews.clear();
  const session = new Map(memory);
  const pending = new Set(unsaved);
  memory.clear();
  unsaved.clear();
  return async () => {
    for (const [protocolId, record] of session) memory.set(protocolId, record);
    for (const protocolId of pending) unsaved.add(protocolId);
    try {
      await db.reviews.bulkPut(stored);
    } catch (error) {
      // What storage would not take back is still this session's copy.
      for (const record of stored) {
        if (!memory.has(record.protocolId)) {
          memory.set(record.protocolId, record);
        }
        unsaved.add(record.protocolId);
      }
      noteFailure(error, 'protocolReviewRestore');
    }
  };
};

/** Removes the protocol's record, with the protocol. Never throws. */
export const deleteReviewRecord = async (protocolId: string): Promise<void> => {
  memory.delete(protocolId);
  unsaved.delete(protocolId);
  try {
    await getReviewDb().reviews.delete(protocolId);
  } catch (error) {
    noteFailure(error, 'protocolReviewDelete');
  }
};
