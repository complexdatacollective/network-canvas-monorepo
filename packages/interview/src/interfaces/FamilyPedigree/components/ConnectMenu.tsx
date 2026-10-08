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
  availableParentChoices,
  canConnectPartners,
  type Connection,
  type Family,
  type ParentChoice,
} from '../model';
import { PARENT_KIND_LABELS } from '../options';

export type ConnectPair = { firstId: string; secondId: string };

/** A biological parent who carried the pregnancy is offered as its own
 * choice; every other kind by its usual label. */
const parentChoiceLabel = (choice: ParentChoice) =>
  choice.parentKind === 'biological' && choice.carriedPregnancy
    ? messages.parentKindBiologicalCarrier
    : PARENT_KIND_LABELS[choice.parentKind];

const choiceId = (choice: ParentChoice) =>
  choice.parentKind === 'biological' && choice.carriedPregnancy
    ? 'biological-carrier'
    : choice.parentKind;

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

type ParentAndChild = { parentId: string; childId: string };

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
    parent: ParentAndChild;
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
    const parentLabel = ({ parentId, childId }: ParentAndChild) =>
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
          {availableParentChoices(
            family,
            parentChoice.parentId,
            parentChoice.childId,
          ).map((option, index) => {
            const kindLabel = intl.formatMessage(parentChoiceLabel(option));
            const id = choiceId(option);
            return (
              <DropdownMenuItem
                key={id}
                ref={index === 0 ? firstItemRef : undefined}
                data-testid={`pedigree-connect-kind-${id}`}
                onClick={() =>
                  onConnect(
                    { kind: 'parent', ...parentChoice, ...option },
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
    const formerPartners = intl.formatMessage(
      messages.connectFormerPartners,
      pairArgs,
    );
    const canPartner = canConnectPartners(family, first, second);
    const parentOption = (parent: ParentAndChild) => (
      <DropdownMenuItem
        key={parent.parentId}
        closeOnClick={false}
        disabled={
          availableParentChoices(family, parent.parentId, parent.childId)
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
          disabled={!canPartner}
          data-testid="pedigree-connect-partners"
          onClick={() =>
            onConnect(
              {
                kind: 'partner',
                firstId: first,
                secondId: second,
                current: true,
              },
              partners,
            )
          }
        >
          {partners}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canPartner}
          data-testid="pedigree-connect-former-partners"
          onClick={() =>
            onConnect(
              {
                kind: 'partner',
                firstId: first,
                secondId: second,
                current: false,
              },
              formerPartners,
            )
          }
        >
          {formerPartners}
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
