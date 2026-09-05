import type {
  Codebook,
  ColorReference,
  NodeShape,
  VariableType,
} from '@codaco/protocol-validation';

import {
  isFilterOperator,
  operatorsWithOptionCount,
  operatorsWithRegExp,
} from './operators.ts';
import { isCompleteRule, isRuleDraft, ruleDraftOptions } from './rule.ts';
import {
  codebookLabel,
  DEFAULT_EDGE_COLOR,
  DEFAULT_NODE_COLOR,
  isOperandValidForAttributeType,
  isOperatorValidForAttributeType,
  isRuleTargetType,
  missingOperandOptions,
  type RuleTargetType,
  ruleVariable,
  ruleVariableChoices,
  ruleVariables,
  ruleVariableType,
} from './ruleCodebook.ts';

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

export type RuleProblemCode =
  | 'unknownTarget'
  | 'missingEntityType'
  | 'missingAttribute'
  | 'invalidOperator'
  | 'invalidOperand'
  | 'missingOption'
  | 'incomplete';

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
}>;

/**
 * Operator phrasing, in the two voices a rule sentence needs.
 *
 * An ego rule reads "Ego has Age that is greater than 30"; an alter rule reads
 * "Person where Age is greater than 30". Whole phrases either way — assembling
 * one from "that" plus the alter wording only composes in English.
 */
const OPERATOR_TEXT: Readonly<
  Record<string, Readonly<{ alter: string; ego: string }>>
> = Object.freeze({
  // These two introduce the attribute instead of following it — "Person
  // without Age", "Ego has EgoName" — so each voice states the whole
  // connecting phrase rather than borrowing the one the other rules use.
  EXISTS: { alter: 'where', ego: 'has' },
  NOT_EXISTS: { alter: 'without', ego: 'without' },
  EXACTLY: { alter: 'is exactly equal to', ego: 'that is exactly equal to' },
  NOT: { alter: 'is not', ego: 'that is not' },
  GREATER_THAN: { alter: 'is greater than', ego: 'that is greater than' },
  GREATER_THAN_OR_EQUAL: {
    alter: 'is greater than or equal to',
    ego: 'that is greater than or equal to',
  },
  LESS_THAN: { alter: 'is less than', ego: 'that is less than' },
  LESS_THAN_OR_EQUAL: {
    alter: 'is less than or equal to',
    ego: 'that is less than or equal to',
  },
  CONTAINS: { alter: 'contains', ego: 'that contains' },
  DOES_NOT_CONTAIN: {
    alter: 'does not contain',
    ego: 'that does not contain',
  },
  INCLUDES: { alter: 'includes', ego: 'that includes' },
  EXCLUDES: { alter: 'excludes', ego: 'that excludes' },
  OPTIONS_GREATER_THAN: {
    alter: 'has selected options greater than',
    ego: 'that has selected options greater than',
  },
  OPTIONS_LESS_THAN: {
    alter: 'has selected options less than',
    ego: 'that has selected options less than',
  },
  OPTIONS_EQUALS: {
    alter: 'has selected options equal to',
    ego: 'that has selected options equal to',
  },
  OPTIONS_NOT_EQUALS: {
    alter: 'has selected options not equal to',
    ego: 'that has selected options not equal to',
  },
});

/** How a presence operator reads when it is the whole predicate. */
const PRESENCE_OPERATOR_TEXT: Readonly<Record<string, string>> = Object.freeze({
  EXISTS: 'exists',
  NOT_EXISTS: 'does not exist',
});

const EGO_LABEL = 'Ego';

