import { type RefObject, useCallback, useMemo } from 'react';
import type { StoreApi } from 'zustand';

import type { DndStore } from '@codaco/fresco-ui/dnd/dnd';
import type { ActivationSource } from '@codaco/fresco-ui/Node';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import Node from '../components/ConnectedNode';
import { useCanvasDrag } from './useCanvasDrag';
import { type CanvasStoreApi, useCanvasStore } from './useCanvasStore';

/**
 * How a node was activated, with the gesture state a host may need: modifier
 * keys are only meaningful for the pointer gesture that carried them, so a
 * keyboard activation reports none.
 */
export type NodeActivationDetails = {
  source: ActivationSource;
  shiftKey: boolean;
  metaKey: boolean;
};

type CanvasNodeProps = {
  node: NcNode;
  canvasRef: RefObject<HTMLElement | null>;
  store: CanvasStoreApi;
  onDragEnd?: (nodeId: string, position: { x: number; y: number }) => void;
  /**
   * Activation. Omit it when activating a node does nothing (a display-only
   * prompt): the node then renders as no kind of toggle, takes no pointer
   * cursor, and announces no pressed state.
   */
  onSelect?: (nodeId: string, details: NodeActivationDetails) => void;
  /**
   * Whether the node reads as "on" for whatever the canvas's active mode makes
   * that mean — selection, a highlight, the source of a pending edge, or
   * membership of the active group. Only the canvas knows which is in play, so
   * it declares the state; the node renders and announces it.
   */
  selected?: boolean;
  linking?: boolean;
  highlighted?: boolean;
  disabled?: boolean;
  allowRepositioning?: boolean;
  simulation?: {
    moveNode: (nodeId: string, position: { x: number; y: number }) => void;
    releaseNode: (nodeId: string) => void;
  } | null;
  /** DnD item type registered while dragging, so drop targets can accept the node. */
  dragItemType?: string;
  /** Shared DnD store driven while dragging (required for dragItemType to take effect). */
  dndStore?: StoreApi<DndStore> | null;
  /** Keyboard equivalent of dragging the node off the canvas (Delete/Backspace). */
  onRemove?: ((nodeId: string) => void) | null;
};

export default function CanvasNode({
  node,
  canvasRef,
  store,
  onDragEnd,
  onSelect,
  selected = false,
  linking = false,
  highlighted = false,
  disabled = false,
  allowRepositioning = true,
  simulation = null,
  dragItemType,
  dndStore = null,
  onRemove = null,
}: CanvasNodeProps) {
  const nodeId = node[entityPrimaryKeyProperty];

  const position = useCanvasStore(store, (state) =>
    state.positions.get(nodeId),
  );

  const handleClick = useCallback(
    (
      event: React.MouseEvent<HTMLButtonElement>,
      details?: { source: ActivationSource },
    ) => {
      const source = details?.source ?? 'pointer';
      onSelect?.(nodeId, {
        source,
        // A keyboard activation carries no pointer gesture, so it carries no
        // modifiers either — applying held keys would turn a plain Enter into
        // a modified selection.
        shiftKey: source === 'pointer' && event.shiftKey,
        metaKey: source === 'pointer' && event.metaKey,
      });
    },
    [onSelect, nodeId],
  );

  // Metadata mirrors DrawerNode's drag source so drop handlers can treat
  // canvas-originated and drawer-originated nodes uniformly.
  const dndItem = useMemo(
    () =>
      dragItemType
        ? { type: dragItemType, metadata: { ...node, nodeId, id: nodeId } }
        : null,
    [dragItemType, node, nodeId],
  );

  const canReposition = !disabled && allowRepositioning;

  const { dragProps, isDragging } = useCanvasDrag({
    nodeId,
    canvasRef,
    store,
    onDragEnd,
    disabled: !canReposition,
    simulation,
    dndItem,
    dndStore,
    onRemove,
  });

  if (!position) return null;

  const { onKeyDown, ...dragHandlers } = dragProps;

  return (
    <Node
      nodeId={nodeId}
      type={node.type}
      selected={selected}
      linking={linking}
      highlighted={highlighted}
      disabled={disabled}
      size="sm"
      onClick={onSelect ? handleClick : undefined}
      // Declaring drag handlers makes Node the drag's gesture owner — cursor,
      // pointer capture, aria-grabbed, and never-also-a-tap all follow.
      {...(canReposition ? dragHandlers : null)}
      // The keyboard handler is the node's claim to a tab stop, so it is only
      // passed while its actions (nudging, Delete) can actually run.
      onKeyDown={canReposition ? onKeyDown : undefined}
      // The canvas itself watches pointer-down for background taps and lasso
      // starts; a press on a node is neither.
      onPointerDown={stopPropagation}
      // While dragged, lift the node above overlapping drop targets
      // (the unplaced-node drawer sits at z-10).
      className={cx('absolute outline-offset-8!', isDragging && 'z-20')}
      style={{
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        // The independent `translate` property, not `transform`: the press
        // animation writes `transform: scale(...)` on this same element, and a
        // transform-based centering would be replaced by it — shifting the
        // node by half its size on every press. Separate properties compose.
        translate: '-50% -50%',
      }}
    />
  );
}

function stopPropagation(event: React.PointerEvent) {
  event.stopPropagation();
}
