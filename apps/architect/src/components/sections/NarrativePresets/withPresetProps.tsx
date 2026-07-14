import { compose, withHandlers } from 'react-recompose';
import { connect } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import {
  createVariableAsync,
  deleteVariableAsync,
} from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/store';

import { getEdgesForSubject, getNarrativeVariables } from './selectors';

const mapStateToProps = (
  state: RootState,
  { entity, type, form }: { entity: string; type: string; form: string },
) => {
  const narrativeVariables = getNarrativeVariables(state, {
    entity: entity as 'node' | 'edge' | 'ego',
    type,
  });
  const edgesForSubject = getEdgesForSubject(state);
  const formSelector = formValueSelector(form);
  const layoutVariable = formSelector(state, 'layoutVariable') as
    | string
    | undefined;
  const groupVariable = formSelector(state, 'groupVariable') as
    | string
    | undefined;

  return {
    ...narrativeVariables,
    edgesForSubject,
    groupVariable,
    layoutVariable,
  };
};

const mapDispatchToProps = {
  createVariable: createVariableAsync,
  deleteVariable: deleteVariableAsync,
  changeForm: change,
};

type HandlerProps = {
  form: string;
  changeForm: typeof change;
  // react-redux's object-shorthand mapDispatchToProps dispatch-binds these
  // action creators, so calling `createVariable(arg)` returns the dispatched
  // thunk promise (with `.unwrap()`), not the raw AsyncThunkAction that
  // `typeof createVariableAsync` describes. Type it to what is actually used.
  createVariable: (arg: Parameters<typeof createVariableAsync>[0]) => {
    unwrap: () => Promise<{ variable: string }>;
  };
  deleteVariable: typeof deleteVariableAsync;
  entity: string;
  type: string;
};

const variableHandlers = withHandlers({
  handleCreateLayoutVariable:
    ({ form, changeForm, createVariable, entity, type }: HandlerProps) =>
    async (name: string) => {
      // `createVariable` is already dispatch-bound by react-redux's
      // object-shorthand `mapDispatchToProps`, so it is called directly (and
      // returns the thunk promise). The previous code destructured a `dispatch`
      // prop that object-shorthand mapDispatchToProps never injects, so
      // creating a layout variable from a preset threw.
      const result = await createVariable({
        entity: entity as 'node' | 'edge' | 'ego',
        type,
        configuration: { type: 'layout', name },
      }).unwrap();
      const { variable } = result;
      changeForm(form, 'layoutVariable', variable);
      return variable;
    },
  handleDeleteVariable:
    ({ entity, type, deleteVariable }: HandlerProps) =>
    (variable: string) =>
      deleteVariable({
        entity: entity as 'node' | 'edge' | 'ego',
        type,
        variable,
      }),
});

const withPresetProps = compose(
  connect(mapStateToProps, mapDispatchToProps),
  variableHandlers,
);

export default withPresetProps;
