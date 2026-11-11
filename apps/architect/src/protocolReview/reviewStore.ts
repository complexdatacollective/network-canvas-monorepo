import { Dexie, type EntityTable } from 'dexie';

import type { Finding } from '@codaco/protocol-review-worker/contract';
import { reportError } from '~/utils/reportError';
import { isStorageUnavailableError } from '~/utils/storageErrors';
import { PROTOCOL_REVIEW_DB_NAME } from '~/utils/storageNames';

import type { StoredOperation, TargetSnapshot } from './fixEngine';

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
};

export type StoredReview = {
  reviewId: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** The language the findings are written in. */
  locale: string;
  /** The reviewed protocol and study details (`reviewFingerprint`). */
  fingerprint: string;
  findings: StoredFinding[];
};

export type StoredReviewRecord = {
  protocolId: string;
  /** Whether reviews are shared with the Network Canvas team. Off until chosen. */
  shareReviews: boolean;
  review: StoredReview | null;
};

export const emptyReviewRecord = (protocolId: string): StoredReviewRecord => ({
  protocolId,
  shareReviews: false,
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

const noteFailure = (error: unknown, operation: string) => {
  if (!isStorageUnavailableError(error)) {
    reportError(error, { operation });
  }
};

/** The protocol's record; an empty one when it has none. */
export const readReviewRecord = async (
  protocolId: string,
): Promise<StoredReviewRecord> => {
  try {
    const stored = await getReviewDb().reviews.get(protocolId);
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
  try {
    await getReviewDb().reviews.put(record);
  } catch (error) {
    noteFailure(error, 'protocolReviewWrite');
  }
};

/** Removes the protocol's record, with the protocol. Never throws. */
export const deleteReviewRecord = async (protocolId: string): Promise<void> => {
  memory.delete(protocolId);
  try {
    await getReviewDb().reviews.delete(protocolId);
  } catch (error) {
    noteFailure(error, 'protocolReviewDelete');
  }
};
