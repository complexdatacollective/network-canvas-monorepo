import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui, { setPassphrase } from '../../store/modules/ui';
import { useDecryptedNodes } from './useDecryptedNodes';
import { generateSecureAttributes } from './utils';

const PASSPHRASE = 'test passphrase';

const variables: Record<string, Variable> = {
  name: { name: 'name', type: 'text', component: 'Text', encrypted: true },
};

function makeStore() {
  return configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 9,
        codebook: { node: { person: { name: 'Person', variables } } },
        stages: [],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
}

async function encryptedNode(id: string, name: string): Promise<NcNode> {
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes({ name }, variables, PASSPHRASE);
  return {
    [entityPrimaryKeyProperty]: id,
    type: 'person',
    [entityAttributesProperty]: encryptedAttributes,
    [entitySecureAttributesMeta]: secureAttributes,
  };
}

function renderDecrypted(
  store: ReturnType<typeof makeStore>,
  initialNodes: NcNode[],
) {
  return renderHook(({ nodes }) => useDecryptedNodes(nodes), {
    initialProps: { nodes: initialNodes },
    wrapper: ({ children }: { children: ReactNode }) =>
      Provider({ store, children }),
  });
}

describe('useDecryptedNodes', () => {
  it('returns nodes without encrypted values as they are, with no passphrase', () => {
    const store = makeStore();
    const nodes: NcNode[] = [
      {
        [entityPrimaryKeyProperty]: 'n1',
        type: 'person',
        [entityAttributesProperty]: { name: 'Alice' },
      },
    ];
    const { result } = renderDecrypted(store, nodes);
    expect(result.current).toEqual({ status: 'ready', nodes });
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });

  it('is locked and asks for the passphrase while none has been entered', async () => {
    const store = makeStore();
    const { result } = renderDecrypted(store, [
      await encryptedNode('n1', 'Alice'),
    ]);
    expect(result.current).toEqual({ status: 'locked' });
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
  });

  it('decrypts once the passphrase is entered', async () => {
    const store = makeStore();
    const { result } = renderDecrypted(store, [
      await encryptedNode('n1', 'Alice'),
    ]);

    act(() => {
      store.dispatch(setPassphrase(PASSPHRASE));
    });
    expect(result.current.status).toBe('pending');

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    if (result.current.status !== 'ready') throw new Error('Expected ready');
    expect(result.current.nodes[0]?.[entityAttributesProperty].name).toBe(
      'Alice',
    );
  });

  it('keeps the previous result while a changed node is decrypted', async () => {
    const store = makeStore();
    store.dispatch(setPassphrase(PASSPHRASE));
    const { result, rerender } = renderDecrypted(store, [
      await encryptedNode('n1', 'Alice'),
    ]);
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    rerender({ nodes: [await encryptedNode('n1', 'Alicia')] });
    expect(result.current.status).toBe('ready');

    await waitFor(() => {
      if (result.current.status !== 'ready') throw new Error('Expected ready');
      expect(result.current.nodes[0]?.[entityAttributesProperty].name).toBe(
        'Alicia',
      );
    });
  });

  it('reuses the plaintext at once when only other attributes change', async () => {
    const store = makeStore();
    store.dispatch(setPassphrase(PASSPHRASE));
    const stored = await encryptedNode('n1', 'Alice');
    const { result, rerender } = renderDecrypted(store, [stored]);
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    rerender({
      nodes: [
        {
          ...stored,
          [entityAttributesProperty]: {
            ...stored[entityAttributesProperty],
            close: true,
          },
        },
      ],
    });

    if (result.current.status !== 'ready') throw new Error('Expected ready');
    expect(result.current.nodes[0]?.[entityAttributesProperty]).toEqual({
      name: 'Alice',
      close: true,
    });
    expect(
      result.current.nodes[0]?.[entitySecureAttributesMeta],
    ).toBeUndefined();
  });

  it('decrypts again when a value has new ciphertext', async () => {
    const store = makeStore();
    store.dispatch(setPassphrase(PASSPHRASE));
    const stored = await encryptedNode('n1', 'Alice');
    const { result, rerender } = renderDecrypted(store, [stored]);
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    // Ciphertext that does not belong to the kept metadata cannot decrypt, so
    // a result other than failure means the old plaintext was reused.
    const otherCiphertext = (await encryptedNode('n1', 'Bob'))[
      entityAttributesProperty
    ].name;
    if (otherCiphertext === undefined) throw new Error('Expected ciphertext');
    rerender({
      nodes: [
        {
          ...stored,
          [entityAttributesProperty]: {
            ...stored[entityAttributesProperty],
            name: otherCiphertext,
          },
        },
      ],
    });

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });
  });

  it('fails and marks the passphrase invalid when decryption fails', async () => {
    const store = makeStore();
    store.dispatch(setPassphrase('wrong passphrase'));
    const { result } = renderDecrypted(store, [
      await encryptedNode('n1', 'Alice'),
    ]);

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });
    expect(store.getState().ui.passphraseInvalid).toBe(true);
  });
});
