import { useMemo, useState, type FocusEvent, type ReactNode } from 'react';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import DatePickerField from '@codaco/fresco-ui/form/fields/DatePicker';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import type { VariableType } from '@codaco/protocol-validation';

import {
  type OperandRequirement,
  operandRequirement,
  type OperandValue,
} from './operators.ts';
import {
  DEFAULT_DATE_PARAMETERS,
  type RuleChoiceOption,
  type RuleDateParameters,
} from './ruleCodebook.ts';

/** Every rule operand is stored under this one path. */
export const RULE_VALUE_FIELD = 'options.value';

/**
 * Fresco's built-in required copy addresses a participant mid-interview. A
 * protocol is authored by a researcher, so the rule is stated instead.
 */
const REQUIRED_MESSAGE = 'This field is required.';

/** An operand requirement that actually asks for a value. */
type ValueRequirement = Extract<OperandRequirement, { kind: 'value' }>;

/**
 * The empty operand for an attribute of this type, and for the operator chosen
 * against it — what a rule's value is reset to when either changes.
 *
 * Both are asked, because both decide the shape: a categorical attribute
 * empties to an empty SELECTION when its options are being compared, and to no
 * number at all when they are being counted. The operator may not have been
 * chosen yet, in which case the attribute's own answer shape decides — which
 * is what `EXACTLY` asks for, the operator that compares an answer as it is.
 */
export const emptyRuleValue = (
  variableType: VariableType | undefined,
  operator?: unknown,
): OperandValue => {
  const requirement =
    operandRequirement(variableType, operator) ??
    operandRequirement(variableType, 'EXACTLY');
  if (requirement === undefined || requirement.kind === 'none') return '';
  return requirement.empty;
};

const formatNumber = (value: number | undefined): string =>
  value === undefined ? '' : String(value);

const parseNumber = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

// `size` narrows the `<input>` element's own numeric `size` attribute to the
// control-size scale `InputField` expects.
type NumericValueFieldProps = CreateFormFieldProps<
  number,
  'input',
  { size?: 'sm' | 'md' | 'lg' | 'xl' }
>;

/** The text the researcher has entered, and the number it was read as. */
type NumericDraft = Readonly<{ text: string; value: number | undefined }>;

/**
 * The text a numeric operand control shows, and what typing into it does.
 *
 * The text a number is BUILT from is not the text that number reads back as:
 * `1.0` is the number 1 and `-0` is the number 0, so a control rendered from
 * the parsed number rewrites the input under the researcher's cursor. The
 * decimal point was taken back out of `1.0` before the last digit of `1.05`
 * arrived — which saved 15 — and the minus sign of `-0` disappeared as soon as
 * the first digit followed it.
 *
 * So the researcher's own text is what is shown while they are typing, and the
 * NUMBER is what is committed. The draft is kept only while it still stands
 * for the value the form holds: an operand emptied by the cascade, or set
 * anywhere else in the editor, replaces it rather than being overwritten by
 * text the rule no longer has. Leaving the field drops the draft, so the field
 * settles on the number it stored rather than going on showing text the form
 * is not holding.
 */
const useNumericDraft = (
  value: number | undefined,
  /** Stores the number this text means, and answers with what it stored. */
  commit: (value: number | undefined) => number | undefined,
) => {
  const [draft, setDraft] = useState<NumericDraft | undefined>(undefined);
  return {
    text:
      draft !== undefined && draft.value === value
        ? draft.text
        : formatNumber(value),
    change: (next: string | undefined) => {
      setDraft({ text: next ?? '', value: commit(parseNumber(next)) });
    },
    settle: () => setDraft(undefined),
  };
};

/**
 * `InputField` is string-valued — it emits `event.target.value` verbatim, even
 * for `type="number"` — while a rule's numeric operand has to round-trip as a
 * real number, because that is what the interview runtime compares.
 */
