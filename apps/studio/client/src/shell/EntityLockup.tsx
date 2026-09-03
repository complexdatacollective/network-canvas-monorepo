import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';

import {
  TeamAndStudySwitcher,
  type SwitcherItem,
  type SwitcherSegment,
  type SwitcherStatus,
} from '@codaco/fresco-ui/navigation/TeamAndStudySwitcher';

import { orpc } from '../lib/api.ts';
import { authClient } from '../lib/auth.ts';
import { teamRole } from '../lib/teamRoles.ts';
import {
  PlaceholderStatusPip,
  placeholderStudyStatus,
  placeholderTeamMeta,
} from './switcherPlaceholders.tsx';

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

/** Shared by both segments, because both failures recover the same way. */
const RETRY_LABEL = 'Try again';

type NamedTeam = { id: string; name: string };

/**
 * The team this lockup is about: the one the COMMITTED URL names wherever a
 * route names one, and the active-team setting only where none does.
 *
 * `lib/teamRoles.ts`'s `teamRole` makes exactly this reading for the
 * researcher's role, and for the same reason. The URL is authoritative and the
 * setting FOLLOWS it (§2.2, §6.6), so the two disagree for the whole of every
 * switch — B's screen commits and renders before the write lands — and
 * permanently when that write fails. A switcher that names the setting
 * therefore announces the team the researcher has just left while the screen
 * beneath it is already listing and creating studies against the team in the
 * URL, which is the one question the switcher exists to answer.
 *
 * `undefined` for a URL team the list does not name, rather than a guess in
 * either direction: nothing here knows what that team is called, the switcher
 * reads "Choose a team", and the teams the researcher does have are still in
 * the list. That is the state the shell's own switch-failure alert is about.
 */
function currentTeam(
  teams: readonly NamedTeam[],
  activeTeam: NamedTeam | null | undefined,
  committedTeamId: string | undefined,
): NamedTeam | undefined {
  if (committedTeamId === undefined) return activeTeam ?? undefined;
  return teams.find((team) => team.id === committedTeamId);
}

/**
 * The study segment, and the only reason it is a component of its own: the
 * studies query must not exist on the routes that show no study segment. The
 * header is on every app route, and a query built unconditionally would ask
 * for a team's studies from the account area and the gallery.
 *
 * **Real data, with one honest degradation.** `protocols.list` is team-scoped
 * and `$studyId` names no team (§5.6), so the siblings can only be the studies
 * of the team the shell can name — the URL's on a team route, the active-team
 * setting's on a study route, which is the same fallback the chip this
 * replaces made. That list is this study's siblings ONLY IF it contains this
 * study: the procedure is authorized per team, so a study in the answer
 * belongs to the team that answered. Where it is not in the answer — a
 * canonical link into another team's study, which §6.3's `study.shell` is what
 * will actually resolve — there is nothing that can honestly be called a
 * sibling, and the switcher falls back to naming the study by its identifier
 * alone, exactly as the chip it replaces did. Offering the active team's
 * studies there would present studies from a different team as this one's.
 *
 * **No status dot.** `ProtocolSummarySchema` carries `id`, `draftId`, `name`,
 * `createdAt` and `updatedAt` and nothing that says whether a study is
 * collecting, draft or closed. The dot the design shows is omitted rather than
 * driven from an invented field; it arrives with the studies model (#1262).
 */
