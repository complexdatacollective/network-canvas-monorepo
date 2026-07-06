import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createProtocolTabLock,
  type ProtocolTabLock,
} from '../protocolTabLock';

// A minimal in-process BroadcastChannel stand-in: every channel created with
// the same name shares one message bus, and a post is delivered to every OTHER
// channel on that bus (never back to the sender), mirroring the real API.
class FakeBroadcastChannel {
  static buses = new Map<string, Set<FakeBroadcastChannel>>();
  name: string;
  listeners = new Set<(event: { data: unknown }) => void>();
  closed = false;

  constructor(name: string) {
    this.name = name;
    const bus = FakeBroadcastChannel.buses.get(name) ?? new Set();
    bus.add(this);
    FakeBroadcastChannel.buses.set(name, bus);
  }

  addEventListener(
    _type: 'message',
    listener: (event: { data: unknown }) => void,
  ): void {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: 'message',
    listener: (event: { data: unknown }) => void,
  ): void {
    this.listeners.delete(listener);
  }

  postMessage(data: unknown): void {
    const bus = FakeBroadcastChannel.buses.get(this.name);
    if (!bus) return;
    for (const channel of bus) {
      if (channel === this || channel.closed) continue;
      for (const listener of channel.listeners) {
        listener({ data: structuredClone(data) });
      }
    }
  }

  close(): void {
    this.closed = true;
    FakeBroadcastChannel.buses.get(this.name)?.delete(this);
  }

  static reset(): void {
    FakeBroadcastChannel.buses.clear();
  }
}

// A deferred variant that QUEUES posted messages and only delivers a round when
// `flush()` is called (messages posted during a flush wait for the next one).
// This models the async nature of a real BroadcastChannel, letting two tabs both
// become optimistically exclusive before their claims cross — the interleaving
// the synchronous FakeBroadcastChannel above cannot reproduce.
class DeferredBroadcastChannel {
  static buses = new Map<string, Set<DeferredBroadcastChannel>>();
  static queue: { sender: DeferredBroadcastChannel; data: unknown }[] = [];
  name: string;
  listeners = new Set<(event: { data: unknown }) => void>();
  closed = false;

  constructor(name: string) {
    this.name = name;
    const bus = DeferredBroadcastChannel.buses.get(name) ?? new Set();
    bus.add(this);
    DeferredBroadcastChannel.buses.set(name, bus);
  }

  addEventListener(
    _type: 'message',
    listener: (event: { data: unknown }) => void,
  ): void {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: 'message',
    listener: (event: { data: unknown }) => void,
  ): void {
    this.listeners.delete(listener);
  }

  postMessage(data: unknown): void {
    DeferredBroadcastChannel.queue.push({ sender: this, data });
  }

  close(): void {
    this.closed = true;
    DeferredBroadcastChannel.buses.get(this.name)?.delete(this);
  }

  static flush(): void {
    const batch = DeferredBroadcastChannel.queue.splice(0);
    for (const { sender, data } of batch) {
      const bus = DeferredBroadcastChannel.buses.get(sender.name);
      if (!bus) continue;
      for (const channel of bus) {
        if (channel === sender || channel.closed) continue;
        for (const listener of channel.listeners) {
          listener({ data: structuredClone(data) });
        }
      }
    }
  }

  static reset(): void {
    DeferredBroadcastChannel.buses.clear();
    DeferredBroadcastChannel.queue = [];
  }
}

const CHANNEL = 'architect-protocol-lock';

const channelFactory = (name: string) =>
  new FakeBroadcastChannel(name) as unknown as BroadcastChannel;

const deferredChannelFactory = (name: string) =>
  new DeferredBroadcastChannel(name) as unknown as BroadcastChannel;

// Drain all queued rounds so a race settles (bounded so a bug can't hang).
const flushDeferred = () => {
  for (let i = 0; i < 20; i += 1) DeferredBroadcastChannel.flush();
};

// Locks register window 'pagehide'/'pageshow' listeners; track and close them
// between tests so a leaked listener from one test can't fire during another.
const locks: ProtocolTabLock[] = [];
const makeLock = (options: Parameters<typeof createProtocolTabLock>[0]) => {
  const lock = createProtocolTabLock(options);
  locks.push(lock);
  return lock;
};

