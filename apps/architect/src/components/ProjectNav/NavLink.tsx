import { NavigationMenu } from '@base-ui/react/navigation-menu';
import type { ReactNode } from 'react';

import { cx } from '~/utils/cva';

/** The look of every control in the header's navigation list. */
export const NAV_ITEM_CLASS_NAME =
  'relative inline-flex cursor-pointer items-center text-base leading-none font-semibold text-current no-underline transition-colors';

type NavLinkProps = {
  href: string;
  children: ReactNode;
  /** The destination being shown; it keeps its color on hover. */
  active?: boolean;
  /** Renders the anchor, for a router link; a plain `<a>` otherwise. */
  render?: NavigationMenu.Link.Props['render'];
  target?: string;
  rel?: string;
};

/** One destination in `NavShell`'s navigation list. */
const NavLink = ({ active = false, ...props }: NavLinkProps) => (
  <NavigationMenu.Link
    active={active}
    className={cx(NAV_ITEM_CLASS_NAME, !active && 'hover:text-action')}
    {...props}
  />
);

export default NavLink;
