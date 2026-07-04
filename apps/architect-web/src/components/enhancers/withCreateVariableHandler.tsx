import { isEmpty } from 'es-toolkit/compat';
import { compose, withHandlers } from 'react-recompose';
import { connect, type ConnectedProps } from 'react-redux';
import { change } from 'redux-form';

import type { VariableType } from '@codaco/protocol-validation';

import { openDialog } from '../../ducks/modules/dialogs';
import {
  createVariableAsync,
  deleteVariableAsync,
} from '../../ducks/modules/protocol/codebook';
import { ensureError } from '../../utils/ensureError';
import safeName from '../../utils/safeName';

const mapDispatchToProps = {
  createVariable: createVariableAsync,
  deleteVariable: deleteVariableAsync,
  changeField: change,
  showDialog: openDialog,
};

const connector = connect(null, mapDispatchToProps);

const normalizeKeyDown = (event: React.KeyboardEvent) => {
  const check = safeName(event.key);

  if (isEmpty(check)) {
    event.preventDefault();
  }
};

// ConnectedProps resolves the object-form thunk creators to their dispatched
// form — functions returning the thunk promise (with `.unwrap()`) — matching
// react-redux's runtime binding.
type ConnectedDispatchProps = ConnectedProps<typeof connector>;

type OwnProps = {
  type: string;
  entity: string;
  form: string;
};

type Entity = 'node' | 'edge' | 'ego';

type HandlerProps = ConnectedDispatchProps & OwnProps;

const createVariableHandler = {
  handleCreateVariable:
    ({
      changeField,
      createVariable,
      showDialog,
      type,
      entity,
      form,
    }: HandlerProps) =>
    async (
      variableName: string,
      variableType?: VariableType,
      field?: string,
    ) => {
      const withType = variableType ? { type: variableType } : {};

      const configuration = {
        name: variableName,
        ...withType,
      };

      let variable: string;
      try {
        // createVariableAsync rejects on duplicate/invalid names; unwrap()
        // re-throws that error instead of resolving to a rejected action whose
        // payload is undefined.
        ({ variable } = await createVariable({
          entity: entity as Entity,
          type,
          configuration,
        }).unwrap());
      } catch (e) {
        void showDialog({
          type: 'Notice',
          title: 'Could not create variable',
          message: ensureError(e).message,
        });
        return undefined;
      }

      // If we supplied a field, update it with the result of the variable creation
      if (field) {
        changeField(form, field, variable);
      }

      return variable;
    },
  handleDeleteVariable:
    ({ deleteVariable, type, entity }: HandlerProps) =>
    (variableId: string) =>
      deleteVariable({ entity: entity as Entity, type, variable: variableId }),
  normalizeKeyDown: () => normalizeKeyDown,
};

/**
 * usage:
 * withCreateVariableHandler(MyComponent)
 *
 * MyComponent = (handleCreateVariable) => (
 *   <div handler={() => handleCreateVariable(value, type)} />
 * )
 */
const withCreateVariableHandler = compose(
  connector,
  withHandlers<HandlerProps, object>(createVariableHandler),
);

export default withCreateVariableHandler;
