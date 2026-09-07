'use client';

import { useAppIntl } from '@codaco/app-i18n/react';
import { useDragSource } from '@codaco/fresco-ui/dnd/dnd';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { ConnectedMotionNode } from '../../components/ConnectedNode';
import { interfaceMessages } from '../messages';

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
  const intl = useAppIntl();
  const nodeId = node[entityPrimaryKeyProperty];
  const rawName = node[entityAttributesProperty].name;
  const name =
    typeof rawName === 'string'
      ? rawName
      : intl.formatMessage(interfaceMessages.node);

  const { dragProps } = useDragSource({
    type: itemType,
    metadata: { ...node, nodeId, id: nodeId },
    announcedName: name,
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
