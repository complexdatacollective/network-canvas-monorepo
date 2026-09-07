import { isEqual } from 'es-toolkit/compat';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { v4 as uuid } from 'uuid';

import {
  createMessageError,
  type IntlShape,
  defineMessages,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import Section from '@codaco/fresco-ui/Section';
import DialogForm, {
  type DialogFormProps,
} from '~/components/DialogForm/DialogForm';
import ArchitectField from '~/components/Form/ArchitectField';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import { documentationLinks } from '~/utils/documentationLinks';

import ExternalLink from '../../ExternalLink';
import { EntitySelectControl } from '../../sections/fields/EntitySelectField/EntitySelectField';
import {
  operatorsWithOptionCount,
  operatorsWithRegExp,
  operatorsWithValue,
} from './options';
import {
  getOperatorOptions,
  getRuleVariableOptions,
  getRuleVariables,
  getRuleVariableType,
  getVariablesAsOptions,
  isRuleTargetType,
  type RuleOptionItem,
  type RuleTargetType,
  type RuleTypeOption,
  type RuleVariableOptionItem,
} from './ruleCodebook';
import {
  getEmptyRuleValue,
  RULE_VALUE_FIELD,
  RuleCountField,
  RuleValueField,
} from './RuleValueField';
import validateRule, { type Rule, type RuleOptions } from './validateRule';
const chromeMessages = defineMessages({
  enterTheValueToCompareAgainst: {
    id: 'architect.chrome.query.rules.ruleEditor.enterTheValueToCompareAgainst',
    defaultMessage:
      'Enter the value to compare against. You can use a regular expression to match multiple values.',
    description:
      'The regExpHint text in components / Query / Rules / RuleEditor.',
  },
  enterARegularExpressionToCompare: {
    id: 'architect.chrome.query.rules.ruleEditor.enterARegularExpressionToCompare',
    defaultMessage: 'Enter a regular expression to compare against.',
    description:
      'The regExpHint text in components / Query / Rules / RuleEditor.',
  },
});
const additionalMessages = defineMessages({
  rulesAreUsedToFilterThe: {
    id: 'architect.additional.query.rules.ruleEditor.rulesAreUsedToFilterThe',
    defaultMessage:
      'Rules are used to filter the data in your study. You can use them to show or hide nodes and edges based on their attributes. For help with constructing rules, see our documentation articles on <ExternalLink> {value1} </ExternalLink> and <ExternalLink2> {value3} </ExternalLink2> .',
    description: 'Visible text in components / Query / Rules / RuleEditor.',
  },
});
const messages = defineMessages({
  selectedOptionCount: {
    id: 'architect.query.rules.ruleEditor.selectedOptionCount',
    defaultMessage: 'Selected option count',
    description: 'The label text in components / Query / Rules / RuleEditor.',
  },
  enterTheNumberOfOptionsThat: {
    id: 'architect.query.rules.ruleEditor.enterTheNumberOfOptionsThat',
    defaultMessage:
      'Enter the number of options that must be selected for this rule to pass.',
    description: 'The hint text in components / Query / Rules / RuleEditor.',
  },
  enterAValue: {
    id: 'architect.query.rules.ruleEditor.enterAValue',
    defaultMessage: 'Enter a value...',
    description:
      'The placeholder text in components / Query / Rules / RuleEditor.',
  },
  attributeValue: {
    id: 'architect.query.rules.ruleEditor.attributeValue',
    defaultMessage: 'Attribute value',
    description: 'The label text in components / Query / Rules / RuleEditor.',
  },
  enterARegularExpression: {
    id: 'architect.query.rules.ruleEditor.enterARegularExpression',
    defaultMessage: 'Enter a regular expression...',
    description:
      'The placeholder text in components / Query / Rules / RuleEditor.',
  },
  enterTheValueToCompareAgainst: {
    id: 'architect.query.rules.ruleEditor.enterTheValueToCompareAgainst',
    defaultMessage: 'Enter the value to compare against.',
    description: 'The hint text in components / Query / Rules / RuleEditor.',
  },
  ruleStructure: {
    id: 'architect.query.rules.ruleEditor.ruleStructure',
    defaultMessage: 'Rule structure',
    description: 'The title text in components / Query / Rules / RuleEditor.',
  },
  egoAttribute: {
    id: 'architect.query.rules.ruleEditor.egoAttribute',
    defaultMessage: 'Ego attribute',
    description: 'The label text in components / Query / Rules / RuleEditor.',
  },
  selectTheEgoAttributeThisRule: {
    id: 'architect.query.rules.ruleEditor.selectTheEgoAttributeThisRule',
    defaultMessage: 'Select the ego attribute this rule will be based on.',
    description: 'The hint text in components / Query / Rules / RuleEditor.',
  },
  operator: {
    id: 'architect.query.rules.ruleEditor.operator',
    defaultMessage: 'Operator',
    description: 'The label text in components / Query / Rules / RuleEditor.',
  },
  selectTheOperatorThatWillBe: {
    id: 'architect.query.rules.ruleEditor.selectTheOperatorThatWillBe',
    defaultMessage:
      'Select the operator that will be used to compare the ego attribute to the value.',
    description: 'The hint text in components / Query / Rules / RuleEditor.',
  },
  selectAnOperator: {
    id: 'architect.query.rules.ruleEditor.selectAnOperator',
    defaultMessage: 'Select an operator…',
    description:
      'The placeholder text in components / Query / Rules / RuleEditor.',
  },
  ruleBasis: {
    id: 'architect.query.rules.ruleEditor.ruleBasis',
    defaultMessage: 'Rule basis',
    description: 'The title text in components / Query / Rules / RuleEditor.',
  },
  ruleType: {
    id: 'architect.query.rules.ruleEditor.ruleType',
    defaultMessage: 'Rule type',
    description: 'The label text in components / Query / Rules / RuleEditor.',
  },
  selectWhetherThisRuleWillBe: {
    id: 'architect.query.rules.ruleEditor.selectWhetherThisRuleWillBe',
    defaultMessage:
      'Select whether this rule will be based on the entity type or an attribute.',
    description: 'The hint text in components / Query / Rules / RuleEditor.',
  },
  presenceCondition: {
    id: 'architect.query.rules.ruleEditor.presenceCondition',
    defaultMessage: 'Presence condition',
    description: 'The title text in components / Query / Rules / RuleEditor.',
  },
  selectTheOperatorThatWillBeb7725: {
    id: 'architect.query.rules.ruleEditor.selectTheOperatorThatWillBeb7725',
    defaultMessage:
      'Select the operator that will be used to compare the entity type to the value.',
    description: 'The hint text in components / Query / Rules / RuleEditor.',
  },
  nodeAttribute: {
    id: 'architect.query.rules.ruleEditor.nodeAttribute',
    defaultMessage: 'Node attribute',
    description: 'The label text in components / Query / Rules / RuleEditor.',
  },
  edgeAttribute: {
    id: 'architect.query.rules.ruleEditor.edgeAttribute',
    defaultMessage: 'Edge attribute',
    description: 'The label text in components / Query / Rules / RuleEditor.',
  },
  selectAnAttributeToBaseThis: {
    id: 'architect.query.rules.ruleEditor.selectAnAttributeToBaseThis',
    defaultMessage: 'Select an attribute to base this rule on.',
    description: 'The hint text in components / Query / Rules / RuleEditor.',
  },
  selectTheOperatorThatWillBea3104: {
    id: 'architect.query.rules.ruleEditor.selectTheOperatorThatWillBea3104',
    defaultMessage:
      'Select the operator that will be used to compare the attribute to the value.',
    description: 'The hint text in components / Query / Rules / RuleEditor.',
  },
  ruleTarget: {
    id: 'architect.query.rules.ruleEditor.ruleTarget',
    defaultMessage: 'Rule target',
    description: 'The title text in components / Query / Rules / RuleEditor.',
  },
  entity: {
    id: 'architect.query.rules.ruleEditor.entity',
    defaultMessage: 'Entity',
    description: 'The label text in components / Query / Rules / RuleEditor.',
  },
  selectWhichNetworkEntityYourRule: {
    id: 'architect.query.rules.ruleEditor.selectWhichNetworkEntityYourRule',
    defaultMessage: 'Select which network entity your rule should target.',
    description: 'The hint text in components / Query / Rules / RuleEditor.',
  },
  nodeType: {
    id: 'architect.query.rules.ruleEditor.nodeType',
    defaultMessage: 'Node type',
    description: 'The label text in components / Query / Rules / RuleEditor.',
  },
  edgeType: {
    id: 'architect.query.rules.ruleEditor.edgeType',
    defaultMessage: 'Edge type',
    description: 'The label text in components / Query / Rules / RuleEditor.',
  },
  chooseANodeTypeToBase: {
    id: 'architect.query.rules.ruleEditor.chooseANodeTypeToBase',
    defaultMessage:
      'Choose a node type to base your rule on. Remember you can add multiple rules if you need to cover different types.',
    description: 'The hint text in components / Query / Rules / RuleEditor.',
  },
  chooseAnEdgeTypeToBase: {
    id: 'architect.query.rules.ruleEditor.chooseAnEdgeTypeToBase',
    defaultMessage:
      'Choose an edge type to base your rule on. Remember you can add multiple rules if you need to cover different types.',
    description: 'The hint text in components / Query / Rules / RuleEditor.',
  },
  skipLogic: {
    id: 'architect.query.rules.ruleEditor.skipLogic',
    defaultMessage: 'skip logic',
    description: 'Visible text in components / Query / Rules / RuleEditor.',
  },
  networkFiltering: {
    id: 'architect.query.rules.ruleEditor.networkFiltering',
    defaultMessage: 'network filtering',
    description: 'Visible text in components / Query / Rules / RuleEditor.',
  },
});
const extraMessages = defineMessages({
  attribute: {
    id: 'architect.ruleKind.attribute',
    defaultMessage: 'Attribute',
    description: 'Researcher-facing Architect control or feedback.',
  },
  presence: {
    id: 'architect.ruleKind.presence',
    defaultMessage: 'Presence',
    description: 'Researcher-facing Architect control or feedback.',
  },
  attributeDescription: {
    id: 'architect.ruleKind.attributeDescription',
    defaultMessage:
      "Rule based on the value of this {target, select, node {node} edge {edge} other {ego}} type's attributes.",
    description: 'Researcher-facing Architect control or feedback.',
  },
  presenceDescription: {
    id: 'architect.ruleKind.presenceDescription',
    defaultMessage:
      'Based on the presence or absence of this {target, select, node {node} edge {edge} other {ego}} type in the interview network.',
    description: 'Researcher-facing Architect control or feedback.',
  },
});
const finalMessages = defineMessages({
  incomplete: {
    id: 'architect.final.components.Query.Rules.RuleEditor.incomplete',
    defaultMessage:
      'This rule is not complete. Please fill in every field before saving it.',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

/** Dialog title and submit label, verbatim — the E2E page object names both. */
const RULE_EDITOR_TITLE = defineMessages({
  message: {
    id: 'architect.constants.components.query.rules.ruleeditor.ruleEditorTitle',
    defaultMessage: 'Construct a Rule',
    description:
      'Researcher-facing status or validation message. Context: components/Query/Rules/RuleEditor.tsx.',
  },
}).message;
const RULE_EDITOR_SUBMIT = defineMessages({
  message: {
    id: 'architect.constants.components.query.rules.ruleeditor.ruleEditorSubmit',
    defaultMessage: 'Finish and Close',
    description:
      'Researcher-facing status or validation message. Context: components/Query/Rules/RuleEditor.tsx.',
  },
}).message;
const RULE_EDITOR_FORM_ID = 'construct-a-rule';

const TARGET_FIELD = 'type';
const ENTITY_TYPE_FIELD = 'options.type';
const ATTRIBUTE_FIELD = 'options.attribute';
const OPERATOR_FIELD = 'options.operator';

/**
 * Whether an alter rule matches on the entity's presence or on one of its
 * attributes.
 *
 * A registered field rather than component state, so it takes part in the
 * same cascade, dirty-tracking and required-validation as everything else in
 * the dialog. It describes the SHAPE of the rule rather than any of its
 * values, so it is dropped when the rule is assembled (see `toRule`).
 */
const RULE_KIND_FIELD = 'ruleKind';
const VARIABLE_RULE = 'ALTER/VARIABLE';
const TYPE_RULE = 'ALTER/TYPE';
const RULE_STRUCTURE_DESCRIPTION = defineMessages({
  message: {
    id: 'architect.constants.components.query.rules.ruleeditor.ruleStructureDescription',
    defaultMessage:
      'Choose an attribute, operator, and comparison value to define this rule.',
    description:
      'Researcher-facing status or validation message. Context: components/Query/Rules/RuleEditor.tsx.',
  },
}).message;

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

const ruleKindOptions = (target: RuleTargetType, intl: IntlShape) => [
  {
    label: intl.formatMessage(extraMessages.attribute),
    description: intl.formatMessage(extraMessages.attributeDescription, {
      target,
    }),
    value: VARIABLE_RULE,
  },
  {
    label: intl.formatMessage(extraMessages.presence),
    description: intl.formatMessage(extraMessages.presenceDescription, {
      target,
    }),
    value: TYPE_RULE,
  },
];

const asString = (value: FieldValue | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** The rule shape this dialog is seeded from and commits back to. */
export type EditableRule = Rule & Record<string, unknown>;

const seedRuleKind = (rule: EditableRule): string | undefined => {
  const options = rule.options;
  if (!options?.type) return undefined;
  return options.attribute ? VARIABLE_RULE : TYPE_RULE;
};

/** The `options` half of the rule, as the form reported it. */
const asRuleOptions = (value: FieldValue | undefined): RuleOptions => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const { type, attribute, operator, ...rest } = value;

  return {
    ...rest,
    ...(typeof type === 'string' ? { type } : {}),
    // A key whose value is `undefined` is not an answer. Dropping it is what
    // keeps a presence rule free of the `attribute` key that `validateRule`
    // and the protocol schema use to tell the two rule shapes apart.
    ...(typeof attribute === 'string' ? { attribute } : {}),
    ...(typeof operator === 'string' ? { operator } : {}),
  };
};

/**
 * The rule the form describes.
 *
 * `getFormValues` reports only the fields that are currently RENDERED, which
 * is what makes the editor's branches load-bearing: a presence rule has no
 * `attribute` key at all — which is how `validateRule` and the protocol schema
 * tell the two rule shapes apart — and an operator that needs no operand
 * contributes no `value`. `ruleKind` describes the shape rather than the rule,
 * so it is not carried across.
 */
const toRule = (
  values: Record<string, FieldValue>,
  seed: EditableRule,
): EditableRule => ({
  id: seed.id ?? uuid(),
  type: typeof values[TARGET_FIELD] === 'string' ? values[TARGET_FIELD] : '',
  options: asRuleOptions(values.options),
});

/**
 * Clears every choice below the one that changed.
 *
 * Runs as an observer rather than in an onChange handler because the form
 * store owns `value`/`onChange` for every connected field — the pattern
 * `ArchitectField` documents for side effects on change.
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
    // which happens for every field at once, and would otherwise wipe the
    // rule being opened — or a first choice, which has nothing below it to
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

type OperandFieldsProps = {
  seed: EditableRule;
  operator: string | undefined;
  variableType: string | undefined;
  variableOptions: RuleOptionItem[] | undefined;
  /** Ego rules address the researcher about "the ego attribute", not "the". */
  regExpHint: string;
};

/**
 * The operand, when the chosen operator takes one. Shared by ego and alter
 * rules: the only difference between them was copy, and a fork over copy is
 * how the ego branch came to be missing the integer option-count control.
 */
const RuleOperandField = ({
  seed,
  operator,
  variableType,
  variableOptions,
  regExpHint,
}: OperandFieldsProps) => {
  const intl = useAppIntl();
  const seedValue = seed.options?.value;

  if (operator && operatorsWithOptionCount.has(operator)) {
    return (
      <RuleCountField
        label={intl.formatMessage(messages.selectedOptionCount)}
        hint={intl.formatMessage(messages.enterTheNumberOfOptionsThat)}
        placeholder={intl.formatMessage(messages.enterAValue)}
        initialValue={seedValue}
      />
    );
  }

  if (operator && operatorsWithRegExp.has(operator)) {
    return (
      <RuleValueField
        label={intl.formatMessage(messages.attributeValue)}
        hint={regExpHint}
        placeholder={intl.formatMessage(messages.enterARegularExpression)}
        variableType={variableType}
        options={variableOptions}
        initialValue={seedValue}
        validation={{ required: true, validRegExp: true }}
      />
    );
  }

  if (operator && operatorsWithValue.has(operator)) {
    return (
      <RuleValueField
        label={intl.formatMessage(messages.attributeValue)}
        hint={intl.formatMessage(messages.enterTheValueToCompareAgainst)}
        placeholder={intl.formatMessage(messages.enterAValue)}
        variableType={variableType}
        options={variableOptions}
        initialValue={seedValue}
        validation={{ required: true }}
      />
    );
  }

  return null;
};

type BranchProps = {
  seed: EditableRule;
  attributeId: string | undefined;
  operator: string | undefined;
  variablesAsOptions: RuleVariableOptionItem[];
  operatorOptions: RuleOptionItem[];
  variableType: string | undefined;
  variableOptions: RuleOptionItem[] | undefined;
};

const EgoRuleFields = ({
  seed,
  attributeId,
  operator,
  variablesAsOptions,
  operatorOptions,
  variableType,
  variableOptions,
}: BranchProps) => {
  const intl = useAppIntl();
  return (
    <Section
      title={intl.formatMessage(messages.ruleStructure)}
      description={intl.formatMessage(RULE_STRUCTURE_DESCRIPTION)}
    >
      <ArchitectField
        name={ATTRIBUTE_FIELD}
        label={intl.formatMessage(messages.egoAttribute)}
        hint={intl.formatMessage(messages.selectTheEgoAttributeThisRule)}
        component={VariablePickerControl}
        entity="ego"
        disallowCreation
        options={variablesAsOptions}
        initialValue={
          typeof seed.options?.attribute === 'string'
            ? seed.options.attribute
            : undefined
        }
        validation={{ required: true }}
      />
      {attributeId && (
        <ArchitectField
          name={OPERATOR_FIELD}
          label={intl.formatMessage(messages.operator)}
          hint={intl.formatMessage(messages.selectTheOperatorThatWillBe)}
          component={NativeSelectField}
          placeholder={intl.formatMessage(messages.selectAnOperator)}
          options={operatorOptions}
          initialValue={
            typeof seed.options?.operator === 'string'
              ? seed.options.operator
              : undefined
          }
          validation={{ required: true }}
        />
      )}
      <RuleOperandField
        seed={seed}
        operator={operator}
        variableType={variableType}
        variableOptions={variableOptions}
        regExpHint={intl.formatMessage(
          chromeMessages.enterTheValueToCompareAgainst,
        )}
      />
    </Section>
  );
};

type EntityBranchProps = BranchProps & {
  target: 'node' | 'edge';
  entityTypeId: string | undefined;
  ruleKind: string | undefined;
};

const EntityRuleFields = ({
  target,
  seed,
  entityTypeId,
  ruleKind,
  attributeId,
  operator,
  variablesAsOptions,
  operatorOptions,
  variableType,
  variableOptions,
}: EntityBranchProps) => {
  const intl = useAppIntl();
  // `rule.type` is the entity CLASS, so it is an internal token and never
  // display copy. Interpolating it produced "node Type" and "Choose an node
  // type…" (#1400). Each heading and sentence is written out whole rather than
  // assembled from the token, because the indefinite article differs between
  // the two and a sentence built from fragments cannot be localised.
  const isNode = target === 'node';

  return (
    <>
      <Section
        title={intl.formatMessage(messages.ruleBasis)}
        disabled={!entityTypeId}
      >
        <ArchitectField
          name={RULE_KIND_FIELD}
          label={intl.formatMessage(messages.ruleType)}
          hint={intl.formatMessage(messages.selectWhetherThisRuleWillBe)}
          component={RichSelectGroupField}
          options={ruleKindOptions(target, intl)}
          initialValue={seedRuleKind(seed)}
          validation={{ required: true }}
        />
      </Section>

      {ruleKind === TYPE_RULE && entityTypeId && (
        <Section title={intl.formatMessage(messages.presenceCondition)}>
          <ArchitectField
            name={OPERATOR_FIELD}
            label={intl.formatMessage(messages.operator)}
            hint={intl.formatMessage(messages.selectTheOperatorThatWillBeb7725)}
            component={RadioGroupField}
            options={operatorOptions}
            initialValue={
              typeof seed.options?.operator === 'string'
                ? seed.options.operator
                : undefined
            }
            validation={{ required: true }}
          />
        </Section>
      )}

      {ruleKind === VARIABLE_RULE && entityTypeId && (
        <Section
          title={intl.formatMessage(messages.ruleStructure)}
          description={intl.formatMessage(RULE_STRUCTURE_DESCRIPTION)}
        >
          <ArchitectField
            name={ATTRIBUTE_FIELD}
            label={
              isNode
                ? intl.formatMessage(messages.nodeAttribute)
                : intl.formatMessage(messages.edgeAttribute)
            }
            hint={intl.formatMessage(messages.selectAnAttributeToBaseThis)}
            component={VariablePickerControl}
            entity={target}
            type={entityTypeId}
            disallowCreation
            options={variablesAsOptions}
            initialValue={
              typeof seed.options?.attribute === 'string'
                ? seed.options.attribute
                : undefined
            }
            validation={{ required: true }}
          />
          {attributeId && (
            <ArchitectField
              name={OPERATOR_FIELD}
              label={intl.formatMessage(messages.operator)}
              hint={intl.formatMessage(
                messages.selectTheOperatorThatWillBea3104,
              )}
              component={NativeSelectField}
              placeholder={intl.formatMessage(messages.selectAnOperator)}
              options={operatorOptions}
              initialValue={
                typeof seed.options?.operator === 'string'
                  ? seed.options.operator
                  : undefined
              }
              validation={{ required: true }}
            />
          )}
          <RuleOperandField
            seed={seed}
            operator={operator}
            variableType={variableType}
            variableOptions={variableOptions}
            regExpHint={intl.formatMessage(
              chromeMessages.enterARegularExpressionToCompare,
            )}
          />
        </Section>
      )}
    </>
  );
};

type RuleEditorFieldsProps = {
  seed: EditableRule;
  ruleTypes: RuleTypeOption[];
  codebook: Record<string, unknown>;
  description: ReactNode;
};

const RuleEditorFields = ({
  seed,
  ruleTypes,
  codebook,
  description,
}: RuleEditorFieldsProps) => {
  const intl = useAppIntl();
  const values = useFormValue(RULE_CASCADE);
  const target = isRuleTargetType(values[TARGET_FIELD])
    ? values[TARGET_FIELD]
    : undefined;
  const entityTypeId = asString(values[ENTITY_TYPE_FIELD]);
  const ruleKind = asString(values[RULE_KIND_FIELD]);
  const attributeId = asString(values[ATTRIBUTE_FIELD]);
  const operator = asString(values[OPERATOR_FIELD]);

  const derived = useMemo(() => {
    const variables = target
      ? getRuleVariables(codebook, target, entityTypeId)
      : {};
    const variableType = getRuleVariableType(variables, attributeId);

    return {
      variablesAsOptions: getVariablesAsOptions(variables),
      variableType,
      variableOptions: getRuleVariableOptions(variables, attributeId),
      operatorOptions: getOperatorOptions(variableType, intl),
    };
  }, [attributeId, codebook, entityTypeId, target, intl]);

  const emptyValue = useMemo(
    () => getEmptyRuleValue(derived.variableType),
    [derived.variableType],
  );

  useRuleCascade(values, emptyValue);

  const branchProps = {
    seed,
    attributeId,
    operator,
    variablesAsOptions: derived.variablesAsOptions,
    operatorOptions: derived.operatorOptions,
    variableType: derived.variableType,
    variableOptions: derived.variableOptions,
  };

  return (
    <>
      {/*
        Inside the form rather than passed to the dialog as its `description`,
        which would flatten these documentation links into an announcement the
        researcher cannot follow. As body copy they are ordinary links.
      */}
      <Section
        title={intl.formatMessage(messages.ruleTarget)}
        description={description}
      >
        <ArchitectField
          name={TARGET_FIELD}
          label={intl.formatMessage(messages.entity)}
          hint={intl.formatMessage(messages.selectWhichNetworkEntityYourRule)}
          component={RadioGroupField}
          options={ruleTypes}
          initialValue={typeof seed.type === 'string' ? seed.type : undefined}
          validation={{ required: true }}
        />
        {(target === 'node' || target === 'edge') && (
          <ArchitectField
            name={ENTITY_TYPE_FIELD}
            label={
              target === 'node'
                ? intl.formatMessage(messages.nodeType)
                : intl.formatMessage(messages.edgeType)
            }
            hint={
              target === 'node'
                ? intl.formatMessage(messages.chooseANodeTypeToBase)
                : intl.formatMessage(messages.chooseAnEdgeTypeToBase)
            }
            component={EntitySelectControl}
            entityType={target}
            allowCreation={false}
            initialValue={
              typeof seed.options?.type === 'string'
                ? seed.options.type
                : undefined
            }
            validation={{ required: true }}
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
};

export type RuleEditorProps = {
  open: boolean;
  /** The rule as this editing session opened on it. */
  seed: EditableRule;
  ruleTypes: RuleTypeOption[];
  codebook: Record<string, unknown>;
  onSave: (rule: EditableRule) => void;
  onCancel: () => void;
  finalFocus?: DialogFormProps['finalFocus'];
  /** Matches an existing ArrayField row to this dialog for its shared morph. */
  layoutId?: DialogFormProps['layoutId'];
};

/**
 * The rule editor: a dialog whose body is an ordinary Architect form.
 *
 * Every control is an `ArchitectField` connected to the dialog's own form
 * store, so a rule the researcher has not finished cannot be saved and the
 * control that is missing says so itself — before this, the fields ran their
 * own validation which could only ever be shown for a field that had already
 * been edited, so `required` was invisible on precisely the untouched fields
 * it exists for, and the refusal arrived as a modal that named none of them.
 *
 * `DialogForm` also brings the nested-draft registration and the
 * discard-confirmation this editor used to hand-roll.
 */
const RuleEditor = ({
  open,
  seed,
  ruleTypes,
  codebook,
  onSave,
  onCancel,
  finalFocus,
  layoutId,
}: RuleEditorProps) => {
  const intl = useAppIntl();
  const handleSubmit = (values: Record<string, FieldValue>) => {
    const rule = toRule(values, seed);

    // The completeness the protocol schema expects, asserted once where the
    // rule leaves the editor. The fields above reject each missing part on
    // their own; this is what makes a gap they do not cover visible instead
    // of silent.
    if (!validateRule(rule)) {
      return {
        success: false as const,
        formErrors: [createMessageError(finalMessages.incomplete)],
      };
    }

    onSave(rule);
    return { success: true as const };
  };

  return (
    <DialogForm
      open={open}
      onClose={onCancel}
      title={intl.formatMessage(RULE_EDITOR_TITLE)}
      formId={RULE_EDITOR_FORM_ID}
      submitLabel={intl.formatMessage(RULE_EDITOR_SUBMIT)}
      onSubmit={handleSubmit}
      size="editor"
      finalFocus={finalFocus}
      layoutId={layoutId}
    >
      <RuleEditorFields
        seed={seed}
        ruleTypes={ruleTypes}
        codebook={codebook}
        description={
          <>
            {intl.formatMessage(additionalMessages.rulesAreUsedToFilterThe, {
              value1: intl.formatMessage(messages.skipLogic),
              ExternalLink: (chunks) => (
                <ExternalLink href={documentationLinks.skipLogic}>
                  {chunks}
                </ExternalLink>
              ),
              value3: intl.formatMessage(messages.networkFiltering),
              ExternalLink2: (chunks) => (
                <ExternalLink href={documentationLinks.networkFiltering}>
                  {chunks}
                </ExternalLink>
              ),
            })}
          </>
        }
      />
    </DialogForm>
  );
};

export default RuleEditor;
