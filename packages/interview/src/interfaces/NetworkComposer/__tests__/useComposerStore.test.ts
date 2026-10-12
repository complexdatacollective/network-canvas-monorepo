import { describe, expect, it, vi } from 'vitest';

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

describe('createComposerStore holding the selection on a draft', () => {
  type Store = ReturnType<typeof createComposerStore>;

  function deferred() {
    let resolve: (allowed: boolean) => void = () => undefined;
    const promise = new Promise<boolean>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  function holdNode(store: Store) {
    store.getState().selectOnlyNode('n1');
    const answer = deferred();
    const confirmLeave = vi.fn(() => answer.promise);
    const release = store.getState().guardDraft('n1', confirmLeave);
    return { answer, confirmLeave, release };
  }

  const selection = (store: Store) => ({
    nodes: [...store.getState().selectedNodeIds],
    edge: store.getState().selectedEdgeId,
  });

  const leavingChanges: [string, (store: Store) => void][] = [
    [
      'selecting another node',
      (store) => store.getState().selectOnlyNode('n2'),
    ],
    [
      'adding a node to the selection',
      (store) => store.getState().toggleNodeInSelection('n2'),
    ],
    [
      'taking the node out of the selection',
      (store) => store.getState().toggleNodeInSelection('n1'),
    ],
    [
      'selecting nodes with the lasso',
      (store) => store.getState().selectNodes(['n1', 'n2']),
    ],
    ['clearing the selection', (store) => store.getState().clearSelection()],
    ['selecting an edge', (store) => store.getState().selectEdge('e1')],
    [
      'choosing another tool',
      (store) => store.getState().setActiveTool({ kind: 'addNode' }),
    ],
  ];

  it.each(leavingChanges)(
    'waits for the draft before %s, then makes the change',
    async (_, change) => {
      const store = createComposerStore();
      const { answer, confirmLeave } = holdNode(store);

      change(store);
      expect(confirmLeave).toHaveBeenCalledTimes(1);
      expect(selection(store)).toEqual({ nodes: ['n1'], edge: null });
      expect(store.getState().activeTool).toEqual({ kind: 'select' });

      answer.resolve(true);
      await vi.waitFor(() =>
        expect(selection(store)).not.toEqual({ nodes: ['n1'], edge: null }),
      );
    },
  );

  it.each(leavingChanges)(
    'keeps the selection when the draft is kept, on %s',
    async (_, change) => {
      const store = createComposerStore();
      const { answer } = holdNode(store);

      change(store);
      answer.resolve(false);
      await answer.promise;
      await Promise.resolve();

      expect(selection(store)).toEqual({ nodes: ['n1'], edge: null });
      expect(store.getState().activeTool).toEqual({ kind: 'select' });
      // A later change is asked about again rather than taken as waiting.
      store.getState().clearSelection();
      expect(selection(store)).toEqual({ nodes: ['n1'], edge: null });
    },
  );

  it('makes the change at once when the draft has nothing to save', () => {
    const store = createComposerStore();
    store.getState().selectOnlyNode('n1');
    store.getState().guardDraft('n1', () => true);

    store.getState().selectOnlyNode('n2');
    expect(selection(store)).toEqual({ nodes: ['n2'], edge: null });
  });

  it('does not ask when the change keeps the node selected alone', () => {
    const store = createComposerStore();
    const { confirmLeave } = holdNode(store);

    store.getState().selectOnlyNode('n1');
    store.getState().selectNodes(['n1']);
    expect(confirmLeave).not.toHaveBeenCalled();
  });

  it('holds an edge as it holds a node', () => {
    const store = createComposerStore();
    store.getState().selectEdge('e1');
    const confirmLeave = vi.fn(() => deferred().promise);
    store.getState().guardDraft('e1', confirmLeave);

    store.getState().selectEdge('e1');
    expect(confirmLeave).not.toHaveBeenCalled();
    store.getState().selectOnlyNode('n1');
    expect(confirmLeave).toHaveBeenCalledTimes(1);
    expect(selection(store)).toEqual({ nodes: [], edge: 'e1' });
  });

  it('clears the selection of a deleted entity without asking about its draft', () => {
    const store = createComposerStore();
    const { confirmLeave } = holdNode(store);

    store.getState().deselectDeleted();
    expect(confirmLeave).not.toHaveBeenCalled();
    expect(selection(store)).toEqual({ nodes: [], edge: null });
    // Its Inspector stays on screen while the drawer closes.
    store.getState().selectOnlyNode('n2');
    expect(confirmLeave).not.toHaveBeenCalled();
    expect(selection(store)).toEqual({ nodes: ['n2'], edge: null });
  });

  it('stops asking once the hold is released', () => {
    const store = createComposerStore();
    const { confirmLeave, release } = holdNode(store);

    release();
    store.getState().clearSelection();
    expect(confirmLeave).not.toHaveBeenCalled();
    expect(selection(store)).toEqual({ nodes: [], edge: null });
  });

  it('keeps a newer hold when an older one is released', () => {
    const store = createComposerStore();
    const { release } = holdNode(store);
    const confirmLeave = vi.fn(() => deferred().promise);
    store.getState().guardDraft('n1', confirmLeave);

    release();
    store.getState().clearSelection();
    expect(confirmLeave).toHaveBeenCalledTimes(1);
  });

  it('asks once while a change waits, then makes the latest change', async () => {
    const store = createComposerStore();
    const { answer, confirmLeave } = holdNode(store);

    store.getState().clearSelection();
    store.getState().selectOnlyNode('n3');
    expect(confirmLeave).toHaveBeenCalledTimes(1);

    answer.resolve(true);
    await vi.waitFor(() =>
      expect(selection(store)).toEqual({ nodes: ['n3'], edge: null }),
    );
  });

  it('lets an answer about a deleted entity decide nothing', async () => {
    const store = createComposerStore();
    const first = holdNode(store);
    store.getState().clearSelection();
    store.getState().deselectDeleted();

    store.getState().selectOnlyNode('n2');
    const second = deferred();
    store.getState().guardDraft('n2', () => second.promise);
    store.getState().selectOnlyNode('n3');

    first.answer.resolve(true);
    await first.answer.promise;
    await Promise.resolve();
    expect(selection(store)).toEqual({ nodes: ['n2'], edge: null });

    second.resolve(true);
    await vi.waitFor(() =>
      expect(selection(store)).toEqual({ nodes: ['n3'], edge: null }),
    );
  });
});
