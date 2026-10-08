import { Redacted } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { attempt } from '../../../state/attempt.ts';
import type { ProtocolBuilderAdapter } from '../../../state/context.ts';
import {
  createInMemoryHost,
  type InMemoryHost,
} from '../createInMemoryHost.ts';
import { sectionsFromProtocol } from '../sectionsFromProtocol.ts';
import { createWebSocketHost } from '../websocketHost.ts';

const FIXTURE: Record<string, unknown> = allInterfaces;
const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });
const WRITER = {
  sessionId: 'writer-session',
  userId: 'writer',
  displayName: 'Grace',
};

type Served = Readonly<{
  host: InMemoryHost;
  adapter: ProtocolBuilderAdapter;
  close: () => Promise<void>;
}>;

const closes: (() => Promise<void>)[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of closes.splice(0)) await close();
});

async function until(predicate: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const hosts: readonly (readonly [string, () => Promise<Served>])[] = [
  [
    'in process',
    () => {
      const host = createInMemoryHost({
        sections: sectionsFromProtocol(FIXTURE),
      });
      return Promise.resolve({
        host,
        adapter: host.adapter,
        close: () => Promise.resolve(),
      });
    },
  ],
  [
    'over a socket',
    () => createWebSocketHost({ sections: sectionsFromProtocol(FIXTURE) }),
  ],
];

describe.each(hosts)('a test host %s', (_, serve) => {
  it("keeps a handler's defect on the call that raised it, leaving the stream open", async () => {
    const served = await serve();
    closes.push(served.close);
    const { host, adapter } = served;

    const events: ProtocolEvent[] = [];
    let streamFailure: unknown;
    const controller = new AbortController();
    const watching = adapter
      .rpcStream(
        'WatchProtocol',
        { protocolId: host.protocolId },
        (event) => events.push(event),
        controller.signal,
      )
      .catch((error: unknown) => {
        if (!controller.signal.aborted) streamFailure = error;
      });
    closes.push(async () => {
      controller.abort();
      await watching;
    });
    await until(
      () => events.some((event) => event.type === 'presence'),
      'the stream to attach',
    );

    vi.spyOn(host.store, 'read').mockImplementationOnce(() => {
      throw new Error('the handler broke');
    });
    const broken = await attempt(adapter, 'GetSection', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    expect(broken.isSuccess).toBe(false);

    const writer = host.asCollaborator(WRITER);
    const held = await writer.rpcCall('AcquireLock', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    await writer.rpcCall('Submit', {
      protocolId: host.protocolId,
      requestId: 'write-after-defect',
      sectionId: INFORMATION,
      document: Redacted.make({
        ...Redacted.value(held.document),
        label: { 'en-US': 'Written after a defect' },
      }),
      revision: held.revision,
    });

    await until(
      () =>
        streamFailure !== undefined ||
        events.some(
          (event) =>
            event.type === 'revision' && event.sectionId === INFORMATION,
        ),
      'the revision to reach the stream',
    );
    expect(streamFailure).toBeUndefined();
    const read = await adapter.rpcCall('GetSection', {
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    expect(Redacted.value(read.document).label).toEqual({
      'en-US': 'Written after a defect',
    });
  });
});
