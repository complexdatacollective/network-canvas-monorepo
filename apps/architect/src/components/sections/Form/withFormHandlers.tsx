import { connect, type ConnectedProps } from 'react-redux';

type Entity = 'node' | 'edge' | 'ego';

import { compose, withHandlers } from 'react-recompose';
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
import { CODEBOOK_PROPERTIES, getCodebookProperties } from './helpers';

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

const formHandlers = withHandlers({
  handleChangeFields:
    (props: FormHandlerProps) => async (values: Record<string, unknown>) => {
      const { variable, component, _createNewVariable, ...rest } = values as {
        variable?: string;
        component?: string;
        _createNewVariable?: string;
        [key: string]: unknown;
      };

      const variableType = getTypeForComponent(component);
      // prune properties that are not part of the codebook:
      const codebookProperties = getCodebookProperties(rest);
      const configuration = {
        type: variableType,
        component,
        ...codebookProperties,
      };

      // Register a change in the stage editor
      // `form` here refers to the `section/` parent form, not the fields form
      props.changeForm(props.form, '_modified', Date.now());
      if (!_createNewVariable) {
        const current = props.getVariable(variable ?? '');
        if (!current) {
          throw new SubmissionError({
            _error: 'Variable not found',
          });
        }

        await props.updateVariable({
          entity: props.entity as Entity,
          type: props.type,
          variable: variable ?? '',
          configuration: configuration as Record<string, unknown>,
          replaceProperties: CODEBOOK_PROPERTIES,
        });

        return {
          variable,
          ...rest,
        };
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
              ...configuration,
              name: _createNewVariable,
            } as Record<string, unknown>,
          })
          .unwrap();
        return {
          variable: createdVariable,
          ...rest,
        };
      } catch (e) {
        throw new SubmissionError({ variable: ensureError(e).message });
      }
    },
});

export default compose(connector, formHandlers);
