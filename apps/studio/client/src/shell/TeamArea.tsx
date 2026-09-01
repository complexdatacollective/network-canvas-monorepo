import {
  Link,
  Outlet,
  useParams,
  useRouterState,
} from '@tanstack/react-router';
import { Library, ScrollText } from 'lucide-react';

import AppArea from '@codaco/fresco-ui/layout/AppArea';
import NavItem from '@codaco/fresco-ui/navigation/NavItem';
import NavList from '@codaco/fresco-ui/navigation/NavList';

import { authClient } from '../lib/auth.ts';
import { canManageTeam } from '../lib/teamRoles.ts';

/**
 * The team area layout: the team sidebar and the `<main>` it labels (§5.3).
 *
 * The sidebar belongs to the area, not to the app layout, because an area's
 * navigation region and its `<main>` are replaced wholesale when the
 * researcher moves between areas. `AppFrame` renders neither landmark, so this
 * is the only `<nav>` and the only `<main id="main-content">` on a team route.
 *
 * ## Two of the six destinations are here
 *
 * §5.5 fixes the team sidebar as Studies · Members · Roles · Activity ·
 * Billing · Settings. Two of those have routes today: Studies is `/`, and
 * Activity is `/teams/$teamId/activity`. Members, Roles, Billing and Settings
 * have none — members are still administered inside the team workspace on `/`
 * (§5.4 splits that out), and roles, billing and settings are unwritten.
 *
 * They are named here and rendered nowhere. The sidebar is the researcher's
 * map of what the product has; four entries that answer with a not-found page
 * would misdescribe it, and a nav row that goes nowhere is worse than an
 * absent one because it is indistinguishable from a working one until it is
 * used. Members would additionally be a second row pointing at `/`, which
 * would make two rows claim `aria-current="page"` at once.
 *
 * Each becomes a `NavItem` in the slice that adds its route, in the order
 * above.
 *
 * Activity is offered to owners and admins only — the courtesy §11.4
 * describes, and the rule the team workspace applied to the Activity button
 * this replaces. It is a courtesy and not the check: the procedure behind the
 * destination refuses everyone else, and the route renders that refusal inside
 * the intact shell for anyone who reaches the URL directly.
 */
export default function TeamArea() {
  const pathname = useRouterState({
    // The COMMITTED location. Active state and the drawer's close both derive
    // from it — never from a pending navigation, which a blocker may still
    // cancel (§6.5, §7.3).
    select: (state) => state.location.pathname,
  });
  // A team-scoped route names its team in the URL; `/` does not, so it falls
  // back to the active-team setting, which is what the workspace on `/` is
  // showing. The URL wins wherever it speaks: §2.2's invariant is that the URL
  // is authoritative and the active-team setting follows it.
  const params = useParams({ strict: false });
  const activeTeam = authClient.useActiveOrganization();
  const activeMember = authClient.useActiveMember();
  const teamId = params.teamId ?? activeTeam.data?.id;

  const activityPath =
    teamId === undefined || !canManageTeam(activeMember.data?.role)
      ? undefined
      : `/teams/${teamId}/activity`;

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
              href="/"
              label="Studies"
              icon={Library}
              current={pathname === '/'}
              renderLink={(props) => (
                <Link
                  to="/"
                  // Without this, `/` matches every path as a prefix and the
                  // router would mark Studies active on the activity route
                  // too — a second `aria-current="page"`.
                  activeOptions={{ exact: true }}
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
            {activityPath !== undefined && teamId !== undefined && (
              <NavItem
                href={activityPath}
                label="Activity"
                icon={ScrollText}
                current={pathname === activityPath}
                renderLink={(props) => (
                  <Link
                    to="/teams/$teamId/activity"
                    params={{ teamId }}
                    className={props.className}
                    aria-current={props['aria-current']}
                  >
                    {props.children}
                  </Link>
                )}
              />
            )}
          </NavList>
        ),
      }}
    >
      <Outlet />
    </AppArea>
  );
}
