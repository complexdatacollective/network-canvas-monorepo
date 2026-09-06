import { isEqual } from 'es-toolkit/compat';
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { v4 as uuid } from 'uuid';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Section from '@codaco/fresco-ui/Section';
import type { Codebook, VariableType } from '@codaco/protocol-validation';

import { EntitySelectControl } from '../fields/EntitySelectField.tsx';
import { VariablePickerControl } from '../fields/VariablePicker.tsx';
import DialogForm, {
  type DialogFormErrors,
  type DialogFormProps,
} from '../form/DialogForm.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { protocolAuthoringLinks } from '../interfaces/documentation.ts';
import type { RuleOperatorOption } from './operators.ts';
import { incompleteRulePart, type RuleDraft, type RulePart } from './rule.ts';
import {
  assertNoSuchDateProblem,
  assertNoSuchNumberProblem,
  isRuleTargetType,
  type OperandDateProblem,
  operandDateProblems,
  type OperandNumberProblem,
  operandNumberProblems,
  type OperandOptionProblem,
  operandOptionProblems,
  type RuleChoiceOption,
  type RuleDateParameters,
  type RuleEntityTarget,
  type RuleTargetType,
  type RuleVariableOption,
  ruleOperatorOptions,
  ruleVariableChoices,
  ruleVariableDateParameters,
  ruleVariableOptions,
  ruleVariables,
  ruleVariableType,
} from './ruleCodebook.ts';
import { describeRule, type RuleProblemCode } from './ruleDescription.ts';
import {
  dateResolutionMessages,
  ruleEditorRequiredMessage,
} from './ruleMessages.ts';
import {
  emptyRuleValue,
  RULE_VALUE_FIELD,
  RuleOperandField,
} from './RuleValueField.tsx';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.ruleEditor.title',
    defaultMessage: 'Construct a Rule',
    description:
      'Title of the dialog a researcher builds one rule in. A rule decides which parts of an interview network a stage works on, or whether a stage is shown at all.',
  },
  submit: {
    id: 'protocolBuilder.ruleEditor.submit',
    defaultMessage: 'Finish and Close',
    description:
      'Action that commits the rule being built and closes the rule editor dialog.',
  },
  description: {
    id: 'protocolBuilder.ruleEditor.description',
    defaultMessage:
      'Rules are used to filter the data in your study. You can use them to show or hide nodes and edges based on their attributes. For help with constructing rules, see our documentation articles on <skipLogic>skip logic</skipLogic> and <networkFiltering>network filtering</networkFiltering>.',
    description:
      'Opening paragraph of the rule editor. Nodes are the members of an interview network and edges the relationships between them. The two tags wrap the link text for documentation articles: skip logic decides whether a stage is shown to a participant, network filtering narrows what a stage works on.',
  },
  ruleTargetSection: {
    id: 'protocolBuilder.ruleEditor.ruleTargetSection',
    defaultMessage: 'Rule target',
    description:
      'Heading of the first section of the rule editor, where the researcher says what the rule is about.',
  },
  entityLabel: {
    id: 'protocolBuilder.ruleEditor.entityLabel',
    defaultMessage: 'Entity',
    description:
      'Label of the control where a researcher chooses whether a rule is about a node, an edge, or the ego. Entity is the general word for a thing in the interview network.',
  },
  entityHint: {
    id: 'protocolBuilder.ruleEditor.entityHint',
    defaultMessage: 'Select which network entity your rule should target.',
    description:
      'Guidance under the control where a researcher chooses whether a rule is about a node, an edge, or the ego.',
  },
  nodeTypeLabel: {
    id: 'protocolBuilder.ruleEditor.nodeTypeLabel',
    defaultMessage: 'Node type',
    description:
      'Label of the control where a researcher chooses which kind of node — which kind of network member — a rule is about.',
  },
  edgeTypeLabel: {
    id: 'protocolBuilder.ruleEditor.edgeTypeLabel',
    defaultMessage: 'Edge type',
    description:
      'Label of the control where a researcher chooses which kind of edge — which kind of relationship between network members — a rule is about.',
  },
  nodeTypeHint: {
    id: 'protocolBuilder.ruleEditor.nodeTypeHint',
    defaultMessage:
      'Choose a node type to base your rule on. Remember you can add multiple rules if you need to cover different types.',
    description:
      'Guidance under the control where a researcher chooses which kind of node a rule is about. One rule covers one type, so several types need several rules.',
  },
  edgeTypeHint: {
    id: 'protocolBuilder.ruleEditor.edgeTypeHint',
    defaultMessage:
      'Choose an edge type to base your rule on. Remember you can add multiple rules if you need to cover different types.',
    description:
      'Guidance under the control where a researcher chooses which kind of edge a rule is about. One rule covers one type, so several types need several rules.',
  },
  ruleBasisSection: {
    id: 'protocolBuilder.ruleEditor.ruleBasisSection',
    defaultMessage: 'Rule basis',
    description:
      'Heading of the section where a researcher says whether the rule asks about the presence of a node or edge type or about one of its attributes.',
  },
  ruleKindLabel: {
    id: 'protocolBuilder.ruleEditor.ruleKindLabel',
    defaultMessage: 'Rule type',
    description:
      'Label of the control where a researcher says whether the rule asks about the presence of a node or edge type or about one of its attributes.',
  },
  ruleKindHint: {
    id: 'protocolBuilder.ruleEditor.ruleKindHint',
    defaultMessage:
      'Select whether this rule will be based on the entity type or an attribute.',
    description:
      'Guidance under the control where a researcher says whether the rule asks about the presence of a node or edge type or about one of its attributes.',
  },
  ruleKindAttribute: {
    id: 'protocolBuilder.ruleEditor.ruleKindAttribute',
    defaultMessage: 'Attribute',
    description:
      'One of two choices for what a rule is based on: one of the entity’s attributes — the variables a study records about it.',
  },
  ruleKindPresence: {
    id: 'protocolBuilder.ruleEditor.ruleKindPresence',
    defaultMessage: 'Presence',
    description:
      'One of two choices for what a rule is based on: whether anything of this type is in the interview network at all.',
  },
  ruleKindNodeAttributeHint: {
    id: 'protocolBuilder.ruleEditor.ruleKindNodeAttributeHint',
    defaultMessage: "Rule based on the value of this node type's attributes.",
    description:
      'Explains the "Attribute" choice for a rule about a node — a member of the interview network.',
  },
  ruleKindEdgeAttributeHint: {
    id: 'protocolBuilder.ruleEditor.ruleKindEdgeAttributeHint',
    defaultMessage: "Rule based on the value of this edge type's attributes.",
    description:
      'Explains the "Attribute" choice for a rule about an edge — a relationship between two network members.',
  },
  ruleKindNodePresenceHint: {
    id: 'protocolBuilder.ruleEditor.ruleKindNodePresenceHint',
    defaultMessage:
      'Based on the presence or absence of this node type in the interview network.',
    description:
      'Explains the "Presence" choice for a rule about a node — a member of the interview network.',
  },
  ruleKindEdgePresenceHint: {
    id: 'protocolBuilder.ruleEditor.ruleKindEdgePresenceHint',
    defaultMessage:
      'Based on the presence or absence of this edge type in the interview network.',
    description:
      'Explains the "Presence" choice for a rule about an edge — a relationship between two network members.',
  },
  presenceConditionSection: {
    id: 'protocolBuilder.ruleEditor.presenceConditionSection',
    defaultMessage: 'Presence condition',
    description:
      'Heading of the section where a researcher says whether the rule matches when an entity type is present or when it is absent.',
  },
  ruleStructureSection: {
    id: 'protocolBuilder.ruleEditor.ruleStructureSection',
    defaultMessage: 'Rule structure',
    description:
      'Heading of the section where a researcher chooses the attribute, the comparison and the value a rule is made of.',
  },
  ruleStructureHint: {
    id: 'protocolBuilder.ruleEditor.ruleStructureHint',
    defaultMessage:
      'Choose an attribute, operator, and comparison value to define this rule.',
    description:
      'Guidance under the heading of the section where a researcher chooses the attribute, the comparison and the value a rule is made of.',
  },
  egoAttributeLabel: {
    id: 'protocolBuilder.ruleEditor.egoAttributeLabel',
    defaultMessage: 'Ego attribute',
    description:
      'Label of the control where a researcher chooses which attribute of the ego — the interview participant themselves — a rule asks about.',
  },
  egoAttributeHint: {
    id: 'protocolBuilder.ruleEditor.egoAttributeHint',
    defaultMessage: 'Select the ego attribute this rule will be based on.',
    description:
      'Guidance under the control where a researcher chooses which attribute of the ego — the interview participant themselves — a rule asks about.',
  },
  egoAttributeEmpty: {
    id: 'protocolBuilder.ruleEditor.egoAttributeEmpty',
    defaultMessage: 'This protocol has no ego attributes a rule can compare.',
    description:
      'Shown in place of the attribute list when the protocol records nothing about the ego — the interview participant themselves — that a rule could compare.',
  },
  nodeAttributeLabel: {
    id: 'protocolBuilder.ruleEditor.nodeAttributeLabel',
    defaultMessage: 'Node attribute',
    description:
      'Label of the control where a researcher chooses which attribute of a node — a member of the interview network — a rule asks about.',
  },
  edgeAttributeLabel: {
    id: 'protocolBuilder.ruleEditor.edgeAttributeLabel',
    defaultMessage: 'Edge attribute',
    description:
      'Label of the control where a researcher chooses which attribute of an edge — a relationship between network members — a rule asks about.',
  },
  attributeHint: {
    id: 'protocolBuilder.ruleEditor.attributeHint',
    defaultMessage: 'Select an attribute to base this rule on.',
    description:
      'Guidance under the control where a researcher chooses which attribute of a node or edge a rule asks about.',
  },
  nodeAttributeEmpty: {
    id: 'protocolBuilder.ruleEditor.nodeAttributeEmpty',
    defaultMessage: 'This node type has no attributes a rule can compare.',
    description:
      'Shown in place of the attribute list when the chosen node type records nothing a rule could compare.',
  },
  edgeAttributeEmpty: {
    id: 'protocolBuilder.ruleEditor.edgeAttributeEmpty',
    defaultMessage: 'This edge type has no attributes a rule can compare.',
    description:
      'Shown in place of the attribute list when the chosen edge type records nothing a rule could compare.',
  },
  operatorLabel: {
    id: 'protocolBuilder.ruleEditor.operatorLabel',
    defaultMessage: 'Operator',
    description:
      'Label of the control where a researcher chooses the comparison a rule makes — is exactly, is greater than, and so on.',
  },
  operatorPlaceholder: {
    id: 'protocolBuilder.ruleEditor.operatorPlaceholder',
    defaultMessage: 'Select an operator…',
    description:
      'Placeholder shown in the empty control where a researcher chooses the comparison a rule makes.',
  },
  egoOperatorHint: {
    id: 'protocolBuilder.ruleEditor.egoOperatorHint',
    defaultMessage:
      'Select the operator that will be used to compare the ego attribute to the value.',
    description:
      'Guidance under the comparison control, for a rule about the ego — the interview participant themselves.',
  },
  attributeOperatorHint: {
    id: 'protocolBuilder.ruleEditor.attributeOperatorHint',
    defaultMessage:
      'Select the operator that will be used to compare the attribute to the value.',
    description:
      'Guidance under the comparison control, for a rule about one of a node or edge type’s attributes.',
  },
  entityTypeOperatorHint: {
    id: 'protocolBuilder.ruleEditor.entityTypeOperatorHint',
    defaultMessage:
      'Select the operator that will be used to compare the entity type to the value.',
    description:
      'Guidance under the comparison control, for a rule about whether anything of a node or edge type is in the interview network at all.',
  },
  egoRegExpHint: {
    id: 'protocolBuilder.ruleEditor.egoRegExpHint',
    defaultMessage:
      'Enter the value to compare against. You can use a regular expression to match multiple values.',
    description:
      'Guidance under the value control, for a rule about the ego — the interview participant themselves — whose comparison matches text against a regular expression.',
  },
  attributeRegExpHint: {
    id: 'protocolBuilder.ruleEditor.attributeRegExpHint',
    defaultMessage: 'Enter a regular expression to compare against.',
    description:
      'Guidance under the value control, for a rule about a node or edge attribute whose comparison matches text against a regular expression.',
  },
  staleUnusableOptions: {
    id: 'protocolBuilder.ruleEditor.staleUnusableOptions',
    defaultMessage:
      'This rule compares against {list}, which cannot be one of this attribute’s options. Choose from the options it offers.',
    description:
      'Refusal shown on the value control when the rule holds values of a kind no authored option could ever be. list is the offending values, joined for the reader’s language — each is a noun phrase such as "a true/false value".',
  },
  staleMissingOptions: {
    id: 'protocolBuilder.ruleEditor.staleMissingOptions',
    defaultMessage:
      'This rule compares against {list}, which this attribute no longer offers. Choose from the options it does.',
    description:
      'Refusal shown on the value control when the rule names options this attribute has since stopped offering. list is the offending values, joined for the reader’s language; text values are shown in quotation marks.',
  },
  staleDateWrongResolution: {
    id: 'protocolBuilder.ruleEditor.staleDateWrongResolution',
    defaultMessage:
      'This attribute is now answered with {resolution}, which “{value}” is not. Choose a date it can record.',
    description:
      'Refusal shown on the value control when the attribute records dates at a different precision from the rule’s date. resolution is a noun phrase such as "a year"; value is the stored date, unchanged.',
  },
  staleDateImpossible: {
    id: 'protocolBuilder.ruleEditor.staleDateImpossible',
    defaultMessage:
      '“{value}” is not a date on the calendar. Choose a real date.',
    description:
      'Refusal shown on the value control when the rule’s stored date is the right shape but not a real date, e.g. 31 February. value is the stored date, unchanged.',
  },
  staleDateOutOfRange: {
    id: 'protocolBuilder.ruleEditor.staleDateOutOfRange',
    defaultMessage:
      '“{value}” is outside the dates this attribute can record. Choose a date inside them.',
    description:
      'Refusal shown on the value control when the rule’s stored date falls outside the range the attribute’s own date picker offers. value is the stored date, unchanged.',
  },
  unreachableOptionCount: {
    id: 'protocolBuilder.ruleEditor.unreachableOptionCount',
    defaultMessage:
      'This attribute offers {optionCount, plural, one {# option} other {# options}}, so between 0 and {optionCount, number} of them can be selected. Choose a number in that range.',
    description:
      'Refusal shown on the value control when a rule counts how many options a multiple-choice attribute was answered with and names a count the option list puts out of reach. optionCount is how many options the attribute offers.',
  },
  unreachableScale: {
    id: 'protocolBuilder.ruleEditor.unreachableScale',
    defaultMessage:
      'This attribute is answered on a scale from {min} to {max}. Choose a number in that range.',
    description:
      'Refusal shown on the value control when the attribute records a reading on a fixed scale and the rule names a number off it. min and max are the ends of the scale.',
  },
  refuseTargetEgo: {
    id: 'protocolBuilder.ruleEditor.refuseTargetEgo',
    defaultMessage:
      'These rules cannot ask about the ego. Choose another target.',
    description:
      'Refusal shown on the target control when the rule is about the ego — the interview participant themselves — and this kind of rule set is not allowed to ask about them.',
  },
  refuseTargetNode: {
    id: 'protocolBuilder.ruleEditor.refuseTargetNode',
    defaultMessage:
      'These rules cannot ask about a node. Choose another target.',
    description:
      'Refusal shown on the target control when the rule is about a node — a member of the interview network — and this kind of rule set is not allowed to ask about one.',
  },
  refuseTargetEdge: {
    id: 'protocolBuilder.ruleEditor.refuseTargetEdge',
    defaultMessage:
      'These rules cannot ask about an edge. Choose another target.',
    description:
      'Refusal shown on the target control when the rule is about an edge — a relationship between network members — and this kind of rule set is not allowed to ask about one.',
  },
  refuseRegExp: {
    id: 'protocolBuilder.ruleEditor.refuseRegExp',
    defaultMessage:
      'This is not a valid regular expression. Correct it, or choose a different operator.',
    description:
      'Refusal shown on the value control when the pattern the rule compares against will not compile as a regular expression.',
  },
  refuseIncomplete: {
    id: 'protocolBuilder.ruleEditor.refuseIncomplete',
    defaultMessage:
      'This rule cannot be saved until this question is answered.',
    description:
      'Refusal shown on whichever control in the rule editor is still unanswered when the researcher tries to finish the rule.',
  },
  refuseMissingId: {
    id: 'protocolBuilder.ruleEditor.refuseMissingId',
    defaultMessage:
      'This rule has no identifier. Answer this question again to give it one.',
    description:
      'Refusal shown on the first control of the rule editor when the rule carries no internal identifier. Nothing on screen asks for one, so answering the question again is what supplies it.',
  },
  refuseMissingEntityType: {
    id: 'protocolBuilder.ruleEditor.refuseMissingEntityType',
    defaultMessage:
      'This rule is pointed at "{typeId}", which is no longer in the codebook. Choose another type.',
    description:
      'Refusal shown on the type control when the node or edge type the rule names has been deleted. typeId is that type’s own identifier, shown unchanged so the researcher can match it against the rule. The codebook is the protocol’s definition of the types and attributes a study records.',
  },
  refuseMissingEntityTypeUnnamed: {
    id: 'protocolBuilder.ruleEditor.refuseMissingEntityTypeUnnamed',
    defaultMessage:
      'This rule is pointed at a type that is no longer in the codebook. Choose another one.',
    description:
      'Refusal shown on the type control when the node or edge type the rule names has been deleted and the rule records no identifier to name.',
  },
  refuseMissingAttribute: {
    id: 'protocolBuilder.ruleEditor.refuseMissingAttribute',
    defaultMessage:
      'This rule is about "{attributeId}", which is no longer in the codebook. Choose another attribute.',
    description:
      'Refusal shown on the attribute control when the attribute the rule asks about has been deleted. attributeId is that attribute’s own identifier, shown unchanged so the researcher can match it against the rule.',
  },
  refuseMissingAttributeUnnamed: {
    id: 'protocolBuilder.ruleEditor.refuseMissingAttributeUnnamed',
    defaultMessage:
      'This rule is about an attribute that is no longer in the codebook. Choose another one.',
    description:
      'Refusal shown on the attribute control when the attribute the rule asks about has been deleted and the rule records no identifier to name.',
  },
  refuseMissingEgo: {
    id: 'protocolBuilder.ruleEditor.refuseMissingEgo',
    defaultMessage:
      'This protocol no longer defines any ego attributes, so this rule cannot be about the ego. Choose another target.',
    description:
      'Refusal shown on the target control when the rule is about the ego — the interview participant themselves — and the protocol records nothing about them any more.',
  },
  refuseInvalidOperator: {
    id: 'protocolBuilder.ruleEditor.refuseInvalidOperator',
    defaultMessage:
      'This operator is not valid for this attribute’s type. Choose another one.',
    description:
      'Refusal shown on the comparison control when the protocol does not allow that comparison against this kind of attribute, usually because someone changed the attribute after the rule was written.',
  },
  refuseInvalidPresenceOperator: {
    id: 'protocolBuilder.ruleEditor.refuseInvalidPresenceOperator',
    defaultMessage:
      'This operator cannot ask whether an entity type is present. Choose another one.',
    description:
      'Refusal shown on the comparison control of a rule about whether anything of a node or edge type is in the interview network at all, when the chosen comparison cannot answer that question.',
  },
  refuseInvalidOperand: {
    id: 'protocolBuilder.ruleEditor.refuseInvalidOperand',
    defaultMessage:
      'This is not the kind of value this attribute is answered with. Enter one it can be compared against.',
    description:
      'Refusal shown on the value control when the stored comparison value is of a kind the attribute is never answered with, so the interview could never match it.',
  },
});

