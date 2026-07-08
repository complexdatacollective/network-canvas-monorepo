import { clamp } from 'es-toolkit';
import { type RefObject, useCallback, useRef, useState } from 'react';
import type { StoreApi } from 'zustand';

import type { DndStore } from '@codaco/fresco-ui/dnd/dnd';
import type { DragMetadata } from '@codaco/fresco-ui/dnd/types';
import { findSourceZone } from '@codaco/fresco-ui/dnd/utils';

import type { CanvasStoreApi } from './useCanvasStore';

const DRAG_THRESHOLD = 5;
const NUDGE_AMOUNT = 0.02;

type UseCanvasDragOptions = {
  nodeId: string;
  canvasRef: RefObject<HTMLElement | null>;
  store: CanvasStoreApi;
  onDragEnd?: (nodeId: string, position: { x: number; y: number }) => void;
  onClick?: () => void;
  disabled?: boolean;
  simulation?: {
    moveNode: (nodeId: string, position: { x: number; y: number }) => void;
    releaseNode: (nodeId: string) => void;
  } | null;
  /**
   * When provided (together with dndStore), drags also drive the shared
   * fresco-ui DnD store so registered drop targets (e.g. the unplaced-node
   * drawer) can accept the node. No drag preview is rendered — the canvas
   * node itself follows the pointer. A drop on a target suppresses onDragEnd;
   * the target's onDrop handles the node instead.
   */
  dndItem?: { type: string; metadata?: DragMetadata } | null;
  /** The shared DnD store to drive while dragging. Passed in (rather than read
   * from context) so canvases without drop-target integration don't require a
   * DndStoreProvider. */
  dndStore?: StoreApi<DndStore> | null;
  /** Keyboard equivalent of dragging the node off the canvas (Delete/Backspace). */
  onRemove?: ((nodeId: string) => void) | null;
};

