import { FieldArray } from 'redux-form';

import type { VariableOptions } from '@codaco/protocol-validation';
import FrescoReduxArrayField from '~/components/Form/FrescoReduxArrayField';

import Option from './Option';
import { isOptionComplete } from './optionCompleteness';

export type OptionValue = VariableOptions[number];

export const minTwoOptions = (value: unknown) =>
  !value || (Array.isArray(value) && value.length < 2)
    ? 'Requires a minimum of two options. If you need fewer options, consider using a boolean variable.'
    : undefined;

export const completeOptions = (value: unknown) =>
  Array.isArray(value) && !value.every(isOptionComplete)
    ? 'Every option needs both a label and a value.'
    : undefined;

type OptionsProps = {
  name: string;
  label?: string;
};

const Options = ({ name, label = '' }: OptionsProps) => (
  <FieldArray
    name={name}
    component={FrescoReduxArrayField}
    label={label}
    itemComponent={Option}
    itemTemplate={() => ({})}
    itemClasses="bg-surface-3 text-surface-3-contrast p-0! shadow-none"
    addButtonLabel="Add new"
    emptyStateMessage="No options have been added yet."
    immediateAdd
    sortable
    confirmDelete={false}
    validate={[minTwoOptions, completeOptions]}
    rerenderOnEveryChange
  />
);

export default Options;
