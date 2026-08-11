import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';

const confirm = vi.fn();
const openDialog = vi.fn();

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm, openDialog }),
}));

import NodeType from '../NodeType';

type FormValues = {
  subject?: { entity: string; type: string | null };
  form?: unknown;
  prompts?: unknown;
  behaviours?: unknown;
};

const setup = (
  initialValues: FormValues = {},
  interfaceType: StageType = 'NameGenerator',
) => {
  const Harness = (_props: InjectedFormProps<FormValues>) => (
    <NodeType
      form="edit-stage"
      stagePath={null}
      stagePosition={0}
      interfaceType={interfaceType}
    />
  );

  const ReduxHarness = reduxForm<FormValues>({ form: 'edit-stage' })(Harness);

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
              place: {
                name: 'Place',
                color: 'node-color-seq-2',
                shape: { default: 'square' },
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
  beforeEach(() => {
    confirm.mockReset();
    openDialog.mockReset();
    confirm.mockImplementation(({ onConfirm }: { onConfirm?: () => void }) =>
      onConfirm?.(),
    );
  });

  it('keeps the selected subject on a fresh stage instead of resetting it to null', () => {
    const { getValues } = setup();

    fireEvent.click(screen.getByRole('radio', { name: 'Select node Person' }));

    expect(getValues()?.subject).toEqual({ entity: 'node', type: 'person' });
  });

  it('keeps the interface template defaults when the subject is first selected', () => {
    const { getValues } = setup(
      { behaviours: { removeAfterConsideration: true } },
      'OneToManyDyadCensus',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Select node Person' }));

    expect(getValues()?.behaviours).toEqual({ removeAfterConsideration: true });
  });

  it('clears dependent fields, but not the subject itself, when the subject changes', () => {
    const { getValues } = setup({
      subject: { entity: 'node', type: 'person' },
      form: { title: 'Add a person' },
      prompts: [{ id: 'prompt-1', text: 'Who do you turn to?' }],
    });

    fireEvent.click(screen.getByRole('radio', { name: 'Select node Place' }));

    const values = getValues();
    expect(values?.subject).toEqual({ entity: 'node', type: 'place' });
    expect(values?.form).toBeNull();
    expect(values?.prompts).toBeNull();
  });

  it('restores the interface template defaults when the subject changes', () => {
    const { getValues } = setup(
      {
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'prompt-1', text: 'Who do you turn to?' }],
        behaviours: { removeAfterConsideration: false },
      },
      'OneToManyDyadCensus',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Select node Place' }));

    const values = getValues();
    expect(values?.prompts).toBeNull();
    expect(values?.behaviours).toEqual({ removeAfterConsideration: true });
  });
});
