import type { Codebook } from '@codaco/protocol-validation';

import type { RuleDraft } from './rule.ts';
import type { RuleTargetType } from './ruleCodebook.ts';
import {
  describeRule,
  duplicateRuleIds,
  type RuleProblem,
  type RuleProblemCode,
} from './ruleDescription.ts';

/** How several rules in one set combine. */
export type RuleSetJoin = 'AND' | 'OR';

/**
 * What a rule set is for.
 *
 * A network filter narrows the entities a stage works on; a query asks a
 * yes/no question about the whole network.
 */
export type RuleSetVariant = 'filter' | 'query';

/**
 * What a rule set of each kind may be ABOUT.
 *
 * The protocol schema's own rule, and the reason this is a property of the set
 * rather than of the rule: `validateFilterRules` is called with ego rules
 * refused for a stage's node/edge filter and allowed for skip logic, because
 * an ego rule inside a filter is degenerate at runtime — it either keeps every
 * entity or none. The editor already declines to OFFER an ego rule in a
 * filter; this is what lets a rule that arrived some other way be reported
 * rather than saved and refused by the schema with no row to point at.
 *
 * Which targets a set builds and which it may HOLD are different questions,
 * and only this one belongs here: a rule set that does not offer edge rules is
 * still a rule set the schema lets one sit in, so an edge rule in one is the
 * researcher's own rule and not a problem to report.
 */
const RULE_SET_TARGETS: Readonly<
  Record<RuleSetVariant, readonly RuleTargetType[]>
> = Object.freeze({
  filter: Object.freeze(['node', 'edge'] as const),
  query: Object.freeze(['node', 'edge', 'ego'] as const),
});

export const ruleSetTargets = (
  variant: RuleSetVariant,
): readonly RuleTargetType[] => RULE_SET_TARGETS[variant];

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
 * The stored value as the record a rule set is, or `undefined` when it is not
 * one at all.
 *
 * Narrowed once and read by both the editor's reading of a rule set and the
 * verdict on its shape, because the two ask different questions of the same
 * keys: the editor wants the join it could put in a control, and the verdict
 * wants whatever is actually stored there.
 */
const asRuleSetRecord = (value: unknown): object | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : undefined;

/**
 * A field value read back as a rule set.
 *
 * Returns `undefined` — never `null` — for anything that is not one, which is
 * also what a capability that has been switched off leaves behind.
 */
