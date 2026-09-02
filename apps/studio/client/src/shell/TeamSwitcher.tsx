import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useId } from 'react';

import { Alert } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';

import { authClient } from '../lib/auth.ts';

/**
 * The team list could not be read, and the researcher's way out of it.
 *
 * `AppLayout`'s `TeamSwitchFailure` is the pattern — a compact destructive
 * alert with the one control that can change the answer — and this is the
 * same failure one step earlier: there the write could not be made, here the
 * teams to write cannot even be named. It sits where the chip would be rather
 * than in the shell's alert band, because that is the extent of the damage:
 * every screen still has its team from the URL, and what is missing is only
 * the way to a different one.
 */
function TeamListFailure({ retry }: { retry: () => void }) {
  return (
    <Alert variant="destructive" density="compact" className="m-0 w-auto">
      <div className="flex flex-wrap items-center gap-3">
        <span>Your teams could not be loaded.</span>
        <Button size="sm" variant="outline" onClick={retry}>
          Try again
        </Button>
      </div>
    </Alert>
  );
}

type NamedTeam = { id: string; name: string };

/**
 * The team this chip is about: the one the COMMITTED URL names wherever a
 * route names one, and the active-team setting only where none does.
 *
 * `lib/teamRoles.ts`'s `teamRole` makes exactly this reading for the
 * researcher's role, and for the same reason. The URL is authoritative and the
 * setting FOLLOWS it (§2.2, §6.6), so the two disagree for the whole of every
 * switch — B's screen commits and renders before the write lands — and
 * permanently when that write fails. A chip that names the setting therefore
 * announces the team the researcher has just left while the screen beneath it
 * is already listing and creating studies against the team in the URL, which
 * is the one question the chip exists to answer.
 *
 * `undefined` for a URL team the list does not name, rather than a guess in
 * either direction: nothing here knows what that team is called, the switcher
 * reads "Choose a team", and the teams the researcher does have are still in
 * the menu. That is the state the shell's own switch-failure alert is about.
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
 * The header's team chip (§5.5): the team the researcher is acting in, and the
 * switcher over the teams they belong to.
 *
 * **Switching is a navigation, and nothing here writes the active team.**
 * §6.5's sequence: selecting a team goes to that team's landing destination as
 * an ordinary router navigation, so the editor's dirty-state blocker applies
 * to it without this component knowing about it, and §6.6's reconciler makes
 * the setting follow once that destination has actually committed. The write
 * this used to perform is gone with it: two writers for one setting is how the
 * URL and the active team come apart.
 *
 * Nothing here runs after the navigation, so there is no promise to park and
 * no continuation to guard with a generation token (§6.5): a blocked switch
 * simply leaves the researcher where they were, on the team the chip still
 * names, because a navigation that never commits changes no route param and
 * the chip reads the committed one — see `currentTeam`.
 *
 * **A team's landing destination is `/team/$teamId`.** §6.4 resolves a
 * one-study team to that study, which is a question nothing can answer until
 * #1262 lands the studies model, so every team resolves to its studies list —
 * the same degradation `lib/landing.ts` records for `/` and the sign-in
 * bounce.
 */
export default function TeamSwitcher() {
  const qualifierId = useId();
  const nameId = useId();
  const navigate = useNavigate();
  // `strict: false` because the header is on every app route and most of them
  // name no team; the absence is the answer for them rather than a type error.
  // These are the router's MATCHES, which are the committed ones — a pending
  // navigation a blocker may still cancel names nothing here.
  const { teamId: committedTeamId } = useParams({ strict: false });
  const teams = authClient.useListOrganizations();
  const activeTeam = authClient.useActiveOrganization();

  const list = teams.data ?? [];
  // An EMPTY list and a list that could not be read are the same `[]` here,
  // and they mean opposite things. Better Auth holds `data` at `null` when a
  // request fails and records the error instead, so a researcher who belongs
  // to four teams and whose list request failed would silently get the same
  // treatment as one who belongs to none: no chip, no explanation, and no way
  // to change teams short of reloading the page.
  if (teams.error && list.length === 0) {
    return <TeamListFailure retry={() => void teams.refetch()} />;
  }
  // No teams, or the list has not arrived: there is no team to name, and a
  // chip that names nothing tells the researcher less than no chip at all.
  // §6.4's `/no-team` route is where a researcher with no team belongs.
  //
  // A list that failed while an EARLIER one is still in hand is not this case:
  // Better Auth leaves that `data` in place, and the switcher it fills is
  // still the researcher's way to every team it names.
  if (list.length === 0) return null;

  const current = currentTeam(list, activeTeam.data, committedTeamId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            variant="text"
            className="min-w-0 gap-2"
            /*
              A whole string and a datum, joined into "Current team Alpha
              research team" by the accessible-name algorithm rather than by
              JavaScript — the same shape `NavItem` uses for its counts. An
              `aria-label` would replace the visible team name instead of
              qualifying it, and a template would bake English word order
              into the name.

              `aria-labelledby` rather than relying on the two spans'
              contents: text concatenation inserts a space only between
              BLOCK-level children, and these two are inline, so the name
              would read "Current teamAlpha research team". Multiple
              `aria-labelledby` references are always joined with a space.
            */
            aria-labelledby={`${qualifierId} ${nameId}`}
          >
            <span id={qualifierId} className="sr-only">
              Current team
            </span>
            <span id={nameId} className="max-w-48 truncate">
              {current?.name ?? 'Choose a team'}
            </span>
            <ChevronDown aria-hidden className="size-4 shrink-0" />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        {/*
          Radio semantics rather than plain items: exactly one team is the one
          being acted in, and `menuitemradio` is how that reaches a screen
          reader without a second visual-only cue. Which one that is comes from
          `currentTeam` — the same answer the trigger announces, because a chip
          naming one team over a list marking another is a worse answer than
          either alone.
        */}
        <DropdownMenuRadioGroup
          value={current?.id ?? ''}
          onValueChange={(value: unknown) => {
            if (typeof value !== 'string' || value === current?.id) return;
            // Not awaited, and deliberately: a blocked navigation's promise
            // parks rather than rejecting, and it resolves later on some
            // unrelated commit (§6.5). Nothing after this depends on it.
            void navigate({ to: '/team/$teamId', params: { teamId: value } });
          }}
        >
          {list.map((team) => (
            <DropdownMenuRadioItem key={team.id} value={team.id}>
              {team.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {/*
          Team administration beneath the list, as §5.5 places it: choosing a
          team and administering one are different acts, and the separator is
          what says so.

          "Create a team" belongs here too. It is a command rather than a
          destination — #1249 owns the flow and there is none — and an entry
          that opened nothing would be worse than its absence.
        */}
        {current ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link
                  to="/team/$teamId/settings"
                  params={{ teamId: current.id }}
                />
              }
            >
              Team administration
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
