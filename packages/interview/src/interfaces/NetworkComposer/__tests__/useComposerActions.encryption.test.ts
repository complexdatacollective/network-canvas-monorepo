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

import type { StageProps } from '../../../types';
import {
  createEncryptionStore,
  encryptionFor,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { readEncryptedAttribute } from '../../Anonymisation/decryptionScope';
import { decryptValue } from '../../Anonymisation/encryptionFormat';
import { generateSecureAttributes } from '../../Anonymisation/utils';
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

type Store = ReturnType<typeof createEncryptionStore>;

/**
 * An interview whose passphrase was chosen earlier, holding `nodes`, with its
 * key in force unless `locked`.
 */
async function makeStore({
  nodes = [],
  locked = false,
}: { nodes?: NcNode[]; locked?: boolean } = {}): Promise<Store> {
  const store = createEncryptionStore(nodes, [stage], variables, {
    header: (await encryptionFor(PASSPHRASE)).header,
  });
  if (!locked) await unlockWith(store, PASSPHRASE);
  return store;
}

async function storedPerson(id: string, name: string): Promise<NcNode> {
  const { key } = await encryptionFor(PASSPHRASE);
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(
      { [QUICK_ADD_VAR]: name, [LAYOUT_VAR]: { x: 0.5, y: 0.5 } },
      variables,
      key,
      id,
    );
  return {
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: encryptedAttributes,
    [entitySecureAttributesMeta]: secureAttributes,
  };
}

function renderActions(store: Store) {
  const undoStore = createUndoStore();
  const { result } = renderHook(
    () =>
      useComposerActions({
        subjectType: NODE_TYPE,
        quickAdd: QUICK_ADD_VAR,
        layoutVariable: LAYOUT_VAR,
        useEncryption: true,
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

function getNode(store: Store, id: string) {
  return store
    .getState()
    .session.network.nodes.find((n) => n[entityPrimaryKeyProperty] === id);
}

// Reads the stored name the way every display path does: the stored value must
// be ciphertext, stored with only an IV beside it, and decrypt as the name of
// the node it is stored on.
async function readStoredName(node: NcNode | undefined) {
  if (!node) throw new Error('Expected the node to exist');
  const stored = readEncryptedAttribute(node, QUICK_ADD_VAR, variables);
  if (stored?.status !== 'encrypted') {
    throw new Error('Expected a stored ciphertext');
  }
  expect(stored.value.nodeId).toBe(node[entityPrimaryKeyProperty]);
  expect(
    Object.keys(node[entitySecureAttributesMeta]?.[QUICK_ADD_VAR] ?? {}),
  ).toEqual(['iv']);
  const { key } = await encryptionFor(PASSPHRASE);
  return decryptValue(key, stored.value, stored.value);
}

describe('useComposerActions with an encrypted quick-add variable', () => {
  it('createNodeAt stores the name as ciphertext with its metadata', async () => {
    const store = await makeStore();
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

  it('redo of an undone create puts the node back under its own id, still decryptable', async () => {
    const store = await makeStore();
    const { result, undoStore } = renderActions(store);

    let id = '';
    await act(async () => {
      id = await result.current.createNodeAt('Alex', { x: 0.5, y: 0.5 });
    });
    await act(async () => {
      await undoStore.getState().undo();
    });
    expect(store.getState().session.network.nodes).toEqual([]);

    await act(async () => {
      await undoStore.getState().redo();
    });
    const [restored, ...others] = store.getState().session.network.nodes;
    expect(others).toEqual([]);
    expect(restored?.[entityPrimaryKeyProperty]).toBe(id);
    expect(await readStoredName(restored)).toBe('Alex');
  });

  it('undo of a deletion puts back a decryptable node', async () => {
    const store = await makeStore();
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
    const store = await makeStore();
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
    const store = await makeStore();
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
    const store = await makeStore();
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
    const store = await makeStore();
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

describe('useComposerActions while the interview is locked', () => {
  it('refuses to create a node with an encrypted name, storing nothing and recording no undo step', async () => {
    const store = await makeStore({ locked: true });
    const { result, undoStore } = renderActions(store);

    await act(async () => {
      await expect(
        result.current.createNodeAt('Alex', { x: 0.5, y: 0.5 }),
      ).rejects.toMatchObject({ name: 'PassphraseRequiredError' });
    });

    expect(store.getState().session.network.nodes).toEqual([]);
    expect(undoStore.getState().past).toEqual([]);
  });

  it('refuses an encrypted edit, leaving the stored value and its IV as they were', async () => {
    const stored = await storedPerson('node-a', 'Alex');
    const store = await makeStore({ nodes: [stored], locked: true });
    const { result, undoStore } = renderActions(store);

    await act(async () => {
      await expect(
        result.current.updateNodeAttributes('node-a', {
          set: { [QUICK_ADD_VAR]: 'Sam' },
          unset: [],
        }),
      ).rejects.toMatchObject({ name: 'PassphraseRequiredError' });
    });

    expect(getNode(store, 'node-a')).toBe(stored);
    expect(undoStore.getState().past).toEqual([]);
  });
});
