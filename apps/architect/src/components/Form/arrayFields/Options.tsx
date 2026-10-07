import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import {
  createAppIntl,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import ArrayField, {
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import {
  type LocaleTag,
  type LocalizedString,
  MINIMUM_VARIABLE_OPTIONS,
} from '@codaco/protocol-validation';
import {
  type ExportColumnEntity,
  type ExportColumnVariable,
  hasDuplicateOptionLabels,
} from '@codaco/shared-consts';
import {
  isOptionComplete,
  isOptionValueEmpty,
} from '~/components/Options/optionCompleteness';
import { getLocalization } from '~/selectors/protocol';
import {
  findExportColumnConflictMessage,
  toExportColumnCandidate,
} from '~/utils/exportColumnConflicts';
import { translationText } from '~/utils/localizedText';
import { createValidations, nameComparisonKey } from '~/utils/validations';

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
  !value || (Array.isArray(value) && value.length < MINIMUM_VARIABLE_OPTIONS)
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
 * Option values compare as names, exactly as the rows' `uniqueArrayName` does
 * (see `nameComparisonKey`), so the array and its rows never disagree about
 * which entries clash: case-insensitively, under Unicode canonical equivalence,
 * and as text, so the values `1` and `"1"` are one value.
 */
const hasDuplicates = (values: unknown[]) => {
  const seen = new Set<string>();
  for (const value of values) {
    const key = nameComparisonKey(value);
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
 * reject them: the rows run `uniqueArrayName` too, but a row is not a
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

const readLabel = (option: Record<string, unknown>) =>
  isLocalizedString(option.label) ? option.label : undefined;

const isLocalizedString = (value: unknown): value is LocalizedString =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value).every((text) => typeof text === 'string');

// Labels are compared one language at a time: that is what a participant reads.
const optionLabelLocales = (value: unknown) => [
  ...new Set(
    readOptions(value).flatMap((option) =>
      Object.keys(readLabel(option) ?? {}),
    ),
  ),
];

/**
 * The options with each label replaced by its plain text in `locale`, the
 * shape the shared label rules compare.
 */
const optionsWithLabelText = (value: unknown, locale: LocaleTag) =>
  readOptions(value).map((option) => ({
    ...option,
    label: translationText(readLabel(option), locale),
  }));

/**
 * The label counterpart of `uniqueOptionValues`, asked of the one predicate
 * every surface that authors an option label asks — shared-consts'
 * `hasDuplicateOptionLabels`, which the protocol-builder editors and the
 * codebook write that records what they author ask as well, so a list this
 * rule lets through is never refused again further down.
 */
export const uniqueOptionLabels = (
  value: unknown,
  intl: IntlShape = defaultIntl,
) =>
  optionLabelLocales(value).some((locale) =>
    hasDuplicateOptionLabels(optionsWithLabelText(value, locale)),
  )
    ? intl.formatMessage(messages.uniqueLabels)
    : undefined;

/**
 * The array counterpart of the rows' `codebookName`, run on the same rule so
 * the two can never disagree about which text an option value may be. A row's
 * own message is display-only (see RowField): collapsing the row hides it
 * entirely while keeping the value, so without this the protocol ships with a
 * value the researcher was told was invalid.
 *
 * Empty values are `completeOptions`' business, and this rule is bundled last
 * among the value rules because only the first failing rule is reported per
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
    .map((optionValue) => createValidations(intl).codebookName()(optionValue))
    .find((message) => message !== undefined);

/** What the options of a new attribute are exported next to. */
type OptionColumnContext = Readonly<{
  entity: ExportColumnEntity;
  /** The other attributes of the same node type, edge type or ego. */
  siblings: readonly ExportColumnVariable[];
}>;

/**
 * Each option is exported to a column named after the attribute and the
 * option (`attribute_option`), which another attribute's column may already
 * have. The clash depends on the attribute's name and type, so they are read
 * from the form's values (`allValues`), and the options being judged are the
 * value of this very field.
 *
 * Clashes in the attribute's own columns are the name field's to report.
 */
const exportColumnConflicts = (
  value: unknown,
  allValues: Record<string, unknown> | undefined,
  { entity, siblings }: OptionColumnContext,
  intl: IntlShape = defaultIntl,
) =>
  findExportColumnConflictMessage({
    entity,
    intl,
    siblings,
    origins: ['option'],
    candidate: toExportColumnCandidate({
      name: allValues?.name,
      type: allValues?.type,
      options: value,
    }),
  });

/**
 * Every array-level rule an options editor needs, as one object for the
 * owning `ArchitectArrayField`'s `validation` prop. Passed whole rather than
 * rule by rule so a call site cannot silently keep some and drop others.
 *
 * `context` is what the options are exported next to. Without it the options
 * cannot be checked for export column clashes, so a call site that creates or
 * renames an attribute should always pass it.
 */
export const optionsValidation = (
  intl: IntlShape = defaultIntl,
  context?: OptionColumnContext,
) => ({
  required: intl.formatMessage(messages.minimum),
  minTwoOptions: (value: unknown) => minTwoPopulatedOptions(value, intl),
  completeOptions: (value: unknown) => completeOptions(value, intl),
  uniqueOptionValues: (value: unknown) => uniqueOptionValues(value, intl),
  uniqueOptionLabels: (value: unknown) => uniqueOptionLabels(value, intl),
  allowedOptionValues: (value: unknown) => allowedOptionValues(value, intl),
  exportColumnConflicts: (
    value: unknown,
    allValues?: Record<string, unknown>,
  ) =>
    context
      ? exportColumnConflicts(value, allValues, context, intl)
      : undefined,
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
   * A shared default costs a real defect: a Categorical Bin prompt editor
   * mounts this list alongside two sort-rule lists, and named "Add new" all
   * three are the same control to anyone navigating by a list of buttons
   * (#1391).
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
  const localization = useSelector(getLocalization);
  const labelLocale = localization?.defaultLocale ?? '';
  const context = useMemo(
    () => ({
      arrayName: name,
      allValues: arrayScopedValues(name, value),
      labelValues: arrayScopedValues(
        name,
        optionsWithLabelText(value, labelLocale),
      ),
      labelLocale,
      showArrayError: ariaInvalid,
    }),
    [ariaInvalid, labelLocale, name, value],
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