export const asRuleSetValue = (value: unknown): RuleSetValue | undefined => {
  const record = asRuleSetRecord(value);
  if (record === undefined) return undefined;
  const rules = Reflect.get(record, 'rules');
  const join = Reflect.get(record, 'join');
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
 *
 * The join is read from the stored record rather than through
 * `asRuleSetValue`, which keeps only a join the editor's own control could
 * hold: the question here is what the SCHEMA will find, and it refuses a
 * number as surely as it refuses `"XOR"`.
 */
export const ruleSetProblem = (value: unknown): string | undefined => {
  const record = asRuleSetRecord(value);
  if (record === undefined) return undefined;

  const rules = ruleSetRules(record);
  if (rules.length === 0) return NO_RULES_MESSAGE;

  const join: unknown = Reflect.get(record, 'join');
  if (rules.length > 1) {
    // The join control is on screen, showing nothing selected for a value that
    // matches neither option, so a set that never chose and a set holding a
    // value the schema refuses are asked the same question.
    return isRuleSetJoin(join) ? undefined : NO_JOIN_MESSAGE;
  }

  // One rule combines with nothing, so no join control is rendered for it and
  // there is nothing to choose again. `FilterSchema` still declares
  // `join: z.enum(['OR', 'AND']).optional()`, which refuses any other value
  // whatever the rule count — so a stale `"XOR"` a hand-edit or a merge left
  // behind has to be reported here, or the stage saves and the protocol
  // schema refuses it with nothing on screen to point at. Editing or deleting
  // a rule rewrites the set through `updateRules`, which drops the join of a
  // set that is down to one rule; that is the repair the message names.
  return join === undefined || isRuleSetJoin(join)
    ? undefined
    : UNUSABLE_JOIN_MESSAGE;
};

/**
 * Which sentence the FIELD summarises a problem with.
 *
 * `codebook` — the rule was finished, and the protocol moved out from under
 * it. `unusable` — the rule is exactly as it was written and cannot be applied
 * where it is, which is nothing to do with the codebook: an ego rule inside a
 * stage filter, or a comparison pattern that will not compile. `unfinished` —
 * the rule was never completed, whichever editor left it that way.
 */
export type RuleProblemSummary = 'codebook' | 'unusable' | 'unfinished';

/**
 * What the editor makes of each thing that can be wrong with a rule.
 *
 * EVERY problem `describeRule` can find is shown on the rule's own row and
 * refuses the stage save. Nothing is filtered out, so the only decision left
 * per code is which of the three sentences above summarises it — and this
 * record cannot compile without a decision for every member of
 * `RULE_PROBLEM_CODES`.
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
  targetNotOffered: 'unusable',
  missingEntityType: 'codebook',
  missingAttribute: 'codebook',
  invalidOperator: 'codebook',
  invalidOperand: 'codebook',
  invalidPattern: 'unusable',
  missingOption: 'codebook',
  unusableOption: 'codebook',
  unusableDate: 'codebook',
  // A count past the end of an option list, or a number off a scalar's scale.
  // Both bounds are the codebook's: deleting an option shortens the first, and
  // retyping a variable to `scalar` imposes the second on an operand that was
  // entered for something else.
  unusableNumber: 'codebook',
  incomplete: 'unfinished',
  // The rule is exactly as it was written, and the protocol schema refuses it
  // where it sits: nothing about the codebook, and nothing the researcher left
  // half-answered on screen.
  missingId: 'unusable',
  // The same, one step out: the rule is refused for the company it keeps
  // rather than for anything about the codebook, and opening it is what fixes
  // it — so it summarises with the sentence that says exactly that.
  duplicateId: 'unusable',
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
  targets: readonly RuleTargetType[],
): RuleSetIssue[] => {
  const rules = ruleSetRules(value);
  // Worked out once for the set rather than per rule: whether an id is a
  // duplicate is a question about the rules BESIDE this one, and the protocol
  // schema refuses the whole filter for it.
  const duplicateIds = duplicateRuleIds(rules);
  return rules.flatMap<RuleSetIssue>((rule, index) => {
    const { problems } = describeRule({
      rule,
      codebook,
      targets,
      duplicateIds,
    });
    return problems.map((problem) => ({
      position: index + 1,
      message: problem.message,
      summary: ruleProblemSummary(problem),
    }));
  });
};

/**
 * The rule-set field's own error text, or `undefined` when it has none.
 *
 * One message, however many things are wrong: the field renders a single
 * error, and the rule rows themselves say which of them is the broken one.
 */
export const ruleSetValidationMessage = (
  value: unknown,
  codebook: Readonly<Codebook>,
  targets: readonly RuleTargetType[],
): string | undefined => {
  const shape = ruleSetProblem(value);
  if (shape !== undefined) return shape;

  const issues = ruleSetIssues(value, codebook, targets);
  const first = issues[0];
  if (first === undefined) return undefined;
  // Counted by ROW, not by problem. One rule can carry several — losing its
  // entity type takes the attribute's definition with it, and reports both —
  // so a count of problems tells the researcher to open two rules when there
  // is only one to open.
  const brokenRules = new Set(issues.map((issue) => issue.position));
  const summary = issues.reduce<RuleProblemSummary>(
    (worst, issue) =>
      SUMMARY_RANK[issue.summary] < SUMMARY_RANK[worst] ? issue.summary : worst,
    'unfinished',
  );
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
/**
 * Which of several kinds of problem the set's one sentence describes.
 *
 * In this order because it is the order of what the researcher cannot work out
 * for themselves: a rule a collaborator broke under them first, then a rule
 * that cannot be applied as it stands, then a rule they left half-written and
 * already know about. A total mapping, so a summary added without a place in
 * that order fails to compile rather than silently sorting last.
 */
const SUMMARY_RANK: Readonly<Record<RuleProblemSummary, number>> =
  Object.freeze({ codebook: 0, unusable: 1, unfinished: 2 });

const SUMMARY_SENTENCES: Readonly<
  Record<
    RuleProblemSummary,
    Readonly<{
      one: (position: number) => string;
      several: (count: number) => string;
    }>
  >
> = Object.freeze({
  unusable: {
    one: (position) =>
      `Rule ${position} cannot be used as it stands. Open it to fix it, or delete it.`,
    several: (count) =>
      `${count} of these rules cannot be used as they stand. Open each marked rule to fix it, or delete it.`,
  },
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
/**
 * What a set holding a combination the protocol cannot use says, when there is
 * no control on screen to choose a different one.
 *
 * Names the repair rather than the value: a set of one rule renders no join
 * control at all, so "choose how these rules combine" would send the
 * researcher looking for something that is not there.
 */
const UNUSABLE_JOIN_MESSAGE =
  'These rules record a way of combining them that this protocol cannot use. Edit or delete a rule to clear it.';
