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
    <div className="pointer-events-none fixed inset-x-0 bottom-(--space-md) z-(--z-global-ui) px-4 sm:px-6 print:hidden">
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
              'flex items-center gap-(--space-sm) py-3 pr-3 pl-2 sm:px-3',
              // Shrink buttons to size="small" equivalent below md.
              'max-md:[&_button]:h-8 max-md:[&_button]:text-xs',
              'max-md:[&_button.aspect-square]:w-8',
              'max-md:[&_button:not(.aspect-square)]:px-4',
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
