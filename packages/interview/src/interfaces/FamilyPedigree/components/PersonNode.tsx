'use client';

import { TriangleAlert } from 'lucide-react';
import type { ReactNode, Ref } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Node, { type NodeColorSequence } from '@codaco/fresco-ui/Node';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { messages } from '../messages';
import { type Person, symbolFor } from '../model';
import { SEX_ABBREVIATIONS } from '../options';

type PersonNodeProps = {
  person: Person;
  color: NodeColorSequence;
  selected: boolean;
  hasMissingDetails: boolean;
  onActivate: () => void;
  nodeRef?: Ref<HTMLButtonElement>;
  /** Rendered after the symbol, inside its positioning box (the add menu). */
  children?: ReactNode;
};

/**
 * One family member: their pedigree symbol, with their name and sex assigned
 * at birth beneath it, and a warning when required details are missing.
 */
export default function PersonNode({
  person,
  color,
  selected,
  hasMissingDetails,
  onActivate,
  nodeRef,
  children,
}: PersonNodeProps) {
  const intl = useAppIntl();
  const displayName = person.isEgo
    ? intl.formatMessage(messages.you)
    : (person.name ?? intl.formatMessage(messages.unnamedPerson));
  const abbreviation = person.sexAssignedAtBirth
    ? SEX_ABBREVIATIONS[person.sexAssignedAtBirth]
    : undefined;

  return (
    <div
      className={cx(
        'relative flex size-full items-center justify-center',
        // Lift the selected person (and their add menu) above neighbours.
        selected && 'z-10',
      )}
      data-testid="pedigree-person"
      data-person-id={person.id}
    >
      <Node
        ref={nodeRef}
        size="sm"
        shape={symbolFor(person.genderIdentity)}
        color={color}
        label=""
        ariaLabel={intl.formatMessage(messages.personAccessibleName, {
          isYou: person.isEgo ? 'true' : 'false',
          name: displayName,
          missing: hasMissingDetails ? 'true' : 'false',
        })}
        selected={selected}
        onClick={onActivate}
      />
      {hasMissingDetails && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                aria-hidden
                className="bg-warning text-warning-contrast elevation-low absolute top-0 right-0 flex size-8 items-center justify-center rounded-full"
              />
            }
          >
            <TriangleAlert className="size-5" aria-hidden />
          </TooltipTrigger>
          <TooltipContent>
            <AppMessage message={messages.missingDetails} />
          </TooltipContent>
        </Tooltip>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute top-full left-1/2 mt-1 flex w-max max-w-48 -translate-x-1/2 flex-col items-center text-center leading-tight"
      >
        <span
          className={cx(
            'truncate font-semibold',
            !person.isEgo && person.name === undefined && 'italic opacity-70',
          )}
        >
          {displayName}
        </span>
        {abbreviation && (
          <span className="text-sm opacity-70">
            <AppMessage message={abbreviation} />
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
