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

const channelFactory = (name: string) =>
  new FakeBroadcastChannel(name) as unknown as BroadcastChannel;

// Locks register a window 'pagehide' listener; track and close them between
// tests so a leaked listener from one test can't fire during another.
const locks: ProtocolTabLock[] = [];
const makeLock = (options: Parameters<typeof createProtocolTabLock>[0]) => {
  const lock = createProtocolTabLock(options);
  locks.push(lock);
  return lock;
};

beforeEach(() => {
  FakeBroadcastChannel.reset();
});

afterEach(() => {
  for (const lock of locks.splice(0)) lock.close();
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

  it('degrades to always-exclusive when BroadcastChannel is unavailable', () => {
    const lock = makeLock({ channelFactory: () => null });

    expect(() => lock.claimProtocol('p1')).not.toThrow();
    expect(lock.isExclusive()).toBe(true);
    expect(() => lock.releaseProtocol()).not.toThrow();
  });
});
