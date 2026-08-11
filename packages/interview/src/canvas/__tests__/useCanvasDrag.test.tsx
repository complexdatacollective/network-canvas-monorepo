import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';

import { type DndStore, DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { useDndStoreApi } from '@codaco/fresco-ui/dnd/DndStoreProvider';

import { useCanvasDrag } from '../useCanvasDrag';
import { type CanvasStoreApi, createCanvasStore } from '../useCanvasStore';

// jsdom implements no hit testing; the DnD store's position updates probe it.
beforeAll(() => {
  document.elementsFromPoint ??= () => [];
});

const NODE_ID = 'n1';

type Captured = ReturnType<typeof useCanvasDrag>;

type DragNodeProps = {
  store: CanvasStoreApi;
  onDragEnd?: (nodeId: string, position: { x: number; y: number }) => void;
  onRemove?: (nodeId: string) => void;
  withDndItem?: boolean;
  onApi?: (api: Captured) => void;
};

function DragNode({
  store,
  onDragEnd,
  onRemove,
  withDndItem = false,
  onApi,
}: DragNodeProps) {
  const canvasRef = useRef<HTMLElement | null>(null);
  const dndStore = useDndStoreApi();
  const api = useCanvasDrag({
    nodeId: NODE_ID,
    canvasRef,
    store,
    onDragEnd,
    onRemove,
    dndItem: withDndItem
      ? { type: 'PLACED_NODE', metadata: { nodeId: NODE_ID } }
      : null,
    dndStore: withDndItem ? dndStore : null,
  });
  onApi?.(api);
  return (
    <button
      type="button"
      data-testid="drag-node"
      onKeyDown={api.dragProps.onKeyDown}
    >
      node
    </button>
  );
}

function Fixture({
  onStore,
  ...props
}: DragNodeProps & { onStore?: (dndStore: StoreApi<DndStore>) => void }) {
  return (
    <DndStoreProvider>
      {onStore && <CaptureDndStore onStore={onStore} />}
      <DragNode {...props} />
    </DndStoreProvider>
  );
}

function CaptureDndStore({
  onStore,
}: {
  onStore: (store: StoreApi<DndStore>) => void;
}) {
  const store = useDndStoreApi();
  onStore(store);
  return null;
}

function makeSeededStore() {
  const store = createCanvasStore();
  store.getState().setPosition(NODE_ID, { x: 0.5, y: 0.5 });
  return store;
}

const pointerEvent = (target: EventTarget, clientX = 50, clientY = 50) =>
  ({ target, clientX, clientY }) as unknown as PointerEvent;

/** Runs a drag through the callbacks Node's recognizer would invoke. */
async function drive(
  api: Captured,
  target: EventTarget,
  { cancelled = false } = {},
) {
  act(() => api.dragProps.onDragStart(pointerEvent(target)));
  act(() => api.dragProps.onDragMove(pointerEvent(target)));
  // Position updates are rAF-throttled.
  await act(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
  );
  act(() => api.dragProps.onDragEnd(pointerEvent(target), { cancelled }));
}

describe('useCanvasDrag', () => {
  it('calls onRemove when Delete is pressed on the node', () => {
    const onRemove = vi.fn();
    render(<Fixture store={makeSeededStore()} onRemove={onRemove} />);

    fireEvent.keyDown(screen.getByTestId('drag-node'), { key: 'Delete' });
    expect(onRemove).toHaveBeenCalledWith(NODE_ID);

    fireEvent.keyDown(screen.getByTestId('drag-node'), { key: 'Backspace' });
    expect(onRemove).toHaveBeenCalledTimes(2);
  });

  it('nudges the node with arrow keys and settles the move', () => {
    const store = makeSeededStore();
    const onDragEnd = vi.fn();
    render(<Fixture store={store} onDragEnd={onDragEnd} />);

    fireEvent.keyDown(screen.getByTestId('drag-node'), { key: 'ArrowRight' });

    const pos = store.getState().positions.get(NODE_ID)!;
    expect(pos.x).toBeCloseTo(0.52);
    expect(onDragEnd).toHaveBeenCalledWith(NODE_ID, pos);
  });

  it('reports dragging while a drag is live', async () => {
    let api!: Captured;
    render(<Fixture store={makeSeededStore()} onApi={(a) => (api = a)} />);
    const node = screen.getByTestId('drag-node');

    expect(api.isDragging).toBe(false);
    act(() => api.dragProps.onDragStart(pointerEvent(node)));
    expect(api.isDragging).toBe(true);
    act(() =>
      api.dragProps.onDragEnd(pointerEvent(node), { cancelled: false }),
    );
    expect(api.isDragging).toBe(false);
  });

  it('drives the DnD store during a drag when dndItem is provided', () => {
    let dndStore: StoreApi<DndStore> | null = null;
    let api!: Captured;
    render(
      <Fixture
        store={makeSeededStore()}
        withDndItem
        onStore={(s) => (dndStore = s)}
        onApi={(a) => (api = a)}
      />,
    );
    const node = screen.getByTestId('drag-node');

    act(() => api.dragProps.onDragStart(pointerEvent(node)));
    expect(dndStore!.getState().isDragging).toBe(true);
    expect(dndStore!.getState().dragItem).toMatchObject({
      type: 'PLACED_NODE',
      metadata: { nodeId: NODE_ID },
    });

    act(() =>
      api.dragProps.onDragEnd(pointerEvent(node), { cancelled: false }),
    );
    expect(dndStore!.getState().isDragging).toBe(false);
  });

  it('suppresses onDragEnd when the node is dropped on an active DnD target', async () => {
    const onDragEnd = vi.fn();
    let dndStore: StoreApi<DndStore> | null = null;
    let api!: Captured;
    render(
      <Fixture
        store={makeSeededStore()}
        withDndItem
        onDragEnd={onDragEnd}
        onStore={(s) => (dndStore = s)}
        onApi={(a) => (api = a)}
      />,
    );
    const node = screen.getByTestId('drag-node');

    act(() => api.dragProps.onDragStart(pointerEvent(node)));
    act(() => dndStore!.getState().setActiveDropTarget('drawer'));
    act(() =>
      api.dragProps.onDragEnd(pointerEvent(node), { cancelled: false }),
    );

    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it('calls onDragEnd normally when the drag ends over no DnD target', async () => {
    const onDragEnd = vi.fn();
    let api!: Captured;
    render(
      <Fixture
        store={makeSeededStore()}
        withDndItem
        onDragEnd={onDragEnd}
        onApi={(a) => (api = a)}
      />,
    );

    await drive(api, screen.getByTestId('drag-node'));

    expect(onDragEnd).toHaveBeenCalledWith(NODE_ID, expect.any(Object));
  });

  it('does not commit a drop when the drag is cancelled', async () => {
    const onDragEnd = vi.fn();
    let dndStore: StoreApi<DndStore> | null = null;
    let api!: Captured;
    render(
      <Fixture
        store={makeSeededStore()}
        withDndItem
        onDragEnd={onDragEnd}
        onStore={(s) => (dndStore = s)}
        onApi={(a) => (api = a)}
      />,
    );
    const node = screen.getByTestId('drag-node');

    act(() => api.dragProps.onDragStart(pointerEvent(node)));
    act(() => dndStore!.getState().setActiveDropTarget('drawer'));
    act(() => api.dragProps.onDragEnd(pointerEvent(node), { cancelled: true }));

    // The cancelled sequence must not have handed the node to the target; the
    // canvas keeps ownership and settles the node where it was.
    expect(dndStore!.getState().activeDropTargetId).toBeNull();
    expect(onDragEnd).toHaveBeenCalled();
  });
});
