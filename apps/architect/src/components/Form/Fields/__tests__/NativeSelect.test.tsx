import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

import ValidatedField from '../../ValidatedField';
import NativeSelect from '../NativeSelect';

type FormValues = { choice?: string | null };

type HarnessOwnProps = {
  allowPlaceholderSelect?: boolean;
  onCreateOption?: (value: string) => Promise<void> | void;
  onCreateNew?: () => void;
};

const options = [
  { label: 'Alpha', value: 'alpha' },
  { label: 'Disabled', value: 'disabled', disabled: true },
];

const Harness = ({
  handleSubmit,
  allowPlaceholderSelect,
  onCreateOption,
  onCreateNew,
}: InjectedFormProps<FormValues, HarnessOwnProps> & HarnessOwnProps) => (
  <form onSubmit={handleSubmit(vi.fn())}>
    <ValidatedField
      name="choice"
      label="Choice"
      component={NativeSelect as ComponentType<Record<string, unknown>>}
      validation={{ required: true }}
      componentProps={{
        options,
        reserved: [{ label: 'Reserved', value: 'reserved' }],
        entity: 'person',
        placeholder: 'Choose one',
        allowPlaceholderSelect,
        onCreateOption,
        onCreateNew,
        createInputLabel: 'New choice',
        validation: { allowedNMToken: 'choice name' },
      }}
    />
  </form>
);

const ReduxHarness = reduxForm<FormValues, HarnessOwnProps>({
  form: 'native-select-test',
  touchOnBlur: true,
  touchOnChange: false,
})(Harness);

const setup = ({
  initialValues = {},
  allowPlaceholderSelect = false,
  onCreateOption,
  onCreateNew,
}: HarnessOwnProps & { initialValues?: FormValues } = {}) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <ReduxHarness
        initialValues={initialValues}
        allowPlaceholderSelect={allowPlaceholderSelect}
        onCreateOption={onCreateOption}
        onCreateNew={onCreateNew}
      />
    </Provider>,
  );

  const getForm = () => store.getState().form['native-select-test'];
  return { getForm, store };
};

describe('NativeSelect', () => {
  it('maps selections and placeholders to the Redux value contract', () => {
    const { getForm } = setup({ allowPlaceholderSelect: true });
    const select = screen.getByRole('combobox', { name: /Choice/ });

    fireEvent.change(select, { target: { value: 'alpha' } });
    expect(getForm()?.values?.choice).toBe('alpha');

    fireEvent.change(select, { target: { value: '' } });
    expect(getForm()?.values?.choice).toBeNull();
  });

  it('preserves disabled placeholder and option semantics', () => {
    setup();

    expect(
      screen.getByRole('option', { name: '-- Choose one --' }),
    ).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Disabled' })).toBeDisabled();
  });

  it('shows parent validation through the shared field error UI', () => {
    setup();
    const select = screen.getByRole('combobox', { name: /Choice/ });

    fireEvent.focus(select);
    fireEvent.blur(select);

    expect(screen.getByText('Required', { selector: 'p' })).toBeInTheDocument();
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAttribute('aria-required', 'true');
  });

  it('untouches the parent while creating and resets draft state on cancel', async () => {
    const { getForm } = setup({ onCreateOption: vi.fn() });
    let select = screen.getByRole('combobox', { name: /Choice/ });

    fireEvent.blur(select);
    expect(getForm()?.fields?.choice?.touched).toBe(true);

    fireEvent.change(select, { target: { value: '_create' } });
    expect(getForm()?.fields?.choice?.touched).not.toBe(true);

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'New choice' }),
      {
        target: { value: 'Draft' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    select = await screen.findByRole('combobox', { name: /Choice/ });
    fireEvent.change(select, { target: { value: '_create' } });
    expect(
      await screen.findByRole('textbox', { name: 'New choice' }),
    ).toHaveValue('');
  });

  it('validates duplicate, reserved, and format errors before creation', async () => {
    setup({ onCreateOption: vi.fn() });
    fireEvent.change(screen.getByRole('combobox', { name: /Choice/ }), {
      target: { value: '_create' },
    });
    const input = await screen.findByRole('textbox', { name: 'New choice' });
    const create = screen.getByRole('button', { name: 'Create' });

    fireEvent.change(input, { target: { value: 'Alpha' } });
    expect(screen.getByText(/already defined/)).toBeInTheDocument();
    expect(create).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Reserved' } });
    expect(screen.getByText(/already defined/)).toBeInTheDocument();
    expect(create).toBeDisabled();

    fireEvent.change(input, { target: { value: 'not allowed' } });
    expect(create).toBeDisabled();
  });

  it('submits a valid created option and returns to the select', async () => {
    const onCreateOption = vi.fn(async () => undefined);
    setup({ onCreateOption });
    fireEvent.change(screen.getByRole('combobox', { name: /Choice/ }), {
      target: { value: '_create' },
    });
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'New choice' }),
      {
        target: { value: 'NewChoice' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(onCreateOption).toHaveBeenCalledWith('NewChoice'),
    );
    expect(
      await screen.findByRole('combobox', { name: /Choice/ }),
    ).toBeInTheDocument();
  });

  it('keeps the create form open and reports creation failures', async () => {
    const onCreateOption = vi.fn(async () => {
      throw new Error('Could not create that option');
    });
    setup({ onCreateOption });
    fireEvent.change(screen.getByRole('combobox', { name: /Choice/ }), {
      target: { value: '_create' },
    });
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'New choice' }),
      { target: { value: 'NewChoice' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      await screen.findByText('Could not create that option'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'New choice' })).toHaveValue(
      'NewChoice',
    );
  });

  it('delegates creation to an external create flow when configured', () => {
    const onCreateNew = vi.fn();
    setup({ onCreateNew });

    fireEvent.change(screen.getByRole('combobox', { name: /Choice/ }), {
      target: { value: '_create' },
    });

    expect(onCreateNew).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox', { name: 'New choice' })).toBeNull();
  });
});
