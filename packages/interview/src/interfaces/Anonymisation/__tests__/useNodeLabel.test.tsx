import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NcNode } from '@codaco/shared-consts';

import { setPassphrase } from '../../../store/modules/ui';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import { useNodeLabel } from '../useNodeLabel';
import {
  createEncryptionStore,
  makeEncryptedPerson,
  makePlainPerson,
} from './encryptionFixtures';

// While set, every decryption waits for `release`, so a label can be caught
// decrypting and a decryption can settle after the passphrase is re-entered.
const decryption = vi.hoisted(() => ({
  held: undefined as Promise<void> | undefined,
}));
vi.mock('../utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils')>();
  return {
    ...actual,
    decryptData: async (...args: Parameters<typeof actual.decryptData>) => {
      await decryption.held;
      return actual.decryptData(...args);
    },
  };
});

function holdDecryption() {
  let release = () => {};
  decryption.held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    decryption.held = undefined;
    release();
  };
}

afterEach(() => {
  decryption.held = undefined;
});

type EncryptionStore = ReturnType<typeof createEncryptionStore>;

function renderLabel(store: EncryptionStore, node: NcNode) {
  const seen: (string | undefined)[] = [];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <TestProtocolLocalization>{children}</TestProtocolLocalization>
    </Provider>
  );
  const rendered = renderHook(
    () => {
      const label = useNodeLabel(node);
      seen.push(label);
      return label;
    },
    { wrapper },
  );
  return { ...rendered, seen };
}

// Lets any decryption the hook started settle before asserting on what it
// rendered, so a label that would only appear late is not missed.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

describe('useNodeLabel with encrypted labels', () => {
  it('shows the decrypted label once the passphrase is in force', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = createEncryptionStore([node]);
    store.dispatch(setPassphrase('pw'));

    const { result } = renderLabel(store, node);

    await waitFor(() => expect(result.current).toBe('Alice'));
  });

  it('shows the lock, never a placeholder, while the label is decrypting', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = createEncryptionStore([node]);
    store.dispatch(setPassphrase('pw'));
    const release = holdDecryption();

    const { result, seen } = renderLabel(store, node);
    await settle();
    expect(result.current).toBe('🔒');

    release();
    await waitFor(() => expect(result.current).toBe('Alice'));
    expect(seen).not.toContain(undefined);
  });

  it('shows a decryption that fails after the passphrase is entered again as failed', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = createEncryptionStore([node]);
    const release = holdDecryption();
    store.dispatch(setPassphrase('wrong'));

    const { result } = renderLabel(store, node);
    await settle();
    expect(result.current).toBe('🔒');

    // Entered again while the first attempt is under way: the new entry
    // joins that attempt rather than starting another.
    act(() => {
      store.dispatch(setPassphrase('wrong'));
    });
    await settle();
    release();

    await waitFor(() => expect(result.current).toBe('⚠️'));
  });

  it('never serves plaintext decrypted by an earlier interview to one without a passphrase', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');

    const unlocked = createEncryptionStore([node]);
    unlocked.dispatch(setPassphrase('pw'));
    const first = renderLabel(unlocked, node);
    await waitFor(() => expect(first.result.current).toBe('Alice'));
    first.unmount();

    // The same interview mounted again (e.g. resumed): a new store, no
    // passphrase in memory, the same stored node.
    const resumed = renderLabel(createEncryptionStore([node]), node);
    await waitFor(() => expect(resumed.result.current).toBe('🔒'));
    await settle();

    expect(resumed.result.current).toBe('🔒');
    expect(resumed.seen).not.toContain('Alice');
  });

  it('locks the label again when the passphrase is cleared', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = createEncryptionStore([node]);
    store.dispatch(setPassphrase('pw'));

    const { result, seen } = renderLabel(store, node);
    await waitFor(() => expect(result.current).toBe('Alice'));

    const seenBeforeClearing = seen.length;
    act(() => {
      store.dispatch(setPassphrase(''));
    });
    await waitFor(() => expect(result.current).toBe('🔒'));
    await settle();

    expect(result.current).toBe('🔒');
    expect(seen.slice(seenBeforeClearing)).not.toContain('Alice');
  });

  it('does not show plaintext decrypted under one passphrase once another replaces it', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = createEncryptionStore([node]);
    store.dispatch(setPassphrase('pw'));

    const { result, seen } = renderLabel(store, node);
    await waitFor(() => expect(result.current).toBe('Alice'));

    const seenBeforeReplacing = seen.length;
    act(() => {
      store.dispatch(setPassphrase('wrong'));
    });
    await waitFor(() => expect(result.current).toBe('⚠️'));

    expect(seen.slice(seenBeforeReplacing)).not.toContain('Alice');
  });

  it('does not keep a failed decryption once a working passphrase is entered', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = createEncryptionStore([node]);
    store.dispatch(setPassphrase('wrong'));

    const { result } = renderLabel(store, node);
    await waitFor(() => expect(result.current).toBe('⚠️'));
    expect(store.getState().ui.passphraseInvalid).toBe(true);

    act(() => {
      store.dispatch(setPassphrase('pw'));
    });
    await waitFor(() => expect(result.current).toBe('Alice'));
  });

  it('never shows a failed decryption to an interview that later unlocks with the right passphrase', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');

    const failed = createEncryptionStore([node]);
    failed.dispatch(setPassphrase('wrong'));
    const first = renderLabel(failed, node);
    await waitFor(() => expect(first.result.current).toBe('⚠️'));
    first.unmount();

    const unlocked = createEncryptionStore([node]);
    unlocked.dispatch(setPassphrase('pw'));
    const second = renderLabel(unlocked, node);
    await waitFor(() => expect(second.result.current).toBe('Alice'));
    expect(second.seen).not.toContain('⚠️');
  });
});

describe('useNodeLabel with the encrypted-variables experiment off', () => {
  it('shows a plaintext label without asking for a passphrase', async () => {
    const node = makePlainPerson('n1', 'Alice');
    const store = createEncryptionStore([node], undefined, undefined, {
      encryptionEnabled: false,
    });

    const { result, seen } = renderLabel(store, node);
    await settle();

    expect(result.current).toBe('Alice');
    expect(seen).not.toContain('🔒');
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('never decrypts a stored ciphertext, even with its passphrase in force', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = createEncryptionStore([node], undefined, undefined, {
      encryptionEnabled: false,
    });
    store.dispatch(setPassphrase('pw'));

    const { result, seen } = renderLabel(store, node);
    await settle();

    expect(seen).not.toContain('Alice');
    expect(result.current).toBe('Person');
    expect(store.getState().ui.passphraseInvalid).toBe(false);
  });
});
