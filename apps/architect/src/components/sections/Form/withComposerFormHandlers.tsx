import { compose, withHandlers } from 'react-recompose';
import { connect, type ConnectedProps } from 'react-redux';
import type { FormAction } from 'redux-form';
import { change, SubmissionError } from 'redux-form';

import { getTypeForComponent } from '~/config/variables';
import {
  createVariableAsync,
  updateVariableAsync,
} from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/modules/root';
import { ensureError } from '~/utils/ensureError';

import { makeGetVariable } from '../../../selectors/codebook';
import { COMPOSER_CODEBOOK_PROPERTIES } from './composerHelpers';

type Entity = 'node' | 'edge' | 'ego';

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

const connector = connect(mapStateToProps, mapDispatchToProps);

// ConnectedProps resolves the object-form thunk creators to their dispatched
// form — functions returning the thunk promise (with `.unwrap()`) — matching
// react-redux's runtime binding.
type FormHandlerProps = ConnectedProps<typeof connector> & {
  type: string;
  entity: string;
  form: string;
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

      const component = rest.component as string | undefined;
      const variableType = getTypeForComponent(component);
      const codebookConfiguration = {
        ...(options !== undefined ? { options } : {}),
        ...(validation !== undefined ? { validation } : {}),
      };

      props.changeForm(props.form, '_modified', Date.now());

      if (!_createNewVariable) {
        const current = props.getVariable(variable ?? '');
        if (!current)
          throw new SubmissionError({ _error: 'Variable not found' });
        await props.updateVariable({
          entity: props.entity as Entity,
          type: props.type,
          variable: variable ?? '',
          configuration: codebookConfiguration as Record<string, unknown>,
          replaceProperties: COMPOSER_CODEBOOK_PROPERTIES,
        });
        return { variable, ...rest }; // rest retains component + parameters
      }

      try {
        // unwrap() re-throws the thunk's error instead of resolving to a
        // rejected action whose payload is undefined (which would make
        // payload.payload.variable a TypeError).
        const { variable: createdVariable } = await props
          .createVariable({
            entity: props.entity as Entity,
            type: props.type,
            configuration: {
              ...codebookConfiguration,
              type: variableType,
              component,
              name: _createNewVariable,
            } as Record<string, unknown>,
          })
          .unwrap();
        return { variable: createdVariable, ...rest };
      } catch (e) {
        throw new SubmissionError({ variable: ensureError(e).message });
      }
    },
});

export default compose(connector, composerFormHandlers);
