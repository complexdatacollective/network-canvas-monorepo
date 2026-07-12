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

import FrescoReduxField, {
  reduxIntegerValue,
  reduxNumberValue,
} from '../FrescoReduxField';
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

  it('keeps a cleared number field null when blurred', () => {
    const { getValues, store } = setup({ quantity: 4 });
    const quantity = screen.getByRole('spinbutton', { name: 'Quantity' });

    fireEvent.change(quantity, { target: { value: '' } });
    expect(getValues().quantity).toBeNull();

    fireEvent.blur(quantity);

    expect(getValues().quantity).toBeNull();
    expect(
      store.getState().form['fresco-redux-field-test']?.fields?.quantity
        ?.touched,
    ).toBe(true);
  });
});

describe('reduxIntegerValue.toReduxValue', () => {
  const parse = reduxIntegerValue.toReduxValue;

  it('accepts exponent notation as its integer value', () => {
    expect(parse('1e3')).toBe(1000);
  });

  it('rejects mid-keystroke decimals rather than truncating', () => {
    expect(parse('12.7')).toBeNull();
  });

  it('rejects trailing non-numeric characters rather than truncating', () => {
    expect(parse('12px')).toBeNull();
  });

  it('accepts negative integers from strings and numbers', () => {
    expect(parse('-5')).toBe(-5);
    expect(parse(-5)).toBe(-5);
  });

  it('rejects non-integer and non-finite numbers on the fast path', () => {
    expect(parse(12.7)).toBeNull();
    expect(parse(Number.NaN)).toBeNull();
    expect(parse(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('treats empty and whitespace-only strings as cleared', () => {
    expect(parse('')).toBeNull();
    expect(parse('   ')).toBeNull();
  });
});

describe('reduxNumberValue.toReduxValue', () => {
  const parse = reduxNumberValue.toReduxValue;

  it('preserves decimals and exponent notation', () => {
    expect(parse('12.7')).toBe(12.7);
    expect(parse('1e3')).toBe(1000);
  });

  it('rejects NaN and non-finite numbers on the fast path', () => {
    expect(parse(Number.NaN)).toBeNull();
    expect(parse(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('treats empty and whitespace-only strings as cleared', () => {
    expect(parse('')).toBeNull();
    expect(parse('   ')).toBeNull();
  });
});
