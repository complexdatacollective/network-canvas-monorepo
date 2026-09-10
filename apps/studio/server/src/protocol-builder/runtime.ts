// The process-local half of the host: who is present, which leases this
// process is keeping alive, and the live fan-out that carries both.
//
// The contract has no renew: an editor takes a section and holds it until it
// releases. Studio's storage is a lease with a wall-clock expiry, so keeping
// the two agreeing is the server's business — this is where that happens.
import type { Presence } from '@codaco/protocol-builder-core/contract/schemas';
import type { SyncServer } from '@codaco/studio-sync/server';

import { logOperational } from '../observability/logger.ts';
import { ProtocolEventPublisher } from './events.ts';

/** A third of the lease TTL: two renewals may be lost before one expires. */
const RENEW_INTERVAL_MS = 10_000;

/**
 * How long an owner's leases wait for its next connection after the last one
 * ended.
 *
 * A lock belongs to a browser tab, and a tab keeps its identity across the
 * sockets it opens, so a socket that vanishes is a reconnection in progress
 * rather than a departure. Shorter than the 30s lease TTL, per #1247's rule
 * that a dirty drop holds the lease for a window shorter than the TTL: a tab
 * whose socket died must never cost a colleague more than a server that died,
 * which frees its sections within one TTL because nothing is left to renew
 * them. Long enough for five rungs of the reconnect ladder #1247 fixes for the
 * client (500ms doubling to a 30s cap: 0.5s, 1.5s, 3.5s, 7.5s, 15.5s), which
 * is every blip a researcher would call one. Renewal is only checked on the
 * 10s tick, so the release lands within a TTL of the drop either way. A tab
 * that closes cleanly releases its lock and gives the section back at once, so
 * this bounds a crash or a drop rather than a departure.
 */
export const RECONNECT_GRACE_MS = 20_000;

/**
 * How long a lease — and the imports staged beside it — outlives an owner that
 * has never opened a channel.
 *
 * Studio's editor opens one, so this is the unary plane alone: a script, or a
 * client whose network refuses WebSockets. There is no connection to end
 * there, so the only sign of life is a call, and the bound is wide enough that
 * a researcher reading a section does not lose it mid-thought.
 */
export const IDLE_MS = 5 * 60_000;

/**
 * How long a watcher's authorisation is trusted for.
 *
 * `watchProtocol` resolves membership once and then runs for as long as the
 * researcher keeps the protocol open, so a grant revoked in between would
 * otherwise go on delivering research protocol changes to someone who no
 * longer has any. Re-resolved no less often than the leases are renewed, so a
 * revocation costs at most one renewal interval of access nobody has.
 */
export const REAUTHORIZE_MS = RENEW_INTERVAL_MS;

/**
 * A renewal the storage never answered, told apart from the `null` that is an
 * answer: only the second means the lease is gone.
 */
const UNANSWERED = Symbol('lease renewal unanswered');

type HeldLease = {
  sync: SyncServer;
  draftId: string;
  sectionId: string;
  owner: string;
  epoch: bigint;
  touchedAt: number;
};

type OwnerConnections = {
  open: number;
  /** When the owner's last connection ended, while none has replaced it. */
  strandedAt?: number;
  /**
   * Everything the owner loses once the grace has run out: the leases it still
   * holds, given back with a lock event, and the imports it had staged.
   *
   * One per draft the owner opened a channel on, because one tab may hold
   * sections in more than one protocol and each release is that draft's own.
   */
  ends: Map<string, () => Promise<void>>;
};

function leaseKey(draftId: string, sectionId: string, owner: string): string {
  return `${draftId} ${sectionId} ${owner}`;
}

/**
 * Renews every lease this process is holding until it is released, or until
 * its owner has gone the reconnect grace with no connection at all.
 */
