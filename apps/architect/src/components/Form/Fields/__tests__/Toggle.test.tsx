import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { Provider } from 'react-redux';
import {
  Field,
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it } from 'vitest';

import Toggle from '../Toggle';

type FormValues = { enabled?: boolean };

const validateEnabled = (value: boolean | undefined) =>
  value ? undefined : 'Enable this setting';

const Harness = ({ handleSubmit }: InjectedFormProps<FormValues>) => (
  <form onSubmit={handleSubmit(() => undefined)}>
    <Field
      name="enabled"
      label="Enable setting"
      component={Toggle as ComponentType<Record<string, unknown>>}
      validate={validateEnabled}
    />
  </form>
);

const ReduxHarness = reduxForm<FormValues>({
  form: 'toggle-test',
  touchOnBlur: true,
  touchOnChange: false,
})(Harness);

const setup = (initialValues: FormValues = {}) => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <ReduxHarness initialValues={initialValues} />
    </Provider>,
  );

  const getForm = () => store.getState().form['toggle-test'];
  return { getForm };
};

describe('Toggle Redux adapter', () => {
  it('initializes a missing Redux value to false exactly once', async () => {
    const { getForm } = setup();

    await waitFor(() => expect(getForm()?.values?.enabled).toBe(false));
    expect(
      screen.getByRole('switch', { name: 'Enable setting' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('preserves true and writes subsequent toggle operations', () => {
    const { getForm } = setup({ enabled: true });
    const toggle = screen.getByRole('switch', { name: 'Enable setting' });

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(getForm()?.values?.enabled).toBe(false);
  });

  it('uses shared blur/error semantics', () => {
    setup({ enabled: false });
    const toggle = screen.getByRole('switch', { name: 'Enable setting' });

    fireEvent.focus(toggle);
    fireEvent.blur(toggle);

    expect(screen.getByText('Enable this setting')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-invalid', 'true');
  });
});