const RULE_EDITOR_FORM_ID = 'construct-a-rule';

const TARGET_FIELD = 'type';
const ENTITY_TYPE_FIELD = 'options.type';
const ATTRIBUTE_FIELD = 'options.attribute';
const OPERATOR_FIELD = 'options.operator';

/**
 * Whether an alter rule matches on the entity's presence or on one of its
 * attributes.
 *
 * A registered field rather than component state, so it takes part in the same
 * cascade, dirty-tracking and required-validation as everything else in the
 * dialog. It describes the SHAPE of the rule rather than any of its values, so
 * it is dropped when the rule is assembled (see `ruleDraftFromValues`).
 */
const RULE_KIND_FIELD = 'ruleKind';
const VARIABLE_RULE = 'ALTER/VARIABLE';
const TYPE_RULE = 'ALTER/TYPE';

/**
 * The rule's fields in the order each one constrains the next. A change to any
 * of them invalidates every choice below it, so those are cleared — an
 * operator carried over from a text attribute cannot be applied to a
 * categorical one, and a value carried over from either is meaningless.
 */
const RULE_CASCADE = [
  TARGET_FIELD,
  ENTITY_TYPE_FIELD,
  RULE_KIND_FIELD,
  ATTRIBUTE_FIELD,
  OPERATOR_FIELD,
] as const;

