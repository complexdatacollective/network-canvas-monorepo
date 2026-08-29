// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NcNetwork } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { db } from '../../db/db';
import { getSessionDek, setSessionDek } from '../../db/sessionKey';
import { createSession, getSession, updateSession } from '../../db/sessions';
import { clearVault, VAULT_STORAGE_KEY } from '../../vault/vaultStore';
import * as authApi from '../api';
import { AuthProvider, useAuth } from '../AuthContext';

// A session write reads the vault key when it runs, not when it is queued: it
// waits its turn on the per-session chain, reads the stored row and decrypts
// it, and only then encrypts. An idle lock firing while any of that is
// outstanding used to make it fail closed and lose the answers it carried.

function makeNetwork(nodeIds: string[]): NcNetwork {
  return {
    ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
    nodes: nodeIds.map((id) => ({
      [entityPrimaryKeyProperty]: id,
      type: 'person',
      [entityAttributesProperty]: { name: id },
    })),
    edges: [],
  };
}

// Hold a session write open inside its mutation, before it reaches the vault
// key. Returns a release function. Without this the write finishes on its own
// long before the lock gets to it, and the test proves nothing.
function holdNextSessionRead() {
  const original = (id: string) => db.sessions.get(id);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi.spyOn(db.sessions, 'get');
  spy.mockImplementationOnce(((id: string) => {
    spy.mockRestore();
    return held.then(() => original(id));
    // Dexie's `get` is overloaded; the spy only needs to stand in for the
    // single-key form the session write uses.
  }) as unknown as typeof db.sessions.get);
  return release;
}

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="kind">{auth.kind}</span>
      <button onClick={() => void auth.lock()}>lock</button>
      <button onClick={() => void auth.unlockWithPin('12345678')}>
        unlock
      </button>
    </div>
  );
}

async function renderUnlocked() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
  );
}

beforeEach(async () => {
  clearVault();
  setSessionDek(null);
  await authApi.enrolWithPin('12345678');
});

afterEach(() => {
  vi.restoreAllMocks();
  clearVault();
  setSessionDek(null);
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('locking with a session write outstanding', () => {
  it('lets the write finish rather than clearing the key underneath it', async () => {
    const session = await createSession({
      protocolHash: 'h1',
      protocolName: 'P',
      caseId: 'c1',
      initialNetwork: makeNetwork([]),
    });

    await renderUnlocked();
    const keyBefore = getSessionDek();

    // A write held open inside its mutation, then a lock — the shape a tab
    // frozen mid-write and locked on return leaves behind.
    const release = holdNextSessionRead();
    const writing = updateSession(session.id, { network: makeNetwork(['n1']) });
    await settle();
    await userEvent.click(screen.getByText('lock'));
    await settle();

    // The lock is waiting: the key is still live because a write needs it.
    expect(getSessionDek()).toBe(keyBefore);
    expect(screen.getByTestId('kind')).toHaveTextContent('unlocked');

    release();
    await expect(writing).resolves.toBeDefined();
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('locked'),
    );

    // Read it back through a fresh unlock: the answer really was encrypted
    // with the key the drain held open for it.
    expect(await authApi.unlockWithPin('12345678')).toEqual({ ok: true });
    const stored = await getSession(session.id);
    expect(
      stored?.network.nodes.map((node) => node[entityPrimaryKeyProperty]),
    ).toEqual(['n1']);
  });

  it('does not wait for outstanding writes on a cross-tab force-lock', async () => {
    const session = await createSession({
      protocolHash: 'h1',
      protocolName: 'P',
      caseId: 'c1',
      initialNetwork: makeNetwork([]),
    });

    await renderUnlocked();

    // A write held open — the same state that makes an idle lock wait.
    const release = holdNextSessionRead();
    const writing = updateSession(session.id, { network: makeNetwork(['n1']) });
    await settle();

    // Another tab has replaced the vault, so this tab's key is stale. Waiting
    // for that write would be waiting to commit the corruption this force-lock
    // exists to prevent, so the key goes now, held write or not.
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: VAULT_STORAGE_KEY }),
      );
    });
    await settle();

    // Already gone, without waiting on the held write. Asserting promptly is
    // the whole point: a force-lock that drained first would still clear the
    // key, just seconds later, having spent that time letting a stale-key
    // write proceed.
    expect(getSessionDek()).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('locked'),
    );

    release();
    await writing.catch(() => undefined);
  });

  it('does not clear a key installed while its drain was waiting', async () => {
    const session = await createSession({
      protocolHash: 'h1',
      protocolName: 'P',
      caseId: 'c1',
      initialNetwork: makeNetwork([]),
    });

    await renderUnlocked();

    // A lock starts draining and stays there, held by the write above.
    const release = holdNextSessionRead();
    const writing = updateSession(session.id, { network: makeNetwork(['n1']) });
    await settle();
    await userEvent.click(screen.getByText('lock'));
    await settle();

    // Stand in for what can happen while a drain waits: the cross-tab
    // force-lock does not queue behind it, so it clears the key, and the
    // researcher unlocks from the screen it raised. A different key is now in
    // custody, and it is not the one this lock was asked to clear.
    const freshKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    act(() => setSessionDek(freshKey));

    release();
    await writing.catch(() => undefined);
    await settle();

    expect(getSessionDek()).toBe(freshKey);
  });
});
