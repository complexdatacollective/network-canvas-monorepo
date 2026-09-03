import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';

import {
  TeamAndStudySwitcher,
  type SwitcherItem,
  type SwitcherSegment,
  type SwitcherStatus,
} from '@codaco/fresco-ui/navigation/TeamAndStudySwitcher';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { orpc } from '../lib/api.ts';
import { authClient } from '../lib/auth.ts';
import { STUDY_STATE_TONES, studySummaryLine } from '../lib/studyState.ts';
import { teamRolesLabel } from '../lib/teamRoles.ts';

/**
 * The header's team ▸ study lockup (§5.5): the team the researcher is acting
 * in, and — when they are inside one — the study, as a single object that
 * reads as a path.
 *
 * Both segments are `TeamAndStudySwitcher` segment configurations rather than
 * two bespoke chips, so the keyboard behaviour, the selection semantics, the
 * failure handling and the collapse rule live in one component and cannot drift apart.
 *
 * **The study segment is ABSENT, not empty, outside a study.** That decision
 * is made here rather than inside a segment component, because a segment that
 * renders `null` is still a child of the lockup: `Children.toArray` keeps the
 * ELEMENT, so the lockup would draw a divider and an empty box beside the
 * team. The same is true of the team segment, which is why the "no teams at
 * all" answer is computed here too.
 */

/**
 * The whole translated words above each name. Whole strings, never assembled
 * from fragments: each is half of its trigger's accessible name — "Team Alpha
 * research team" — and a template would bake English word order into every
 * translation.
 */
const TEAM_KICKER = 'Team';
const STUDY_KICKER = 'Study';

type NamedTeam = { id: string; name: string };

/**
 * What leads a study in the switcher, in place of the identity mark a team
 * gets. A monogram of a study's name says nothing the name beside it does not;
 * the state the study is in is what a researcher is scanning for.
 *
 * `aria-hidden`, because colour is never the only carrier of the state: the
 * supporting line under every name spells it out (WCAG 1.4.1). The dot is what
 * makes the list scannable once you know the colours.
 */
function StudyStatusDot({ tone }: { tone: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block size-2 shrink-0 rounded-full', tone)}
    />
  );
}

/**
 * The team this lockup is about: the one the COMMITTED URL names wherever a
 * route names one, and the active-team setting only where none does.
 *
 * The URL is authoritative and the
 * setting FOLLOWS it (§2.2, §6.6), so the two disagree for the whole of every
 * switch — B's screen commits and renders before the write lands — and
 * permanently when that write fails. A switcher that names the setting
 * therefore announces the team the researcher has just left while the screen
 * beneath it is already listing and creating studies against the team in the
 * URL, which is the one question the switcher exists to answer.
 *
 * `undefined` for a team the list does not name, rather than a guess in either
 * direction: nothing here knows what that team is called, the switcher reads
 * "Choose a team", and the teams the researcher does have are still in the
 * list. That is the state the shell's own switch-failure alert is about.
 *
 * BOTH answers come from the list, including the active-team fallback. The
 * setting outlives membership — a researcher who leaves the team they were
 * last acting in keeps it in `activeOrganizationId` — so returning it
 * unchecked names a team they can no longer open. The switcher would show
 * "Choose a team", because no item matches it, while the row beneath the list
 * still offered to administer it.
 */
function currentTeam(
  teams: readonly NamedTeam[],
  activeTeam: NamedTeam | null | undefined,
  committedTeamId: string | undefined,
): NamedTeam | undefined {
  const id = committedTeamId ?? activeTeam?.id;
  if (id === undefined) return undefined;
  return teams.find((team) => team.id === id);
}

