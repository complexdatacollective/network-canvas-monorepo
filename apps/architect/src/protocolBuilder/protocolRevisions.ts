import { v4 as uuid } from 'uuid';

import type {
  Presence,
  ProtocolEvent,
  Revision,
} from '@codaco/protocol-builder-core/contract/schemas';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';
import { getActiveProtocolId } from '~/ducks/modules/app';
import { getProtocol } from '~/selectors/protocol';

import type { ArchitectStore } from './architectStore.ts';
import { protocolSections } from './protocolSections.ts';

export type SectionAtRevision = Readonly<{
  document: SectionDoc;
  revision: Revision;
}>;

export type LoggedEvent = Readonly<{ cursor: string; event: ProtocolEvent }>;

export type WriteOutcome<T> = Readonly<{
  result: T;
  /** Every section the write moved, at the revision it moved to. */
  changed: ReadonlyMap<ProtocolSectionId, Revision>;
}>;

/**
 * One researcher, one browser tab, one Redux store: there is nobody to be
 * behind, so the identity below is never rendered. It exists because the
 * contract names a lock's holder, and a lock this host grants has one.
 */
const LOCAL_PRESENCE = {
  userId: 'architect-local',
  displayName: 'This device',
} as const;

/**
 * A one-consumer queue an event source pushes into and a generator drains.
 *
 * The pinned oRPC has no publisher helper, so `watchProtocol` needs its own
 * bridge from this log's synchronous publish to an async iterator.
 */
class EventQueue {
  #buffer: LoggedEvent[] = [];
  #wake: (() => void) | undefined;
  #closed = false;

  push(value: LoggedEvent): void {
    if (this.#closed) return;
    this.#buffer.push(value);
    this.#wake?.();
    this.#wake = undefined;
  }

  close(): void {
    this.#closed = true;
    this.#wake?.();
    this.#wake = undefined;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<LoggedEvent> {
    while (true) {
      const next = this.#buffer.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (this.#closed) return;
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
    }
  }
}

/**
 * The committed protocol, watched as revisions.
 *
 * Redux has no revision of its own, so this derives one: every store
 * notification re-splits the committed protocol into sections and compares
 * them with the last emitted state — by identity first, then by content hash —
 * and everything that moved shares one sequence, because it moved under one
 * dispatch. Locks are the host's own table: always granted, since only this
 * tab writes, and kept so a `submit` that never acquired one is refused.
 */
export class ProtocolRevisions {
  readonly #store: ArchitectStore;
  readonly #sections = new Map<ProtocolSectionId, SectionAtRevision>();
  readonly #locks = new Set<ProtocolSectionId>();
  readonly #log: LoggedEvent[] = [];
  readonly #watchers = new Set<EventQueue>();
  #presence: Presence;
  #protocol: CurrentProtocol | null = null;
  /** The protocol everything above belongs to. */
  #protocolId: string | null = null;
  #sequence = 0n;
  #cursor = 0;
  #emitting = true;
  /** Writes run one at a time, so `create` mints against a settled store. */
  #writes: Promise<unknown> = Promise.resolve();

  constructor(store: ArchitectStore) {
    this.#store = store;
    this.#presence = {
      ...LOCAL_PRESENCE,
      sessionId: uuid(),
      mode: 'viewing',
    };
    this.#seed();
    store.subscribe(() => {
      if (this.#emitting) this.#refresh();
    });
  }

  sectionIds(): ProtocolSectionId[] {
    return [...this.#sections.keys()];
  }

  read(id: ProtocolSectionId): SectionAtRevision | undefined {
    return this.#sections.get(id);
  }

  holderOf(id: ProtocolSectionId): Presence | undefined {
    return this.#locks.has(id) ? this.#presence : undefined;
  }

  acquire(id: ProtocolSectionId): void {
    this.#locks.add(id);
    this.#presence = { ...this.#presence, mode: 'editing', sectionId: id };
    this.#publish({ type: 'lock', sectionId: id, holder: this.#presence });
    this.#publishPresence();
  }

  release(id: ProtocolSectionId): void {
    if (!this.#locks.delete(id)) return;
    const { sectionId: _released, ...rest } = this.#presence;
    this.#presence = { ...rest, mode: 'viewing' };
    this.#publish({ type: 'lock', sectionId: id });
    this.#publishPresence();
  }

  /**
   * Runs a write against the store and reports what it moved.
   *
   * Notifications are held while it runs so that a write needing more than one
   * dispatch — an asset removal, a thunk's lifecycle actions — still reaches
   * the contract as the one revision it is.
   */
  write<T>(run: () => T | Promise<T>): Promise<WriteOutcome<T>> {
    const attempt = this.#writes.then(async (): Promise<WriteOutcome<T>> => {
      this.#emitting = false;
      try {
        const result = await run();
        return { result, changed: this.#refresh() };
      } finally {
        this.#emitting = true;
      }
    });
    // The queue must not stop at a refused write, and must not keep the
    // rejection alive as an unhandled one.
    this.#writes = attempt.catch(() => undefined);
    return attempt;
  }

  async *watch(
    since: string | undefined,
    signal?: AbortSignal,
  ): AsyncGenerator<LoggedEvent> {
    const queue = new EventQueue();
    const stop = () => queue.close();
    signal?.addEventListener('abort', stop, { once: true });
    // Subscribed before the backlog is taken, so an event published between
    // the two is queued rather than lost; the cursor check below drops the
    // overlap.
    this.#watchers.add(queue);
    const backlog = this.#eventsAfter(since);
    let last = backlog.at(-1)?.cursor ?? since;
    this.#publishPresence();
    try {
      for (const entry of backlog) yield entry;
      for await (const entry of queue) {
        if (last !== undefined && Number(entry.cursor) <= Number(last))
          continue;
        last = entry.cursor;
        yield entry;
      }
    } finally {
      signal?.removeEventListener('abort', stop);
      this.#watchers.delete(queue);
      queue.close();
    }
  }

  #seed(): void {
    const state = this.#store.getState();
    this.#protocolId = getActiveProtocolId(state);
    this.#protocol = getProtocol(state);
    if (this.#protocol === null) return;
    for (const [id, document] of protocolSections(this.#protocol)) {
      this.#sections.set(id, {
        document,
        revision: { sequence: 0n, contentHash: contentHash(document) },
      });
    }
  }

