import { Menu, X } from 'lucide-react';
import {
  LayoutGroup,
  motion,
  useReducedMotion,
  type Variants,
} from 'motion/react';
import type React from 'react';
import { useCallback, useId, useState } from 'react';
import { useLocation } from 'wouter';

import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
import Brand from '~/components/Brand';
import Modal from '~/components/NewComponents/Modal';
import { useReturnToStartDialog } from '~/hooks/useReturnToStartDialog';
import { useRunOnce } from '~/hooks/useRunOnce';
import { IconButton } from '~/lib/legacy-ui/components/Button';
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
  const isFirstMount = useRunOnce('nav-bar-entrance');
  const animate = !shouldReduceMotion && isFirstMount;
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const inlineLayoutId = useId();
  const drawerLayoutId = useId();

  const isAtStart = location === '/';

  return (
    <header className="pointer-events-none sticky top-0 z-(--z-global-ui) w-full px-4 py-(--space-md) sm:px-6 print:static print:hidden">
      <motion.div
        className={cx(
          NAV_SURFACE,
          'mx-auto flex max-w-7xl flex-wrap items-center gap-(--space-md) rounded-full py-3 pr-6 pl-3 sm:pr-10 sm:pl-4',
        )}
        variants={containerVariants}
        initial={animate ? 'hidden' : false}
        animate="visible"
      >
        <div className="flex min-w-0 flex-1 items-center justify-start gap-(--space-md)">
          <motion.div variants={itemVariants}>
            <Brand
              variant={isAtStart ? 'inline' : 'icon'}
              onClick={isAtStart ? undefined : handleReturnToStart}
            />
          </motion.div>
          {leading}
        </div>
        {trailing && (
          <>
            <LayoutGroup id={inlineLayoutId}>
              <div className="hidden shrink-0 items-center gap-(--space-lg) md:flex lg:gap-(--space-xl)">
                {trailing}
              </div>
            </LayoutGroup>
            <IconButton
              variant="text"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              icon={<Menu />}
              className="md:hidden"
            />
            <Modal open={menuOpen} onOpenChange={setMenuOpen}>
              <ModalPopup
                className="bg-surface-1 text-surface-1-foreground rounded-base fixed top-0 right-0 z-(--z-tooltip) flex h-full w-80 max-w-[85vw] flex-col shadow-xl"
                initial={{ x: '100%', opacity: 0.99, pointerEvents: 'none' }}
                animate={{ x: 0, opacity: 1, pointerEvents: 'auto' }}
                exit={{ x: '100%', opacity: 0.99, pointerEvents: 'none' }}
                transition={{ type: 'tween', duration: 0.3 }}
              >
                <nav
                  aria-label="Mobile navigation"
                  className="flex h-full flex-col"
                >
                  <div className="flex items-center justify-end p-4">
                    <IconButton
                      variant="text"
                      onClick={closeMenu}
                      aria-label="Close menu"
                      icon={<X />}
                    />
                  </div>
                  <LayoutGroup id={drawerLayoutId}>
                    <div className="[&_a]:focusable [&_a]:hover:bg-surface-1-foreground/10 [&_a[aria-current=page]]:bg-sea-green/20 [&_a[aria-current=page]]:text-sea-green flex flex-1 flex-col items-start gap-1 p-4 [&_a]:flex [&_a]:min-h-11 [&_a]:w-full [&_a]:items-center [&_a]:gap-3 [&_a]:rounded-lg [&_a]:px-4 [&_a]:py-3 [&_a]:text-lg [&_a]:font-semibold [&_a]:no-underline [&_a]:transition-colors [&_a>[aria-hidden]]:hidden">
                      {trailing}
                    </div>
                  </LayoutGroup>
                </nav>
              </ModalPopup>
            </Modal>
          </>
        )}
      </motion.div>
    </header>
  );
};

export default NavShell;
