// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { NcNetwork } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { setSessionDek } from '../../db/sessionKey';
import { createSession, getSession, updateSession } from '../../db/sessions';
import { clearVault } from '../../vault/vaultStore';
import * as authApi from '../api';
import { AuthProvider, useAuth } from '../AuthContext';
import { registerPreLockFlush } from '../preLockFlush';

// The whole chain, against the real vault and a real encrypted Dexie row: the
// interview engine holds recent answers in a 3s autosave debounce, and a lock
// firing inside that window used to clear the encryption key before anything
// could write them — recordCrypto then failed closed, the sync middleware
// swallowed the rejection, and the answers were gone.

function makeNetwork(nodeIds: string[]): NcNetwork {
  return {
    ego: {
      [entityPrimaryKeyProperty]: 'ego',
      [entityAttributesProperty]: {},
    },
    nodes: nodeIds.map((id) => ({
      [entityPrimaryKeyProperty]: id,
      type: 'person',
      [entityAttributesProperty]: { name: id },
    })),
    edges: [],
  };
}

function LockButton() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="kind">{auth.kind}</span>
      <button onClick={() => void auth.lock()}>lock</button>
    </div>
  );
}

const flushDisposers: Array<() => void> = [];

async function renderUnlockedApp() {
  render(
    <AuthProvider>
      <LockButton />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
  );
}

async function lockAndWait() {
  await userEvent.click(screen.getByText('lock'));
  await waitFor(() =>
    expect(screen.getByTestId('kind')).toHaveTextContent('locked'),
  );
}

beforeEach(async () => {
  clearVault();
  setSessionDek(null);
  await authApi.enrolWithPin('12345678');
});

afterEach(() => {
  while (flushDisposers.length > 0) flushDisposers.pop()?.();
  clearVault();
  setSessionDek(null);
});

describe('locking a vault with an interview mounted', () => {
  it('persists answers a registered flush is still holding', async () => {
    const session = await createSession({
      protocolHash: 'h1',
      protocolName: 'P',
      caseId: 'c1',
      initialNetwork: makeNetwork([]),
    });

    // Stands in for the Shell's autosave flush: the answers the participant
    // gave inside the debounce window, written the moment the lock asks for
    // them.
    flushDisposers.push(
      registerPreLockFlush(async () => {
        await updateSession(session.id, { network: makeNetwork(['n1']) });
      }),
    );

    await renderUnlockedApp();
    await lockAndWait();

    // Read it back through a fresh unlock: the row decrypts under the same
    // vault, so it really was encrypted with the key the flush caught in time.
    expect(await authApi.unlockWithPin('12345678')).toEqual({ ok: true });
    const stored = await getSession(session.id);
    expect(
      stored?.network.nodes.map((node) => node[entityPrimaryKeyProperty]),
    ).toEqual(['n1']);
  });

  it('refuses the same write once the key is gone', async () => {
    const session = await createSession({
      protocolHash: 'h1',
      protocolName: 'P',
      caseId: 'c1',
      initialNetwork: makeNetwork([]),
    });

    await renderUnlockedApp();
    await lockAndWait();

    // The failure mode the flush window exists to avoid: this is exactly what
    // the Shell's teardown flush attempts, and it can only be refused.
    await expect(
      updateSession(session.id, { network: makeNetwork(['n1']) }),
    ).rejects.toThrow(/vault is locked/);

    expect(await authApi.unlockWithPin('12345678')).toEqual({ ok: true });
    const stored = await getSession(session.id);
    expect(stored?.network.nodes).toEqual([]);
  });
});
