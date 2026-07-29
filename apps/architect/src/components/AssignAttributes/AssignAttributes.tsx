import { get } from 'es-toolkit/compat';
import { connect } from 'react-redux';
import {
  FieldArray,
  formValueSelector,
  getFormInitialValues,
} from 'redux-form';

import FrescoReduxArrayField from '~/components/Form/FrescoReduxArrayField';
import { draftFormFieldVariableIds } from '~/components/Validations/draftWriterRoles';
import type { RootState } from '~/ducks/modules/root';
import { getVariableOptionsForSubject } from '~/selectors/codebook';
import { excludeValidatedUses } from '~/selectors/roleFilters';

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
  stageForm?: string;
  type: string;
  variableOptions: VariableOption[];
  draftValidatedVariables: ReadonlySet<string>;
};

const AssignAttributes = ({
  variableOptions,
  type,
  entity,
  name,
  draftValidatedVariables,
}: AssignAttributesProps) => (
  <FieldArray
    name={name}
    component={FrescoReduxArrayField}
    label=""
    itemComponent={Attribute}
    itemComponentProps={{
      entity,
      type,
      variableOptions,
      draftValidatedVariables,
    }}
    itemTemplate={() => ({}) satisfies Partial<AttributeValue>}
    itemClasses="p-0! shadow-none"
    addButtonLabel="Add new variable to assign"
    emptyStateMessage="No additional variables assigned."
    immediateAdd
    confirmDelete={false}
    rerenderOnEveryChange
  />
);

/**
 * additionalAttributes stamps are UNVALIDATED writers (the interview writes
 * the configured boolean straight onto the node, bypassing codebook
 * validation), so the shared row pool drops options a form elsewhere already
 * validates. `committedVariables` is every row's COMMITTED pick from the
 * prompt editor's initial values — the multi-row form of the usual
 * currentValue escape, so an existing row keeps rendering its selection.
 * The outer `stageForm` contributes live form-field roles before the stage
 * itself has been saved.
 * Exported so pickerExclusions.test.ts pins the direction directly.
 */
export const getAdditionalAttributesOptionsForSubject = (
  state: RootState,
  subject: { entity: 'node' | 'edge' | 'ego'; type: string },
  committedVariables?: readonly string[],
) =>
  excludeValidatedUses(
    state,
    subject,
    getVariableOptionsForSubject(state, subject),
    committedVariables,
  );

const mapStateToProps = (
  state: RootState,
  {
    entity,
    type,
    form,
    name,
    stageForm,
  }: Omit<AssignAttributesProps, 'variableOptions' | 'draftValidatedVariables'>,
) => {
  const usedVariables = (
    (formValueSelector(form)(state, name) as AttributeValue[] | undefined) || []
  ).map(({ variable }) => variable);
  const committedVariables = (
    (get(getFormInitialValues(form)(state), name) as
      | AttributeValue[]
      | undefined) || []
  )
    .map(({ variable }) => variable)
    .filter((variable): variable is string => typeof variable === 'string');
  const variableOptions = getAdditionalAttributesOptionsForSubject(
    state,
    { entity, type },
    committedVariables,
  );
  const draftValidatedVariables = draftFormFieldVariableIds(
    stageForm ? formValueSelector(stageForm)(state, 'form.fields') : undefined,
  );
  const draftSafeOptions = variableOptions.filter(
    ({ value }) =>
      !draftValidatedVariables.has(value) || committedVariables.includes(value),
  );

  return {
    variableOptions: getAssignableVariableOptions(
      draftSafeOptions,
      usedVariables,
    ),
    draftValidatedVariables,
  };
};

export default connect(mapStateToProps)(AssignAttributes);
