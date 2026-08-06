import { get, isEqual } from 'es-toolkit/compat';
import {
  type KeyboardEvent,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import type { StageSubject, VariableType } from '@codaco/protocol-validation';
import { useCreateVariable as useCreateVariableForSubject } from '~/components/Form/arrayFields/useCreateVariable';
import { useAppDispatch } from '~/ducks/hooks';
import { deleteVariableAsync } from '~/ducks/modules/protocol/codebook';
import safeName from '~/utils/safeName';

import { useStageFormContext } from './stageFormContext';

type ValueCache = {
  /** Identity of the store's `fields` map `values` was assembled from. */
  fields: unknown;
  values: Record<string, FieldValue>;
  resolved: unknown;
  hasResolved: boolean;
};

/**
 * One value from the stage form, reactively — the replacement for
 * `formValueSelector('edit-stage')(state, path)`.
 *
 * Resolution order matters, and each step exists for a reason:
 * 1. `getFieldState(path)` — a registered field, or a dormant one (a collapsed
 *    or toggled-off section, or a pending write parked by undo/redo). This is
 *    what lets a toggleable section reopen when undo restores its value.
 * 2. the assembled form values by path — for container paths such as
 *    `skipLogic`, whose leaves register under `skipLogic.action` etc.
 * 3. `committedStage` by path — the field has never registered. Without this a
 *    section gated on `startExpanded={!!value}` could never open on entry: its
 *    fields cannot register while it is closed, so nothing would ever put the
 *    committed value in reach.
 *
 * Reads the stage form specifically, so it keeps working inside a dialog that
 * has mounted its own form store (where `useFormValue` addresses the dialog).
 */
export function useStageFormValue<T = unknown>(path: string): T | undefined {
  const { storeApi, committedStage } = useStageFormContext();

  const cache = useRef<ValueCache>({
    fields: null,
    values: {},
    resolved: undefined,
    hasResolved: false,
  });

  const subscribe = useCallback(
    (onStoreChange: () => void) => storeApi.subscribe(onStoreChange),
    [storeApi],
  );

  const getSnapshot = useCallback(() => {
    const state = storeApi.getState();
    const current = cache.current;

    // `getFormValues()` builds a fresh object every call, so it is only
    // reassembled when the map it derives from actually changed.
    if (current.fields !== state.fields) {
      current.fields = state.fields;
      current.values = state.getFormValues();
    }

    const fieldState = state.getFieldState(path);
    let next: unknown;

    if (fieldState) {
      next = fieldState.value;
    } else {
      const assembled = get(current.values, path) as unknown;
      next =
        assembled === undefined
          ? (get(committedStage ?? {}, path) as unknown)
          : assembled;
    }

    // Hold the previous reference when the value is unchanged: an edit
    // elsewhere in the form rebuilds `values` and would otherwise hand
    // useSyncExternalStore a new object for an untouched subtree.
    if (!current.hasResolved || !isEqual(current.resolved, next)) {
      current.resolved = next;
      current.hasResolved = true;
    }

    return current.resolved as T | undefined;
  }, [committedStage, path, storeApi]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Writes a value into the stage form, by field name or by path. Unregistered
 * names are parked as a dormant pending write and re-attach when the field
 * next mounts, so this works for a collapsed or toggled-off section.
 */
export function useSetStageValue(): (path: string, value: unknown) => void {
  const { storeApi } = useStageFormContext();

  return useCallback(
    (path: string, value: unknown) => {
      storeApi.getState().setFieldValue(path, value as FieldValue);
    },
    [storeApi],
  );
}

const EGO_SUBJECT: StageSubject = { entity: 'ego' };

export type SubjectDetails = {
  /** The stage's subject, defaulting to ego when the stage has none. */
  subject: StageSubject;
  entity: StageSubject['entity'];
  /** Entity type id, or null for an ego subject (or before one is chosen). */
  type: string | null;
};

/** The stage's `subject` field — the `withSubject` enhancer's replacement. */
export function useSubject(): SubjectDetails {
  const subject = useStageFormValue<StageSubject>('subject');

  return useMemo(() => {
    const resolved = subject ?? EGO_SUBJECT;
    return {
      subject: resolved,
      entity: resolved.entity,
      type: 'type' in resolved ? resolved.type : null,
    };
  }, [subject]);
}

/**
 * A committed value from the stage being edited, for a `Field`'s
 * `initialValue`. Memoized because `initialValue` is a dependency of
 * `useField`'s register effect: an unstable value re-registers the field on
 * every render.
 */
export function useStageInitialValue<T = unknown>(path: string): T | undefined {
  const { committedStage } = useStageFormContext();

  return useMemo(
    () => get(committedStage ?? {}, path) as T | undefined,
    [committedStage, path],
  );
}

/**
 * Blocks keystrokes that `safeName` would strip, so a variable-name input
 * cannot accept characters the codebook will not keep.
 */
const normalizeKeyDown = (event: KeyboardEvent) => {
  if (safeName(event.key) === '') {
    event.preventDefault();
  }
};

export type CreateStageVariable = (
  variableName: string,
  variableType?: VariableType,
  /**
   * Stage form path to write the new variable's id into — the enhancer's
   * `change(form, field, variable)`. Omit it and use the returned id instead.
   */
  field?: string,
  /**
   * Opt-in seed for the new variable's `configuration.validation` (e.g.
   * NameGeneratorQuickAdd's `required: true`).
   */
  validation?: { required: true },
) => Promise<string | undefined>;

export type StageVariableHandlers = {
  createVariable: CreateStageVariable;
  deleteVariable: (variableId: string) => void;
  normalizeKeyDown: (event: KeyboardEvent) => void;
};

/**
 * Codebook variable create/delete bound to the stage's subject — the
 * `withCreateVariableHandler` enhancer's replacement. Creation itself is
 * `Form/arrayFields/useCreateVariable`; this adds the enhancer's optional
 * write-the-id-into-a-field step and its delete/keydown helpers.
 */
export function useCreateVariable(): StageVariableHandlers {
  const dispatch = useAppDispatch();
  const { entity, type } = useSubject();
  const setStageValue = useSetStageValue();
  const createForSubject = useCreateVariableForSubject(entity, type ?? '');

  const createVariable = useCallback<CreateStageVariable>(
    async (variableName, variableType, field, validation) => {
      const variable = await createForSubject(
        variableName,
        variableType,
        validation,
      );

      if (variable && field) {
        setStageValue(field, variable);
      }

      return variable;
    },
    [createForSubject, setStageValue],
  );

  const deleteVariable = useCallback(
    (variableId: string) => {
      void dispatch(
        deleteVariableAsync({
          entity,
          type: type ?? undefined,
          variable: variableId,
        }),
      );
    },
    [dispatch, entity, type],
  );

  return useMemo(
    () => ({ createVariable, deleteVariable, normalizeKeyDown }),
    [createVariable, deleteVariable],
  );
}
