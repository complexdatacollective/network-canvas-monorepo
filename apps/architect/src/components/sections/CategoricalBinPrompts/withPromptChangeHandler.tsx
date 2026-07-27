import { compose, withHandlers } from 'react-recompose';
import { connect } from 'react-redux';
import type { FormAction } from 'redux-form';
import { change, SubmissionError } from 'redux-form';

import { updateVariableAsync } from '../../../ducks/modules/protocol/codebook';
import type { RootState } from '../../../ducks/modules/root';
import { getVariablesForSubjectSelector } from '../../../selectors/codebook';
import { findDraftContradictions } from '../../Validations/contradictions';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type OwnProps = {
  form: string;
  entity: 'node' | 'edge' | 'ego';
  type: string;
};

const mapStateToProps = (state: RootState, props: OwnProps) => ({
  allVariables: getVariablesForSubjectSelector(state, {
    entity: props.entity,
    type: props.type,
  }),
});

const store = connect(mapStateToProps, {
  updateVariable: updateVariableAsync,
  changeForm: change,
});

type HandlerProps = OwnProps &
  ReturnType<typeof mapStateToProps> & {
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
