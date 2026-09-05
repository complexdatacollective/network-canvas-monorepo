import { useCallback, useMemo } from 'react';

import {
  createAppIntl,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import ArrayField, {
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import { normalizeForComparison } from '@codaco/shared-consts';
import {
  isOptionComplete,
  isOptionLabelEmpty,
  isOptionValueEmpty,
} from '~/components/Options/optionCompleteness';
import { createValidations } from '~/utils/validations';

import Option, { OptionsContext, type OptionValue } from './Option';
import { arrayScopedValues } from './RowField';
const additionalMessages = defineMessages({
  noOptionsHaveBeenAddedYet: {
    id: 'architect.additional.form.arrayFields.options.noOptionsHaveBeenAddedYet',
    defaultMessage: 'No options have been added yet.',
    description:
      'The emptyStateMessage text in components / Form / arrayFields / Options.',
  },
});
const messages = defineMessages({
  minimum: {
    id: 'architect.optionValidation.minimum',
    defaultMessage:
      'Requires a minimum of two options. If you need fewer options, consider using a boolean attribute.',
    description:
      'Validation for an ordinal or categorical attribute option list.',
  },
  complete: {
    id: 'architect.optionValidation.complete',
    defaultMessage: 'Every option needs both a label and a value.',
    description:
      'Validation for an ordinal or categorical attribute option list.',
  },
  uniqueValues: {
    id: 'architect.optionValidation.uniqueValues',
    defaultMessage: 'Every option needs a unique value.',
    description:
      'Validation for an ordinal or categorical attribute option list.',
  },
  uniqueLabels: {
    id: 'architect.optionValidation.uniqueLabels',
    defaultMessage: 'Every option needs a unique label.',
    description:
      'Validation for an ordinal or categorical attribute option list.',
  },
  optionValue: {
    id: 'architect.optionValidation.optionValue',
    defaultMessage: 'option value',
    description:
      'Validation for an ordinal or categorical attribute option list.',
  },
});

export type { OptionValue } from './Option';
const defaultIntl = createAppIntl({ locale: 'en' });

/**
 * Array-level rules. They belong to the caller's `ArchitectArrayField`
 * (`validation={optionsValidation(intl)}`), where the shared adapter routes them
 * through fresco-ui's `custom` entry with the whole array as the value — rows
 * are not registered fields and cannot carry them.
 */
export const minimumOptionsMessage = messages.minimum;

export const minTwoOptions = (value: unknown, intl: IntlShape = defaultIntl) =>
  !value || (Array.isArray(value) && value.length < 2)
    ? intl.formatMessage(messages.minimum)
    : undefined;

/** Native `required` owns an absent/empty list; this owns the one-row case. */
export const minTwoPopulatedOptions = (
  value: unknown,
  intl: IntlShape = defaultIntl,
) =>
  Array.isArray(value) && value.length > 0
    ? minTwoOptions(value, intl)
    : undefined;

export const completeOptions = (
  value: unknown,
  intl: IntlShape = defaultIntl,
) =>
  Array.isArray(value) && !value.every(isOptionComplete)
    ? intl.formatMessage(messages.complete)
    : undefined;

/**
 * Strings compare case-insensitively and under Unicode canonical equivalence,
 * matching `uniqueArrayAttribute` — the rule the rows run — so the array and
 * its rows never disagree about which entries clash. See
 * shared-consts' `canonical-text` for why canonical equivalence is part of it.
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
 * reject them: the rows run `uniqueArrayAttribute` too, but a row is not a
 * registered field (see RowField) and can only display its error — nothing
 * carries it into the form's validity. Incomplete entries are `completeOptions`'
 * business and are ignored here so one edit does not raise two errors.
 */
export const uniqueOptionValues = (
  value: unknown,
  intl: IntlShape = defaultIntl,
) =>
  hasDuplicates(
    readOptions(value)
      .map((option) => option.value)
      .filter((optionValue) => !isOptionValueEmpty(optionValue)),
  )
    ? intl.formatMessage(messages.uniqueValues)
    : undefined;

/** The label counterpart of `uniqueOptionValues`. */
export const uniqueOptionLabels = (
  value: unknown,
  intl: IntlShape = defaultIntl,
) =>
  hasDuplicates(
    readOptions(value)
      .map((option) => option.label)
      .filter((label) => !isOptionLabelEmpty(label)),
  )
    ? intl.formatMessage(messages.uniqueLabels)
    : undefined;

// Runs the rows' own rule so the array and its rows can never disagree about
// which characters — or which wording — apply.

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
export const allowedOptionValues = (
  value: unknown,
  intl: IntlShape = defaultIntl,
) =>
  readOptions(value)
    .map((option) => option.value)
    .filter((optionValue) => !isOptionValueEmpty(optionValue))
    .map((optionValue) =>
      createValidations(intl).allowedVariableName(
        intl.formatMessage(messages.optionValue),
      )(String(optionValue)),
    )
    .find((message) => message !== undefined);

/**
 * Every array-level rule an options editor needs, as one object for the
 * owning `ArchitectArrayField`'s `validation` prop. Passed whole rather than
 * rule by rule so a call site cannot silently keep some and drop others.
 */
export const optionsValidation = (intl: IntlShape = defaultIntl) => ({
  required: intl.formatMessage(messages.minimum),
  minTwoOptions: (value: unknown) => minTwoPopulatedOptions(value, intl),
  completeOptions: (value: unknown) => completeOptions(value, intl),
  uniqueOptionValues: (value: unknown) => uniqueOptionValues(value, intl),
  uniqueOptionLabels: (value: unknown) => uniqueOptionLabels(value, intl),
  allowedOptionValues: (value: unknown) => allowedOptionValues(value, intl),
});

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
  addButtonLabel,
  'aria-invalid': ariaInvalid = false,
  ...arrayFieldProps
}: OptionsProps) => {
  const intl = useAppIntl();
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
        itemClasses="p-0! shadow-none"
        addButtonLabel={addButtonLabel}
        emptyStateMessage={intl.formatMessage(
          additionalMessages.noOptionsHaveBeenAddedYet,
        )}
        immediateAdd
        sortable
        confirmDelete={false}
      />
    </OptionsContext.Provider>
  );
};

export default Options;
