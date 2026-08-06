import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import {
  asStage,
  NO_PROMPTS,
  PromptListControl,
  renderStageForm,
} from './stageFormTestHarness';

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
});
