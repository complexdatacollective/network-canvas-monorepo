import {
  SegmentedToolbar,
  type ToolbarSegment,
} from '@codaco/fresco-ui/SegmentedToolbar';
import { cx } from '~/utils/cva';

type ActionToolbarProps = {
  'items': ToolbarSegment[];
  'leadingItems'?: ToolbarSegment[];
  'className'?: string;
  'aria-label'?: string;
  'leadingAriaLabel'?: string;
};

const ActionToolbar = ({
  items,
  leadingItems = [],
  className,
  'aria-label': ariaLabel = 'Page actions',
  leadingAriaLabel = 'History actions',
}: ActionToolbarProps) => {
  const hasLeadingItems = leadingItems.length > 0;

  return (
    <div className="phone-landscape:px-6 pointer-events-none fixed inset-x-0 bottom-5 z-20 px-4 print:hidden">
      <div
        className={cx(
          'mx-auto flex max-w-7xl items-end gap-2',
          hasLeadingItems
            ? 'flex-col-reverse sm:flex-row sm:justify-between'
            : 'justify-end',
        )}
      >
        {hasLeadingItems && (
          <SegmentedToolbar
            label={leadingAriaLabel}
            items={leadingItems}
            size="md"
            className="pointer-events-auto self-start"
          />
        )}
        <SegmentedToolbar
          label={ariaLabel}
          items={items}
          size="md"
          className={cx('pointer-events-auto self-end', className)}
        />
      </div>
    </div>
  );
};

export default ActionToolbar;
