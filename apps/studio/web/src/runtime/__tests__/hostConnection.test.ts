import { Effect, ManagedRuntime } from 'effect';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { ProtocolBuilderGroup } from '@codaco/protocol-builder-core/contract';
import { createInMemoryHost } from '@codaco/protocol-builder/testing/host/createInMemoryHost';
import type { ResearcherLogEntry } from '@codaco/studio-contract/schema/browser-logs';

import { FakeWebSocket, installSocketHost } from '../../test/hostHarness.ts';
import { HostClient } from '../hostClient.ts';

const logged = vi.hoisted((): ResearcherLogEntry[] => []);

vi.mock('../browserLogs.ts', () => ({
  logResearcher: (entry: ResearcherLogEntry) => {
    logged.push(entry);
  },
  logParticipant: () => undefined,
  startBrowserLogs: () => () => undefined,
}));

const PROTOCOL_ID = 'protocol-under-test';

beforeEach(() => {
  logged.length = 0;
  FakeWebSocket.opened = [];
  FakeWebSocket.openImmediately = false;
  FakeWebSocket.account = { userId: 'user-1', displayName: 'Ada' };
});

const listSections = (
  runtime: ManagedRuntime.ManagedRuntime<HostClient, never>,
) =>
  runtime.runPromiseExit(
    Effect.flatMap(HostClient, (client) =>
      client('ListSections', { protocolId: PROTOCOL_ID }),
    ),
  );

const openNext = async (index: number) => {
  await vi.waitFor(() => expect(FakeWebSocket.opened[index]).toBeDefined());
  FakeWebSocket.opened[index]?.open();
};

describe('the editor connection', () => {
  it('logs a dropped socket, and the reconnect that restores it', async () => {
    const host = createInMemoryHost({
      protocolId: PROTOCOL_ID,
      sections: { stageOrder: { stages: [] } },
    });
    await installSocketHost(ProtocolBuilderGroup.toLayer(host.handle));
    const runtime = ManagedRuntime.make(HostClient.layer);
    onTestFinished(() => runtime.dispose());

    const first = listSections(runtime);
    await openNext(0);
    await first;
    expect(logged).toEqual([]);

    FakeWebSocket.opened[0]?.drop(1006);
    expect(logged).toEqual([
      { message: 'Editor connection lost', level: 'Warn', attributes: {} },
    ]);

    const second = listSections(runtime);
    await openNext(1);
    await second;
    expect(logged).toEqual([
      { message: 'Editor connection lost', level: 'Warn', attributes: {} },
      {
        message: 'Editor connection restored',
        level: 'Info',
        attributes: { duration_ms: expect.any(Number), attempt_count: 1 },
      },
    ]);
  });

  it('starts each editor session with its own connection state', async () => {
    const host = createInMemoryHost({
      protocolId: PROTOCOL_ID,
      sections: { stageOrder: { stages: [] } },
    });
    await installSocketHost(ProtocolBuilderGroup.toLayer(host.handle));
    const earlier = ManagedRuntime.make(HostClient.layer);
    const first = listSections(earlier);
    await openNext(0);
    await first;
    FakeWebSocket.opened[0]?.drop(1006);
    await earlier.dispose();

    const later = ManagedRuntime.make(HostClient.layer);
    onTestFinished(() => later.dispose());
    const second = listSections(later);
    await openNext(1);
    await second;

    expect(logged).toEqual([
      { message: 'Editor connection lost', level: 'Warn', attributes: {} },
    ]);
  });
});
