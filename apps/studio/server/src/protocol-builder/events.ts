// One ordered channel per open protocol: the durable log `watchProtocol`
// replays from a cursor, and the in-process fan-out that carries the same
// events live.
//
// Two halves because the two answer different questions. The log answers
// "what did I miss while my socket was down", so it is written in the same
// transaction as the change it describes and read back by cursor. The
// publisher answers "what is happening now", so it is memory, per process,
// and lossy under back-pressure — a dropped subscriber reconnects and replays.
import type pg from 'pg';

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
import type { TenantDb } from '@codaco/studio-sync/tenant';

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

type EventRow = {
  cursor: string;
  kind: string;
  section_id: string;
  manifest_seq: string | null;
  content_hash: string | null;
  doc: SectionDoc | null;
  holder: Presence | null;
};

function toLoggedEvent(row: EventRow): LoggedProtocolEvent {
  const sectionId = makeSectionId(parseSectionId(row.section_id));
  if (row.kind === 'revision') {
    if (row.manifest_seq === null || row.content_hash === null) {
      throw new Error(`protocol event ${row.cursor} is not a revision`);
    }
    return {
      cursor: row.cursor,
      event: {
        type: 'revision',
        sectionId,
        revision: {
          sequence: BigInt(row.manifest_seq),
          contentHash: row.content_hash,
        },
        ...(row.doc === null ? {} : { document: row.doc }),
      },
    };
  }
  return {
    cursor: row.cursor,
    event: {
      type: 'lock',
      sectionId,
      ...(row.holder === null ? {} : { holder: row.holder }),
    },
  };
}

/**
 * Appends events to the draft's log, allocating their cursors.
 *
 * The caller holds the draft-head row lock, which is what makes
 * `max(cursor) + 1` safe: every writer takes that lock first, so no two
 * transactions allocate the same cursor and none commits out of order.
 */
export async function appendProtocolEvents(
  client: pg.PoolClient,
  teamId: string,
  draftId: string,
  records: readonly ProtocolEventRecord[],
): Promise<LoggedProtocolEvent[]> {
  if (records.length === 0) return [];
  const last = await client.query(
    `SELECT COALESCE(MAX(cursor), 0) AS cursor FROM protocol_events
     WHERE draft_id = $1 AND team_id = $2`,
    [draftId, teamId],
  );
  let cursor = BigInt((last.rows[0] as { cursor: string }).cursor);
  const appended: LoggedProtocolEvent[] = [];
  for (const record of records) {
    cursor += 1n;
    const inserted = await client.query(
      `INSERT INTO protocol_events
         (draft_id, team_id, cursor, kind, section_id,
          manifest_seq, content_hash, doc, owner, holder)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING cursor, kind, section_id, manifest_seq, content_hash, doc, holder`,
      [
        draftId,
        teamId,
        String(cursor),
        record.kind,
        record.sectionId,
        record.kind === 'revision' ? String(record.manifestSeq) : null,
        record.kind === 'revision' ? record.contentHash : null,
        record.kind === 'revision' ? (record.document ?? null) : null,
        record.kind === 'lock' ? (record.owner ?? null) : null,
        record.kind === 'lock' ? (record.holder ?? null) : null,
      ],
    );
    appended.push(toLoggedEvent(inserted.rows[0] as EventRow));
  }
  return appended;
}

/** Everything after `since`, oldest first; the whole log when it is absent. */
export async function readProtocolEvents(
  db: TenantDb,
  draftId: string,
  since: string | undefined,
): Promise<LoggedProtocolEvent[]> {
  const result = await db.query(
    `SELECT cursor, kind, section_id, manifest_seq, content_hash, doc, holder
     FROM protocol_events
     WHERE draft_id = $1 AND team_id = $2 AND cursor > $3
     ORDER BY cursor`,
    [draftId, db.teamId, since ?? '0'],
  );
  return (result.rows as EventRow[]).map(toLoggedEvent);
}

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
