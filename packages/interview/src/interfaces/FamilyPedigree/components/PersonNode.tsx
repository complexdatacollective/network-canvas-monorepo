'use client';

import { TriangleAlert } from 'lucide-react';
import type {
  FocusEvent,
  KeyboardEvent,
  PointerEventHandler,
  ReactNode,
  Ref,
} from 'react';

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
import { EDGE_WIDTH } from '../pedigree-layout/components/EdgeRenderer';

type PersonNodeProps = {
  person: Person;
  /** Their name, or how they are related to the participant. */
  label: string;
  color: NodeColorSequence;
  /** Their details are open in the side panel; or, answering a nomination
   * prompt, it applies to them. */
  selected: boolean;
  /** Answering a nomination prompt that cannot apply to them. */
  disabled?: boolean;
  /** Their add menu is showing (focus or the mouse is on them). */
  menuOpen: boolean;
  /** One of the two people being connected with the connect tool. */
  linking: boolean;
  /** Adopted: drawn within brackets, as pedigree nomenclature has it. */
  adopted: boolean;

  hasMissingDetails: boolean;
  onActivate: () => void;
  /** 0 for the family's single tab stop, -1 for everyone else. */
  tabIndex: number;
  /** Focus has moved onto the person or into their add menu. */
  onFocus: (event: FocusEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onPointerEnter: PointerEventHandler;
  onPointerLeave: PointerEventHandler;
  onPointerDown: PointerEventHandler;
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
  label,
  color,
  selected,
  disabled = false,
  menuOpen,
  linking,
  adopted,
  hasMissingDetails,
  onActivate,
  tabIndex,
  onFocus,
  onKeyDown,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  nodeRef,
  children,
}: PersonNodeProps) {
  const intl = useAppIntl();

  return (
    <div
      className={cx(
        'relative flex size-full items-center justify-center',
        // Lift the person whose add menu is showing above their neighbours.
        menuOpen && 'z-10',
      )}
      data-testid="pedigree-person"
      data-person-id={person.id}
      onFocus={onFocus}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
    >
      {adopted &&
        (['left', 'right'] as const).map((side) => (
          <span
            key={side}
            aria-hidden
            className={cx(
              'pointer-events-none absolute -inset-y-2 w-3 border-solid border-current',
              side === 'left' ? '-left-4' : '-right-4',
            )}
            style={{
              borderTopWidth: EDGE_WIDTH,
              borderBottomWidth: EDGE_WIDTH,
              borderLeftWidth: side === 'left' ? EDGE_WIDTH : 0,
              borderRightWidth: side === 'right' ? EDGE_WIDTH : 0,
            }}
          />
        ))}
      <Node
        ref={nodeRef}
        size="sm"
        shape={symbolFor(person.genderIdentity)}
        color={color}
        label={label}
        ariaLabel={intl.formatMessage(messages.personAccessibleName, {
          isYou: person.isEgo ? 'true' : 'false',
          name: label,
          missing: hasMissingDetails ? 'true' : 'false',
        })}
        selected={selected}
        disabled={disabled}
        linking={linking}
        onClick={onActivate}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
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
