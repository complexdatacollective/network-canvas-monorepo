import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { encryptionUnlocked } from '../../../store/modules/ui';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import { installEncryptionKey } from '../unlockEncryption';
import { useNodeLabel } from '../useNodeLabel';
import {
  createEncryptionStore,
  encryptionFor,
  makeEncryptedPerson,
  NODE_TYPE,
  unlockWith,
} from './encryptionFixtures';

const UNAVAILABLE = 'Answer unavailable';

type EncryptionStore = ReturnType<typeof createEncryptionStore>;

async function lockedStore(nodes: NcNode[]) {
  const { header } = await encryptionFor('pw');
  return createEncryptionStore(nodes, undefined, undefined, { header });
}

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

async function installKeyOf(store: EncryptionStore, passphrase: string) {
  const { key } = await encryptionFor(passphrase);
  act(() => {
    installEncryptionKey(store, key);
  });
}

describe('useNodeLabel with encrypted labels', () => {
  it('shows the decrypted label once the key is in force', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = await lockedStore([node]);
    await unlockWith(store, 'pw');

    const { result } = renderLabel(store, node);

    await waitFor(() => expect(result.current).toBe('Alice'));
  });

  it('never serves plaintext decrypted by an earlier interview to one without the key', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');

    const unlocked = await lockedStore([node]);
    await unlockWith(unlocked, 'pw');
    const first = renderLabel(unlocked, node);
    await waitFor(() => expect(first.result.current).toBe('Alice'));
    first.unmount();

    // The same interview mounted again (e.g. resumed): a new store, no key in
    // memory, the same stored node.
    const resumed = await lockedStore([node]);
    const second = renderLabel(resumed, node);
    await waitFor(() => expect(second.result.current).toBe('🔒'));
    await settle();

    expect(second.result.current).toBe('🔒');
    expect(second.seen).not.toContain('Alice');
    expect(resumed.getState().ui.showPassphrasePrompter).toBe(true);
  });

  it('locks the label again when the key stops being in force', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = await lockedStore([node]);
    await unlockWith(store, 'pw');

    const { result, seen } = renderLabel(store, node);
    await waitFor(() => expect(result.current).toBe('Alice'));

    const seenBeforeClearing = seen.length;
    act(() => {
      store.dispatch(encryptionUnlocked('another-scope'));
    });
    await waitFor(() => expect(result.current).toBe('🔒'));
    await settle();

    expect(result.current).toBe('🔒');
    expect(seen.slice(seenBeforeClearing)).not.toContain('Alice');
  });

  it('does not show plaintext decrypted under one key once another replaces it', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = await lockedStore([node]);
    await unlockWith(store, 'pw');

    const { result, seen } = renderLabel(store, node);
    await waitFor(() => expect(result.current).toBe('Alice'));

    const seenBeforeReplacing = seen.length;
    await installKeyOf(store, 'another passphrase');
    await waitFor(() => expect(result.current).toBe(UNAVAILABLE));

    expect(seen.slice(seenBeforeReplacing)).not.toContain('Alice');
  });

  it('shows a label the key cannot decrypt as unavailable, without asking for the passphrase again', async () => {
    const alice = await makeEncryptedPerson('n1', 'Alice', 'pw');
    // Alice's stored name, copied onto someone else: it is bound to Alice.
    const moved: NcNode = { ...alice, [entityPrimaryKeyProperty]: 'n2' };
    const store = await lockedStore([alice, moved]);
    await unlockWith(store, 'pw');
    const keyId = store.getState().ui.encryptionKeyId;

    const { result, seen } = renderLabel(store, moved);
    await waitFor(() => expect(result.current).toBe(UNAVAILABLE));
    const rendersOnceSettled = seen.length;
    await settle();

    expect(result.current).toBe(UNAVAILABLE);
    expect(seen).not.toContain('Alice');
    expect(seen.length).toBe(rendersOnceSettled);
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
    expect(store.getState().ui.encryptionKeyId).toBe(keyId);
  });

  it('shows a schema 8 label as unavailable, without asking for a passphrase', async () => {
    const legacy: NcNode = {
      [entityPrimaryKeyProperty]: 'legacy-1',
      type: NODE_TYPE,
      [entityAttributesProperty]: { name: [9, 8, 7, 6] },
      [entitySecureAttributesMeta]: {
        name: { iv: Array.from({ length: 12 }, () => 1), salt: [2, 3, 4] },
      },
    };
    const store = createEncryptionStore([legacy]);

    const { result } = renderLabel(store, legacy);
    await settle();

    expect(result.current).toBe(UNAVAILABLE);
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('does not keep an unreadable outcome once the right key is put in force', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const store = await lockedStore([node]);
    await installKeyOf(store, 'another passphrase');

    const { result } = renderLabel(store, node);
    await waitFor(() => expect(result.current).toBe(UNAVAILABLE));

    await installKeyOf(store, 'pw');
    await waitFor(() => expect(result.current).toBe('Alice'));
  });

  it('decrypts a name its record says is encrypted, though the codebook no longer marks it', async () => {
    // As a protocol re-imported without its encryption declares the name.
    const unmarkedVariables: Record<string, Variable> = {
      name: { name: 'name', label: 'name', type: 'text', component: 'Text' },
      age: { name: 'age', label: 'age', type: 'number', component: 'Number' },
    };
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const { header } = await encryptionFor('pw');
    const store = createEncryptionStore([node], undefined, unmarkedVariables, {
      header,
    });

    const { result, seen } = renderLabel(store, node);
    await waitFor(() => expect(result.current).toBe('🔒'));
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    await unlockWith(store, 'pw');
    await waitFor(() => expect(result.current).toBe('Alice'));
    expect(seen).not.toContain('Person');
  });

  it('never shows an unreadable outcome to an interview that later unlocks with the right key', async () => {
    const node = await makeEncryptedPerson('n1', 'Alice', 'pw');

    const failed = await lockedStore([node]);
    await installKeyOf(failed, 'another passphrase');
    const first = renderLabel(failed, node);
    await waitFor(() => expect(first.result.current).toBe(UNAVAILABLE));
    first.unmount();

    const unlocked = await lockedStore([node]);
    await unlockWith(unlocked, 'pw');
    const second = renderLabel(unlocked, node);
    await waitFor(() => expect(second.result.current).toBe('Alice'));
    expect(second.seen).not.toContain(UNAVAILABLE);
  });
});
