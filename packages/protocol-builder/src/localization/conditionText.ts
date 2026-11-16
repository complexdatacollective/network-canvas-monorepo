import type { IntlShape } from '@codaco/app-i18n/messages';
import {
  type Codebook,
  CONDITION_ROLES,
  type ConditionRole,
  type DynamicValueBinding,
  type DynamicValueSiteContext,
  DYNAMIC_VALUE_NAME,
  type LocaleTag,
  parseDynamicValuePath,
} from '@codaco/protocol-validation';

import { isRuleDraft, type RuleDraft } from '../rules/rule.ts';
import type { RuleTargetType } from '../rules/ruleCodebook.ts';
import { describeRule } from '../rules/ruleDescription.ts';
import type { ProtocolLocalization } from './localizedText.ts';

/**
 * A condition as the editor holds it: the schema's `Condition`, read from a
 * stored value part by part, so a condition some other tool wrote badly is
 * still shown and can be put right.
 */
export type ConditionDraft = Readonly<{
  about?: ConditionRole;
  join?: string;
  rules: readonly RuleDraft[];
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const conditionRoles: ReadonlySet<unknown> = new Set(CONDITION_ROLES);
const isConditionRole = (value: unknown): value is ConditionRole =>
  conditionRoles.has(value);

export const asConditionDraft = (value: unknown): ConditionDraft => {
  if (!isRecord(value)) return { rules: [] };
  return {
    ...(isConditionRole(value.about) && { about: value.about }),
    ...(typeof value.join === 'string' && { join: value.join }),
    rules: Array.isArray(value.rules) ? value.rules.filter(isRuleDraft) : [],
  };
};

/** What a condition's node and edge rules can be asked of, and of what type. */
export type ConditionSubject =
  | Readonly<{ entity: 'node' | 'edge'; type: string }>
  | undefined;

/**
 * The entities on screen a condition's rules can be about, where its text
 * is shown: the roles the text can show values of that are of the subject's
 * type, in the order the schema lists them.
 */
export const conditionAboutChoices = (
  context: DynamicValueSiteContext,
  subject: ConditionSubject,
): ConditionRole[] =>
  subject === undefined
    ? []
    : CONDITION_ROLES.filter(
        (role) =>
          context.roles.has(role) &&
          (role === 'edge') === (subject.entity === 'edge'),
      );

/** What a condition's rules may be about, given what it is asked of. */
export const conditionTargets = (
  about: ConditionRole | undefined,
  allowEgoRules: boolean,
): RuleTargetType[] => [
  // A node rule compares the node; an edge rule asks about its edges. Asked
  // of an edge, an edge rule compares that edge, and no node is in reach.
  ...(about === undefined ? [] : about === 'edge' ? [] : ['node' as const]),
  ...(about === undefined ? [] : ['edge' as const]),
  ...(allowEgoRules ? ['ego' as const] : []),
];

/**
 * The codebook a condition's rule editor builds against: the one type its
 * node rules (or, asked of an edge, its edge rules) can name, every edge
 * type for the edges that join a node to others, and the participant.
 */
export const conditionCodebook = (
  codebook: Readonly<Codebook> | undefined,
  subject: ConditionSubject,
  about: ConditionRole | undefined,
  allowEgoRules: boolean,
): Readonly<Codebook> => {
  const ego = allowEgoRules ? codebook?.ego : undefined;
  if (subject === undefined || about === undefined) {
    return { ...(ego !== undefined && { ego }) };
  }
  if (subject.entity === 'edge') {
    const definition = codebook?.edge?.[subject.type];
    return {
      ...(definition !== undefined && { edge: { [subject.type]: definition } }),
      ...(ego !== undefined && { ego }),
    };
  }
  const definition = codebook?.node?.[subject.type];
  return {
    ...(definition !== undefined && { node: { [subject.type]: definition } }),
    ...(codebook?.edge !== undefined && { edge: codebook.edge }),
    ...(ego !== undefined && { ego }),
  };
};

/**
 * A condition's rules as one phrase: each rule as its row describes it,
 * joined as the condition combines them (“Age is more than 30 and Friend
 * exists”). Empty for a condition with no rules.
 */
export const conditionSentence = (
  condition: ConditionDraft,
  {
    codebook,
    intl,
    localization,
    locale,
  }: Readonly<{
    codebook: Readonly<Codebook>;
    intl: IntlShape;
    localization?: ProtocolLocalization | undefined;
    locale?: LocaleTag | undefined;
  }>,
): string => {
  const rules = condition.rules
    .map(
      (rule) =>
        describeRule({
          rule,
          codebook,
          intl,
          ...(localization !== undefined && { localization }),
          ...(locale !== undefined && { locale }),
        }).text,
    )
    .filter((text) => text !== '');
  return intl.formatList(rules, {
    type: condition.join === 'OR' ? 'disjunction' : 'conjunction',
  });
};

/** A new condition's id, which is also the name its binding takes. */
export const newConditionId = (taken: (id: string) => boolean): string => {
  for (let number = 1; ; number += 1) {
    const candidate = `if${number}`;
    if (DYNAMIC_VALUE_NAME.test(candidate) && !taken(candidate)) {
      return candidate;
    }
  }
};

/** The id of the condition `binding` stands for, if it stands for one. */
export const conditionIdOf = (
  binding: DynamicValueBinding | undefined,
): string | undefined => {
  if (binding === undefined) return undefined;
  const parsed = parseDynamicValuePath(binding.path);
  return parsed?.kind === 'condition' ? parsed.conditionId : undefined;
};

/**
 * The conditions among `dropped` that none of `bindings` tests any longer.
 * Two bindings can test one condition, so removing one of them from the text
 * leaves the condition in place for the other.
 */
export const conditionsLeftUntested = (
  dropped: readonly string[],
  bindings: Readonly<Record<string, DynamicValueBinding>>,
): string[] => {
  const tested = new Set(
    Object.values(bindings).map((binding) => conditionIdOf(binding)),
  );
  return dropped.filter((conditionId) => !tested.has(conditionId));
};
