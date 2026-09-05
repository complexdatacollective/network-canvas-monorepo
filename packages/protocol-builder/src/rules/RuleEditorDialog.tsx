import { isEqual } from 'es-toolkit/compat';
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { v4 as uuid } from 'uuid';

import Field from '@codaco/fresco-ui/form/Field/Field';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';

import { EntitySelectControl } from '../fields/EntitySelectField.tsx';
import { VariablePickerControl } from '../fields/VariablePicker.tsx';
import DialogForm, {
  type DialogFormErrors,
  type DialogFormProps,
} from '../form/DialogForm.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { protocolAuthoringLinks } from '../interfaces/documentation.ts';
import {
  isFilterOperator,
  operatorsWithOptionCount,
  operatorsWithRegExp,
  operatorsWithValue,
  type RuleOperatorOption,
} from './operators.ts';
import { incompleteRulePart, type RuleDraft, type RulePart } from './rule.ts';
import {
  isRuleTargetType,
  type RuleChoiceOption,
  type RuleEntityTarget,
  type RuleTargetType,
  type RuleVariableOption,
  ruleOperatorOptions,
  ruleVariableChoices,
  ruleVariableOptions,
  ruleVariables,
  ruleVariableType,
} from './ruleCodebook.ts';
import {
  emptyRuleValue,
  RULE_VALUE_FIELD,
  RuleCountField,
  RuleValueField,
} from './RuleValueField.tsx';

/** Dialog title and submit label, verbatim — host page objects name both. */
const RULE_EDITOR_TITLE = 'Construct a Rule';
const RULE_EDITOR_SUBMIT = 'Finish and Close';
const RULE_EDITOR_FORM_ID = 'construct-a-rule';

const TARGET_FIELD = 'type';
const ENTITY_TYPE_FIELD = 'options.type';
const ATTRIBUTE_FIELD = 'options.attribute';
const OPERATOR_FIELD = 'options.operator';

const REQUIRED_MESSAGE = 'This field is required.';

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

/** Written out per entity kind: an entity class is a token, never copy. */
const RULE_KIND_OPTIONS: Readonly<
  Record<
    RuleEntityTarget,
    readonly Readonly<{ label: string; description: string; value: string }>[]
  >
> = Object.freeze({
  node: [
    {
      label: 'Attribute',
      description: "Rule based on the value of this node type's attributes.",
      value: VARIABLE_RULE,
    },
    {
      label: 'Presence',
      description:
        'Based on the presence or absence of this node type in the interview network.',
      value: TYPE_RULE,
    },
  ],
  edge: [
    {
      label: 'Attribute',
      description: "Rule based on the value of this edge type's attributes.",
      value: VARIABLE_RULE,
    },
    {
      label: 'Presence',
      description:
        'Based on the presence or absence of this edge type in the interview network.',
      value: TYPE_RULE,
    },
  ],
});

/** One choice of rule target, as offered by the editor's Entity control. */
export type RuleTypeOption = Readonly<{
  label: string;
  value: RuleTargetType;
}>;

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

/** The control the researcher has to visit to supply each part of a rule. */
const RULE_PART_FIELDS: Readonly<Record<RulePart, string>> = Object.freeze({
  target: TARGET_FIELD,
  entityType: ENTITY_TYPE_FIELD,
  attribute: ATTRIBUTE_FIELD,
  operator: OPERATOR_FIELD,
  value: RULE_VALUE_FIELD,
});

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

type OperandFieldProps = Readonly<{
  seed: RuleDraft;
  operator: string | undefined;
  variableType: VariableType | undefined;
  variableChoices: readonly RuleChoiceOption[] | undefined;
  /** Ego rules address the researcher about the ego's own attribute. */
  regExpHint: string;
}>;

/**
 * The operand, when the chosen operator takes one. Shared by ego and alter
 * rules: the only difference between them was copy, and a fork over copy is
 * how the ego branch came to be missing the integer option-count control.
 */
function RuleOperandField({
  seed,
  operator,
  variableType,
  variableChoices,
  regExpHint,
}: OperandFieldProps) {
  const seedValue = seed.options?.value;
  if (!isFilterOperator(operator)) return null;

  if (operatorsWithOptionCount.has(operator)) {
    return (
      <RuleCountField
        label="Selected option count"
        hint="Enter the number of options that must be selected for this rule to pass."
        placeholder="Enter a value..."
        initialValue={seedValue}
      />
    );
  }

  if (operatorsWithRegExp.has(operator)) {
    return (
      <RuleValueField
        label="Attribute value"
        hint={regExpHint}
        placeholder="Enter a regular expression..."
        variableType={variableType}
        options={variableChoices}
        initialValue={seedValue}
        required
      />
    );
  }

  if (operatorsWithValue.has(operator)) {
    return (
      <RuleValueField
        label="Attribute value"
        hint="Enter the value to compare against."
        placeholder="Enter a value..."
        variableType={variableType}
        options={variableChoices}
        initialValue={seedValue}
        required
      />
    );
  }

  return null;
}