export class LeaseKeeper {
  readonly #held = new Map<string, HeldLease>();
  readonly #connections = new Map<string, OwnerConnections>();
  #timer: NodeJS.Timeout | undefined;
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  /**
   * Counts one live connection for an owner, and gives back the call that ends
   * it. While a connection is open its owner's leases are renewed however long
   * the researcher spends not calling anything: losing a lock under an open
   * editor is not a thing that may happen.
   *
   * The last connection ending starts the reconnect grace rather than the
   * release: the owner is a browser tab, and a tab reconnecting is the same
   * tab. `end` is what runs for this draft if none comes back in time.
   */
  connect(
    owner: string,
    draftId: string,
    end: () => Promise<void>,
  ): () => void {
    const state = this.#connections.get(owner);
    const ends = state?.ends ?? new Map<string, () => Promise<void>>();
    ends.set(draftId, end);
    this.#connections.set(owner, { open: (state?.open ?? 0) + 1, ends });
    return () => {
      const open = this.#connections.get(owner);
      if (open === undefined) return;
      if (open.open > 1) {
        this.#connections.set(owner, { ...open, open: open.open - 1 });
        return;
      }
      this.#connections.set(owner, {
        ...open,
        open: 0,
        strandedAt: this.#now(),
      });
      this.#start();
    };
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
    this.#stopWhenIdle();
  }

  /**
   * Whether this owner still has a channel: one open, or one whose reconnect
   * grace has not run out. What keeps its leases out of the idle bound is what
   * keeps the imports it staged, so both ask this.
   */
  connected(owner: string): boolean {
    return this.#connections.has(owner);
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
    await this.#endStranded(at);
    // Deleting the current entry mid-iteration is defined for a Map, so this
    // walks the live map rather than a copy of it.
    for (const [key, lease] of this.#held) {
      if (
        !this.#connections.has(lease.owner) &&
        at - lease.touchedAt > IDLE_MS
      ) {
        this.#held.delete(key);
        continue;
      }
      const renewed = await lease.sync
        .renew(lease.draftId, lease.sectionId, lease.owner, lease.epoch)
        .catch(() => UNANSWERED);
      // A renewal that could not be made is not an answer: a database that
      // was briefly unreachable has said nothing about whose lease it is, and
      // forgetting the lease here would let it expire under an editor who is
      // still holding it — whose next submit is then refused as
      // `NOT_LOCK_HOLDER`. The entry stays and the next tick asks again; the
      // interval is a third of the TTL so that two may be lost this way.
      if (renewed === UNANSWERED) continue;
      // `null` is the update matching no row, which is a lease that expired
      // or was taken over. The acquire that took it publishes its own lock
      // event, so dropping the entry is the whole of the response here.
      if (renewed === null) this.#held.delete(key);
    }
    this.#stopWhenIdle();
  }

  /**
   * Owners whose reconnection never came. Renewal continues throughout the
   * grace, so what ends the lease is this rather than the storage expiry — the
   * section is free the moment the grace is up, and the release publishes the
   * lock event that tells everyone watching.
   */
  async #endStranded(at: number): Promise<void> {
    for (const [owner, state] of this.#connections) {
      if (
        state.strandedAt === undefined ||
        at - state.strandedAt <= RECONNECT_GRACE_MS
      ) {
        continue;
      }
      this.#connections.delete(owner);
      for (const end of state.ends.values()) {
        // This runs from a timer, so a release that cannot reach the database
        // has nobody to report to and must not take the process down with an
        // unhandled rejection. The leases it was giving back are already out
        // of this keeper, so they lapse on their own expiry instead.
        await end().catch(() => {
          logOperational('STUDIO_PROTOCOL_LEASE_RELEASE_FAILED');
        });
      }
    }
  }

  #start(): void {
    if (this.#timer !== undefined) return;
    this.#timer = setInterval(() => {
      void this.renewDue();
    }, RENEW_INTERVAL_MS);
    // Renewal must never be the reason a process stays alive.
    this.#timer.unref();
  }

  #stopWhenIdle(): void {
    if (this.#timer === undefined || this.#held.size > 0) return;
    const waiting = [...this.#connections.values()].some(
      (state) => state.strandedAt !== undefined,
    );
    if (waiting) return;
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
  /** The clock everything here reads, so a test can reach the bounds above. */
  now: () => number;
};

export function createProtocolBuilderRuntime(
  now?: () => number,
): ProtocolBuilderRuntime {
  const clock = now ?? Date.now;
  return {
    publisher: new ProtocolEventPublisher(),
    presence: new PresenceRegistry(),
    leases: new LeaseKeeper(clock),
    now: clock,
  };
}