const DecimalValueField = ({
  value,
  onChange,
  onBlur,
  ...props
}: NumericValueFieldProps) => {
  const draft = useNumericDraft(value, (next) => {
    onChange?.(next);
    return next;
  });

  return (
    <InputField
      {...props}
      type="number"
      step="any"
      value={draft.text}
      onChange={draft.change}
      onBlur={(event: FocusEvent) => {
        draft.settle();
        onBlur?.(event);
      }}
    />
  );
};

/**
 * A whole number, never a fraction: a value that is not one is not committed,
 * exactly as the step rejects it.
 *
 * Rendered wherever the operand table says the protocol holds only whole
 * numbers there — today that is the count of selected options, which is a
 * number OF things. `step` is the control's own affordance and nothing more:
 * the form is submitted with native browser validation off, so it refuses
 * nothing, and the value the control declines to commit is what the field's
 * own `required` then reports.
 */
const WholeNumberValueField = ({
  value,
  onChange,
  onBlur,
  ...props
}: NumericValueFieldProps) => {
  const draft = useNumericDraft(value, (next) => {
    const whole =
      next !== undefined && Number.isInteger(next) ? next : undefined;
    onChange?.(whole);
    return whole;
  });

  return (
    <InputField
      {...props}
      type="number"
      step={1}
      value={draft.text}
      onChange={draft.change}
      onBlur={(event: FocusEvent) => {
        draft.settle();
        onBlur?.(event);
      }}
    />
  );
};

type RuleValueFieldProps = Readonly<{
  label: string;
  hint: ReactNode;
  placeholder?: string;
  /** What the operand table says this operator wants for this attribute. */
  requirement: ValueRequirement;
  options?: readonly RuleChoiceOption[];
  /** How a datetime attribute's own date picker is configured. */
  dateParameters?: RuleDateParameters;
  /** The operand as the rule was seeded with it. */
  initialValue?: unknown;
  /** The smallest value the operand may take, where one is meaningful. */
  minValue?: number;
}>;

/**
 * The control a rule's operand is entered with.
 *
 * ONE component for ego and alter rules alike, and one branch per CONTROL
 * rather than per attribute type — the table upstream has already turned the
 * attribute and the operator into a control, an empty value and a reader. The
 * two diverged before: the ego branch had a copy that never adopted the
 * integer option-count control or the array-preserving operand coercion, and a
 * rule the ego editor could save was then rejected by the protocol schema.
 */
function RuleValueField({
  label,
  hint,
  placeholder,
  requirement,
  options,
  dateParameters,
  initialValue,
  minValue,
}: RuleValueFieldProps) {
  const { control, parse } = requirement;
  // `initialValue` is a registration dependency, so a value rebuilt every
  // render would re-register the field on every keystroke elsewhere.
  const seeded = useMemo(() => parse(initialValue), [parse, initialValue]);
  const shared = {
    name: RULE_VALUE_FIELD,
    label,
    hint,
    // Every operand a rule asks for has to be answered — the operator would
    // not be comparing anything otherwise. Stated as the researcher's rule
    // rather than as `true`, whose Fresco wording addresses a participant.
    required: REQUIRED_MESSAGE,
    ...(minValue === undefined ? {} : { minValue }),
  };

  // `parse` has already produced the shape each control takes; these say so to
  // TypeScript, which cannot carry a union member's value type through the
  // function that produced it. None of them chooses anything.
  switch (control) {
    case 'boolean':
      return (
        <Field
          {...shared}
          component={BooleanField}
          initialValue={asBooleanValue(seeded)}
        />
      );
    case 'optionList':
      return (
        <Field
          {...shared}
          component={CheckboxGroupField}
          options={[...(options ?? [])]}
          initialValue={Array.isArray(seeded) ? seeded : []}
        />
      );
    case 'option':
      return (
        <Field
          {...shared}
          component={RadioGroupField}
          options={[...(options ?? [])]}
          initialValue={asOptionValue(seeded)}
        />
      );
    case 'date':
      return (
        <Field
          {...shared}
          component={DatePickerField}
          // Every part of the attribute's own picker the operand control
          // honours, spread whole rather than picked apart here: a bound the
          // codebook does not hold is absent rather than invented, and
          // `min`/`max` are dual-use in Fresco — they bound the picker AND
          // validate what is entered, so an operand the attribute could never
          // record is refused rather than saved.
          {...DEFAULT_DATE_PARAMETERS}
          {...dateParameters}
          initialValue={asStringValue(seeded)}
        />
      );
    case 'wholeNumber':
      return (
        <Field
          {...shared}
          component={WholeNumberValueField}
          placeholder={placeholder}
          initialValue={asNumberValue(seeded)}
        />
      );
    case 'decimalNumber':
      return (
        <Field
          {...shared}
          component={DecimalValueField}
          placeholder={placeholder}
          initialValue={asNumberValue(seeded)}
        />
      );
    case 'text':
    case 'pattern':
      return (
        <Field
          {...shared}
          component={InputField}
          placeholder={placeholder}
          initialValue={asStringValue(seeded)}
        />
      );
    default:
      // A control with no branch, which TypeScript proves cannot happen: the
      // whole point of the table is that a new one arrives with a control the
      // researcher can use rather than falling through to a text box.
      return assertNoSuchControl(control);
  }
}

