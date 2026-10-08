import { Redacted, Stream } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';
import { HostUnauthorized } from '@codaco/protocol-builder-core/contract/session';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { createInMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import { streamProtocolEvents } from '../channel.ts';
import type { ProtocolBuilderAdapter } from '../context.ts';

const PRESENCE: ProtocolEvent = { type: 'presence', present: [] };

type Step = 'drop' | 'deliver';

/**
 * A host whose `WatchProtocol` follows a script — a dropped stream, or one
 * that delivers an event and then ends — recording when each attempt was made.
 */
function scriptedHost(script: readonly Step[], attempts: number[]) {
  const host = createInMemoryHost({ sections: {} });
  let attempt = 0;
  const adapter = host.adapterWith({
    WatchProtocol: () => {
      attempts.push(Date.now());
      const step = script[Math.min(attempt, script.length - 1)];
      attempt += 1;
      return step === 'deliver'
        ? Stream.make(PRESENCE)
        : Stream.die(new Error('the stream dropped'));
    },
  });
  return { host, adapter };
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
  const attempts: number[] = [];
  const { host, adapter } = scriptedHost(script, attempts);
  const controller = new AbortController();
  const channel = streamProtocolEvents(
    adapter,
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

const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });

const WRITER = {
  sessionId: 'writer-session',
  userId: 'writer',
  displayName: 'Grace',
};

async function until(predicate: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('the protocol channel resuming', () => {
  it('delivers every revision once across a dropped stream', async () => {
    const host = createInMemoryHost({
      sections: sectionsFromProtocol(allInterfaces),
    });
    const labels: string[] = [];
    const controller = new AbortController();
    const channel = streamProtocolEvents(
      host.adapter,
      host.protocolId,
      (event) => {
        if (event.type === 'revision' && event.sectionId === INFORMATION) {
          labels.push(
            String(
              event.document === undefined
                ? undefined
                : Redacted.value(event.document).label,
            ),
          );
        }
      },
      controller.signal,
    );

    const writer = host.asCollaborator(WRITER);
    const held = await writer.rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    let writes = 0;
    const write = (label: string) =>
      writer.rpcCall('Submit', {
        protocolId: host.protocolId,
        requestId: `resume-${++writes}`,
        sectionId: INFORMATION,
        document: Redacted.make({ ...Redacted.value(held.document), label }),
        revision: held.revision,
      });

    await write('before');
    await until(() => labels.includes('before'), 'the first revision');

    host.store.disconnectWatchers();
    await write('while down');
    await until(
      () => labels.includes('while down'),
      'the revision written while down',
    );

    host.store.disconnectWatchers();
    await write('after');
    await until(
      () => labels.includes('after'),
      'the revision after the resume',
    );
    await new Promise((resolve) => setTimeout(resolve, 600));

    controller.abort();
    await channel;
    expect(labels).toEqual(['before', 'while down', 'after']);
  });
});

describe('the protocol channel refused by the session', () => {
  it('reconnects after an unauthorized watch and delivers', async () => {
    const host = createInMemoryHost({
      sections: sectionsFromProtocol(allInterfaces),
    });
    let attempts = 0;
    const adapter = {
      ...host.adapter,
      rpcStream: (tag, payload, onChunk, signal) => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new HostUnauthorized({}))
          : host.adapter.rpcStream(tag, payload, onChunk, signal);
      },
    } satisfies ProtocolBuilderAdapter;
    const delivered: string[] = [];
    const controller = new AbortController();
    const channel = streamProtocolEvents(
      adapter,
      host.protocolId,
      (event) => delivered.push(event.type),
      controller.signal,
    );

    await until(() => delivered.length > 0, 'an event after the refusal');

    controller.abort();
    await channel;
    expect(attempts).toBe(2);
  });
});