/** Written out per entity kind: an entity class is a token, never copy. */
const ruleKindOptions = (
  target: RuleEntityTarget,
  intl: IntlShape,
): readonly Readonly<{
  label: string;
  description: string;
  value: string;
}>[] => [
  {
    label: intl.formatMessage(messages.ruleKindAttribute),
    description: intl.formatMessage(
      target === 'node'
        ? messages.ruleKindNodeAttributeHint
        : messages.ruleKindEdgeAttributeHint,
    ),
    value: VARIABLE_RULE,
  },
  {
    label: intl.formatMessage(messages.ruleKindPresence),
    description: intl.formatMessage(
      target === 'node'
        ? messages.ruleKindNodePresenceHint
        : messages.ruleKindEdgePresenceHint,
    ),
    value: TYPE_RULE,
  },
];

/** One choice of rule target, as offered by the editor's Entity control. */
export type RuleTypeOption = Readonly<{
  label: string;
  value: RuleTargetType;
  /** Shown so a stored target is visible, but not offered as a choice. */
  disabled?: boolean;
}>;

/**
 * What each target is CALLED, for the one option the host does not supply.
 *
 * The host writes the sentences that describe what a target matches, because
 * only it knows which rule sets it offers. A target a rule already holds that
 * the host does not offer has no such sentence, so it is named — the entity
 * class is a token, and these are the words for it — rather than left out.
 *
 * One whole label per target rather than a name with a note appended: where
 * the note sits relative to the name is a decision for whoever writes the
 * language, and "a ego" is what interpolating the token produces.
 */
