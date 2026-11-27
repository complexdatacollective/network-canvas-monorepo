'use client';

import { useDragSource } from '@codaco/fresco-ui/dnd/dnd';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { ConnectedMotionNode } from '../../components/ConnectedNode';
import { useNodeLabel } from '../Anonymisation/useNodeLabel';

type DrawerNodeProps = {
  node: NcNode;
  itemType?: string;
  onLayoutAnimationComplete?: () => void;
  /** False shows the person without letting them be dragged. */
  draggable?: boolean;
  selected?: boolean;
  /** A disabled person is dimmed and can be neither dragged nor tapped. */
  disabled?: boolean;
  /** Called when a person who cannot be dragged is tapped. */
  onClick?: (node: NcNode) => void;
};

export default function DrawerNode({
  node,
  itemType = 'UNPOSITIONED_NODE',
  onLayoutAnimationComplete,
  draggable = true,
  selected,
  disabled = false,
  onClick,
}: DrawerNodeProps) {
  const nodeId = node[entityPrimaryKeyProperty];
  // A drag names the person by the label the drawer shows them with.
  const label = useNodeLabel(node);

  const { dragProps } = useDragSource({
    type: itemType,
    metadata: { ...node, nodeId, id: nodeId },
    announcedName: label,
    disabled: !draggable || disabled,
  });

  return (
    <ConnectedMotionNode
      layout
      onLayoutAnimationComplete={onLayoutAnimationComplete}
      nodeId={nodeId}
      type={node.type}
      {...(disabled
        ? null
        : draggable
          ? dragProps
          : { onClick: onClick ? () => onClick(node) : undefined })}
      size="sm"
      selected={selected}
      disabled={disabled}
    />
  );
}
