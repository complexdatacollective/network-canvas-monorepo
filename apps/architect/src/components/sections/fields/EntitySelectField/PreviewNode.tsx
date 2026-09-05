import type { ComponentProps } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Node, {
  type NodeColorSequence,
  type NodeShape,
} from '@codaco/fresco-ui/Node';
const extraMessages = defineMessages({
  selectNode: {
    id: 'architect.entityPreview.selectNode',
    defaultMessage: 'Select node {label}',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

type NodeSize = ComponentProps<typeof Node>['size'];

type PreviewNodeProps = Omit<
  ComponentProps<typeof Node>,
  'label' | 'color' | 'shape' | 'size' | 'selected'
> & {
  label: string;
  color?: string;
  shape?: NodeShape;
  size?: NodeSize;
  selected?: boolean;
};

/**
 * A codebook entity type drawn as a node.
 *
 * There is deliberately no wrapper element: the node is the whole component,
 * so it can be a flex item where a caller lays one out, and phrasing content
 * where a caller (a rule card) puts one inside a control. `Node` renders its
 * own pointer cursor from the presence of `onClick`, so a wrapper never had
 * anything to add.
 */
const PreviewNode = ({
  label,
  color = 'node-color-seq-1',
  shape = 'circle',
  size = 'sm',
  onClick,
  selected = false,
  className,
  ...buttonProps
}: PreviewNodeProps) => {
  const intl = useAppIntl();
  return (
    <Node
      {...buttonProps}
      label={label}
      ariaLabel={
        buttonProps.role === 'radio'
          ? intl.formatMessage(extraMessages.selectNode, { label })
          : undefined
      }
      selected={selected}
      color={color as NodeColorSequence}
      shape={shape}
      size={size}
      onClick={onClick}
      className={className}
    />
  );
};

export default PreviewNode;
