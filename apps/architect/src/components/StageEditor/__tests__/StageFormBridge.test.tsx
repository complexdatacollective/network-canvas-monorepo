import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import { useStageRestoreVersion } from '../StageFormBridge';
import {
  asStage,
  NO_PROMPTS,
  PromptListControl,
  renderStageForm,
} from './stageFormTestHarness';

/**
 * `restoreVersion` is published through its own context rather than the stage
 * form context, so it can only be read from inside the provider.
 */
let latestRestoreVersion = 0;
const RestoreVersionProbe = () => {
  latestRestoreVersion = useStageRestoreVersion();
  return null;
};

const committedStage = asStage({
  id: 'stage-1',
  type: 'Information',
  label: 'Stage one',
});

const LabelField = () => (
  <Field
    name="label"
    label="Label"
    component={InputField}
    initialValue="Stage one"
  />
);

const PromptsField = () => (
  <Field
    name="prompts"
    label="Prompts"
    component={PromptListControl}
    initialValue={NO_PROMPTS}
  />
);

const typeLabel = (value: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
    target: { value },
  });
};

// React attaches `onBlur` to the native `focusout` event, which is what the
// field container listens for.
const blurLabel = () => {
  fireEvent.focusOut(screen.getByRole('textbox', { name: 'Label' }));
};

