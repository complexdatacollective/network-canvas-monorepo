import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { AnalyticsContext } from '../../../analytics/AnalyticsContext';
import type { Tracker } from '../../../analytics/tracker';
import { setShowPassphrasePrompter } from '../../../store/modules/ui';
import { useDecryptedNodes } from '../useDecryptedNodes';
import { useNodeLabel } from '../useNodeLabel';
import { usePassphrase } from '../usePassphrase';
import {
  createEncryptionStore,
  encryptionFor,
  makeEncryptedPerson,
  outOfBoundsHeader,
} from './encryptionFixtures';

afterEach(() => {
  vi.restoreAllMocks();
});

type EncryptionStore = ReturnType<typeof createEncryptionStore>;

async function refusedStore(nodes: NcNode[]) {
  const { header } = await encryptionFor('pw');
  return createEncryptionStore(nodes, undefined, undefined, {
    header: outOfBoundsHeader(header),
  });
}

function renderInInterview<T>(store: EncryptionStore, hook: () => T) {
  const captureException = vi.fn<Tracker['captureException']>();
  const tracker: Tracker = { track: vi.fn(), captureException };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AnalyticsContext.Provider value={tracker}>
      <Provider store={store}>{children}</Provider>
    </AnalyticsContext.Provider>
  );
  return { ...renderHook(hook, { wrapper }), captureException };
}

// Lets any decryption or passphrase request the hooks started settle before
// asserting, so one that would only happen late is not missed.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

describe('protected answers in an interview whose encryption header is out of bounds', () => {
  it('labels a person as unavailable without asking for a passphrase, and reports the header once', async () => {
    const alice = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = await refusedStore([alice]);
    const deriveKey = vi.spyOn(crypto.subtle, 'deriveKey');

    const { result, captureException } = renderInInterview(store, () =>
      useNodeLabel(alice),
    );
    await waitFor(() => expect(result.current).toBe('Answer unavailable'));
    await settle();

    expect(result.current).toBe('Answer unavailable');
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
    expect(deriveKey).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[1]).toEqual({
      feature: 'encrypted-attributes',
      reason: 'refused-header',
    });
  });

  it('makes the people ready with their protected answers left out, without asking for a passphrase', async () => {
    const alice = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = await refusedStore([alice]);
    const nodes = [alice];

    const { result } = renderInInterview(store, () => useDecryptedNodes(nodes));
    await settle();

    const { [entitySecureAttributesMeta]: _secure, ...unprotected } = alice;
    expect(result.current).toEqual({
      status: 'ready',
      nodes: [{ ...unprotected, [entityAttributesProperty]: { age: 40 } }],
    });
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('hides a prompter already shown, and never shows it again when asked for a passphrase', async () => {
    const store = await refusedStore([]);
    store.dispatch(setShowPassphrasePrompter(true));

    const { result } = renderInInterview(store, usePassphrase);
    act(() => {
      result.current.requirePassphrase();
    });
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);

    act(() => {
      result.current.requirePassphrase();
    });
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
    expect(result.current.encryptionUnavailable).toBe(true);
  });
});
