import type { ReactNode } from 'react';
import { useFocused } from 'slate-react';

import { cx } from '~/utils/cva';

type RichTextContainerProps = {
  children: ReactNode;
  hasError?: boolean;
};

const RichTextContainer = ({
  children,
  hasError = false,
}: RichTextContainerProps) => {
  const focused = useFocused();

  return (
    <div
      data-active={focused ? '' : undefined}
      className={cx(
        'group bg-input overflow-hidden rounded-t-sm',
        hasError ? 'border-error border-2' : 'border-border border',
      )}
    >
      {children}
    </div>
  );
};

export default RichTextContainer;
