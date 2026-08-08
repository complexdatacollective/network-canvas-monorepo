import { act, fireEvent, render, screen } from '@testing-library/react';
import { type RefObject, useEffect, useRef } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';

import { type DndStore, DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { useDndStoreApi } from '@codaco/fresco-ui/dnd/DndStoreProvider';

import { useCanvasDrag } from '../useCanvasDrag';
import { type CanvasStoreApi, createCanvasStore } from '../useCanvasStore';

beforeAll(() => {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }
});

const NODE_ID = 'n1';

type DragNodeProps = {
  store: CanvasStoreApi;
  canvasRef: RefObject<HTMLElement | null>;
  onDragEnd?: (nodeId: string, position: { x: number; y: number }) => void;
  onRemove?: (nodeId: string) => void;
  onClick?: () => void;
  shouldSuppressTap?: () => boolean;
  withDndItem?: boolean;
};

function DragNode({
  store,
  canvasRef,
  onDragEnd,
  onRemove,
  onClick,
  shouldSuppressTap,
  withDndItem = false,
}: DragNodeProps) {
  const dndStore = useDndStoreApi();
  const { dragProps } = useCanvasDrag({
    nodeId: NODE_ID,
    canvasRef,
    store,
    onDragEnd,
    onRemove,
    onClick,
    shouldSuppressTap,
    dndItem: withDndItem
      ? { type: 'PLACED_NODE', metadata: { nodeId: NODE_ID } }
      : null,
    dndStore: withDndItem ? dndStore : null,
  });
  return (
    <button type="button" data-testid="drag-node" {...dragProps}>
      node
    </button>
  );
}

function Fixture({
  onStore,
  ...props
}: Omit<DragNodeProps, 'canvasRef'> & {
  onStore?: (dndStore: StoreApi<DndStore>) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  return (
    <DndStoreProvider>
      {onStore && <CaptureDndStore onStore={onStore} />}
      <div ref={canvasRef}>
        <DragNode canvasRef={canvasRef} {...props} />
      </div>
    </DndStoreProvider>
  );
}

function CaptureDndStore({
  onStore,
}: {
  onStore: (store: StoreApi<DndStore>) => void;
}) {
  const store = useDndStoreApi();
  useEffect(() => {
    onStore(store);
  }, [store, onStore]);
  return null;
}

function makeSeededStore() {
  const store = createCanvasStore();
  store.getState().setPosition(NODE_ID, { x: 0.5, y: 0.5 });
  return store;
}

function dragBeyondThreshold() {
  const node = screen.getByTestId('drag-node');
  fireEvent.pointerDown(node, {
    button: 0,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
  });
  fireEvent.pointerMove(document, { clientX: 50, clientY: 50, pointerId: 1 });
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

  it('drives the DnD store during a drag when dndItem is provided', () => {
    let dndStore: StoreApi<DndStore> | null = null;
    render(
      <Fixture
        store={makeSeededStore()}
        withDndItem
        onStore={(s) => (dndStore = s)}
      />,
    );

    dragBeyondThreshold();
    expect(dndStore!.getState().isDragging).toBe(true);
    expect(dndStore!.getState().dragItem).toMatchObject({
      type: 'PLACED_NODE',
      metadata: { nodeId: NODE_ID },
    });

    fireEvent.pointerUp(document, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(dndStore!.getState().isDragging).toBe(false);
  });

  it('suppresses onDragEnd when the node is dropped on an active DnD target', () => {
    const onDragEnd = vi.fn();
    let dndStore: StoreApi<DndStore> | null = null;
    render(
      <Fixture
        store={makeSeededStore()}
        withDndItem
        onDragEnd={onDragEnd}
        onStore={(s) => (dndStore = s)}
      />,
    );

    dragBeyondThreshold();
    act(() => {
      dndStore!.getState().setActiveDropTarget('some-drop-target');
    });
    fireEvent.pointerUp(document, { clientX: 50, clientY: 50, pointerId: 1 });

    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it('calls onDragEnd normally when the drag ends over no DnD target', () => {
    const onDragEnd = vi.fn();
    render(
      <Fixture store={makeSeededStore()} withDndItem onDragEnd={onDragEnd} />,
    );

    dragBeyondThreshold();
    fireEvent.pointerUp(document, { clientX: 50, clientY: 50, pointerId: 1 });

    expect(onDragEnd).toHaveBeenCalledWith(NODE_ID, {
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });

  it('skips the tap when the gesture already did something else', () => {
    const onClick = vi.fn();
    const shouldSuppressTap = vi.fn(() => true);
    render(
      <Fixture
        store={makeSeededStore()}
        onClick={onClick}
        shouldSuppressTap={shouldSuppressTap}
      />,
    );

    const node = screen.getByTestId('drag-node');
    fireEvent.pointerDown(node, {
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
    });
    fireEvent.pointerUp(document, { clientX: 0, clientY: 0, pointerId: 1 });

    expect(shouldSuppressTap).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('consumes the suppression even when the gesture became a drag', () => {
    const onClick = vi.fn();
    // Raised during the gesture — as a press-and-hold reveal would — and never
    // asked about again, so it must not be left over for the next tap.
    let suppressed = true;
    const shouldSuppressTap = vi.fn(() => {
      const value = suppressed;
      suppressed = false;
      return value;
    });
    render(
      <Fixture
        store={makeSeededStore()}
        onClick={onClick}
        shouldSuppressTap={shouldSuppressTap}
      />,
    );

    // Hold, reveal, then drag away without releasing: no tap is synthesised.
    dragBeyondThreshold();
    fireEvent.pointerUp(document, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(onClick).not.toHaveBeenCalled();
    expect(shouldSuppressTap).toHaveBeenCalledOnce();

    // The next ordinary tap must still select.
    const node = screen.getByTestId('drag-node');
    fireEvent.pointerDown(node, {
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 2,
    });
    fireEvent.pointerUp(document, { clientX: 0, clientY: 0, pointerId: 2 });

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('ignores a second finger moving or lifting mid-gesture', () => {
    const onClick = vi.fn();
    const onDragEnd = vi.fn();
    render(
      <Fixture
        store={makeSeededStore()}
        onClick={onClick}
        onDragEnd={onDragEnd}
      />,
    );

    const node = screen.getByTestId('drag-node');
    fireEvent.pointerDown(node, {
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
    });

    // A second finger wanders far and lifts while the first stays put.
    fireEvent.pointerMove(document, {
      clientX: 500,
      clientY: 500,
      pointerId: 2,
    });
    fireEvent.pointerUp(document, { clientX: 500, clientY: 500, pointerId: 2 });

    // The first finger's gesture is untouched: no drag was started by the
    // stray movement, and its tap has not been settled yet.
    expect(onDragEnd).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.pointerUp(document, { clientX: 0, clientY: 0, pointerId: 1 });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not commit a drop when the pointer is cancelled', () => {
    const onDragEnd = vi.fn();
    let dndStore: StoreApi<DndStore> | null = null;
    render(
      <Fixture
        store={makeSeededStore()}
        withDndItem
        onDragEnd={onDragEnd}
        onStore={(s) => (dndStore = s)}
      />,
    );

    dragBeyondThreshold();
    act(() => {
      dndStore!.getState().setActiveDropTarget('some-drop-target');
    });
    fireEvent.pointerCancel(document, {
      clientX: 50,
      clientY: 50,
      pointerId: 1,
    });

    expect(dndStore!.getState().activeDropTargetId).toBeNull();
    expect(onDragEnd).toHaveBeenCalled();
  });
});
