'use client';

import { useDirection } from '@base-ui/react/direction-provider';
import { Menu, Settings, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Modal from '@codaco/fresco-ui/Modal';
import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { logout } from '~/actions/auth';
import SubmitButton from '~/components/SubmitButton';
import FrescoLocaleSwitcher from '~/i18n/FrescoLocaleSwitcher';

const messages = defineMessages({
  interviews: {
    id: 'fresco.MobileNavDrawer.interviews',
    defaultMessage: 'Interviews',
    description:
      'Link in the mobile navigation menu of the dashboard that opens the Interviews page, where the researcher sees and exports recorded interviews.',
  },

  participants: {
    id: 'fresco.MobileNavDrawer.participants',
    defaultMessage: 'Participants',
    description:
      'Link in the mobile navigation menu of the dashboard that opens the Participants page, where the researcher manages study participants.',
  },

  protocols: {
    id: 'fresco.MobileNavDrawer.protocols',
    defaultMessage: 'Protocols',
    description:
      'Link in the mobile navigation menu of the dashboard that opens the Protocols page, where the researcher uploads and manages interview protocols.',
  },

  dashboard: {
    id: 'fresco.MobileNavDrawer.dashboard',
    defaultMessage: 'Dashboard',
    description:
      'Link in the mobile navigation menu that opens the dashboard home page, which gives an overview of the installation.',
  },

  openNavigationMenu: {
    id: 'fresco.MobileNavDrawer.openNavigationMenu',
    defaultMessage: 'Open navigation menu',
    description:
      'Accessible name of the menu icon button in the dashboard header on small screens; it opens the navigation menu. Read only by screen readers.',
  },
  mobileNavigation: {
    id: 'fresco.MobileNavDrawer.mobileNavigation',
    defaultMessage: 'Mobile navigation',
    description:
      'Accessible name of the slide-out navigation menu shown on small screens and of the navigation landmark inside it. Read only by screen readers.',
  },
  closeNavigationMenu: {
    id: 'fresco.MobileNavDrawer.closeNavigationMenu',
    defaultMessage: 'Close navigation menu',
    description:
      'Accessible name of the X button at the top of the mobile navigation menu that closes it. Read only by screen readers.',
  },
  settings: {
    id: 'fresco.MobileNavDrawer.settings',
    defaultMessage: 'Settings',
    description:
      'Link with a gear icon in the mobile navigation menu that opens the Settings page for the installation.',
  },
  signOut: {
    id: 'fresco.MobileNavDrawer.signOut',
    defaultMessage: 'Sign out',
    description:
      'Button at the bottom of the mobile navigation menu that signs the researcher out of Fresco.',
  },
});

type NavItem = {
  label: MessageDescriptor;
  href: Route;
  icon?: React.ReactNode;
};

const navItems: NavItem[] = [
  { label: messages.dashboard, href: '/dashboard' },
  { label: messages.protocols, href: '/dashboard/protocols' },
  { label: messages.participants, href: '/dashboard/participants' },
  { label: messages.interviews, href: '/dashboard/interviews' },
];

const mobileNavItemClassName =
  'focusable flex min-h-[44px] w-full items-center gap-3 rounded-lg px-4 py-3 text-lg font-semibold transition-colors';

const MobileNavLink = ({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) => {
  const intl = useAppIntl();

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cx(
        mobileNavItemClassName,
        isActive
          ? 'bg-sea-green/20 text-sea-green'
          : 'hover:bg-surface-1-contrast/10',
      )}
    >
      {item.icon}
      {intl.formatMessage(item.label)}
    </Link>
  );
};

export function MobileNavDrawer() {
  const intl = useAppIntl();

  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const handleClose = () => setOpen(false);
  // The menu is drawn against the end edge of the screen and slides in from
  // beyond it: from the right, or from the left in a right-to-left language.
  // Motion animates a physical distance, so its sign comes from the direction.
  const beyondEndEdge = useDirection() === 'rtl' ? '-100%' : '100%';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={intl.formatMessage(messages.openNavigationMenu)}
        aria-expanded={open}
        className="focusable rounded-lg p-2 hover:bg-white/10"
      >
        <Menu className="size-6" />
      </button>

      <Modal open={open} onOpenChange={setOpen}>
        <ModalPopup
          aria-label={intl.formatMessage(messages.mobileNavigation)}
          className={cx(
            'fixed inset-e-0 top-0 h-full w-80 max-w-[85vw]',
            'bg-surface-1 text-surface-1-contrast shadow-xl',
          )}
          initial={{ x: beyondEndEdge, opacity: 0.99 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: beyondEndEdge, opacity: 0.99 }}
          transition={{ type: 'tween', duration: 0.3 }}
        >
          <nav
            aria-label={intl.formatMessage(messages.mobileNavigation)}
            className="flex h-full flex-col"
          >
            <div className="border-surface-1-contrast/10 flex items-center justify-end border-b p-4">
              <button
                type="button"
                onClick={handleClose}
                aria-label={intl.formatMessage(messages.closeNavigationMenu)}
                className="focusable hover:bg-surface-1-contrast/10 rounded-lg p-2"
              >
                <X className="size-6" />
              </button>
            </div>

            <motion.ul className="flex flex-1 flex-col gap-1 p-4">
              {navItems.map((item) => (
                <li key={item.href}>
                  <MobileNavLink
                    item={item}
                    isActive={pathname === item.href}
                    onClick={handleClose}
                  />
                </li>
              ))}

              <li className="border-surface-1-contrast/10 my-2 border-t" />

              <li>
                <MobileNavLink
                  item={{
                    label: messages.settings,
                    href: '/dashboard/settings',
                    icon: <Settings className="size-5" />,
                  }}
                  isActive={pathname === '/dashboard/settings'}
                  onClick={handleClose}
                />
              </li>

              <li>
                <FrescoLocaleSwitcher
                  display="label"
                  renderTrigger={
                    // Named by the switcher, which sets the language on it at runtime.
                    // oxlint-disable-next-line jsx-a11y/control-has-associated-label
                    <button
                      type="button"
                      className={cx(
                        mobileNavItemClassName,
                        'hover:bg-surface-1-contrast/10 data-popup-open:bg-surface-1-contrast/10 cursor-pointer [&>svg]:size-5',
                      )}
                    />
                  }
                />
              </li>
            </motion.ul>

            <div className="border-surface-1-contrast/10 border-t p-4">
              <form action={() => void logout()}>
                <SubmitButton
                  color="secondary"
                  type="submit"
                  className="w-full"
                >
                  {intl.formatMessage(messages.signOut)}
                </SubmitButton>
              </form>
            </div>
          </nav>
        </ModalPopup>
      </Modal>
    </>
  );
}
