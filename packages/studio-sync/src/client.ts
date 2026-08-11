// Client half of the walking skeleton: optimistic local echo through the same
// shared apply engine, a pending queue with per-(owner, section, epoch)
// client_seq numbering, suffix rollback on rejection, and resume-driven
// retransmission.
import {
  applyCommands,
  type Command,
  contentHash,
  type SectionDoc,
} from './apply.ts';
import { LeaseRejectedError, type SyncServer } from './server.ts';

type PendingBatch = { clientSeq: bigint; commands: Command[] };

type SectionState = {
  epoch: bigint;
  /** Last server-acknowledged document. */
  base: SectionDoc;
  /** Optimistic document: base + pending batches. */
  local: SectionDoc;
  nextClientSeq: bigint;
  pending: PendingBatch[];
  /**
   * Bumped whenever an acknowledgement advances base and drops its batch.
   * A resume snapshot read before a bump describes a state this client has
   * already moved past, so reconnect discards it rather than assigning it.
   */
  version: number;
};

export class SyncClient {
  private sections = new Map<string, SectionState>();

  readonly owner: string;
  private server: SyncServer;
  private draftId: string;

  constructor(owner: string, server: SyncServer, draftId: string) {
    this.owner = owner;
    this.server = server;
    this.draftId = draftId;
  }

  async openSection(sectionId: string): Promise<boolean> {
    const lease = await this.server.acquire(
      this.draftId,
      sectionId,
      this.owner,
    );
    if (!lease) return false;
    const resume = await this.server.resume(this.draftId, this.owner);
    const doc = await this.server.getSection(
      resume.sectionHashes[sectionId] ?? '',
    );
    // Reopening a still-active lease (a retried acquire, or a second
    // openSection for the same section) keeps its epoch, and client_seq is
    // unique per (owner, section, epoch): restarting at 1 would reuse an
    // idempotency key the server has already logged, so the next edit would
    // be deduplicated against an older command while the client counted it
    // as committed.
    const acked = resume.lastApplied[sectionId];
    const nextClientSeq =
      acked && acked.epoch === lease.epoch ? acked.clientSeq + 1n : 1n;
    this.sections.set(sectionId, {
      epoch: lease.epoch,
      base: doc,
      local: doc,
      nextClientSeq,
      pending: [],
      version: 0,
    });
    return true;
  }

  /** Optimistic local apply; the batch queues for commit. */
  edit(sectionId: string, commands: Command[]): void {
    const s = this.state(sectionId);
    s.local = applyCommands(s.local, commands);
    s.pending.push({ clientSeq: s.nextClientSeq, commands });
    s.nextClientSeq += 1n;
  }

  /**
   * Push the oldest pending batch. On success the base advances; on lease
   * rejection the rejected batch AND everything queued behind it roll back
   * together (suffix rollback) and the local document rebuilds from base.
   */
  async push(sectionId: string): Promise<'committed' | 'rejected' | 'idle'> {
    const s = this.state(sectionId);
    const batch = s.pending[0];
    if (!batch) return 'idle';
    try {
      await this.server.commit({
        draftId: this.draftId,
        sectionId,
        owner: this.owner,
        epoch: s.epoch,
        clientSeq: batch.clientSeq,
        commands: batch.commands,
      });
      // Remove exactly the acknowledged batch, never positionally: concurrent
      // push() calls can capture the same head batch (the server deduplicates
      // the second send), and an unconditional shift() would let the second
      // continuation drop the NEXT, uncommitted batch and re-apply this one
      // to base. Only the continuation that actually removes the batch
      // advances base.
      const index = s.pending.findIndex((b) => b.clientSeq === batch.clientSeq);
      if (index !== -1) {
        s.pending.splice(index, 1);
        s.base = applyCommands(s.base, batch.commands);
        s.version += 1;
      }
      return 'committed';
    } catch (err) {
      if (err instanceof LeaseRejectedError) {
        s.pending = [];
        s.local = s.base;
        return 'rejected';
      }
      throw err;
    }
  }

  async pushAll(sectionId: string): Promise<void> {
    while ((await this.push(sectionId)) === 'committed') {
      /* drain */
    }
  }

  /**
   * Reconnect: manifest-hash resync plus retransmission of unacknowledged
   * batches. Batches the server already applied (client_seq <= lastApplied)
   * are dropped locally; the rest retransmit through the idempotent path.
   *
   * A push can commit while the resume reads are in flight. Its continuation
   * advances base and removes the batch from the queue, so adopting the older
   * snapshot afterwards would move base backwards with no queue entry left to
   * replay the difference — the client would sit silently behind the server.
   * The state version detects exactly that and re-reads instead; each retry
   * requires another acknowledgement to have landed, so it settles as soon as
   * the in-flight pushes do.
   */
  async reconnect(sectionId: string): Promise<void> {
    for (;;) {
      const s = this.state(sectionId);
      const version = s.version;
      const resume = await this.server.resume(this.draftId, this.owner);
      const serverDoc = await this.server.getSection(
        resume.sectionHashes[sectionId] ?? '',
      );
      if (s.version !== version) continue;

      const last = resume.lastApplied[sectionId];
      if (last && last.epoch === s.epoch) {
        s.pending = s.pending.filter((b) => b.clientSeq > last.clientSeq);
      }
      s.base = serverDoc;
      s.local = s.pending.reduce(
        (doc, b) => applyCommands(doc, b.commands),
        serverDoc,
      );
      s.version += 1;
      break;
    }
    await this.pushAll(sectionId);
  }

  localHash(sectionId: string): string {
    return contentHash(this.state(sectionId).local);
  }

  baseHash(sectionId: string): string {
    return contentHash(this.state(sectionId).base);
  }

  epoch(sectionId: string): bigint {
    return this.state(sectionId).epoch;
  }

  pendingCount(sectionId: string): number {
    return this.state(sectionId).pending.length;
  }

  private state(sectionId: string): SectionState {
    const s = this.sections.get(sectionId);
    if (!s) throw new Error(`section ${sectionId} not open`);
    return s;
  }
}
