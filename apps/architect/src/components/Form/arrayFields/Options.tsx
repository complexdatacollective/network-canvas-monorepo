import { useCallback, useMemo } from 'react';

import ArrayField, {
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import {
  isOptionComplete,
  isOptionLabelEmpty,
  isOptionValueEmpty,
} from '~/components/Options/optionCompleteness';
import { validations } from '~/utils/validations';

import Option, { OptionsContext, type OptionValue } from './Option';
import { arrayScopedValues } from './RowField';

export type { OptionValue } from './Option';

/**
 * Array-level rules. They belong to the caller's `ArchitectArrayField`
 * (`validation={optionsValidation}`), where the shared adapter routes them
 * through fresco-ui's `custom` entry with the whole array as the value — rows
 * are not registered fields and cannot carry them.
 */
export const minTwoOptions = (value: unknown) =>
  !value || (Array.isArray(value) && value.length < 2)
    ? 'Requires a minimum of two options. If you need fewer options, consider using a boolean variable.'
    : undefined;

export const completeOptions = (value: unknown) =>
  Array.isArray(value) && !value.every(isOptionComplete)
    ? 'Every option needs both a label and a value.'
    : undefined;

/**
 * Strings compare case-insensitively, matching `uniqueArrayAttribute` — the
 * rule the rows run — so the array and its rows never disagree about which
 * entries clash.
 */
const hasDuplicates = (values: unknown[]) => {
  const seen = new Set<unknown>();
  for (const value of values) {
    const key = typeof value === 'string' ? value.toLowerCase() : value;
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
 * reject them: the rows run `uniqueArrayAttribute` too, but a row is not a
 * registered field (see RowField) and can only display its error — nothing
 * carries it into the form's validity. Incomplete entries are `completeOptions`'
 * business and are ignored here so one edit does not raise two errors.
 */
export const uniqueOptionValues = (value: unknown) =>
  hasDuplicates(
    readOptions(value)
      .map((option) => option.value)
      .filter((optionValue) => !isOptionValueEmpty(optionValue)),
  )
    ? 'Every option needs a unique value.'
    : undefined;

/** The label counterpart of `uniqueOptionValues`. */
export const uniqueOptionLabels = (value: unknown) =>
  hasDuplicates(
    readOptions(value)
      .map((option) => option.label)
      .filter((label) => !isOptionLabelEmpty(label)),
  )
    ? 'Every option needs a unique label.'
    : undefined;

// Runs the rows' own rule so the array and its rows can never disagree about
// which characters — or which wording — apply.
const validateOptionValue = validations.allowedVariableName('option value');

/**
 * The array counterpart of the rows' `allowedVariableName`. An option value
 * has to be an NMTOKEN because it becomes an XML export key and a CSV column
 * header (`${attributeName}_${option.value}`), and the row's own message is
 * display-only (see RowField): collapsing the row hides it entirely while
 * keeping the value, so without this the protocol ships with a value the
 * researcher was told was invalid.
 *
 * Values are stringified because `parseOptionValue` stores numeric-looking
 * input as a number. Empty values are `completeOptions`' business, and this
 * rule is bundled last because only the first failing rule is reported per
 * field (see `toZodValidation`) — a blank row should say what it is missing
 * before it is told the missing value is malformed.
 */
export const allowedOptionValues = (value: unknown) =>
  readOptions(value)
    .map((option) => option.value)
    .filter((optionValue) => !isOptionValueEmpty(optionValue))
    .map((optionValue) => validateOptionValue(String(optionValue)))
    .find((message) => message !== undefined);

/**
 * Every array-level rule an options editor needs, as one object for the
 * owning `ArchitectArrayField`'s `validation` prop. Passed whole rather than
 * rule by rule so a call site cannot silently keep some and drop others.
 */
export const optionsValidation = {
  minTwoOptions,
  completeOptions,
  uniqueOptionValues,
  uniqueOptionLabels,
  allowedOptionValues,
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
>;

/**
 * The fresco-ui-native successor to `~/components/Options/Options.tsx`: the
 * inline label/value option-list editor for ordinal and categorical variables.
 *
 * Rendered as `<ArchitectArrayField component={Options} … />`, so the whole
 * list is ONE field value; rows validate locally (see RowField) rather than
 * registering `options[0].label` in the form store, which would let a deleted
 * option's dormant value reappear in the saved variable.
 */
const Options = ({
  value = EMPTY_OPTIONS,
  onChange,
  name = '',
  'aria-invalid': ariaInvalid = false,
  ...arrayFieldProps
}: OptionsProps) => {
  const context = useMemo(
    () => ({
      arrayName: name,
      allValues: arrayScopedValues(name, value),
      showArrayError: ariaInvalid,
    }),
    [ariaInvalid, name, value],
  );

  const itemTemplate = useCallback(() => ({}), []);

  return (
    <OptionsContext.Provider value={context}>
      <ArrayField<OptionValue>
        {...arrayFieldProps}
        name={name}
        value={value}
        onChange={onChange}
        aria-invalid={ariaInvalid}
        itemComponent={Option}
        itemTemplate={itemTemplate}
        itemClasses="bg-surface-3 text-surface-3-contrast p-0! shadow-none"
        addButtonLabel="Add new"
        emptyStateMessage="No options have been added yet."
        immediateAdd
        sortable
        confirmDelete={false}
      />
    </OptionsContext.Provider>
  );
};

export default Options;
