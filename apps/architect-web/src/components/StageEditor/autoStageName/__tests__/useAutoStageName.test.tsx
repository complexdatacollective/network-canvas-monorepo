// __tests__/useAutoStageName.test.tsx
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { Action, Dispatch } from 'redux';
import { change, reducer as formReducer } from 'redux-form';
import { describe, expect, it } from 'vitest';

import Editor from '~/components/Editor';
import { stageEditorDraftListenerMiddleware } from '~/ducks/middleware/stageEditorDraftListener';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

import { formName } from '../../configuration';
import StageHeading from '../../StageHeading';

const protocol = {
  codebook: {
    node: { person: { name: 'Person', color: 'node-1', variables: {} } },
    edge: {},
  },
  stages: [{ id: 'other', type: 'Sociogram', label: 'An existing stage' }],
  assetManifest: {},
};

function renderHeading(
  initialValues: Record<string, unknown>,
  isNewStage = true,
) {
  const store = configureStore({
    reducer: {
      form: formReducer,
      activeProtocol: () => ({ present: protocol }),
    },
  });
  const utils = render(
    <Provider store={store}>
      <Editor form={formName} initialValues={initialValues} onSubmit={() => {}}>
        <StageHeading stageNumber={1} totalStages={1} isNewStage={isNewStage} />
      </Editor>
    </Provider>,
  );
  const input = utils.getByLabelText('Stage name') as HTMLInputElement;
  return { store, dispatch: store.dispatch as Dispatch<Action>, input };
}

// A store wired with the real draft reducer + listener, so the test can observe
// the dirty/undo side effects of auto-naming (which the minimal store omits).
function renderHeadingWithDraft(initialValues: Record<string, unknown>) {
  const store = configureStore({
    reducer: {
      form: formReducer,
      stageEditorDraft,
      activeProtocol: () => ({ present: protocol }),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).prepend(
        stageEditorDraftListenerMiddleware.middleware,
      ),
  });
  const utils = render(
    <Provider store={store}>
      <Editor form={formName} initialValues={initialValues} onSubmit={() => {}}>
        <StageHeading stageNumber={1} totalStages={1} isNewStage />
      </Editor>
    </Provider>,
  );
  const input = utils.getByLabelText('Stage name') as HTMLInputElement;
  return { store, input };
}

describe('useAutoStageName (wired into StageHeading)', () => {
  it('auto-names a new stage and refines as the subject is set', async () => {
    const { dispatch, input } = renderHeading({ type: 'NameGenerator' });

    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    dispatch(change(formName, 'subject', { entity: 'node', type: 'person' }));
    await waitFor(() =>
      expect(input).toHaveValue('Person Form Name Generator'),
    );
  });

  it('stops auto-naming once the researcher types a custom name', async () => {
    const { dispatch, input } = renderHeading({ type: 'NameGenerator' });
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));

    // Replace the value in one change (mirrors selecting all then typing).
    fireEvent.change(input, { target: { value: 'My custom stage' } });
    await waitFor(() => expect(input).toHaveValue('My custom stage'));

    dispatch(change(formName, 'subject', { entity: 'node', type: 'person' }));
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

  it('does not mark a new stage dirty or add undo history on entry', async () => {
    const { store, input } = renderHeadingWithDraft({ type: 'NameGenerator' });
    await waitFor(() => expect(input).toHaveValue('Form Name Generator'));
    // Wait out the draft debounce window to prove no snapshot is taken.
    await new Promise((resolve) => setTimeout(resolve, 450));

    const state = store.getState();
    // No undo step seeded before the researcher has done anything.
    expect(state.stageEditorDraft.history.past ?? []).toHaveLength(0);
    // The auto-name was folded into the draft baseline, so the stage reads
    // pristine: live form values equal the seeded baseline.
    expect(state.form[formName]?.values).toEqual(
      state.stageEditorDraft.ui.initialValues,
    );
  });
});
