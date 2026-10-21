import { configureStore } from '@reduxjs/toolkit';
import { renderHook, act } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import protocol from '../../../store/modules/protocol';
import session, { updateNode } from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import { useComposerActions } from '../useComposerActions';
import { createUndoStore } from '../useUndoStore';

// Variable IDs used in the codebook
const QUICK_ADD_VAR = 'var-quick-add';
const LAYOUT_VAR = 'var-layout';
const GROUP_VAR = 'var-group';
const NODE_TYPE = 'person';
const EDGE_TYPE = 'knows';

const codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' as const },
      variables: {
        [QUICK_ADD_VAR]: { name: 'name', type: 'text' },
        [LAYOUT_VAR]: { name: 'position', type: 'layout' },
        [GROUP_VAR]: {
          name: 'Group',
          type: 'categorical',
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
      },
    },
  },
  edge: {
    [EDGE_TYPE]: {
      name: 'Knows',
      color: 'edge-color-seq-1',
      variables: {},
    },
  },
  ego: { variables: {} },
};

const stages = [{ id: 'nc1', type: 'NetworkComposer' }];

function makeStore(initialNodes: NcNode[] = [], initialEdges: NcEdge[] = []) {
  return configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: initialNodes,
          edges: initialEdges,
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 9,
        codebook,
        stages,
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
}

function makeWrapper(store: ReturnType<typeof makeStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    // Call form (not createElement/JSX): this is a .ts file, so JSX is
    // unavailable, and `createElement(Provider, { store, children })` trips the
    // react(no-children-prop) lint rule while `createElement(Provider, { store },
    // children)` fails ProviderProps typing (children required). The call form
    // satisfies both.
    return Provider({ store, children });
  };
}

