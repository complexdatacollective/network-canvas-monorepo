import type React from 'react';

import { cx } from '~/utils/cva';

import { NAV_SURFACE } from './NavShell';

type ActionToolbarProps = {
  'children': React.ReactNode;
  'className'?: string;
  'aria-label'?: string;
};

const ActionToolbar = ({
  children,
  className,
  'aria-label': ariaLabel = 'Page actions',
}: ActionToolbarProps) => (
  <div className="pointer-events-none fixed inset-x-0 bottom-(--space-md) z-(--z-global-ui) px-4 sm:px-6 print:hidden">
    <div className="mx-auto flex max-w-7xl justify-end">
      <div className={cx(NAV_SURFACE, 'overflow-hidden rounded-full')}>
        <div
          role="toolbar"
          aria-label={ariaLabel}
          className={cx(
            'flex items-center gap-(--space-sm) px-(--space-sm) py-(--space-xs)',
            className,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  </div>
);

export default ActionToolbar;
