'use client';

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

const messages = defineMessages({
  interviews: {
    id: 'fresco.MobileNavDrawer.interviews',
    defaultMessage: 'Interviews',
    description: 'Researcher-facing MobileNavDrawer: Interviews',
  },

  participants: {
    id: 'fresco.MobileNavDrawer.participants',
    defaultMessage: 'Participants',
    description: 'Researcher-facing MobileNavDrawer: Participants',
  },

  protocols: {
    id: 'fresco.MobileNavDrawer.protocols',
    defaultMessage: 'Protocols',
    description: 'Researcher-facing MobileNavDrawer: Protocols',
  },

  dashboard: {
    id: 'fresco.MobileNavDrawer.dashboard',
    defaultMessage: 'Dashboard',
    description: 'Researcher-facing MobileNavDrawer: Dashboard',
  },

  openNavigationMenu: {
    id: 'fresco.MobileNavDrawer.openNavigationMenu',
    defaultMessage: 'Open navigation menu',
    description: 'Researcher-facing MobileNavDrawer: Open navigation menu',
  },
  mobileNavigation: {
    id: 'fresco.MobileNavDrawer.mobileNavigation',
    defaultMessage: 'Mobile navigation',
    description: 'Researcher-facing MobileNavDrawer: Mobile navigation',
  },
  closeNavigationMenu: {
    id: 'fresco.MobileNavDrawer.closeNavigationMenu',
    defaultMessage: 'Close navigation menu',
    description: 'Researcher-facing MobileNavDrawer: Close navigation menu',
  },
  settings: {
    id: 'fresco.MobileNavDrawer.settings',
    defaultMessage: 'Settings',
    description: 'Researcher-facing MobileNavDrawer: Settings',
  },
  signOut: {
    id: 'fresco.MobileNavDrawer.signOut',
    defaultMessage: 'Sign out',
    description: 'Researcher-facing MobileNavDrawer: Sign out',
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
        'focusable flex min-h-[44px] items-center gap-3 rounded-lg px-4 py-3 text-lg font-semibold transition-colors',
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
            'fixed top-0 right-0 h-full w-80 max-w-[85vw]',
            'bg-surface-1 text-surface-1-contrast shadow-xl',
          )}
          initial={{ x: '100%', opacity: 0.99 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0.99 }}
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
