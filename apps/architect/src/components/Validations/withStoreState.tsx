import { connect } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import type { RootState } from '~/ducks/modules/root';
import type { AppDispatch } from '~/ducks/store';

import { getValidationOptionsForVariableType } from './options';

const mapStateToProps = (
  state: RootState,
  {
    form,
    name,
    variableType,
    entity,
  }: { form: string; name: string; variableType: string; entity: string },
) => {
  const validationOptions = getValidationOptionsForVariableType(
    variableType,
    entity,
  );
  return {
    validationOptions,
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
  };
};

const mapDispatchToProps = (
  dispatch: AppDispatch,
  { form, name }: { form: string; name: string },
) => ({
  update: (value: unknown) => dispatch(change(form, name, value)),
});

export default connect<
  ReturnType<typeof mapStateToProps>,
  typeof mapDispatchToProps,
  { form: string; name: string; variableType: string; entity: string },
  RootState
>(mapStateToProps, mapDispatchToProps);
