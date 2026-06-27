import { configureStore } from '@reduxjs/toolkit';
import { renderHook, act } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';
import protocol from '~/store/modules/protocol';
import session from '~/store/modules/session';
import ui from '~/store/modules/ui';

import { useComposerActions } from '../useComposerActions';
import { createUndoStore } from '../useUndoStore';

// Variable IDs used in the codebook
const QUICK_ADD_VAR = 'var-quick-add';
const LAYOUT_VAR = 'var-layout';
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

function makeStore(
  initialNodes = [] as unknown[],
  initialEdges = [] as unknown[],
) {
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
        schemaVersion: 8,
        codebook,
        stages,
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
}

function makeWrapper(store: ReturnType<typeof makeStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(Provider, { store }, children);
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

    act(() => {
      undoStore.getState().undo();
    });

    expect(store.getState().session.network.nodes).toHaveLength(0);

    await act(async () => {
      undoStore.getState().redo();
    });

    expect(store.getState().session.network.nodes).toHaveLength(1);
  });

  // 3. connect adds one edge; undo removes it
  it('connect adds an edge; undo removes it', async () => {
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
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    await act(async () => {
      await result.current.connect('a', 'b', EDGE_TYPE);
    });

    expect(store.getState().session.network.edges).toHaveLength(1);

    act(() => {
      undoStore.getState().undo();
    });

    expect(store.getState().session.network.edges).toHaveLength(0);
  });

  // 4. connectAll([a,b,c], edgeType) adds 3 edges; undo removes all 3
  it('connectAll adds 3 pairwise edges for 3 nodes; undo removes all 3', async () => {
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
    const nodeC = {
      [entityPrimaryKeyProperty]: 'c',
      type: NODE_TYPE,
      [entityAttributesProperty]: {},
    };
    const store = makeStore([nodeA, nodeB, nodeC]);
    const undoStore = createUndoStore();

    const { result } = renderHook(
      () =>
        useComposerActions({
          subjectType: NODE_TYPE,
          quickAdd: QUICK_ADD_VAR,
          layoutVariable: LAYOUT_VAR,
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    await act(async () => {
      await result.current.connectAll(['a', 'b', 'c'], EDGE_TYPE);
    });

    expect(store.getState().session.network.edges).toHaveLength(3);

    act(() => {
      undoStore.getState().undo();
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
          currentStep: 0,
          undoStore,
          dispatch: store.dispatch as Parameters<
            typeof useComposerActions
          >[0]['dispatch'],
        }),
      { wrapper: makeWrapper(store) },
    );

    act(() => {
      result.current.deleteNodeById('a');
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
});