describe('StageFormBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('seeds the draft baseline from the form values on mount', () => {
    const { getPresent, getLiveValues, snapshots } = renderStageForm({
      committedStage,
      children: (
        <>
          <LabelField />
          <PromptsField />
        </>
      ),
    });

    expect(getPresent()).toEqual({ label: 'Stage one', prompts: [] });
    expect(getLiveValues()).toEqual({ label: 'Stage one', prompts: [] });
    expect(snapshots).toHaveLength(0);
  });

  it('debounces a leaf edit before snapshotting', () => {
    const { snapshots, getPresent } = renderStageForm({
      committedStage,
      children: <LabelField />,
    });

    typeLabel('Stage two');
    expect(snapshots).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(snapshots).toHaveLength(1);
    expect(getPresent()).toEqual({ label: 'Stage two' });
  });

  it('snapshots an array change immediately', () => {
    const { snapshots } = renderStageForm({
      committedStage,
      children: (
        <>
          <LabelField />
          <PromptsField />
        </>
      ),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add prompt' }));

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      prompts: [{ id: 'p1', text: 'Prompt 1' }],
    });
  });

  it('debounces an in-place edit of one array row', () => {
    const { snapshots } = renderStageForm({
      committedStage,
      children: <PromptsField />,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add prompt' }));
    expect(snapshots).toHaveLength(1);

    // Inline row editors rewrite the whole array per keystroke; that must not
    // become one undo entry per character.
    fireEvent.click(screen.getByRole('button', { name: 'Edit first prompt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit first prompt' }));
    expect(snapshots).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toMatchObject({
      prompts: [{ id: 'p1', text: 'Prompt 1!!' }],
    });
  });

  it('snapshots a reorder immediately', () => {
    const { snapshots } = renderStageForm({
      committedStage,
      children: <PromptsField />,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add prompt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add prompt' }));
    expect(snapshots).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Reverse prompts' }));

    expect(snapshots).toHaveLength(3);
    expect(snapshots[2]).toMatchObject({
      prompts: [{ id: 'p2' }, { id: 'p1' }],
    });
  });

  it('flushes a pending debounce when a field is blurred', () => {
    const { snapshots } = renderStageForm({
      committedStage,
      children: <LabelField />,
    });

    typeLabel('Stage two');
    expect(snapshots).toHaveLength(0);

    blurLabel();
    expect(snapshots).toHaveLength(1);

    // The flushed timer must not fire a second time.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(snapshots).toHaveLength(1);
  });

  it('does nothing on blur when no edit is pending', () => {
    const { snapshots } = renderStageForm({
      committedStage,
      children: <LabelField />,
    });

    blurLabel();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(snapshots).toHaveLength(0);
  });

  it('dedups a change that reproduces the current timeline entry', () => {
    const { snapshots, getStoreApi } = renderStageForm({
      committedStage,
      children: <PromptsField />,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add prompt' }));
    expect(snapshots).toHaveLength(1);

    // A new array with identical contents: a value change for the store, but
    // not a new point on the timeline.
    act(() => {
      getStoreApi()
        .getState()
        .setFieldValue('prompts', [{ id: 'p1', text: 'Prompt 1' }]);
    });

    expect(snapshots).toHaveLength(1);
  });

  it('mirrors the form values into liveValues within the coalescing window', () => {
    const { getLiveValues } = renderStageForm({
      committedStage,
      children: <LabelField />,
    });

    typeLabel('Stage two');
    expect(getLiveValues()).toEqual({ label: 'Stage one' });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(getLiveValues()).toEqual({ label: 'Stage two' });
  });

  it('does not snapshot when fields only register or unregister', () => {
    const { snapshots, getLiveValues, renderTree } = renderStageForm({
      committedStage,
      children: <LabelField />,
    });

    renderTree(
      <>
        <LabelField />
        <PromptsField />
      </>,
    );

    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Mounting a section's fields is not an edit, but the mirror must still
    // see them.
    expect(snapshots).toHaveLength(0);
    expect(getLiveValues()).toEqual({ label: 'Stage one', prompts: [] });

    renderTree(<LabelField />);

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(snapshots).toHaveLength(0);
    expect(getLiveValues()).toEqual({ label: 'Stage one' });
  });

  it('suppresses snapshots while a restore is applying and refreshes the mirror after', () => {
    const { snapshots, getContext, getStoreApi, getLiveValues, store } =
      renderStageForm({
        committedStage,
        children: (
          <>
            <LabelField />
            <PromptsField />
          </>
        ),
      });

    act(() => {
      getContext().draft.runRestore(() => {
        const formStore = getStoreApi().getState();
        formStore.setFieldValue('label', 'Restored');
        formStore.setFieldValue('prompts', [{ id: 'p1', text: 'Prompt 1' }]);
      });
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(snapshots).toHaveLength(0);
    // The mirror is refreshed at the end of the restore, without waiting for
    // the coalescing window.
    expect(getLiveValues()).toEqual({
      label: 'Restored',
      prompts: [{ id: 'p1', text: 'Prompt 1' }],
    });
    expect(store.getState().stageEditorDraft.ui.restoring).toBe(false);
  });

  // `runGesture` is the batching primitive the reset-on-change sections use:
  // a loop of writes is one logical change, so the half-reset states between
  // those writes must never reach the timeline.
  describe('runGesture', () => {
    const renderGestureForm = () =>
      renderStageForm({
        committedStage,
        children: (
          <>
            <LabelField />
            <PromptsField />
            <RestoreVersionProbe />
          </>
        ),
      });

    it('records a multi-write gesture as exactly one entry', () => {
      const { snapshots, getContext, getStoreApi, getPresent } =
        renderGestureForm();

      fireEvent.click(screen.getByRole('button', { name: 'Add prompt' }));
      fireEvent.click(screen.getByRole('button', { name: 'Add prompt' }));
      expect(snapshots).toHaveLength(2);

      act(() => {
        getContext().draft.runGesture(() => {
          const formStore = getStoreApi().getState();
          // Two structural array writes plus a leaf: unbatched this is three
          // separate entries, two of them half-done.
          formStore.setFieldValue('prompts', [{ id: 'p1', text: 'Prompt 1' }]);
          formStore.setFieldValue('prompts', []);
          formStore.setFieldValue('label', 'Reset');
        });
      });

      expect(snapshots).toHaveLength(3);
      expect(getPresent()).toEqual({ label: 'Reset', prompts: [] });

      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(snapshots).toHaveLength(3);
    });

    it('supersedes the pending debounce of the edit that triggered it', () => {
      const { snapshots, getContext, getStoreApi, getPresent } =
        renderGestureForm();

      // The trigger: a leaf edit whose own snapshot is still 400ms away.
      typeLabel('Stage two');
      expect(snapshots).toHaveLength(0);

      act(() => {
        getContext().draft.runGesture(() => {
          getStoreApi().getState().setFieldValue('prompts', []);
        });
      });

      act(() => {
        vi.advanceTimersByTime(400);
      });

      // The trigger and everything the gesture reset are the same entry — the
      // one an undo press has to take back.
      expect(snapshots).toHaveLength(1);
      expect(getPresent()).toEqual({ label: 'Stage two', prompts: [] });
    });

    it('does not count as a restore', () => {
      const { getContext, getStoreApi } = renderGestureForm();

      const before = latestRestoreVersion;

      act(() => {
        getContext().draft.runGesture(() => {
          getStoreApi().getState().setFieldValue('label', 'Reset');
        });
      });

      // `useStageRestoreVersion` means "an undo/redo happened". Moving it here
      // would make every guarded observer read the user's next edit as a
      // restore and skip the reset it deserves.
      expect(latestRestoreVersion).toBe(before);

      act(() => {
        getContext().draft.runRestore(() => {
          getStoreApi().getState().setFieldValue('label', 'Restored');
        });
      });

      expect(latestRestoreVersion).toBe(before + 1);
    });

    it('refreshes the mirror without waiting for the coalescing window', () => {
      const { getContext, getStoreApi, getLiveValues } = renderGestureForm();

      act(() => {
        getContext().draft.runGesture(() => {
          getStoreApi().getState().setFieldValue('label', 'Reset');
        });
      });

      expect(getLiveValues()).toEqual({ label: 'Reset', prompts: [] });
    });

    it('leaves a gesture that changes nothing off the timeline', () => {
      const { snapshots, getContext, getStoreApi } = renderGestureForm();

      act(() => {
        getContext().draft.runGesture(() => {
          getStoreApi().getState().setFieldValue('label', 'Stage one');
        });
      });

      expect(snapshots).toHaveLength(0);
    });

    it('keeps a nested gesture inside the outer one', () => {
      const { snapshots, getContext, getStoreApi, getPresent } =
        renderGestureForm();

      act(() => {
        const { draft } = getContext();
        draft.runGesture(() => {
          getStoreApi().getState().setFieldValue('label', 'Outer');
          draft.runGesture(() => {
            getStoreApi().getState().setFieldValue('prompts', []);
          });
          getStoreApi().getState().setFieldValue('label', 'Reset');
        });
      });

      expect(snapshots).toHaveLength(1);
      expect(getPresent()).toEqual({ label: 'Reset', prompts: [] });
    });

    it('still commits the writes that landed when a gesture throws', () => {
      const { snapshots, getContext, getStoreApi, getPresent, getLiveValues } =
        renderGestureForm();

      expect(() =>
        act(() => {
          getContext().draft.runGesture(() => {
            getStoreApi().getState().setFieldValue('label', 'Reset');
            throw new Error('a section blew up mid-reset');
          });
        }),
      ).toThrow('a section blew up mid-reset');

      // Suppression must not outlive the gesture, and neither the timeline nor
      // the mirror may be left describing the state before it.
      expect(snapshots).toHaveLength(1);
      expect(getPresent()).toEqual({ label: 'Reset', prompts: [] });
      expect(getLiveValues()).toEqual({ label: 'Reset', prompts: [] });

      typeLabel('Stage three');
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(snapshots).toHaveLength(2);
    });

    it('undoes a gesture in one step and redoes it without branching', () => {
      const { snapshots, getContext, getHistory, getStoreApi, store } =
        renderGestureForm();

      fireEvent.click(screen.getByRole('button', { name: 'Add prompt' }));
      expect(snapshots).toHaveLength(1);

      act(() => {
        getContext().draft.runGesture(() => {
          const formStore = getStoreApi().getState();
          formStore.setFieldValue('prompts', []);
          formStore.setFieldValue('label', 'Reset');
        });
      });

      act(() => {
        getHistory().undo();
      });

      const { storeApi } = getContext();
      expect(storeApi.getState().getFieldState('label')?.value).toBe(
        'Stage one',
      );
      expect(storeApi.getState().getFieldState('prompts')?.value).toEqual([
        { id: 'p1', text: 'Prompt 1' },
      ]);

      act(() => {
        getHistory().redo();
      });

      expect(storeApi.getState().getFieldState('label')?.value).toBe('Reset');
      expect(storeApi.getState().getFieldState('prompts')?.value).toEqual([]);
      expect(snapshots).toHaveLength(2);
      expect(store.getState().stageEditorDraft.history.future).toHaveLength(0);
      expect(getHistory().canUndo).toBe(true);
    });
  });

  it('cancels a pending snapshot and clears the mirror on unmount', () => {
    const { snapshots, store, unmount } = renderStageForm({
      committedStage,
      children: <LabelField />,
    });

    typeLabel('Stage two');
    unmount();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(snapshots).toHaveLength(0);
    expect(store.getState().stageEditorDraft.ui.liveValues).toBeNull();
  });

  // The codebook transaction has to end with the editor however it is left.
  // Not every way out runs a discard handler — leaving a PRISTINE editor (Back
  // to the overview, "Return to Start Screen") runs none at all — and a
  // transaction left open would route codebook writes made elsewhere into a
  // draft nothing will ever commit, losing them silently (#1382).
  it('closes the codebook transaction on unmount, even when nothing was edited', () => {
    const { store, unmount } = renderStageForm({
      committedStage,
      children: <LabelField />,
      extraReducers: {
        activeProtocol: () => ({
          present: { codebook: { node: {}, edge: {} } },
        }),
      },
    });

    expect(store.getState().stageEditorDraft.ui.initialCodebook).not.toBeNull();

    unmount();

    expect(store.getState().stageEditorDraft.ui.initialCodebook).toBeNull();
    expect(store.getState().stageEditorDraft.history.present).toBeNull();
  });
});
