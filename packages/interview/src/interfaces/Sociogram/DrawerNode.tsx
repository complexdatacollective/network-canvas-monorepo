'use client';

import { useDragSource } from '@codaco/fresco-ui/dnd/dnd';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { ConnectedMotionNode } from '../../components/ConnectedNode';
import { useNodeLabel } from '../Anonymisation/useNodeLabel';

type DrawerNodeProps = {
  node: NcNode;
  itemType?: string;
  onLayoutAnimationComplete?: () => void;
};

export default function DrawerNode({
  node,
  itemType = 'UNPOSITIONED_NODE',
  onLayoutAnimationComplete,
}: DrawerNodeProps) {
  const nodeId = node[entityPrimaryKeyProperty];
  // A drag names the person by the label the drawer shows them with.
  const label = useNodeLabel(node);

  const { dragProps } = useDragSource({
    type: itemType,
    metadata: { ...node, nodeId, id: nodeId },
    announcedName: label,
  });

  return (
    <ConnectedMotionNode
      layout
      onLayoutAnimationComplete={onLayoutAnimationComplete}
      nodeId={nodeId}
      type={node.type}
      {...dragProps}
      size="sm"
    />
  );
}
