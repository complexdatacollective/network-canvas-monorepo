import { Outlet, useParams, useRouterState } from '@tanstack/react-router';

import AppArea from '@codaco/fresco-ui/layout/AppArea';

import { authClient } from '../lib/auth.ts';
import { useBillingUnavailableReason } from '../lib/deployment.ts';
import { canManageTeam, teamRole } from '../lib/teamRoles.ts';
import AreaMain from './AreaMain.tsx';
import ManifestNav from './ManifestNav.tsx';
import { teamDestinations } from './navigationManifest.ts';

/**
 * The team area layout: the team sidebar and the `<main>` it labels (§5.3).
 *
 * The sidebar belongs to the area, not to the app layout, because an area's
 * navigation region and its `<main>` are replaced wholesale when the
 * researcher moves between areas. `AppFrame` renders neither landmark, so this
 * is the only `<nav>` and the only `<main id="main-content">` on a team route.
 *
 * The six destinations §5.5 fixes — Studies, Members, Roles, Activity, Billing,
 * Settings — are declared in `navigationManifest.ts` rather than here, so the
 * everything bar searches the same list this renders (everything-bar design
 * §5.2). What stays here is the context those entries are filtered against: who
 * the researcher is in this team, and whether this deployment has billing.
 *
 * Activity is offered to owners and admins only — the courtesy §11.4
 * describes, and the rule the team screen applied to the Activity button
 * this replaces. It is a courtesy and not the check: the procedure behind the
 * destination refuses everyone else, and the route renders that refusal inside
 * the intact shell for anyone who reaches the URL directly. The other five
 * destinations get no such courtesy because there is nothing behind them yet
 * to refuse anyone.
 *
 * That role is read against the team in the URL, never against whichever team
 * the active membership currently names — see `teamRole`. The two disagree for
 * the whole of every team switch, so the sidebar would otherwise decide this
 * team's destinations from the last team's role.
 *
 * Billing is the one destination that can be absent rather than unbuilt, and
 * it is absent for two different reasons — a self-hosted instance does not
 * serve the surface at all (§10.4), and a managed deployment has billing only
 * where its own capability says so (§10.3). Either way the row explains itself
 * instead of linking somewhere that would 404 or land on a placeholder, and
 * the bar drops it entirely rather than offering a result nobody can use.
 */
export default function TeamArea() {
  const pathname = useRouterState({
    // The COMMITTED location. Active state and the drawer's close both derive
    // from it — never from a pending navigation, which a blocker may still
    // cancel (§6.5, §7.3).
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });
  // Every route in this area names its team in the URL, and the URL is what
  // this reads: §2.2's invariant is that the URL is authoritative and the
  // active-team setting follows it (§6.6's reconciler is what makes it).
  const { teamId } = useParams({ from: '/app/team/$teamId' });
  const activeMember = authClient.useActiveMember();
  const billingUnavailableReason = useBillingUnavailableReason();

  return (
    <AppArea
      location={pathname}
      navigation={{
        label: 'Team',
        openLabel: 'Open team navigation',
        closeLabel: 'Close team navigation',
        content: (
          <ManifestNav
            entries={teamDestinations({
              teamId,
              canManageTeam: canManageTeam(teamRole(activeMember.data, teamId)),
              billingUnavailableReason,
            })}
          />
        ),
      }}
    >
      <AreaMain>
        <Outlet />
      </AreaMain>
    </AppArea>
  );
}
