import { type RefObject, useCallback, useMemo, useRef } from 'react';
import type { StoreApi } from 'zustand';

import type { DndStore } from '@codaco/fresco-ui/dnd/dnd';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import Node from '../components/ConnectedNode';
import { type ActivationSource, useCanvasDrag } from './useCanvasDrag';
import { type CanvasStoreApi, useCanvasStore } from './useCanvasStore';

type CanvasNodeProps = {
  node: NcNode;
  canvasRef: RefObject<HTMLElement | null>;
  store: CanvasStoreApi;
  onDragEnd?: (nodeId: string, position: { x: number; y: number }) => void;
  onSelect?: (nodeId: string, source: ActivationSource) => void;
  selected?: boolean;
  linking?: boolean;
  highlighted?: boolean;
  /**
   * Whether the node currently reads as "on" for whatever the canvas's active
   * mode makes it mean — selected, highlighted, the source of a pending edge,
   * or a member of the active group. Only the canvas knows which of those is
   * in play, so it is declared rather than inferred here. Omitted entirely for
   * a canvas whose nodes are not a toggle.
   */
  pressed?: boolean;
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
  pressed,
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

  // The canvas synthesises its tap from pointer-up rather than the DOM click
  // the node itself suppresses, so a hold that revealed the label has to be
  // withdrawn here or reading a name would also select the person.
  const labelRevealedRef = useRef(false);

  const handleLabelReveal = useCallback(() => {
    labelRevealedRef.current = true;
  }, []);

  const consumeLabelReveal = useCallback(() => {
    const revealed = labelRevealedRef.current;
    labelRevealedRef.current = false;
    return revealed;
  }, []);

  const handleClick = useCallback(
    (source: ActivationSource) => {
      onSelect?.(nodeId, source);
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

  const { dragProps, isDragging } = useCanvasDrag({
    nodeId,
    canvasRef,
    store,
    onDragEnd,
    onClick: handleClick,
    disabled: disabled || !allowRepositioning,
    simulation,
    dndItem,
    dndStore,
    onRemove,
    shouldSuppressTap: consumeLabelReveal,
  });

  if (!position) return null;

  const { style: dragStyle, ...restDragProps } = dragProps;

  return (
    <Node
      nodeId={nodeId}
      type={node.type}
      selected={selected}
      linking={linking}
      highlighted={highlighted}
      disabled={disabled}
      size="sm"
      onLabelReveal={handleLabelReveal}
      // A canvas node routes its tap through useCanvasDrag rather than an
      // `onClick` prop, so Node cannot infer that it is interactive and would
      // default it out of the tab order. Focusability follows the node's own
      // disabled state, not whether it happens to be repositionable: a node
      // that cannot be moved can still be selected, and its name still has to
      // be readable.
      tabIndex={disabled ? -1 : 0}
      // Node cannot infer the toggle state either, so it comes from the canvas.
      aria-pressed={pressed}
      // While dragged, lift the node above overlapping drop targets
      // (the unplaced-node drawer sits at z-10).
      className={cx('absolute outline-offset-8!', isDragging && 'z-20')}
      style={{
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        ...dragStyle,
      }}
      {...restDragProps}
    />
  );
}
