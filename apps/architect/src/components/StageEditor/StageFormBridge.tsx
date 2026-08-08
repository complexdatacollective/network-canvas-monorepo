import { isEqual } from 'es-toolkit/compat';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStore } from 'react-redux';

import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FieldState } from '@codaco/fresco-ui/form/store/types';
import type { Stage } from '@codaco/protocol-validation';
import { useAppDispatch } from '~/ducks/hooks';
import {
  draftSnapshot,
  resetDraft,
  setLiveValues,
  setRestoring,
} from '~/ducks/modules/stageEditorDraft';
import type { RootState } from '~/ducks/store';

import {
  StageFormContext,
  type StageFormContextValue,
  type StageFormStoreApi,
} from './stageFormContext';

// Debounce window (ms) for leaf-field edits before they snapshot.
const SNAPSHOT_DEBOUNCE_MS = 400;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether an array-valued change is structural (a discrete gesture: add,
 * remove, reorder, or a whole-value replacement) rather than an in-place edit
 * of a single row's cell.
 *
 * Inline row editors (Options, MultiSelect) write the whole array on every
 * keystroke, so without this a row edit would push one undo entry per
 * character. Rows have no stable id to compare, so identity is positional:
 * exactly one index differing, with a record on both sides, is a row being
 * typed into. Anything else — a length change, several indices moving, or a
 * primitive element swapping — is a gesture worth its own timeline entry.
 *
 * A debounced row edit is still never lost: blur flushes it, and
 * `useStageDraftHistory` flushes any pending edit before undo/redo.
 */
const isStructuralArrayChange = (before: unknown, after: unknown): boolean => {
  if (!Array.isArray(before) || !Array.isArray(after)) {
    return Array.isArray(before) || Array.isArray(after);
  }

  if (before.length !== after.length) return true;

  const differing = before.reduce<number[]>((indices, element, index) => {
    if (!isEqual(element, after[index])) indices.push(index);
    return indices;
  }, []);

  if (differing.length !== 1) return true;

  const index = differing[0]!;
  return !isRecord(before[index]) || !isRecord(after[index]);
};

// Coalescing window (ms) for the Redux mirror of the form's values.
const LIVE_VALUES_DEBOUNCE_MS = 100;

const StageRestoreVersionContext = createContext(0);

/**
 * Counts the undo/redo restores this stage form has applied.
 *
 * A section that resets dependent fields when it observes a value change has
 * to tell a restored value apart from a user edit, or it clears the very
 * configuration the restore just brought back alongside it. Neither
 * `ui.restoring` nor the bridge's ref can answer that: both are only ever true
 * *inside* `runRestore`, and the effect observing the change does not run
 * until the commit the restore scheduled — by which time the restore is over.
 * A version that changes with the value, and stays changed, survives that gap.
 *
 * Deliberately its own context rather than another key on the stage form
 * context: every `useStageFormValue` in the editor re-renders when that value's
 * identity changes.
 */
export const useStageRestoreVersion = (): number =>
  useContext(StageRestoreVersionContext);

/**
 * The mounted stage form's mirror flush, published at module scope.
 *
 * The mirror is debounced, and the readers that must not miss the user's last
 * edit — the editor's Cancel and Preview handlers, and the router's navigation
 * guard — all sit *outside* the form's provider, so they cannot reach
 * `refreshLiveValues` through the stage form context. Without a flush, an edit
 * made inside the coalescing window is invisible to them: leaving discards it
 * with no confirmation, and Preview launches the previous values.
 *
 * Safe at module scope because the editor route mounts exactly one stage form
 * at a time (the provider is keyed by stage).
 */
let mountedStageFormFlush: (() => void) | null = null;

export const flushStageLiveValues = (): void => {
  mountedStageFormFlush?.();
};

type StageFormBridgeProps = {
  committedStage: Stage | null;
  stageId: string | null;
  formId: string;
  children: ReactNode;
};

type FieldsMap = ReadonlyMap<string, FieldState>;

type FieldsDiff = {
  /** Any field transitioned from never-blurred to blurred. */
  blurred: boolean;
  /** Fields registered in both states whose value changed. */
  changed: { previous: unknown; next: unknown }[];
};

