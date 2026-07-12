import { isEmpty } from 'es-toolkit/compat';
import { useCallback, type ComponentType, type KeyboardEvent } from 'react';
import { change } from 'redux-form';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { VariableType } from '@codaco/protocol-validation';

import { useAppDispatch } from '../../ducks/hooks';
import {
  createVariableAsync,
  deleteVariableAsync,
} from '../../ducks/modules/protocol/codebook';
import { ensureError } from '../../utils/ensureError';
import safeName from '../../utils/safeName';

const normalizeKeyDown = (event: KeyboardEvent) => {
  const check = safeName(event.key);

  if (isEmpty(check)) {
    event.preventDefault();
  }
};

type OwnProps = {
  type: string;
  entity: string;
  form: string;
};

type Entity = 'node' | 'edge' | 'ego';

type InjectedProps = {
  handleCreateVariable: (
    variableName: string,
    variableType?: VariableType,
    field?: string,
  ) => Promise<string | undefined>;
  handleDeleteVariable: (variableId: string) => void;
  normalizeKeyDown: typeof normalizeKeyDown;
};

const withCreateVariableHandler =
  <P extends OwnProps>(WrappedComponent: ComponentType<P & InjectedProps>) =>
  (props: P) => {
    const dispatch = useAppDispatch();
    const { openDialog } = useDialog();
    const { type, entity, form } = props;

    const handleCreateVariable = useCallback(
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
          ({ variable } = await dispatch(
            createVariableAsync({
              entity: entity as Entity,
              type,
              configuration,
            }),
          ).unwrap());
        } catch (e) {
          // unwrap() can reject with a serialized error object (a plain object
          // carrying a string `message`) rather than an Error instance, which
          // ensureError would stringify instead of surface. Prefer that message.
          const message =
            typeof e === 'object' &&
            e !== null &&
            'message' in e &&
            typeof e.message === 'string'
              ? e.message
              : ensureError(e).message;
          void openDialog({
            type: 'acknowledge',
            intent: 'warning',
            title: 'Could not create variable',
            description: message,
            actions: { primary: { label: 'OK', value: true } },
          });
          return undefined;
        }

        // If we supplied a field, update it with the result of the variable creation
        if (field) {
          dispatch(change(form, field, variable));
        }

        return variable;
      },
      [dispatch, entity, form, openDialog, type],
    );

    const handleDeleteVariable = useCallback(
      (variableId: string) => {
        void dispatch(
          deleteVariableAsync({
            entity: entity as Entity,
            type,
            variable: variableId,
          }),
        );
      },
      [dispatch, entity, type],
    );

    return (
      <WrappedComponent
        {...props}
        handleCreateVariable={handleCreateVariable}
        handleDeleteVariable={handleDeleteVariable}
        normalizeKeyDown={normalizeKeyDown}
      />
    );
  };

export default withCreateVariableHandler;
