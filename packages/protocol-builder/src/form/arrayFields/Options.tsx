import { useCallback, useMemo } from 'react';

import ArrayField, {
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { normalizeForComparison } from '@codaco/shared-consts';

import Option, { OptionsContext, type OptionValue } from './Option.tsx';
import {
  isOptionComplete,
  isOptionLabelEmpty,
  isOptionValueEmpty,
} from './optionCompleteness.ts';
import { arrayScopedValues } from './RowField.tsx';
import { allowedVariableNameRow } from './rowValidators.ts';
import { useArrayFieldCommands } from './useArrayFieldCommands.ts';

export type { OptionValue } from './Option.tsx';

/**
 * Array-level rules. They belong to the caller's `ProtocolArrayField`
 * (spread as `{...optionsValidation}`), which hands the whole array to each
 * rule — rows are not registered fields and cannot carry them.
 */
const MINIMUM_OPTIONS_MESSAGE =
  'Requires a minimum of two options. If you need fewer options, consider using a boolean attribute.';

const minTwoOptions = (value: unknown) =>
  !value || (Array.isArray(value) && value.length < 2)
    ? MINIMUM_OPTIONS_MESSAGE
    : undefined;

/** Native `required` owns an absent/empty list; this owns the one-row case. */
const minTwoPopulatedOptions = (value: unknown) =>
  Array.isArray(value) && value.length > 0 ? minTwoOptions(value) : undefined;

const completeOptions = (value: unknown) =>
  Array.isArray(value) && !value.every(isOptionComplete)
    ? 'Every option needs both a label and a value.'
    : undefined;

/**
 * Strings compare case-insensitively and under Unicode canonical equivalence,
 * matching `uniqueRowAttribute` — the rule the rows run — so the array and its
 * rows never disagree about which entries clash. See shared-consts'
 * `canonical-text` for why canonical equivalence is part of it.
 */
const hasDuplicates = (values: unknown[]) => {
  const seen = new Set<unknown>();
  for (const value of values) {
    const key =
      typeof value === 'string' ? normalizeForComparison(value) : value;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
};

const readOptions = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (option): option is Record<string, unknown> =>
          typeof option === 'object' && option !== null,
      )
    : [];

/**
 * Duplicate values export as indistinguishable answers, so the ARRAY has to
 * reject them: the rows run `uniqueRowAttribute` too, but a row is not a
 * registered field (see RowField) and can only display its error — nothing
 * carries it into the form's validity. Incomplete entries are `completeOptions`'
 * business and are ignored here so one edit does not raise two errors.
 */
const uniqueOptionValues = (value: unknown) =>
  hasDuplicates(
    readOptions(value)
      .map((option) => option.value)
      .filter((optionValue) => !isOptionValueEmpty(optionValue)),
  )
    ? 'Every option needs a unique value.'
    : undefined;

/** The label counterpart of `uniqueOptionValues`. */
const uniqueOptionLabels = (value: unknown) =>
  hasDuplicates(
    readOptions(value)
      .map((option) => option.label)
      .filter((label) => !isOptionLabelEmpty(label)),
  )
    ? 'Every option needs a unique label.'
    : undefined;

// Runs the rows' own rule so the array and its rows can never disagree about
// which characters — or which wording — apply.
const validateOptionValue = allowedVariableNameRow('option value');

/**
 * The array counterpart of the rows' `allowedVariableNameRow`. An option value
 * has to be an NMTOKEN because it becomes an XML export key and a CSV column
 * header (`${attributeName}_${option.value}`), and the row's own message is
 * display-only (see RowField): collapsing the row hides it entirely while
 * keeping the value, so without this the protocol ships with a value the
 * researcher was told was invalid.
 *
 * Values are stringified because `parseOptionValue` stores numeric-looking
 * input as a number. Empty values are `completeOptions`' business, and this
 * rule is bundled last because only the first failing rule is reported per
 * field — a blank row should say what it is missing before it is told the
 * missing value is malformed.
 */
const allowedOptionValues = (value: unknown) =>
  readOptions(value)
    .map((option) => option.value)
    .filter((optionValue) => !isOptionValueEmpty(optionValue))
    .map((optionValue) =>
      validateOptionValue(String(optionValue), undefined, ''),
    )
    .find((message) => message !== undefined);

/**
 * Every array-level rule an options editor needs, as one object to SPREAD onto
 * the owning `ProtocolArrayField` (`{...optionsValidation}`) — Fresco reads
 * validation from the field's own props. Passed whole rather than rule by rule
 * so a call site cannot silently keep some and drop others.
 *
 * These are the rules that can actually REFUSE a save. Each has a row-level
 * twin that only displays (see RowField), and the pairing is deliberate: the
 * row explains the problem where the researcher is working, the array is what
 * stops the protocol being saved with it.
 */
export const optionsValidation = {
  required: MINIMUM_OPTIONS_MESSAGE,
  custom: messageRuleValidation([
    minTwoPopulatedOptions,
    completeOptions,
    uniqueOptionValues,
    uniqueOptionLabels,
    allowedOptionValues,
  ]),
};

const EMPTY_OPTIONS: OptionValue[] = [];

export type OptionsProps = Omit<
  ArrayFieldProps<OptionValue>,
  | 'addButtonLabel'
  | 'confirmDelete'
  | 'editorComponent'
  | 'emptyStateMessage'
  | 'immediateAdd'
  | 'itemClasses'
  | 'itemComponent'
  | 'itemTemplate'
  | 'onOperation'
  | 'sortable'
> & {
  /**
   * Visible text and accessible name of the add button — REQUIRED, and a whole
   * string rather than a `Create new ${itemLabel}` template, so it can be
   * localised and so no call site can fall back to a generic default.
   *
   * The sibling `MultiSelect` doc explains what a shared default costs: a
   * Categorical Bin prompt editor mounts this list alongside two sort-rule
   * lists, and named "Add new" all three are the same control to anyone
   * navigating by a list of buttons (#1391).
   */
  addButtonLabel: string;
};

/**
 * The inline label/value option-list editor for ordinal and categorical
 * variables.
 *
 * Rendered as `<ProtocolArrayField component={Options} … />`, so the whole
 * list is ONE field value; rows validate locally (see RowField) rather than
 * registering `options[0].label` in the form store, which would let a deleted
 * option's dormant value reappear in the saved variable.
 */
export default function Options({
  value = EMPTY_OPTIONS,
  onChange,
  name = '',
  addButtonLabel,
  'aria-invalid': ariaInvalid = false,
  ...arrayFieldProps
}: OptionsProps) {
  const context = useMemo(
    () => ({
      arrayName: name,
      allValues: arrayScopedValues(name, value),
      showArrayError: ariaInvalid,
    }),
    [ariaInvalid, name, value],
  );

  const itemTemplate = useCallback(() => ({}), []);
  // Options carry no id of their own, so identity falls back to position while
  // the list is unchanged and to content otherwise — see `resolveRowIndex`.
  const { onOperation } = useArrayFieldCommands<OptionValue>(value, onChange);

  return (
    <OptionsContext value={context}>
      <ArrayField<OptionValue>
        {...arrayFieldProps}
        name={name}
        value={value}
        onChange={onChange}
        onOperation={onOperation}
        aria-invalid={ariaInvalid}
        itemComponent={Option}
        itemTemplate={itemTemplate}
        itemClasses="p-0! shadow-none"
        addButtonLabel={addButtonLabel}
        emptyStateMessage="No options have been added yet."
        immediateAdd
        sortable
        confirmDelete={false}
      />
    </OptionsContext>
  );
}
