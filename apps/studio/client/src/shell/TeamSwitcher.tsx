import { Link } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

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
 * The header's team chip (§5.5): the team the researcher is acting in, and the
 * switcher over the teams they belong to.
 *
 * **It switches without navigating, and that is deliberate.** §6.5 specifies
 * the switch as a blocker-aware navigation to the team's landing destination,
 * followed by `setActive` performed by §6.6's reconciler once that destination
 * commits. The reconciler does not exist, and the team's landing destination
 * is a placeholder: every screen actually built today takes its team from the
 * URL (`/teams/$teamId/activity`, the editor) or from the active-team setting
 * (`/`), so nothing on screen goes stale behind a switch. Navigating anyway
 * would eject a researcher from the editor onto an empty screen as a side
 * effect of naming a different team, and would introduce exactly the
 * parked-`navigate()`-promise sequence §6.5 warns about to reach it.
 *
 * When the team's studies screen is real, this becomes §6.5's
 * navigate-then-verify sequence and the write moves to the reconciler.
 *
 * The list, the active team and `setActive` are the ones `TeamWorkspace`
 * already uses. Better Auth's organization hooks are shared atoms, so reading
 * them here costs no request that the workspace was not already making. That
 * workspace keeps its own switcher until §5.4's split moves member management
 * out of it; two switchers over one setting is the interim, not the design.
 */
export default function TeamSwitcher() {
  const qualifierId = useId();
  const nameId = useId();
  const teams = authClient.useListOrganizations();
  const activeTeam = authClient.useActiveOrganization();
  const [switchFailed, setSwitchFailed] = useState(false);

  const switchToTeam = async (teamId: string) => {
    setSwitchFailed(false);
    try {
      // No `disableSignal`: `TeamWorkspace` suppresses Better Auth's own
      // refresh because it reconciles both access queries itself. Nothing
      // here does, so the signal is what updates every reader of the active
      // team — the workspace included.
      const result = await authClient.organization.setActive({
        organizationId: teamId,
      });
      if (result.error) setSwitchFailed(true);
    } catch {
      setSwitchFailed(true);
    }
  };

  const list = teams.data ?? [];
  // No teams, or the list has not arrived: there is no team to name, and a
  // chip that names nothing tells the researcher less than no chip at all.
  // `/` explains the zero-team case; §6.4's `/no-team` route replaces that
  // explanation once it exists.
  if (list.length === 0) return null;

  const active = activeTeam.data;

  return (
    <>
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
                {active?.name ?? 'Choose a team'}
              </span>
              <ChevronDown aria-hidden className="size-4 shrink-0" />
            </Button>
          }
        />
        <DropdownMenuContent align="start">
          {/*
            Radio semantics rather than plain items: exactly one team is the
            one being acted in, and `menuitemradio` is how that reaches a
            screen reader without a second visual-only cue.
          */}
          <DropdownMenuRadioGroup
            value={active?.id ?? ''}
            onValueChange={(value: unknown) => {
              if (typeof value !== 'string' || value === active?.id) return;
              void switchToTeam(value);
            }}
          >
            {list.map((team) => (
              <DropdownMenuRadioItem key={team.id} value={team.id}>
                {team.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {/*
            Team administration beneath the list, as §5.5 places it: choosing
            a team and administering one are different acts, and the
            separator is what says so.

            "Create a team" belongs here too. It is a command rather than a
            destination — #1249 owns the flow and there is none — and an
            entry that opened nothing would be worse than its absence.
          */}
          {active ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={
                  <Link to="/team/$teamId" params={{ teamId: active.id }} />
                }
              >
                Team administration
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {switchFailed && (
        <Alert variant="destructive">
          Studio could not switch teams. Try again.
        </Alert>
      )}
    </>
  );
}
