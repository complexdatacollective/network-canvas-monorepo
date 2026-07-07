import { compose, withHandlers } from 'react-recompose';
import { connect } from 'react-redux';
import type { FormAction } from 'redux-form';
import { change, SubmissionError } from 'redux-form';

import { getTypeForComponent } from '~/config/variables';
import {
  createVariableAsync,
  updateVariableAsync,
} from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/modules/root';

import { makeGetVariable } from '../../../selectors/codebook';

type Entity = 'node' | 'edge' | 'ego';

type FormHandlerProps = {
  updateVariable: typeof updateVariableAsync;
  createVariable: typeof createVariableAsync;
  type: string;
  entity: string;
  changeForm: (form: string, field: string, value: unknown) => FormAction;
  form: string;
  getVariable: (uuid: string) => ReturnType<ReturnType<typeof makeGetVariable>>;
};

const composerFormHandlers = withHandlers({
  handleChangeFields:
    (props: FormHandlerProps) => async (values: Record<string, unknown>) => {
      const { variable, _createNewVariable, options, validation, ...rest } =
        values as {
          variable?: string;
          _createNewVariable?: string;
          options?: unknown;
          validation?: unknown;
          component?: string;
          [key: string]: unknown;
        };

      const variableType = getTypeForComponent(
        rest.component as string | undefined,
      );
      // Codebook keeps type/options/validation only — NOT component/parameters.
      const codebookConfiguration = {
        type: variableType,
        ...(options !== undefined ? { options } : {}),
        ...(validation !== undefined ? { validation } : {}),
      };

      props.changeForm(props.form, '_modified', Date.now());

      if (!_createNewVariable) {
        const current = props.getVariable(variable ?? '');
        if (!current)
          throw new SubmissionError({ _error: 'Variable not found' });
        const currentVar = current as { type?: string; name?: string };
        await props.updateVariable({
          entity: props.entity as Entity,
          type: props.type,
          variable: variable ?? '',
          configuration: {
            ...codebookConfiguration,
            type: currentVar.type,
            name: currentVar.name,
          } as Record<string, unknown>,
          merge: false,
        });
        return { variable, ...rest }; // rest retains component + parameters
      }

      try {
        const result = await props.createVariable({
          entity: props.entity as Entity,
          type: props.type,
          configuration: {
            ...codebookConfiguration,
            name: _createNewVariable,
          } as Record<string, unknown>,
        });
        const payload = result as unknown as { payload: { variable: string } };
        return { variable: payload.payload.variable, ...rest };
      } catch (e) {
        throw new SubmissionError({ variable: String(e) });
      }
    },
});

const mapDispatchToProps = {
  changeForm: change as (
    form: string,
    field: string,
    value: unknown,
  ) => FormAction,
  updateVariable: updateVariableAsync,
  createVariable: createVariableAsync,
};
const mapStateToProps = (state: RootState) => ({
  getVariable: (uuid: string) => makeGetVariable(uuid)(state),
});

export default compose(
  connect(mapStateToProps, mapDispatchToProps),
  composerFormHandlers,
);
