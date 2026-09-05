import type { Codebook } from '@codaco/protocol-validation';

import type { RuleDraft } from './rule.ts';
import {
  describeRule,
  type RuleProblem,
  type RuleProblemCode,
} from './ruleDescription.ts';

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

const isRuleSetJoin = (value: unknown): value is RuleSetJoin =>
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

/**
 * Whether a member of the stored `rules` array is a row at all.
 *
 * The one narrowing here that drops rather than reports, and deliberately: an
 * entry that is not an object has no row to be reported on, `describeRule`
 * could say nothing about it beyond that it is not a rule, and the protocol
 * schema refuses one at load — `filterRuleSchema` requires an object with an
 * id, a target and options — so no protocol this editor can open holds one.
 * Everything a row CAN hold is kept and described, however broken.
 */
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

/**
 * Which sentence the FIELD summarises a problem with.
 *
 * `codebook` — the rule was finished, and the protocol moved out from under
 * it. `unfinished` — the rule was never completed, whichever editor left it
 * that way.
 */
export type RuleProblemSummary = 'codebook' | 'unfinished';

/**
 * What the editor makes of each thing that can be wrong with a rule.
 *
 * EVERY problem `describeRule` can find is shown on the rule's own row and
 * refuses the stage save. Nothing is filtered out, so the only decision left
 * per code is which of the two sentences above summarises it — and this record
 * cannot compile without a decision for every member of `RULE_PROBLEM_CODES`.
 *
 * It replaces a hand-written list of the codes worth reporting, which had
 * missed `incomplete` and `unknownTarget`: an imported rule whose
 * operand-taking operator had no value was invisible on the row, invisible to
 * the field, and accepted by the protocol schema (`value` is optional there),
 * so it saved silently and ran as an unintended presence test. A list of names
 * cannot be checked against the union it is drawn from; a total mapping can.
 *
 * Incompleteness IS the rule editor's own business — every control inside the
 * dialog refuses to save without its answer — but the editor is not the only
 * way a rule gets into a protocol, and a rule that arrives any other way has
 * nothing else to report it.
 */
const RULE_PROBLEM_SUMMARIES: Readonly<
  Record<RuleProblemCode, RuleProblemSummary>
> = Object.freeze({
  unknownTarget: 'unfinished',
  missingEntityType: 'codebook',
  missingAttribute: 'codebook',
  invalidOperator: 'codebook',
  invalidOperand: 'codebook',
  missingOption: 'codebook',
  unusableOption: 'codebook',
  incomplete: 'unfinished',
});

const ruleProblemSummary = (problem: RuleProblem): RuleProblemSummary =>
  RULE_PROBLEM_SUMMARIES[problem.code];

export type RuleSetIssue = Readonly<{
  /** 1-based, as the researcher counts the rules on screen. */
  position: number;
  message: string;
  summary: RuleProblemSummary;
}>;

/**
 * Everything wrong with the rules in this set, by the position of the rule
 * that holds it.
 *
 * A rule naming a deleted attribute or a deleted entity type — or comparing an
 * attribute whose type has since changed under it, or missing the operand its
 * operator needs — is a problem to REPORT: the researcher has to open it and
 * choose again, or delete it. It is emphatically not a reason to throw — a
 * collaborator deleting a variable would otherwise take the whole stage editor
 * down with it, and the rule the researcher needs to fix would be the one
 * thing they could not see.
 */
export const ruleSetIssues = (
  value: unknown,
  codebook: Readonly<Codebook>,
): RuleSetIssue[] =>
  ruleSetRules(value).flatMap<RuleSetIssue>((rule, index) => {
    const { problems } = describeRule({ rule, codebook });
    return problems.map((problem) => ({
      position: index + 1,
      message: problem.message,
      summary: ruleProblemSummary(problem),
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

  const issues = ruleSetIssues(value, codebook);
  const first = issues[0];
  if (first === undefined) return undefined;
  // Counted by ROW, not by problem. One rule can carry several — losing its
  // entity type takes the attribute's definition with it, and reports both —
  // so a count of problems tells the researcher to open two rules when there
  // is only one to open.
  const brokenRules = new Set(issues.map((issue) => issue.position));
  // A set whose every problem is an unfinished rule is described as one. Any
  // codebook drift among them takes the sentence over, because that is the
  // half the researcher cannot work out for themselves: a rule they left
  // half-written is one they know about, and a rule a collaborator broke
  // under them is not.
  const summary: RuleProblemSummary = issues.every(
    (issue) => issue.summary === 'unfinished',
  )
    ? 'unfinished'
    : 'codebook';
  const sentences = SUMMARY_SENTENCES[summary];
  return brokenRules.size === 1
    ? sentences.one(first.position)
    : sentences.several(brokenRules.size);
};

/**
 * How the field says it, in whole sentences with a number in them rather than
 * a position glued onto the rule's own message: the specific wording ("a node
 * type", "an attribute", "an operator") belongs on the marked rule itself,
 * where the researcher is looking when they open it.
 */
const SUMMARY_SENTENCES: Readonly<
  Record<
    RuleProblemSummary,
    Readonly<{
      one: (position: number) => string;
      several: (count: number) => string;
    }>
  >
> = Object.freeze({
  codebook: {
    one: (position) =>
      `Rule ${position} no longer works with this protocol's codebook. Open it to fix it, or delete it.`,
    several: (count) =>
      `${count} of these rules no longer work with this protocol's codebook. Open each marked rule to fix it, or delete it.`,
  },
  unfinished: {
    one: (position) =>
      `Rule ${position} is not finished. Open it to fill in every part, or delete it.`,
    several: (count) =>
      `${count} of these rules are not finished. Open each marked rule to fill in every part, or delete it.`,
  },
});

/**
 * What a rule set with nothing in it says, whether it holds an empty list or
 * has not been started at all.
 *
 * Stated once and used as the FIELD's own `required` message as well as this
 * verdict, so a capability switched on and left empty is refused in the same
 * words as one whose last rule was deleted. "This field is required" is what
 * Fresco would otherwise say about a rule builder, which names neither the
 * rules nor the thing to do about them.
 */
export const NO_RULES_MESSAGE = 'Please create at least one rule.';
const NO_JOIN_MESSAGE = 'Please choose how these rules should be combined.';
