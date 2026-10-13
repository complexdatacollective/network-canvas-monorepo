import { describe, expect, it, vi } from 'vitest';

import { NotLockHolder } from '@codaco/protocol-builder-core/contract/errors';
import { createInMemoryHost } from '@codaco/protocol-builder/testing/host/createInMemoryHost';
import { fixtureProtocolSections } from '@codaco/protocol-builder/testing/protocolFixture';
import type { ResearcherLogEntry } from '@codaco/studio-contract/schema/browser-logs';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { makeConnectionMonitor, observeLocks } from '../hostFaults.ts';

class FakeSocket extends EventTarget {
  readonly readyState = 1;
  close(): void {}
  send(): void {}
  open(): void {
    this.dispatchEvent(new Event('open'));
  }
  closeWith(code: number): void {
    this.dispatchEvent(Object.assign(new Event('close'), { code }));
  }
}

const monitored = () => {
  const logged: ResearcherLogEntry[] = [];
  let now = 1_000;
  const watch = makeConnectionMonitor(
    (entry) => logged.push(entry),
    () => now,
  );
  const dial = () => {
    const socket = new FakeSocket();
    watch(socket);
    return socket;
  };
  return {
    logged,
    dial,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe('the editor connection monitor', () => {
  it('logs a dropped connection once, then how long and how many dials it took to restore', () => {
    const { logged, dial, advance } = monitored();
    const first = dial();
    first.open();
    first.closeWith(1006);
    advance(500);
    dial().closeWith(1006);
    advance(2_000);
    dial().open();

    expect(logged).toEqual([
      { message: 'Editor connection lost', level: 'Warn', attributes: {} },
      {
        message: 'Editor connection restored',
        level: 'Info',
        attributes: { duration_ms: 2_500, attempt_count: 2 },
      },
    ]);
  });

  it('treats an error on an open socket as a lost connection, whatever close follows', () => {
    const { logged, dial } = monitored();
    const socket = dial();
    socket.open();
    socket.dispatchEvent(new Event('error'));
    socket.closeWith(1000);
    expect(logged).toEqual([
      { message: 'Editor connection lost', level: 'Warn', attributes: {} },
    ]);
  });

  it('logs nothing for a normal closure or a socket that never opened', () => {
    const { logged, dial } = monitored();
    const ended = dial();
    ended.open();
    ended.closeWith(1000);
    dial().closeWith(1006);
    expect(logged).toEqual([]);
  });
});

const lockedHost = () => {
  const host = createInMemoryHost({ sections: fixtureProtocolSections() });
  const input = {
    protocolId: host.protocolId,
    sectionId: sectionId({ kind: 'stageOrder' }),
  };
  const collaborator = host.asCollaborator({
    sessionId: 'session-2',
    userId: 'user-2',
    displayName: 'Grace',
  });
  return { host, input, collaborator };
};

describe('the editing lock observer', () => {
  it('logs a refused lock, and nothing for a granted one', async () => {
    const log = vi.fn<(entry: ResearcherLogEntry) => void>();
    const { host, input, collaborator } = lockedHost();

    const granted = await observeLocks(host.adapter, log).rpcCall(
      'AcquireLock',
      input,
    );
    expect(granted.lock).toBe('held');
    expect(log).not.toHaveBeenCalled();

    const refused = await observeLocks(collaborator, log).rpcCall(
      'AcquireLock',
      input,
    );
    expect(refused.lock).toBe('readOnly');
    expect(log.mock.calls).toEqual([
      [{ message: 'Editing lock refused', level: 'Warn', attributes: {} }],
    ]);
  });

  it('logs a lost lock and rethrows the refusal', async () => {
    const log = vi.fn<(entry: ResearcherLogEntry) => void>();
    const { host, input, collaborator } = lockedHost();
    await host.adapter.rpcCall('AcquireLock', input);
    const current = await collaborator.rpcCall('GetSection', input);

    await expect(
      observeLocks(collaborator, log).rpcCall('Submit', {
        ...input,
        requestId: 'write-1',
        document: current.document,
        revision: current.revision,
      }),
    ).rejects.toBeInstanceOf(NotLockHolder);
    expect(log.mock.calls).toEqual([
      [{ message: 'Editing lock lost', level: 'Warn', attributes: {} }],
    ]);
  });
});
