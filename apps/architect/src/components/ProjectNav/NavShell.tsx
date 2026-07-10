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

import { IconButton } from '@codaco/fresco-ui/Button';
import Modal from '@codaco/fresco-ui/Modal';
import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
import Brand from '~/components/Brand';
import { useRunOnce } from '~/hooks/useRunOnce';
import { cx } from '~/utils/cva';

const NAV_SURFACE =
  'effect-shadow-md pointer-events-auto bg-fresco-purple text-fresco-purple-contrast';

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
  const shouldReduceMotion = useReducedMotion();
  const isFirstMount = useRunOnce('nav-bar-entrance');
  const animate = !shouldReduceMotion && isFirstMount;
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeMenuFromLinkEvent = useCallback(
    (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      if (target.closest('a')) {
        closeMenu();
      }
    },
    [closeMenu],
  );
  const inlineLayoutId = useId();
  const drawerLayoutId = useId();

  const isAtStart = location === '/';
  const handleReturnToStart = useCallback(
    () => setLocation('/'),
    [setLocation],
  );

  return (
    <header className="phone-landscape:px-6 pointer-events-none sticky top-0 z-20 w-full px-4 py-5 print:static print:hidden">
      <motion.div
        className={cx(
          NAV_SURFACE,
          'phone-landscape:pr-10 phone-landscape:pl-6 mx-auto flex max-w-7xl flex-wrap items-center gap-5 rounded-full py-3 pr-6 pl-6',
        )}
        variants={containerVariants}
        initial={animate ? 'hidden' : false}
        animate="visible"
      >
        <div className="flex min-w-0 flex-1 items-center justify-start gap-5">
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
              <div className="tablet-portrait:flex tablet-landscape:gap-10 hidden shrink-0 items-center gap-7">
                {trailing}
              </div>
            </LayoutGroup>
            <IconButton
              variant="text"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              icon={<Menu />}
              className="tablet-portrait:hidden"
            />
            <Modal open={menuOpen} onOpenChange={setMenuOpen}>
              <ModalPopup
                className="bg-surface-1 text-surface-1-contrast fixed top-0 right-0 z-3000 flex h-full w-80 max-w-[85vw] flex-col rounded shadow-xl"
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
                    <div
                      role="presentation"
                      onClick={(event) => {
                        closeMenuFromLinkEvent(event.target);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          closeMenuFromLinkEvent(event.target);
                        }
                      }}
                      className="[&_a]:focusable [&_a]:hover:bg-surface-1-contrast/10 [&_a[aria-current=page]]:bg-sea-green/20 [&_a[aria-current=page]]:text-sea-green flex flex-1 flex-col items-start gap-1 p-4 [&_a]:flex [&_a]:min-h-11 [&_a]:w-full [&_a]:items-center [&_a]:gap-3 [&_a]:rounded-lg [&_a]:px-4 [&_a]:py-3 [&_a]:text-lg [&_a]:font-semibold [&_a]:no-underline [&_a]:transition-colors [&_a>[aria-hidden]]:hidden"
                    >
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
