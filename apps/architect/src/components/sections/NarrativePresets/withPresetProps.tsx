import { compose, withHandlers } from 'react-recompose';
import { connect } from 'react-redux';
import { formValueSelector } from 'redux-form';

import type { VariableType } from '@codaco/protocol-validation';
import withCreateVariableHandler from '~/components/enhancers/withCreateVariableHandler';
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

type HandlerProps = {
  handleCreateVariable: (
    variableName: string,
    variableType?: VariableType,
    field?: string,
  ) => Promise<string | undefined>;
};

const variableHandlers = withHandlers({
  // handleCreateVariable (injected by withCreateVariableHandler) creates the
  // variable, surfaces failures such as duplicate or invalid names via a
  // dialog, and writes the new variable id into the given form field on
  // success — the same pattern the Sociogram layout picker uses.
  handleCreateLayoutVariable:
    ({ handleCreateVariable }: HandlerProps) =>
    (name: string) =>
      handleCreateVariable(name, 'layout', 'layoutVariable'),
});

const withPresetProps = compose(
  connect(mapStateToProps),
  withCreateVariableHandler,
  variableHandlers,
);

export default withPresetProps;
