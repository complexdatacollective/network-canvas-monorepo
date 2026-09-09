// The process-local half of the host: who is present, which leases this
// process is keeping alive, and the live fan-out that carries both.
//
// The contract has no renew: an editor takes a section and holds it until it
// releases. Studio's storage is a lease with a wall-clock expiry, so keeping
// the two agreeing is the server's business — this is where that happens.
import type { Presence } from '@codaco/protocol-builder/contract/schemas';
import type { SyncServer } from '@codaco/studio-sync/server';

import { ProtocolEventPublisher } from './events.ts';

/** A third of the lease TTL: two renewals may be lost before one expires. */
const RENEW_INTERVAL_MS = 10_000;

/**
 * How long a lease is kept alive for a caller that has gone quiet without
 * releasing it. A WebSocket connection ends its own leases when it closes;
 * this bounds the unary plane, where there is no close to observe.
 */
const IDLE_MS = 5 * 60_000;

type HeldLease = {
  sync: SyncServer;
  draftId: string;
  sectionId: string;
  owner: string;
  epoch: bigint;
  touchedAt: number;
};

function leaseKey(draftId: string, sectionId: string, owner: string): string {
  return `${draftId} ${sectionId} ${owner}`;
}

/**
 * Renews every lease this process is holding until it is released, its
 * connection closes, or its holder goes quiet for longer than the idle bound.
 */
export class LeaseKeeper {
  readonly #held = new Map<string, HeldLease>();
  #timer: NodeJS.Timeout | undefined;
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  hold(lease: Omit<HeldLease, 'touchedAt'>): void {
    this.#held.set(leaseKey(lease.draftId, lease.sectionId, lease.owner), {
      ...lease,
      touchedAt: this.#now(),
    });
    this.#start();
  }

  drop(draftId: string, sectionId: string, owner: string): void {
    this.#held.delete(leaseKey(draftId, sectionId, owner));
    this.#stopWhenEmpty();
  }

  /** Every section this owner still holds here, as far as this process knows. */
  heldSections(draftId: string, owner: string): string[] {
    return [...this.#held.values()]
      .filter((lease) => lease.draftId === draftId && lease.owner === owner)
      .map((lease) => lease.sectionId);
  }

  touch(owner: string): void {
    const at = this.#now();
    for (const lease of this.#held.values()) {
      if (lease.owner === owner) lease.touchedAt = at;
    }
  }

  async renewDue(): Promise<void> {
    const at = this.#now();
    // Deleting the current entry mid-iteration is defined for a Map, so this
    // walks the live map rather than a copy of it.
    for (const [key, lease] of this.#held) {
      if (at - lease.touchedAt > IDLE_MS) {
        this.#held.delete(key);
        continue;
      }
      const renewed = await lease.sync
        .renew(lease.draftId, lease.sectionId, lease.owner, lease.epoch)
        .catch(() => null);
      // A lease that cannot be renewed has expired or been taken over. The
      // acquire that took it publishes its own lock event, so dropping the
      // entry is the whole of the response here.
      if (renewed === null) this.#held.delete(key);
    }
    this.#stopWhenEmpty();
  }

  #start(): void {
    if (this.#timer !== undefined) return;
    this.#timer = setInterval(() => {
      void this.renewDue();
    }, RENEW_INTERVAL_MS);
    // Renewal must never be the reason a process stays alive.
    this.#timer.unref();
  }

  #stopWhenEmpty(): void {
    if (this.#held.size > 0 || this.#timer === undefined) return;
    clearInterval(this.#timer);
    this.#timer = undefined;
  }
}

/**
 * Who is in a protocol, per process.
 *
 * Ephemeral by decision (#1247): presence has no persistence and no delivery
 * guarantee, so it lives here and carries no cursor on the wire. A lock event
 * names its holder from the persisted log instead, which is why a second
 * process still reports locks correctly.
 */
export class PresenceRegistry {
  readonly #byDraft = new Map<string, Map<string, Presence>>();

  join(draftId: string, presence: Presence): void {
    const present = this.#byDraft.get(draftId) ?? new Map<string, Presence>();
    present.set(presence.sessionId, presence);
    this.#byDraft.set(draftId, present);
  }

  leave(draftId: string, sessionId: string): void {
    const present = this.#byDraft.get(draftId);
    if (present === undefined) return;
    present.delete(sessionId);
    if (present.size === 0) this.#byDraft.delete(draftId);
  }

  /** Moves a present connection between viewing and editing one section. */
  setMode(
    draftId: string,
    sessionId: string,
    mode: Presence['mode'],
    sectionId: Presence['sectionId'],
  ): void {
    const present = this.#byDraft.get(draftId)?.get(sessionId);
    if (present === undefined) return;
    this.join(draftId, {
      sessionId: present.sessionId,
      userId: present.userId,
      displayName: present.displayName,
      mode,
      ...(sectionId === undefined ? {} : { sectionId }),
    });
  }

  list(draftId: string): Presence[] {
    return [...(this.#byDraft.get(draftId)?.values() ?? [])];
  }
}

/** Everything one server process holds for the protocol-builder host. */
export type ProtocolBuilderRuntime = {
  publisher: ProtocolEventPublisher;
  presence: PresenceRegistry;
  leases: LeaseKeeper;
};

export function createProtocolBuilderRuntime(): ProtocolBuilderRuntime {
  return {
    publisher: new ProtocolEventPublisher(),
    presence: new PresenceRegistry(),
    leases: new LeaseKeeper(),
  };
}
