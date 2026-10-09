'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@codaco/fresco-ui/DropdownMenu';
import {
  getMarkdownLabelText,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';

import { messages } from '../messages';
import {
  availableParentChoices,
  canConnectPartners,
  type Connection,
  type Family,
  type ParentChoice,
  parentChoiceOptions,
  parentConnectionBlock,
} from '../model';
import type { OwnedOptionLabels } from '../options';

export type ConnectPair = { firstId: string; secondId: string };

/** A parent of any kind but a surrogate, who always carried, recorded as
 * having carried the pregnancy. */
const carriesBeyondKind = (choice: ParentChoice) =>
  choice.parentKind !== 'surrogate' && choice.carriedPregnancy;

const choiceId = (choice: ParentChoice) =>
  carriesBeyondKind(choice)
    ? `${choice.parentKind}-carrier`
    : choice.parentKind;

type ConnectMenuProps = {
  /** The two people being connected, in the order they were selected. */
  pair: ConnectPair | null;
  family: Family;
  displayName: (personId: string) => string;
  /** The codebook's labels for the kinds of parent. */
  parentKindLabels: OwnedOptionLabels['parentKind'];
  /** The second person's symbol, which the menu opens beside and returns
   * focus to. */
  anchor: HTMLElement | null;
  /** Called with the chosen relationship. */
  onConnect: (connection: Connection) => void;
  onClose: () => void;
};

type ParentAndChild = { parentId: string; childId: string };

/**
 * A menu item's label, with the reason it is unavailable shown beneath it
 * when it is. The reason is the item's description (`aria-describedby` to
 * `reasonId`), not part of its name.
 */
function ItemText({
  label,
  reason,
  reasonId,
}: {
  label: ReactNode;
  reason: string | undefined;
  reasonId: string;
}) {
  return (
    <span className="flex flex-col items-start">
      <span>{label}</span>
      {reason !== undefined && (
        <span id={reasonId} aria-hidden className="text-sm">
          {reason}
        </span>
      )}
    </span>
  );
}

/**
 * The words the connect menu uses: for a pair as partners, for one as the
 * other's parent, and for each kind of parent. The participant comes first
 * in a pair, as "you and …".
 */
function connectionWords(
  intl: IntlShape,
  family: Family,
  displayName: (personId: string) => string,
  parentKindLabels: OwnedOptionLabels['parentKind'],
) {
  const isYou = (id: string) => family.byId.get(id)?.isEgo === true;
  // Every kind is offered by the codebook's label; a parent who carried the
  // pregnancy is its own choice, qualifying that label.
  const parentChoiceLabel = (choice: ParentChoice) =>
    carriesBeyondKind(choice)
      ? intl.formatMessage(messages.parentKindCarrier, {
          parentKind: parentKindLabels[choice.parentKind],
        })
      : parentKindLabels[choice.parentKind];
  const parentLabel = ({ parentId, childId }: ParentAndChild) =>
    intl.formatMessage(messages.connectParent, {
      parentIsYou: isYou(parentId) ? 'true' : 'false',
      childIsYou: isYou(childId) ? 'true' : 'false',
      parent: displayName(parentId),
      child: displayName(childId),
    });
  const inOrder = (a: string, b: string) => (isYou(b) ? [b, a] : [a, b]);
  const pairArgs = (a: string, b: string) => {
    const [first = a, second = b] = inOrder(a, b);
    return {
      firstIsYou: isYou(first) ? 'true' : 'false',
      first: displayName(first),
      second: displayName(second),
    };
  };
  const partnersLabel = (a: string, b: string, current: boolean) =>
    intl.formatMessage(
      current ? messages.connectPartners : messages.connectFormerPartners,
      pairArgs(a, b),
    );
  return {
    isYou,
    inOrder,
    pairArgs,
    parentChoiceLabel,
    parentLabel,
    partnersLabel,
    /** A connection made, as the menu option chosen for it, announced as
     * plain text. */
    describe: (connection: Connection) =>
      connection.kind === 'partner'
        ? partnersLabel(
            connection.firstId,
            connection.secondId,
            connection.current,
          )
        : intl.formatMessage(messages.connectedParentAnnouncement, {
            relationship: parentLabel(connection),
            kind: getMarkdownLabelText(parentChoiceLabel(connection)),
          }),
  };
}

/**
 * How a connection just made is announced: as the menu option chosen for
 * it, in the words people have now that it is made, which may differ from
 * the menu's when it changes how someone unnamed is related to the
 * participant.
 */
export function describeConnection(
  connection: Connection,
  intl: IntlShape,
  family: Family,
  displayName: (personId: string) => string,
  parentKindLabels: OwnedOptionLabels['parentKind'],
) {
  return connectionWords(intl, family, displayName, parentKindLabels).describe(
    connection,
  );
}

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
  parentKindLabels,
  anchor,
  onConnect,
  onClose,
}: ConnectMenuProps) {
  const intl = useAppIntl();
  const reasonIdPrefix = useId();
  const words = connectionWords(intl, family, displayName, parentKindLabels);
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
    const { isYou, parentLabel, parentChoiceLabel } = words;

    if (parentChoice) {
      const label = parentLabel(parentChoice);
      // A choice that would record a second carrier is unavailable; the
      // reason, naming who carried the child, is shown once, under the first
      // such choice, and describes each of them.
      const carrierReasonId = `${reasonIdPrefix}-carrier`;
      let carrierReasonShown = false;
      return (
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          {parentChoiceOptions(
            family,
            parentChoice.parentId,
            parentChoice.childId,
          ).map(({ choice: option, unavailable }, index) => {
            const kindLabel = parentChoiceLabel(option);
            const id = choiceId(option);
            const reason =
              unavailable && !carrierReasonShown
                ? intl.formatMessage(messages.unavailableCarrierChoice, {
                    who: isYou(unavailable.carrierId)
                      ? 'carrierIsYou'
                      : isYou(parentChoice.childId)
                        ? 'childIsYou'
                        : 'other',
                    carrier: displayName(unavailable.carrierId),
                    child: displayName(parentChoice.childId),
                  })
                : undefined;
            if (unavailable) carrierReasonShown = true;
            return (
              <DropdownMenuItem
                key={id}
                ref={index === 0 ? firstItemRef : undefined}
                disabled={unavailable !== undefined}
                aria-describedby={unavailable ? carrierReasonId : undefined}
                data-testid={`pedigree-connect-kind-${id}`}
                onClick={() =>
                  onConnect({ kind: 'parent', ...parentChoice, ...option })
                }
              >
                <ItemText
                  label={<RenderMarkdown>{kindLabel}</RenderMarkdown>}
                  reason={reason}
                  reasonId={carrierReasonId}
                />
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => setChoice(null)}
          >
            {intl.formatMessage(commonMessages.back)}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      );
    }

    // The participant comes first in the wording, as "you and …".
    const [first = pair.firstId, second = pair.secondId] = words.inOrder(
      pair.firstId,
      pair.secondId,
    );
    const pairArgs = words.pairArgs(first, second);
    const partners = words.partnersLabel(first, second, true);
    const formerPartners = words.partnersLabel(first, second, false);
    const canPartner = canConnectPartners(family, first, second);
    // An unavailable choice says why. Two people already connected cannot
    // be connected again.
    const partnersReason = canPartner
      ? undefined
      : intl.formatMessage(messages.unavailableAlreadyConnected, pairArgs);
    const partnersReasonId = `${reasonIdPrefix}-partners`;
    // The would-be child is already the would-be parent's ancestor.
    const ancestorReason = ({ parentId, childId }: ParentAndChild) =>
      intl.formatMessage(messages.unavailableAncestor, {
        who: isYou(parentId)
          ? 'parentIsYou'
          : isYou(childId)
            ? 'childIsYou'
            : 'other',
        parent: displayName(parentId),
        child: displayName(childId),
      });
    const parentOption = (parent: ParentAndChild) => {
      const unavailable =
        availableParentChoices(family, parent.parentId, parent.childId)
          .length === 0;
      const block = unavailable
        ? parentConnectionBlock(family, parent.parentId, parent.childId)
        : undefined;
      // Already connected, the reason is the one shown under the partner
      // choices, which are unavailable too.
      const reason =
        block === 'descendant' ? ancestorReason(parent) : undefined;
      const reasonId =
        block === 'connected'
          ? partnersReasonId
          : `${reasonIdPrefix}-parent-${parent.parentId}`;
      return (
        <DropdownMenuItem
          key={parent.parentId}
          closeOnClick={false}
          disabled={unavailable}
          aria-describedby={
            block === 'connected' || reason !== undefined ? reasonId : undefined
          }
          data-testid={`pedigree-connect-parent-${parent.parentId}`}
          onClick={() => setChoice({ pair, parent })}
        >
          <ItemText
            label={parentLabel(parent)}
            reason={reason}
            reasonId={reasonId}
          />
        </DropdownMenuItem>
      );
    };

    return (
      <DropdownMenuGroup>
        <DropdownMenuLabel>
          {intl.formatMessage(messages.connectQuestion, pairArgs)}
        </DropdownMenuLabel>
        <DropdownMenuItem
          ref={firstItemRef}
          disabled={!canPartner}
          aria-describedby={partnersReason && partnersReasonId}
          data-testid="pedigree-connect-partners"
          onClick={() =>
            onConnect({
              kind: 'partner',
              firstId: first,
              secondId: second,
              current: true,
            })
          }
        >
          <ItemText
            label={partners}
            reason={partnersReason}
            reasonId={partnersReasonId}
          />
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canPartner}
          aria-describedby={partnersReason && partnersReasonId}
          data-testid="pedigree-connect-former-partners"
          onClick={() =>
            onConnect({
              kind: 'partner',
              firstId: first,
              secondId: second,
              current: false,
            })
          }
        >
          {formerPartners}
        </DropdownMenuItem>
        {parentOption({ parentId: first, childId: second })}
        {parentOption({ parentId: second, childId: first })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onClose}>
          {intl.formatMessage(commonMessages.cancel)}
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
