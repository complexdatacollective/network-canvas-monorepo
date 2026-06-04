import crypto from 'node:crypto';

import type { Reducer, UnknownAction } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import createTimeline, {
  createTimelineActions,
  timelineActions,
} from '../timeline';

vi.mock('uuid');

type DummyState = {
  dummyState: boolean;
  randomProperty: string;
};

(vi.mocked(uuid) as unknown as ReturnType<typeof vi.fn>).mockImplementation(
  () =>
    Array.from(crypto.randomBytes(20), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join(''),
);

const defaultReducer: Reducer<DummyState> = vi.fn(
  (_state?: DummyState, _action?: UnknownAction): DummyState => ({
    dummyState: true,
    randomProperty: Array.from(crypto.randomBytes(20), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join(''),
  }),
);

const getRewindableReducer = (
  reducer: Reducer<DummyState> = defaultReducer,
  options: {
    name?: string;
    limit?: number;
    exclude?: (action: UnknownAction) => boolean;
    getPath?: () => string;
  } = {},
) => createTimeline(reducer, options);

const dummyAction: UnknownAction = { type: 'DUMMY' };

const applyTimes = <T>(
  n: number,
  reducer: (state: T | undefined, action: UnknownAction) => T,
  action = dummyAction,
  initial?: T,
): T => {
  let state: T | undefined = initial;
  for (let i = 0; i < n; i++) {
    state = reducer(state, action);
  }
  return state as T;
};

describe('timeline middleware', () => {
  let rewindableReducer: ReturnType<typeof getRewindableReducer>;

  beforeEach(() => {
    rewindableReducer = getRewindableReducer();
  });

  describe('createTimeline middleware', () => {
    it('modifies an existing reducer to contain past present future', () => {
      const mockState = { foo: 'bar' };
      const reducer = () => mockState;
      const timelineReducer = createTimeline(reducer);
      const state = timelineReducer(undefined, { type: '@@INIT' });

      expect(state).toEqual(
        expect.objectContaining({
          past: expect.any(Array),
          present: mockState,
          timeline: expect.any(Array),
        }),
      );
    });

    it('each subsequent call adds an event to the timeline', () => {
      const nextState = applyTimes(3, rewindableReducer);

      expect(nextState.past.length).toBe(2);
      expect(nextState.timeline.length).toBe(3); // +1 includes name for present
    });

    it('each subsequent call adds an event to the timeline (unless state is unchanged)', () => {
      const initialState = { foo: 'bar' };
      const reducer = (state = initialState) => state;
      const timelineReducer = createTimeline(reducer);

      const nextState = applyTimes(3, timelineReducer);

      expect(nextState.past.length).toBe(0);
      expect(nextState.timeline.length).toBe(1);
    });

    it('timeline entries are locus objects with id and path', () => {
      const reducer = getRewindableReducer(defaultReducer, {
        getPath: () => '/my-path',
      });

      const nextState = applyTimes(3, reducer);

      for (const entry of nextState.timeline) {
        expect(entry).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            path: '/my-path',
          }),
        );
      }
    });

    it('migrates legacy string timeline entries to locus objects', () => {
      // Simulate pre-upgrade persisted state where timeline/futureTimeline
      // entries are bare uuid strings rather than Locus objects.
      const legacyId1 = 'legacy-id-1';
      const legacyId2 = 'legacy-id-2';
      const legacyFutureId = 'legacy-future-id';

      // Dispatch an excluded action so the reducer does not treat it as a new
      // timeline point (which would otherwise clear futureTimeline before we
      // can assert that its entries were migrated).
      const excludedType = 'EXCLUDED';
      const reducer = getRewindableReducer(defaultReducer, {
        exclude: (action) => action.type === excludedType,
      });

      const persistedState = {
        past: [
          { dummyState: true, randomProperty: 'a' },
          { dummyState: true, randomProperty: 'b' },
        ],
        present: { dummyState: true, randomProperty: 'c' },
        timeline: [legacyId1, legacyId2],
        future: [],
        futureTimeline: [legacyFutureId],
      } as unknown as ReturnType<typeof reducer>;

      const nextState = reducer(persistedState, { type: excludedType });

      // Each timeline entry is now a Locus object with the original string as
      // its id and an empty path.
      expect(nextState.timeline).toEqual(
        expect.arrayContaining([
          { id: legacyId1, path: '' },
          { id: legacyId2, path: '' },
        ]),
      );
      expect(nextState.futureTimeline).toEqual(
        expect.arrayContaining([{ id: legacyFutureId, path: '' }]),
      );
      for (const entry of [
        ...nextState.timeline,
        ...nextState.futureTimeline,
      ]) {
        expect(typeof entry).toBe('object');
        expect(entry.path).toBe('');
      }

      // jump() by the original string id now finds the entry and reverts.
      const jumpState = reducer(nextState, timelineActions.jump(legacyId1));

      const jumpIndex = nextState.timeline.findIndex((e) => e.id === legacyId1);
      expect(jumpState.timeline).toEqual(
        nextState.timeline.slice(0, jumpIndex + 1),
      );
      expect(jumpState.present).toEqual(nextState.past[jumpIndex]);
    });
  });

  describe('jump() action', () => {
    it('can revert to a specific point on the timeline', () => {
      const nextState = applyTimes(10, rewindableReducer);

      const timelineEntry = nextState.timeline[4]?.id ?? '';
      const rollbackState = rewindableReducer(
        nextState,
        timelineActions.jump(timelineEntry),
      );

      expect(rollbackState.past).toEqual(nextState.past.slice(0, 4));
      expect(rollbackState.timeline).toEqual(nextState.timeline.slice(0, 5));
      expect(rollbackState.present).toEqual(nextState.past[4]);
    });

    it('if point does not exist it ignores action', () => {
      const nextState = applyTimes(10, rewindableReducer);

      const rollbackState = rewindableReducer(
        nextState,
        timelineActions.jump('NON_EXISTENT_POINT'),
      );

      expect(rollbackState.past).toEqual(nextState.past);
      expect(rollbackState.timeline).toEqual(nextState.timeline);
      expect(rollbackState.present).toEqual(nextState.present);
    });
  });

  describe('reset() action', () => {
    it('can revert to an unused state', () => {
      const nextState = applyTimes(10, rewindableReducer);

      const resetState = rewindableReducer(nextState, timelineActions.reset());

      expect(resetState).toEqual(
        expect.objectContaining({
          past: expect.any(Array),
          present: expect.anything(),
          timeline: expect.any(Array),
        }),
      );

      expect(nextState.timeline.length).toBe(10);
      expect(resetState.timeline.length).toBe(1);
      expect(resetState.past.length).toBe(0);
    });

    it('reset() with no payload recomputes present via the reducer', () => {
      const nextState = applyTimes(10, rewindableReducer);

      const resetState = rewindableReducer(nextState, timelineActions.reset());

      // defaultReducer always returns dummyState: true with a new random prop
      expect(resetState.present).toEqual(
        expect.objectContaining({ dummyState: true }),
      );
      expect(resetState.present).not.toBe(nextState.present);
      expect(resetState.past.length).toBe(0);
      expect(resetState.future.length).toBe(0);
      expect(resetState.futureTimeline.length).toBe(0);
      expect(resetState.timeline.length).toBe(1);
    });

    it('reset(payload) seeds present with payload and clears history', () => {
      const nextState = applyTimes(10, rewindableReducer);

      const payload: DummyState = {
        dummyState: false,
        randomProperty: 'seeded',
      };

      const resetState = rewindableReducer(
        nextState,
        timelineActions.reset(payload),
      );

      expect(resetState.present).toEqual(payload);
      expect(resetState.past.length).toBe(0);
      expect(resetState.future.length).toBe(0);
      expect(resetState.futureTimeline.length).toBe(0);
      expect(resetState.timeline.length).toBe(1);
    });
  });

  describe('createTimelineActions()', () => {
    it('namespaces action types by name', () => {
      const actions = createTimelineActions('stageEditorDraft');

      expect(actions.undo().type).toBe('stageEditorDraft/undo');
      expect(actions.redo().type).toBe('stageEditorDraft/redo');
      expect(actions.jump('x').type).toBe('stageEditorDraft/jump');
      expect(actions.reset().type).toBe('stageEditorDraft/reset');
    });

    it('an instance only responds to its own scoped actions', () => {
      const reducer = getRewindableReducer(defaultReducer, {
        name: 'stageEditorDraft',
      });

      const nextState = applyTimes(5, reducer);

      // A foreign-scoped undo is NOT treated as an undo by this instance: it
      // does not shrink history (past does not decrease by one).
      const ignored = reducer(nextState, timelineActions.undo());
      expect(ignored.past.length).not.toBe(nextState.past.length - 1);

      // Its own scoped undo performs the undo.
      const scoped = createTimelineActions('stageEditorDraft');
      const undone = reducer(nextState, scoped.undo());
      expect(undone.past.length).toBe(nextState.past.length - 1);
      expect(undone.timeline.length).toBe(nextState.timeline.length - 1);
    });
  });

  describe('undo() action', () => {
    it('moves to previous state', () => {
      const nextState = applyTimes(5, rewindableReducer);

      const undoState = rewindableReducer(nextState, timelineActions.undo());

      expect(undoState.past.length).toBe(3);
      expect(undoState.timeline.length).toBe(4);
      expect(undoState.present).toEqual(nextState.past[3]);
    });

    it('moves present to future when undoing', () => {
      const nextState = applyTimes(3, rewindableReducer);

      const undoState = rewindableReducer(nextState, timelineActions.undo());

      expect(undoState.future).toHaveLength(1);
      expect(undoState.future[0]).toEqual(nextState.present);
      expect(undoState.futureTimeline).toHaveLength(1);
    });

    it('does nothing if no past history', () => {
      const initialState = rewindableReducer(undefined, { type: '@@INIT' });

      const undoState = rewindableReducer(initialState, timelineActions.undo());

      expect(undoState.past).toEqual([]);
      expect(undoState.present).toEqual(initialState.present);
    });
  });

  describe('redo() action', () => {
    it('moves to next state in future', () => {
      const nextState = applyTimes(5, rewindableReducer);
      const undoState = rewindableReducer(nextState, timelineActions.undo());

      const redoState = rewindableReducer(undoState, timelineActions.redo());

      expect(redoState.past.length).toBe(4);
      expect(redoState.timeline.length).toBe(5);
      expect(redoState.present).toEqual(nextState.present);
      expect(redoState.future).toHaveLength(0);
    });

    it('handles multiple redos', () => {
      const nextState = applyTimes(5, rewindableReducer);
      const undoState1 = rewindableReducer(nextState, timelineActions.undo());
      const undoState2 = rewindableReducer(undoState1, timelineActions.undo());

      expect(undoState2.future).toHaveLength(2);

      const redoState1 = rewindableReducer(undoState2, timelineActions.redo());
      expect(redoState1.future).toHaveLength(1);

      const redoState2 = rewindableReducer(redoState1, timelineActions.redo());
      expect(redoState2.future).toHaveLength(0);
      expect(redoState2.present).toEqual(nextState.present);
    });

    it('does nothing if no future history', () => {
      const nextState = applyTimes(3, rewindableReducer);

      const redoState = rewindableReducer(nextState, timelineActions.redo());

      expect(redoState.future).toEqual([]);
      expect(redoState.present).toEqual(nextState.present);
    });
  });

  describe('undo/redo interaction', () => {
    it('clears future when making a new change after undo', () => {
      const nextState = applyTimes(3, rewindableReducer);
      const undoState = rewindableReducer(nextState, timelineActions.undo());

      expect(undoState.future).toHaveLength(1);

      const newChangeState = rewindableReducer(undoState, {
        type: 'NEW_ACTION',
      });

      expect(newChangeState.future).toHaveLength(0);
      expect(newChangeState.futureTimeline).toHaveLength(0);
    });
  });

  describe('options', () => {
    describe('limit', () => {
      beforeEach(() => {
        const options = {
          limit: 3,
        };

        rewindableReducer = getRewindableReducer(undefined, options);
      });

      it('timeline is limited to 3 items', () => {
        const nextState = applyTimes(10, rewindableReducer);

        expect(nextState.past.length).toBe(3);
        expect(nextState.timeline.length).toBe(4); // +1 includes name for present
      });
    });

    describe('filter', () => {
      const ignoredType = 'MUTATING_THE_TIMELINE';

      beforeEach(() => {
        const options = {
          exclude: (action: UnknownAction) => action.type === ignoredType,
        };
        rewindableReducer = getRewindableReducer(undefined, options);
      });

      it('actions that are excluded do not create points on the timeline', () => {
        const nextState = applyTimes(3, rewindableReducer);

        const filteredState = applyTimes(
          3,
          rewindableReducer,
          { type: ignoredType },
          nextState,
        );

        expect(filteredState.past.length).toBe(2);
        expect(filteredState.timeline.length).toBe(3); // +1 includes name for present
      });
    });
  });
});
