import {
  createAction,
  createSlice,
  current,
  type Draft,
  type PayloadAction,
  type Reducer,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { isEqual } from 'es-toolkit';
import { v4 as uuid } from 'uuid';

// Types
export type Locus = {
  id: string;
  path: string;
};

// `setActiveProtocol` carries this only from the cross-tab reclaim, which
// re-reads the canonical row without the session ending. See its use below.
type ActionWithContinuingSession = UnknownAction & {
  meta?: { continuingSession?: boolean };
};

type TimelineState<T = unknown> = {
  past: T[];
  present: T | null;
  timeline: Locus[];
  future: T[];
  futureTimeline: Locus[];
};

/**
 * The fields the undo/redo guards read, widened to `unknown` so both the
 * reducer's own immer draft and a selector's view of the wrapped slice satisfy
 * it. `past` and `future` are optional because rehydrated state predates them:
 * the default case below initialises `future` and optional-chains `past` for
 * exactly that reason.
 */
type UndoableState = {
  past?: readonly unknown[];
  present?: unknown;
  future?: readonly unknown[];
};

/**
 * Whether undo is possible — the ONE statement of that rule.
 *
 * The `undo` case below refuses when this is false, and `getCanUndo` in
 * `~/selectors/protocol` refuses to offer the control when it is false. Asking
 * the same question in two places is how a control comes to advertise — and
 * `undoWithNavigation` to announce — an operation the reducer silently drops,
 * so there is exactly one place to ask it. `getCanUndo` layers a further
 * refusal of its own on top; it does not restate this one.
 *
 * Tolerates a missing slice because unit-test stores register only the slices
 * under test, and a selector reached from a mounted component there must
 * resolve to "nothing to undo" rather than throw.
 */
export const canUndo = (state: UndoableState | undefined): boolean =>
  (state?.past?.length ?? 0) > 0 && Boolean(state?.present);

/** Whether redo is possible. Same contract as `canUndo`. */
export const canRedo = (state: UndoableState | undefined): boolean =>
  (state?.future?.length ?? 0) > 0;

type TimelineOptions = {
  name?: string;
  limit?: number;
  exclude?: (action: UnknownAction) => boolean;
  getPath?: () => string;
};

const defaultOptions: Required<TimelineOptions> = {
  name: 'timeline',
  limit: 1000,
  exclude: () => false,
  getPath: () =>
    typeof window !== 'undefined' && window.location
      ? window.location.pathname
      : '',
};

// Create instance-scoped actions using createAction. Action types are
// namespaced by `name` so multiple wrapped slices don't respond to the
// same timeline action.
export const createTimelineActions = (name = 'timeline') => ({
  jump: createAction<string>(`${name}/jump`),
  reset: createAction(`${name}/reset`, (payload?: unknown) => ({ payload })),
  undo: createAction(`${name}/undo`),
  redo: createAction(`${name}/redo`),
});

// Default-named instance, preserved for existing imports.
export const timelineActions = createTimelineActions('timeline');

const createTimelineReducer = <T>(
  reducer: Reducer<T>,
  customOptions: TimelineOptions = {},
): Reducer<TimelineState<T>> => {
  const options = {
    ...defaultOptions,
    ...customOptions,
  };

  // Instance-scoped actions, so this slice only responds to its own
  // `${name}/undo` etc.
  const actions = createTimelineActions(options.name);

  const initialState: TimelineState<T> = {
    past: [],
    present: null,
    timeline: [],
    future: [],
    futureTimeline: [],
  };

  // Create slice that handles both timeline actions and wraps the original reducer
  const timelineSlice = createSlice({
    name: options.name,
    initialState,
    reducers: {},
    extraReducers: (builder) => {
      builder
        .addCase(actions.undo, (state) => {
          const {
            past,
            present,
            timeline,
            future = [],
            futureTimeline = [],
          } = state;

          if (!canUndo(state)) {
            return;
          }

          const newPresent = past[past.length - 1];
          const newFuture = [
            current<T>(present as Draft<T>),
            ...current<T[]>(future || []),
          ];
          const lastTimelineItem = timeline[timeline.length - 1];
          const newFutureTimeline = lastTimelineItem
            ? [lastTimelineItem, ...(futureTimeline || [])]
            : futureTimeline;

          const newPast = past.slice(0, -1);
          const newTimeline = timeline.slice(0, -1);

          Object.assign(state, {
            past: newPast,
            present: newPresent,
            timeline: newTimeline,
            future: newFuture,
            futureTimeline: newFutureTimeline,
          });
        })
        .addCase(actions.jump, (state, action: PayloadAction<string>) => {
          const { past, timeline } = state;
          const locusId = action.payload;

          if (!locusId) {
            return state;
          }

          const locusIndex = timeline.findIndex(
            (entry) => entry.id === locusId,
          );

          // If point in timeline cannot be found do nothing
          if (locusIndex === -1) {
            return;
          }

          // no events in timeline yet
          if (timeline.length === 1) {
            return;
          }

          // the last point in the timeline is the present
          if (locusIndex === timeline.length - 1) {
            return;
          }

          const newPresent = past[locusIndex];

          Object.assign(state, {
            past: past.slice(0, locusIndex),
            present: newPresent,
            timeline: timeline.slice(0, locusIndex + 1),
          });
        })
        .addCase(actions.redo, (state) => {
          const {
            future = [],
            futureTimeline = [],
            present,
            past,
            timeline,
          } = state;

          if (!canRedo(state)) {
            return;
          }

          // Move first future item to present
          const newPresent = future[0];
          const newLocus = futureTimeline[0];

          // Move current present to past
          const newPast = present
            ? [...past, current<T>(present as Draft<T>)]
            : past;
          const newTimeline = newLocus ? [...timeline, newLocus] : timeline;

          Object.assign(state, {
            past: newPast,
            present: newPresent,
            timeline: newTimeline,
            future: future.slice(1),
            futureTimeline: futureTimeline.slice(1),
          });
        })
        .addCase(actions.reset, (state, action) => {
          const newLocus: Locus = { id: uuid(), path: options.getPath() };

          // If a payload is provided, seed `present` with it directly;
          // otherwise recompute via the wrapped reducer (existing behavior).
          const newPresent =
            action.payload !== undefined
              ? (action.payload as T)
              : reducer(
                  (state.present
                    ? current<T>(state.present as Draft<T>)
                    : state.present) as T,
                  {
                    type: '@@RESET',
                  },
                );

          Object.assign(state, {
            past: [],
            present: newPresent ?? null,
            timeline: [newLocus],
            future: [],
            futureTimeline: [],
          });
        })
        .addDefaultCase((state, action) => {
          // Don't process timeline actions here - they're handled by the cases above
          if (
            action &&
            (actions.jump.match(action) ||
              actions.reset.match(action) ||
              actions.undo.match(action) ||
              actions.redo.match(action))
          ) {
            return state;
          }

          // Initialize future arrays if they don't exist (for backwards compatibility with persisted state)
          if (!state.future) {
            state.future = [];
          }
          if (!state.futureTimeline) {
            state.futureTimeline = [];
          }

          // Clean up null values from past array (for backwards compatibility with persisted state)
          if (state.past?.some((p) => p === null || p === undefined)) {
            state.past = state.past.filter(
              (p) => p !== null && p !== undefined,
            );
          }

          // Migrate legacy string timeline entries to Locus objects (for
          // backwards compatibility with persisted state created before the
          // timeline entries changed from bare uuid strings to Locus objects).
          if (state.timeline?.some((e) => typeof e === 'string')) {
            state.timeline = (state.timeline as (Locus | string)[]).map((e) =>
              typeof e === 'string' ? { id: e, path: '' } : e,
            );
          }
          if (state.futureTimeline?.some((e) => typeof e === 'string')) {
            state.futureTimeline = (
              state.futureTimeline as (Locus | string)[]
            ).map((e) => (typeof e === 'string' ? { id: e, path: '' } : e));
          }

          const { past, present, timeline } = state;

          // Snapshot present before running the reducer; `current()` detaches it
          // from the draft so it survives the reducer call. The deep clone that
          // becomes the past entry is deferred until we know a timeline point is
          // actually committed (see below), so excluded/no-op actions don't pay
          // for a full-protocol structuredClone.
          const presentSnapshot = present
            ? current<T>(present as Draft<T>)
            : null;
          const newPresent = reducer(presentSnapshot as T, action);

          // This is the first run
          if (timeline.length === 0) {
            const locus: Locus = { id: uuid(), path: options.getPath() };
            Object.assign(state, {
              past: [],
              present: newPresent ?? null,
              timeline: [locus],
              future: [],
              futureTimeline: [],
            });
            return;
          }

          // If this is setActiveProtocol, reset the timeline (loading a new
          // protocol). This is deliberately ahead of the "changed nothing"
          // guard below: loading a protocol starts a new history even when the
          // protocol loaded happens to equal the one already open, because the
          // past and future entries belong to the session that is ending.
          //
          // A cross-tab reclaim is the one caller for which that is untrue.
          // `useProtocolTabLock.finishReclaim` re-reads the canonical row while
          // the researcher stays on the same protocol on the same route —
          // nothing closed, nothing navigated — so wiping history there breaks
          // the promise four destructive dialogs make in as many words: delete
          // a stage, let a peer tab open and close, and Undo was greyed out
          // with the stage unrecoverable. It marks itself `continuingSession`.
          //
          // That marker alone is not enough to keep the history, because the
          // peer may have edited: then this tab's `past` describes a lineage
          // the library row no longer has, and undoing into it would overwrite
          // work this tab never saw (#1382). So the history survives only when
          // the row read back is IDENTICAL to what is already in the buffer —
          // in which case this is a no-op in every other respect too, and
          // there is nothing for a reset to protect.
          if (
            action.type === 'activeProtocol/setActiveProtocol' &&
            (action as ActionWithContinuingSession).meta?.continuingSession ===
              true &&
            (presentSnapshot === newPresent ||
              isEqual(presentSnapshot, newPresent))
          ) {
            return state;
          }

          if (action.type === 'activeProtocol/setActiveProtocol') {
            const locus: Locus = { id: uuid(), path: options.getPath() };
            Object.assign(state, {
              past: [],
              present: newPresent ?? null,
              timeline: [locus],
              future: [],
              futureTimeline: [],
            });
            return;
          }

          // If newPresent matches the old one, don't treat as a new point in
          // the timeline. This is the ONE place that decides what counts as a
          // change, so no reducer has to re-implement the rule.
          //
          // Compare against `presentSnapshot`, which is what the reducer was
          // actually handed — NOT `present`. `present` is a child proxy of the
          // immer draft, while `current()` on an unmodified draft returns its
          // plain base object, so `present === newPresent` compares a Proxy
          // with a plain object and is false for every object-valued present.
          // That made this guard dead: every non-excluded action, including one
          // that changed nothing, cleared the redo stack and pushed a full
          // protocol snapshot onto `past` — so a refused import left Undo
          // enabled, and undoing it announced a change that had not happened.
          //
          // Reference equality alone only answers a reducer that MUTATES an
          // immer draft. Plenty of protocol reducers REBUILD instead —
          // `updateProtocolName` returns `{ ...state, name }`, every
          // `codebook` writer returns a fresh codebook, `stages/deleteStage`
          // filters the stage array, `deleteType`/`deleteVariable` `omit` from
          // a copy —
          // and a rebuild that reproduces the state it was given is a new
          // object every time. Blurring the protocol-name field without typing
          // is exactly that, and it invented an undo step and destroyed a
          // pending redo. So fall back to a structural comparison: the state is
          // JSON-shaped (it is `structuredClone`d into `past` and persisted as
          // JSON), and equal content means there is nothing to undo.
          //
          // The cost is bounded and only paid when the reducer produced a new
          // reference: an action a slice ignores returns the base object
          // untouched and never reaches `isEqual`. Measured on the development
          // protocol (32 stages, 37KB) a full equal-case walk is 0.13ms, less
          // than the `structuredClone` below and far less than the Zod
          // validation every committed point already triggers.
          if (
            presentSnapshot === newPresent ||
            isEqual(presentSnapshot, newPresent)
          ) {
            return state;
          }

          // If excluded, we don't treat this as a new point in the timeline, but we do update the state
          if (options.exclude(action)) {
            Object.assign(state, {
              past,
              present: newPresent ?? null,
              timeline,
            });
            return;
          }

          // clear future when making a new change
          state.future = [];
          state.futureTimeline = [];

          const locus: Locus = { id: uuid(), path: options.getPath() };
          const newTimeline = [...timeline, locus].slice(-options.limit - 1);

          const validPast = presentSnapshot
            ? [...past, structuredClone(presentSnapshot)]
            : [...past];

          Object.assign(state, {
            past: validPast.slice(-options.limit),
            present: newPresent ?? null,
            timeline: newTimeline,
          });
        });
    },
  });

  return timelineSlice.reducer;
};

export default createTimelineReducer;
