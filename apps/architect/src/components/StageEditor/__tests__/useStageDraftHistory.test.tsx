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

// A leaf inside a toggleable section: it is only registered while the section
// is expanded.
const SkipLogicField = () => (
  <Field name="skipLogic.action" label="Skip action" component={InputField} />
);

const labelInput = () => screen.getByRole('textbox', { name: 'Label' });
const skipLogicInput = () =>
  screen.getByRole('textbox', { name: 'Skip action' });

const setValue = (element: HTMLElement, value: string) => {
  fireEvent.change(element, { target: { value } });
};

describe('useStageDraftHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('undoes and redoes a leaf edit', () => {
    const { getHistory, getPresent } = renderStageForm({
      committedStage,
      children: <LabelField />,
    });

    setValue(labelInput(), 'Stage two');
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(getHistory().canUndo).toBe(true);

    act(() => {
      getHistory().undo();
    });

    expect(labelInput()).toHaveValue('Stage one');
    expect(getPresent()).toEqual({ label: 'Stage one' });
    expect(getHistory().canRedo).toBe(true);

    act(() => {
      getHistory().redo();
    });

    expect(labelInput()).toHaveValue('Stage two');
    expect(getPresent()).toEqual({ label: 'Stage two' });
  });

  it('undoes an array mutation one step at a time', () => {
    const { getHistory } = renderStageForm({
      committedStage,
      children: <PromptsField />,
    });

    const addPrompt = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Add prompt' }));

    addPrompt();
    addPrompt();
    expect(screen.getByTestId('prompt-count')).toHaveTextContent('2');

    act(() => {
      getHistory().undo();
    });
    expect(screen.getByTestId('prompt-count')).toHaveTextContent('1');

    act(() => {
      getHistory().undo();
    });
    expect(screen.getByTestId('prompt-count')).toHaveTextContent('0');

    act(() => {
      getHistory().redo();
    });
    expect(screen.getByTestId('prompt-count')).toHaveTextContent('1');
  });

  it('restores a value whose field has unmounted, and the field picks it up on remount', () => {
    const { getHistory, getFieldState, getLiveValues, renderTree } =
      renderStageForm({
        committedStage,
        children: (
          <>
            <LabelField />
            <SkipLogicField />
          </>
        ),
      });

    setValue(skipLogicInput(), 'SHOW');
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Toggling the section off: the value is cleared, then its field unmounts.
    setValue(skipLogicInput(), '');
    renderTree(<LabelField />);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(getLiveValues()).toEqual({ label: 'Stage one' });

    act(() => {
      getHistory().undo();
    });

    // The write lands in dormant storage: no field owns the name right now.
    expect(getFieldState('skipLogic.action')?.value).toBe('SHOW');
    expect(getLiveValues()).toEqual({ label: 'Stage one' });

    renderTree(
      <>
        <LabelField />
        <SkipLogicField />
      </>,
    );

    expect(skipLogicInput()).toHaveValue('SHOW');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(getLiveValues()).toEqual({
      label: 'Stage one',
      skipLogic: { action: 'SHOW' },
    });
  });

  it('commits an in-progress edit before undoing, so the step cannot skip it', () => {
    const { getHistory, snapshots, store } = renderStageForm({
      committedStage,
      children: <LabelField />,
    });

    setValue(labelInput(), 'Stage two');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(snapshots).toHaveLength(1);

    // A keystroke that is still inside the debounce window.
    setValue(labelInput(), 'Stage three');
    expect(snapshots).toHaveLength(1);

    act(() => {
      getHistory().undo();
    });

    // Without the flush, undo would skip 'Stage two' and land on 'Stage one'.
    expect(labelInput()).toHaveValue('Stage two');
    expect(snapshots).toHaveLength(2);
    expect(
      store.getState().stageEditorDraft.history.future.length,
    ).toBeGreaterThan(0);
  });

  it('commits an in-progress edit before redoing, branching the timeline', () => {
    const { getHistory, store } = renderStageForm({
      committedStage,
      children: <LabelField />,
    });

    setValue(labelInput(), 'Stage two');
    act(() => {
      vi.advanceTimersByTime(400);
    });

    act(() => {
      getHistory().undo();
    });
    expect(labelInput()).toHaveValue('Stage one');

    // Editing after an undo, then asking to redo: the pending edit wins and
    // there is nothing left to redo past it.
    setValue(labelInput(), 'Stage four');
    act(() => {
      getHistory().redo();
    });

    expect(labelInput()).toHaveValue('Stage four');
    expect(store.getState().stageEditorDraft.history.future).toHaveLength(0);
  });
});
