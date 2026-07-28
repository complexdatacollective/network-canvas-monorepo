import { createSelector } from '@reduxjs/toolkit';
import { compose, withHandlers } from 'react-recompose';
import { connect } from 'react-redux';
import type { FormAction } from 'redux-form';
import { change, getFormInitialValues, SubmissionError } from 'redux-form';

import { updateVariableAsync } from '../../../ducks/modules/protocol/codebook';
import type { RootState } from '../../../ducks/modules/root';
import { getVariablesForSubjectSelector } from '../../../selectors/codebook';
import { hasValidatedUse } from '../../../selectors/roleFilters';
import {
  crossClassPickIssue,
  findDraftContradictions,
  validatedElsewhereMessage,
} from '../../Validations/contradictions';

// The shared row-editor form name every DialogArrayField editor requests
// (see e.g. CategoricalBinPrompts.tsx's `requestedEditFormName`) — only one
// editor dialog is ever open at a time, so this is safe to read unqualified.
const EDIT_FORM_NAME = 'editable-list-form';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type OwnProps = {
  form: string;
  entity: 'node' | 'edge' | 'ego';
  type: string;
};

// A factory function (rather than a single module-level mapStateToProps)
// gives each connected component instance (this HOC backs both
// CategoricalBinPrompts and OrdinalBinPrompts) its own memoized subject
// selector, so a fresh {entity, type} object is only allocated when those
// primitives actually change — matching getVariablesForSubjectSelector's
// reselect memoization instead of defeating it every render.
const makeMapStateToProps = () => {
  const getSubject = createSelector(
    [
      (_state: RootState, props: OwnProps) => props.entity,
      (_state: RootState, props: OwnProps) => props.type,
    ],
    (entity, type) => ({ entity, type }),
  );

  return (state: RootState, props: OwnProps) => {
    const subject = getSubject(state, props);
    const initialValues = getFormInitialValues(EDIT_FORM_NAME)(state);
    return {
      allVariables: getVariablesForSubjectSelector(state, subject),
      // Backs the save-time cross-class gate: this prompt's variable may not
      // be one a form elsewhere already collects.
      hasValidatedUse: (variableId: string) =>
        hasValidatedUse(state, subject, variableId),
      // The row's PRE-EDIT committed variable, for the gate's unchanged-pick
      // escape (only one editor dialog is ever open at a time, so the shared
      // row-editor form's initial values are this prompt's own).
      originalVariable:
        isRecord(initialValues) && typeof initialValues.variable === 'string'
          ? initialValues.variable
          : '',
    };
  };
};

const store = connect(makeMapStateToProps, {
  updateVariable: updateVariableAsync,
  changeForm: change,
});

type HandlerProps = OwnProps &
  ReturnType<ReturnType<typeof makeMapStateToProps>> & {
    updateVariable: typeof updateVariableAsync;
    changeForm: (form: string, field: string, value: unknown) => FormAction;
  };

const handlers = withHandlers({
  handleChangePrompt:
    (props: HandlerProps) =>
    async ({
      variable,
      variableOptions,
      ...rest
    }: {
      variable: string;
      variableOptions: unknown;
      [key: string]: unknown;
    }) => {
      // Saving new options for the bound variable can make its own committed
      // validation rules (e.g. minSelected) impossible to satisfy — check
      // before writing, the same way the field-editor dialog does. Widened to
      // `unknown` so the isRecord guards below narrow it freshly: Variable is a
      // discriminated union, and some of its members (e.g. layout) have no
      // `validation` field, which defeats isRecord's narrowing when applied
      // directly to the union type.
      //
      // A variable that only ever appears as the TARGET of another's
      // sameAs/comparator has no rules of its own, so `existingVariable`
      // legitimately has no `validation` key at all. That must not skip the
      // check — shrinking its options can still break an incoming
      // relationship — so an absent/non-record validation runs the analyser
      // with an empty rule map instead.
      const existingVariable: unknown = props.allVariables[variable];
      const existingValidation =
        isRecord(existingVariable) && isRecord(existingVariable.validation)
          ? existingVariable.validation
          : {};
      const variableType =
        isRecord(existingVariable) && typeof existingVariable.type === 'string'
          ? existingVariable.type
          : undefined;
      if (variableType) {
        const contradiction = findDraftContradictions({
          allVariables: props.allVariables,
          currentVariableId: variable,
          variableType,
          validation: existingValidation,
          options: variableOptions,
        })[0];
        if (contradiction) {
          // redux-form's ConnectedFieldArray reads a FieldArray's submit
          // error only from submitErrors.<name>._error, never a bare string
          // under submitErrors.<name> — so the message must be keyed here to
          // reach the field.
          throw new SubmissionError<
            { variableOptions: unknown },
            { _error: string }
          >({
            variableOptions: { _error: contradiction.message },
          });
        }
      }

      // Cross-class exclusivity gate: this bin is an UNVALIDATED writer, so
      // it may not save a variable a form elsewhere already collects (the
      // save-time backstop for a stale draft that bypassed the picker
      // exclusion). `variable` is a plain field on the prompt form, so a
      // STRING value renders correctly (see PromptFields.tsx's ValidatedField
      // — confirmed against the existing `variable: ensureError(e).message`
      // precedent in FamilyPedigree/NodeConfiguration.tsx).
      const crossClassIssue = crossClassPickIssue({
        variableId: variable,
        originalVariableId: props.originalVariable,
        hasConflictingUse: props.hasValidatedUse,
        allVariables: props.allVariables,
        message: validatedElsewhereMessage,
      });
      if (crossClassIssue) {
        throw new SubmissionError({ variable: crossClassIssue });
      }

      props.changeForm(props.form, '_modified', Date.now()); // TODO: can we avoid this?

      await props.updateVariable({
        entity: props.entity,
        type: props.type,
        variable,
        configuration: { options: variableOptions } as Record<string, unknown>,
      });

      return { variable, ...rest };
    },
});

const withPromptChangeHandler = compose(store, handlers);

export default withPromptChangeHandler;
