import { useMemo, type ReactNode } from 'react';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import type { VariableType } from '@codaco/protocol-validation';

import type { RuleChoiceOption } from './ruleCodebook.ts';

/** Every rule operand is stored under this one path. */
export const RULE_VALUE_FIELD = 'options.value';

/**
 * Fresco's built-in required copy addresses a participant mid-interview. A
 * protocol is authored by a researcher, so the rule is stated instead.
 */
const REQUIRED_MESSAGE = 'This field is required.';

/**
 * The empty operand for an attribute of this type — what a rule's value is
 * reset to when the choice above it changes.
 *
 * `undefined` for the numeric controls rather than `''`: an empty string is
 * not a number, and parking one there would put a value the interview cannot
 * compare into a field whose control would then show it as text.
 */
export const emptyRuleValue = (
  variableType: VariableType | undefined,
): boolean | (string | number)[] | string | undefined => {
  if (variableType === 'boolean') return false;
  if (variableType === 'categorical') return [];
  if (variableType === 'number') return undefined;
  return '';
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

/**
 * `InputField` is string-valued — it emits `event.target.value` verbatim, even
 * for `type="number"` — while a rule's numeric operand has to round-trip as a
 * real number, because that is what the interview runtime compares.
 */
const NumberValueField = ({
  value,
  onChange,
  ...props
}: NumericValueFieldProps) => (
  <InputField
    {...props}
    type="number"
    step="any"
    value={formatNumber(value)}
    onChange={(next) => onChange?.(parseNumber(next))}
  />
);

/**
 * A count of selected options: a whole number of them, never a fraction and
 * never negative. A value that is not an integer is not committed, exactly as
 * the step rejects it.
 */
const CountValueField = ({
  value,
  onChange,
  ...props
}: NumericValueFieldProps) => (
  <InputField
    {...props}
    type="number"
    step={1}
    min={0}
    value={formatNumber(value)}
    onChange={(next) => {
      const parsed = parseNumber(next);
      onChange?.(
        parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined,
      );
    }}
  />
);

const asScalar = (value: unknown): string | number | undefined =>
  typeof value === 'string' || typeof value === 'number' ? value : undefined;

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * A multi-select operand is the set of selected option values, so anything
 * that is not one of those survives the trip only as noise. Non-primitive
 * members are dropped rather than stringified.
 */
const asSelection = (value: unknown): (string | number)[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string | number =>
          typeof item === 'string' || typeof item === 'number',
      )
    : [];

const asText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
};

export type RuleValueFieldProps = Readonly<{
  label: string;
  hint: ReactNode;
  placeholder?: string;
  /**
   * The codebook type of the attribute being compared. Absent until an
   * attribute is chosen, and absent for an attribute the codebook no longer
   * describes; both fall through to the free-text control, which is also what
   * every type without a richer editor (scalar, datetime, location, layout)
   * uses.
   */
  variableType?: VariableType;
  options?: readonly RuleChoiceOption[];
  /** The operand as the rule was seeded with it. */
  initialValue?: unknown;
  required?: boolean;
}>;

/**
 * The control a rule's operand is entered with, chosen by the attribute's
 * type.
 *
 * ONE component for ego and alter rules alike. They diverged before — the ego
 * branch had its own copy that never adopted the integer option-count control
 * or the array-preserving operand coercion — and a rule the ego editor could
 * save was then rejected by the protocol schema.
 */
export function RuleValueField({
  label,
  hint,
  placeholder,
  variableType,
  options,
  initialValue,
  required = false,
}: RuleValueFieldProps) {
  // `initialValue` is a registration dependency, so an array rebuilt every
  // render would re-register the field on every keystroke elsewhere.
  const selection = useMemo(() => asSelection(initialValue), [initialValue]);
  const requiredProp = required ? REQUIRED_MESSAGE : undefined;

  if (variableType === 'boolean') {
    return (
      <Field
        name={RULE_VALUE_FIELD}
        label={label}
        hint={hint}
        component={BooleanField}
        initialValue={initialValue === true}
        required={requiredProp}
      />
    );
  }

  if (variableType === 'categorical') {
    return (
      <Field
        name={RULE_VALUE_FIELD}
        label={label}
        hint={hint}
        component={CheckboxGroupField}
        options={[...(options ?? [])]}
        initialValue={selection}
        required={requiredProp}
      />
    );
  }

  if (variableType === 'ordinal') {
    return (
      <Field
        name={RULE_VALUE_FIELD}
        label={label}
        hint={hint}
        component={RadioGroupField}
        options={[...(options ?? [])]}
        initialValue={asScalar(initialValue)}
        required={requiredProp}
      />
    );
  }

  if (variableType === 'number') {
    return (
      <Field
        name={RULE_VALUE_FIELD}
        label={label}
        hint={hint}
        component={NumberValueField}
        placeholder={placeholder}
        initialValue={asNumber(initialValue)}
        required={requiredProp}
      />
    );
  }

  return (
    <Field
      name={RULE_VALUE_FIELD}
      label={label}
      hint={hint}
      component={InputField}
      placeholder={placeholder}
      initialValue={asText(initialValue)}
      required={requiredProp}
    />
  );
}

export type RuleCountFieldProps = Readonly<{
  label: string;
  hint: ReactNode;
  placeholder?: string;
  initialValue?: unknown;
}>;

/**
 * How many options must be selected — the operand of the OPTIONS_* operators.
 * Independent of the attribute's own type, and shared by ego and alter rules.
 *
 * Plain `required` is correct here even though zero selected options is a real
 * answer: Fresco's own emptiness predicate counts `0` and `false` as answers
 * and only rejects nullish, blank and `NaN` values.
 */
export function RuleCountField({
  label,
  hint,
  placeholder,
  initialValue,
}: RuleCountFieldProps) {
  return (
    <Field
      name={RULE_VALUE_FIELD}
      label={label}
      hint={hint}
      component={CountValueField}
      placeholder={placeholder}
      initialValue={asNumber(initialValue)}
      required={REQUIRED_MESSAGE}
    />
  );
}
