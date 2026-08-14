import { useCallback } from 'react';
import { useStore } from 'react-redux';

import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import { getTypeForComponent } from '~/config/variables';
import { useAppDispatch } from '~/ducks/hooks';
import {
  createVariableAsync,
  updateVariableAsync,
} from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/modules/root';
import { makeGetVariable } from '~/selectors/codebook';
import { ensureError } from '~/utils/ensureError';

import { COMPOSER_CODEBOOK_PROPERTIES } from './composerHelpers';
import {
  clearInapplicableCodebookProperties,
  CODEBOOK_PROPERTIES,
  getCodebookProperties,
} from './helpers';

type Entity = 'node' | 'edge' | 'ego';

/**
 * A field editor's save step: it writes the codebook variable the row points
 * at (creating it first when the researcher typed a new name) and returns the
 * row to store, or a failed submission that keeps the dialog open with the
 * reason attached.
 *
 * The `withFormHandlers`/`withComposerFormHandlers` enhancers this replaces
 * signalled failure by throwing; the dialog form takes the same information
 * as a return value now.
 */
export type FieldCommit = (
  values: Record<string, unknown>,
) => Promise<Record<string, unknown> | FormSubmissionResult>;

export type FieldCommitScope = {
  entity: string;
  type: string;
};

type FieldValues = {
  variable?: string;
  component?: string;
  _createNewVariable?: string;
  options?: unknown;
  validation?: unknown;
  parameters?: unknown;
  [key: string]: unknown;
};

const VARIABLE_NOT_FOUND: FormSubmissionResult = {
  success: false,
  formErrors: ['Variable not found'],
};

const isSubmissionResult = (
  value: string | FormSubmissionResult,
): value is FormSubmissionResult => typeof value !== 'string';

/**
 * The codebook reads and writes both editors share. `getVariable` reads the
 * store on demand rather than through a subscription: it is only consulted
 * inside the save, and a selector returning a fresh closure would re-render
 * the whole editor on every unrelated store change.
 */
const useCodebookCommit = () => {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  const getVariable = useCallback(
    (uuid: string) => makeGetVariable(uuid)(store.getState()),
    [store],
  );

  const createVariable = useCallback(
    async (
      entity: Entity,
      type: string,
      configuration: Record<string, unknown>,
    ): Promise<string | FormSubmissionResult> => {
      try {
        // unwrap() re-throws the thunk's error instead of resolving to a
        // rejected action whose payload is undefined (which would make
        // payload.variable a TypeError).
        const { variable } = await dispatch(
          createVariableAsync({ entity, type, configuration }),
        ).unwrap();
        return variable;
      } catch (error) {
        return {
          success: false,
          fieldErrors: { variable: [ensureError(error).message] },
        };
      }
    },
    [dispatch],
  );

  const updateVariable = useCallback(
    (
      entity: Entity,
      type: string,
      variable: string,
      configuration: Record<string, unknown>,
      replaceProperties: readonly (typeof CODEBOOK_PROPERTIES)[number][],
    ) =>
      dispatch(
        updateVariableAsync({
          entity,
          type,
          variable,
          configuration,
          replaceProperties,
        }),
      ),
    [dispatch],
  );

  // Dirtiness is not announced here: the editor's draft codebook is compared
  // against the codebook it opened on, so a write that lands is dirty and a
  // write that fails is not, with nothing to remember to call.
  return { createVariable, getVariable, updateVariable };
};

/**
 * The plain Form editor's save. Its rows carry nothing of their own: the input
 * control, its options, its parameters and its validation rules all live on
 * the codebook variable, so the whole set is replaced there.
 */
export const useFormFieldCommit = ({
  entity,
  type,
}: FieldCommitScope): FieldCommit => {
  const { createVariable, getVariable, updateVariable } = useCodebookCommit();

  return useCallback(
    async (values) => {
      const { variable, component, _createNewVariable, ...rest } =
        values as FieldValues;

      const variableType = getTypeForComponent(component);
      const configuration = {
        type: variableType,
        component,
        // prune properties that are not part of the codebook
        ...getCodebookProperties(
          clearInapplicableCodebookProperties(rest, variableType, component),
        ),
      };

      if (!_createNewVariable) {
        if (!getVariable(variable ?? '')) return VARIABLE_NOT_FOUND;

        await updateVariable(
          entity as Entity,
          type,
          variable ?? '',
          configuration,
          CODEBOOK_PROPERTIES,
        );

        return { variable, ...rest };
      }

      const created = await createVariable(entity as Entity, type, {
        ...configuration,
        name: _createNewVariable,
      });

      if (isSubmissionResult(created)) return created;

      return { variable: created, ...rest };
    },
    [createVariable, entity, getVariable, type, updateVariable],
  );
};

/**
 * The NetworkComposer attribute editor's save. Here the field owns its own
 * `component`/`parameters` — each form may render the same variable its own
 * way — so only `options` and `validation` reach the codebook, and only those
 * are replaced there.
 */
export const useComposerFieldCommit = ({
  entity,
  type,
}: FieldCommitScope): FieldCommit => {
  const { createVariable, getVariable, updateVariable } = useCodebookCommit();

  return useCallback(
    async (values) => {
      const { variable, _createNewVariable, options, validation, ...rest } =
        values as FieldValues;

      const component = rest.component as string | undefined;
      const variableType = getTypeForComponent(component);
      const applicable = clearInapplicableCodebookProperties(
        { options, validation, parameters: rest.parameters },
        variableType,
        component,
      );
      const codebookConfiguration = Object.fromEntries(
        COMPOSER_CODEBOOK_PROPERTIES.filter(
          (key) => applicable[key] !== undefined,
        ).map((key) => [key, applicable[key]]),
      );
      // `parameters` belongs to the composer field rather than the variable,
      // so the applicability sweep lands on the row instead.
      const fieldValues = { ...rest, parameters: applicable.parameters };

      if (!_createNewVariable) {
        if (!getVariable(variable ?? '')) return VARIABLE_NOT_FOUND;

        await updateVariable(
          entity as Entity,
          type,
          variable ?? '',
          codebookConfiguration,
          COMPOSER_CODEBOOK_PROPERTIES,
        );

        // fieldValues retains component + parameters
        return { variable, ...fieldValues };
      }

      const created = await createVariable(entity as Entity, type, {
        ...codebookConfiguration,
        type: variableType,
        component,
        name: _createNewVariable,
      });

      if (isSubmissionResult(created)) return created;

      return { variable: created, ...fieldValues };
    },
    [createVariable, entity, getVariable, type, updateVariable],
  );
};
