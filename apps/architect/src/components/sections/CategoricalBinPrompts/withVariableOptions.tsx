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
import {
  excludeUnvalidatedUses,
  excludeValidatedUses,
} from '~/selectors/roleFilters';

type Entity = 'node' | 'edge' | 'ego';

const mapStateToProps = (
  state: RootState,
  {
    form,
    type,
    entity,
  }: { form: string; type?: string; entity: Entity | string },
) => {
  const subject = { type, entity: entity as Entity };
  const rawVariableOptions = getVariableOptionsForSubject(state, subject);

  const formSelector = formValueSelector(form);
  const variable = formSelector(state, 'variable');
  const otherVariable = formSelector(state, 'otherVariable');

  // The main `variable` picker (CategoricalBin, OrdinalBin, Geospatial) is an
  // UNVALIDATED writer: drop options a form elsewhere already validates.
  const variableOptions = excludeValidatedUses(
    state,
    subject,
    rawVariableOptions,
    variable,
  );
  // CategoricalBin's "other" picker is a VALIDATED writer (its input now
  // honours the referenced variable's codebook validation): drop options an
  // unvalidated writer elsewhere already claims.
  const otherVariableOptions = excludeUnvalidatedUses(
    state,
    subject,
    rawVariableOptions,
    otherVariable,
  );

  const variables = getVariablesForSubject(state, subject);
  const optionsForVariable = get(variables, [variable, 'options'], []);
  const optionsForVariableDraft = formSelector(state, 'variableOptions');

  return {
    variable,
    otherVariable,
    variableOptions,
    otherVariableOptions,
    // Sort keys (bucket/bin sortOrder `property`) are untagged read-only
    // REFERENCES, deliberately outside the writer-exclusivity rule — a bin
    // may still be sorted by a variable a form collects — so
    // getSortOrderOptionGetter consumers must draw from this RAW pool, never
    // the role-filtered writer pools above.
    sortVariableOptions: rawVariableOptions,
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
  variable: string;
};

// Fix to keep redux 'sub-form' fields in sync
const updateFormVariableOptions = lifecycle<LifecycleProps, unknown>({
  componentDidUpdate(previousProps: LifecycleProps) {
    const { changeForm, form, optionsForVariable, variable } = this.props;
    if (previousProps.variable === variable) {
      return;
    }
    changeForm(form, 'variableOptions', optionsForVariable) as UnknownAction; // TODO: is this wrong field name?
  },
});

const withVariableOptions = compose(variableOptions, updateFormVariableOptions);

export default withVariableOptions;
