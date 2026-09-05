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
import type { Codebook, VariableType } from '@codaco/protocol-validation';

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
  operatorsWithRegExp,
  type RuleOperatorOption,
} from './operators.ts';
import { incompleteRulePart, type RuleDraft, type RulePart } from './rule.ts';
import {
  isRuleTargetType,
  missingOperandOptions,
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
import {
  emptyRuleValue,
  RULE_VALUE_FIELD,
  RuleOperandField,
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
 */
const RULE_TARGET_NAMES: Readonly<Record<RuleTargetType, string>> =
  Object.freeze({ node: 'Node', edge: 'Edge', ego: 'Ego' });

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
): readonly RuleTypeOption[] => {
  if (!isRuleTargetType(seeded)) return offered;
  if (offered.some((option) => option.value === seeded)) return offered;
  return [
    ...offered,
    {
      value: seeded,
      label: `${RULE_TARGET_NAMES[seeded]} (not offered in this rule set)`,
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
): (string | number)[] => {
  const target = isRuleTargetType(rule.type) ? rule.type : undefined;
  if (target === undefined) return [];
  const variables = ruleVariables(codebook, target, draftString(rule, 'type'));
  return missingOperandOptions(
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

const staleOptionsMessage = (values: readonly (string | number)[]): string => {
  const described = values.map(describeStaleOption);
  const list =
    described.length <= 1
      ? (described[0] ?? '')
      : `${described.slice(0, -1).join(', ')} and ${described.at(-1) ?? ''}`;
  return `This rule compares against ${list}, which this attribute no longer offers. Choose from the options it does.`;
};

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
        variableType={variableType}
        operator={operator}
        options={variableChoices}
        dateParameters={dateParameters}
        initialValue={seed.options?.value}
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
  dateParameters,
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
            variableType={variableType}
            operator={operator}
            options={variableChoices}
            dateParameters={dateParameters}
            initialValue={seed.options?.value}
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
      dateParameters: ruleVariableDateParameters(variables, attributeId),
    };
  }, [attributeId, codebook, entityTypeId, target]);

  // The operator the rule HOLDS is part of the list, because a stored operator
  // the editor no longer offers has to be visible rather than left showing the
  // select's placeholder. Read from the field rather than from the seed, so it
  // goes when the cascade clears it.
  const operatorOptions = useMemo(
    () => ruleOperatorOptions(derived.variableType, operator),
    [derived.variableType, operator],
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
      <Section title="Rule target" description={description}>
        <Field
          name={TARGET_FIELD}
          label="Entity"
          hint="Select which network entity your rule should target."
          component={RadioGroupField}
          options={[...ruleTargetOptions(ruleTypes, seed.type)]}
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
  /**
   * Takes the finished rule, or REFUSES it.
   *
   * A caller that cannot accept the rule right now — a list that has stopped
   * being editable while this dialog was open — answers with the errors to
   * show instead, exactly as `DialogForm` documents for a save the host cannot
   * take. The dialog then stays open with the draft intact, and the session is
   * not recorded as saved.
   */
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

      // An operand picked from the attribute's own options has to BE one of
      // them, and the EDITOR is what says so: the protocol schema checks the
      // shape of a rule's value and stops there on purpose, because protocols
      // already in the field hold rules naming an option a collaborator has
      // since renamed or deleted, and refusing to LOAD one would lock the
      // researcher out of the editor that could fix it (ruling on issue
      // #1548). Membership is by identity, which is what keeps `"1"` from
      // standing in for the option whose value is `1`.
      //
      // The rule LIST reports such an operand on the row it sits on, and the
      // rule set's own field validation refuses the stage save. This is the
      // third face of the same rule, and the one the dialog needs: its option
      // controls offer nothing but the attribute's current options, so a draft
      // reaches here only by having been OPENED on a rule that already names
      // one it no longer has — seeded into a control that shows nothing
      // selected, and committed straight back unless it is refused.
      const staleOptions = staleRuleOptions(codebookRef.current, rule);
      if (staleOptions.length > 0) {
        return {
          fieldErrors: {
            [RULE_VALUE_FIELD]: staleOptionsMessage(staleOptions),
          },
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
    (values: Record<string, FieldValue>): DialogFormErrors | undefined => {
      const refused = onSave({
        id: seed.id ?? uuid({}),
        ...ruleDraftFromValues(values),
      });
      // Recorded only once the rule has actually been taken. Marking a refused
      // save as this session's outcome would leave the editor with no way out:
      // `handleClose` swallows every dismissal that follows one.
      if (refused !== undefined) return refused;
      saved.current = true;
      return undefined;
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
