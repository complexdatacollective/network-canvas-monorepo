import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';

import { orpc } from '../lib/api.ts';

/**
 * How many sibling studies the menu names before it stops.
 *
 * The menu is a chip's worth of choices, not the team's study list, and
 * "All studies in this team" is always its last entry — so a team with more
 * studies than this loses nothing but the scrolling: the complete list is one
 * click away at `/team/$teamId`, which is where it belongs (§6.3).
 */
const SIBLING_LIMIT = 8;

/**
 * The header's study chip (§5.5): the study the researcher is acting in, named
 * on every study route including every hour spent in the editor.
 *
 * **It names the study, and the server says which team owns it.** `studies.get`
 * takes the study id alone and resolves the tenant itself (§6.3), which is the
 * only way this chip can be right on a cold direct navigation: a study URL
 * names no team, and the active-team setting is whichever team route was left
 * last. That one answer carries both halves of the chip — the name on the
 * trigger, and the team the menu's sibling list and its way out are addressed
 * by.
 *
 * Until it arrives, and if it never does, the chip falls back to the study
 * identifier: it is what the shell actually knows, and a friendlier
 * placeholder would be a guess about which study the researcher has open, when
 * the chip exists precisely so they can be sure. With no team resolved there
 * is nothing to open, so the chip renders as plain text rather than as a menu
 * onto nothing.
 */
export default function StudySwitcher() {
  const qualifierId = useId();
  const nameId = useId();
  // `strict: false` because the header is on every app route and most of them
  // name no study; the absence is the answer for them rather than a type
  // error. These are the router's MATCHES, which are the committed ones.
  const { studyId } = useParams({ strict: false });
  const study = useQuery({
    ...orpc.studies.get.queryOptions({ input: { studyId: studyId ?? '' } }),
    enabled: studyId !== undefined,
  });
  const teamId = study.data?.teamId;
  const siblings = useQuery({
    ...orpc.studies.list.queryOptions({ input: { teamId: teamId ?? '' } }),
    enabled: teamId !== undefined,
  });

  // Not inside a study: there is no study to name.
  if (studyId === undefined) return null;

  const label = study.data?.study.name ?? studyId;

  if (teamId === undefined) {
    return (
      <span className="font-heading min-w-0 text-sm font-semibold">
        {/* Read as one phrase — "Current study, 0193…" — rather than as an
            identifier floating in the header. */}
        <span className="sr-only">Current study </span>
        <span className="inline-block max-w-48 truncate align-bottom">
          {label}
        </span>
      </span>
    );
  }

  const others = (siblings.data ?? [])
    .filter((sibling) => sibling.id !== studyId)
    .slice(0, SIBLING_LIMIT);

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
              whole string and a datum joined into "Current study Alpha study"
              by the accessible-name algorithm rather than by JavaScript, and
              referenced by id because two inline spans are concatenated with
              no space between them.
            */
            aria-labelledby={`${qualifierId} ${nameId}`}
          >
            <span id={qualifierId} className="sr-only">
              Current study
            </span>
            <span id={nameId} className="max-w-48 truncate">
              {label}
            </span>
            <ChevronDown aria-hidden className="size-4 shrink-0" />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        {/*
          The team's other studies, as ordinary navigations: unlike the team
          chip's radio group, opening another study changes the URL and nothing
          else — there is no per-study setting for a choice here to disagree
          with, and the study in the URL is the one the trigger names.
        */}
        {others.map((sibling) => (
          <DropdownMenuItem
            key={sibling.id}
            render={
              <Link to="/study/$studyId" params={{ studyId: sibling.id }} />
            }
          >
            {sibling.name}
          </DropdownMenuItem>
        ))}
        {others.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem
          render={<Link to="/team/$teamId" params={{ teamId }} />}
        >
          All studies in this team
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
