import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Stage,
} from '@codaco/protocol-validation';
import { getStageEditorInitialValues } from '~/components/StageEditor/getStageEditorInitialValues';
import { stageEditorDraftListenerMiddleware } from '~/ducks/middleware/stageEditorDraftListener';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';
import type { RootState } from '~/ducks/store';
import { getStageDraftDirty } from '~/selectors/stageEditorDraft';

import Background, { allowsBackgroundImage } from '../Background';

type FormValues = {
  type: 'Sociogram';
  background: {
    concentricCircles: number;
    skewedTowardCenter?: boolean;
  };
};

const BackgroundHarness = (_props: InjectedFormProps<FormValues>) => (
  <Background
    form="edit-stage"
    stagePath="stages[0]"
    stagePosition={0}
    interfaceType="Sociogram"
  />
);

const BackgroundForm = reduxForm<FormValues>({ form: 'edit-stage' })(
  BackgroundHarness,
);

const renderExistingSociogram = (stage: Stage) => {
  const reducer = combineReducers({ form: formReducer, stageEditorDraft });
  const store = configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).prepend(
        stageEditorDraftListenerMiddleware.middleware,
      ),
  });
  const initialValues = getStageEditorInitialValues({
    interfaceType: 'Sociogram',
    stage,
    template: {},
  }) as FormValues;

  render(
    <Provider store={store}>
      <BackgroundForm initialValues={initialValues} />
    </Provider>,
  );

  return store;
};

describe('allowsBackgroundImage', () => {
  it('allows a background image for Narrative stages', () => {
    expect(allowsBackgroundImage('Narrative')).toBe(true);
  });

  it('allows a background image for Sociogram stages', () => {
    expect(allowsBackgroundImage('Sociogram')).toBe(true);
  });

  it('allows a background image for NetworkComposer stages', () => {
    expect(allowsBackgroundImage('NetworkComposer')).toBe(true);
  });

  it('does not enable background images for unrelated stages', () => {
    expect(allowsBackgroundImage('Information')).toBe(false);
  });

  it('does not mark a legacy Sociogram dirty when the toggle supplies its false default', async () => {
    const stage = {
      id: 'sociogram-1',
      label: 'Sociogram',
      type: 'Sociogram',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4 },
      prompts: [
        {
          id: 'prompt-1',
          text: 'Place the people you named.',
          layout: {
            layoutVariable: asEntityAttributeReference('layout'),
          },
        },
      ],
    } satisfies Stage;
    const store = renderExistingSociogram(stage);

    await waitFor(() => {
      expect(
        store.getState().form['edit-stage']?.values?.background
          ?.skewedTowardCenter,
      ).toBe(false);
    });

    expect(getStageDraftDirty(store.getState() as RootState)).toBe(false);
  });
});
