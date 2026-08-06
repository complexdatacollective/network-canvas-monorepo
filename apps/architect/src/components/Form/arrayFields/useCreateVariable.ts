import { useCallback } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { VariableType } from '@codaco/protocol-validation';
import { useAppDispatch } from '~/ducks/hooks';
import { createVariableAsync } from '~/ducks/modules/protocol/codebook';
import { ensureError } from '~/utils/ensureError';

type Entity = 'node' | 'edge' | 'ego';

export type CreateVariable = (
  variableName: string,
  variableType?: VariableType,
  /**
   * Opt-in seed for the new variable's `configuration.validation` (e.g.
   * NameGeneratorQuickAdd's `required: true`).
   */
  validation?: { required: true },
) => Promise<string | undefined>;

/**
 * Creates a codebook variable for a subject and returns its id, or `undefined`
 * when creation failed (the researcher is told why in a dialog).
 *
 * The `withCreateVariableHandler` enhancer this replaces also dispatched a
 * redux-form `change` to write the new id into a named field. Array rows own
 * their value directly now, so the id is returned to the caller instead.
 */
export const useCreateVariable = (
  entity: Entity,
  type: string,
): CreateVariable => {
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();

  return useCallback(
    async (variableName, variableType, validation) => {
      const configuration = {
        name: variableName,
        ...(variableType ? { type: variableType } : {}),
        ...(validation ? { validation } : {}),
      };

      try {
        // createVariableAsync rejects on duplicate/invalid names; unwrap()
        // re-throws that error instead of resolving to a rejected action whose
        // payload is undefined.
        const { variable } = await dispatch(
          createVariableAsync({ entity, type, configuration }),
        ).unwrap();
        return variable;
      } catch (error) {
        // unwrap() can reject with a serialized error object (a plain object
        // carrying a string `message`) rather than an Error instance, which
        // ensureError would stringify instead of surface. Prefer that message.
        const message =
          typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof error.message === 'string'
            ? error.message
            : ensureError(error).message;

        void openDialog({
          type: 'acknowledge',
          intent: 'warning',
          title: 'Could not create variable',
          description: message,
          actions: { primary: { label: 'OK', value: true } },
        });
        return undefined;
      }
    },
    [dispatch, entity, openDialog, type],
  );
};

export default useCreateVariable;
