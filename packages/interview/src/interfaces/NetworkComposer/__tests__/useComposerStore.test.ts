import { describe, expect, it } from 'vitest';

import { createComposerStore } from '../useComposerStore';

describe('createComposerStore', () => {
  it('defaults to the select tool with no selection', () => {
    const s = createComposerStore().getState();
    expect(s.activeTool).toEqual({ kind: 'select' });
    expect(s.selectedNodeIds.size).toBe(0);
    expect(s.selectedEdgeId).toBeNull();
    expect(s.pendingEdgeSource).toBeNull();
  });

  it('selectOnlyNode replaces the selection and clears edge selection', () => {
    const store = createComposerStore();
    store.getState().selectEdge('e1');
    store.getState().selectOnlyNode('n1');
    expect([...store.getState().selectedNodeIds]).toEqual(['n1']);
    expect(store.getState().selectedEdgeId).toBeNull();
  });

  it('toggleNodeInSelection adds then removes a node', () => {
    const store = createComposerStore();
    store.getState().toggleNodeInSelection('n1');
    store.getState().toggleNodeInSelection('n2');
    expect(store.getState().selectedNodeIds.size).toBe(2);
    store.getState().toggleNodeInSelection('n1');
    expect([...store.getState().selectedNodeIds]).toEqual(['n2']);
  });

  it('switching the active tool clears selection and pending edge source', () => {
    const store = createComposerStore();
    store.getState().selectOnlyNode('n1');
    store.getState().setPendingEdgeSource('n1');
    store.getState().setActiveTool({ kind: 'edge', edgeType: 'knows' });
    expect(store.getState().selectedNodeIds.size).toBe(0);
    expect(store.getState().pendingEdgeSource).toBeNull();
    expect(store.getState().activeTool).toEqual({
      kind: 'edge',
      edgeType: 'knows',
    });
  });

  it('captures a lasso path then clears it on end', () => {
    const store = createComposerStore();
    store.getState().startLasso();
    store.getState().addLassoPoint({ x: 0.1, y: 0.1 });
    store.getState().addLassoPoint({ x: 0.2, y: 0.2 });
    expect(store.getState().lassoPoints).toHaveLength(2);
    store.getState().endLasso();
    expect(store.getState().lassoPoints).toBeNull();
  });
});
