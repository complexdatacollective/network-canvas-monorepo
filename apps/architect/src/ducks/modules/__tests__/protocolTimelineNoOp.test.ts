import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
  updateProtocolName,
} from '~/ducks/modules/activeProtocol';
import app from '~/ducks/modules/app';
import { test as codebookActions } from '~/ducks/modules/protocol/codebook';
import { timelineOptions } from '~/ducks/modules/root';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

/**
 * The protocol timeline as the app actually builds it — `activeProtocol`
 * wrapped by `createTimeline` with the app's own `timelineOptions`.
 *
 * The subject here is the whole class of reducers that REBUILD their slice
 * rather than mutate an immer draft. Reference equality cannot see that a
 * rebuild reproduced the state it was given, so every one of them recorded an
 * undo step for an operation that changed nothing and threw away any pending
 * redo with it. `updateProtocolName` is the one a researcher meets by
 * accident — clicking into the protocol name and out again without typing —
 * and the codebook writers are the same shape.
 */
const makeStore = () =>
  configureStore({
    reducer: combineReducers({
      app,
      activeProtocol: createTimeline(activeProtocol, timelineOptions),
      stageEditorDraft,
    }),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

const VARIABLE_ID = 'variable-1';
const NODE_TYPE_ID = 'node-type-1';

const protocol = (name = 'Kinship Study'): CurrentProtocol =>
  ({
    name,
    schemaVersion: 8,
    stages: [],
    assetManifest: {},
    codebook: {
      node: {
        [NODE_TYPE_ID]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            [VARIABLE_ID]: { name: 'Age', type: 'number' },
          },
        },
      },
      edge: {},
      ego: {},
    },
  }) as CurrentProtocol;

const history = (store: ReturnType<typeof makeStore>) => {
  const { past, future, timeline, futureTimeline } = store.getState()
    .activeProtocol as {
    past: unknown[];
    future: unknown[];
    timeline: unknown[];
    futureTimeline: unknown[];
  };
  return {
    past: past.length,
    future: future.length,
    timeline: timeline.length,
    futureTimeline: futureTimeline.length,
  };
};

const presentOf = (store: ReturnType<typeof makeStore>) =>
  store.getState().activeProtocol.present as CurrentProtocol | null;

describe('operations that change nothing and the protocol timeline', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
    store.dispatch(setActiveProtocol(protocol()));
  });

  it('records nothing when the protocol is renamed to the name it already has', () => {
    // The protocol name field commits on blur, so clicking into it and away
    // again dispatches this. `updateProtocolName` returns `{ ...state, name }`
    // — a new object whichever name it is handed.
    const before = history(store);
    const presentBefore = presentOf(store);

    store.dispatch(updateProtocolName({ name: 'Kinship Study' }));

    expect(history(store)).toEqual(before);
    expect(presentOf(store)).toBe(presentBefore);
  });

  it('leaves a pending redo alone when the protocol is renamed to the name it already has', () => {
    // The sharper half: the fall-through clears `future` before it pushes its
    // own past entry, so a no-op destroyed work that was still redoable.
    store.dispatch(updateProtocolName({ name: 'Kinship Study 2' }));
    store.dispatch({ type: 'timeline/undo' });
    expect(history(store)).toMatchObject({ past: 0, future: 1 });

    store.dispatch(updateProtocolName({ name: 'Kinship Study' }));

    expect(history(store)).toMatchObject({ past: 0, future: 1 });
    expect(history(store).futureTimeline).toBe(1);
  });

  it('still records a real rename', () => {
    // The guard must not swallow the operation it is named after.
    const before = history(store);

    store.dispatch(updateProtocolName({ name: 'Kinship Study 2' }));

    expect(history(store).past).toBe(before.past + 1);
    expect(presentOf(store)?.name).toBe('Kinship Study 2');
  });

  it('records nothing when a variable is saved with the configuration it already has', () => {
    // Every `codebook` writer rebuilds: `getStateWithUpdatedVariable` spreads a
    // new variables object into a new type into a new codebook. Saving an
    // editor without changing anything is the ordinary way to reach it.
    const before = history(store);
    const presentBefore = presentOf(store);

    store.dispatch(
      codebookActions.updateVariable({
        variable: VARIABLE_ID,
        configuration: { name: 'Age', type: 'number' },
      }),
    );

    expect(history(store)).toEqual(before);
    expect(presentOf(store)).toBe(presentBefore);
  });

  it('still records a real variable change', () => {
    const before = history(store);

    store.dispatch(
      codebookActions.updateVariable({
        variable: VARIABLE_ID,
        configuration: { name: 'Age in years', type: 'number' },
      }),
    );

    expect(history(store).past).toBe(before.past + 1);
    expect(
      presentOf(store)?.codebook.node?.[NODE_TYPE_ID]?.variables?.[VARIABLE_ID]
        ?.name,
    ).toBe('Age in years');
  });

  it('starts a fresh history when the same protocol is opened again', () => {
    // Loading a protocol is not an edit, so it is answered before the guard:
    // its past and future belong to the session that is ending, and a protocol
    // that happens to equal the one already open must not inherit them.
    //
    // This one gates the ORDER of the two branches, not the guard itself, so
    // it passes on the source that predates this change (where nothing was
    // structurally compared) as well as on the fixed source. Reverting only the
    // reordering, with the structural guard in place, fails it.
    store.dispatch(updateProtocolName({ name: 'Kinship Study 2' }));
    store.dispatch({ type: 'timeline/undo' });
    expect(history(store)).toMatchObject({ past: 0, future: 1 });

    store.dispatch(setActiveProtocol(protocol()));

    expect(history(store)).toEqual({
      past: 0,
      future: 0,
      timeline: 1,
      futureTimeline: 0,
    });
  });
});