const RULE_TARGET_NOT_OFFERED_LABELS = defineMessages({
  node: {
    id: 'protocolBuilder.ruleEditor.targetNotOfferedNodeLabel',
    defaultMessage: 'Node (not offered in this rule set)',
    description:
      'The choice shown, and disabled, when a stored rule is about a node — a member of the interview network — and this rule set does not build node rules. Shown so the researcher can read what their rule targets.',
  },
  edge: {
    id: 'protocolBuilder.ruleEditor.targetNotOfferedEdgeLabel',
    defaultMessage: 'Edge (not offered in this rule set)',
    description:
      'The choice shown, and disabled, when a stored rule is about an edge — a relationship between two network members — and this rule set does not build edge rules.',
  },
  ego: {
    id: 'protocolBuilder.ruleEditor.targetNotOfferedEgoLabel',
    defaultMessage: 'Ego (not offered in this rule set)',
    description:
      'The choice shown, and disabled, when a stored rule is about the ego — the interview participant themselves — and this rule set does not build ego rules.',
  },
}) satisfies Record<RuleTargetType, MessageDescriptor>;

/**
 * The targets on offer, plus the one this rule already has.
 *
 * The protocol schema accepts an ego, node or edge rule in any rule set, while
 * a host offers only the targets its own rule set builds — so a stored rule can
 * hold a target that is not on the list. Left out, the radio group showed
 * nothing chosen over a rule that is pointed somewhere, and saved it back that
 * way. Shown and disabled, the researcher can read what the rule targets and
 * still has to choose again to change it.
 */
const ruleTargetOptions = (
  offered: readonly RuleTypeOption[],
  seeded: string,
  intl: IntlShape,
): readonly RuleTypeOption[] => {
  if (!isRuleTargetType(seeded)) return offered;
  if (offered.some((option) => option.value === seeded)) return offered;
  return [
    ...offered,
    {
      value: seeded,
      label: intl.formatMessage(RULE_TARGET_NOT_OFFERED_LABELS[seeded]),
      disabled: true,
    },
  ];
};

