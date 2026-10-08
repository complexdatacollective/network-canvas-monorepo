import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { setPassphrase } from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import { createEncryptionStore } from '../../Anonymisation/__tests__/encryptionFixtures';
import { isNumberArray } from '../../Anonymisation/decryptionScope';
import { decryptData } from '../../Anonymisation/utils';
import { useComposerActions } from '../useComposerActions';
import { createUndoStore } from '../useUndoStore';

const QUICK_ADD_VAR = 'var-quick-add';
const LAYOUT_VAR = 'var-layout';
const NODE_TYPE = 'person';
const PASSPHRASE = 'composer passphrase';

const variables: Record<string, Variable> = {
  [QUICK_ADD_VAR]: {
    name: 'name',
    label: 'name',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
  [LAYOUT_VAR]: { name: 'position', label: 'position', type: 'layout' },
};

const stage: StageProps<'NetworkComposer'>['stage'] = {
  id: 'nc1',
  type: 'NetworkComposer',
  label: { en: 'Network Composer' },
  subject: { entity: 'node', type: NODE_TYPE },
  layoutVariable: asEntityAttributeReference(LAYOUT_VAR),
  quickAdd: asEntityAttributeReference(QUICK_ADD_VAR),
  background: { concentricCircles: 4, skewedTowardCenter: true },
};

function makeStore(encryptionEnabled = true) {
  const store = createEncryptionStore([], [stage], variables, {
    encryptionEnabled,
  });
  store.dispatch(setPassphrase(PASSPHRASE));
  return store;
}

function renderActions(
  store: ReturnType<typeof makeStore>,
  useEncryption = true,
) {
  const undoStore = createUndoStore();
  const { result } = renderHook(
    () =>
      useComposerActions({
        subjectType: NODE_TYPE,
        quickAdd: QUICK_ADD_VAR,
        layoutVariable: LAYOUT_VAR,
        useEncryption,
        currentStep: 0,
        undoStore,
        dispatch: store.dispatch,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        Provider({ store, children }),
    },
  );
  return { result, undoStore };
}

function getNode(store: ReturnType<typeof makeStore>, id: string) {
  return store
    .getState()
    .session.network.nodes.find((n) => n[entityPrimaryKeyProperty] === id);
}

// Reads the stored name the way every display path does: the stored value must
// be ciphertext and decrypt with the metadata stored beside it.
async function readStoredName(node: NcNode | undefined) {
  if (!node) throw new Error('Expected the node to exist');
  const value = node[entityAttributesProperty][QUICK_ADD_VAR];
  const secure = node[entitySecureAttributesMeta]?.[QUICK_ADD_VAR];
  if (!isNumberArray(value)) throw new Error('Expected a stored ciphertext');
  if (!secure) throw new Error('Expected secure-attribute metadata');
  return decryptData({ secureAttributes: secure, data: value }, PASSPHRASE);
}

describe('useComposerActions with an encrypted quick-add variable', () => {
  it('createNodeAt stores the name as ciphertext with its metadata', async () => {
    const store = makeStore();
    const { result } = renderActions(store);

    let id = '';
    await act(async () => {
      id = await result.current.createNodeAt('Alex', { x: 0.5, y: 0.5 });
    });

    const node = getNode(store, id);
    expect(node?.[entityAttributesProperty][QUICK_ADD_VAR]).not.toBe('Alex');
    expect(await readStoredName(node)).toBe('Alex');
    expect(node?.[entityAttributesProperty][LAYOUT_VAR]).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it('redo of an undone create puts back a decryptable node', async () => {
    const store = makeStore();
    const { result, undoStore } = renderActions(store);

    let id = '';
    await act(async () => {
      id = await result.current.createNodeAt('Alex', { x: 0.5, y: 0.5 });
    });
    await act(async () => {
      await undoStore.getState().undo();
    });
    expect(getNode(store, id)).toBeUndefined();

    await act(async () => {
      await undoStore.getState().redo();
    });
    expect(await readStoredName(getNode(store, id))).toBe('Alex');
  });

  it('undo of a deletion puts back a decryptable node', async () => {
    const store = makeStore();
    const { result, undoStore } = renderActions(store);

    let id = '';
    await act(async () => {
      id = await result.current.createNodeAt('Alex', { x: 0.5, y: 0.5 });
    });
    act(() => {
      result.current.deleteNodeById(id);
    });
    expect(getNode(store, id)).toBeUndefined();

    await act(async () => {
      await undoStore.getState().undo();
    });
    expect(await readStoredName(getNode(store, id))).toBe('Alex');
  });

  it('undo of a multi-node deletion puts back decryptable nodes', async () => {
    const store = makeStore();
    const { result, undoStore } = renderActions(store);

    const ids: string[] = [];
    await act(async () => {
      ids.push(await result.current.createNodeAt('Alex', { x: 0.2, y: 0.2 }));
      ids.push(await result.current.createNodeAt('Sam', { x: 0.8, y: 0.8 }));
    });
    act(() => {
      result.current.deleteNodesById(ids);
    });

    await act(async () => {
      await undoStore.getState().undo();
    });
    expect(await readStoredName(getNode(store, ids[0] ?? ''))).toBe('Alex');
    expect(await readStoredName(getNode(store, ids[1] ?? ''))).toBe('Sam');
  });

  it('undo and redo of an encrypted edit keep each value with its own metadata', async () => {
    const store = makeStore();
    const { result, undoStore } = renderActions(store);

    let id = '';
    await act(async () => {
      id = await result.current.createNodeAt('Alex', { x: 0.5, y: 0.5 });
    });
    await act(async () => {
      await result.current.updateNodeAttributes(id, {
        set: { [QUICK_ADD_VAR]: 'Sam' },
        unset: [],
      });
    });
    expect(await readStoredName(getNode(store, id))).toBe('Sam');

    await act(async () => {
      await undoStore.getState().undo();
    });
    expect(await readStoredName(getNode(store, id))).toBe('Alex');

    await act(async () => {
      await undoStore.getState().redo();
    });
    expect(await readStoredName(getNode(store, id))).toBe('Sam');
  });

  it('undo of coalesced encrypted edits restores the value before the first edit', async () => {
    const store = makeStore();
    const { result, undoStore } = renderActions(store);

    let id = '';
    await act(async () => {
      id = await result.current.createNodeAt('Alex', { x: 0.5, y: 0.5 });
    });
    await act(async () => {
      await result.current.updateNodeAttributes(
        id,
        { set: { [QUICK_ADD_VAR]: 'Sa' }, unset: [] },
        'node-attr',
      );
      await result.current.updateNodeAttributes(
        id,
        { set: { [QUICK_ADD_VAR]: 'Sam' }, unset: [] },
        'node-attr',
      );
    });

    await act(async () => {
      await undoStore.getState().undo();
    });
    expect(await readStoredName(getNode(store, id))).toBe('Alex');

    await act(async () => {
      await undoStore.getState().redo();
    });
    expect(await readStoredName(getNode(store, id))).toBe('Sam');
  });

  it('undo of clearing an encrypted value restores it with its metadata, redo clears both', async () => {
    const store = makeStore();
    const { result, undoStore } = renderActions(store);

    let id = '';
    await act(async () => {
      id = await result.current.createNodeAt('Alex', { x: 0.5, y: 0.5 });
      await result.current.updateNodeAttributes(id, {
        set: {},
        unset: [QUICK_ADD_VAR],
      });
    });
    const cleared = getNode(store, id);
    expect(cleared?.[entityAttributesProperty][QUICK_ADD_VAR]).toBeUndefined();
    expect(
      cleared?.[entitySecureAttributesMeta]?.[QUICK_ADD_VAR],
    ).toBeUndefined();

    await act(async () => {
      await undoStore.getState().undo();
    });
    expect(await readStoredName(getNode(store, id))).toBe('Alex');

    await act(async () => {
      await undoStore.getState().redo();
    });
    const redone = getNode(store, id);
    expect(redone?.[entityAttributesProperty][QUICK_ADD_VAR]).toBeUndefined();
    expect(
      redone?.[entitySecureAttributesMeta]?.[QUICK_ADD_VAR],
    ).toBeUndefined();
  });
});

describe('useComposerActions while the encryptedVariables experiment is off', () => {
  it('undo and redo of an edit restore plaintext without secure-attribute metadata', async () => {
    const store = makeStore(false);
    const { result, undoStore } = renderActions(store, false);

    let id = '';
    await act(async () => {
      id = await result.current.createNodeAt('Alex', { x: 0.5, y: 0.5 });
    });
    await act(async () => {
      await result.current.updateNodeAttributes(id, {
        set: { [QUICK_ADD_VAR]: 'Sam' },
        unset: [],
      });
    });

    await act(async () => {
      await undoStore.getState().undo();
    });
    const undone = getNode(store, id);
    expect(undone?.[entityAttributesProperty][QUICK_ADD_VAR]).toBe('Alex');
    expect(undone?.[entitySecureAttributesMeta]).toBeUndefined();

    await act(async () => {
      await undoStore.getState().redo();
    });
    const redone = getNode(store, id);
    expect(redone?.[entityAttributesProperty][QUICK_ADD_VAR]).toBe('Sam');
    expect(redone?.[entitySecureAttributesMeta]).toBeUndefined();
  });
});
