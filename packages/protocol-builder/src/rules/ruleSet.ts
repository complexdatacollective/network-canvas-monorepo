import type { Codebook } from '@codaco/protocol-validation';

import type { RuleDraft } from './rule.ts';
import { describeRule } from './ruleDescription.ts';

/** How several rules in one set combine. */
export type RuleSetJoin = 'AND' | 'OR';

/**
 * The stored shape of a filter or skip-logic field: one opaque object value
 * holding the rules and how they combine.
 */
export type RuleSetValue = {
  rules?: RuleDraft[];
  join?: string;
};

export const JOIN_OPTIONS: readonly Readonly<{
  value: RuleSetJoin;
  label: string;
}>[] = Object.freeze([
  Object.freeze({ value: 'AND' as const, label: 'All rules must match' }),
  Object.freeze({ value: 'OR' as const, label: 'Any rule can match' }),
]);

export const isRuleSetJoin = (value: unknown): value is RuleSetJoin =>
  value === 'AND' || value === 'OR';

/**
 * A field value read back as a rule set.
 *
 * Returns `undefined` — never `null` — for anything that is not one, which is
 * also what a capability that has been switched off leaves behind.
 */
export const asRuleSetValue = (value: unknown): RuleSetValue | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const rules = Reflect.get(value, 'rules');
  const join = Reflect.get(value, 'join');
  return {
    ...(Array.isArray(rules) ? { rules: rules.filter(isRuleRow) } : {}),
    ...(typeof join === 'string' ? { join } : {}),
  };
};

const isRuleRow = (value: unknown): value is RuleDraft =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const ruleSetRules = (value: unknown): readonly RuleDraft[] =>
  asRuleSetValue(value)?.rules ?? [];

/**
 * What is wrong with the SHAPE of a rule set, if anything.
 *
 * A capability that is switched off holds no value at all, and there is
 * nothing to say about one: reporting "create at least one rule" against a
 * section the researcher deliberately turned off would block the form with an
 * error about a control that is not on screen.
 */
export const ruleSetProblem = (value: unknown): string | undefined => {
  const ruleSet = asRuleSetValue(value);
  if (ruleSet === undefined) return undefined;

  const rules = ruleSet.rules ?? [];
  if (rules.length === 0) return NO_RULES_MESSAGE;
  if (rules.length > 1 && !isRuleSetJoin(ruleSet.join)) return NO_JOIN_MESSAGE;
  return undefined;
};

export type RuleSetIssue = Readonly<{
  /** 1-based, as the researcher counts the rules on screen. */
  position: number;
  message: string;
}>;

/**
 * Every rule in this set that the codebook can no longer account for.
 *
 * A rule naming a deleted attribute or a deleted entity type is a problem to
 * REPORT: the researcher has to open it and choose again, or delete it. It is
 * emphatically not a reason to throw — a collaborator deleting a variable
 * would otherwise take the whole stage editor down with it, and the rule the
 * researcher needs to fix would be the one thing they could not see.
 */
export const ruleSetCodebookIssues = (
  value: unknown,
  codebook: Readonly<Codebook>,
): RuleSetIssue[] =>
  ruleSetRules(value).flatMap<RuleSetIssue>((rule, index) => {
    const { problems } = describeRule({ rule, codebook });
    // Incompleteness is the editor's own business — every control inside the
    // rule dialog already refuses to save without it — while a dangling
    // reference appears from OUTSIDE the editor and has nothing else to report
    // it.
    const dangling = problems.filter(
      (problem) =>
        problem.code === 'missingAttribute' ||
        problem.code === 'missingEntityType',
    );
    return dangling.map((problem) => ({
      position: index + 1,
      message: problem.message,
    }));
  });

/**
 * The rule-set field's own error text, or `undefined` when it has none.
 *
 * One message, however many things are wrong: the field renders a single
 * error, and the rule rows themselves say which of them is the broken one.
 */
export const ruleSetValidationMessage = (
  value: unknown,
  codebook: Readonly<Codebook>,
): string | undefined => {
  const shape = ruleSetProblem(value);
  if (shape !== undefined) return shape;

  const issues = ruleSetCodebookIssues(value, codebook);
  const first = issues[0];
  if (first === undefined) return undefined;
  // Whole sentences with a number in them, rather than a position glued onto
  // the rule's own message: the specific wording ("a node type", "an
  // attribute") belongs on the marked rule itself, where the researcher is
  // looking when they open it.
  return issues.length === 1
    ? `Rule ${first.position} refers to part of the codebook that no longer exists. Open it to choose again, or delete it.`
    : `${issues.length} of these rules refer to parts of the codebook that no longer exist. Open each marked rule to choose again, or delete it.`;
};

const NO_RULES_MESSAGE = 'Please create at least one rule.';
const NO_JOIN_MESSAGE = 'Please choose how these rules should be combined.';