  /**
   * Everything here belongs to one protocol, so opening another leaves none of
   * it standing: its sections are not revisions of the ones before them, its
   * locks are not this protocol's to keep — a lock the researcher can no
   * longer release, because releasing names the protocol it was taken in,
   * would refuse a create in the protocol they went on to open — and a
   * watcher of the last protocol must not be handed this one's revisions. The
   * stream ends instead, which is what the client reconnects from and is then
   * told the protocol it asked for is not the open one.
   */
  #reopen(): void {
    for (const watcher of this.#watchers) watcher.close();
    this.#watchers.clear();
    this.#sections.clear();
    this.#locks.clear();
    this.#log.length = 0;
    this.#sequence = 0n;
    this.#cursor = 0;
    const { sectionId: _released, ...rest } = this.#presence;
    this.#presence = { ...rest, mode: 'viewing' };
    this.#seed();
  }

  #refresh(): ReadonlyMap<ProtocolSectionId, Revision> {
    const changed = new Map<ProtocolSectionId, Revision>();
    if (getActiveProtocolId(this.#store.getState()) !== this.#protocolId) {
      this.#reopen();
      return changed;
    }
    const protocol = getProtocol(this.#store.getState());
    if (protocol === this.#protocol) return changed;
    this.#protocol = protocol;

    const next =
      protocol === null
        ? new Map<ProtocolSectionId, SectionDoc>()
        : protocolSections(protocol);
    const writes: [ProtocolSectionId, SectionDoc | undefined][] = [];

    for (const [id, document] of next) {
      const previous = this.#sections.get(id);
      if (previous?.document === document) continue;
      const hash = contentHash(document);
      if (previous !== undefined && previous.revision.contentHash === hash) {
        // Rebuilt to the same content: not a revision, but keep the new
        // reference so the next comparison is an identity check again.
        this.#sections.set(id, { document, revision: previous.revision });
        continue;
      }
      writes.push([id, document]);
    }
    for (const id of this.#sections.keys()) {
      if (!next.has(id)) writes.push([id, undefined]);
    }
    if (writes.length === 0) return changed;

    this.#sequence += 1n;
    for (const [id, document] of writes) {
      if (document === undefined) {
        const previous = this.#sections.get(id);
        if (previous === undefined) continue;
        const revision: Revision = {
          sequence: this.#sequence,
          contentHash: previous.revision.contentHash,
        };
        this.#sections.delete(id);
        this.#locks.delete(id);
        changed.set(id, revision);
        this.#publish({ type: 'revision', sectionId: id, revision });
        continue;
      }
      const revision: Revision = {
        sequence: this.#sequence,
        contentHash: contentHash(document),
      };
      this.#sections.set(id, { document, revision });
      changed.set(id, revision);
      this.#publish({ type: 'revision', sectionId: id, revision, document });
    }
    return changed;
  }

  #publish(event: ProtocolEvent): void {
    this.#cursor += 1;
    const entry: LoggedEvent = { cursor: String(this.#cursor), event };
    this.#log.push(entry);
    for (const watcher of this.#watchers) watcher.push(entry);
  }

  #publishPresence(): void {
    this.#publish({ type: 'presence', present: [this.#presence] });
  }

  #eventsAfter(since: string | undefined): LoggedEvent[] {
    if (since === undefined) return [...this.#log];
    const after = Number(since);
    return this.#log.filter((entry) => Number(entry.cursor) > after);
  }
}
