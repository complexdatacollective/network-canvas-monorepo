'use client';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import type { CompletenessGap } from '../completeness';
import { messages } from '../messages';
import type { Family, Relation } from '../model';

type CompletenessPanelProps = {
  gaps: readonly CompletenessGap[];
  family: Family;
  enforcement: 'required' | 'recommended';
  displayName: (personId: string) => string;
  onAdd: (personId: string, relation: Relation) => void;
  onAnswer: (gap: CompletenessGap, answer: 'none' | 'unknown') => void;
};

const QUESTIONS = {
  parents: messages.gapParents,
  siblings: messages.gapSiblings,
  children: messages.gapChildren,
};

const HINTS = {
  parents: messages.gapParentsHint,
  siblings: messages.gapSiblingsHint,
  children: messages.gapChildrenHint,
};

const ADD_LABELS = {
  parents: messages.addParentAction,
  siblings: messages.addSiblingAction,
  children: messages.addChildAction,
};

const RELATIONS: Record<CompletenessGap['kind'], Relation> = {
  parents: 'parent',
  siblings: 'sibling',
  children: 'child',
};

/**
 * What the participant still needs to record before continuing, shown in the
 * side panel when they try to move on. Each item can be resolved where it is:
 * by adding the person, or — for siblings and children — by saying there are
 * none, or that they don't know.
 */
export default function CompletenessPanel({
  gaps,
  family,
  enforcement,
  displayName,
  onAdd,
  onAnswer,
}: CompletenessPanelProps) {
  const intl = useAppIntl();

  if (gaps.length === 0) {
    return (
      <Paragraph>
        <AppMessage message={messages.completenessDone} />
      </Paragraph>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Paragraph>
        <AppMessage
          message={
            enforcement === 'required'
              ? messages.completenessRequiredIntro
              : messages.completenessRecommendedIntro
          }
        />
      </Paragraph>
      <ul className="flex flex-col gap-4">
        {gaps.map((gap) => {
          const args = {
            isYou: family.byId.get(gap.personId)?.isEgo ? 'true' : 'false',
            name: displayName(gap.personId),
          };
          return (
            <li
              key={`${gap.kind}:${gap.personId}`}
              className="bg-surface-2 flex flex-col gap-3 rounded-sm p-4"
              data-testid={`pedigree-gap-${gap.kind}`}
            >
              <div>
                <p className="font-semibold">
                  {intl.formatMessage(QUESTIONS[gap.kind], args)}
                </p>
                <p className="text-sm opacity-80">
                  {intl.formatMessage(HINTS[gap.kind], args)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onAdd(gap.personId, RELATIONS[gap.kind])}
                >
                  <AppMessage message={ADD_LABELS[gap.kind]} />
                </Button>
                {gap.kind !== 'parents' && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onAnswer(gap, 'none')}
                    >
                      <AppMessage message={messages.answerNone} />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onAnswer(gap, 'unknown')}
                    >
                      <AppMessage message={messages.answerUnknown} />
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
