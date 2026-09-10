import { AsyncIteratorClass } from '@orpc/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolBuilderClient } from '@codaco/protocol-builder-core/contract';
import type { ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';

import { createInMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import { streamProtocolEvents } from '../channel.ts';

const PRESENCE: ProtocolEvent = { type: 'presence', present: [] };

type Step = 'drop' | 'deliver';

/**
 * A client whose `watchProtocol` follows a script — a dropped stream, or one
 * that delivers an event and then ends — recording when each attempt was made.
 *
 * The router client is a lazy proxy, so it cannot be spread: only
 * `watchProtocol` is replaced.
 */
function scriptedClient(
  base: ProtocolBuilderClient,
  script: readonly Step[],
  attempts: number[],
): ProtocolBuilderClient {
  let attempt = 0;
  const watchProtocol: ProtocolBuilderClient['watchProtocol'] = async () => {
    attempts.push(Date.now());
    const step = script[Math.min(attempt, script.length - 1)];
    attempt += 1;
    if (step !== 'deliver') throw new Error('the stream dropped');
    let delivered = false;
    return new AsyncIteratorClass<ProtocolEvent, void, void>(
      () => {
        if (delivered) return Promise.resolve({ done: true, value: undefined });
        delivered = true;
        return Promise.resolve({ done: false, value: PRESENCE });
      },
      () => Promise.resolve(),
    );
  };
  return new Proxy(base, {
    get: (target, property) =>
      property === 'watchProtocol'
        ? watchProtocol
        : Reflect.get(target, property),
  });
}

function gapsBetween(times: readonly number[]): number[] {
  const gaps: number[] = [];
  let previous: number | undefined;
  for (const time of times) {
    if (previous !== undefined) gaps.push(time - previous);
    previous = time;
  }
  return gaps;
}

async function run(script: readonly Step[], overMs: number) {
  const host = createInMemoryHost({ sections: {} });
  const attempts: number[] = [];
  const controller = new AbortController();
  const channel = streamProtocolEvents(
    scriptedClient(host.client, script, attempts),
    host.protocolId,
    () => undefined,
    controller.signal,
  );
  await vi.advanceTimersByTimeAsync(overMs);
  controller.abort();
  await channel;
  expect(attempts.length).toBeGreaterThan(1);
  return gapsBetween(attempts);
}

describe('the protocol channel reconnecting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits longer before each further attempt, up to a cap', async () => {
    const gaps = await run(['drop'], 20_000);

    expect(gaps.slice(0, 7)).toEqual([250, 500, 1000, 2000, 4000, 4000, 4000]);
    expect(Math.max(...gaps)).toBe(4000);
  });

  it('waits from the start again once a stream has delivered', async () => {
    const gaps = await run(['drop', 'drop', 'deliver', 'drop'], 20_000);

    expect(gaps.slice(0, 4)).toEqual([250, 500, 250, 500]);
  });
});