type LockMsg = { type: string; id?: string; from?: string };

// A raw channel standing in for another tab, WITHOUT window listeners, so it
// doesn't react to the pagehide/pageshow events a test fires at the lock under
// test. It can be told to "hold" a protocol (auto-answering "held" to claims).
const peers: FakeBroadcastChannel[] = [];
const makePeer = () => {
  const ch = new FakeBroadcastChannel(CHANNEL);
  peers.push(ch);
  const received: LockMsg[] = [];
  let holdId: string | null = null;
  ch.addEventListener('message', (event) => {
    const msg = event.data as LockMsg;
    received.push(msg);
    if (holdId !== null && msg.type === 'claim' && msg.id === holdId) {
      ch.postMessage({ type: 'held', id: holdId, from: 'peer' });
    }
  });
  return {
    received,
    hold: (id: string) => {
      holdId = id;
      ch.postMessage({ type: 'claim', id, from: 'peer' });
    },
    claim: (id: string) => ch.postMessage({ type: 'claim', id, from: 'peer' }),
  };
};

const firePageShow = (persisted: boolean) => {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
};

beforeEach(() => {
  FakeBroadcastChannel.reset();
  DeferredBroadcastChannel.reset();
});

afterEach(() => {
  for (const lock of locks.splice(0)) lock.close();
  for (const peer of peers.splice(0)) peer.close();
  vi.restoreAllMocks();
});

