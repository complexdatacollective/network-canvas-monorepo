import { describe, expect, it, vi } from 'vitest';

import { NotLockHolder } from '@codaco/protocol-builder-core/contract/errors';
import { createInMemoryHost } from '@codaco/protocol-builder/testing/host/createInMemoryHost';
import { fixtureProtocolSections } from '@codaco/protocol-builder/testing/protocolFixture';
import type { ResearcherLogEntry } from '@codaco/studio-contract/schema/browser-logs';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { NO_TEAM, type ResearcherLogScope, teamScope } from '../browserLogs.ts';
import { makeConnectionMonitor, observeLocks } from '../hostFaults.ts';

type Log = (entry: ResearcherLogEntry, scope: ResearcherLogScope) => void;

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
  const scopes: ResearcherLogScope[] = [];
  let now = 1_000;
  const watch = makeConnectionMonitor(
    (entry, scope) => {
      logged.push(entry);
      scopes.push(scope);
    },
    () => now,
  );
  const dial = () => {
    const socket = new FakeSocket();
    watch(socket);
    return socket;
  };
  return {
    logged,
    scopes,
    dial,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe('the editor connection monitor', () => {
  it('logs a dropped connection once, then how long and how many dials it took to restore', () => {
    const { logged, scopes, dial, advance } = monitored();
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
    expect(scopes).toEqual([NO_TEAM, NO_TEAM]);
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
    const log = vi.fn<Log>();
    const { host, input, collaborator } = lockedHost();

    const granted = await observeLocks(
      host.adapter,
      teamScope('team-a'),
      log,
    ).rpcCall('AcquireLock', input);
    expect(granted.lock).toBe('held');
    expect(log).not.toHaveBeenCalled();

    const refused = await observeLocks(
      collaborator,
      teamScope('team-a'),
      log,
    ).rpcCall('AcquireLock', input);
    expect(refused.lock).toBe('readOnly');
    expect(log.mock.calls).toEqual([
      [
        { message: 'Editing lock refused', level: 'Warn', attributes: {} },
        teamScope('team-a'),
      ],
    ]);
  });

  it('logs a lost lock and rethrows the refusal', async () => {
    const log = vi.fn<Log>();
    const { host, input, collaborator } = lockedHost();
    await host.adapter.rpcCall('AcquireLock', input);
    const current = await collaborator.rpcCall('GetSection', input);

    await expect(
      observeLocks(collaborator, teamScope('team-a'), log).rpcCall('Submit', {
        ...input,
        requestId: 'write-1',
        document: current.document,
        revision: current.revision,
      }),
    ).rejects.toBeInstanceOf(NotLockHolder);
    expect(log.mock.calls).toEqual([
      [
        { message: 'Editing lock lost', level: 'Warn', attributes: {} },
        teamScope('team-a'),
      ],
    ]);
  });
});
