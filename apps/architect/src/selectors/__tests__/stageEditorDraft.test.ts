import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import reducer, {
  draftTimelineActions,
  markExternalEdit,
  setLiveValues,
} from '~/ducks/modules/stageEditorDraft';
import type { RootState } from '~/ducks/store';

import { getLiveStageDraftDirty } from '../stageEditorDraft';

type DraftState = ReturnType<typeof reducer>;

const asStage = (values: Record<string, unknown>) => values as unknown as Stage;

const asRootState = (stageEditorDraft: DraftState) =>
  ({ stageEditorDraft }) as unknown as RootState;

const seeded = (baseline: Record<string, unknown>) =>
  reducer(
    reducer(undefined, { type: '@@INIT' }),
    draftTimelineActions.reset(asStage(baseline)),
  );

describe('getLiveStageDraftDirty', () => {
  it('is clean before a baseline is seeded', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(getLiveStageDraftDirty(asRootState(state))).toBe(false);
  });

  it('is clean when the mirror matches the baseline', () => {
    const state = seeded({ label: 'One' });
    expect(getLiveStageDraftDirty(asRootState(state))).toBe(false);
  });

  it('is dirty once a mirrored value differs', () => {
    const state = reducer(
      seeded({ label: 'One' }),
      setLiveValues(asStage({ label: 'Two' })),
    );
    expect(getLiveStageDraftDirty(asRootState(state))).toBe(true);
  });

  it('ignores fields that are mounted but empty', () => {
    // A collapsed section that expands registers its fields with no value:
    // the keys appear in the mirror but nothing has been edited.
    const state = reducer(
      seeded({ label: 'One' }),
      setLiveValues(
        asStage({ label: 'One', introductionPanel: { title: undefined } }),
      ),
    );
    expect(getLiveStageDraftDirty(asRootState(state))).toBe(false);
  });

  it('is dirty when a committed value is cleared', () => {
    const state = reducer(
      seeded({ label: 'One', introductionPanel: { title: 'Panel' } }),
      setLiveValues(
        asStage({ label: 'One', introductionPanel: { title: undefined } }),
      ),
    );
    expect(getLiveStageDraftDirty(asRootState(state))).toBe(true);
  });

  it('is dirty after an edit made outside the form', () => {
    const state = reducer(seeded({ label: 'One' }), markExternalEdit());
    expect(getLiveStageDraftDirty(asRootState(state))).toBe(true);
  });

  it('clears the external edit count when the baseline is re-seeded', () => {
    const edited = reducer(seeded({ label: 'One' }), markExternalEdit());
    const reset = reducer(
      edited,
      draftTimelineActions.reset(asStage({ label: 'One' })),
    );
    expect(getLiveStageDraftDirty(asRootState(reset))).toBe(false);
  });

  it('is clean once the mirror is torn down', () => {
    const state = reducer(seeded({ label: 'One' }), setLiveValues(null));
    expect(getLiveStageDraftDirty(asRootState(state))).toBe(false);
  });
});
