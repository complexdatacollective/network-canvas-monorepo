import { motion, useReducedMotion } from 'motion/react';
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
}: ActionToolbarProps) => {
  const shouldReduceMotion = useReducedMotion();
  const layout = shouldReduceMotion ? false : true;

  return (
    <div className="phone-landscape:px-6 pointer-events-none fixed inset-x-0 bottom-5 z-20 px-4 print:hidden">
      <div className="mx-auto flex max-w-7xl justify-end">
        <motion.div
          layout={layout}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className={cx(NAV_SURFACE, 'overflow-hidden rounded-full')}
        >
          <motion.div
            layout={layout}
            role="toolbar"
            aria-label={ariaLabel}
            className={cx(
              'phone-landscape:px-3 flex items-center gap-2.5 py-3 pr-3 pl-2',
              // Shrink buttons to size="small" equivalent below tablet-portrait.
              'max-tablet-portrait:[&_button]:h-8 max-tablet-portrait:[&_button]:text-xs',
              'max-tablet-portrait:[&_button.aspect-square]:w-8',
              'max-tablet-portrait:[&_button:not(.aspect-square)]:px-4',
              className,
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default ActionToolbar;
