import { type ReactNode, useId, useState } from 'react';

import { ARCHITECT_URL } from '../handoff/architectUrl.ts';
import { ghostButton } from './buttonStyles.ts';
import { ArrowUpRightIcon, CloseIcon, MenuIcon } from './Icons.tsx';
import { LogoMark } from './Logo.tsx';

type Props = {
  // The start page shows the byline and site navigation; task screens show
  // `action` (Cancel, New study) instead.
  home?: boolean;
  lab?: boolean;
  action?: ReactNode;
  onHome?: () => void;
};

const navLink =
  'text-[0.9375rem] text-night-text no-underline hover:text-white inline-flex min-h-11 items-center';

const NavLinks = () => (
  <>
    <a className={navLink} href="#how">
      How it works
    </a>
    <a className={navLink} href="https://documentation.networkcanvas.com">
      Documentation
    </a>
    <a className={ghostButton} href={ARCHITECT_URL}>
      Open Architect
      <ArrowUpRightIcon size={16} />
    </a>
  </>
);

export const SiteHeader = ({
  home = false,
  lab = false,
  action,
  onHome,
}: Props) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  return (
    <header className="mx-auto w-full max-w-[1344px] px-4 pt-4 pb-2 sm:px-8 sm:py-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <a
          href="/"
          onClick={(event) => {
            if (!onHome) return;
            event.preventDefault();
            onHome();
          }}
          className="flex items-center gap-3 text-white no-underline hover:text-white"
        >
          <span className="hidden sm:block">
            <LogoMark />
          </span>
          <span className="sm:hidden">
            <LogoMark size={38} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[1.45rem] font-black tracking-[-0.01em] sm:text-[1.625rem]">
              Sketch
            </span>
            {home && (
              <span className="text-night-muted mt-[5px] hidden text-xs sm:block">
                by Network Canvas
              </span>
            )}
          </span>
          {lab && (
            <span className="bg-mustard text-night rounded-lg px-2.5 py-1 text-xs font-extrabold tracking-[0.06em] uppercase">
              Lab
            </span>
          )}
        </a>

        {home ? (
          <>
            <nav
              aria-label="Main"
              className="hidden flex-wrap items-center gap-x-7 gap-y-2 sm:flex"
            >
              <NavLinks />
            </nav>
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={menuOpen ? 'Close menu' : 'Menu'}
              onClick={() => setMenuOpen((open) => !open)}
              className="border-night-outline grid size-11 cursor-pointer place-items-center rounded-[14px] border-[1.5px] bg-transparent text-white sm:hidden"
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </>
        ) : (
          action
        )}
      </div>
      {home && menuOpen && (
        <nav
          id={menuId}
          aria-label="Main"
          className="border-night-line bg-night-panel mt-3 flex flex-col items-start gap-1 rounded-3xl border p-4 sm:hidden"
        >
          <NavLinks />
        </nav>
      )}
    </header>
  );
};
