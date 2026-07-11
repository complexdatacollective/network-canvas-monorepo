import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';

import FrescoReduxField, { reduxNumberValue } from '../FrescoReduxField';
import ValidatedField from '../ValidatedField';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;

type FormValues = {
  quantity?: number | null;
  title?: string;
};

const Harness = ({ handleSubmit }: InjectedFormProps<FormValues>) => (
  <form aria-label="Test form" onSubmit={handleSubmit(vi.fn())}>
    <ValidatedField
      name="title"
      label="Title"
      component={FrescoReduxField}
      componentProps={{ fieldComponent: FrescoInputField }}
      validation={{ required: true }}
    />
    <ValidatedField
      name="quantity"
      label="Quantity"
      component={FrescoReduxField}
      componentProps={{
        fieldComponent: FrescoInputField,
        type: 'number',
        ...reduxNumberValue,
      }}
      validation={{}}
    />
  </form>
);

const ReduxHarness = reduxForm<FormValues>({
  form: 'fresco-redux-field-test',
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

  const getValues = () =>
    store.getState().form['fresco-redux-field-test']?.values as FormValues;

  return { getValues, store };
};

describe('FrescoReduxField', () => {
  it('forwards required validation to the shared label and input semantics', () => {
    setup();
    const title = screen.getByRole('textbox', { name: /Title/ });

    expect(title).toHaveAttribute('aria-required', 'true');
    expect(title).toBeRequired();

    fireEvent.submit(screen.getByRole('form', { name: 'Test form' }));

    expect(screen.getByText('Required', { selector: 'p' })).toBeInTheDocument();
    expect(title).toHaveAttribute('aria-invalid', 'true');
  });

  it('maps string controls to Redux values and owns blur metadata', () => {
    const { getValues, store } = setup();
    const title = screen.getByRole('textbox', { name: /Title/ });

    fireEvent.change(title, { target: { value: 'Updated title' } });
    fireEvent.blur(title);

    expect(getValues().title).toBe('Updated title');
    expect(
      store.getState().form['fresco-redux-field-test']?.fields?.title?.touched,
    ).toBe(true);
  });

  it('preserves decimal input and normalizes clearing to the protocol contract', () => {
    const { getValues } = setup({ quantity: 4 });
    const quantity = screen.getByRole('spinbutton', { name: 'Quantity' });

    expect(quantity).toHaveValue(4);

    fireEvent.change(quantity, { target: { value: '12.5' } });
    expect(getValues().quantity).toBe(12.5);

    fireEvent.change(quantity, { target: { value: '' } });
    expect(getValues().quantity).toBeNull();
  });
});
