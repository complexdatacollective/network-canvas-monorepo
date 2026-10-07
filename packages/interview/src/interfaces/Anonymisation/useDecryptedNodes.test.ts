import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { updateNode } from '../../store/modules/session';
import { setPassphrase } from '../../store/modules/ui';
import {
  createEncryptionStore,
  encryptedVariables,
  makeEncryptedPerson,
} from './__tests__/encryptionFixtures';
import { getDecryptionScope } from './decryptionScope';
import {
  type DecryptedNodes,
  decryptNodes,
  useDecryptedNodes,
} from './useDecryptedNodes';
import { generateSecureAttributes } from './utils';

const PASSPHRASE = 'test passphrase';

type EncryptionStore = ReturnType<typeof createEncryptionStore>;

function renderDecrypted(
  store: EncryptionStore,
  initialNodes: NcNode[],
  reads: readonly string[] = ['name'],
) {
  const seen: DecryptedNodes[] = [];
  const rendered = renderHook(
    ({ nodes }) => {
      const result = useDecryptedNodes(nodes, reads);
      seen.push(result);
      return result;
    },
    {
      initialProps: { nodes: initialNodes },
      wrapper: ({ children }: { children: ReactNode }) =>
        Provider({ store, children }),
    },
  );
  return { ...rendered, seen };
}

function readyNodes(result: { current: DecryptedNodes }) {
  if (result.current.status !== 'ready') {
    throw new Error(`Expected ready, got ${result.current.status}`);
  }
  return result.current.nodes;
}

/**
 * A person whose `name` is encrypted with `passphrase` and whose `nickname` is
 * encrypted with `otherPassphrase`, as an older runtime could leave them.
 */
async function makeMixedPerson(
  id: string,
  passphrase: string,
  otherPassphrase: string,
): Promise<NcNode> {
  const person = await makeEncryptedPerson(id, 'Alice', passphrase);
  const nickname = await generateSecureAttributes(
    { nickname: 'Ally' },
    encryptedVariables,
    otherPassphrase,
  );
  return {
    ...person,
    [entityAttributesProperty]: {
      ...person[entityAttributesProperty],
      ...nickname.encryptedAttributes,
    },
    [entitySecureAttributesMeta]: {
      ...person[entitySecureAttributesMeta],
      ...nickname.secureAttributes,
    },
  };
}

function names(results: DecryptedNodes[]) {
  return results.flatMap((result) =>
    result.status === 'ready'
      ? result.nodes.map((node) => node[entityAttributesProperty].name)
      : [],
  );
}