function useStudySegment(
  studyId: string | undefined,
  teamId: string | undefined,
): SwitcherSegment | undefined {
  const navigate = useNavigate();
  const studies = useQuery({
    ...orpc.protocols.list.queryOptions({ input: { teamId: teamId ?? '' } }),
    // Asked only where there is a study to find siblings for, and a team to
    // ask about. The second is not hypothetical: a study route on a session
    // that has never switched teams names no team, because nothing sets
    // `activeOrganizationId` when a session is created.
    enabled: studyId !== undefined && teamId !== undefined,
  });

  // No study on screen: the segment is absent, not empty. After every hook, so
  // the hook order does not depend on the route.
  if (studyId === undefined) return undefined;

  const listed = studies.data ?? [];
  const siblings: SwitcherItem[] = listed.some((study) => study.id === studyId)
    ? listed.map((study) => ({
        id: study.id,
        name: study.name,
        // PLACEHOLDER, both of them — see `switcherPlaceholders`. The word is
        // rendered as well as the pip, so the colour never carries the status
        // on its own.
        meta: placeholderStudyStatus(study.id).label,
        leading: <PlaceholderStatusPip studyId={study.id} />,
      }))
    : // The identifier is what the shell knows about a study it cannot place.
      // A friendlier placeholder would be a guess about which study the
      // researcher has open, and the switcher exists precisely so they can be
      // sure.
      [
        {
          id: studyId,
          name: studyId,
          leading: <PlaceholderStatusPip studyId={studyId} />,
        },
      ];

  // A disabled query is `pending` for ever, so the wait has to be read against
  // whether there was anything to ask.
  const status: SwitcherStatus = studies.isError
    ? 'failed'
    : teamId !== undefined && studies.isPending
      ? 'loading'
      : 'ready';

  return {
    kicker: STUDY_KICKER,
    items: siblings,
    currentId: studyId,
    status,
    onSelect: (id: string) =>
      // Not awaited, and deliberately: a blocked navigation's promise parks
      // rather than rejecting, and it resolves later on some unrelated commit
      // (§6.5). Nothing after this depends on it.
      void navigate({ to: '/study/$studyId', params: { studyId: id } }),
    onRetry: () => void studies.refetch(),
    failureMessage: 'The studies in this team could not be loaded.',
    retryLabel: RETRY_LABEL,
    // The way back to all of the team's studies, which §5.5 says the study
    // chip always offers. It cannot come from the team segment instead:
    // choosing the team already current is a no-op there, by design.
    action:
      teamId === undefined
        ? undefined
        : {
            label: 'All studies in this team',
            onSelect: () =>
              void navigate({ to: '/team/$teamId', params: { teamId } }),
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
  // The one membership Better Auth answers for, and so the one team whose
  // role the switcher can state rather than guess.
  const activeMember = authClient.useActiveMember();

  const list = teams.data ?? [];
  // An EMPTY list and a list that could not be read are the same `[]` here,
  // and they mean opposite things. Better Auth holds `data` at `null` when a
  // request fails and records the error instead, so a researcher who belongs
  // to four teams and whose list request failed would silently get the same
  // treatment as one who belongs to none: no switcher, no explanation, and no
  // way to change teams short of reloading the page. `failed` is how that
  // difference is expressed — the trigger stays and the popup carries the
  // retry.
  //
  // A list that failed while an EARLIER one is still in hand is not a special
  // case either: Better Auth leaves that `data` in place, so those teams stay
  // in `items` and remain the researcher's way to every team they name, with
  // the failure and its retry beneath them.
  const teamStatus: SwitcherStatus = teams.error
    ? 'failed'
    : teams.isPending
      ? 'loading'
      : 'ready';
  // No teams: there is no team to name, and a switcher that names nothing
  // tells the researcher less than no switcher at all. §6.4's `/no-team` route
  // is where a researcher with no team belongs. Only a RESOLVED, unfailed
  // empty list means that — the other two states keep the segment, one showing
  // a skeleton and the other a retry.
  const hasTeamSegment = teamStatus !== 'ready' || list.length > 0;
  const current = currentTeam(list, activeTeam.data, committedTeamId);

  // Whose team? A study's team is derivable only from the study (§6.3, and
  // §5.6's reason for keeping the team out of the URL), so on a study route
  // this is the active-team setting — the same fallback `currentTeam` above
  // makes for the team segment, and the one the chip this replaces made.
  const study = useStudySegment(
    studyId,
    committedTeamId ?? activeTeam.data?.id,
  );

  const teamSegment: SwitcherSegment | undefined = hasTeamSegment
    ? {
        kicker: TEAM_KICKER,
        items: list.map((team) => ({
          id: team.id,
          name: team.name,
          // PLACEHOLDER — see `switcherPlaceholders`. Nothing counts a team's
          // studies yet.
          meta: placeholderTeamMeta(team.id),
          // NOT a placeholder, and deliberately absent rather than invented
          // for the rest: `useActiveMember` answers for the active team only,
          // so this is the one team whose role is actually known. A made-up
          // role would be a false claim about what the researcher may do here.
          badge: teamRole(activeMember.data, team.id),
        })),
        currentId: current?.id,
        placeholder: 'Choose a team',
        status: teamStatus,
        onSelect: (id: string) =>
          // Not awaited, for the reason `SwitcherWithStudy` records.
          void navigate({ to: '/team/$teamId', params: { teamId: id } }),
        onRetry: () => void teams.refetch(),
        failureMessage: 'Your teams could not be loaded.',
        retryLabel: RETRY_LABEL,
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
        action: current && {
          label: 'Team administration',
          onSelect: () =>
            void navigate({
              to: '/team/$teamId/settings',
              params: { teamId: current.id },
            }),
        },
      }
    : undefined;

  // The study segment is a component of its own for one reason: it asks
  // `protocols.list`, and mounting it only where a study is open is what keeps
  // the header — which is on every app route — off that procedure everywhere
  // else.
  //
  // Whose team? A study's team is derivable only from the study (§6.3, and
  // §5.6's reason for keeping the team out of the URL), so on a study route
  // this is the active-team setting — the same fallback `currentTeam` above
  // makes for the team segment, and the one the chip this replaces made.
  return (
    <TeamAndStudySwitcher
      className={className}
      team={teamSegment}
      study={study}
    />
  );
}
