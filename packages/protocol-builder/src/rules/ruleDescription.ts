import { createAppIntl, defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import type {
  Codebook,
  ColorReference,
  FilterOperator,
  NodeShape,
  VariableType,
} from '@codaco/protocol-validation';

import {
  isCompilablePattern,
  isFilterOperator,
  isPresenceOperator,
  operatorsWithOptionCount,
  operatorsWithRegExp,
  type PresenceOperator,
} from './operators.ts';
import { isCompleteRule, isRuleDraft, ruleDraftOptions } from './rule.ts';
import {
  assertNoSuchDateProblem,
  assertNoSuchNumberProblem,
  codebookLabel,
  DEFAULT_EDGE_COLOR,
  DEFAULT_NODE_COLOR,
  isOperandValidForAttributeType,
  isOperatorValidForAttributeType,
  isRuleTargetType,
  type OperandDateProblem,
  operandDateProblems,
  type OperandNumberProblem,
  operandNumberProblems,
  operandOptionProblems,
  type RuleTargetType,
  ruleVariable,
  ruleVariableChoices,
  ruleVariables,
  ruleVariableType,
} from './ruleCodebook.ts';
import { dateResolutionMessages, ruleSubjectMessages } from './ruleMessages.ts';

/**
 * The formatter used when a caller has none of its own.
 *
 * `describeRule` is the package's one public rule export, and a host reaches
 * it with a validated protocol and no editing session — the printable protocol
 * summary, an archive job, a server. Those get English; every display surface
 * inside the builder threads the reader's own `intl` in.
 */
const englishIntl = createAppIntl({ locale: 'en' });

/**
 * The entity a rule is about, resolved against the codebook.
 *
 * `missing` says the codebook no longer describes the type this rule names —
 * a collaborator deleted it, or the rule outlived a protocol edit. The
 * remaining fields still describe what the rule SAYS, so a host can show the
 * researcher the rule they have to fix rather than a blank.
 */
export type RuleDescriptionEntity =
  | Readonly<{ kind: 'ego'; label: string; missing: boolean }>
  | Readonly<{
      kind: 'node';
      typeId: string | undefined;
      label: string;
      color: ColorReference;
      shape: NodeShape | undefined;
      missing: boolean;
    }>
  | Readonly<{
      kind: 'edge';
      typeId: string | undefined;
      label: string;
      color: ColorReference;
      missing: boolean;
    }>;

export type RuleDescriptionAttribute = Readonly<{
  id: string;
  /** The researcher's name for it, or its id when the codebook has neither. */
  label: string;
  /** Absent when the codebook does not describe this attribute. */
  type: VariableType | undefined;
  missing: boolean;
}>;

export type RuleDescriptionOperator = Readonly<{
  id: string | undefined;
  /** How the operator reads in a sentence. */
  text: string;
}>;

export type RuleDescriptionOperand = Readonly<{
  /** One entry per operand, with option labels substituted for option values. */
  items: readonly (string | number)[];
  /**
   * Whether these are prose the researcher wrote, rather than the literal
   * strings the interview compares.
   *
   * True for exactly one shape of attribute: the LABEL of a categorical or
   * ordinal option, which is Markdown everywhere else it is shown. Every other
   * operand is compared verbatim — a `contains` operand is a regular
   * expression — and rendering one as Markdown eats the very characters that
   * make it one: `.*abc.*` reads back as `.abc.`. That states a rule the
   * protocol does not hold, in the builder and in the archived summary alike.
   */
  authoredLabels: boolean;
}>;

/**
 * Everything that can be wrong with a rule, as one closed list.
 *
 * Enumerated rather than only unioned so that the decision about what the
 * editor DOES with each of them can be a total mapping over this list — see
 * `RULE_PROBLEM_SUMMARIES` in `ruleSet.ts`. The two places that used to name
 * the reportable subset by hand each missed a code, twice: an allowlist cannot
 * be checked against a union, and a rule the row never marked was a rule the
 * researcher had no way of seeing.
 */
export const RULE_PROBLEM_CODES = [
  'unknownTarget',
  'targetNotOffered',
  'missingEntityType',
  'missingAttribute',
  'invalidOperator',
  'invalidOperand',
  'invalidPattern',
  'missingOption',
  'unusableOption',
  'unusableDate',
  'unusableNumber',
  'incomplete',
  'missingId',
  'duplicateId',
] as const;

export type RuleProblemCode = (typeof RULE_PROBLEM_CODES)[number];

/**
 * The ids held by more than one rule in a set.
 *
 * The one thing wrong with a rule that cannot be seen from the rule: an id is
 * a duplicate only relative to the other rules beside it, so the set has to
 * work it out and hand it in. Stated here, next to the description that
 * reports it, because every reader of a set — the rule list, the field's own
 * verdict, and a host printing a stage out — has to reach the same answer.
 *
 * Only string ids count. A rule holding no id, or something that is not a
 * string, is already reported as `missingId`, and calling two of those
 * duplicates of each other would mark the same rule twice for one fault.
 *
 * The id is read without asking whether the row is a readable rule at all: a
 * rule that does not say what it is about still occupies its id, and the
 * schema counts it when it looks for a duplicate.
 */
export const duplicateRuleIds = (
  rules: readonly unknown[],
): ReadonlySet<string> => {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const rule of rules) {
    if (typeof rule !== 'object' || rule === null) continue;
    const id: unknown = Reflect.get(rule, 'id');
    if (typeof id !== 'string') continue;
    if (seen.has(id)) duplicated.add(id);
    seen.add(id);
  }
  return duplicated;
};

export type RuleProblem = Readonly<{
  code: RuleProblemCode;
  message: string;
}>;

/**
 * A stored rule read back as a sentence, with everything its ids stand for
 * already resolved.
 *
 * This is the package's one public rule export. It is pure — no React, no
 * session, no editing — because the printable protocol summary needs the same
 * semantics the editor's own preview does, and duplicating the resolution is
 * how the two came to disagree: the summary's attribute chip lost the text
 * saying what kind of attribute it was, leaving a coloured pill with nothing
 * to read.
 *
 * Nothing here throws. A rule may name an entity type or an attribute the
 * codebook no longer has, which is a problem to report and not an error to
 * crash on.
 */