describe('useDecryptedNodes', () => {
  it('returns nodes without encrypted values as they are, with no passphrase', () => {
    const nodes: NcNode[] = [
      {
        [entityPrimaryKeyProperty]: 'n1',
        type: 'person',
        [entityAttributesProperty]: { age: 40 },
      },
    ];
    const store = createEncryptionStore(nodes);
    const { result } = renderDecrypted(store, nodes);

    expect(result.current).toEqual({ status: 'ready', nodes });
    expect(readyNodes(result)).toBe(nodes);
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('returns encrypted nodes as they are, with no passphrase, while the experiment is off', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const nodes = [person];
    const store = createEncryptionStore(nodes, undefined, undefined, {
      encryptionEnabled: false,
    });
    const { result } = renderDecrypted(store, nodes);

    expect(readyNodes(result)).toBe(nodes);
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('is locked and asks for the passphrase while none has been entered', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = createEncryptionStore([person]);
    const { result } = renderDecrypted(store, [person]);

    expect(result.current).toEqual({ status: 'locked' });
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
  });

  it('decrypts once the passphrase is entered', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = createEncryptionStore([person]);
    const { result } = renderDecrypted(store, [person]);

    act(() => {
      store.dispatch(setPassphrase(PASSPHRASE));
    });
    expect(result.current.status).toBe('pending');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    const [decrypted] = readyNodes(result);
    expect(decrypted?.[entityAttributesProperty]).toEqual({
      name: 'Alice',
      age: 40,
    });
    expect(decrypted?.[entitySecureAttributesMeta]).toBeUndefined();
  });

  it('shows a value the interview has just saved without decrypting it again', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = createEncryptionStore([person]);
    store.dispatch(setPassphrase(PASSPHRASE));
    const { result, rerender } = renderDecrypted(store, [person]);
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await store.dispatch(
        updateNode({
          nodeId: 'n1',
          attributePatch: { set: { name: 'Alicia' }, unset: [] },
          currentStep: 0,
        }),
      );
    });
    rerender({ nodes: store.getState().session.network.nodes });

    expect(readyNodes(result)[0]?.[entityAttributesProperty].name).toBe(
      'Alicia',
    );
  });

  it('keeps the plaintext at once when only other attributes change', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = createEncryptionStore([person]);
    store.dispatch(setPassphrase(PASSPHRASE));
    const { result, rerender } = renderDecrypted(store, [person]);
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({
      nodes: [
        {
          ...person,
          [entityAttributesProperty]: {
            ...person[entityAttributesProperty],
            age: 41,
          },
        },
      ],
    });

    expect(readyNodes(result)[0]?.[entityAttributesProperty]).toEqual({
      name: 'Alice',
      age: 41,
    });
  });

  it('locks again, and stops showing the plaintext, when the passphrase is cleared', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = createEncryptionStore([person]);
    store.dispatch(setPassphrase(PASSPHRASE));
    const { result, seen } = renderDecrypted(store, [person]);
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const seenBeforeClearing = seen.length;
    act(() => {
      store.dispatch(setPassphrase(''));
    });

    expect(result.current).toEqual({ status: 'locked' });
    expect(names(seen.slice(seenBeforeClearing))).not.toContain('Alice');
  });

  it('leaves out ciphertext that has no metadata to decrypt it', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const { [entitySecureAttributesMeta]: _lost, ...withoutMetadata } = person;
    const store = createEncryptionStore([withoutMetadata]);
    const { result } = renderDecrypted(store, [withoutMetadata]);

    expect(readyNodes(result)[0]?.[entityAttributesProperty]).toEqual({
      age: 40,
    });
  });

  it('leaves out, and never decrypts, protected answers the caller does not read', async () => {
    const person = await makeMixedPerson('n1', PASSPHRASE, 'older passphrase');
    const store = createEncryptionStore([person]);
    store.dispatch(setPassphrase(PASSPHRASE));
    const { result } = renderDecrypted(store, [person], ['name']);

    await waitFor(() => expect(result.current.status).toBe('ready'));
    const [decrypted] = readyNodes(result);
    expect(decrypted?.[entityAttributesProperty]).toEqual({
      name: 'Alice',
      age: 40,
    });
    expect(decrypted?.[entitySecureAttributesMeta]).toBeUndefined();
    expect(store.getState().ui.passphraseInvalid).toBe(false);
  });

  it('fails and marks the passphrase invalid when decryption fails', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = createEncryptionStore([person]);
    store.dispatch(setPassphrase('wrong passphrase'));
    const { result } = renderDecrypted(store, [person]);

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(store.getState().ui.passphraseInvalid).toBe(true);
  });
});

describe('decryptNodes', () => {
  function scopeFor(store: EncryptionStore, passphrase: string) {
    store.dispatch(setPassphrase(passphrase));
    const scope = getDecryptionScope(store, passphrase);
    if (!scope) throw new Error('Expected a decryption scope');
    return scope;
  }

  it('resolves to the nodes with their values decrypted', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = createEncryptionStore([person]);

    const [node] = await decryptNodes(
      [person],
      ['name'],
      scopeFor(store, PASSPHRASE),
      () => encryptedVariables,
      true,
    );

    expect(node?.[entityAttributesProperty]).toEqual({
      name: 'Alice',
      age: 40,
    });
    expect(node?.[entitySecureAttributesMeta]).toBeUndefined();
  });

  it('leaves out, and never decrypts, protected answers the caller does not read', async () => {
    const person = await makeMixedPerson('n1', PASSPHRASE, 'older passphrase');
    const store = createEncryptionStore([person]);

    const [node] = await decryptNodes(
      [person],
      ['name'],
      scopeFor(store, PASSPHRASE),
      () => encryptedVariables,
      true,
    );

    expect(node?.[entityAttributesProperty]).toEqual({
      name: 'Alice',
      age: 40,
    });
    expect(node?.[entitySecureAttributesMeta]).toBeUndefined();
  });

  it('rejects when a value fails to decrypt', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = createEncryptionStore([person]);

    await expect(
      decryptNodes(
        [person],
        ['name'],
        scopeFor(store, 'wrong passphrase'),
        () => encryptedVariables,
        true,
      ),
    ).rejects.toThrow();
  });

  it('returns the nodes as they are while the experiment is off', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', PASSPHRASE);
    const store = createEncryptionStore([person], undefined, undefined, {
      encryptionEnabled: false,
    });

    const [node] = await decryptNodes(
      [person],
      ['name'],
      scopeFor(store, 'wrong passphrase'),
      () => encryptedVariables,
      false,
    );

    expect(node).toBe(person);
  });
});
