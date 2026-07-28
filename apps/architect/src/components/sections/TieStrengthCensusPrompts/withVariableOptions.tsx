import type { UnknownAction } from '@reduxjs/toolkit';
import { get } from 'es-toolkit/compat';
import { compose, lifecycle } from 'react-recompose';
import { connect } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import type { RootState } from '~/ducks/store';
import {
  getVariableOptionsForSubject,
  getVariablesForSubject,
} from '~/selectors/codebook';
import { excludeValidatedUses } from '~/selectors/roleFilters';

const mapStateToProps = (state: RootState, { form }: { form: string }) => {
  const formSelector = formValueSelector(form);
  const createEdge = formSelector(state, 'createEdge');
  const subject: { entity: 'edge'; type: string } = {
    type: createEdge,
    entity: 'edge',
  };
  const edgeVariable = formSelector(state, 'edgeVariable');

  // TSC's edge-variable picker is an UNVALIDATED writer: drop options a form
  // elsewhere already validates.
  const variableOptions = excludeValidatedUses(
    state,
    subject,
    getVariableOptionsForSubject(state, subject).filter(
      ({ type }) => type === 'ordinal',
    ),
    edgeVariable,
  );

  const variables = getVariablesForSubject(state, subject);
  const optionsForVariable = get(variables, [edgeVariable, 'options'], []);
  const optionsForVariableDraft = formSelector(state, 'variableOptions');

  return {
    createEdge,
    edgeVariable,
    variableOptions,
    optionsForVariable,
    optionsForVariableDraft,
  };
};

const mapDispatchToProps = {
  changeForm: change,
};

const variableOptions = connect(mapStateToProps, mapDispatchToProps);

type LifecycleProps = {
  changeForm: typeof change;
  form: string;
  optionsForVariable: unknown[];
  edgeVariable: string;
};

// Fix to keep redux 'sub-form' fields in sync
const updateFormVariableOptions = lifecycle<LifecycleProps, unknown>({
  componentDidUpdate(previousProps: LifecycleProps) {
    const { changeForm, form, optionsForVariable, edgeVariable } = this.props;
    if (previousProps.edgeVariable === edgeVariable) {
      return;
    }

    changeForm(form, 'variableOptions', optionsForVariable) as UnknownAction; // TODO: is this wrong field name?
  },
});

const withVariableOptions = compose(variableOptions, updateFormVariableOptions);

export default withVariableOptions;
