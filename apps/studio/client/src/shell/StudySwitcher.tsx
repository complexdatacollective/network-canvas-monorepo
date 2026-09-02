import { Link, useParams } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';

import { authClient } from '../lib/auth.ts';

/**
 * The header's study chip (§5.5): the study the researcher is acting in, named
 * on every study route including every hour spent in the editor.
 *
 * It names the study by its identifier rather than by `study.name`, because
 * the name comes from `study.shell` (§6.3) and this slice fetches nothing. The
 * identifier is what the shell actually knows; a friendlier placeholder would
 * be a guess about which study the researcher has open, and the chip exists
 * precisely so they can be sure.
 *
 * The sibling list — the team's other studies — needs that same query and is
 * absent for the same reason. What remains is the command §5.5 says the chip
 * always offers: the way back to all of the team's studies.
 *
 * **Whose team?** A study's team is derivable only from the study (§6.3, and
 * §5.6's reason for keeping the team out of the URL), so with no query to ask,
 * this falls back to the active-team setting — the same fallback `TeamArea`
 * makes on a route that does not name its team. Where there is no active team
 * to fall back to, the chip still names the study and offers nothing, rather
 * than opening an empty menu.
 */
export default function StudySwitcher() {
  const qualifierId = useId();
  const nameId = useId();
  const params = useParams({ strict: false });
  const activeTeam = authClient.useActiveOrganization();

  const { studyId } = params;
  // Not inside a study: there is no study to name.
  if (studyId === undefined) return null;

  const teamId = activeTeam.data?.id;

  if (teamId === undefined) {
    return (
      <span className="font-heading min-w-0 text-sm font-semibold">
        {/* Read as one phrase — "Current study, 0193…" — rather than as an
            identifier floating in the header. */}
        <span className="sr-only">Current study </span>
        <span className="inline-block max-w-48 truncate align-bottom">
          {studyId}
        </span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            variant="text"
            className="min-w-0 gap-2"
            /*
              The shape `TeamSwitcher` uses, for the reason recorded there: a
              whole string and a datum joined into "Current study 0193…" by
              the accessible-name algorithm rather than by JavaScript, and
              referenced by id because two inline spans are concatenated with
              no space between them.
            */
            aria-labelledby={`${qualifierId} ${nameId}`}
          >
            <span id={qualifierId} className="sr-only">
              Current study
            </span>
            <span id={nameId} className="max-w-48 truncate">
              {studyId}
            </span>
            <ChevronDown aria-hidden className="size-4 shrink-0" />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          render={<Link to="/team/$teamId" params={{ teamId }} />}
        >
          All studies in this team
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
