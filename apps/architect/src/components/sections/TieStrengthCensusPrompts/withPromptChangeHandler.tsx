import type { Dispatch } from '@reduxjs/toolkit';
import { compose, withHandlers } from 'react-recompose';
import { connect } from 'react-redux';
import { change, getFormInitialValues, SubmissionError } from 'redux-form';

import type { RootState } from '~/ducks/store';
import { getVariablesForSubject } from '~/selectors/codebook';
import { hasValidatedUse } from '~/selectors/roleFilters';

import { updateVariableAsync } from '../../../ducks/modules/protocol/codebook';
import {
  crossClassPickIssue,
  findDraftContradictions,
  validatedElsewhereMessage,
} from '../../Validations/contradictions';

// The shared row-editor form name every DialogArrayField editor requests
// (see TieStrengthCensusPrompts.tsx's `requestedEditFormName`) — only one
// editor dialog is ever open at a time, so this is safe to read unqualified.
const EDIT_FORM_NAME = 'editable-list-form';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type Entity = 'node' | 'edge' | 'ego';

type OwnProps = {
  form: string;
};

type StateProps = {
  // The edge variable an edited prompt binds to (`edgeVariable`) belongs to
  // `createEdge`, the edge type chosen in THAT prompt — not the stage's node
  // subject `withSubject` provides — so its sibling variables must be looked
  // up dynamically by type at call time rather than through a static
  // OwnProps subject (contrast CategoricalBinPrompts's withPromptChangeHandler).
  getEdgeVariables: (type: string) => UnknownRecord;
  // Backs the save-time cross-class gate: this prompt's edgeVariable may not
  // be one a form elsewhere already collects (also resolved dynamically by
  // the edge type chosen in THIS prompt).
  hasValidatedUse: (type: string, variableId: string) => boolean;
  // The row's PRE-EDIT committed edgeVariable, for the gate's unchanged-pick
  // escape.
  originalEdgeVariable: string;
};

type DispatchProps = {
  updateVariable: typeof updateVariableAsync;
  changeForm: typeof change;
};

type HandlerProps = DispatchProps & StateProps & OwnProps;

type PromptData = {
  createEdge: string;
  edgeVariable: string;
  variableOptions: unknown;
  [key: string]: unknown;
};

const mapStateToProps = (state: RootState): StateProps => {
  const initialValues = getFormInitialValues(EDIT_FORM_NAME)(state);
  return {
    getEdgeVariables: (type: string) =>
      getVariablesForSubject(state, { entity: 'edge', type }),
    hasValidatedUse: (type: string, variableId: string) =>
      hasValidatedUse(state, { entity: 'edge', type }, variableId),
    originalEdgeVariable:
      isRecord(initialValues) && typeof initialValues.edgeVariable === 'string'
        ? initialValues.edgeVariable
        : '',
  };
};

const store = connect(mapStateToProps, {
  updateVariable: updateVariableAsync,
  changeForm: change,
});

const handlers = withHandlers<
  HandlerProps,
  {
    handleChangePrompt: (
      data: PromptData,
    ) => Promise<Omit<PromptData, 'variableOptions'>>;
  }
>({
  handleChangePrompt:
    ({
      updateVariable,
      changeForm,
      form,
      getEdgeVariables,
      hasValidatedUse: checkValidatedUse,
      originalEdgeVariable,
    }: HandlerProps) =>
    async ({
      createEdge,
      edgeVariable,
      variableOptions,
      ...rest
    }: PromptData) => {
      // Saving new options for the bound edge variable can make its own
      // committed validation rules (e.g. minSelected) impossible to satisfy —
      // check before writing, mirroring CategoricalBinPrompts's guard. A
      // variable that only ever appears as the TARGET of another's
      // sameAs/comparator has no rules of its own, so `existingVariable` can
      // legitimately have no `validation` key at all; that must not skip the
      // check, so an absent/non-record validation runs the analyser with an
      // empty rule map instead.
      const allVariables = getEdgeVariables(createEdge);
      const existingVariable: unknown = allVariables[edgeVariable];
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
          allVariables,
          currentVariableId: edgeVariable,
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

      // Cross-class exclusivity gate: this census prompt is an UNVALIDATED
      // writer, so it may not save an edgeVariable a form elsewhere already
      // collects (the save-time backstop for a stale draft that bypassed the
      // picker exclusion). `edgeVariable` is a plain field on the prompt
      // form, so a STRING value renders correctly.
      const crossClassIssue = crossClassPickIssue({
        variableId: edgeVariable,
        originalVariableId: originalEdgeVariable,
        hasConflictingUse: (variableId) =>
          checkValidatedUse(createEdge, variableId),
        allVariables,
        message: validatedElsewhereMessage,
      });
      if (crossClassIssue) {
        throw new SubmissionError({ edgeVariable: crossClassIssue });
      }

      changeForm(form, '_modified', Date.now()); // TODO: can we avoid this?
      await (updateVariable as unknown as Dispatch)({
        entity: 'edge' as Entity,
        type: createEdge,
        variable: edgeVariable,
        configuration: { options: variableOptions },
      });
      return { edgeVariable, createEdge, ...rest };
    },
});

const withPromptChangeHandler = compose(store, handlers);

export default withPromptChangeHandler;