export type RuleDescription = Readonly<{
  target: RuleTargetType | undefined;
  entity: RuleDescriptionEntity | undefined;
  /** Absent for a presence rule, which names no attribute at all. */
  attribute: RuleDescriptionAttribute | undefined;
  operator: RuleDescriptionOperator;
  /** Absent when the operator takes no operand. */
  operand: RuleDescriptionOperand | undefined;
  /**
   * Whether this rule asks only whether the attribute has been answered at
   * all.
   *
   * Such a rule reads "Person where Age", "Person without Age": the operator
   * takes the place of the word that would otherwise introduce the attribute,
   * and nothing follows it. Said here rather than worked out again by every
   * reader, so the sentence a host prints and the one the editor shows cannot
   * disagree — assembling it from the connector AND the operator is what
   * produced "Person where Age where".
   *
   * Today's editor does not offer these operators against an attribute;
   * protocols authored before it did still hold them.
   */
  attributePresence: boolean;
  /**
   * Whether the sentence has three separable parts. A presence rule reads as
   * one unbroken phrase and has nothing to put in a third column.
   */
  columns: boolean;
  /** The whole sentence as plain text. */
  text: string;
  /** Empty for a rule the codebook fully describes and the schema accepts. */
  problems: readonly RuleProblem[];
}>;

export type DescribeRuleInput = Readonly<{
  /** A stored or in-progress rule. Any shape; nothing here trusts it. */
  rule: unknown;
  codebook: Readonly<Codebook>;
  /**
   * What the rule set holding this rule may be about, when it is being read
   * inside one.
   *
   * The protocol schema accepts an ego, node or edge rule in a filter's shape
   * and then refuses some of them by WHERE the filter sits: an ego rule is
   * degenerate inside a stage's node/edge filter, so the schema rejects it
   * there and accepts it in skip logic. Which is which is a property of the
   * rule set, not of the rule, so the set has to say — and a set that says
   * nothing (a host printing a rule out of a validated protocol) constrains
   * nothing.
   */
  targets?: readonly RuleTargetType[];
  /**
   * The ids held by more than one rule in the set this rule sits in, from
   * `duplicateRuleIds`.
   *
   * The other thing only the SET can answer. The protocol schema refuses a
   * filter whose rules repeat an id (`findDuplicateId`), and no rule can tell
   * on its own that its id is a repeat. A caller that says nothing — a host
   * printing one rule out of a validated protocol, or the dialog judging the
   * draft it is about to save — reports no duplicate, which is right: a
   * validated protocol has none, and the dialog mints a fresh id rather than
   * committing a second copy of one.
   */
  duplicateIds?: ReadonlySet<string>;
  /**
   * The reader's own formatter, for every word in the sentence and every
   * problem reported beside it.
   *
   * Optional because this module is the package's one public rule export and a
   * host reaches it without an editing session — the printable protocol
   * summary has a validated protocol and nothing else. Omitted, the rule reads
   * in English; the builder's own list, field and dialog thread the researcher's
   * formatter in, so what the row says and what the editor says agree.
   */
  intl?: IntlShape;
}>;

/**
 * Operator phrasing, in the two voices a rule sentence needs.
 *
 * An ego rule reads "Ego has Age that is greater than 30"; an alter rule reads
 * "Person where Age is greater than 30". Whole phrases either way — assembling
 * one from "that" plus the alter wording only composes in English, which is
 * why the two voices are two complete tables rather than one plus a prefix.
 *
 * Total over the schema's own operator set, so an operator added to
 * `AllOperators` arrives here as a typecheck failure rather than as a sentence
 * reading the token the protocol files it under.
 */
