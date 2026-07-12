import { connect } from 'react-redux';
import { FieldArray, formValueSelector } from 'redux-form';

import FrescoReduxArrayField from '~/components/Form/FrescoReduxArrayField';
import type { RootState } from '~/ducks/modules/root';
import { getVariableOptionsForSubject } from '~/selectors/codebook';

import Attribute, { type AttributeValue } from './Attribute';

const ALLOWED_TYPES = ['boolean'];

export type VariableOption = {
  disabled?: boolean;
  isUsed?: boolean;
  label: string;
  type?: string;
  value: string;
};

export const getAssignableVariableOptions = (
  variableOptions: VariableOption[],
  usedVariables: Array<string | null | undefined>,
) =>
  variableOptions
    .filter(
      ({ type: optionType }) =>
        optionType && ALLOWED_TYPES.includes(optionType),
    )
    .map(({ value, ...rest }) => ({
      ...rest,
      value,
      disabled: usedVariables.includes(value),
    }));

type AssignAttributesProps = {
  entity: 'node' | 'edge' | 'ego';
  form: string;
  name: string;
  type: string;
  variableOptions: VariableOption[];
};

const AssignAttributes = ({
  variableOptions,
  type,
  entity,
  name,
}: AssignAttributesProps) => (
  <FieldArray
    name={name}
    component={FrescoReduxArrayField}
    label=""
    itemComponent={Attribute}
    itemComponentProps={{ entity, type, variableOptions }}
    itemTemplate={() => ({}) satisfies Partial<AttributeValue>}
    itemClasses="p-0! shadow-none"
    addButtonLabel="Add new variable to assign"
    emptyStateMessage="No additional variables assigned."
    immediateAdd
    confirmDelete={false}
    rerenderOnEveryChange
  />
);

const mapStateToProps = (
  state: RootState,
  { entity, type, form, name }: Omit<AssignAttributesProps, 'variableOptions'>,
) => {
  const usedVariables = (
    (formValueSelector(form)(state, name) as AttributeValue[] | undefined) || []
  ).map(({ variable }) => variable);
  const variableOptions = getVariableOptionsForSubject(state, { entity, type });

  return {
    variableOptions: getAssignableVariableOptions(
      variableOptions,
      usedVariables,
    ),
  };
};

export default connect(mapStateToProps)(AssignAttributes);
