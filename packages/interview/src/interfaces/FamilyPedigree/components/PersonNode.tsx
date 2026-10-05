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
 * One family member: their pedigree symbol labelled with their name, and a
 * warning when required details are missing.
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
        label={displayName}
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
      {children}
    </div>
  );
}
