import { isEqual } from 'es-toolkit/compat';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { v4 as uuid } from 'uuid';

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

/** Dialog title and submit label, verbatim — the E2E page object names both. */
const RULE_EDITOR_TITLE = 'Construct a Rule';
const RULE_EDITOR_SUBMIT = 'Finish and Close';
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
const RULE_STRUCTURE_DESCRIPTION =
  'Choose an attribute, operator, and comparison value to define this rule.';

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

const ruleKindOptions = (target: RuleTargetType) => [
  {
    label: 'Attribute',
    description: `Rule based on the value of this ${target} type's attributes.`,
    value: VARIABLE_RULE,
  },
  {
    label: 'Presence',
    description: `Based on the presence or absence of this ${target} type in the interview network.`,
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
  const seedValue = seed.options?.value;

  if (operator && operatorsWithOptionCount.has(operator)) {
    return (
      <RuleCountField
        label="Selected option count"
        hint="Enter the number of options that must be selected for this rule to pass."
        placeholder="Enter a value..."
        initialValue={seedValue}
      />
    );
  }

  if (operator && operatorsWithRegExp.has(operator)) {
    return (
      <RuleValueField
        label="Attribute value"
        hint={regExpHint}
        placeholder="Enter a regular expression..."
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
        label="Attribute value"
        hint="Enter the value to compare against."
        placeholder="Enter a value..."
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
}: BranchProps) => (
  <Section title="Rule structure" description={RULE_STRUCTURE_DESCRIPTION}>
    <ArchitectField
      name={ATTRIBUTE_FIELD}
      label="Ego attribute"
      hint="Select the ego attribute this rule will be based on."
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
        label="Operator"
        hint="Select the operator that will be used to compare the ego attribute to the value."
        component={NativeSelectField}
        placeholder="Select an operator…"
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
      regExpHint="Enter the value to compare against. You can use a regular expression to match multiple values."
    />
  </Section>
);

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
  // `rule.type` is the entity CLASS, so it is an internal token and never
  // display copy. Interpolating it produced "node Type" and "Choose an node
  // type…" (#1400). Each heading and sentence is written out whole rather than
  // assembled from the token, because the indefinite article differs between
  // the two and a sentence built from fragments cannot be localised.
  const isNode = target === 'node';

  return (
    <>
      <Section title="Rule basis" disabled={!entityTypeId}>
        <ArchitectField
          name={RULE_KIND_FIELD}
          label="Rule type"
          hint="Select whether this rule will be based on the entity type or an attribute."
          component={RichSelectGroupField}
          options={ruleKindOptions(target)}
          initialValue={seedRuleKind(seed)}
          validation={{ required: true }}
        />
      </Section>

      {ruleKind === TYPE_RULE && entityTypeId && (
        <Section title="Presence condition">
          <ArchitectField
            name={OPERATOR_FIELD}
            label="Operator"
            hint="Select the operator that will be used to compare the entity type to the value."
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
          title="Rule structure"
          description={RULE_STRUCTURE_DESCRIPTION}
        >
          <ArchitectField
            name={ATTRIBUTE_FIELD}
            label={isNode ? 'Node attribute' : 'Edge attribute'}
            hint="Select an attribute to base this rule on."
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
              label="Operator"
              hint="Select the operator that will be used to compare the attribute to the value."
              component={NativeSelectField}
              placeholder="Select an operator…"
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
            regExpHint="Enter a regular expression to compare against."
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
      operatorOptions: getOperatorOptions(variableType),
    };
  }, [attributeId, codebook, entityTypeId, target]);

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
      <Section title="Rule target" description={description}>
        <ArchitectField
          name={TARGET_FIELD}
          label="Entity"
          hint="Select which network entity your rule should target."
          component={RadioGroupField}
          options={ruleTypes}
          initialValue={typeof seed.type === 'string' ? seed.type : undefined}
          validation={{ required: true }}
        />
        {(target === 'node' || target === 'edge') && (
          <ArchitectField
            name={ENTITY_TYPE_FIELD}
            label={target === 'node' ? 'Node type' : 'Edge type'}
            hint={
              target === 'node'
                ? 'Choose a node type to base your rule on. Remember you can add multiple rules if you need to cover different types.'
                : 'Choose an edge type to base your rule on. Remember you can add multiple rules if you need to cover different types.'
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
  const handleSubmit = (values: Record<string, FieldValue>) => {
    const rule = toRule(values, seed);

    // The completeness the protocol schema expects, asserted once where the
    // rule leaves the editor. The fields above reject each missing part on
    // their own; this is what makes a gap they do not cover visible instead
    // of silent.
    if (!validateRule(rule)) {
      return {
        success: false as const,
        formErrors: [
          'This rule is not complete. Please fill in every field before saving it.',
        ],
      };
    }

    onSave(rule);
    return { success: true as const };
  };

  return (
    <DialogForm
      open={open}
      onClose={onCancel}
      title={RULE_EDITOR_TITLE}
      formId={RULE_EDITOR_FORM_ID}
      submitLabel={RULE_EDITOR_SUBMIT}
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
            Rules are used to filter the data in your study. You can use them to
            show or hide nodes and edges based on their attributes. For help
            with constructing rules, see our documentation articles on{' '}
            <ExternalLink href={documentationLinks.skipLogic}>
              skip logic
            </ExternalLink>{' '}
            and{' '}
            <ExternalLink href={documentationLinks.networkFiltering}>
              network filtering
            </ExternalLink>
            .
          </>
        }
      />
    </DialogForm>
  );
};

export default RuleEditor;
