import { useCallback, useMemo } from 'react';

import ArrayField, {
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import { isOptionComplete } from '~/components/Options/optionCompleteness';

import Option, { OptionsContext, type OptionValue } from './Option';
import { arrayScopedValues } from './RowField';

export type { OptionValue } from './Option';

/**
 * Array-level rules. They belong to the caller's `ArchitectArrayField`
 * (`validation={{ minTwoOptions, completeOptions }}`), where the shared
 * adapter routes them through fresco-ui's `custom` entry with the whole array
 * as the value — rows are not registered fields and cannot carry them.
 */
export const minTwoOptions = (value: unknown) =>
  !value || (Array.isArray(value) && value.length < 2)
    ? 'Requires a minimum of two options. If you need fewer options, consider using a boolean variable.'
    : undefined;

export const completeOptions = (value: unknown) =>
  Array.isArray(value) && !value.every(isOptionComplete)
    ? 'Every option needs both a label and a value.'
    : undefined;

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
