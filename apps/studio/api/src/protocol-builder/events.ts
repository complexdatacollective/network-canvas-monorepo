import { and, asc, eq, gt, max } from 'drizzle-orm';
import { Effect } from 'effect';
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
  holder: Presence | null;
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
        ...(row.doc === null ? {} : { document: row.doc }),
      },
    });
  }
  return Effect.succeed({
    cursor,
    event: {
      type: 'lock',
      sectionId,
      ...(row.holder === null ? {} : { holder: row.holder }),
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
          holder: record.kind === 'lock' ? (record.holder ?? null) : null,
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