/**
 * The study segment, and the only reason it is a component of its own: its
 * queries must not RUN on the routes that show no study. The header is on
 * every app route, and a query built unconditionally would ask about a study
 * from the account area and the gallery. Hooks cannot be skipped, so both are
 * gated on the same absent `studyId`.
 *
 * **The server resolves the owner.** `studies.get` takes the study id alone
 * and derives the tenant from the caller's own memberships (§6.3), which is
 * what makes a study URL a canonical link: it opens the study whoever follows
 * it and however they got there. Reading the ACTIVE team instead would be
 * wrong from an ordinary bookmark — a visit to team B's study while the
 * setting still names team A finds nothing, and a session that names no team,
 * which is every first sign-in, has nothing to ask at all.
 *
 * A study the server will not resolve leaves the identifier on screen and no
 * siblings. That is not this segment's failure to report: it says what it
 * knows, and the shell's own error surface owns the outage.
 *
 * **No status colour.** The studies model carries nothing that says whether a
 * study is collecting, draft or closed, so `StudyStatusDot` is neutral until
 * that lands (#1262).
 */
function useStudySegment(
  studyId: string | undefined,
): SwitcherSegment | undefined {
  const navigate = useNavigate();

  const study = useQuery({
    ...orpc.studies.get.queryOptions({ input: { studyId: studyId ?? '' } }),
    enabled: studyId !== undefined,
  });
  const teamId = study.data?.teamId;
  const siblings = useQuery({
    ...orpc.studies.list.queryOptions({ input: { teamId: teamId ?? '' } }),
    enabled: teamId !== undefined,
  });

  // No study on screen: the segment is absent, not empty. After every hook, so
  // the hook order does not depend on the route.
  if (studyId === undefined) return undefined;

  const listed = siblings.data ?? [];
  const items: SwitcherItem[] =
    study.data === undefined
      ? // The identifier is what the shell knows about a study it cannot
        // place. A friendlier stand-in would be a guess about which study is
        // open, and the switcher exists precisely so the researcher can be
        // sure.
        [{ id: studyId, name: studyId }]
      : // The owning team answered, so these are genuinely this study's
        // siblings, and its own name comes from that same answer.
        (listed.length > 0 ? listed : [study.data.study]).map((row) => ({
          id: row.id,
          name: row.name,
          // The state, and how much of the study there is — the two things a
          // researcher picking between studies is choosing on.
          meta: studySummaryLine(row),
          leading: <StudyStatusDot tone={STUDY_STATE_TONES[row.state]} />,
        }));

  const status: SwitcherStatus =
    study.isPending || (teamId !== undefined && siblings.isPending)
      ? 'loading'
      : 'ready';

  return {
    kicker: STUDY_KICKER,
    items,
    currentId: studyId,
    status,
    onSelect: (id: string) =>
      // Not awaited, and deliberately: a blocked navigation's promise parks
      // rather than rejecting, and it resolves later on some unrelated commit
      // (§6.5). Nothing after this depends on it.
      void navigate({ to: '/study/$studyId', params: { studyId: id } }),
    // The way back to all of the team's studies, which §5.5 says the study
    // chip always offers. It cannot come from the team segment instead:
    // choosing the team already current is a no-op there, by design. A
    // destination, so it is a link — see `SwitcherAction`.
    action:
      teamId === undefined
        ? undefined
        : {
            label: 'All studies in this team',
            render: <Link to="/team/$teamId" params={{ teamId }} />,
          },
  };
}

/**
 * **Switching is a navigation, and nothing here writes the active team.**
 * §6.5's sequence: selecting a team goes to that team's landing destination as
 * an ordinary router navigation, so the editor's dirty-state blocker applies
 * to it without this component knowing about it, and §6.6's reconciler makes
 * the setting follow once that destination has actually committed. Two writers
 * for one setting is how the URL and the active team come apart.
 *
 * Nothing here runs after the navigation, so there is no promise to park and
 * no continuation to guard with a generation token (§6.5): a blocked switch
 * simply leaves the researcher where they were, on the team the lockup still
 * names, because a navigation that never commits changes no route param and
 * this reads the committed one — see `currentTeam`.
 *
 * **A team's landing destination is `/team/$teamId`.** §6.4 resolves a
 * one-study team to that study, which is a question nothing can answer until
 * #1262 lands the studies model, so every team resolves to its studies list —
 * the same degradation `lib/landing.ts` records for `/` and the sign-in
 * bounce.
 */
