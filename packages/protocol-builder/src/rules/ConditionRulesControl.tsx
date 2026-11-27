import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import type { Codebook, ConditionRole } from '@codaco/protocol-validation';

import { ConditionRuleSetField } from '../fields/RuleSetField.tsx';
import {
  type ConditionDraft,
  type ConditionSubject,
  conditionCodebook,
  conditionTargets,
} from '../localization/conditionText.ts';
import { RuleCodebookProvider } from './ruleCodebookSource.ts';
import { asRuleSetValue, ruleSetValidationMessage } from './ruleSet.ts';

const messages = defineMessages({
  aboutLabel: {
    id: 'protocolBuilder.conditionRules.aboutLabel',
    defaultMessage: 'Check rules against',
    description:
      'Label of the control where a researcher chooses which of the nodes that a text refers to the rules of an “If” are asked of, for text that refers to more than one (a pair of nodes).',
  },
  aboutHint: {
    id: 'protocolBuilder.conditionRules.aboutHint',
    defaultMessage:
      'This wording refers to two nodes. Node rules and edge rules are checked against the node that you choose here.',
    description:
      'Guidance under the control where a researcher chooses which node the rules of an “If” are asked of.',
  },
  match: {
    id: 'protocolBuilder.conditionRules.match',
    defaultMessage: 'Match',
    description:
      'Label of the control under the rules of an “If” where a researcher chooses whether all of the rules must match or any one rule can match.',
  },
  noRules: {
    id: 'protocolBuilder.conditionRules.noRules',
    defaultMessage: 'Add at least one rule.',
    description:
      'Problem shown under the rules of an “If” in a dynamic attribute or a logic block that has no rules yet.',
  },
});

const ABOUT_LABELS = defineMessages({
  node: {
    id: 'protocolBuilder.conditionRules.aboutNode',
    defaultMessage: 'The node',
    description:
      'Choice of what the rules of an “If” are asked of: the one node (network member) that the text refers to.',
  },
  edge: {
    id: 'protocolBuilder.conditionRules.aboutEdge',
    defaultMessage: 'The edge',
    description:
      'Choice of what the rules of an “If” are asked of: the one edge (relationship) that the text refers to.',
  },
  dyadSource: {
    id: 'protocolBuilder.conditionRules.aboutFirstNode',
    defaultMessage: 'The first node of the pair',
    description:
      'Choice of what the rules of an “If” are asked of, for text that refers to a pair of nodes: the first of the two.',
  },
  dyadTarget: {
    id: 'protocolBuilder.conditionRules.aboutSecondNode',
    defaultMessage: 'The second node of the pair',
    description:
      'Choice of what the rules of an “If” are asked of, for text that refers to a pair of nodes: the second of the two.',
  },
  focal: {
    id: 'protocolBuilder.conditionRules.aboutFocalNode',
    defaultMessage: 'The node being asked about',
    description:
      'Choice of what the rules of an “If” are asked of, for text shown while the participant is asked about one node in particular.',
  },
}) satisfies Record<ConditionRole, MessageDescriptor>;

const conditionRoles: ReadonlySet<unknown> = new Set(Object.keys(ABOUT_LABELS));
const isConditionRole = (value: unknown): value is ConditionRole =>
  conditionRoles.has(value);

/** Where a condition's rules are asked, and what they can be about. */
export type ConditionScope = Readonly<{
  /** What the rules can be asked of (`conditionAboutChoices`). */
  aboutChoices: readonly ConditionRole[];
  codebook: Readonly<Codebook> | undefined;
  subject: ConditionSubject;
  allowEgoRules: boolean;
}>;

const aboutOf = (
  value: unknown,
  aboutChoices: readonly ConditionRole[],
): ConditionRole | undefined =>
  isConditionRole(value) && aboutChoices.includes(value)
    ? value
    : aboutChoices[0];

/**
 * Why a condition cannot be saved as it is, or undefined when it can: no
 * rules, or a rule that its codebook or its targets refuse.
 */
