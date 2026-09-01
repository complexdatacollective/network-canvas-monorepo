import { useMemo, type ReactNode } from 'react';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import ArchitectField from '~/components/Form/ArchitectField';
import type { ArchitectValidation } from '~/components/Form/toZodValidation';

import type { RuleOptionItem } from './ruleCodebook';

/** Every rule operand is stored under this one path. */
export const RULE_VALUE_FIELD = 'options.value';

/**
 * The empty operand for a variable of this type — what a rule's value is
 * reset to when the choice above it changes.
 *
 * `undefined` for the numeric controls rather than `''`: fresco-ui's
 * `required` treats an empty string as unanswered but Architect's
 * `requiredAcceptsZero` (which the option-count field needs, because 0 IS an
 * answer) only rejects nullish, so an empty count typed as `''` would pass
 * every field rule and reach the protocol.
 */
export const getEmptyRuleValue = (
  variableType: string | undefined,
): boolean | (string | number)[] | string | undefined => {
  if (variableType === 'boolean') return false;
  if (variableType === 'categorical') return [];
  if (variableType === 'number') return undefined;
  return '';
};

const formatNumberValue = (value: number | undefined): string =>
  value === undefined ? '' : String(value);

const parseNumberValue = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

// `size` narrows the `<input>` element's own numeric `size` to the
// control-size scale `InputField` expects, as `VariableNameField` does.
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
    value={formatNumberValue(value)}
    onChange={(next) => onChange?.(parseNumberValue(next))}
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
    value={formatNumberValue(value)}
    onChange={(next) => {
      const parsed = parseNumberValue(next);
      onChange?.(
        parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined,
      );
    }}
  />
);

const asScalar = (value: unknown): string | number | undefined =>
  typeof value === 'string' || typeof value === 'number' ? value : undefined;

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * A categorical operand is the set of selected option values, so anything that
 * is not one of those survives the trip only as noise. Non-primitive members
 * are dropped rather than stringified.
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

export type RuleValueFieldProps = {
  label: string;
  hint: ReactNode;
  placeholder?: string;
  /**
   * The codebook type of the attribute being compared. Absent until an
   * attribute is chosen, and absent for types the codebook does not describe;
   * both fall through to the free-text control, which is what every type
   * without a richer editor (scalar, datetime, location, layout) uses.
   */
  variableType?: string;
  options?: RuleOptionItem[];
  /** The operand as the rule was seeded with it. */
  initialValue?: unknown;
  validation?: ArchitectValidation;
};

/**
 * The control a rule's operand is entered with, chosen by the attribute's
 * type.
 *
 * ONE component for ego and alter rules alike. They diverged before — the ego
 * branch had its own copy that never adopted the integer option-count control
 * or the array-preserving operand coercion — and a rule the ego editor could
 * save was then rejected by the protocol schema.
 */
export const RuleValueField = ({
  label,
  hint,
  placeholder,
  variableType,
  options,
  initialValue,
  validation,
}: RuleValueFieldProps) => {
  // `initialValue` is a registration dependency, so an array rebuilt every
  // render would re-register the field on every keystroke elsewhere.
  const selection = useMemo(() => asSelection(initialValue), [initialValue]);

  if (variableType === 'boolean') {
    return (
      <ArchitectField
        name={RULE_VALUE_FIELD}
        label={label}
        hint={hint}
        component={BooleanField}
        initialValue={initialValue === true}
        validation={validation}
      />
    );
  }

  if (variableType === 'categorical') {
    return (
      <ArchitectField
        name={RULE_VALUE_FIELD}
        label={label}
        hint={hint}
        component={CheckboxGroupField}
        options={options ?? []}
        initialValue={selection}
        validation={validation}
      />
    );
  }

  if (variableType === 'ordinal') {
    return (
      <ArchitectField
        name={RULE_VALUE_FIELD}
        label={label}
        hint={hint}
        component={RadioGroupField}
        options={options ?? []}
        initialValue={asScalar(initialValue)}
        validation={validation}
      />
    );
  }

  if (variableType === 'number') {
    return (
      <ArchitectField
        name={RULE_VALUE_FIELD}
        label={label}
        hint={hint}
        component={NumberValueField}
        placeholder={placeholder}
        initialValue={asNumber(initialValue)}
        validation={validation}
      />
    );
  }

  return (
    <ArchitectField
      name={RULE_VALUE_FIELD}
      label={label}
      hint={hint}
      component={InputField}
      placeholder={placeholder}
      initialValue={asText(initialValue)}
      validation={validation}
    />
  );
};

export type RuleCountFieldProps = {
  label: string;
  hint: ReactNode;
  placeholder?: string;
  initialValue?: unknown;
};

/**
 * How many options must be selected — the operand of the OPTIONS_* operators.
 * Independent of the attribute's own type, and shared by ego and alter rules.
 */
export const RuleCountField = ({
  label,
  hint,
  placeholder,
  initialValue,
}: RuleCountFieldProps) => (
  <ArchitectField
    name={RULE_VALUE_FIELD}
    label={label}
    hint={hint}
    component={CountValueField}
    placeholder={placeholder}
    initialValue={asNumber(initialValue)}
    // Zero selected options is a real answer, so emptiness — not falsiness —
    // is what this rejects.
    validation={{ requiredAcceptsZero: true }}
  />
);