export default function EntityLockup({ className }: { className?: string }) {
  const navigate = useNavigate();
  // `strict: false` because the header is on every app route and most of them
  // name neither a team nor a study; the absence is the answer for them rather
  // than a type error. These are the router's MATCHES, which are the committed
  // ones — a pending navigation a blocker may still cancel names nothing here.
  const { teamId: committedTeamId, studyId } = useParams({ strict: false });
  const teams = authClient.useListOrganizations();
  const activeTeam = authClient.useActiveOrganization();
  // Every membership, from `me`. Better Auth's team list drops the role, so
  // without this only the ACTIVE team could carry one and every other row
  // would be silent about what the researcher may do there.
  const me = useQuery(orpc.me.queryOptions());
  const roles = new Map(
    (me.data?.teams ?? []).map((membership) => [
      membership.teamId,
      membership.role,
    ]),
  );

  // A list that failed while an EARLIER one is still in hand is not a special
  // case: Better Auth leaves that `data` in place, so those teams stay in
  // `items` and remain the researcher's way to every team they name. A failure
  // with nothing cached leaves this empty, and reporting THAT belongs to the
  // shell's own error surface rather than to a second account of it in here.
  const list = teams.data ?? [];
  const teamStatus: SwitcherStatus = teams.isPending ? 'loading' : 'ready';
  // No teams: there is no team to name, and a switcher that names nothing
  // tells the researcher less than no switcher at all. §6.4's `/no-team` route
  // is where a researcher with no team belongs. Only a RESOLVED empty list
  // means that; while the list is still loading the segment stays, showing a
  // skeleton.
  const hasTeamSegment = teamStatus !== 'ready' || list.length > 0;
  const current = currentTeam(list, activeTeam.data, committedTeamId);

  // The study resolves its own team rather than borrowing the one on screen:
  // a bookmarked study belongs to whichever team owns it, which is not
  // necessarily the team the session last had active (§6.3, §5.6).
  const study = useStudySegment(studyId);

  const teamSegment: SwitcherSegment | undefined = hasTeamSegment
    ? {
        kicker: TEAM_KICKER,
        items: list.map((team) => ({
          id: team.id,
          name: team.name,
          // `teamRolesLabel`, not the raw stored value: a legacy membership
          // is stored as "owner,admin" and would otherwise be shouted at the
          // researcher as "OWNER,ADMIN". Absent while `me` is still in
          // flight, and for a team it does not name — a made-up role would be
          // a false claim about what the researcher may do there.
          badge: (() => {
            const role = roles.get(team.id);
            return role === undefined ? undefined : teamRolesLabel(role);
          })(),
        })),
        currentId: current?.id,
        placeholder: 'Choose a team',
        status: teamStatus,
        onSelect: (id: string) =>
          // Not awaited, for the reason `SwitcherWithStudy` records.
          void navigate({ to: '/team/$teamId', params: { teamId: id } }),
        // Team administration beneath the list, as §5.5 places it: choosing a
        // team and administering one are different acts, and the separator the
        // switcher draws is what says so. It navigates rather than being a
        // link because that is the shape the switcher's trailing command
        // takes; the destination is a registered route either way, which is
        // what `routeTable.test.tsx` asserts.
        //
        // "Create a team" belongs here too. It is a command rather than a
        // destination — #1249 owns the flow and there is none — and an entry
        // that opened nothing would be worse than its absence.
        // A destination, not a command, so it renders as a link: openable in
        // a new tab, copyable, and announced as a link. "Create a team" stays
        // a command when it exists — there is nowhere to go until it has run.
        action: current && {
          label: 'Team administration',
          render: (
            <Link to="/team/$teamId/settings" params={{ teamId: current.id }} />
          ),
        },
      }
    : undefined;

  return (
    <TeamAndStudySwitcher
      className={className}
      team={teamSegment}
      study={study}
    />
  );
}
