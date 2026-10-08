import { and, asc, eq, gt, max, sql } from 'drizzle-orm';
import { Effect, Redacted } from 'effect';
import type { SqlError } from 'effect/sql';

import type {
  Presence,
  ProtocolEvent,
} from '@codaco/protocol-builder-core/contract/schemas';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId as makeSectionId,
  parseSectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { PROTOCOL_BUILDER_TABLES } from './schema.ts';
import {
  presenceOf,
  storedPresence,
  type StoredPresence,
} from './stored-shapes.ts';

const { protocolEvents } = PROTOCOL_BUILDER_TABLES;

export type LoggedProtocolEvent = {
  cursor?: string;
  event: ProtocolEvent;
};

export type ProtocolEventRecord =
  | {
      kind: 'revision';
      sectionId: ProtocolSectionId;
      manifestSeq: bigint;
      contentHash: string;
      document?: SectionDoc;
    }
  | {
      kind: 'lock';
      sectionId: ProtocolSectionId;
      owner?: string;
      holder?: Presence;
    };

type EventRow = {
  cursor: bigint;
  kind: string;
  sectionId: string;
  manifestSeq: bigint | null;
  contentHash: string | null;
  doc: SectionDoc | null;
  holder: StoredPresence | null;
};

const EVENT_COLUMNS = {
  cursor: protocolEvents.cursor,
  kind: protocolEvents.kind,
  sectionId: protocolEvents.sectionId,
  manifestSeq: protocolEvents.manifestSeq,
  contentHash: protocolEvents.contentHash,
  doc: protocolEvents.doc,
  holder: protocolEvents.holder,
} as const;

const toLoggedEvent = (row: EventRow): Effect.Effect<LoggedProtocolEvent> => {
  const sectionId = makeSectionId(parseSectionId(row.sectionId));
  const cursor = String(row.cursor);
  if (row.kind === 'revision') {
    const { manifestSeq, contentHash } = row;
    if (manifestSeq === null || contentHash === null) {
      return Effect.die(
        new Error(`protocol event ${cursor} is not a revision`),
      );
    }
    return Effect.succeed({
      cursor,
      event: {
        type: 'revision',
        sectionId,
        revision: { sequence: manifestSeq, contentHash },
        ...(row.doc === null ? {} : { document: Redacted.make(row.doc) }),
      },
    });
  }
  return Effect.succeed({
    cursor,
    event: {
      type: 'lock',
      sectionId,
      ...(row.holder === null ? {} : { holder: presenceOf(row.holder) }),
    },
  });
};

/**
 * The caller holds the draft-head row lock, which is what makes
 * `max(cursor) + 1` safe.
 */
export const appendProtocolEvents: (
  teamId: string,
  draftId: string,
  records: readonly ProtocolEventRecord[],
) => Effect.Effect<LoggedProtocolEvent[], SqlError.SqlError, Transaction> =
  Effect.fn('protocolBuilder.appendProtocolEvents')(function* (
    teamId: string,
    draftId: string,
    records: readonly ProtocolEventRecord[],
  ) {
    if (records.length === 0) return [];
    const { tx } = yield* Transaction;
    const last = yield* tx
      .select({ cursor: max(protocolEvents.cursor) })
      .from(protocolEvents)
      .where(
        and(
          eq(protocolEvents.draftId, draftId),
          eq(protocolEvents.teamId, teamId),
        ),
      );
    let cursor = last[0]?.cursor ?? 0n;
    const appended: LoggedProtocolEvent[] = [];
    for (const record of records) {
      cursor += 1n;
      const inserted = yield* tx
        .insert(protocolEvents)
        .values({
          draftId,
          teamId,
          cursor,
          kind: record.kind,
          sectionId: record.sectionId,
          manifestSeq: record.kind === 'revision' ? record.manifestSeq : null,
          contentHash: record.kind === 'revision' ? record.contentHash : null,
          doc: record.kind === 'revision' ? (record.document ?? null) : null,
          owner: record.kind === 'lock' ? (record.owner ?? null) : null,
          holder:
            record.kind === 'lock' && record.holder !== undefined
              ? storedPresence(record.holder)
              : null,
        })
        // Without `.returning()`, `inserted[0]` is undefined at runtime yet
        // typechecks.
        .returning(EVENT_COLUMNS);
      const row = inserted[0];
      if (row === undefined) {
        return yield* Effect.die(
          new Error(`protocol event ${String(cursor)} wrote no row`),
        );
      }
      appended.push(yield* toLoggedEvent(row));
    }
    return appended;
  }, sqlErrorsOnly);

export const readProtocolEvents: (
  teamId: string,
  draftId: string,
  since: bigint | undefined,
) => Effect.Effect<LoggedProtocolEvent[], SqlError.SqlError, Transaction> =
  Effect.fn('protocolBuilder.readProtocolEvents')(function* (
    teamId: string,
    draftId: string,
    since: bigint | undefined,
  ) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select(EVENT_COLUMNS)
      .from(protocolEvents)
      .where(
        and(
          eq(protocolEvents.draftId, draftId),
          eq(protocolEvents.teamId, teamId),
          gt(protocolEvents.cursor, since ?? 0n),
        ),
      )
      .orderBy(asc(protocolEvents.cursor));
    const events: LoggedProtocolEvent[] = [];
    for (const row of rows) events.push(yield* toLoggedEvent(row));
    return events;
  }, sqlErrorsOnly);

/**
 * The most a relay reads of one draft at a time: a quarter of a watcher's
 * queue. A relay reads again only once every watcher's queue is at most half
 * full, so a batch always fits beside what a slow watcher has yet to take.
 */
export const RELAY_BATCH = 256;

/**
 * Up to `RELAY_BATCH` events from each draft's `next`, for several drafts in
 * one statement, in cursor order within each draft. The log is dense, so a
 * cursor range bounds the rows.
 */
export const readRelayBatch: (
  teamId: string,
  wants: ReadonlyArray<{ readonly draftId: string; readonly next: bigint }>,
) => Effect.Effect<
  ReadonlyMap<string, ReadonlyArray<LoggedProtocolEvent>>,
  SqlError.SqlError,
  Transaction
> = Effect.fn('protocolBuilder.readRelayBatch')(function* (
  teamId: string,
  wants: ReadonlyArray<{ readonly draftId: string; readonly next: bigint }>,
) {
  const batch = new Map<string, LoggedProtocolEvent[]>();
  if (wants.length === 0) return batch;
  const { tx } = yield* Transaction;
  const draftIds = sql.param(wants.map((want) => want.draftId));
  const nexts = sql.param(wants.map((want) => String(want.next)));
  const rows = yield* tx
    .select({ draftId: protocolEvents.draftId, ...EVENT_COLUMNS })
    .from(protocolEvents)
    .innerJoin(
      sql`unnest(${draftIds}::uuid[], ${nexts}::bigint[]) AS want(draft_id, next)`,
      sql`want.draft_id = ${protocolEvents.draftId} AND ${protocolEvents.cursor} >= want.next AND ${protocolEvents.cursor} < want.next + ${RELAY_BATCH}`,
    )
    .where(eq(protocolEvents.teamId, teamId))
    .orderBy(asc(protocolEvents.draftId), asc(protocolEvents.cursor));
  for (const row of rows) {
    const inDraft = batch.get(row.draftId) ?? [];
    batch.set(row.draftId, inDraft);
    inDraft.push(yield* toLoggedEvent(row));
  }
  return batch;
}, sqlErrorsOnly);
