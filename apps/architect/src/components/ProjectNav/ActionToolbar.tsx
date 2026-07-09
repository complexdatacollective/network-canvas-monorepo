import type { ReactNode } from 'react';

import {
  SegmentedToolbar,
  type ToolbarSegment,
} from '@codaco/fresco-ui/SegmentedToolbar';
import { cx } from '~/utils/cva';

type ActionToolbarProps = {
  'items': ToolbarSegment[];
  'children'?: ReactNode;
  'className'?: string;
  'aria-label'?: string;
};

const ActionToolbar = ({
  items,
  children,
  className,
  'aria-label': ariaLabel = 'Page actions',
}: ActionToolbarProps) => {
  return (
    <div className="phone-landscape:px-6 pointer-events-none fixed inset-x-0 bottom-5 z-20 px-4 print:hidden">
      <div className="mx-auto flex max-w-7xl justify-end gap-2">
        <SegmentedToolbar
          label={ariaLabel}
          items={items}
          size="md"
          className={cx('pointer-events-auto', className)}
        />
        {children ? (
          <div className="pointer-events-auto flex items-center">
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ActionToolbar;
