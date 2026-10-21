import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Interviewer9Unlock } from '~/lib/interviewer9Embed';

// Interviewer 8 framed by Interviewer 9 learns the lock's state only once
// Interviewer 9 has replied (or the wait has timed out): until then it shows
// nothing that asks for input, and with the key handed over it never shows
// its lock screen.

const PIN = '12345678';

const reply = vi.hoisted(() => {
  let settle: (value: Interviewer9Unlock | null) => void = () => {};
  let promise: Promise<Interviewer9Unlock | null> = Promise.resolve(null);
  return {
    reset: () => {
      promise = new Promise((resolve) => {
        settle = resolve;
      });
    },
    get promise() {
      return promise;
    },
    settle: (value: Interviewer9Unlock | null) => settle(value),
  };
});

vi.mock('~/lib/interviewer9Embed', () => ({
  IS_EMBEDDED_IN_INTERVIEWER_9: true,
  interviewer9Unlock: () => reply.promise,
  isEmbedClosed: () => false,
}));

// A fresh page: the lock enrolled by Interviewer 9, no key held here yet.
const loadFramedPage = async () => {
  vi.resetModules();
  reply.reset();
  const [{ AuthProvider, useAuth }, api, sessionKey, vaultStore] =
    await Promise.all([
      import('../AuthContext'),
      import('../api'),
      import('../../db/sessionKey'),
      import('../../vault/vaultStore'),
    ]);
  vaultStore.clearVault();
  expect((await api.enrolWithPin(PIN)).ok).toBe(true);
  const interviewer9Key = sessionKey.getSessionDek();
  sessionKey.setSessionDek(null);

  function Probe() {
    return <span data-testid="kind">{useAuth().kind}</span>;
  }
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  return { interviewer9Key, sessionKey, vaultStore };
};

afterEach(async () => {
  const vaultStore = await import('../../vault/vaultStore');
  vaultStore.clearVault();
  vi.resetModules();
});

describe('AuthProvider framed by Interviewer 9', () => {
  it('waits for the reply, then is unlocked with the key it handed over', async () => {
    const { interviewer9Key, sessionKey } = await loadFramedPage();

    // Locked as far as storage goes, but not yet said: no lock screen.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('kind')).toHaveTextContent('loading');

    await act(async () => {
      reply.settle({ key: interviewer9Key, enterAuthorized: false });
    });

    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
    );
    expect(sessionKey.getSessionDek()).toBe(interviewer9Key);
  });

  it('shows its lock when no reply came in time', async () => {
    await loadFramedPage();
    expect(screen.getByTestId('kind')).toHaveTextContent('loading');

    await act(async () => {
      reply.settle(null);
    });

    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('locked'),
    );
  });
});
