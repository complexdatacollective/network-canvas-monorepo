import { Menu, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { IconButton } from '~/lib/legacy-ui/components/Button';
import { appVersion } from '~/utils/appVersion';

import Badge from '../Badge';
import Brand from '../Brand';
import Modal from '../NewComponents/Modal';
import ModalPopup from '../NewComponents/ModalPopup';

type NavLinkProps = {
  href: string;
  onClick?: () => void;
  children: React.ReactNode;
};

const NavLink = ({ href, onClick, children }: NavLinkProps) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    onClick={onClick}
    className="nav-link"
  >
    {children}
  </a>
);

const NAV_LINKS = [
  { href: 'https://documentation.networkcanvas.com', label: 'Docs' },
  { href: 'https://community.networkcanvas.com', label: 'Community' },
  { href: 'https://github.com/complexdatacollective', label: 'GitHub' },
];

const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <header className="mx-auto flex w-full max-w-6xl justify-between px-4 py-6 sm:gap-8 sm:px-6 sm:py-8">
      <Brand />

      <div className="flex items-center gap-6 lg:gap-12">
        <nav className="hidden items-center gap-6 md:flex lg:gap-10">
          {NAV_LINKS.map(({ href, label }) => (
            <NavLink key={href} href={href}>
              {label}
            </NavLink>
          ))}
        </nav>

        <Badge color="white" className="hidden sm:inline-flex">
          <span className="bg-active h-2 w-2 rounded-full" />v{appVersion}
        </Badge>

        <IconButton
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          color="white"
          icon={<Menu />}
          className="shadow-sm md:hidden"
        />
      </div>

      <Modal open={menuOpen} onOpenChange={setMenuOpen}>
        <ModalPopup
          className="bg-surface-1 text-surface-1-foreground fixed top-0 right-0 flex h-full w-80 max-w-[85vw] flex-col shadow-xl"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'tween', duration: 0.3 }}
        >
          <nav aria-label="Mobile navigation" className="flex h-full flex-col">
            <div className="flex items-center justify-end p-4">
              <IconButton
                onClick={closeMenu}
                aria-label="Close menu"
                color="white"
                icon={<X />}
                className="shadow-sm"
              />
            </div>
            <ul className="flex flex-1 flex-col gap-4 p-6">
              {NAV_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <NavLink href={href} onClick={closeMenu}>
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </ModalPopup>
      </Modal>
    </header>
  );
};

export default Header;