const operandItems = (value: unknown): (string | number)[] => {
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap<string | number>((item) => {
    if (typeof item === 'string' || typeof item === 'number') return [item];
    if (typeof item === 'boolean') return [item ? 'true' : 'false'];
    return [];
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
}: DescribeRuleInput): RuleDescription {
  const problems: RuleProblem[] = [];

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
          message: UNKNOWN_TARGET_MESSAGE,
        },
      ]),
    });
  }

  const options = ruleDraftOptions(rule);
  const target = isRuleTargetType(rule.type) ? rule.type : undefined;
  if (target === undefined) {
    problems.push({ code: 'unknownTarget', message: UNKNOWN_TARGET_MESSAGE });
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

  const entity = describeEntity(codebook, target, entityTypeId);
  if (entity?.missing === true) {
    problems.push({
      code: 'missingEntityType',
      message:
        entity.kind === 'node'
          ? MISSING_NODE_TYPE_MESSAGE
          : entity.kind === 'edge'
            ? MISSING_EDGE_TYPE_MESSAGE
            : MISSING_EGO_MESSAGE,
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
      message: MISSING_ATTRIBUTE_MESSAGE,
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
    text: operatorText(operatorId, { isEgo, isPresenceRule }),
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
  const rawItems = isExistenceOperator ? [] : operandItems(options.value);
  const operand: RuleDescriptionOperand | undefined =
    rawItems.length === 0
      ? undefined
      : Object.freeze({
          items: Object.freeze(
            countsOptions ? rawItems : rawItems.map(labelFor),
          ),
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
      message: INVALID_OPERATOR_MESSAGE,
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
      message: INVALID_OPERAND_MESSAGE,
    });
  }

  // The same codebook drift again, one step finer. The attribute is still
  // there and still option-bearing, and the operand is still an option value —
  // it is just no longer one this attribute offers, because a collaborator
  // renamed or deleted that option. The rule reads perfectly and can never
  // match, so nothing but this reports it.
  if (
    attribute !== undefined &&
    !attribute.missing &&
    operatorId !== undefined &&
    missingOperandOptions(variables, attributeId, operatorId, options.value)
      .length > 0
  ) {
    problems.push({ code: 'missingOption', message: MISSING_OPTION_MESSAGE });
  }

  if (!isCompleteRule(rule)) {
    problems.push({ code: 'incomplete', message: INCOMPLETE_MESSAGE });
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
    text: sentence({
      entity,
      attribute,
      operator,
      operand,
      isEgo,
      attributePresence,
    }),
    problems: Object.freeze(problems),
  });
}

function describeEntity(
  codebook: Readonly<Codebook>,
  target: RuleTargetType | undefined,
  entityTypeId: string | undefined,
): RuleDescriptionEntity | undefined {
  if (target === undefined) return undefined;

  if (target === 'ego') {
    return Object.freeze({
      kind: 'ego' as const,
      label: EGO_LABEL,
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
): string {
  if (operatorId === undefined) return '';
  if (context.isPresenceRule) {
    return PRESENCE_OPERATOR_TEXT[operatorId] ?? operatorId.toLowerCase();
  }
  const phrasing = OPERATOR_TEXT[operatorId];
  if (phrasing === undefined) return operatorId.toLowerCase();
  return context.isEgo ? phrasing.ego : phrasing.alter;
}

/**
 * The rule as one plain sentence.
 *
 * Assembled from whole phrases with single spaces between them: this is the
 * printable fallback and the accessible name a host reads out, not a template
 * a translator has to reconstruct grammar from.
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
): string {
  const words: string[] = [];
  if (parts.entity !== undefined) words.push(parts.entity.label);

  // A rule about whether the attribute was answered at all reads as one
  // phrase — "Person without Age" — because its operator IS the word that
  // introduces the attribute. Adding the connector as well, and then the
  // operator again after the name, produced "Person where Age where".
  if (parts.attributePresence && parts.attribute !== undefined) {
    words.push(parts.operator.text, parts.attribute.label);
    return words.filter((word) => word !== '').join(' ');
  }

  if (parts.attribute !== undefined) {
    words.push(parts.isEgo ? 'has' : 'where', parts.attribute.label);
  }
  if (parts.operator.text !== '') words.push(parts.operator.text);
  if (parts.operand !== undefined) {
    words.push(parts.operand.items.map(String).join(', '));
  }
  return words.filter((word) => word !== '').join(' ');
}

const UNKNOWN_TARGET_MESSAGE =
  'This rule does not say whether it is about a node, an edge, or the ego. Edit or delete the rule.';
const MISSING_NODE_TYPE_MESSAGE =
  'This rule refers to a node type that is no longer in the codebook. Edit or delete the rule.';
const MISSING_EDGE_TYPE_MESSAGE =
  'This rule refers to an edge type that is no longer in the codebook. Edit or delete the rule.';
const MISSING_EGO_MESSAGE =
  'This rule refers to the ego, but this protocol no longer defines any ego attributes. Edit or delete the rule.';
const MISSING_ATTRIBUTE_MESSAGE =
  'This rule refers to an attribute that is no longer in the codebook. Edit or delete the rule.';
const INVALID_OPERATOR_MESSAGE =
  'This rule uses an operator that is not valid for its attribute type. Edit or delete the rule.';
const INVALID_OPERAND_MESSAGE =
  'This rule compares its attribute against a value of the wrong kind for the attribute’s type. Edit or delete the rule.';
const MISSING_OPTION_MESSAGE =
  'This rule compares its attribute against an option that is no longer one of that attribute’s choices. Edit or delete the rule.';
const INCOMPLETE_MESSAGE =
  'This rule is not complete. Edit it to fill in every part, or delete it.';
