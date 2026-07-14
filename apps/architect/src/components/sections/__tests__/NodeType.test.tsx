import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it } from 'vitest';

import NodeType from '../NodeType';

type FormValues = {
  subject?: { entity: string; type: string | null };
  form?: unknown;
  prompts?: unknown;
};

const Harness = (_props: InjectedFormProps<FormValues>) => (
  <NodeType
    form="edit-stage"
    stagePath={null}
    stagePosition={0}
    interfaceType={'NameGeneratorForms' as never}
  />
);

const ReduxHarness = reduxForm<FormValues>({ form: 'edit-stage' })(Harness);

const setup = (initialValues: FormValues = {}) => {
  const store = configureStore({
    reducer: {
      form: formReducer,
      activeProtocol: () => ({
        present: {
          codebook: {
            node: {
              person: {
                name: 'Person',
                color: 'node-color-seq-1',
                shape: { default: 'circle' },
                variables: {},
              },
            },
            edge: {},
            ego: { variables: {} },
          },
          stages: [],
        },
      }),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <ReduxHarness initialValues={initialValues} />
    </Provider>,
  );

  const getValues = () =>
    store.getState().form['edit-stage']?.values as FormValues | undefined;

  return { getValues };
};

describe('NodeType', () => {
  it('keeps the selected subject on a fresh stage instead of resetting it to null', () => {
    const { getValues } = setup();

    fireEvent.click(screen.getByRole('radio', { name: 'Select node Person' }));

    expect(getValues()?.subject).toEqual({ entity: 'node', type: 'person' });
  });

  it('clears dependent fields, but not the subject itself, when the subject changes', () => {
    const { getValues } = setup({
      form: { title: 'Add a person' },
      prompts: [{ id: 'prompt-1', text: 'Who do you turn to?' }],
    });

    fireEvent.click(screen.getByRole('radio', { name: 'Select node Person' }));

    const values = getValues();
    expect(values?.subject).toEqual({ entity: 'node', type: 'person' });
    expect(values?.form).toBeNull();
    expect(values?.prompts).toBeNull();
  });
});