const ALTER_OPERATOR_TEXT = defineMessages({
  EXISTS: {
    id: 'protocolBuilder.ruleDescription.alterExists',
    defaultMessage: 'where',
    description:
      'Phrase for the rule operator that asks only whether the attribute was answered at all. In the alter voice it introduces the attribute rather than following it, so the whole sentence reads "Person where Age". Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  NOT_EXISTS: {
    id: 'protocolBuilder.ruleDescription.alterNotExists',
    defaultMessage: 'without',
    description:
      'Phrase for the rule operator that asks whether the attribute was left unanswered. In the alter voice it introduces the attribute rather than following it, so the whole sentence reads "Person without Age". Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  EXACTLY: {
    id: 'protocolBuilder.ruleDescription.alterExactly',
    defaultMessage: 'is exactly equal to',
    description:
      'Phrase for the rule operator that matches an attribute answered with exactly the value that follows. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  NOT: {
    id: 'protocolBuilder.ruleDescription.alterNot',
    defaultMessage: 'is not',
    description:
      'Phrase for the rule operator that matches an attribute answered with anything other than the value that follows. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  GREATER_THAN: {
    id: 'protocolBuilder.ruleDescription.alterGreaterThan',
    defaultMessage: 'is greater than',
    description:
      'Phrase for the rule operator that matches an attribute answered with a number above the value that follows. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  GREATER_THAN_OR_EQUAL: {
    id: 'protocolBuilder.ruleDescription.alterGreaterThanOrEqual',
    defaultMessage: 'is greater than or equal to',
    description:
      'Phrase for the rule operator that matches an attribute answered with a number above the value that follows, or equal to it. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  LESS_THAN: {
    id: 'protocolBuilder.ruleDescription.alterLessThan',
    defaultMessage: 'is less than',
    description:
      'Phrase for the rule operator that matches an attribute answered with a number below the value that follows. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  LESS_THAN_OR_EQUAL: {
    id: 'protocolBuilder.ruleDescription.alterLessThanOrEqual',
    defaultMessage: 'is less than or equal to',
    description:
      'Phrase for the rule operator that matches an attribute answered with a number below the value that follows, or equal to it. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  CONTAINS: {
    id: 'protocolBuilder.ruleDescription.alterContains',
    defaultMessage: 'contains',
    description:
      'Phrase for the rule operator that matches an attribute whose text answer matches the regular expression that follows. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  DOES_NOT_CONTAIN: {
    id: 'protocolBuilder.ruleDescription.alterDoesNotContain',
    defaultMessage: 'does not contain',
    description:
      'Phrase for the rule operator that matches an attribute whose text answer does not match the regular expression that follows. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  INCLUDES: {
    id: 'protocolBuilder.ruleDescription.alterIncludes',
    defaultMessage: 'includes',
    description:
      'Phrase for the rule operator that matches an attribute answered with one of the options that follow. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  EXCLUDES: {
    id: 'protocolBuilder.ruleDescription.alterExcludes',
    defaultMessage: 'excludes',
    description:
      'Phrase for the rule operator that matches an attribute answered with none of the options that follow. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  OPTIONS_GREATER_THAN: {
    id: 'protocolBuilder.ruleDescription.alterOptionsGreaterThan',
    defaultMessage: 'has selected options greater than',
    description:
      'Phrase for the rule operator that counts how many options a multiple-choice attribute was answered with and matches a count above the number that follows. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  OPTIONS_LESS_THAN: {
    id: 'protocolBuilder.ruleDescription.alterOptionsLessThan',
    defaultMessage: 'has selected options less than',
    description:
      'Phrase for the rule operator that counts how many options a multiple-choice attribute was answered with and matches a count below the number that follows. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  OPTIONS_EQUALS: {
    id: 'protocolBuilder.ruleDescription.alterOptionsEquals',
    defaultMessage: 'has selected options equal to',
    description:
      'Phrase for the rule operator that counts how many options a multiple-choice attribute was answered with and matches exactly the number that follows. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
  OPTIONS_NOT_EQUALS: {
    id: 'protocolBuilder.ruleDescription.alterOptionsNotEquals',
    defaultMessage: 'has selected options not equal to',
    description:
      'Phrase for the rule operator that counts how many options a multiple-choice attribute was answered with and matches any count other than the number that follows. Read inside a sentence about a network member (an alter), between the attribute name and the value: "Person where Age is greater than 30".',
  },
}) satisfies Record<FilterOperator, MessageDescriptor>;

/** The same operators in the ego voice. See `ALTER_OPERATOR_TEXT`. */
const EGO_OPERATOR_TEXT = defineMessages({
  EXISTS: {
    id: 'protocolBuilder.ruleDescription.egoExists',
    defaultMessage: 'has',
    description:
      'Phrase for the rule operator that asks only whether the attribute was answered at all. In the alter voice it introduces the attribute rather than following it, so the whole sentence reads "Person where Age". Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  NOT_EXISTS: {
    id: 'protocolBuilder.ruleDescription.egoNotExists',
    defaultMessage: 'without',
    description:
      'Phrase for the rule operator that asks whether the attribute was left unanswered. In the alter voice it introduces the attribute rather than following it, so the whole sentence reads "Person without Age". Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  EXACTLY: {
    id: 'protocolBuilder.ruleDescription.egoExactly',
    defaultMessage: 'that is exactly equal to',
    description:
      'Phrase for the rule operator that matches an attribute answered with exactly the value that follows. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  NOT: {
    id: 'protocolBuilder.ruleDescription.egoNot',
    defaultMessage: 'that is not',
    description:
      'Phrase for the rule operator that matches an attribute answered with anything other than the value that follows. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  GREATER_THAN: {
    id: 'protocolBuilder.ruleDescription.egoGreaterThan',
    defaultMessage: 'that is greater than',
    description:
      'Phrase for the rule operator that matches an attribute answered with a number above the value that follows. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  GREATER_THAN_OR_EQUAL: {
    id: 'protocolBuilder.ruleDescription.egoGreaterThanOrEqual',
    defaultMessage: 'that is greater than or equal to',
    description:
      'Phrase for the rule operator that matches an attribute answered with a number above the value that follows, or equal to it. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  LESS_THAN: {
    id: 'protocolBuilder.ruleDescription.egoLessThan',
    defaultMessage: 'that is less than',
    description:
      'Phrase for the rule operator that matches an attribute answered with a number below the value that follows. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  LESS_THAN_OR_EQUAL: {
    id: 'protocolBuilder.ruleDescription.egoLessThanOrEqual',
    defaultMessage: 'that is less than or equal to',
    description:
      'Phrase for the rule operator that matches an attribute answered with a number below the value that follows, or equal to it. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  CONTAINS: {
    id: 'protocolBuilder.ruleDescription.egoContains',
    defaultMessage: 'that contains',
    description:
      'Phrase for the rule operator that matches an attribute whose text answer matches the regular expression that follows. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  DOES_NOT_CONTAIN: {
    id: 'protocolBuilder.ruleDescription.egoDoesNotContain',
    defaultMessage: 'that does not contain',
    description:
      'Phrase for the rule operator that matches an attribute whose text answer does not match the regular expression that follows. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  INCLUDES: {
    id: 'protocolBuilder.ruleDescription.egoIncludes',
    defaultMessage: 'that includes',
    description:
      'Phrase for the rule operator that matches an attribute answered with one of the options that follow. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  EXCLUDES: {
    id: 'protocolBuilder.ruleDescription.egoExcludes',
    defaultMessage: 'that excludes',
    description:
      'Phrase for the rule operator that matches an attribute answered with none of the options that follow. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  OPTIONS_GREATER_THAN: {
    id: 'protocolBuilder.ruleDescription.egoOptionsGreaterThan',
    defaultMessage: 'that has selected options greater than',
    description:
      'Phrase for the rule operator that counts how many options a multiple-choice attribute was answered with and matches a count above the number that follows. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  OPTIONS_LESS_THAN: {
    id: 'protocolBuilder.ruleDescription.egoOptionsLessThan',
    defaultMessage: 'that has selected options less than',
    description:
      'Phrase for the rule operator that counts how many options a multiple-choice attribute was answered with and matches a count below the number that follows. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  OPTIONS_EQUALS: {
    id: 'protocolBuilder.ruleDescription.egoOptionsEquals',
    defaultMessage: 'that has selected options equal to',
    description:
      'Phrase for the rule operator that counts how many options a multiple-choice attribute was answered with and matches exactly the number that follows. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
  OPTIONS_NOT_EQUALS: {
    id: 'protocolBuilder.ruleDescription.egoOptionsNotEquals',
    defaultMessage: 'that has selected options not equal to',
    description:
      'Phrase for the rule operator that counts how many options a multiple-choice attribute was answered with and matches any count other than the number that follows. Read inside a sentence about the ego — the interview participant themselves — between the attribute name and the value: "Ego has Age that is greater than 30". English uses a relative clause here where the alter voice does not.',
  },
}) satisfies Record<FilterOperator, MessageDescriptor>;

/**
 * How a presence operator reads when it is the whole predicate.
 *
 * Total over the schema's type-level set, which is the only set a rule with no
 * attribute may draw from — so a third one added there arrives as a typecheck
 * failure rather than as a sentence reading its own token.
 */
const PRESENCE_OPERATOR_TEXT = defineMessages({
  EXISTS: {
    id: 'protocolBuilder.ruleDescription.presenceExists',
    defaultMessage: 'exists',
    description:
      'The whole predicate of a rule that asks only whether any network member of a given type is present in the interview network: "Person exists". Follows the type name.',
  },
  NOT_EXISTS: {
    id: 'protocolBuilder.ruleDescription.presenceNotExists',
    defaultMessage: 'does not exist',
    description:
      'The whole predicate of a rule that asks whether no network member of a given type is present in the interview network: "Person does not exist". Follows the type name.',
  },
}) satisfies Record<PresenceOperator, MessageDescriptor>;

const generalMessages = defineMessages({
  egoLabel: {
    id: 'protocolBuilder.ruleDescription.egoLabel',
    defaultMessage: 'Ego',
    description:
      'What a rule about the interview participant themselves is said to be about. "Ego" is the network-research term for that participant, as opposed to the alters they name. Reads as the subject of the rule sentence: "Ego has Age".',
  },
  unreadableOperand: {
    id: 'protocolBuilder.ruleDescription.unreadableOperand',
    defaultMessage: '(a value this editor cannot read)',
    description:
      'Stands in for the value a rule compares against when the protocol holds something there that cannot be written out at all. Shown in place of the value inside the rule sentence, so the researcher can see which rule to repair.',
  },
});

/**
 * A stored value that is not a string or a number, written out as it stands.
 *
 * Never thrown from and never empty: this is the last thing between a stored
 * operand and a sentence that does not mention it.
 */
const operandLiteral = (item: unknown, intl: IntlShape): string => {
  if (typeof item === 'boolean') return item ? 'true' : 'false';
  const unreadable = () =>
    intl.formatMessage(generalMessages.unreadableOperand);
  try {
    return JSON.stringify(item) ?? unreadable();
  } catch {
    return unreadable();
  }
};

/**
 * The operands a rule compares, each ready to be read out.
 *
 * Two things this deliberately does NOT do. It does not drop a value it cannot
 * recognise — a rule comparing against `[true]` or `[null]` reads as one that
 * compares against nothing at all if it does, which is the one rule the
 * researcher most needs to see. And it substitutes an option's LABEL only for
 * a value that is genuinely one of the shapes an option has: the boolean
 * `true` was previously stringified first and then looked up, so a rule that
 * can never match the option `"true"` was printed under that option's own
 * label.
 *
 * `undefined` is the exception, and is absence rather than a value: an operand
 * that was never entered has nothing to read, and is reported as unfinished.
 */
const operandItems = (
  value: unknown,
  label: (item: string | number) => string | number,
  intl: IntlShape,
): (string | number)[] => {
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap<string | number>((item) => {
    if (typeof item === 'string' || typeof item === 'number') {
      return [label(item)];
    }
    if (item === undefined) return [];
    return [operandLiteral(item, intl)];
  });
};

/**
 * Reads a stored rule back as a sentence.
 *
 * Everything it needs is in the arguments: the rule as stored and the codebook
 * its ids point into. A host with a validated protocol has both, and needs no
 * editing session to print a rule.
 */
export function describeRule({
  rule,
  codebook,
  targets,
  duplicateIds,
  intl = englishIntl,
}: DescribeRuleInput): RuleDescription {
  const problems: RuleProblem[] = [];
  const say = (message: MessageDescriptor, values?: Record<string, string>) =>
    intl.formatMessage(message, values);

  if (!isRuleDraft(rule)) {
    return Object.freeze({
      target: undefined,
      entity: undefined,
      attribute: undefined,
      operator: Object.freeze({ id: undefined, text: '' }),
      operand: undefined,
      attributePresence: false,
      columns: false,
      text: '',
      problems: Object.freeze([
        {
          code: 'unknownTarget' as const,
          message: say(problemMessages.unknownTarget),
        },
      ]),
    });
  }

  const options = ruleDraftOptions(rule);
  const target = isRuleTargetType(rule.type) ? rule.type : undefined;
  if (target === undefined) {
    problems.push({
      code: 'unknownTarget',
      message: say(problemMessages.unknownTarget),
    });
  }

  // A rule that is about something this rule set is not allowed to ask about.
  // The editor does not offer the target here, so the rule was authored
  // elsewhere — and the protocol schema refuses it at the very end, naming a
  // position in an array rather than the row the researcher can act on.
  if (
    target !== undefined &&
    targets !== undefined &&
    !targets.includes(target)
  ) {
    problems.push({
      code: 'targetNotOffered',
      message: say(TARGET_NOT_OFFERED_MESSAGES[target]),
    });
  }

  const entityTypeId =
    typeof options.type === 'string' && options.type !== ''
      ? options.type
      : undefined;
  const attributeId =
    typeof options.attribute === 'string' && options.attribute !== ''
      ? options.attribute
      : undefined;
  const hasAttributeKey = Object.hasOwn(options, 'attribute');

  const entity = describeEntity(codebook, target, entityTypeId, intl);
  if (entity?.missing === true) {
    problems.push({
      code: 'missingEntityType',
      message: say(
        entity.kind === 'node'
          ? problemMessages.missingNodeType
          : entity.kind === 'edge'
            ? problemMessages.missingEdgeType
            : problemMessages.missingEgo,
      ),
    });
  }

  const variables =
    target === undefined ? {} : ruleVariables(codebook, target, entityTypeId);
  const definition = ruleVariable(variables, attributeId);
  const attributeType = ruleVariableType(variables, attributeId);

  const attribute: RuleDescriptionAttribute | undefined =
    attributeId === undefined
      ? undefined
      : Object.freeze({
          id: attributeId,
          label: codebookLabel(definition?.name, attributeId),
          type: attributeType,
          missing: definition === undefined,
        });

  if (attribute?.missing === true) {
    problems.push({
      code: 'missingAttribute',
      message: say(problemMessages.missingAttribute),
    });
  }

  const operatorId =
    typeof options.operator === 'string' && options.operator !== ''
      ? options.operator
      : undefined;
  const isEgo = target === 'ego';
  // A presence rule's operator is the whole predicate ("Person exists"), so it
  // reads differently from the same operator inside an attribute rule.
  const isPresenceRule = !isEgo && !hasAttributeKey;
  const operator: RuleDescriptionOperator = Object.freeze({
    id: operatorId,
    text: operatorText(operatorId, { isEgo, isPresenceRule }, intl),
  });

  const choices = ruleVariableChoices(variables, attributeId);
  const authoredLabels =
    attributeType === 'categorical' || attributeType === 'ordinal';
  const labelFor = (item: string | number) =>
    choices?.find((choice) => choice.value === item)?.label ?? item;

  // A presence rule and an attribute-existence rule both compare nothing, so
  // whatever a legacy protocol left at `value` is not part of the sentence.
  const isExistenceOperator =
    operatorId === 'EXISTS' || operatorId === 'NOT_EXISTS';
  // The option COUNT operators compare how many options are selected, not
  // which, so their operand is a number and never an option label.
  const countsOptions =
    isFilterOperator(operatorId) && operatorsWithOptionCount.has(operatorId);
  const matchesPattern =
    isFilterOperator(operatorId) && operatorsWithRegExp.has(operatorId);
  const rawItems = isExistenceOperator
    ? []
    : operandItems(
        options.value,
        countsOptions ? (item) => item : labelFor,
        intl,
      );
  const operand: RuleDescriptionOperand | undefined =
    rawItems.length === 0
      ? undefined
      : Object.freeze({
          items: Object.freeze(rawItems),
          authoredLabels: authoredLabels && !countsOptions && !matchesPattern,
        });

  // An operator the schema does not accept for this attribute's type. It
  // arrives from OUTSIDE the editor — a collaborator retyping the variable
  // under a rule that was correct when it was written — so it is reported
  // beside the deleted-reference problems rather than left for the refusal
  // that only comes when the whole stage is saved.
  if (
    attribute !== undefined &&
    !attribute.missing &&
    operatorId !== undefined &&
    !isOperatorValidForAttributeType(operatorId, attributeType)
  ) {
    problems.push({
      code: 'invalidOperator',
      message: say(problemMessages.invalidOperator),
    });
  }

  // The same question, asked of a rule that names no attribute at all. Its
  // operator IS the whole predicate, so the only ones the schema allows are
  // the two that ask whether the type is there — anything else is a
  // comparison against nothing, and the row is where the researcher has to see
  // it. Asked only once the target is readable: which operators are legal
  // depends on what the rule is about, and a rule that does not say is already
  // reported for that.
  if (
    isPresenceRule &&
    target !== undefined &&
    operatorId !== undefined &&
    !isPresenceOperator(operatorId)
  ) {
    problems.push({
      code: 'invalidOperator',
      message: say(problemMessages.invalidPresenceOperator),
    });
  }

  // The same retype seen from the other side. An operator can outlive a change
  // of attribute type where the operand it was entered for cannot — `EXACTLY`
  // is legal for a number and for a multi-select alike, but one answers with a
  // number and the other with the list of options that were selected — and the
  // protocol schema accepts either shape at `value` whatever the attribute is,
  // so nothing downstream of the builder can catch it.
  if (
    attribute !== undefined &&
    !attribute.missing &&
    operatorId !== undefined &&
    !isOperandValidForAttributeType(operatorId, attributeType, options.value)
  ) {
    problems.push({
      code: 'invalidOperand',
      message: say(problemMessages.invalidOperand),
    });
  }

  // A `contains` operand is a regular expression, and one that will not
  // compile is a rule that does not ask what it says: the interview swallows
  // the compile error on purpose, so that one malformed pattern cannot break
  // navigation, and then silently matches nothing — or, for "does not
  // contain", everything — for every participant. Nothing downstream of the
  // builder can report it, because a pattern that will not compile is still a
  // string, which is all the protocol schema asks of one.
  if (
    matchesPattern &&
    typeof options.value === 'string' &&
    options.value !== '' &&
    !isCompilablePattern(options.value)
  ) {
    problems.push({
      code: 'invalidPattern',
      message: say(problemMessages.invalidPattern),
    });
  }

  // The same codebook drift again, one step finer. The attribute is still
  // there and still option-bearing, and the operand is still an option value —
  // it is just no longer one this attribute offers, because a collaborator
  // renamed or deleted that option. The rule reads perfectly and can never
  // match, so nothing but this reports it.
  //
  // Reported in two voices, because the operand can fail in two ways: it names
  // an option this attribute does not have, or it is not the kind of value an
  // option can be at all. The second is not a subset of the first — a boolean
  // left behind by the v8 migration compares against a string option — and
  // saying so in the same sentence would send the researcher looking for an
  // option that never existed.
  const optionProblems =
    attribute !== undefined && !attribute.missing && operatorId !== undefined
      ? operandOptionProblems(
          variables,
          attributeId,
          operatorId,
          options.value,
          intl,
        )
      : [];
  if (optionProblems.some((problem) => problem.kind === 'unknownOption')) {
    problems.push({
      code: 'missingOption',
      message: say(problemMessages.missingOption),
    });
  }
  const unusable = optionProblems.find(
    (problem) => problem.kind === 'unusableValue',
  );
  if (unusable !== undefined) {
    problems.push({
      code: 'unusableOption',
      message: say(problemMessages.unusableOption, {
        describedAs: unusable.describedAs,
      }),
    });
  }

  // The same codebook drift once more, for the other attribute whose answers
  // are a known set rather than anything of the right type: a datetime
  // attribute records dates at one resolution and between two bounds, and a
  // rule written before either was changed compares against a date no
  // participant can now record.
  const [dateProblem] =
    attribute !== undefined && !attribute.missing && operatorId !== undefined
      ? operandDateProblems(variables, attributeId, operatorId, options.value)
      : [];
  if (dateProblem !== undefined) {
    problems.push({
      code: 'unusableDate',
      message: unusableDateMessage(dateProblem, intl),
    });
  }

  // And once more for the third attribute whose answers are a known set: the
  // NUMBER of options a categorical attribute can have selected runs from none
  // of them to all of them, and a scalar attribute records a reading on a
  // normalised 0-1 scale. A count past the end of an option list — left there
  // by a collaborator deleting an option — is a comparison no answer can
  // satisfy, and nothing but this reports it.
  const [numberProblem] =
    attribute !== undefined && !attribute.missing && operatorId !== undefined
      ? operandNumberProblems(variables, attributeId, operatorId, options.value)
      : [];
  if (numberProblem !== undefined) {
    problems.push({
      code: 'unusableNumber',
      message: unusableNumberMessage(numberProblem, intl),
    });
  }

  if (!isCompleteRule(rule)) {
    problems.push({
      code: 'incomplete',
      message: say(problemMessages.incomplete),
    });
  }

  // The one part of a rule no control asks for. Both branches of
  // `filterRuleSchema` require `id: z.string()`, so a rule that has none — or
  // holds something that is not a string — is refused when the STAGE is saved,
  // by an issue naming a position in an array rather than the row the
  // researcher can act on. The editor mints one for every rule it commits, so
  // this arrives from a protocol authored elsewhere or merged from a
  // collaborator's edit; reported last because it is the only problem here the
  // researcher repairs simply by opening the rule and finishing it again.
  if (typeof rule.id !== 'string') {
    problems.push({
      code: 'missingId',
      message: say(problemMessages.missingId),
    });
  } else if (duplicateIds?.has(rule.id) === true) {
    // The same id, twice in one set. `findDuplicateId` refuses the protocol
    // for it, and the rule ITSELF looks perfect — so this is the one problem
    // that cannot be found without the rules beside it, and the one the
    // researcher has no other way of seeing. Reported on BOTH rows, because
    // neither is the wrong one: repairing either repairs the set, and the
    // editor mints a fresh id for whichever is opened and saved.
    problems.push({
      code: 'duplicateId',
      message: say(problemMessages.duplicateId),
    });
  }

  const attributePresence = attribute !== undefined && isExistenceOperator;
  const columns = attribute !== undefined && operand !== undefined;

  return Object.freeze({
    target,
    entity,
    attribute,
    operator,
    operand,
    attributePresence,
    columns,
    text: sentence(
      {
        entity,
        attribute,
        operator,
        operand,
        isEgo,
        attributePresence,
      },
      intl,
    ),
    problems: Object.freeze(problems),
  });
}

function describeEntity(
  codebook: Readonly<Codebook>,
  target: RuleTargetType | undefined,
  entityTypeId: string | undefined,
  intl: IntlShape,
): RuleDescriptionEntity | undefined {
  if (target === undefined) return undefined;

  if (target === 'ego') {
    return Object.freeze({
      kind: 'ego' as const,
      label: intl.formatMessage(generalMessages.egoLabel),
      missing: codebook.ego === undefined,
    });
  }

  if (target === 'edge') {
    const definition =
      entityTypeId === undefined ? undefined : codebook.edge?.[entityTypeId];
    return Object.freeze({
      kind: 'edge' as const,
      typeId: entityTypeId,
      label: codebookLabel(definition?.name, entityTypeId ?? ''),
      color: definition?.color ?? DEFAULT_EDGE_COLOR,
      missing: definition === undefined,
    });
  }

  const definition =
    entityTypeId === undefined ? undefined : codebook.node?.[entityTypeId];
  return Object.freeze({
    kind: 'node' as const,
    typeId: entityTypeId,
    label: codebookLabel(definition?.name, entityTypeId ?? ''),
    color: definition?.color ?? DEFAULT_NODE_COLOR,
    shape: definition?.shape.default,
    missing: definition === undefined,
  });
}

function operatorText(
  operatorId: string | undefined,
  context: Readonly<{ isEgo: boolean; isPresenceRule: boolean }>,
  intl: IntlShape,
): string {
  if (operatorId === undefined) return '';
  if (context.isPresenceRule) {
    // A presence rule holding an operator the schema does not allow one is
    // read as its own token, for the same reason as below: a rule nobody can
    // read is a rule nobody can fix.
    return isPresenceOperator(operatorId)
      ? intl.formatMessage(PRESENCE_OPERATOR_TEXT[operatorId])
      : operatorId.toLowerCase();
  }
  // An operator the schema itself does not have is read as its own token: a
  // hand-edited protocol can hold one, and printing it is what lets the
  // researcher see which rule to fix.
  if (!isFilterOperator(operatorId)) return operatorId.toLowerCase();
  return intl.formatMessage(
    context.isEgo
      ? EGO_OPERATOR_TEXT[operatorId]
      : ALTER_OPERATOR_TEXT[operatorId],
  );
}

/**
 * The rule as one plain sentence.
 *
 * Three parts, and only three, because that is what a rule IS on screen: the
 * subject the rule is about, the comparison it makes, and the value it
 * compares against. `RulePreview` lays those same three out as three columns
 * in the printable summary, and each of them holds markup there — a node
 * glyph, an attribute pill, a Markdown-rendered operand — so they cannot be
 * one string in the preview and would drift from it if they were one here.
 *
 * Inside each part nothing is glued together. The subject names the entity and
 * the attribute inside one message, so a translator moves the connecting word
 * ("where", "has") rather than having it concatenated on; the comparison is a
 * whole operator phrase; and a rule whose operator introduces the attribute
 * instead of following it — "Person without Age" — is one message of its own,
 * because adding a connector as well produced "Person where Age where".
 */
function sentence(
  parts: Readonly<{
    entity: RuleDescriptionEntity | undefined;
    attribute: RuleDescriptionAttribute | undefined;
    operator: RuleDescriptionOperator;
    operand: RuleDescriptionOperand | undefined;
    isEgo: boolean;
    attributePresence: boolean;
  }>,
  intl: IntlShape,
): string {
  const entity = parts.entity?.label ?? '';
  const attribute = parts.attribute?.label;

  if (parts.attributePresence && attribute !== undefined) {
    return entity === ''
      ? intl.formatMessage(sentenceMessages.attributePresenceUnknownEntity, {
          operator: parts.operator.text,
          attribute,
        })
      : intl.formatMessage(sentenceMessages.attributePresence, {
          entity,
          operator: parts.operator.text,
          attribute,
        });
  }

  const subject =
    attribute === undefined
      ? entity
      : entity === ''
        ? intl.formatMessage(
            parts.isEgo
              ? ruleSubjectMessages.egoAttributeUnknownEntity
              : ruleSubjectMessages.alterAttributeUnknownEntity,
            { attribute },
          )
        : intl.formatMessage(
            parts.isEgo
              ? ruleSubjectMessages.egoAttribute
              : ruleSubjectMessages.alterAttribute,
            { entity, attribute },
          );

  const sentenceParts = [
    subject,
    parts.operator.text,
    // The operands themselves are stored values, not copy: a comma-separated
    // run of them is what the preview draws beside the comparison.
    parts.operand === undefined
      ? ''
      : parts.operand.items.map(String).join(', '),
  ];
  return sentenceParts.filter((part) => part !== '').join(' ');
}

/**
 * Everything that can be wrong with a rule, in the words the ROW says it.
 *
 * Addressed to a researcher looking at a list of rules, so every one of them
 * ends by naming the two things they can do about it from there. The dialog
 * says the same faults differently, because a researcher inside it is already
 * standing in front of the control that holds the fault.
 */
const problemMessages = defineMessages({
  unknownTarget: {
    id: 'protocolBuilder.ruleDescription.problemUnknownTarget',
    defaultMessage:
      'This rule does not say whether it is about a node, an edge, or the ego. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the rule never recorded what it is about. Node and edge are the two kinds of thing in a network; ego is the interview participant themselves.',
  },
  missingNodeType: {
    id: 'protocolBuilder.ruleDescription.problemMissingNodeType',
    defaultMessage:
      'This rule refers to a node type that is no longer in the codebook. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the node type the rule names has been deleted. The codebook is the protocol’s definition of the node types, edge types and attributes a study records.',
  },
  missingEdgeType: {
    id: 'protocolBuilder.ruleDescription.problemMissingEdgeType',
    defaultMessage:
      'This rule refers to an edge type that is no longer in the codebook. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the edge type the rule names has been deleted. An edge is a relationship between two network members; the codebook is the protocol’s definition of the types and attributes a study records.',
  },
  missingEgo: {
    id: 'protocolBuilder.ruleDescription.problemMissingEgo',
    defaultMessage:
      'This rule refers to the ego, but this protocol no longer defines any ego attributes. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the rule is about the interview participant themselves (the ego) and the protocol records nothing about them any more.',
  },
  missingAttribute: {
    id: 'protocolBuilder.ruleDescription.problemMissingAttribute',
    defaultMessage:
      'This rule refers to an attribute that is no longer in the codebook. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the attribute the rule asks about has been deleted. An attribute is one variable a study records about a node, an edge or the ego.',
  },
  invalidOperator: {
    id: 'protocolBuilder.ruleDescription.problemInvalidOperator',
    defaultMessage:
      'This rule uses an operator that is not valid for its attribute type. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the comparison the rule makes is not one the protocol allows for that kind of attribute — usually because someone changed the attribute after the rule was written.',
  },
  invalidPresenceOperator: {
    id: 'protocolBuilder.ruleDescription.problemInvalidPresenceOperator',
    defaultMessage:
      'This rule asks whether an entity type is present, but uses an operator that cannot ask that. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when a rule about whether any node or edge of a type exists at all uses a comparison that cannot answer that question.',
  },
  invalidOperand: {
    id: 'protocolBuilder.ruleDescription.problemInvalidOperand',
    defaultMessage:
      'This rule compares its attribute against a value of the wrong kind for the attribute’s type. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the stored comparison value is of a kind the attribute is never answered with, so the interview could never match it.',
  },
  invalidPattern: {
    id: 'protocolBuilder.ruleDescription.problemInvalidPattern',
    defaultMessage:
      'This rule compares its attribute against a pattern that is not a valid regular expression, so the interview cannot apply the rule. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the rule’s comparison value is meant to be a regular expression and will not compile. "The interview" is the session a participant takes.',
  },
  missingOption: {
    id: 'protocolBuilder.ruleDescription.problemMissingOption',
    defaultMessage:
      'This rule compares its attribute against an option that is no longer one of that attribute’s choices. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the rule names one of a multiple-choice attribute’s options and that option has since been renamed or deleted.',
  },
  unusableOption: {
    id: 'protocolBuilder.ruleDescription.problemUnusableOption',
    defaultMessage:
      'This rule compares its attribute against {describedAs}, which cannot be one of that attribute’s choices. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the stored comparison value is of no kind an authored option could ever be. describedAs is a noun phrase naming that kind, e.g. "a true/false value".',
  },
  unusableDateWrongResolution: {
    id: 'protocolBuilder.ruleDescription.problemUnusableDateWrongResolution',
    defaultMessage:
      'This rule compares its attribute against “{value}”, but the attribute is now answered with {resolution}. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the attribute records dates at a different precision from the one the rule’s date is written at. value is the stored date, unchanged; resolution is a noun phrase such as "a year".',
  },
  unusableDateImpossible: {
    id: 'protocolBuilder.ruleDescription.problemUnusableDateImpossible',
    defaultMessage:
      'This rule compares its attribute against “{value}”, which is not a date on the calendar. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the rule’s stored date is the right shape but not a real date, e.g. 31 February. value is the stored date, unchanged.',
  },
  unusableDateOutOfRange: {
    id: 'protocolBuilder.ruleDescription.problemUnusableDateOutOfRange',
    defaultMessage:
      'This rule compares its attribute against “{value}”, which is outside the dates that attribute can record. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the rule’s stored date falls outside the range the attribute’s own date picker offers. value is the stored date, unchanged.',
  },
  unusableNumberOptionCount: {
    id: 'protocolBuilder.ruleDescription.problemUnusableNumberOptionCount',
    defaultMessage:
      'This rule compares the number of selected options against {value}. This attribute offers {optionCount, plural, one {# option} other {# options}}, so between 0 and {optionCount, number} of them can be selected. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the rule counts how many options a multiple-choice attribute was answered with and names a count the option list puts out of reach. value is the number the rule names; optionCount is how many options the attribute offers.',
  },
  unusableNumberScale: {
    id: 'protocolBuilder.ruleDescription.problemUnusableNumberScale',
    defaultMessage:
      'This rule compares its attribute against {value}. The attribute is answered on a scale from {min} to {max}. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the attribute records a reading on a fixed scale and the rule names a number off it. value is the number the rule names; min and max are the ends of the scale.',
  },
  incomplete: {
    id: 'protocolBuilder.ruleDescription.problemIncomplete',
    defaultMessage:
      'This rule is not complete. Edit it to fill in every part, or delete it.',
    description:
      'Shown on a rule’s row in the rule list when one of the rule’s parts was never answered.',
  },
  missingId: {
    id: 'protocolBuilder.ruleDescription.problemMissingId',
    defaultMessage:
      'This rule has no identifier, so this protocol cannot be saved with it. Edit the rule to give it one, or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the rule carries no internal identifier. Nothing on screen asks for one — opening and saving the rule supplies it — so the sentence names that repair.',
  },
  duplicateId: {
    id: 'protocolBuilder.ruleDescription.problemDuplicateId',
    defaultMessage:
      'Another rule in this set has the same identifier, so this protocol cannot be saved with both. Edit or delete the rule.',
    description:
      'Shown on the rows of both rules in a rule set that share one internal identifier. Opening and saving either rule gives it a fresh one.',
  },
});

/**
 * What a rule set that cannot be about this target says, in whole sentences.
 *
 * One per target rather than a sentence built around the name of one: the
 * entity class is an internal token, and "This rule is about a ego" is what
 * interpolating it produces.
 */
const TARGET_NOT_OFFERED_MESSAGES = defineMessages({
  ego: {
    id: 'protocolBuilder.ruleDescription.targetNotOfferedEgo',
    defaultMessage:
      'This rule is about the ego, which these rules cannot ask about. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the rule asks about the interview participant themselves (the ego) and this kind of rule set is not allowed to.',
  },
  node: {
    id: 'protocolBuilder.ruleDescription.targetNotOfferedNode',
    defaultMessage:
      'This rule is about a node, which these rules cannot ask about. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the rule asks about a node — a member of the interview network — and this kind of rule set is not allowed to.',
  },
  edge: {
    id: 'protocolBuilder.ruleDescription.targetNotOfferedEdge',
    defaultMessage:
      'This rule is about an edge, which these rules cannot ask about. Edit or delete the rule.',
    description:
      'Shown on a rule’s row in the rule list when the rule asks about an edge — a relationship between two network members — and this kind of rule set is not allowed to.',
  },
}) satisfies Record<RuleTargetType, MessageDescriptor>;

/**
 * The shapes a whole rule sentence takes when the operator introduces the
 * attribute instead of following it.
 *
 * "Person where Age", "Ego has EgoName". The subject shapes the rest of the
 * sentence uses live in `ruleMessages.ts`, because the preview says them too.
 */
const sentenceMessages = defineMessages({
  attributePresence: {
    id: 'protocolBuilder.ruleDescription.sentenceAttributePresence',
    defaultMessage: '{entity} {operator} {attribute}',
    description:
      'A whole rule sentence for a rule that asks only whether an attribute was answered at all, where the operator introduces the attribute: "Person where Age", "Person without Age". entity and attribute are the researcher’s own codebook names and are not translated; operator is the phrase for the comparison.',
  },
  attributePresenceUnknownEntity: {
    id: 'protocolBuilder.ruleDescription.sentenceAttributePresenceUnknownEntity',
    defaultMessage: '{operator} {attribute}',
    description:
      'The same sentence as sentenceAttributePresence, for a broken rule that never said what it is about, so there is no entity to name. attribute is the researcher’s own codebook name; operator is the phrase for the comparison.',
  },
});

/**
 * Why a date operand is reported, as a fact about the rule and nothing more.
 *
 * None of these says the rule can never match, because for some of them that
 * is not true: `not` and `does not contain` are satisfied by every answer that
 * fails the comparison, so a date no attribute can record makes such a rule
 * match every participant rather than none of them. The fact — this is the
 * date, and this is what the attribute records — is what sends the researcher
 * to the right rule either way, and it is how the option messages beside these
 * already read.
 */
const unusableDateMessage = (
  problem: OperandDateProblem,
  intl: IntlShape,
): string => {
  switch (problem.kind) {
    case 'wrongResolution':
      return intl.formatMessage(problemMessages.unusableDateWrongResolution, {
        value: problem.value,
        resolution: intl.formatMessage(
          dateResolutionMessages[problem.resolution],
        ),
      });
    case 'impossibleDate':
      return intl.formatMessage(problemMessages.unusableDateImpossible, {
        value: problem.value,
      });
    case 'outOfRange':
      return intl.formatMessage(problemMessages.unusableDateOutOfRange, {
        value: problem.value,
      });
    default:
      return assertNoSuchDateProblem(problem);
  }
};

/** The same, for a number outside the answers the attribute can record. */
const unusableNumberMessage = (
  problem: OperandNumberProblem,
  intl: IntlShape,
): string => {
  switch (problem.kind) {
    case 'unreachableOptionCount':
      return intl.formatMessage(problemMessages.unusableNumberOptionCount, {
        // The number the RULE names is echoed back as the researcher entered
        // it, never regrouped: it identifies which rule to open.
        value: String(problem.value),
        optionCount: problem.optionCount,
      });
    case 'unreachableScale':
      return intl.formatMessage(problemMessages.unusableNumberScale, {
        value: String(problem.value),
        min: String(problem.min),
        max: String(problem.max),
      });
    default:
      return assertNoSuchNumberProblem(problem);
  }
};
