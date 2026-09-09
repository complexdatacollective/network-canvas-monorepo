import { afterEach, describe, expect, it } from 'vitest';

import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { streamProtocolEvents } from '../../state/channel.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import {
  createWebSocketHost,
  type WebSocketHost,
} from '../../testing/host/websocketHost.ts';
import type { ProtocolEvent } from '../schemas.ts';

const FIXTURE: Record<string, unknown> = allInterfaces;
const INFORMATION = sectionId({ kind: 'stage', stageId: 'information-1' });

const WRITER = {
  sessionId: 'writer-session',
  userId: 'writer',
  displayName: 'Grace',
};

let served: WebSocketHost | undefined;

afterEach(async () => {
  await served?.close();
  served = undefined;
});

async function until(
  predicate: () => boolean,
  what: string,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('an event iterator over a socket that drops mid-stream', () => {
  it('delivers every revision exactly once and in order across the drop', async () => {
    served = await createWebSocketHost({
      sections: sectionsFromProtocol(FIXTURE),
    });
    const { host, client, dropConnection } = served;

    const labels: string[] = [];
    const revisions: bigint[] = [];
    const controller = new AbortController();
    const collect = (event: ProtocolEvent) => {
      if (event.type !== 'revision') return;
      if (event.sectionId !== INFORMATION) return;
      revisions.push(event.revision.sequence);
      labels.push(String(event.document?.label));
    };
    const channel = streamProtocolEvents(
      client,
      host.protocolId,
      collect,
      controller.signal,
    );

    const writer = host.asCollaborator(WRITER);
    const held = await writer.acquireLock({
      protocolId: host.protocolId,
      sectionId: INFORMATION,
    });
    const write = async (label: string) => {
      await writer.submit({
        protocolId: host.protocolId,
        sectionId: INFORMATION,
        document: { ...held.document, label },
        revision: held.revision,
      });
    };

    await write('before-1');
    await write('before-2');
    await until(() => labels.length === 2, 'the first two revisions');

    dropConnection();
    await write('during-1');
    await write('during-2');
    await write('after-1');

    await until(() => labels.length === 5, 'the revisions across the drop');
    // Nothing more should arrive: a resume that replays from the wrong cursor
    // would deliver a revision twice.
    await new Promise((resolve) => setTimeout(resolve, 300));

    controller.abort();
    await channel;

    expect(labels).toEqual([
      'before-1',
      'before-2',
      'during-1',
      'during-2',
      'after-1',
    ]);
    expect(revisions).toEqual([...revisions].sort((a, b) => (a < b ? -1 : 1)));
    expect(new Set(revisions).size).toBe(revisions.length);
  });
});