const diffFields = (previous: FieldsMap, next: FieldsMap): FieldsDiff => {
  const diff: FieldsDiff = { blurred: false, changed: [] };

  next.forEach((nextField, name) => {
    const previousField = previous.get(name);

    // Fields appearing or disappearing are mount churn (a section expanding,
    // an interface swapping its fields), never a user edit. Ignoring them is
    // what keeps the burst of registrations on open — and every collapse of a
    // section — out of the undo timeline.
    if (!previousField) return;

    if (!previousField.meta.isBlurred && nextField.meta.isBlurred) {
      diff.blurred = true;
    }

    if (!Object.is(previousField.value, nextField.value)) {
      diff.changed.push({
        previous: previousField.value,
        next: nextField.value,
      });
    }
  });

  return diff;
};

const useFormStoreApi = (): StageFormStoreApi => {
  const storeApi = useContext(FormStoreContext);

  if (!storeApi) {
    throw new Error(
      'StageFormBridge must be rendered inside a FormStoreProvider',
    );
  }

  return storeApi;
};

/**
 * Watches the stage form's zustand store and drives the `stageEditorDraft`
 * timeline from it, and
 * provides the stage form context (identity, store api, submit state, and the
 * restore handle `useStageDraftHistory` drives undo/redo through).
 */
