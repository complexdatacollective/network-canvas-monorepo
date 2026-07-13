import type { ComponentProps } from 'react';

import Node, {
  type NodeColorSequence,
  type NodeShape,
} from '@codaco/fresco-ui/Node';
import { cx } from '~/utils/cva';

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
  return (
    <div className={cx(onClick && 'cursor-pointer')}>
      <Node
        {...buttonProps}
        label={label}
        ariaLabel={
          buttonProps.role === 'radio' ? `Select node ${label}` : undefined
        }
        selected={selected}
        color={color as NodeColorSequence}
        shape={shape}
        size={size}
        onClick={onClick}
        className={className}
      />
    </div>
  );
};

export default PreviewNode;
