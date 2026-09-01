import {
  Link,
  Outlet,
  useParams,
  useRouterState,
} from '@tanstack/react-router';
import {
  CreditCard,
  Library,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';

import AppArea from '@codaco/fresco-ui/layout/AppArea';
import NavItem from '@codaco/fresco-ui/navigation/NavItem';
import NavList from '@codaco/fresco-ui/navigation/NavList';

import { authClient } from '../lib/auth.ts';
import { useSurfaceUnavailable } from '../lib/deployment.ts';
import { canManageTeam } from '../lib/teamRoles.ts';

/**
 * The team area layout: the team sidebar and the `<main>` it labels (§5.3).
 *
 * The sidebar belongs to the area, not to the app layout, because an area's
 * navigation region and its `<main>` are replaced wholesale when the
 * researcher moves between areas. `AppFrame` renders neither landmark, so this
 * is the only `<nav>` and the only `<main id="main-content">` on a team route.
 *
 * The six destinations §5.5 fixes are all here — Studies, Members, Roles,
 * Activity, Billing, Settings — and each points at its §5.2 address. Three of
 * them are built: Studies and Members are the two halves §5.4 split the team
 * workspace into, and Activity is the audit trail, moved off
 * `/teams/$teamId/activity` with it.
 *
 * Activity is offered to owners and admins only — the courtesy §11.4
 * describes, and the rule the team workspace applied to the Activity button
 * this replaces. It is a courtesy and not the check: the procedure behind the
 * destination refuses everyone else, and the route renders that refusal inside
 * the intact shell for anyone who reaches the URL directly. The other five
 * destinations get no such courtesy because there is nothing behind them yet
 * to refuse anyone.
 *
 * Billing is the one destination that can be absent rather than unbuilt: a
 * self-hosted instance has no billing at all (§10.4), so the row explains
 * itself instead of linking somewhere that would 404.
 */
export default function TeamArea() {
  const pathname = useRouterState({
    // The COMMITTED location. Active state and the drawer's close both derive
    // from it — never from a pending navigation, which a blocker may still
    // cancel (§6.5, §7.3).
    select: (state) => state.location.pathname,
  });
  // Every route in this area names its team in the URL, and the URL is what
  // this reads: §2.2's invariant is that the URL is authoritative and the
  // active-team setting follows it (§6.6's reconciler is what makes it).
  const { teamId } = useParams({ from: '/app/team/$teamId' });
  const activeMember = authClient.useActiveMember();
  const billingUnavailable = useSurfaceUnavailable('/team/$teamId/billing');

  const activityPath = canManageTeam(activeMember.data?.role)
    ? `/team/${teamId}/activity`
    : undefined;

  return (
    <AppArea
      location={pathname}
      navigation={{
        label: 'Team',
        openLabel: 'Open team navigation',
        closeLabel: 'Close team navigation',
        content: (
          <NavList>
            <NavItem
              href={`/team/${teamId}`}
              label="Studies"
              icon={Library}
              current={pathname === `/team/${teamId}`}
              renderLink={(props) => (
                <Link
                  to="/team/$teamId"
                  params={{ teamId }}
                  // Without this, the team's own path matches every route
                  // beneath it as a prefix and the router would mark Studies
                  // active on Members too — a second `aria-current="page"`.
                  // The router's own activeness is what reaches the DOM: it
                  // is applied after the props passed here, and the row's
                  // styling reads the attribute.
                  activeOptions={{ exact: true }}
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
            <NavItem
              href={`/team/${teamId}/members`}
              label="Members"
              icon={Users}
              current={pathname === `/team/${teamId}/members`}
              renderLink={(props) => (
                <Link
                  to="/team/$teamId/members"
                  params={{ teamId }}
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
            <NavItem
              href={`/team/${teamId}/roles`}
              label="Roles"
              icon={ShieldCheck}
              current={pathname === `/team/${teamId}/roles`}
              renderLink={(props) => (
                <Link
                  to="/team/$teamId/roles"
                  params={{ teamId }}
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
            {activityPath !== undefined && (
              <NavItem
                href={activityPath}
                label="Activity"
                icon={ScrollText}
                current={pathname === activityPath}
                renderLink={(props) => (
                  <Link
                    to="/team/$teamId/activity"
                    params={{ teamId }}
                    className={props.className}
                    aria-current={props['aria-current']}
                  >
                    {props.children}
                  </Link>
                )}
              />
            )}
            {billingUnavailable ? (
              <NavItem
                href={`/team/${teamId}/billing`}
                label="Billing"
                icon={CreditCard}
                disabled
                unavailableReason="Managed deployments only"
              />
            ) : (
              <NavItem
                href={`/team/${teamId}/billing`}
                label="Billing"
                icon={CreditCard}
                current={pathname === `/team/${teamId}/billing`}
                renderLink={(props) => (
                  <Link
                    to="/team/$teamId/billing"
                    params={{ teamId }}
                    className={props.className}
                    aria-current={props['aria-current']}
                  >
                    {props.children}
                  </Link>
                )}
              />
            )}
            <NavItem
              href={`/team/${teamId}/settings`}
              label="Settings"
              icon={Settings}
              // The integration screens — API, webhooks, messaging — are
              // settings pages rather than sidebar destinations of their
              // own (§5.5), so this row stays current inside them. The
              // router agrees: its default prefix matching marks this
              // link active on all three.
              current={pathname.startsWith(`/team/${teamId}/settings`)}
              renderLink={(props) => (
                <Link
                  to="/team/$teamId/settings"
                  params={{ teamId }}
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
