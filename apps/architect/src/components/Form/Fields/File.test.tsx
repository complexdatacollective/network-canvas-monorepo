import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  Field,
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../AssetBrowser/AssetBrowserWindow', () => ({
  default: ({
    show,
    onSelect,
    onCancel,
  }: {
    show: boolean;
    onSelect: (id: string) => void;
    onCancel: () => void;
  }) =>
    show ? (
      <div role="dialog" aria-label="Resource library">
        <button type="button" onClick={() => onSelect('asset-1')}>
          Choose asset
        </button>
        <button type="button" onClick={onCancel}>
          Cancel library
        </button>
      </div>
    ) : null,
}));

import FileInput from './File';

type FormValues = { resource?: string };

const Harness = (_props: InjectedFormProps<FormValues>) => (
  <Field
    name="resource"
    label="Background image"
    component={FileInput}
    required
  >
    {(id: string) => <span>Selected {id}</span>}
  </Field>
);

const ReduxHarness = reduxForm<FormValues>({ form: 'file-field-test' })(
  Harness,
);

const setup = () => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <ReduxHarness />
    </Provider>,
  );

  return {
    getResource: () =>
      store.getState().form['file-field-test']?.values?.resource as
        | string
        | undefined,
  };
};

describe('File field', () => {
  it('uses shared field semantics and persists a selected asset', () => {
    const { getResource } = setup();

    expect(
      screen.getByRole('group', { name: 'Background image' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Background image' }),
    ).toHaveAccessibleDescription('Required');

    fireEvent.click(screen.getByRole('button', { name: 'Select resource' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose asset' }));

    expect(getResource()).toBe('asset-1');
    expect(screen.getByText('Selected asset-1')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the current value when resource selection is cancelled', () => {
    const { getResource } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Select resource' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel library' }));

    expect(getResource()).toBeUndefined();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
