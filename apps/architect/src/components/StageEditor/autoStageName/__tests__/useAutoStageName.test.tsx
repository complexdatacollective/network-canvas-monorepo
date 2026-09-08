import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import type {
  Stage,
  StageSubject,
  StageType,
} from '@codaco/protocol-validation';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

import StageForm from '../../StageForm';
import { useSetStageValue } from '../../stageFormHooks';
import StageHeading from '../../StageHeading';
import { useStageDraftHistory } from '../../useStageDraftHistory';

// The interface registry pulls in every section component; the heading only
// needs the display metadata for one type.
vi.mock('../../Interfaces', () => ({
  getInterface: (type: string) => ({
    name: `Interface:${type}`,
    documentation: undefined,
  }),
}));

vi.mock('@codaco/protocol-builder/interfaces/StageTypeImage', () => ({
  default: () => null,
}));

const protocol = {
  codebook: {
    node: { person: { name: 'Person', color: 'node-1', variables: {} } },
    edge: {},
  },
  stages: [{ id: 'other', type: 'Sociogram', label: 'An existing stage' }],
  assetManifest: {},
};

function renderHeading(
  committedStage: Record<string, unknown>,
  isNewStage = true,
) {
  const store = configureStore({
    reducer: {
      stageEditorDraft,
      activeProtocol: () => ({ present: protocol }),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });

  let setStageValue: ReturnType<typeof useSetStageValue> | null = null;
  let history: ReturnType<typeof useStageDraftHistory> | null = null;
  const Probe = () => {
    setStageValue = useSetStageValue();
    history = useStageDraftHistory();
    return null;
  };

  const stage = committedStage as unknown as Stage;

  const utils = render(
    <Provider store={store}>
      <StageForm
        stageId={(committedStage.id as string | undefined) ?? null}
        interfaceType={committedStage.type as StageType}
        committedStage={stage}
        onSubmit={() => ({ success: true })}
      >
        <Probe />
        <StageHeading stageNumber={1} totalStages={1} isNewStage={isNewStage} />
      </StageForm>
    </Provider>,
  );

  const input = utils.getByRole('textbox', {
    name: 'Stage name',
  }) as HTMLInputElement;

  return {
    store,
    input,
    setSubject: (subject: StageSubject) =>
      act(() => {
        setStageValue?.('subject', subject);
      }),
    undo: () =>
      act(() => {
        history?.undo();
      }),
    redo: () =>
      act(() => {
        history?.redo();
      }),
  };
}

describe('useAutoStageName (wired into StageHeading)', () => {
  it('auto-names a new stage and refines as the subject is set', async () => {
    const { input, setSubject } = renderHeading({ type: 'NameGenerator' });

    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    setSubject({ entity: 'node', type: 'person' });
    await waitFor(() =>
      expect(input).toHaveValue('Person Form Name Generator'),
    );
  });

  it('stops auto-naming once the researcher types a custom name', async () => {
    const { input, setSubject } = renderHeading({ type: 'NameGenerator' });
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    // Replace the value in one change (mirrors selecting all then typing).
    fireEvent.change(input, { target: { value: 'My custom stage' } });
    await waitFor(() => expect(input).toHaveValue('My custom stage'));

    setSubject({ entity: 'node', type: 'person' });
    // Give the effect a chance to (incorrectly) overwrite, then assert it didn't.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(input).toHaveValue('My custom stage');
  });

  it('does not auto-name an existing stage', async () => {
    const { input } = renderHeading(
      { type: 'Sociogram', id: 's1', label: 'Hand named' },
      false,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(input).toHaveValue('Hand named');
  });

  it('does not auto-name an existing stage with an empty label', async () => {
    // Newness is determined by the absence of a stage id, not an empty label —
    // so a hand-authored/migrated stage with an empty label is left untouched.
    const { input } = renderHeading(
      { type: 'Sociogram', id: 's1', label: '' },
      false,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(input).toHaveValue('');
  });

  it('leaves the field empty when cleared, then re-fills on blur', async () => {
    const { input } = renderHeading({ type: 'NameGenerator' });
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    // Clearing does not instantly refill and fight the researcher.
    fireEvent.change(input, { target: { value: '' } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(input).toHaveValue('');

    // Blurring while still empty re-engages auto-naming.
    fireEvent.blur(input);
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));
  });

  it('keeps auto-naming alive after undo restores an auto-generated name', async () => {
    const { input, setSubject, undo } = renderHeading({
      type: 'NameGenerator',
    });
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    setSubject({ entity: 'node', type: 'person' });
    await waitFor(() =>
      expect(input).toHaveValue('Person Form Name Generator'),
    );
    // Let the debounced snapshot land so undo has a step to consume.
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));

    undo();
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    // The restored label is stale relative to the newest generated name.
    // Without resyncing on restore, the hook reads that mismatch as the
    // researcher taking ownership and auto-naming is silently dead from the
    // first undo onward.
    setSubject({ entity: 'node', type: 'person' });
    await waitFor(() =>
      expect(input).toHaveValue('Person Form Name Generator'),
    );
  });

  it('re-arms auto-naming when undo restores the generated name itself', async () => {
    const { input, setSubject, undo } = renderHeading({
      type: 'NameGenerator',
    });
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    fireEvent.change(input, { target: { value: 'My custom stage' } });
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));

    undo();
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    // The visible label is the generated one again, so undo must restore the
    // BEHAVIOUR too: a later config change regenerates rather than leaving
    // the restored text frozen under a stale custom latch.
    setSubject({ entity: 'node', type: 'person' });
    await waitFor(() =>
      expect(input).toHaveValue('Person Form Name Generator'),
    );
  });

  it('re-takes ownership when redo restores the hand-typed name', async () => {
    const { input, setSubject, undo, redo } = renderHeading({
      type: 'NameGenerator',
    });
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    fireEvent.change(input, { target: { value: 'My custom stage' } });
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));

    undo();
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));
    redo();
    await waitFor(() => expect(input).toHaveValue('My custom stage'));

    // The symmetric hazard of re-arming on undo: after redo brings the
    // hand-typed name back, a config change must not overwrite it with a
    // generated name — ownership travels with the text in both directions.
    setSubject({ entity: 'node', type: 'person' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(input).toHaveValue('My custom stage');
  });

  it('does not re-arm auto-naming when undo restores a hand-typed name', async () => {
    const { input, setSubject, undo } = renderHeading({
      type: 'NameGenerator',
    });
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    fireEvent.change(input, { target: { value: 'My custom stage' } });
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));

    fireEvent.change(input, { target: { value: 'Renamed again' } });
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));

    undo();
    await waitFor(() => expect(input).toHaveValue('My custom stage'));

    // A restored hand-typed name is still owned: the next config change must
    // not overwrite the researcher's text with a generated name.
    setSubject({ entity: 'node', type: 'person' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(input).toHaveValue('My custom stage');
  });

  it('does not mark a new stage dirty or add undo history on entry', async () => {
    const { store, input } = renderHeading({ type: 'NameGenerator' });
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));
    // Wait out the draft debounce window to prove no snapshot is taken.
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));

    const { history, ui } = store.getState().stageEditorDraft;
    // No undo step seeded before the researcher has done anything.
    expect(history.past ?? []).toHaveLength(0);
    // The auto-name was folded into the draft baseline, so the stage reads
    // pristine: the live mirror equals the seeded baseline.
    expect(ui.liveValues).toEqual(ui.initialValues);
  });
});