describe('protocolTabLock', () => {
  it('the first tab to claim a protocol holds it exclusively', () => {
    const onExclusivityChange = vi.fn();
    const lock = makeLock({ channelFactory, onExclusivityChange });

    lock.claimProtocol('p1');

    // No other tab holds p1, so this tab is the exclusive editor.
    expect(lock.isExclusive()).toBe(true);
    expect(onExclusivityChange).not.toHaveBeenCalledWith(false);
  });

  it('a second tab claiming the same protocol is told it is not exclusive', () => {
    const tabA = makeLock({ channelFactory });
    const onB = vi.fn();
    const tabB = makeLock({ channelFactory, onExclusivityChange: onB });

    tabA.claimProtocol('p1');
    tabB.claimProtocol('p1');

    // tabA replies "held" to tabB's claim; tabB loses exclusivity.
    expect(tabB.isExclusive()).toBe(false);
    expect(onB).toHaveBeenLastCalledWith(false);
    // tabA keeps its exclusivity.
    expect(tabA.isExclusive()).toBe(true);
  });

  it('two tabs editing DIFFERENT protocols are both exclusive', () => {
    const tabA = makeLock({ channelFactory });
    const tabB = makeLock({ channelFactory });

    tabA.claimProtocol('p1');
    tabB.claimProtocol('p2');

    expect(tabA.isExclusive()).toBe(true);
    expect(tabB.isExclusive()).toBe(true);
  });

  it('when the holder releases, a waiting duplicate regains exclusivity', () => {
    const tabA = makeLock({ channelFactory });
    const onB = vi.fn();
    const tabB = makeLock({ channelFactory, onExclusivityChange: onB });

    tabA.claimProtocol('p1');
    tabB.claimProtocol('p1');
    expect(tabB.isExclusive()).toBe(false);

    tabA.releaseProtocol();

    // tabB is notified the protocol is free and reclaims it.
    expect(tabB.isExclusive()).toBe(true);
    expect(onB).toHaveBeenLastCalledWith(true);
  });

  it('claiming a new protocol releases the previous claim', () => {
    const tabA = makeLock({ channelFactory });
    const onB = vi.fn();
    const tabB = makeLock({ channelFactory, onExclusivityChange: onB });

    tabA.claimProtocol('p1');
    tabB.claimProtocol('p1');
    expect(tabB.isExclusive()).toBe(false);

    // tabA switches to a different protocol; p1 is now free for tabB.
    tabA.claimProtocol('p2');

    expect(tabB.isExclusive()).toBe(true);
  });

  it('releases its claim on pagehide so a duplicate can reclaim', () => {
    const tabA = makeLock({ channelFactory });
    const onB = vi.fn();
    const tabB = makeLock({ channelFactory, onExclusivityChange: onB });

    tabA.claimProtocol('p1');
    tabB.claimProtocol('p1');
    expect(tabB.isExclusive()).toBe(false);

    // tabA's tab is being unloaded (navigated away / closed).
    window.dispatchEvent(new Event('pagehide'));

    expect(tabB.isExclusive()).toBe(true);
  });

  it('on a bfcache restore, re-claims and is demoted if a peer took over', () => {
    const onA = vi.fn();
    const tabA = makeLock({ channelFactory, onExclusivityChange: onA });
    const peer = makePeer();

    tabA.claimProtocol('p1');
    expect(tabA.isExclusive()).toBe(true);

    // tabA is frozen into the back/forward cache: pagehide releases its claim.
    window.dispatchEvent(new Event('pagehide'));
    // A peer takes over p1 while tabA is frozen.
    peer.hold('p1');
    // tabA is restored from bfcache WITHOUT a React remount.
    firePageShow(true);

    // tabA re-asserts its claim, the peer answers "held", so tabA is correctly
    // demoted (its autosave will be disabled) rather than silently double-editing.
    expect(tabA.isExclusive()).toBe(false);
    expect(onA).toHaveBeenLastCalledWith(false);
  });

  it('on a bfcache restore with no peer, re-claims so it still blocks a duplicate', () => {
    const tabA = makeLock({ channelFactory });

    tabA.claimProtocol('p1');
    window.dispatchEvent(new Event('pagehide')); // released on freeze
    firePageShow(true); // restored → re-claims p1

    // tabA holds p1 again: a fresh duplicate's claim is answered "held".
    const peer = makePeer();
    peer.claim('p1');

    expect(peer.received.some((m) => m.type === 'held' && m.id === 'p1')).toBe(
      true,
    );
  });

  it('does not re-claim on a bfcache restore after an explicit release', () => {
    const tabA = makeLock({ channelFactory });

    tabA.claimProtocol('p1');
    tabA.releaseProtocol(); // leaving the editor clears the intended claim
    firePageShow(true);

    // p1 was intentionally given up, so tabA must not silently re-grab it.
    const peer = makePeer();
    peer.claim('p1');

    expect(peer.received.some((m) => m.type === 'held' && m.id === 'p1')).toBe(
      false,
    );
  });

  it('two ex-duplicates re-claiming a released protocol end with exactly one editor', () => {
    const onB = vi.fn();
    const onC = vi.fn();
    const tabA = makeLock({ channelFactory: deferredChannelFactory });
    const tabB = makeLock({
      channelFactory: deferredChannelFactory,
      onExclusivityChange: onB,
    });
    const tabC = makeLock({
      channelFactory: deferredChannelFactory,
      onExclusivityChange: onC,
    });

    // A holds p1; B and C open it and settle into read-only waiters (flush
    // between each so they resolve sequentially, not as a race).
    tabA.claimProtocol('p1');
    flushDeferred();
    tabB.claimProtocol('p1');
    flushDeferred();
    tabC.claimProtocol('p1');
    flushDeferred();
    expect(tabA.isExclusive()).toBe(true);
    expect(tabB.isExclusive()).toBe(false);
    expect(tabC.isExclusive()).toBe(false);

    // A leaves. B and C both re-claim p1 in the same round — both optimistically
    // exclusive — before their claims cross.
    tabA.releaseProtocol();
    flushDeferred();

    // The tie-break yields exactly one editor: never both read-only (the livelock
    // this guards against) nor both editing (a data clobber).
    expect(tabB.isExclusive()).not.toBe(tabC.isExclusive());
  });

  it('degrades to always-exclusive when BroadcastChannel is unavailable', () => {
    const lock = makeLock({ channelFactory: () => null });

    expect(() => lock.claimProtocol('p1')).not.toThrow();
    expect(lock.isExclusive()).toBe(true);
    expect(() => lock.releaseProtocol()).not.toThrow();
  });
});
