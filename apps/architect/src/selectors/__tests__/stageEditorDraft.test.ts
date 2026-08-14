import { describe, expect, it } from 'vitest';

import type { Codebook, Stage } from '@codaco/protocol-validation';
import { test as codebookTest } from '~/ducks/modules/protocol/codebook';
import { stageEditorCodebookMeta } from '~/ducks/modules/protocol/stageEditorCodebookMeta';
import reducer, {
  draftTimelineActions,
  setLiveValues,
} from '~/ducks/modules/stageEditorDraft';
import type { RootState } from '~/ducks/store';

import { getLiveStageDraftDirty } from '../stageEditorDraft';

type DraftState = ReturnType<typeof reducer>;

const asStage = (values: Record<string, unknown>) => values as unknown as Stage;

const asRootState = (stageEditorDraft: DraftState) =>
  ({ stageEditorDraft }) as unknown as RootState;

const CODEBOOK: Codebook = {
  node: {
    person: {
      name: 'person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: { v1: { name: 'age', type: 'number', component: 'Number' } },
    },
  },
  edge: {},
};

const seeded = (
  baseline: Record<string, unknown>,
  codebook: Codebook | null = CODEBOOK,
) =>
  reducer(
    reducer(undefined, { type: '@@INIT' }),
    draftTimelineActions.reset({ stage: asStage(baseline), codebook }),
  );

// The stamped shape a codebook write takes while a stage editor transaction is
// open (see `routeCodebookAction`).
const draftCodebookWrite = () => ({
  ...codebookTest.updateVariable({
    variable: 'v1',
    configuration: { component: 'Text' },
    replaceProperties: ['component'],
  }),
  meta: stageEditorCodebookMeta,
});

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

  it('is dirty after a codebook edit made outside the form', () => {
    const state = reducer(seeded({ label: 'One' }), draftCodebookWrite());
    expect(getLiveStageDraftDirty(asRootState(state))).toBe(true);
  });

  it('is clean again once a codebook edit is undone', () => {
    const edited = reducer(seeded({ label: 'One' }), draftCodebookWrite());
    const undone = reducer(edited, draftTimelineActions.undo());
    expect(getLiveStageDraftDirty(asRootState(undone))).toBe(false);
  });

  it('clears codebook dirtiness when the baseline is re-seeded', () => {
    const edited = reducer(seeded({ label: 'One' }), draftCodebookWrite());
    const reset = reducer(
      edited,
      draftTimelineActions.reset({
        stage: asStage({ label: 'One' }),
        codebook: edited.history.present?.codebook ?? null,
      }),
    );
    expect(getLiveStageDraftDirty(asRootState(reset))).toBe(false);
  });

  it('ignores codebook state when no transaction is open', () => {
    const state = reducer(seeded({ label: 'One' }, null), setLiveValues(null));
    expect(getLiveStageDraftDirty(asRootState(state))).toBe(false);
  });

  it('is clean once the mirror is torn down', () => {
    const state = reducer(seeded({ label: 'One' }), setLiveValues(null));
    expect(getLiveStageDraftDirty(asRootState(state))).toBe(false);
  });
});
