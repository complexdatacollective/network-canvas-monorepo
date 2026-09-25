// One ordered channel per open protocol: the durable log `watchProtocol`
// replays from a cursor, and the in-process fan-out that carries the same
// events live.
//
// Two halves because the two answer different questions. The log answers
// "what did I miss while my socket was down", so it is written in the same
// transaction as the change it describes and read back by cursor. The
// publisher answers "what is happening now", so it is memory, per process,
// and lossy under back-pressure — a dropped subscriber reconnects and replays.
import { and, asc, eq, gt, max } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

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

/**
 * An event, and where it sits in its protocol's order.
 *
 * `cursor` is absent for presence, which is in-process, has no delivery
 * guarantee, and must therefore never move a watcher's resume position: after
 * a drop the client asks again from the last revision or lock it saw, and the
 * presence it gets back is the live one rather than a replay of a stale one.
 */
export type LoggedProtocolEvent = {
  cursor?: string;
  event: ProtocolEvent;
};

/** What a write appends to the log, before a cursor is allocated for it. */
export type ProtocolEventRecord =
  | {
      kind: 'revision';
      sectionId: ProtocolSectionId;
      manifestSeq: bigint;
      contentHash: string;
      /** Absent when the section stopped existing at this revision. */
      document?: SectionDoc;
    }
  | {
      kind: 'lock';
      sectionId: ProtocolSectionId;
      /** Absent when the section was released. */
      owner?: string;
      holder?: Presence;
    };

/**
 * A row as the log stores it. The three jsonb columns are declared with their
 * shapes on the table (`schema.ts`), so nothing here casts one.
 */
type EventRow = {
  cursor: bigint;
  kind: string;
  sectionId: string;
  manifestSeq: bigint | null;
  contentHash: string | null;
  doc: SectionDoc | null;
  holder: Presence | null;
};

/** Every column `toLoggedEvent` reads, named once for the two readers. */
const EVENT_COLUMNS = {
  cursor: protocolEvents.cursor,
  kind: protocolEvents.kind,
  sectionId: protocolEvents.sectionId,
  manifestSeq: protocolEvents.manifestSeq,
  contentHash: protocolEvents.contentHash,
  doc: protocolEvents.doc,
  holder: protocolEvents.holder,
} as const;

/**
 * A stored row as the contract describes it.
 *
 * A `revision` row without its sequence and hash is refused by the table's own
 * shape check, so reaching that branch means the database is not the one this
 * code was written against: it dies rather than failing, because no caller can
 * answer it and no retry would change it.
 */
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
 * Appends events to the draft's log, allocating their cursors.
 *
 * The caller holds the draft-head row lock, which is what makes
 * `max(cursor) + 1` safe: every writer takes that lock first, so no two
 * transactions allocate the same cursor and none commits out of order.
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
    // An aggregate with no GROUP BY always answers with one row, and `max`
    // over no rows is null — which is the `COALESCE(MAX(cursor), 0)` this
    // replaces, moved into TypeScript because the column decodes as a bigint.
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
    // One INSERT per record on the caller's connection. No nested scope: a
    // savepoint per row is what `savepoint`'s own comment warns against, and
    // there is nothing here to roll back independently.
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
          // A plain object: the jsonb codec stringifies it, and stringifying
          // it here would store the JSON of a JSON string.
          doc: record.kind === 'revision' ? (record.document ?? null) : null,
          owner: record.kind === 'lock' ? (record.owner ?? null) : null,
          holder: record.kind === 'lock' ? (record.holder ?? null) : null,
        })
        // `.returning()` because this reads the row back: without it the
        // builder answers with the driver's result object wearing a rows
        // array's type, and `inserted[0]` would be undefined at runtime while
        // typechecking.
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

/** Everything after `since`, oldest first; the whole log when it is absent. */
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

const QUEUE_LIMIT = 1024;

class EventQueue {
  #pending: LoggedProtocolEvent[] = [];
  #wake: (() => void) | undefined;
  #closed = false;

  push(entry: LoggedProtocolEvent): void {
    if (this.#closed) return;
    // Past the bound the subscriber is too far behind to catch up cheaply, so
    // it is dropped to the replay path rather than buffered without limit.
    if (this.#pending.length >= QUEUE_LIMIT) {
      this.close();
      return;
    }
    this.#pending.push(entry);
    this.#wake?.();
  }

  close(): void {
    this.#closed = true;
    this.#wake?.();
  }

  async *drain(): AsyncGenerator<LoggedProtocolEvent> {
    for (;;) {
      while (this.#pending.length > 0) {
        const next = this.#pending.shift();
        if (next !== undefined) yield next;
      }
      if (this.#closed) return;
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
      this.#wake = undefined;
    }
  }
}

/**
 * Live fan-out, one process wide. Every commit, lock change and presence
 * change reaches the watchers this process is serving; the deployment
 * assumption is the ADR's single WebSocket-serving replica (#1247), and the
 * replay path is what makes a second one a scaling limit rather
 * than a correctness one.
 */
export class ProtocolEventPublisher {
  readonly #subscribers = new Map<string, Set<EventQueue>>();

  publish(draftId: string, entries: readonly LoggedProtocolEvent[]): void {
    const queues = this.#subscribers.get(draftId);
    if (queues === undefined) return;
    for (const queue of queues) {
      for (const entry of entries) queue.push(entry);
    }
  }

  subscribe(draftId: string): {
    events: AsyncGenerator<LoggedProtocolEvent>;
    close: () => void;
  } {
    const queue = new EventQueue();
    const queues = this.#subscribers.get(draftId) ?? new Set<EventQueue>();
    queues.add(queue);
    this.#subscribers.set(draftId, queues);
    return {
      events: queue.drain(),
      close: () => {
        queue.close();
        queues.delete(queue);
        if (queues.size === 0) this.#subscribers.delete(draftId);
      },
    };
  }
}