const asString = (value: FieldValue | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const seedRuleKind = (rule: RuleDraft): string | undefined => {
  const options = rule.options;
  if (options === undefined) return undefined;
  if (typeof options.type !== 'string' || options.type === '') return undefined;
  return typeof options.attribute === 'string' ? VARIABLE_RULE : TYPE_RULE;
};

const seedString = (rule: RuleDraft, key: string): string | undefined => {
  const value = rule.options?.[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * The `options` half of the rule, as the form reported it.
 *
 * A key whose value is `undefined` is not an answer. Dropping it is what keeps
 * a presence rule free of the `attribute` key that the completeness check and
 * the protocol schema use to tell the two rule shapes apart.
 */
const ruleOptionsFromValues = (
  value: FieldValue | undefined,
): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const { type, attribute, operator, ...rest } = value;
  return {
    ...rest,
    ...(typeof type === 'string' ? { type } : {}),
    ...(typeof attribute === 'string' ? { attribute } : {}),
    ...(typeof operator === 'string' ? { operator } : {}),
  };
};

/**
 * The rule the form describes, without an identity.
 *
 * `getFormValues` reports only the fields that are currently RENDERED, which
 * is what makes the editor's branches load-bearing: a presence rule has no
 * `attribute` key at all, and an operator that needs no operand contributes no
 * `value`. `ruleKind` describes the shape rather than the rule, so it is not
 * carried across.
 *
 * The id belongs to the rule being edited rather than to the values on screen,
 * so it is joined on at the one place a rule leaves the editor — a check that
 * only reads the draft has no business minting one.
 */
const ruleDraftFromValues = (
  values: Record<string, FieldValue>,
): RuleDraft => ({
  type: typeof values[TARGET_FIELD] === 'string' ? values[TARGET_FIELD] : '',
  options: ruleOptionsFromValues(values.options),
});

/** One of a draft's option ids, or `undefined` when it is not answered. */
const draftString = (
  rule: RuleDraft,
  key: 'type' | 'attribute' | 'operator',
): string | undefined => {
  const value = rule.options?.[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

/**
 * The option values this draft names that its attribute does not offer.
 *
 * Asked of the whole draft rather than of the operand alone, because which
 * options exist is a question about the ATTRIBUTE the draft points at — read
 * live from the codebook, so an option a collaborator deletes while the dialog
 * is open is refused by the next save rather than by the next reload.
 */
const staleRuleOptions = (
  codebook: Readonly<Codebook>,
  rule: RuleDraft,
): OperandOptionProblem[] => {
  const target = isRuleTargetType(rule.type) ? rule.type : undefined;
  if (target === undefined) return [];
  const variables = ruleVariables(codebook, target, draftString(rule, 'type'));
  return operandOptionProblems(
    variables,
    draftString(rule, 'attribute'),
    draftString(rule, 'operator') ?? '',
    rule.options?.value,
  );
};

/**
 * The dates this draft compares against that its attribute can no longer
 * record. Asked of the whole draft for the same reason as the options above:
 * which dates exist is a question about the ATTRIBUTE, read live.
 */
const staleRuleDates = (
  codebook: Readonly<Codebook>,
  rule: RuleDraft,
): OperandDateProblem[] => {
  const target = isRuleTargetType(rule.type) ? rule.type : undefined;
  if (target === undefined) return [];
  const variables = ruleVariables(codebook, target, draftString(rule, 'type'));
  return operandDateProblems(
    variables,
    draftString(rule, 'attribute'),
    draftString(rule, 'operator') ?? '',
    rule.options?.value,
  );
};

/**
 * The numbers this draft compares against that its attribute can never reach.
 * Asked of the whole draft for the same reason as the options and dates above.
 */
const staleRuleNumbers = (
  codebook: Readonly<Codebook>,
  rule: RuleDraft,
): OperandNumberProblem[] => {
  const target = isRuleTargetType(rule.type) ? rule.type : undefined;
  if (target === undefined) return [];
  const variables = ruleVariables(codebook, target, draftString(rule, 'type'));
  return operandNumberProblems(
    variables,
    draftString(rule, 'attribute'),
    draftString(rule, 'operator') ?? '',
    rule.options?.value,
  );
};

/**
 * An operand as it reads in the refusal. Quoted when it is text, so the reason
 * `"1"` was refused against the option whose value is `1` is legible.
 */
const describeStaleOption = (value: string | number): string =>
  typeof value === 'string' ? `"${value}"` : String(value);

/**
 * Why the operand is refused, in whichever of the two voices applies.
 *
 * A value that is not the SHAPE of an option — a boolean the v8 migration left
 * beside the string option it became — never was one of this attribute's
 * choices, so telling the researcher it is "no longer offered" would send them
 * looking through the option list for something that was never in it.
 *
 * The offending values are carried as a LIST rather than joined here: how
 * several of them read together is `Intl.ListFormat`'s answer, and it differs
 * by language.
 */
const staleOptionsMessage = (
  problems: readonly OperandOptionProblem[],
): string => {
  const unusable = problems.flatMap((problem) =>
    problem.kind === 'unusableValue' ? [problem.describedAs] : [],
  );
  if (unusable.length > 0) {
    return createMessageError(messages.staleUnusableOptions, {
      list: { list: unusable },
    });
  }
  const missing = problems.flatMap((problem) =>
    problem.kind === 'unknownOption'
      ? [describeStaleOption(problem.value)]
      : [],
  );
  return createMessageError(messages.staleMissingOptions, {
    list: { list: missing },
  });
};

/**
 * Why a date operand is refused, in the voice of the control holding it.
 *
 * One sentence per problem, because the three send the researcher to different
 * places: the attribute records a different KIND of date now, the date is
 * outside the range it records at all, or the date is not one the calendar
 * has.
 *
 * None of them says the rule can never match, because beside a negating
 * operator that is untrue: `not` is satisfied by every answer that fails the
 * comparison, so a date the attribute cannot record makes such a rule match
 * every participant rather than none. Each states the fact and what to choose
 * instead, which is right whichever operator is above it.
 */
const staleDatesMessage = (problems: readonly OperandDateProblem[]): string => {
  const [problem] = problems;
  if (problem === undefined) return INVALID_OPERAND_MESSAGE;
  switch (problem.kind) {
    case 'wrongResolution':
      return createMessageError(messages.staleDateWrongResolution, {
        value: problem.value,
        // The noun phrase for the precision is a message of its own, carried
        // as a reference so it is chosen in the reader's language too.
        resolution: {
          messageError: createMessageError(
            dateResolutionMessages[problem.resolution],
          ),
        },
      });
    case 'impossibleDate':
      return createMessageError(messages.staleDateImpossible, {
        value: problem.value,
      });
    case 'outOfRange':
      return createMessageError(messages.staleDateOutOfRange, {
        value: problem.value,
      });
    default:
      return assertNoSuchDateProblem(problem);
  }
};

/**
 * Why a number operand is refused, in the voice of the control holding it.
 *
 * The two ranges are named rather than the fault: how many options there are
 * to select, and the scale a scalar attribute is read on, are what the
 * researcher has to choose inside.
 */
const unreachableNumbersMessage = (
  problems: readonly OperandNumberProblem[],
): string => {
  const [problem] = problems;
  if (problem === undefined) return INVALID_OPERAND_MESSAGE;
  switch (problem.kind) {
    case 'unreachableOptionCount':
      return createMessageError(messages.unreachableOptionCount, {
        optionCount: problem.optionCount,
      });
    case 'unreachableScale':
      return createMessageError(messages.unreachableScale, {
        min: String(problem.min),
        max: String(problem.max),
      });
    default:
      return assertNoSuchNumberProblem(problem);
  }
};

/**
 * What a rule set that cannot be about this target says, in whole sentences.
 *
 * One per target rather than a sentence built around the name of one: the
 * entity class is an internal token, and interpolating it produces "a ego".
 */
const TARGET_NOT_OFFERED_MESSAGES: Readonly<Record<RuleTargetType, string>> =
  Object.freeze({
    ego: createMessageError(messages.refuseTargetEgo),
    node: createMessageError(messages.refuseTargetNode),
    edge: createMessageError(messages.refuseTargetEdge),
  });

/** The control the researcher has to visit to supply each part of a rule. */
const RULE_PART_FIELDS: Readonly<Record<RulePart, string>> = Object.freeze({
  target: TARGET_FIELD,
  entityType: ENTITY_TYPE_FIELD,
  attribute: ATTRIBUTE_FIELD,
  operator: OPERATOR_FIELD,
  value: RULE_VALUE_FIELD,
});

/** Where one thing wrong with a rule is reported, and in what words. */
type RuleProblemPlacement = Readonly<{ field: string; message: string }>;

/**
 * What the DIALOG does with each thing that can be wrong with a rule.
 *
 * The row, the rule-set field and this dialog all read a draft through the
 * same `describeRule`, so a rule the list would mark as broken cannot be
 * finished from the editor that is holding it. Three hand-written checks used
 * to stand here instead, and a stale entity type was in none of them: the
 * dialog showed the dead reference, accepted "Finish and Close", and the row
 * it closed onto marked the rule broken a moment later.
 *
 * A total mapping over `RULE_PROBLEM_CODES` rather than a list of the codes
 * this dialog happens to know, for the same reason `RULE_PROBLEM_SUMMARIES` in
 * `ruleSet.ts` is one: a problem added to the description arrives here as a
 * typecheck failure rather than as a save nothing refuses.
 *
 * Only the placement is decided here, never whether a problem counts. The
 * words differ from the row's for one reason: the row addresses a researcher
 * looking at a list ("Edit or delete the rule"), and this addresses one
 * already standing in front of the control that holds it.
 */
const RULE_PROBLEM_PLACEMENTS: Readonly<
  Record<
    RuleProblemCode,
    (rule: RuleDraft, codebook: Readonly<Codebook>) => RuleProblemPlacement
  >
> = Object.freeze({
  // Nothing on screen can say what this rule is about, so the question to
  // answer is the first one.
  unknownTarget: () => ({
    field: TARGET_FIELD,
    message: INCOMPLETE_RULE_MESSAGE,
  }),
  // A target this rule set is not allowed to be about. The radio group already
  // shows it as an option that cannot be chosen; this is what stops the rule
  // being finished while it is still selected.
  targetNotOffered: (rule) => ({
    field: TARGET_FIELD,
    message: isRuleTargetType(rule.type)
      ? TARGET_NOT_OFFERED_MESSAGES[rule.type]
      : INCOMPLETE_RULE_MESSAGE,
  }),
  missingEntityType: (rule) =>
    rule.type === 'ego'
      ? { field: TARGET_FIELD, message: MISSING_EGO_MESSAGE }
      : {
          field: ENTITY_TYPE_FIELD,
          message: missingEntityTypeMessage(draftString(rule, 'type')),
        },
  missingAttribute: (rule) => ({
    field: ATTRIBUTE_FIELD,
    message: missingAttributeMessage(draftString(rule, 'attribute')),
  }),
  // The presence of the `attribute` KEY is what tells the two rule shapes
  // apart, here as everywhere else, and it decides which question the operator
  // was answering.
  invalidOperator: (rule) => ({
    field: OPERATOR_FIELD,
    message: Object.hasOwn(rule.options ?? {}, 'attribute')
      ? INVALID_OPERATOR_MESSAGE
      : INVALID_PRESENCE_OPERATOR_MESSAGE,
  }),
  invalidOperand: () => ({
    field: RULE_VALUE_FIELD,
    message: INVALID_OPERAND_MESSAGE,
  }),
  // A pattern operand the interview could not compile. It used to be checked
  // here and nowhere else, which meant a stored rule holding one was refused
  // only if the researcher happened to reopen that exact rule and submit it.
  invalidPattern: () => ({
    field: RULE_VALUE_FIELD,
    message: INVALID_REG_EXP_MESSAGE,
  }),
  // Both option problems name the VALUES they are about, which is the one
  // thing the row's summary cannot do from a list. Whether an operand is still
  // one of its attribute's options is the editor's question to ask at all: the
  // protocol schema checks the shape of a value and stops there on purpose,
  // because protocols already in the field name options a collaborator has
  // since renamed, and refusing to LOAD one would lock the researcher out of
  // the editor that could fix it (ruling on issue #1548).
  missingOption: (rule, codebook) => ({
    field: RULE_VALUE_FIELD,
    message: staleOptionsMessage(staleRuleOptions(codebook, rule)),
  }),
  unusableOption: (rule, codebook) => ({
    field: RULE_VALUE_FIELD,
    message: staleOptionsMessage(staleRuleOptions(codebook, rule)),
  }),
  // The same question asked of a date: which dates an attribute can record is
  // a property of ITS picker, so the refusal names the date and says what the
  // attribute records now.
  unusableDate: (rule, codebook) => ({
    field: RULE_VALUE_FIELD,
    message: staleDatesMessage(staleRuleDates(codebook, rule)),
  }),
  // And of a number: how many options there are to select, and the scale a
  // scalar attribute is read on, are both the attribute's, so the refusal
  // names the range the researcher has to choose inside.
  unusableNumber: (rule, codebook) => ({
    field: RULE_VALUE_FIELD,
    message: unreachableNumbersMessage(staleRuleNumbers(codebook, rule)),
  }),
  // Reported by the control that holds the gap rather than as a sentence about
  // the rule that names no control at all.
  incomplete: (rule) => ({
    field: RULE_PART_FIELDS[incompleteRulePart(rule) ?? 'target'],
    message: INCOMPLETE_RULE_MESSAGE,
  }),
  // No control on screen holds a rule's id, so the refusal lands on the first
  // question the rule answers. Unreachable from this dialog by construction —
  // it mints an id before it validates, so the draft it judges is the rule it
  // would save — and stated anyway, because the placement table is what stops
  // a problem being added to the description with nowhere to appear.
  missingId: () => ({ field: TARGET_FIELD, message: MISSING_ID_MESSAGE }),
  // Unreachable here for the same reason and by the same mechanism: this
  // dialog is told when the rule it opened shares its id with another, and
  // mints a fresh one before it validates — so the draft it judges is a rule
  // no other rule's id collides with. Stated anyway, because the table is
  // total.
  duplicateId: () => ({ field: TARGET_FIELD, message: MISSING_ID_MESSAGE }),
});

/**
 * Everything the editor can tell about a draft without leaving it, as the
 * refusal it becomes.
 *
 * Pure, and separate from the component, because it is the whole of what
 * "Finish and Close" decides: the dialog only hands it the values the fields
 * currently hold, the codebook the session holds right now, and the targets
 * the rule set it belongs to may be about.
 *
 * Everything it decides comes from `describeRule`, which is the whole point:
 * the row, the rule-set field and this dialog read one description, so a rule
 * the list marks as broken cannot be finished from the editor holding it. A
 * pattern that will not compile used to be checked here and nowhere else, so
 * a stored rule carrying one was refused only if the researcher happened to
 * reopen that exact rule.
 */
export const ruleDraftRefusal = (
  rule: RuleDraft,
  codebook: Readonly<Codebook>,
  allowedTargets: readonly RuleTargetType[],
): DialogFormErrors | undefined => {
  // One refusal, however many problems the rule has: the dialog focuses the
  // first control it names, and the researcher fixes them one at a time.
  const [problem] = describeRule({
    rule,
    codebook,
    targets: allowedTargets,
  }).problems;
  if (problem === undefined) return undefined;

  const { field, message } = RULE_PROBLEM_PLACEMENTS[problem.code](
    rule,
    codebook,
  );
  return { fieldErrors: { [field]: message } };
};

/**
 * Clears every choice below the one that changed.
 *
 * Runs as an observer rather than in an onChange handler because the form
 * store owns `value`/`onChange` for every connected field.
 */
const useRuleCascade = (
  values: Record<(typeof RULE_CASCADE)[number], FieldValue | undefined>,
  emptyValue: FieldValue,
) => {
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const previous = useRef(values);

  useEffect(() => {
    const before = previous.current;
    previous.current = values;

    // A field leaving `undefined` is not a change to cascade from: it is
    // either the field registering with the value the rule was seeded with —
    // which happens for every field at once, and would otherwise wipe the rule
    // being opened — or a first choice, which has nothing below it to
    // invalidate yet.
    const changed = RULE_CASCADE.findIndex(
      (name) =>
        before[name] !== undefined && !isEqual(before[name], values[name]),
    );
    if (changed === -1) return;

    for (const name of RULE_CASCADE.slice(changed + 1)) {
      setFieldValue(name, undefined);
    }
    setFieldValue(RULE_VALUE_FIELD, emptyValue);
  }, [emptyValue, setFieldValue, values]);
};

type BranchProps = Readonly<{
  seed: RuleDraft;
  attributeId: string | undefined;
  operator: string | undefined;
  variableOptions: readonly RuleVariableOption[];
  operatorOptions: readonly RuleOperatorOption[];
  variableType: VariableType | undefined;
  variableChoices: readonly RuleChoiceOption[] | undefined;
  dateParameters: RuleDateParameters;
}>;

function EgoRuleFields({
  seed,
  attributeId,
  operator,
  variableOptions,
  operatorOptions,
  variableType,
  variableChoices,
  dateParameters,
}: BranchProps) {
  const intl = useAppIntl();
  return (
    <Section
      title={intl.formatMessage(messages.ruleStructureSection)}
      description={intl.formatMessage(messages.ruleStructureHint)}
    >
      <Field
        name={ATTRIBUTE_FIELD}
        label={intl.formatMessage(messages.egoAttributeLabel)}
        hint={intl.formatMessage(messages.egoAttributeHint)}
        component={VariablePickerControl}
        options={variableOptions}
        emptyMessage={intl.formatMessage(messages.egoAttributeEmpty)}
        initialValue={seedString(seed, 'attribute')}
        required={intl.formatMessage(ruleEditorRequiredMessage)}
      />
      {attributeId !== undefined && (
        <Field
          name={OPERATOR_FIELD}
          label={intl.formatMessage(messages.operatorLabel)}
          hint={intl.formatMessage(messages.egoOperatorHint)}
          component={NativeSelectField}
          placeholder={intl.formatMessage(messages.operatorPlaceholder)}
          options={[...operatorOptions]}
          initialValue={seedString(seed, 'operator')}
          required={intl.formatMessage(ruleEditorRequiredMessage)}
        />
      )}
      <RuleOperandField
        variableType={variableType}
        operator={operator}
        options={variableChoices}
        dateParameters={dateParameters}
        initialValue={seed.options?.value}
        regExpHint={intl.formatMessage(messages.egoRegExpHint)}
      />
    </Section>
  );
}

type EntityBranchProps = BranchProps &
  Readonly<{
    target: RuleEntityTarget;
    entityTypeId: string | undefined;
    ruleKind: string | undefined;
  }>;

function EntityRuleFields({
  target,
  seed,
  entityTypeId,
  ruleKind,
  attributeId,
  operator,
  variableOptions,
  operatorOptions,
  variableType,
  variableChoices,
  dateParameters,
}: EntityBranchProps) {
  // `rule.type` is the entity CLASS, so it is an internal token and never
  // display copy. Interpolating it produced "node Type" and "Choose an node
  // type…". Each heading and sentence is written out whole rather than
  // assembled from the token, because the indefinite article differs between
  // the two and a sentence built from fragments cannot be localised.
  const isNode = target === 'node';
  const intl = useAppIntl();

  return (
    <>
      <Section
        title={intl.formatMessage(messages.ruleBasisSection)}
        disabled={entityTypeId === undefined}
      >
        <Field
          name={RULE_KIND_FIELD}
          label={intl.formatMessage(messages.ruleKindLabel)}
          hint={intl.formatMessage(messages.ruleKindHint)}
          component={RichSelectGroupField}
          options={[...ruleKindOptions(target, intl)]}
          initialValue={seedRuleKind(seed)}
          required={intl.formatMessage(ruleEditorRequiredMessage)}
        />
      </Section>

      {ruleKind === TYPE_RULE && entityTypeId !== undefined && (
        <Section title={intl.formatMessage(messages.presenceConditionSection)}>
          <Field
            name={OPERATOR_FIELD}
            label={intl.formatMessage(messages.operatorLabel)}
            hint={intl.formatMessage(messages.entityTypeOperatorHint)}
            component={RadioGroupField}
            options={[...operatorOptions]}
            initialValue={seedString(seed, 'operator')}
            required={intl.formatMessage(ruleEditorRequiredMessage)}
          />
        </Section>
      )}

      {ruleKind === VARIABLE_RULE && entityTypeId !== undefined && (
        <Section
          title={intl.formatMessage(messages.ruleStructureSection)}
          description={intl.formatMessage(messages.ruleStructureHint)}
        >
          <Field
            name={ATTRIBUTE_FIELD}
            label={intl.formatMessage(
              isNode
                ? messages.nodeAttributeLabel
                : messages.edgeAttributeLabel,
            )}
            hint={intl.formatMessage(messages.attributeHint)}
            component={VariablePickerControl}
            options={variableOptions}
            emptyMessage={intl.formatMessage(
              isNode
                ? messages.nodeAttributeEmpty
                : messages.edgeAttributeEmpty,
            )}
            initialValue={seedString(seed, 'attribute')}
            required={intl.formatMessage(ruleEditorRequiredMessage)}
          />
          {attributeId !== undefined && (
            <Field
              name={OPERATOR_FIELD}
              label={intl.formatMessage(messages.operatorLabel)}
              hint={intl.formatMessage(messages.attributeOperatorHint)}
              component={NativeSelectField}
              placeholder={intl.formatMessage(messages.operatorPlaceholder)}
              options={[...operatorOptions]}
              initialValue={seedString(seed, 'operator')}
              required={intl.formatMessage(ruleEditorRequiredMessage)}
            />
          )}
          <RuleOperandField
            variableType={variableType}
            operator={operator}
            options={variableChoices}
            dateParameters={dateParameters}
            initialValue={seed.options?.value}
            regExpHint={intl.formatMessage(messages.attributeRegExpHint)}
          />
        </Section>
      )}
    </>
  );
}

function RuleEditorFields({
  seed,
  ruleTypes,
  description,
}: Readonly<{
  seed: RuleDraft;
  ruleTypes: readonly RuleTypeOption[];
  description: ReactNode;
}>) {
  const { protocolContext } = useStageEditorForm();
  const intl = useAppIntl();
  const codebook = protocolContext.codebook;
  const values = useFormValue(RULE_CASCADE);
  const target = isRuleTargetType(values[TARGET_FIELD])
    ? values[TARGET_FIELD]
    : undefined;
  const entityTypeId = asString(values[ENTITY_TYPE_FIELD]);
  const ruleKind = asString(values[RULE_KIND_FIELD]);
  const attributeId = asString(values[ATTRIBUTE_FIELD]);
  const operator = asString(values[OPERATOR_FIELD]);

  // Recomputed from the codebook on every snapshot, so a variable a
  // collaborator adds, renames or deletes while this dialog is open changes
  // what the controls below offer without the dialog being reopened.
  const derived = useMemo(() => {
    const variables =
      target === undefined ? {} : ruleVariables(codebook, target, entityTypeId);
    const variableType = ruleVariableType(variables, attributeId);
    return {
      variableOptions: ruleVariableOptions(variables),
      variableType,
      variableChoices: ruleVariableChoices(variables, attributeId),
      dateParameters: ruleVariableDateParameters(variables, attributeId),
    };
  }, [attributeId, codebook, entityTypeId, target]);

  // The operator the rule HOLDS is part of the list, because a stored operator
  // the editor no longer offers has to be visible rather than left showing the
  // select's placeholder. Read from the field rather than from the seed, so it
  // goes when the cascade clears it.
  const operatorOptions = useMemo(
    () => ruleOperatorOptions(derived.variableType, operator, intl),
    [derived.variableType, intl, operator],
  );

  // The operator is part of the answer: a categorical attribute empties to an
  // empty selection when its options are compared and to no number at all when
  // they are counted, so a cascade that only knew the type parked a list in a
  // numeric control.
  const emptyValue = useMemo(
    () => emptyRuleValue(derived.variableType, operator),
    [derived.variableType, operator],
  );

  useRuleCascade(values, emptyValue);

  const branchProps = {
    seed,
    attributeId,
    operator,
    variableOptions: derived.variableOptions,
    operatorOptions,
    variableType: derived.variableType,
    variableChoices: derived.variableChoices,
    dateParameters: derived.dateParameters,
  };

  return (
    <>
      {/*
        Inside the form rather than passed to the dialog as its `description`,
        which would flatten these documentation links into an announcement the
        researcher cannot follow. As body copy they are ordinary links.
      */}
      <Section
        title={intl.formatMessage(messages.ruleTargetSection)}
        description={description}
      >
        <Field
          name={TARGET_FIELD}
          label={intl.formatMessage(messages.entityLabel)}
          hint={intl.formatMessage(messages.entityHint)}
          component={RadioGroupField}
          options={[...ruleTargetOptions(ruleTypes, seed.type, intl)]}
          initialValue={seed.type === '' ? undefined : seed.type}
          required={intl.formatMessage(ruleEditorRequiredMessage)}
        />
        {(target === 'node' || target === 'edge') && (
          <Field
            name={ENTITY_TYPE_FIELD}
            label={intl.formatMessage(
              target === 'node'
                ? messages.nodeTypeLabel
                : messages.edgeTypeLabel,
            )}
            hint={intl.formatMessage(
              target === 'node' ? messages.nodeTypeHint : messages.edgeTypeHint,
            )}
            component={EntitySelectControl}
            entityType={target}
            initialValue={seedString(seed, 'type')}
            required={intl.formatMessage(ruleEditorRequiredMessage)}
          />
        )}
      </Section>

      {target === 'ego' && <EgoRuleFields {...branchProps} />}
      {(target === 'node' || target === 'edge') && (
        <EntityRuleFields
          {...branchProps}
          target={target}
          entityTypeId={entityTypeId}
          ruleKind={ruleKind}
        />
      )}
    </>
  );
}

export type RuleEditorDialogProps = Readonly<{
  open: boolean;
  /** The rule as this editing session opened on it. */
  seed: RuleDraft;
  ruleTypes: readonly RuleTypeOption[];
  /**
   * What a rule in the set this was opened from may be ABOUT.
   *
   * Narrower than the schema's rule shapes and wider than `ruleTypes`: a set
   * that does not offer to BUILD edge rules is still one the schema lets an
   * edge rule sit in, while an ego rule inside a stage's node/edge filter is
   * one it refuses. Only the second is a refusal, so the two lists are
   * separate.
   */
  allowedTargets: readonly RuleTargetType[];
  /**
   * Takes the finished rule, or REFUSES it.
   *
   * A caller that cannot accept the rule right now — a list that has stopped
   * being editable while this dialog was open — answers with the errors to
   * show instead, exactly as `DialogForm` documents for a save the host cannot
   * take. The dialog then stays open with the draft intact, and the session is
   * not recorded as saved.
   */
  /**
   * Whether another rule in the set this was opened from is already filed
   * under this rule's id.
   *
   * Only the set can answer it, and it decides one thing: whether the id this
   * session commits is the one it opened with. Passed rather than derived
   * because this dialog is handed one rule, never the set around it.
   */
  idIsShared?: boolean;
  onSave: (rule: RuleDraft) => void | DialogFormErrors;
  onCancel: () => void;
  finalFocus?: DialogFormProps['finalFocus'];
  /** Matches an existing list row to this dialog for its shared morph. */
  layoutId?: DialogFormProps['layoutId'];
}>;

/**
 * The rule editor: one `DialogForm` whose fields are the parts of a rule.
 *
 * Nothing about the dialog itself is written here. `DialogForm` owns the
 * separate form store, the confirmation before a dirty draft is discarded, the
 * guard against a second submit while one is in flight, and the shared-element
 * morph out of the row this was opened from — so this file is only the
 * questions a rule is made of, and what it means for one to be unanswered.
 *
 * Every control is connected to that store, so a rule the researcher has not
 * finished cannot be saved and the control that is missing says so itself —
 * before this, the fields ran their own validation, which could only ever be
 * shown for a field that had already been edited, so `required` was invisible
 * on precisely the untouched fields it exists for, and the refusal arrived as
 * a modal that named none of them.
 *
 * The codebook reaches every control through the editor's protocol context,
 * never as a prop and never through a host selector.
 */
export default function RuleEditorDialog({
  open,
  seed,
  ruleTypes,
  allowedTargets,
  idIsShared = false,
  onSave,
  onCancel,
  finalFocus,
  layoutId,
}: RuleEditorDialogProps) {
  /**
   * Whether this editing session ended by saving.
   *
   * `DialogForm` reports one close, however it was reached, while the list
   * this opens from has two answers for it: a saved rule has already been
   * handed over and the list closes the editor by taking the row out of
   * editing, whereas a dismissal has to discard that row. Cancelling after a
   * save would throw away the rule that had just been committed. A session is
   * one mount — the list keys each one — so this records the session's outcome
   * rather than a running state.
   */
  const saved = useRef(false);

  const intl = useAppIntl();

  // The codebook the session holds right now, read through a ref so the check
  // below stays live without giving the validator a new identity on every
  // snapshot the session receives. Same reason `useRuleSetValidation` does it:
  // a collaborator's edit has to reach a dialog that is already open.
  const { protocolContext } = useStageEditorForm();
  const codebookRef = useRef(protocolContext.codebook);
  codebookRef.current = protocolContext.codebook;

  /**
   * Everything the editor can tell about a draft without leaving it, run after
   * every field has validated itself. Every answer names a control, because
   * each is about one: a rule the researcher cannot save is never a general
   * fault with the draft, it is a specific thing that is missing or wrong.
   *
   * The draft is read through the same `describeRule` the rule's own row reads
   * it through, so the two cannot disagree about whether a rule is broken —
   * which is what let a rule pointed at a deleted entity type be saved from
   * here and marked broken by the row a moment later.
   */
  const targetsRef = useRef(allowedTargets);
  targetsRef.current = allowedTargets;

  /**
   * The id this session's rule will be filed under.
   *
   * Decided once per editing session rather than at submit time, so the draft
   * the dialog VALIDATES is the rule it would save. A rule arriving with no id
   * — or with something that is not a string, which the protocol schema
   * refuses just as flatly — is repaired here, and would otherwise be refused
   * by the very dialog that repairs it: nothing on screen asks for an id, so
   * there would be no control to answer.
   *
   * A string another rule in the same set is already filed under mints too,
   * and for the same reason: `findDuplicateId` refuses a filter holding one id
   * twice, so keeping it would save a rule the protocol schema goes on
   * rejecting. That is the only case in which a rule's own string id is
   * replaced, and it happens because the researcher opened this rule and
   * saved it — never behind their back.
   *
   * Any other string the rule already has is its identity, and is kept: the
   * schema accepts it, the row is keyed by it, and replacing one would quietly
   * rewrite the researcher's protocol.
   */
  const ruleId = useRef<string | undefined>(undefined);
  ruleId.current ??=
    typeof seed.id === 'string' && !idIsShared ? seed.id : uuid({});

  const validate = useCallback(
    (values: Record<string, FieldValue>): DialogFormErrors | undefined =>
      ruleDraftRefusal(
        { id: ruleId.current, ...ruleDraftFromValues(values) },
        codebookRef.current,
        targetsRef.current,
      ),
    [],
  );

  const handleSubmit = useCallback(
    (values: Record<string, FieldValue>): DialogFormErrors | undefined => {
      const refused = onSave({
        id: ruleId.current,
        ...ruleDraftFromValues(values),
      });
      // Recorded only once the rule has actually been taken. Marking a refused
      // save as this session's outcome would leave the editor with no way out:
      // `handleClose` swallows every dismissal that follows one.
      if (refused !== undefined) return refused;
      saved.current = true;
      return undefined;
    },
    [onSave],
  );

  const handleClose = useCallback(() => {
    if (saved.current) return;
    onCancel();
  }, [onCancel]);

  return (
    <DialogForm
      open={open}
      onClose={handleClose}
      title={intl.formatMessage(messages.title)}
      formId={RULE_EDITOR_FORM_ID}
      validate={validate}
      onSubmit={handleSubmit}
      submitLabel={intl.formatMessage(messages.submit)}
      size="editor"
      finalFocus={finalFocus}
      layoutId={layoutId}
    >
      <RuleEditorFields
        seed={seed}
        ruleTypes={ruleTypes}
        description={intl.formatMessage(messages.description, {
          // The links are tags inside the sentence rather than markup around
          // fragments of it, so a translator moves the whole clause and the
          // link text with it.
          skipLogic: (chunks: ReactNode) => (
            <NativeLink
              key="skipLogic"
              href={protocolAuthoringLinks.skipLogic}
              target="_blank"
              rel="noopener noreferrer"
            >
              {chunks}
            </NativeLink>
          ),
          networkFiltering: (chunks: ReactNode) => (
            <NativeLink
              key="networkFiltering"
              href={protocolAuthoringLinks.networkFiltering}
              target="_blank"
              rel="noopener noreferrer"
            >
              {chunks}
            </NativeLink>
          ),
        })}
      />
    </DialogForm>
  );
}

/**
 * The refusals this dialog shows, encoded rather than formatted.
 *
 * They cross `DialogForm`'s string-only `fieldErrors` contract on their way to
 * the control that holds the fault, and `FieldErrors` decodes them where they
 * are rendered — which also puts a standing refusal into the reader's new
 * language when they change it, without the researcher having to submit again.
 */
const INVALID_REG_EXP_MESSAGE = createMessageError(messages.refuseRegExp);
const INCOMPLETE_RULE_MESSAGE = createMessageError(messages.refuseIncomplete);
const MISSING_ID_MESSAGE = createMessageError(messages.refuseMissingId);

/**
 * A reference the codebook has lost, named rather than described.
 *
 * "a type that is no longer in the codebook" leaves the researcher comparing
 * the rule against the codebook to work out which one; the id is what the
 * control beside this is showing, so it is what the sentence says.
 */
const missingEntityTypeMessage = (typeId: string | undefined): string =>
  typeId === undefined
    ? createMessageError(messages.refuseMissingEntityTypeUnnamed)
    : createMessageError(messages.refuseMissingEntityType, { typeId });

const missingAttributeMessage = (attributeId: string | undefined): string =>
  attributeId === undefined
    ? createMessageError(messages.refuseMissingAttributeUnnamed)
    : createMessageError(messages.refuseMissingAttribute, { attributeId });

const MISSING_EGO_MESSAGE = createMessageError(messages.refuseMissingEgo);
const INVALID_OPERATOR_MESSAGE = createMessageError(
  messages.refuseInvalidOperator,
);
const INVALID_PRESENCE_OPERATOR_MESSAGE = createMessageError(
  messages.refuseInvalidPresenceOperator,
);
// Says what the value IS rather than what the rule will do, for the reason
// `staleDatesMessage` gives: beside a negating operator a value that can never
// be compared makes the rule match every participant, not none of them.
const INVALID_OPERAND_MESSAGE = createMessageError(
  messages.refuseInvalidOperand,
);
