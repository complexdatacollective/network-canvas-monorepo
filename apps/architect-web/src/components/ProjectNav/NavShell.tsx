import { motion, useReducedMotion, type Variants } from 'motion/react';
import type React from 'react';

import Brand from '~/components/Brand';
import { useReturnToStartDialog } from '~/hooks/useReturnToStartDialog';
import { cx } from '~/utils/cva';

export const NAV_SURFACE =
  'pointer-events-auto bg-fresco-purple text-fresco-purple-foreground shadow-lg';

const containerVariants: Variants = {
  hidden: {
    y: '-150%',
  },
  visible: {
    y: 0,
    transition: {
      type: 'spring',
      delayChildren: 0.5,
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: '-100%' },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
    },
  },
};

type NavShellProps = {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

const NavShell = ({ leading, trailing }: NavShellProps) => {
  const handleReturnToStart = useReturnToStartDialog();
  const shouldReduceMotion = useReducedMotion();
  return (
    <header className="pointer-events-none sticky top-0 z-(--z-global-ui) w-full px-4 py-(--space-md) sm:px-6 print:static print:hidden">
      <motion.div
        className={cx(
          NAV_SURFACE,
          'mx-auto flex max-w-7xl flex-wrap items-center gap-(--space-md) rounded-full py-3 pr-6 pl-3 sm:pr-10 sm:pl-4',
        )}
        variants={containerVariants}
        initial={shouldReduceMotion ? false : 'hidden'}
        animate="visible"
      >
        <div className="flex min-w-0 flex-1 items-center justify-start gap-(--space-md)">
          <motion.div variants={itemVariants}>
            <Brand variant="icon" onClick={handleReturnToStart} />
          </motion.div>
          {leading}
        </div>
        {trailing && (
          <div className="flex shrink-0 items-center gap-(--space-md)">
            {trailing}
          </div>
        )}
      </motion.div>
    </header>
  );
};

export default NavShell;
