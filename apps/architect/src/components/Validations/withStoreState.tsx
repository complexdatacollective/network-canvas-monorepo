import type { UnknownAction } from '@reduxjs/toolkit';
import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import { change, formValueSelector } from 'redux-form';

import type { Variable } from '@codaco/protocol-validation';
import type { RootState } from '~/ducks/modules/root';

import { getGroupedValidationsForVariableType } from './options';

type OwnProps = {
  form: string;
  name: string;
  variableType: string;
  entity: string;
  existingVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
  allVariables?: Record<string, Pick<Variable, 'name' | 'type'>>;
  currentVariableId?: string;
  scopeId?: string;
};

const mapStateToProps = (
  state: RootState,
  { form, name, variableType, entity }: OwnProps,
) => {
  const validationGroups = getGroupedValidationsForVariableType(
    variableType,
    entity,
  );
  return {
    validationGroups,
    value: formValueSelector(form)(state, name),
    draftOptions: formValueSelector(form)(state, 'options'),
    // Nineteenth-wave Finding 4: the row-level check judged reference rules
    // against the COMMITTED component/parameters, so editing a datetime
    // variable's window and adding a reference rule in one dialog session was
    // rejected on the old window even though the form-level validator (which
    // does see the draft) accepts it. Sourced exactly like `draftOptions`, so
    // both checks read one set of live form values.
    draftComponent: formValueSelector(form)(state, 'component'),
    draftParameters: formValueSelector(form)(state, 'parameters'),
    draftVariableName: formValueSelector(form)(state, '_createNewVariable'),
  };
};

const mapDispatchToProps = (dispatch: Dispatch, { form, name }: OwnProps) => ({
  update: (value: Record<string, unknown>) => {
    dispatch(change(form, name, value) as UnknownAction);
  },
});

export default connect<
  ReturnType<typeof mapStateToProps>,
  ReturnType<typeof mapDispatchToProps>,
  OwnProps,
  RootState
>(mapStateToProps, mapDispatchToProps);