export const conditionProblem = (
  condition: ConditionDraft,
  { aboutChoices, codebook, subject, allowEgoRules }: ConditionScope,
  intl: IntlShape,
): string | undefined => {
  if (condition.rules.length === 0) return intl.formatMessage(messages.noRules);
  const about = aboutOf(condition.about, aboutChoices);
  return ruleSetValidationMessage(
    {
      rules: [...condition.rules],
      ...(condition.join !== undefined && { join: condition.join }),
    },
    conditionCodebook(codebook, subject, about, allowEgoRules),
    conditionTargets(about, allowEgoRules),
    { intl },
  );
};

/**
 * `condition` as a stage stores it: asked of something on screen only when a
 * node or edge rule asks it, and joined only when there is more than one
 * rule to join.
 */
export const storedCondition = (
  condition: ConditionDraft,
  aboutChoices: readonly ConditionRole[],
): ConditionDraft => {
  const about = aboutOf(condition.about, aboutChoices);
  return {
    ...(about !== undefined &&
      condition.rules.some((rule) => rule.type !== 'ego') && { about }),
    ...(condition.rules.length > 1 &&
      condition.join !== undefined && { join: condition.join }),
    rules: condition.rules,
  };
};

export type ConditionRulesControlProps = ConditionScope &
  Readonly<{
    /** Unique among the controls on screen. */
    name: string;
    /** The heading of the rules, such as “Rules for “If””. */
    label: string;
    condition: ConditionDraft;
    onChange: (condition: ConditionDraft) => void;
    /** Shown under the rules. */
    problem?: string;
    readOnly?: boolean;
  }>;

/**
 * The rules of one “If” of a dynamic attribute or a logic block: the rule
 * builder that filters and skip logic use, with “Match” (all rules or any
 * rule) under it and, for text that refers to more than one node, which of
 * them the rules are asked of. The rules are a condition of the stage (or of
 * a node type's label), kept beside the text.
 */
export function ConditionRulesControl({
  name,
  label,
  condition,
  onChange,
  problem,
  readOnly = false,
  aboutChoices,
  codebook,
  subject,
  allowEgoRules,
}: ConditionRulesControlProps) {
  const intl = useAppIntl();
  const about = aboutOf(condition.about, aboutChoices);
  const ruleCodebook = useMemo(
    () => conditionCodebook(codebook, subject, about, allowEgoRules),
    [codebook, subject, about, allowEgoRules],
  );
  const targets = useMemo(
    () => conditionTargets(about, allowEgoRules),
    [about, allowEgoRules],
  );
  return (
    // Each field is spaced by its own margin.
    <div>
      {aboutChoices.length > 1 && (
        <UnconnectedField
          name={`${name}-about`}
          label={intl.formatMessage(messages.aboutLabel)}
          hint={intl.formatMessage(messages.aboutHint)}
          component={NativeSelectField}
          options={aboutChoices.map((role) => ({
            value: role,
            label: intl.formatMessage(ABOUT_LABELS[role]),
          }))}
          value={about}
          readOnly={readOnly}
          onChange={(next) => {
            if (isConditionRole(next)) onChange({ ...condition, about: next });
          }}
        />
      )}
      <RuleCodebookProvider value={ruleCodebook}>
        <UnconnectedField
          name={`${name}-rules`}
          label={label}
          component={ConditionRuleSetField}
          targets={targets}
          aboutEdge={about === 'edge'}
          joinLabel={intl.formatMessage(messages.match)}
          readOnly={readOnly}
          value={
            condition.rules.length === 0
              ? undefined
              : {
                  rules: [...condition.rules],
                  ...(condition.join !== undefined && {
                    join: condition.join,
                  }),
                }
          }
          errors={problem === undefined ? [] : [problem]}
          showErrors={problem !== undefined}
          onChange={(next) => {
            const ruleSet = asRuleSetValue(next);
            onChange({
              ...(condition.about !== undefined && { about: condition.about }),
              ...(ruleSet?.join !== undefined && { join: ruleSet.join }),
              rules: ruleSet?.rules ?? [],
            });
          }}
        />
      </RuleCodebookProvider>
    </div>
  );
}