type BranchProps = Readonly<{
  seed: RuleDraft;
  attributeId: string | undefined;
  operator: string | undefined;
  variableOptions: readonly RuleVariableOption[];
  operatorOptions: readonly RuleOperatorOption[];
  variableType: VariableType | undefined;
  variableChoices: readonly RuleChoiceOption[] | undefined;
}>;

function EgoRuleFields({
  seed,
  attributeId,
  operator,
  variableOptions,
  operatorOptions,
  variableType,
  variableChoices,
}: BranchProps) {
  return (
    <Section title="Rule structure" description={RULE_STRUCTURE_DESCRIPTION}>
      <Field
        name={ATTRIBUTE_FIELD}
        label="Ego attribute"
        hint="Select the ego attribute this rule will be based on."
        component={VariablePickerControl}
        options={variableOptions}
        emptyMessage="This protocol has no ego attributes a rule can compare."
        initialValue={seedString(seed, 'attribute')}
        required={REQUIRED_MESSAGE}
      />
      {attributeId !== undefined && (
        <Field
          name={OPERATOR_FIELD}
          label="Operator"
          hint="Select the operator that will be used to compare the ego attribute to the value."
          component={NativeSelectField}
          placeholder="Select an operator…"
          options={[...operatorOptions]}
          initialValue={seedString(seed, 'operator')}
          required={REQUIRED_MESSAGE}
        />
      )}
      <RuleOperandField
        seed={seed}
        operator={operator}
        variableType={variableType}
        variableChoices={variableChoices}
        regExpHint="Enter the value to compare against. You can use a regular expression to match multiple values."
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
}: EntityBranchProps) {
  // `rule.type` is the entity CLASS, so it is an internal token and never
  // display copy. Interpolating it produced "node Type" and "Choose an node
  // type…". Each heading and sentence is written out whole rather than
  // assembled from the token, because the indefinite article differs between
  // the two and a sentence built from fragments cannot be localised.
  const isNode = target === 'node';

  return (
    <>
      <Section title="Rule basis" disabled={entityTypeId === undefined}>
        <Field
          name={RULE_KIND_FIELD}
          label="Rule type"
          hint="Select whether this rule will be based on the entity type or an attribute."
          component={RichSelectGroupField}
          options={[...RULE_KIND_OPTIONS[target]]}
          initialValue={seedRuleKind(seed)}
          required={REQUIRED_MESSAGE}
        />
      </Section>

      {ruleKind === TYPE_RULE && entityTypeId !== undefined && (
        <Section title="Presence condition">
          <Field
            name={OPERATOR_FIELD}
            label="Operator"
            hint="Select the operator that will be used to compare the entity type to the value."
            component={RadioGroupField}
            options={[...operatorOptions]}
            initialValue={seedString(seed, 'operator')}
            required={REQUIRED_MESSAGE}
          />
        </Section>
      )}

      {ruleKind === VARIABLE_RULE && entityTypeId !== undefined && (
        <Section
          title="Rule structure"
          description={RULE_STRUCTURE_DESCRIPTION}
        >
          <Field
            name={ATTRIBUTE_FIELD}
            label={isNode ? 'Node attribute' : 'Edge attribute'}
            hint="Select an attribute to base this rule on."
            component={VariablePickerControl}
            options={variableOptions}
            emptyMessage={
              isNode
                ? 'This node type has no attributes a rule can compare.'
                : 'This edge type has no attributes a rule can compare.'
            }
            initialValue={seedString(seed, 'attribute')}
            required={REQUIRED_MESSAGE}
          />
          {attributeId !== undefined && (
            <Field
              name={OPERATOR_FIELD}
              label="Operator"
              hint="Select the operator that will be used to compare the attribute to the value."
              component={NativeSelectField}
              placeholder="Select an operator…"
              options={[...operatorOptions]}
              initialValue={seedString(seed, 'operator')}
              required={REQUIRED_MESSAGE}
            />
          )}
          <RuleOperandField
            seed={seed}
            operator={operator}
            variableType={variableType}
            variableChoices={variableChoices}
            regExpHint="Enter a regular expression to compare against."
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
      operatorOptions: ruleOperatorOptions(variableType),
    };
  }, [attributeId, codebook, entityTypeId, target]);

  const emptyValue = useMemo(
    () => emptyRuleValue(derived.variableType),
    [derived.variableType],
  );

  useRuleCascade(values, emptyValue);

  const branchProps = {
    seed,
    attributeId,
    operator,
    variableOptions: derived.variableOptions,
    operatorOptions: derived.operatorOptions,
    variableType: derived.variableType,
    variableChoices: derived.variableChoices,
  };

  return (
    <>
      {/*
        Inside the form rather than passed to the dialog as its `description`,
        which would flatten these documentation links into an announcement the
        researcher cannot follow. As body copy they are ordinary links.
      */}
      <Section title="Rule target" description={description}>
        <Field
          name={TARGET_FIELD}
          label="Entity"
          hint="Select which network entity your rule should target."
          component={RadioGroupField}
          options={[...ruleTypes]}
          initialValue={seed.type === '' ? undefined : seed.type}
          required={REQUIRED_MESSAGE}
        />
        {(target === 'node' || target === 'edge') && (
          <Field
            name={ENTITY_TYPE_FIELD}
            label={target === 'node' ? 'Node type' : 'Edge type'}
            hint={
              target === 'node'
                ? 'Choose a node type to base your rule on. Remember you can add multiple rules if you need to cover different types.'
                : 'Choose an edge type to base your rule on. Remember you can add multiple rules if you need to cover different types.'
            }
            component={EntitySelectControl}
            entityType={target}
            initialValue={seedString(seed, 'type')}
            required={REQUIRED_MESSAGE}
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
  onSave: (rule: RuleDraft) => void;
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

  /**
   * Everything the editor can tell about a draft without leaving it, run after
   * every field has validated itself. Both answers name a control, because
   * both are about one: a rule the researcher cannot save is never a general
   * fault with the draft, it is a specific thing that is missing or wrong.
   */
  const validate = useCallback(
    (values: Record<string, FieldValue>): DialogFormErrors | undefined => {
      const rule = ruleDraftFromValues(values);
      const operator = rule.options?.operator;

      // A `contains` operand is a regular expression, and one that does not
      // compile matches nothing at all. Checked here rather than as a field
      // rule because whether it applies at all depends on the OPERATOR, which
      // is a different field; the field it belongs to is still the field that
      // reports it.
      if (
        isFilterOperator(operator) &&
        operatorsWithRegExp.has(operator) &&
        !isValidRegExp(rule.options?.value)
      ) {
        return {
          fieldErrors: { [RULE_VALUE_FIELD]: INVALID_REG_EXP_MESSAGE },
        };
      }

      // The completeness the protocol schema expects, asserted once where the
      // rule leaves the editor. Every control above states its own `required`,
      // so this is the backstop for a gap none of them covers — and it is
      // reported by the control that holds the gap rather than as a sentence
      // about the rule that names no control at all.
      const missing = incompleteRulePart(rule);
      if (missing !== undefined) {
        return {
          fieldErrors: { [RULE_PART_FIELDS[missing]]: INCOMPLETE_RULE_MESSAGE },
        };
      }

      return undefined;
    },
    [],
  );

  const handleSubmit = useCallback(
    (values: Record<string, FieldValue>): void => {
      saved.current = true;
      onSave({ id: seed.id ?? uuid({}), ...ruleDraftFromValues(values) });
    },
    [onSave, seed.id],
  );

  const handleClose = useCallback(() => {
    if (saved.current) return;
    onCancel();
  }, [onCancel]);

  return (
    <DialogForm
      open={open}
      onClose={handleClose}
      title={RULE_EDITOR_TITLE}
      formId={RULE_EDITOR_FORM_ID}
      validate={validate}
      onSubmit={handleSubmit}
      submitLabel={RULE_EDITOR_SUBMIT}
      size="editor"
      finalFocus={finalFocus}
      layoutId={layoutId}
    >
      <RuleEditorFields
        seed={seed}
        ruleTypes={ruleTypes}
        description={
          <>
            Rules are used to filter the data in your study. You can use them to
            show or hide nodes and edges based on their attributes. For help
            with constructing rules, see our documentation articles on{' '}
            <NativeLink
              href={protocolAuthoringLinks.skipLogic}
              target="_blank"
              rel="noopener noreferrer"
            >
              skip logic
            </NativeLink>{' '}
            and{' '}
            <NativeLink
              href={protocolAuthoringLinks.networkFiltering}
              target="_blank"
              rel="noopener noreferrer"
            >
              network filtering
            </NativeLink>
            .
          </>
        }
      />
    </DialogForm>
  );
}

function isValidRegExp(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    // eslint-disable-next-line no-new -- compiling it IS the check
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}

const INVALID_REG_EXP_MESSAGE =
  'This is not a valid regular expression. Correct it, or choose a different operator.';
const INCOMPLETE_RULE_MESSAGE =
  'This rule cannot be saved until this question is answered.';