export function useCanvasDrag({
  nodeId,
  canvasRef,
  store,
  onDragEnd,
  onClick,
  disabled = false,
  simulation = null,
  dndItem = null,
  dndStore = null,
  onRemove = null,
}: UseCanvasDragOptions) {
  const isDraggingRef = useRef(false);
  const isPointerActiveRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  // Reactive mirror of isDraggingRef so consumers can restyle the node while
  // it is dragged (e.g. lift it above overlapping drop targets).
  const [isDragging, setIsDragging] = useState(false);

  const screenToNormalized = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0.5, y: 0.5 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: clamp((clientX - rect.left) / rect.width, 0, 1),
        y: clamp((clientY - rect.top) / rect.height, 0, 1),
      };
    },
    [canvasRef],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      if (e.button !== 0) return;
      if (isPointerActiveRef.current) return;

      isPointerActiveRef.current = true;

      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      isDraggingRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY };

      const pointerId = e.pointerId;
      const targetElement = e.target instanceof HTMLElement ? e.target : null;
      let dndStarted = false;

      const handleMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startPosRef.current.x;
        const dy = moveEvent.clientY - startPosRef.current.y;

        if (
          !isDraggingRef.current &&
          Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD
        ) {
          return;
        }

        if (!isDraggingRef.current) setIsDragging(true);
        isDraggingRef.current = true;

        if (dndItem && dndStore && targetElement && !dndStarted) {
          dndStarted = true;
          const rect = targetElement.getBoundingClientRect();
          dndStore.getState().startDrag(
            {
              id: nodeId,
              type: dndItem.type,
              metadata: dndItem.metadata,
              _sourceZone: findSourceZone(targetElement),
            },
            {
              x: moveEvent.clientX,
              y: moveEvent.clientY,
              width: rect.width,
              height: rect.height,
            },
            // No preview: the canvas node itself follows the pointer.
            null,
          );
        }

        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
        }

        rafRef.current = requestAnimationFrame(() => {
          const pos = screenToNormalized(moveEvent.clientX, moveEvent.clientY);
          store.getState().setPosition(nodeId, pos);
          simulation?.moveNode(nodeId, pos);
          if (dndStarted && dndStore) {
            dndStore
              .getState()
              .updateDragPosition(moveEvent.clientX, moveEvent.clientY);
          }
          rafRef.current = null;
        });
      };

      const handleUp = (upEvent: PointerEvent) => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        document.removeEventListener('pointercancel', handleUp);

        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }

        try {
          (e.target as HTMLElement).releasePointerCapture(pointerId);
        } catch {
          // Pointer capture may already be released
        }

        let droppedOnDndTarget = false;
        if (dndStarted && dndStore) {
          const dndState = dndStore.getState();
          // A cancelled pointer must not commit a drop.
          if (upEvent.type === 'pointercancel') {
            dndState.setActiveDropTarget(null);
          } else {
            droppedOnDndTarget = dndState.activeDropTargetId !== null;
          }
          // Triggers the active target's onDrop via its isDragging subscription.
          dndState.endDrag();
        }

        if (isDraggingRef.current) {
          const pos = store.getState().positions.get(nodeId);
          if (pos) {
            simulation?.releaseNode(nodeId);
            // When a drop target claimed the node, its onDrop owns the outcome —
            // persisting the canvas position here would race with it.
            if (!droppedOnDndTarget) {
              onDragEnd?.(nodeId, pos);
            }
          }
        } else {
          onClick?.();
        }

        isDraggingRef.current = false;
        isPointerActiveRef.current = false;
        setIsDragging(false);
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
      document.addEventListener('pointercancel', handleUp);
    },
    [
      disabled,
      nodeId,
      screenToNormalized,
      store,
      simulation,
      onDragEnd,
      onClick,
      dndItem,
      dndStore,
    ],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      const pos = store.getState().positions.get(nodeId);
      if (!pos) return;

      let newPos: { x: number; y: number } | null = null;

      switch (e.key) {
        case 'Enter':
          // ARIA button pattern: Enter activates on keydown (and auto-repeats).
          e.preventDefault();
          onClick?.();
          return;
        case ' ':
          // ARIA button pattern: Space activates on keyup; keydown only
          // preventDefaults to suppress page scroll.
          e.preventDefault();
          return;
        case 'Delete':
        case 'Backspace':
          if (!onRemove) return;
          e.preventDefault();
          onRemove(nodeId);
          return;
        case 'ArrowUp':
          newPos = { x: pos.x, y: clamp(pos.y - NUDGE_AMOUNT, 0, 1) };
          break;
        case 'ArrowDown':
          newPos = { x: pos.x, y: clamp(pos.y + NUDGE_AMOUNT, 0, 1) };
          break;
        case 'ArrowLeft':
          newPos = { x: clamp(pos.x - NUDGE_AMOUNT, 0, 1), y: pos.y };
          break;
        case 'ArrowRight':
          newPos = { x: clamp(pos.x + NUDGE_AMOUNT, 0, 1), y: pos.y };
          break;
        default:
          return;
      }

      e.preventDefault();
      store.getState().setPosition(nodeId, newPos);
      // Move then release so the node settles at the nudged position without
      // staying pinned — otherwise an automatic-layout simulation would freeze it
      // (mirrors the pointer-drag path, which releases before onDragEnd).
      simulation?.moveNode(nodeId, newPos);
      simulation?.releaseNode(nodeId);
      onDragEnd?.(nodeId, newPos);
    },
    [disabled, nodeId, store, simulation, onDragEnd, onClick, onRemove],
  );

  const onKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key !== ' ') return;
      onClick?.();
    },
    [disabled, onClick],
  );

  return {
    dragProps: {
      onPointerDown,
      onKeyDown,
      onKeyUp,
      style: {
        cursor: disabled ? 'default' : 'grab',
        touchAction: 'none' as const,
      },
    },
    isDragging,
  };
}