const StageFormBridge = ({
  committedStage,
  stageId,
  formId,
  children,
}: StageFormBridgeProps) => {
  const storeApi = useFormStoreApi();
  const dispatch = useAppDispatch();
  const reduxStore = useStore<RootState>();

  const [submitFailed, setSubmitFailed] = useState(false);
  const markSubmitFailed = useCallback(() => setSubmitFailed(true), []);
  const clearSubmitFailed = useCallback(() => setSubmitFailed(false), []);

  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveValuesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Synchronous companion to `ui.restoring`: the store subscriber runs inside
  // the `setFieldValue` call that a restore makes, so it needs an answer that
  // does not depend on a Redux round trip.
  const restoring = useRef(false);

  const cancelPendingSnapshot = useCallback(() => {
    if (snapshotTimer.current === null) return;
    clearTimeout(snapshotTimer.current);
    snapshotTimer.current = null;
  }, []);

  const takeSnapshot = useCallback(() => {
    if (restoring.current) return;

    const formState = storeApi.getState();
    // A form with no registered fields has no values to snapshot — only an
    // empty object that would wipe the timeline entry it replaced.
    if (formState.fields.size === 0) return;

    const values = formState.getFormValues() as unknown as Stage;

    // Dedup against the current `present` so one undo step stays one logical
    // change (and a stale debounce that fires after a restore is a no-op).
    if (isEqual(values, reduxStore.getState().stageEditorDraft.history.present))
      return;

    dispatch(draftSnapshot(values));
  }, [dispatch, reduxStore, storeApi]);

  const refreshLiveValues = useCallback(() => {
    if (liveValuesTimer.current !== null) {
      clearTimeout(liveValuesTimer.current);
      liveValuesTimer.current = null;
    }
    dispatch(
      setLiveValues(storeApi.getState().getFormValues() as unknown as Stage),
    );
  }, [dispatch, storeApi]);

  useEffect(() => {
    mountedStageFormFlush = refreshLiveValues;
    return () => {
      if (mountedStageFormFlush === refreshLiveValues) {
        mountedStageFormFlush = null;
      }
    };
  }, [refreshLiveValues]);

  const scheduleLiveValues = useCallback(() => {
    if (liveValuesTimer.current !== null) return;
    liveValuesTimer.current = setTimeout(() => {
      liveValuesTimer.current = null;
      dispatch(
        setLiveValues(storeApi.getState().getFormValues() as unknown as Stage),
      );
    }, LIVE_VALUES_DEBOUNCE_MS);
  }, [dispatch, storeApi]);

  const [restoreVersion, setRestoreVersion] = useState(0);

  const runRestore = useCallback(
    (apply: () => void) => {
      restoring.current = true;
      // Mirrored into `stageEditorDraft.ui.restoring` so a Redux-side reader
      // agrees with the ref for the duration of the restore.
      dispatch(setRestoring(true));
      try {
        apply();
      } finally {
        restoring.current = false;
        dispatch(setRestoring(false));
        // Batched with the store writes `apply` made, so the commit that first
        // renders a restored value always carries the new version with it.
        setRestoreVersion((version) => version + 1);
        refreshLiveValues();
      }
    },
    [dispatch, refreshLiveValues],
  );

  const handleStoreChange = useCallback(
    (next: { fields: FieldsMap }, previous: { fields: FieldsMap }) => {
      // Restores write through `setFieldValue`; they must not snapshot, and
      // `runRestore` refreshes the mirror once at the end.
      if (restoring.current) return;

      if (next.fields === previous.fields) return;

      scheduleLiveValues();

      const { blurred, changed } = diffFields(previous.fields, next.fields);

      // Blur commits whatever the user has typed so far.
      if (blurred && snapshotTimer.current !== null) {
        cancelPendingSnapshot();
        takeSnapshot();
      }

      if (changed.length === 0) return;

      // Every array in the stage form is one opaque field value, so a
      // *structural* array write — add, remove, reorder, or a whole-value
      // replacement — is one logical change and snapshots immediately.
      // An in-place edit of one row's cell arrives the
      // same way but is a keystroke, so it debounces like any other leaf.
      const isArrayChange = changed.some(({ previous: before, next: after }) =>
        isStructuralArrayChange(before, after),
      );

      cancelPendingSnapshot();

      if (isArrayChange) {
        takeSnapshot();
        return;
      }

      snapshotTimer.current = setTimeout(() => {
        snapshotTimer.current = null;
        takeSnapshot();
      }, SNAPSHOT_DEBOUNCE_MS);
    },
    [cancelPendingSnapshot, scheduleLiveValues, takeSnapshot],
  );

  // The provider is remounted (keyed) whenever the edited stage changes, so
  // the baseline is seeded exactly once per stage. `committedStage` is read
  // through a ref so an unstable prop identity cannot re-seed and wipe the
  // history mid-edit.
  const committedStageRef = useRef(committedStage);
  committedStageRef.current = committedStage;

  useEffect(() => {
    // Seed the draft baseline. Field
    // registration happens in child effects, which have all run by now, so the
    // form's own values are the stage's opening state — and the space every
    // later snapshot is expressed in. Seeding with the committed stage instead
    // would put keys the form never registers (`id`, `type`, a section that
    // opens collapsed) on the baseline, where they read as deletions the
    // moment the first snapshot lands. The committed stage is the fallback for
    // a form that has no fields yet.
    const formState = storeApi.getState();
    const seed =
      formState.fields.size > 0
        ? (formState.getFormValues() as unknown as Stage)
        : committedStageRef.current;
    dispatch(resetDraft(seed));

    const unsubscribe = storeApi.subscribe(handleStoreChange);

    return () => {
      unsubscribe();
      cancelPendingSnapshot();
      if (liveValuesTimer.current !== null) {
        clearTimeout(liveValuesTimer.current);
        liveValuesTimer.current = null;
      }
      // The mirror only describes a mounted stage form.
      dispatch(setLiveValues(null));
    };
  }, [cancelPendingSnapshot, dispatch, handleStoreChange, storeApi]);

  const draft = useMemo(
    () => ({ cancelPendingSnapshot, runRestore, refreshLiveValues }),
    [cancelPendingSnapshot, refreshLiveValues, runRestore],
  );

  const value = useMemo<StageFormContextValue>(
    () => ({
      formId,
      storeApi,
      committedStage,
      stageId,
      submitFailed,
      markSubmitFailed,
      clearSubmitFailed,
      draft,
    }),
    [
      clearSubmitFailed,
      committedStage,
      draft,
      formId,
      markSubmitFailed,
      stageId,
      storeApi,
      submitFailed,
    ],
  );

  return (
    <StageFormContext.Provider value={value}>
      <StageRestoreVersionContext.Provider value={restoreVersion}>
        {children}
      </StageRestoreVersionContext.Provider>
    </StageFormContext.Provider>
  );
};

export default StageFormBridge;
