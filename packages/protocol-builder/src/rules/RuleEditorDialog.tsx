import { isEqual } from 'es-toolkit/compat';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import Dialog, { type DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValue,
  FormSubmissionResult,
  FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';

import { EntitySelectControl } from '../fields/EntitySelectField.tsx';
import { VariablePickerControl } from '../fields/VariablePicker.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { protocolAuthoringLinks } from '../interfaces/documentation.ts';
import {
  isFilterOperator,
  operatorsWithOptionCount,
  operatorsWithRegExp,
  operatorsWithValue,
  type RuleOperatorOption,
} from './operators.ts';
import { isCompleteRule, type RuleDraft } from './rule.ts';
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
 * it is dropped when the rule is assembled (see `ruleFromValues`).
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
 * The rule the form describes.
 *
 * `getFormValues` reports only the fields that are currently RENDERED, which
 * is what makes the editor's branches load-bearing: a presence rule has no
 * `attribute` key at all, and an operator that needs no operand contributes no
 * `value`. `ruleKind` describes the shape rather than the rule, so it is not
 * carried across.
 */
const ruleFromValues = (
  values: Record<string, FieldValue>,
  seed: RuleDraft,
): RuleDraft => ({
  id: seed.id ?? uuid({}),
  type: typeof values[TARGET_FIELD] === 'string' ? values[TARGET_FIELD] : '',
  options: ruleOptionsFromValues(values.options),
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

/*
 * ---------------------------------------------------------------------------
 * SEAM: local dialog-form shell.
 *
 * The package's shared `form/DialogForm.tsx` primitive is being extracted
 * separately. Everything below `RuleEditorDialogShell` is the minimum this one
 * editor needs from it — a dialog whose body is a Fresco form, with the submit
 * control in the footer associated to the form by DOM id — and NOTHING else
 * should be built on it. When the shared primitive lands, delete this shell and
 * render `DialogForm` with exactly the props `RuleEditorDialogShell` takes;
 * the rest of this file does not change.
 *
 * What the shared primitive adds that this does not have: nested-draft
 * registration, confirm-before-dismissing a dirty editor, the refused-commit
 * guard, and the resizable aside.
 * ---------------------------------------------------------------------------
 */

/** Distinguishes concurrently mounted forms — see `domFormId` below. */
let nextDialogFormInstance = 0;

type RuleEditorDialogShellProps = Readonly<{
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  formId: string;
  submitLabel: string;
  onSubmit: FormSubmitHandler;
  size?: DialogProps['size'];
  finalFocus?: DialogProps['finalFocus'];
  layoutId?: string;
  children: ReactNode;
}>;

function RuleEditorDialogShellBody({
  open,
  onClose,
  title,
  formId,
  submitLabel,
  onSubmit,
  size,
  finalFocus,
  layoutId,
  children,
}: RuleEditorDialogShellProps) {
  /**
   * The footer's SubmitButton is not a descendant of the `<form>`, so it
   * associates with it through the native `form=` attribute, which resolves by
   * DOM id — and takes the FIRST element with that id in document order. A
   * dialog stays mounted while it animates closed, so a second dialog of the
   * same kind opened during that window would render a second `<form>` with
   * the same id, and the new dialog's Submit would resolve to the old, closing
   * one. A per-MOUNT counter (not `useId`, which answers by tree position and
   * repeats for a dialog reopened in the same slot) keeps each addressable.
   */
  const [domFormId] = useState(() => {
    nextDialogFormInstance += 1;
    return `${formId}-${nextDialogFormInstance}`;
  });

  return (
    <Dialog
      open={open}
      closeDialog={onClose}
      title={title}
      layoutId={layoutId}
      finalFocus={finalFocus}
      size={size}
      footer={
        <>
          <Button color="default" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton form={domFormId}>{submitLabel}</SubmitButton>
        </>
      }
    >
      <FormWithoutProvider id={domFormId} onSubmit={onSubmit}>
        {children}
      </FormWithoutProvider>
    </Dialog>
  );
}

function RuleEditorDialogShell(props: RuleEditorDialogShellProps) {
  return (
    <FormStoreProvider>
      <RuleEditorDialogShellBody {...props} />
    </FormStoreProvider>
  );
}

/* --------------------------- end of the seam --------------------------- */

export type RuleEditorDialogProps = Readonly<{
  open: boolean;
  /** The rule as this editing session opened on it. */
  seed: RuleDraft;
  ruleTypes: readonly RuleTypeOption[];
  onSave: (rule: RuleDraft) => void;
  onCancel: () => void;
  finalFocus?: DialogProps['finalFocus'];
  /** Matches an existing list row to this dialog for its shared morph. */
  layoutId?: string;
}>;

/**
 * The rule editor: a dialog whose body is an ordinary protocol-builder form.
 *
 * Every control is connected to the dialog's own form store, so a rule the
 * researcher has not finished cannot be saved and the control that is missing
 * says so itself — before this, the fields ran their own validation, which
 * could only ever be shown for a field that had already been edited, so
 * `required` was invisible on precisely the untouched fields it exists for,
 * and the refusal arrived as a modal that named none of them.
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
  const handleSubmit = useCallback<FormSubmitHandler>(
    (values): FormSubmissionResult => {
      const rule = ruleFromValues(values, seed);
      const operator = rule.options?.operator;

      // A `contains` operand is a regular expression, and one that does not
      // compile matches nothing at all. Checked here rather than as a field
      // rule because expressing it as one needs a schema builder the package
      // does not depend on; the field it belongs to is still the field that
      // reports it.
      if (
        isFilterOperator(operator) &&
        operatorsWithRegExp.has(operator) &&
        !isValidRegExp(rule.options?.value)
      ) {
        return {
          success: false,
          fieldErrors: { [RULE_VALUE_FIELD]: [INVALID_REG_EXP_MESSAGE] },
        };
      }

      // The completeness the protocol schema expects, asserted once where the
      // rule leaves the editor. The fields above reject each missing part on
      // their own; this is what makes a gap they do not cover visible instead
      // of silent.
      if (!isCompleteRule(rule)) {
        return { success: false, formErrors: [INCOMPLETE_RULE_MESSAGE] };
      }

      onSave(rule);
      return { success: true };
    },
    [onSave, seed],
  );

  return (
    <RuleEditorDialogShell
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
    </RuleEditorDialogShell>
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
  'This rule is not complete. Please fill in every field before saving it.';
