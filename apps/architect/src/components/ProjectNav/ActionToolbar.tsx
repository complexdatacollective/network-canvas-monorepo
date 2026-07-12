import {
  SegmentedToolbar,
  type ToolbarSegment,
} from '@codaco/fresco-ui/SegmentedToolbar';
import { cx } from '~/utils/cva';

type ActionToolbarProps = {
  'items': ToolbarSegment[];
  'className'?: string;
  'aria-label'?: string;
};

const ActionToolbar = ({
  items,
  className,
  'aria-label': ariaLabel = 'Page actions',
}: ActionToolbarProps) => {
  return (
    <div className="phone-landscape:px-6 pointer-events-none fixed inset-x-0 bottom-5 z-20 px-4 print:hidden">
      <div className="mx-auto flex max-w-7xl justify-end">
        <SegmentedToolbar
          label={ariaLabel}
          items={items}
          size="md"
          className={cx('pointer-events-auto', className)}
        />
      </div>
    </div>
  );
};

export default ActionToolbar;
