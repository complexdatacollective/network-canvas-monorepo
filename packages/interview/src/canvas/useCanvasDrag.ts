'use client';

import { clamp } from 'es-toolkit';
import { type RefObject, useCallback, useRef, useState } from 'react';
import type { StoreApi } from 'zustand';

import type { DndStore } from '@codaco/fresco-ui/dnd/dnd';
import type { DragMetadata } from '@codaco/fresco-ui/dnd/types';
import { findSourceZone } from '@codaco/fresco-ui/dnd/utils';
import type { NodeDragEndInfo } from '@codaco/fresco-ui/Node';

import type { CanvasStoreApi } from './useCanvasStore';

const NUDGE_AMOUNT = 0.02;

type UseCanvasDragOptions = {
  nodeId: string;
  canvasRef: RefObject<HTMLElement | null>;
  store: CanvasStoreApi;
  onDragEnd?: (nodeId: string, position: { x: number; y: number }) => void;
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

/**
 * The canvas's drag *effects*. Node's own gesture recognizer decides when a
 * gesture is a drag (and guarantees it is never also a tap or a hold); this
 * hook implements what a drag means on a canvas — moving the node in
 * normalized canvas space, driving a simulation, and offering the node to DnD
 * drop targets — plus the keyboard equivalents (arrow-key nudging,
 * Delete/Backspace to remove).
 */
export function useCanvasDrag({
  nodeId,
  canvasRef,
  store,
  onDragEnd,
  disabled = false,
  simulation = null,
  dndItem = null,
  dndStore = null,
  onRemove = null,
}: UseCanvasDragOptions) {
  const rafRef = useRef<number | null>(null);
  const dndStartedRef = useRef(false);
  // Reactive so consumers can restyle the node while it is dragged (e.g. lift
  // it above overlapping drop targets).
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

  const handleDragStart = useCallback(
    (event: PointerEvent) => {
      setIsDragging(true);

      const targetElement =
        event.target instanceof HTMLElement ? event.target : null;
      if (dndItem && dndStore && targetElement) {
        dndStartedRef.current = true;
        const rect = targetElement.getBoundingClientRect();
        dndStore.getState().startDrag(
          {
            id: nodeId,
            type: dndItem.type,
            metadata: dndItem.metadata,
            _sourceZone: findSourceZone(targetElement),
          },
          {
            x: event.clientX,
            y: event.clientY,
            width: rect.width,
            height: rect.height,
          },
          // No preview: the canvas node itself follows the pointer.
          null,
        );
      }
    },
    [dndItem, dndStore, nodeId],
  );

  const handleDragMove = useCallback(
    (event: PointerEvent) => {
      const { clientX, clientY } = event;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        const pos = screenToNormalized(clientX, clientY);
        store.getState().setPosition(nodeId, pos);
        simulation?.moveNode(nodeId, pos);
        if (dndStartedRef.current && dndStore) {
          dndStore.getState().updateDragPosition(clientX, clientY);
        }
        rafRef.current = null;
      });
    },
    [dndStore, nodeId, screenToNormalized, simulation, store],
  );

  const handleDragEnd = useCallback(
    (_event: PointerEvent, info: NodeDragEndInfo) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      let droppedOnDndTarget = false;
      if (dndStartedRef.current && dndStore) {
        const dndState = dndStore.getState();
        // A cancelled pointer must not commit a drop.
        if (info.cancelled) {
          dndState.setActiveDropTarget(null);
        } else {
          droppedOnDndTarget = dndState.activeDropTargetId !== null;
        }
        // Triggers the active target's onDrop via its isDragging subscription.
        dndState.endDrag();
      }
      dndStartedRef.current = false;

      const pos = store.getState().positions.get(nodeId);
      if (pos) {
        simulation?.releaseNode(nodeId);
        // When a drop target claimed the node, its onDrop owns the outcome —
        // persisting the canvas position here would race with it.
        if (!droppedOnDndTarget) {
          onDragEnd?.(nodeId, pos);
        }
      }

      setIsDragging(false);
    },
    [dndStore, nodeId, onDragEnd, simulation, store],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      const pos = store.getState().positions.get(nodeId);
      if (!pos) return;

      let newPos: { x: number; y: number } | null = null;

      switch (e.key) {
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
    [disabled, nodeId, store, simulation, onDragEnd, onRemove],
  );

  return {
    dragProps: {
      onDragStart: handleDragStart,
      onDragMove: handleDragMove,
      onDragEnd: handleDragEnd,
      onKeyDown,
    },
    isDragging,
  };
}
