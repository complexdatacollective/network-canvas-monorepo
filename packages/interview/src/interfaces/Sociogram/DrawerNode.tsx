import { useDragSource } from '@codaco/fresco-ui/dnd/dnd';
import { useShouldSkipAnimations } from '@codaco/fresco-ui/hooks/useSafeAnimate';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { ConnectedMotionNode } from '../../components/ConnectedNode';

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
  const shouldSkipAnimations = useShouldSkipAnimations();
  const nodeId = node[entityPrimaryKeyProperty];
  const rawName = node[entityAttributesProperty].name;
  const name = typeof rawName === 'string' ? rawName : 'Node';

  const { dragProps } = useDragSource({
    type: itemType,
    metadata: { ...node, nodeId, id: nodeId },
    announcedName: name,
  });

  return (
    <ConnectedMotionNode
      layout={!shouldSkipAnimations}
      onLayoutAnimationComplete={onLayoutAnimationComplete}
      nodeId={nodeId}
      type={node.type}
      {...dragProps}
      size="sm"
    />
  );
}
