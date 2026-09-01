import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { KeyRound, Languages, ShieldCheck, UserRound } from 'lucide-react';

import AppArea from '@codaco/fresco-ui/layout/AppArea';
import NavItem from '@codaco/fresco-ui/navigation/NavItem';
import NavList from '@codaco/fresco-ui/navigation/NavList';

/**
 * The account area layout: the account sidebar and the `<main>` it labels
 * (§5.3, §5.5).
 *
 * Everything here belongs to the researcher rather than to a team or a study,
 * which is why it is a platform-level area and carries no identifier in its
 * path: there is only ever one account being administered, and it is the one
 * signed in.
 */
export default function AccountArea() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <AppArea
      location={pathname}
      navigation={{
        label: 'Account',
        openLabel: 'Open account navigation',
        closeLabel: 'Close account navigation',
        content: (
          <NavList>
            <NavItem
              href="/account"
              label="Profile"
              icon={UserRound}
              current={pathname === '/account'}
              renderLink={(props) => (
                <Link
                  to="/account"
                  // Without this, `/account` matches every route beneath it
                  // as a prefix and the router would mark Profile active on
                  // Language too — a second `aria-current="page"`.
                  activeOptions={{ exact: true }}
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
            <NavItem
              href="/account/language"
              label="Language"
              icon={Languages}
              current={pathname === '/account/language'}
              renderLink={(props) => (
                <Link
                  to="/account/language"
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
            <NavItem
              href="/account/sign-in-methods"
              label="Sign-in methods"
              icon={ShieldCheck}
              current={pathname === '/account/sign-in-methods'}
              renderLink={(props) => (
                <Link
                  to="/account/sign-in-methods"
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
            <NavItem
              href="/account/tokens"
              label="API tokens"
              icon={KeyRound}
              current={pathname === '/account/tokens'}
              renderLink={(props) => (
                <Link
                  to="/account/tokens"
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
          </NavList>
        ),
      }}
    >
      <Outlet />
    </AppArea>
  );
}
