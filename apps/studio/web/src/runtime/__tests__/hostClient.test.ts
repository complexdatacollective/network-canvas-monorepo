import {
  Cause,
  Effect,
  type Exit,
  Layer,
  ManagedRuntime,
  Option,
  Redacted,
  Stream,
} from 'effect';
import * as TestClock from 'effect/testing/TestClock';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { ProtocolBuilderGroup } from '@codaco/protocol-builder-core/contract';
import { createInMemoryHost } from '@codaco/protocol-builder/testing/host/createInMemoryHost';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { FakeWebSocket, installSocketHost } from '../../test/hostHarness.ts';
import { HostClient } from '../hostClient.ts';

const PROTOCOL_ID = 'protocol-under-test';
const STAGE_ORDER = sectionId({ kind: 'stageOrder' });

const failureOf = (exit: Exit.Exit<unknown, unknown> | undefined): unknown =>
  exit === undefined || exit._tag === 'Success'
    ? undefined
    : Option.getOrUndefined(Cause.findErrorOption(exit.cause));

beforeEach(() => {
  FakeWebSocket.opened = [];
  FakeWebSocket.openImmediately = true;
  FakeWebSocket.account = { userId: 'user-1', displayName: 'Ada' };
});

describe('a connection that stops answering', () => {
  it('fails the call in flight and the open stream within the ping window', async () => {
    const host = createInMemoryHost({
      protocolId: PROTOCOL_ID,
      sections: { stageOrder: { stages: [] } },
    });
    const { served } = await installSocketHost(
      ProtocolBuilderGroup.toLayer({
        ...host.handle,
        GetSection: () => Effect.never,
      }),
    );
    const runtime = ManagedRuntime.make(
      HostClient.layer.pipe(Layer.provideMerge(TestClock.layer())),
    );
    onTestFinished(() => runtime.dispose());

    await runtime.runPromise(
      Effect.flatMap(HostClient, (client) =>
        client('ListSections', { protocolId: PROTOCOL_ID }),
      ),
    );

    let call: Exit.Exit<unknown, unknown> | undefined;
    let stream: Exit.Exit<unknown, unknown> | undefined;
    void runtime
      .runPromiseExit(
        Effect.flatMap(HostClient, (client) =>
          client('GetSection', {
            protocolId: PROTOCOL_ID,
            sectionId: STAGE_ORDER,
          }),
        ),
      )
      .then((exit) => {
        call = exit;
      });
    void runtime
      .runPromiseExit(
        Effect.flatMap(HostClient, (client) =>
          Stream.runDrain(client('WatchProtocol', { protocolId: PROTOCOL_ID })),
        ),
      )
      .then((exit) => {
        stream = exit;
      });
    await vi.waitFor(() =>
      expect(served.map(({ tag }) => tag)).toEqual(
        expect.arrayContaining(['GetSection', 'WatchProtocol']),
      ),
    );

    const [socket] = FakeWebSocket.opened;
    if (socket === undefined) throw new Error('no socket was opened');
    socket.freeze();

    let quietFor = 0;
    while ((call === undefined || stream === undefined) && quietFor < 15) {
      await runtime.runPromise(TestClock.adjust('1 second'));
      quietFor += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(call).toBeDefined();
    expect(stream).toBeDefined();
    expect(quietFor).toBeLessThanOrEqual(10);
    for (const exit of [call, stream]) {
      expect(failureOf(exit)).toMatchObject({
        _tag: 'RpcClientError',
        reason: { _tag: 'SocketReadError' },
      });
    }
    expect(served.filter(({ tag }) => tag === 'GetSection')).toHaveLength(1);
  });
});

describe('a frame above the default bound', () => {
  it('reaches the editor whole, since the socket takes the upload bound', async () => {
    const host = createInMemoryHost({
      protocolId: PROTOCOL_ID,
      sections: { stageOrder: { stages: [] } },
    });
    const large = 'x'.repeat(17 * 1024 * 1024);
    await installSocketHost(
      ProtocolBuilderGroup.toLayer({
        ...host.handle,
        GetSection: () =>
          Effect.succeed({
            document: Redacted.make({ large }),
            revision: { sequence: 1n, contentHash: 'large' },
          }),
      }),
    );
    const runtime = ManagedRuntime.make(HostClient.layer);
    onTestFinished(() => runtime.dispose());

    const exit = await runtime.runPromiseExit(
      Effect.flatMap(HostClient, (client) =>
        client('GetSection', {
          protocolId: PROTOCOL_ID,
          sectionId: STAGE_ORDER,
        }),
      ).pipe(Effect.timeout('5 seconds')),
    );

    expect(exit._tag).toBe('Success');
    if (exit._tag !== 'Success') return;
    expect(Redacted.value(exit.value.document)['large']).toHaveLength(
      large.length,
    );
  });
});