describe('useComposerActions', () => {
  // 1. createNodeAt adds node with correct attributes; returns the node's pk
  it('createNodeAt adds a person node with quickAdd and layout attributes; returned id matches the node pk', async () => {
    const store = makeStore();
    const undoStore = createUndoStore();

    const { result } = renderHook(
      () =>
        useComposerActions({
          subjectType: NODE_TYPE,
          quickAdd: QUICK_ADD_VAR,
          layoutVariable: LAYOUT_VAR,
          useEncryption: false,
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    let nodeId: string;
    await act(async () => {
      nodeId = await result.current.createNodeAt('Alex', { x: 0.5, y: 0.5 });
    });

    const nodes = store.getState().session.network.nodes;
    expect(nodes).toHaveLength(1);

    const node = nodes[0];
    if (!node) throw new Error('expected a created node');
    expect(node[entityPrimaryKeyProperty]).toBe(nodeId!);
    expect(node[entityAttributesProperty][QUICK_ADD_VAR]).toBe('Alex');
    expect(node[entityAttributesProperty][LAYOUT_VAR]).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  // 2. After createNodeAt, undo removes the node; redo re-adds it
  it('undo after createNodeAt removes the node; redo re-adds it', async () => {
    const store = makeStore();
    const undoStore = createUndoStore();

    const { result } = renderHook(
      () =>
        useComposerActions({
          subjectType: NODE_TYPE,
          quickAdd: QUICK_ADD_VAR,
          layoutVariable: LAYOUT_VAR,
          useEncryption: false,
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    await act(async () => {
      await result.current.createNodeAt('Alex', { x: 0.5, y: 0.5 });
    });

    expect(store.getState().session.network.nodes).toHaveLength(1);

    await act(async () => {
      await undoStore.getState().undo();
    });

    expect(store.getState().session.network.nodes).toHaveLength(0);

    await act(async () => {
      await undoStore.getState().redo();
    });

    expect(store.getState().session.network.nodes).toHaveLength(1);
  });

  // 3. toggleEdge adds one edge between unconnected people; undo removes it
  it('toggleEdge adds an edge; undo removes it', async () => {
    const nodeA = {
      [entityPrimaryKeyProperty]: 'a',
      type: NODE_TYPE,
      [entityAttributesProperty]: {},
    };
    const nodeB = {
      [entityPrimaryKeyProperty]: 'b',
      type: NODE_TYPE,
      [entityAttributesProperty]: {},
    };
    const store = makeStore([nodeA, nodeB]);
    const undoStore = createUndoStore();

    const { result } = renderHook(
      () =>
        useComposerActions({
          subjectType: NODE_TYPE,
          quickAdd: QUICK_ADD_VAR,
          layoutVariable: LAYOUT_VAR,
          useEncryption: false,
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    await act(async () => {
      await result.current.toggleEdge('a', 'b', EDGE_TYPE);
    });

    expect(store.getState().session.network.edges).toHaveLength(1);

    await act(async () => {
      await undoStore.getState().undo();
    });

    expect(store.getState().session.network.edges).toHaveLength(0);
  });

  // 5. deleteNodeById removes node and incident edges; undo restores both
  it('deleteNodeById removes node and incident edges; undo restores both', async () => {
    const nodeA = {
      [entityPrimaryKeyProperty]: 'a',
      type: NODE_TYPE,
      [entityAttributesProperty]: {
        [QUICK_ADD_VAR]: 'Alice',
        [LAYOUT_VAR]: { x: 0.1, y: 0.1 },
      },
    };
    const nodeB = {
      [entityPrimaryKeyProperty]: 'b',
      type: NODE_TYPE,
      [entityAttributesProperty]: {},
    };
    const edgeAB = {
      [entityPrimaryKeyProperty]: 'e-ab',
      type: EDGE_TYPE,
      from: 'a',
      to: 'b',
      [entityAttributesProperty]: {},
    };
    const store = makeStore([nodeA, nodeB], [edgeAB]);
    const undoStore = createUndoStore();

    const { result } = renderHook(
      () =>
        useComposerActions({
          subjectType: NODE_TYPE,
          quickAdd: QUICK_ADD_VAR,
          layoutVariable: LAYOUT_VAR,
          useEncryption: false,
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    await act(async () => {
      await result.current.deleteNodeById('a');
    });

    expect(store.getState().session.network.nodes).toHaveLength(1);
    expect(store.getState().session.network.edges).toHaveLength(0);

    await act(async () => {
      undoStore.getState().undo();
    });

    const nodes = store.getState().session.network.nodes;
    const edges = store.getState().session.network.edges;
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);

    const restoredNode = nodes.find((n) => n[entityPrimaryKeyProperty] === 'a');
    expect(restoredNode).toBeDefined();
    expect(restoredNode![entityAttributesProperty][QUICK_ADD_VAR]).toBe(
      'Alice',
    );
  });

  // 7. toggleEdge cycle: undo→redo→undo tracks the live edge id correctly
  it('toggleEdge undo→redo→undo cycle keeps edge count correct', async () => {
    const nodeA: NcNode = {
      [entityPrimaryKeyProperty]: 'a',
      type: NODE_TYPE,
      [entityAttributesProperty]: {},
    };
    const nodeB: NcNode = {
      [entityPrimaryKeyProperty]: 'b',
      type: NODE_TYPE,
      [entityAttributesProperty]: {},
    };
    const store = makeStore([nodeA, nodeB]);
    const undoStore = createUndoStore();

    const { result } = renderHook(
      () =>
        useComposerActions({
          subjectType: NODE_TYPE,
          quickAdd: QUICK_ADD_VAR,
          layoutVariable: LAYOUT_VAR,
          useEncryption: false,
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    await act(async () => {
      await result.current.toggleEdge('a', 'b', EDGE_TYPE);
    });
    expect(store.getState().session.network.edges).toHaveLength(1);

    await act(async () => {
      await undoStore.getState().undo();
    });
    expect(store.getState().session.network.edges).toHaveLength(0);

    await act(async () => {
      await undoStore.getState().redo();
    });
    expect(store.getState().session.network.edges).toHaveLength(1);

    await act(async () => {
      await undoStore.getState().undo();
    });
    expect(store.getState().session.network.edges).toHaveLength(0);
  });

  // 8. repositionNode: undo restores previous position; redo re-applies new position
  it('repositionNode sets new position; undo restores previous; redo re-applies new', async () => {
    const nodeA: NcNode = {
      [entityPrimaryKeyProperty]: 'a',
      type: NODE_TYPE,
      [entityAttributesProperty]: {
        [LAYOUT_VAR]: { x: 0.1, y: 0.1 },
      },
    };
    const store = makeStore([nodeA]);
    const undoStore = createUndoStore();

    const { result } = renderHook(
      () =>
        useComposerActions({
          subjectType: NODE_TYPE,
          quickAdd: QUICK_ADD_VAR,
          layoutVariable: LAYOUT_VAR,
          useEncryption: false,
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    const prevPos = { x: 0.1, y: 0.1 };
    const newPos = { x: 0.8, y: 0.8 };

    await act(async () => {
      await result.current.repositionNode('a', newPos);
    });

    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty][
        LAYOUT_VAR
      ],
    ).toEqual(newPos);

    await act(async () => {
      undoStore.getState().undo();
    });

    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty][
        LAYOUT_VAR
      ],
    ).toEqual(prevPos);

    await act(async () => {
      undoStore.getState().redo();
    });

    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty][
        LAYOUT_VAR
      ],
    ).toEqual(newPos);
  });

  // 9. deleteEdgeById cycle: redo after undo deletes the re-added edge
  // (formerly test #8)
  it('deleteEdgeById undo→redo cycle keeps edge count correct', async () => {
    const nodeA: NcNode = {
      [entityPrimaryKeyProperty]: 'a',
      type: NODE_TYPE,
      [entityAttributesProperty]: {},
    };
    const nodeB: NcNode = {
      [entityPrimaryKeyProperty]: 'b',
      type: NODE_TYPE,
      [entityAttributesProperty]: {},
    };
    const edgeAB: NcEdge = {
      [entityPrimaryKeyProperty]: 'e-ab',
      type: EDGE_TYPE,
      from: 'a',
      to: 'b',
      [entityAttributesProperty]: {},
    };
    const store = makeStore([nodeA, nodeB], [edgeAB]);
    const undoStore = createUndoStore();

    const { result } = renderHook(
      () =>
        useComposerActions({
          subjectType: NODE_TYPE,
          quickAdd: QUICK_ADD_VAR,
          layoutVariable: LAYOUT_VAR,
          useEncryption: false,
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    await act(async () => {
      await result.current.deleteEdgeById('e-ab');
    });
    expect(store.getState().session.network.edges).toHaveLength(0);

    await act(async () => {
      await undoStore.getState().undo();
    });
    expect(store.getState().session.network.edges).toHaveLength(1);

    await act(async () => {
      await undoStore.getState().redo();
    });
    expect(store.getState().session.network.edges).toHaveLength(0);
  });

  // A drawer autosave undo must restore only the edited keys, not unrelated
  // attributes (e.g. a layout move made while the drawer was open).
  it('updateNodeAttributes undo restores only edited keys, not unrelated attributes', async () => {
    const nodeId = 'node-scope';
    const store = makeStore([
      {
        [entityPrimaryKeyProperty]: nodeId,
        type: NODE_TYPE,
        [entityAttributesProperty]: {
          [QUICK_ADD_VAR]: 'Old',
          [LAYOUT_VAR]: { x: 0.2, y: 0.2 },
        },
      } as NcNode,
    ]);
    const undoStore = createUndoStore();

    const { result } = renderHook(
      () =>
        useComposerActions({
          subjectType: NODE_TYPE,
          quickAdd: QUICK_ADD_VAR,
          layoutVariable: LAYOUT_VAR,
          useEncryption: false,
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    // Drawer edits the name attribute only.
    await act(async () => {
      await result.current.updateNodeAttributes(
        nodeId,
        { set: { [QUICK_ADD_VAR]: 'New' }, unset: [] },
        `node-attr:${nodeId}`,
      );
    });

    // The node is moved while the drawer is still open (an unrelated change).
    await act(async () => {
      await store.dispatch(
        updateNode({
          nodeId,
          attributePatch: {
            set: { [LAYOUT_VAR]: { x: 0.8, y: 0.8 } },
            unset: [],
          },
          currentStep: 0,
        }),
      );
    });

    // Undoing the attribute edit reverts the name but keeps the moved position.
    await act(async () => {
      await undoStore.getState().undo();
    });

    const node = store.getState().session.network.nodes[0];
    if (!node) throw new Error('expected the node to still exist');
    expect(node[entityAttributesProperty][QUICK_ADD_VAR]).toBe('Old');
    expect(node[entityAttributesProperty][LAYOUT_VAR]).toEqual({
      x: 0.8,
      y: 0.8,
    });
  });

  it('updateNodeAttributes undo restores prior absence and redo restores the value', async () => {
    const nodeId = 'node-absent';
    const store = makeStore([
      {
        [entityPrimaryKeyProperty]: nodeId,
        type: NODE_TYPE,
        [entityAttributesProperty]: {
          [LAYOUT_VAR]: { x: 0.2, y: 0.2 },
        },
      },
    ]);
    const undoStore = createUndoStore();

    const { result } = renderHook(
      () =>
        useComposerActions({
          subjectType: NODE_TYPE,
          quickAdd: QUICK_ADD_VAR,
          layoutVariable: LAYOUT_VAR,
          useEncryption: false,
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    await act(async () => {
      await result.current.updateNodeAttributes(nodeId, {
        set: { [QUICK_ADD_VAR]: 'New' },
        unset: [],
      });
    });

    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty][
        QUICK_ADD_VAR
      ],
    ).toBe('New');

    await act(async () => {
      await undoStore.getState().undo();
    });

    expect(
      Object.hasOwn(
        store.getState().session.network.nodes[0]?.[entityAttributesProperty] ??
          {},
        QUICK_ADD_VAR,
      ),
    ).toBe(false);

    await act(async () => {
      await undoStore.getState().redo();
    });

    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty][
        QUICK_ADD_VAR
      ],
    ).toBe('New');
  });

  // toggleGroupMembership adds the value when absent and removes it when
  // present; undo after the first toggle restores the prior membership.
  it('toggleGroupMembership adds then removes the value; undo restores prior membership', async () => {
    const nodeId = 'node-toggle';
    const store = makeStore([
      {
        [entityPrimaryKeyProperty]: nodeId,
        type: NODE_TYPE,
        [entityAttributesProperty]: {},
      } as NcNode,
    ]);
    const undoStore = createUndoStore();

    const { result } = renderHook(
      () =>
        useComposerActions({
          subjectType: NODE_TYPE,
          quickAdd: QUICK_ADD_VAR,
          layoutVariable: LAYOUT_VAR,
          useEncryption: false,
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    // First toggle: no prior value, so 'a' is added.
    await act(async () => {
      await result.current.toggleGroupMembership(nodeId, GROUP_VAR, 'a');
    });

    const afterAdd = store.getState().session.network.nodes[0];
    if (!afterAdd) throw new Error('expected the node to still exist');
    expect(afterAdd[entityAttributesProperty][GROUP_VAR]).toEqual(['a']);

    // Second toggle: 'a' present, so it is removed.
    await act(async () => {
      await result.current.toggleGroupMembership(nodeId, GROUP_VAR, 'a');
    });

    const afterRemove = store.getState().session.network.nodes[0];
    if (!afterRemove) throw new Error('expected the node to still exist');
    expect(afterRemove[entityAttributesProperty][GROUP_VAR]).toEqual([]);

    // Undo reverts the removal, restoring the prior ['a'] membership.
    await act(async () => {
      await undoStore.getState().undo();
    });

    const afterUndo = store.getState().session.network.nodes[0];
    if (!afterUndo) throw new Error('expected the node to still exist');
    expect(afterUndo[entityAttributesProperty][GROUP_VAR]).toEqual(['a']);

    await act(async () => {
      await undoStore.getState().undo();
    });

    const afterSecondUndo = store.getState().session.network.nodes[0];
    if (!afterSecondUndo) throw new Error('expected the node to still exist');
    expect(
      Object.hasOwn(afterSecondUndo[entityAttributesProperty], GROUP_VAR),
    ).toBe(false);
  });

  it('setGroupMembership adds and removes a value across many nodes as one undo step', async () => {
    const store = makeStore([
      {
        [entityPrimaryKeyProperty]: 'a',
        type: NODE_TYPE,
        [entityAttributesProperty]: {},
      } as NcNode,
      {
        [entityPrimaryKeyProperty]: 'b',
        type: NODE_TYPE,
        [entityAttributesProperty]: { [GROUP_VAR]: ['a'] },
      } as NcNode,
      {
        [entityPrimaryKeyProperty]: 'c',
        type: NODE_TYPE,
        [entityAttributesProperty]: {},
      } as NcNode,
      {
        [entityPrimaryKeyProperty]: 'd',
        type: NODE_TYPE,
        [entityAttributesProperty]: { [GROUP_VAR]: [] },
      } as NcNode,
    ]);
    const undoStore = createUndoStore();

    const { result } = renderHook(
      () =>
        useComposerActions({
          subjectType: NODE_TYPE,
          quickAdd: QUICK_ADD_VAR,
          layoutVariable: LAYOUT_VAR,
          useEncryption: false,
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    await act(async () => {
      await result.current.setGroupMembership(
        ['a', 'b', 'c', 'd'],
        GROUP_VAR,
        'a',
        true,
      );
    });

    const byId = (id: string) =>
      store
        .getState()
        .session.network.nodes.find((n) => n[entityPrimaryKeyProperty] === id);

    // Nodes a and c lacked the value, so it is added; b already had it.
    expect(byId('a')![entityAttributesProperty][GROUP_VAR]).toEqual(['a']);
    expect(byId('b')![entityAttributesProperty][GROUP_VAR]).toEqual(['a']);
    expect(byId('c')![entityAttributesProperty][GROUP_VAR]).toEqual(['a']);
    expect(byId('d')![entityAttributesProperty][GROUP_VAR]).toEqual(['a']);

    // A single undo reverts the additions on a and c back to no membership,
    // while b (which was skipped) is untouched.
    await act(async () => {
      await undoStore.getState().undo();
    });

    expect(Object.hasOwn(byId('a')![entityAttributesProperty], GROUP_VAR)).toBe(
      false,
    );
    expect(byId('b')![entityAttributesProperty][GROUP_VAR]).toEqual(['a']);
    expect(Object.hasOwn(byId('c')![entityAttributesProperty], GROUP_VAR)).toBe(
      false,
    );
    expect(byId('d')![entityAttributesProperty][GROUP_VAR]).toEqual([]);

    await act(async () => {
      await result.current.setGroupMembership(
        ['a', 'b', 'c', 'd'],
        GROUP_VAR,
        'a',
        false,
      );
    });

    expect(Object.hasOwn(byId('a')![entityAttributesProperty], GROUP_VAR)).toBe(
      false,
    );
    expect(byId('b')![entityAttributesProperty][GROUP_VAR]).toEqual([]);
    expect(Object.hasOwn(byId('c')![entityAttributesProperty], GROUP_VAR)).toBe(
      false,
    );
    expect(byId('d')![entityAttributesProperty][GROUP_VAR]).toEqual([]);

    await act(async () => {
      await undoStore.getState().undo();
    });

    expect(Object.hasOwn(byId('a')![entityAttributesProperty], GROUP_VAR)).toBe(
      false,
    );
    expect(byId('b')![entityAttributesProperty][GROUP_VAR]).toEqual(['a']);
    expect(Object.hasOwn(byId('c')![entityAttributesProperty], GROUP_VAR)).toBe(
      false,
    );
    expect(byId('d')![entityAttributesProperty][GROUP_VAR]).toEqual([]);
  });
});

describe('useComposerActions deleting while another change is being made', () => {
  const node = (id: string): NcNode => ({
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: {},
  });
  const edgeAB: NcEdge = {
    [entityPrimaryKeyProperty]: 'e-ab',
    type: EDGE_TYPE,
    from: 'a',
    to: 'b',
    [entityAttributesProperty]: {},
  };

  const deletions: [
    string,
    (actions: ReturnType<typeof useComposerActions>) => Promise<void>,
    (store: ReturnType<typeof makeStore>) => boolean,
  ][] = [
    [
      'a person',
      (actions) => actions.deleteNodeById('a'),
      (store) =>
        store
          .getState()
          .session.network.nodes.some(
            (n) => n[entityPrimaryKeyProperty] === 'a',
          ),
    ],
    [
      'several people',
      (actions) => actions.deleteNodesById(['a', 'b']),
      (store) => store.getState().session.network.nodes.length > 0,
    ],
    [
      'a relationship',
      (actions) => actions.deleteEdgeById('e-ab'),
      (store) => store.getState().session.network.edges.length > 0,
    ],
  ];

  it.each(deletions)(
    'deletes %s only once the change before it is made',
    async (_, deleteIt, stillThere) => {
      const store = makeStore([node('a'), node('b')], [edgeAB]);
      const undoStore = createUndoStore();
      const { result } = renderHook(
        () =>
          useComposerActions({
            subjectType: NODE_TYPE,
            quickAdd: QUICK_ADD_VAR,
            layoutVariable: LAYOUT_VAR,
            useEncryption: false,
            currentStep: 0,
            undoStore,
            dispatch: store.dispatch as Parameters<
              typeof useComposerActions
            >[0]['dispatch'],
          }),
        { wrapper: makeWrapper(store) },
      );

      let finishChange: () => void = () => undefined;
      const change = undoStore.getState().record(
        () =>
          new Promise((resolve) => {
            finishChange = () => resolve(null);
          }),
      );
      let deleting: Promise<void> = Promise.resolve();
      act(() => {
        deleting = deleteIt(result.current);
      });
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(stillThere(store)).toBe(true);

      finishChange();
      await act(async () => {
        await Promise.all([change, deleting]);
      });
      expect(stillThere(store)).toBe(false);
    },
  );
});

describe('useComposerActions reading the network when a change is made', () => {
  const at = (id: string, position?: { x: number; y: number }): NcNode => ({
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: position ? { [LAYOUT_VAR]: position } : {},
  });

  // Holds the history queue until `release` is called, as a change still
  // being saved does.
  function setUp(nodes: NcNode[]) {
    const store = makeStore(nodes);
    const undoStore = createUndoStore();
    const { result } = renderHook(
      () =>
        useComposerActions({
          subjectType: NODE_TYPE,
          quickAdd: QUICK_ADD_VAR,
          layoutVariable: LAYOUT_VAR,
          useEncryption: false,
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = undoStore.getState().record(async () => {
      await gate;
      return null;
    });
    const settle = async (...pending: Promise<unknown>[]) => {
      release();
      await act(async () => {
        await Promise.all([held, ...pending]);
      });
    };
    return { store, undoStore, actions: () => result.current, settle };
  }

  const layoutOf = (store: ReturnType<typeof makeStore>, id: string) =>
    store
      .getState()
      .session.network.nodes.find((n) => n[entityPrimaryKeyProperty] === id)?.[
      entityAttributesProperty
    ][LAYOUT_VAR];

  it('connects or disconnects two people as they are when the change is made', async () => {
    const { store, actions, settle } = setUp([at('a'), at('b')]);

    const first = actions().toggleEdge('a', 'b', EDGE_TYPE);
    const second = actions().toggleEdge('a', 'b', EDGE_TYPE);
    await settle(first, second);

    expect(store.getState().session.network.edges).toHaveLength(0);
  });

  it('undoes a move to where the person was when it was made', async () => {
    const start = { x: 0.1, y: 0.1 };
    const middle = { x: 0.4, y: 0.4 };
    const end = { x: 0.8, y: 0.8 };
    const { store, undoStore, actions, settle } = setUp([at('a', start)]);

    const first = actions().repositionNode('a', middle);
    const second = actions().repositionNode('a', end);
    await settle(first, second);
    expect(layoutOf(store, 'a')).toEqual(end);

    await act(async () => {
      await undoStore.getState().undo();
    });
    expect(layoutOf(store, 'a')).toEqual(middle);
  });

  it('places a person among the people there when they are added', async () => {
    const { store, actions, settle } = setUp([]);
    const nextFree = (occupied: { x: number; y: number }[]) => ({
      x: 0.1 * (occupied.length + 1),
      y: 0.1,
    });

    let first: Promise<string> = Promise.resolve('');
    let second: Promise<string> = Promise.resolve('');
    act(() => {
      first = actions().createNodeAt('Alex', nextFree);
      second = actions().createNodeAt('Sam', nextFree);
    });
    await settle(first, second);

    expect(layoutOf(store, await first)).toEqual({ x: 0.1, y: 0.1 });
    expect(layoutOf(store, await second)).toEqual({ x: 0.2, y: 0.1 });
  });

  it('builds the attributes to save when the save is made', async () => {
    const { actions, settle } = setUp([at('a')]);
    let built = false;

    const saving = actions().updateNodeAttributes('a', () => {
      built = true;
      return { set: { [QUICK_ADD_VAR]: 'Alex' }, unset: [] };
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(built).toBe(false);

    await settle(saving);
    expect(built).toBe(true);
  });
});
