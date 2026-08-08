import crypto from 'node:crypto';

import { v4 as uuid } from 'uuid';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import reducer, {
  draftSnapshot,
  draftTimelineActions,
  setRestoring,
} from '../stageEditorDraft';

vi.mock('uuid');

(vi.mocked(uuid) as unknown as ReturnType<typeof vi.fn>).mockImplementation(
  () =>
    Array.from(crypto.randomBytes(20), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join(''),
);

const makeStage = (label: string): Stage =>
  ({ id: label, type: 'Information', label }) as unknown as Stage;

type DraftState = ReturnType<typeof reducer>;

describe('stageEditorDraft reducer', () => {
  let state: DraftState;

  beforeEach(() => {
    state = reducer(undefined, { type: '@@INIT' });
  });

  describe('initial state', () => {
    it('has a timeline-shaped history and default ui', () => {
      expect(state.history).toEqual(
        expect.objectContaining({
          past: expect.any(Array),
          present: null,
          timeline: expect.any(Array),
          future: expect.any(Array),
          futureTimeline: expect.any(Array),
        }),
      );
      expect(state.ui.restoring).toBe(false);
      expect(state.ui.initialValues).toBe(null);
    });
  });

  describe('draftSnapshot', () => {
    it('sets a new present and grows past/timeline', () => {
      const first = makeStage('one');
      const second = makeStage('two');

      const afterFirst = reducer(state, draftSnapshot(first));
      expect(afterFirst.history.present).toEqual(first);

      const next = reducer(afterFirst, draftSnapshot(second));
      expect(next.history.present).toEqual(second);
      expect(next.history.past.length).toBe(afterFirst.history.past.length + 1);
      expect(next.history.past[next.history.past.length - 1]).toEqual(first);
      expect(next.history.timeline.length).toBe(
        afterFirst.history.timeline.length + 1,
      );
    });

    it('does not create timeline entries for unrelated actions', () => {
      const next = reducer(state, { type: 'SOMETHING_ELSE' });
      expect(next.history.past.length).toBe(0);
      expect(next.history.present).toBe(null);
    });
  });

  describe('draftTimelineActions.reset', () => {
    it('seeds present, clears history, and records initialValues', () => {
      const seeded = makeStage('seed');

      let next = reducer(state, draftSnapshot(makeStage('a')));
      next = reducer(next, draftSnapshot(makeStage('b')));
      expect(next.history.past.length).toBe(1);

      next = reducer(next, draftTimelineActions.reset(seeded));

      expect(next.history.present).toEqual(seeded);
      expect(next.history.past.length).toBe(0);
      expect(next.history.future.length).toBe(0);
      expect(next.history.timeline.length).toBe(1);
      expect(next.ui.initialValues).toEqual(seeded);
      expect(next.ui.restoring).toBe(false);
    });

    it('sets initialValues to null when reset without payload', () => {
      const next = reducer(state, draftTimelineActions.reset());
      expect(next.ui.initialValues).toBe(null);
      expect(next.ui.restoring).toBe(false);
    });

    it('clears restoring on reset', () => {
      let next = reducer(state, setRestoring(true));
      expect(next.ui.restoring).toBe(true);

      next = reducer(next, draftTimelineActions.reset(makeStage('seed')));
      expect(next.ui.restoring).toBe(false);
    });
  });

  describe('setRestoring', () => {
    it('toggles ui.restoring', () => {
      let next = reducer(state, setRestoring(true));
      expect(next.ui.restoring).toBe(true);

      next = reducer(next, setRestoring(false));
      expect(next.ui.restoring).toBe(false);
    });
  });

  describe('draftTimelineActions.undo', () => {
    it('shifts present into future after snapshots', () => {
      let next = reducer(state, draftSnapshot(makeStage('one')));
      next = reducer(next, draftSnapshot(makeStage('two')));
      next = reducer(next, draftSnapshot(makeStage('three')));

      const beforeUndo = next;
      next = reducer(next, draftTimelineActions.undo());

      expect(next.history.past.length).toBe(beforeUndo.history.past.length - 1);
      expect(next.history.present).toEqual(
        beforeUndo.history.past[beforeUndo.history.past.length - 1],
      );
      expect(next.history.future.length).toBe(1);
      expect(next.history.future[0]).toEqual(beforeUndo.history.present);
    });

    it('does nothing with no past history', () => {
      const next = reducer(state, draftTimelineActions.undo());
      expect(next.history.past).toEqual([]);
      expect(next.history.present).toBe(null);
    });
  });
});
