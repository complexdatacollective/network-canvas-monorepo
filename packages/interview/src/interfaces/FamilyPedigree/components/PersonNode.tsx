'use client';

import { TriangleAlert } from 'lucide-react';
import {
  type FocusEvent,
  type KeyboardEvent,
  type PointerEventHandler,
  type ReactNode,
  type Ref,
  useId,
} from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Node, {
  type NodeColorSequence,
  type NodeShape,
} from '@codaco/fresco-ui/Node';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { withoutSoftHyphens } from '../generatedLabels';
import { messages } from '../messages';
import type { Person } from '../model';
import { EDGE_WIDTH } from '../pedigree-layout/components/EdgeRenderer';
import type { ReproductiveRole } from '../reproductiveRoles';

type PersonNodeProps = {
  person: Person;
  /** Their name, or how they are related to the participant, as shown in
   * their symbol. */
  label: string;
  /** The words that name them alone, read out for their symbol: their label,
   * told apart from anyone else's it matches. Defaults to the label. */
  accessibleName?: string;
  color: NodeColorSequence;
  /** From the person type's shape in the codebook, which may follow one of
   * their attributes. */
  shape: NodeShape;
  /** Their details are open in the side panel; or, answering a nomination
   * prompt, it applies to them. */
  selected: boolean;
  /** Nothing can be done with them for now (the wording is being asked). */
  disabled?: boolean;
  /** The id of why they cannot be chosen, when they are shown unavailable
   * but stay reachable (a nomination prompt that cannot apply to them):
   * they are drawn as disabled, and described by it. */
  unavailableReasonId?: string;
  /** Their add menu is showing (focus or the mouse is on them). */
  menuOpen: boolean;
  /** One of the two people being connected with the connect tool. */
  linking: boolean;
  /** Adopted: drawn within brackets, as pedigree nomenclature has it. */
  adopted: boolean;
  /** Their roles in others' conception or birth, read out as their
   * symbol's description. Nothing is drawn for them. */
  reproductiveRoles?: readonly ReproductiveRole[];

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
  accessibleName = label,
  color,
  shape,
  selected,
  disabled = false,
  unavailableReasonId,
  menuOpen,
  linking,
  adopted,
  reproductiveRoles = [],
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
  const rolesId = useId();
  const hasRoles = reproductiveRoles.length > 0;

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
        shape={shape}
        color={color}
        label={label}
        ariaLabel={intl.formatMessage(messages.personAccessibleName, {
          isYou: person.isEgo ? 'true' : 'false',
          name: withoutSoftHyphens(accessibleName),
          adopted: adopted ? 'true' : 'false',
          missing: hasMissingDetails ? 'true' : 'false',
        })}
        aria-describedby={
          [unavailableReasonId, hasRoles ? rolesId : undefined]
            .filter(Boolean)
            .join(' ') || undefined
        }
        aria-disabled={unavailableReasonId ? true : undefined}
        // Drawn as Node draws a disabled symbol, but still focusable.
        className={unavailableReasonId ? 'saturate-50' : undefined}
        selected={selected}
        disabled={disabled}
        linking={linking}
        onClick={onActivate}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
      />
      {hasRoles && (
        <span id={rolesId} hidden>
          {intl.formatList(
            reproductiveRoles.map((role) =>
              intl.formatMessage(messages.reproductiveRoleDescription, {
                role,
              }),
            ),
            { type: 'conjunction' },
          )}
        </span>
      )}
      {/* Centred on the symbol's corner, clear of the label inside it. */}
      {hasMissingDetails && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                aria-hidden
                data-missing-details-badge
                className="bg-warning text-warning-contrast elevation-low absolute top-0 right-0 flex size-8 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
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
