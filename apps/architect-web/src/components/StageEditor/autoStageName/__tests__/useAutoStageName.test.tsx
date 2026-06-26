// __tests__/useAutoStageName.test.tsx
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { Action, Dispatch } from 'redux';
import { change, reducer as formReducer } from 'redux-form';
import { describe, expect, it } from 'vitest';

import Editor from '~/components/Editor';

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

function renderHeading(initialValues: Record<string, unknown>) {
  const store = configureStore({
    reducer: {
      form: formReducer,
      activeProtocol: () => ({ present: protocol }),
    },
  });
  const utils = render(
    <Provider store={store}>
      <Editor form={formName} initialValues={initialValues} onSubmit={() => {}}>
        <StageHeading stageNumber={1} totalStages={1} />
      </Editor>
    </Provider>,
  );
  const input = utils.getByLabelText('Stage name') as HTMLInputElement;
  return { store, dispatch: store.dispatch as Dispatch<Action>, input };
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
    const { input } = renderHeading({
      type: 'Sociogram',
      id: 's1',
      label: 'Hand named',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(input).toHaveValue('Hand named');
  });
});
