'use client';

import { useEffect, useRef, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@codaco/fresco-ui/DropdownMenu';

import { messages } from '../messages';
import {
  availableParentKinds,
  canConnectPartners,
  type Connection,
  type Family,
} from '../model';
import { PARENT_KIND_LABELS } from '../options';

export type ConnectPair = { firstId: string; secondId: string };

type ConnectMenuProps = {
  /** The two people being connected, in the order they were selected. */
  pair: ConnectPair | null;
  family: Family;
  displayName: (personId: string) => string;
  /** The second person's symbol, which the menu opens beside and returns
   * focus to. */
  anchor: HTMLElement | null;
  /** Called with the chosen relationship and its wording, to announce. */
  onConnect: (connection: Connection, description: string) => void;
  onClose: () => void;
};

type ParentChoice = { parentId: string; childId: string };

/**
 * Asks how two people the participant has selected are related: as partners,
 * or one as the other's parent — and then what kind of parent, as a second
 * step in the same menu rather than a submenu, which a touch screen cannot
 * hover to open. Choices that would contradict the family already recorded
 * are unavailable.
 */
export default function ConnectMenu({
  pair,
  family,
  displayName,
  anchor,
  onConnect,
  onClose,
}: ConnectMenuProps) {
  const intl = useAppIntl();
  // The parent and child chosen in the first step, for the current pair.
  const [choice, setChoice] = useState<{
    pair: ConnectPair;
    parent: ParentChoice;
  } | null>(null);
  const parentChoice = choice && choice.pair === pair ? choice.parent : null;

  // Moving between the steps replaces every item, so focus moves to the
  // first item of the new step.
  const firstItemRef = useRef<HTMLDivElement>(null);
  const stepKey = parentChoice ? parentChoice.parentId : 'relationship';
  const previousStep = useRef(stepKey);
  useEffect(() => {
    if (previousStep.current !== stepKey) firstItemRef.current?.focus();
    previousStep.current = stepKey;
  }, [stepKey]);

  const content = (() => {
    if (!pair) return null;
    const isYou = (id: string) => family.byId.get(id)?.isEgo === true;
    const parentLabel = ({ parentId, childId }: ParentChoice) =>
      intl.formatMessage(messages.connectParent, {
        parentIsYou: isYou(parentId) ? 'true' : 'false',
        childIsYou: isYou(childId) ? 'true' : 'false',
        parent: displayName(parentId),
        child: displayName(childId),
      });

    if (parentChoice) {
      const label = parentLabel(parentChoice);
      return (
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {availableParentKinds(
            family,
            parentChoice.parentId,
            parentChoice.childId,
          ).map((parentKind, index) => {
            const kindLabel = intl.formatMessage(
              PARENT_KIND_LABELS[parentKind],
            );
            return (
              <DropdownMenuItem
                key={parentKind}
                ref={index === 0 ? firstItemRef : undefined}
                data-testid={`pedigree-connect-kind-${parentKind}`}
                onClick={() =>
                  onConnect(
                    { kind: 'parent', ...parentChoice, parentKind },
                    intl.formatMessage(messages.connectedParentAnnouncement, {
                      relationship: label,
                      kind: kindLabel,
                    }),
                  )
                }
              >
                {kindLabel}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => setChoice(null)}
          >
            {intl.formatMessage(messages.connectBack)}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      );
    }

    // The participant comes first in the wording, as "you and …".
    const [first, second] = isYou(pair.secondId)
      ? [pair.secondId, pair.firstId]
      : [pair.firstId, pair.secondId];
    const pairArgs = {
      firstIsYou: isYou(first) ? 'true' : 'false',
      first: displayName(first),
      second: displayName(second),
    };
    const partners = intl.formatMessage(messages.connectPartners, pairArgs);
    const parentOption = (parent: ParentChoice) => (
      <DropdownMenuItem
        key={parent.parentId}
        closeOnClick={false}
        disabled={
          availableParentKinds(family, parent.parentId, parent.childId)
            .length === 0
        }
        data-testid={`pedigree-connect-parent-${parent.parentId}`}
        onClick={() => setChoice({ pair, parent })}
      >
        {parentLabel(parent)}
      </DropdownMenuItem>
    );

    return (
      <DropdownMenuGroup>
        <DropdownMenuLabel>
          {intl.formatMessage(messages.connectQuestion, pairArgs)}
        </DropdownMenuLabel>
        <DropdownMenuItem
          ref={firstItemRef}
          disabled={!canConnectPartners(family, first, second)}
          data-testid="pedigree-connect-partners"
          onClick={() =>
            onConnect(
              { kind: 'partner', firstId: first, secondId: second },
              partners,
            )
          }
        >
          {partners}
        </DropdownMenuItem>
        {parentOption({ parentId: first, childId: second })}
        {parentOption({ parentId: second, childId: first })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onClose}>
          {intl.formatMessage(messages.cancel)}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    );
  })();

  return (
    <DropdownMenu
      open={pair !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuContent
        anchor={anchor}
        side="right"
        align="center"
        finalFocus={() => anchor}
        data-testid="pedigree-connect-menu"
      >
        {content}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