const assertNoSuchControl = (control: never): never => {
  throw new Error(`No operand control is rendered for "${String(control)}".`);
};

const asStringValue = (value: OperandValue): string =>
  typeof value === 'string' ? value : '';

/**
 * `undefined` rather than `false` for anything that is not a boolean: "No" is
 * an answer, so a control opened on it would have answered the question the
 * field's own `required` exists to ask.
 */
const asBooleanValue = (value: OperandValue): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const asNumberValue = (value: OperandValue): number | undefined =>
  typeof value === 'number' ? value : undefined;

const asOptionValue = (value: OperandValue): string | number | undefined =>
  typeof value === 'string' || typeof value === 'number' ? value : undefined;

export type RuleOperandFieldProps = Readonly<{
  variableType: VariableType | undefined;
  operator: unknown;
  options?: readonly RuleChoiceOption[];
  dateParameters?: RuleDateParameters;
  initialValue?: unknown;
  /** Ego rules address the researcher about the ego's own attribute. */
  regExpHint: string;
}>;

/**
 * The operand, when the chosen operator takes one at all.
 *
 * What the operand IS decides the control, and how the schema constrains it
 * decides the words: a count of options is a number of things, a pattern is a
 * regular expression, and everything else is a value compared against the
 * answer. All three read the same table, so an operator added to the schema
 * cannot arrive here with no control and no copy.
 */
export function RuleOperandField({
  variableType,
  operator,
  options,
  dateParameters,
  initialValue,
  regExpHint,
}: RuleOperandFieldProps) {
  const requirement = operandRequirement(variableType, operator);
  if (requirement === undefined || requirement.kind === 'none') return null;

  if (requirement.operandKind === 'integer') {
    return (
      <RuleValueField
        label="Selected option count"
        hint="Enter the number of options that must be selected for this rule to pass."
        placeholder="Enter a value..."
        requirement={requirement}
        initialValue={initialValue}
        // A count below zero is not a stricter rule than the schema's, it is a
        // rule that cannot be read at all — `OPTIONS_GREATER_THAN -1` matches
        // an attribute nobody answered, and `OPTIONS_LESS_THAN -1` matches
        // nothing there is. Stated as a rule rather than as the control's own
        // `min`, which the form never consults: it is submitted with native
        // browser validation off.
        minValue={0}
      />
    );
  }

  return (
    <RuleValueField
      label="Attribute value"
      hint={requirement.operandKind === 'string' ? regExpHint : COMPARE_HINT}
      placeholder={
        requirement.operandKind === 'string'
          ? 'Enter a regular expression...'
          : 'Enter a value...'
      }
      requirement={requirement}
      options={options}
      dateParameters={dateParameters}
      initialValue={initialValue}
    />
  );
}

const COMPARE_HINT = 'Enter the value to compare against.';
