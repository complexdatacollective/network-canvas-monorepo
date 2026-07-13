import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  Field,
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it } from 'vitest';

import ColorPicker from './ColorPicker';

type FormValues = { color?: string };

const Harness = (_props: InjectedFormProps<FormValues>) => (
  <Field
    name="color"
    component={ColorPicker}
    label="Node color"
    required
    options={[
      { label: 'Red', value: 'node-color-seq-1' },
      { label: 'Blue', value: 'node-color-seq-2' },
    ]}
  />
);

const ReduxHarness = reduxForm<FormValues>({
  form: 'color-picker-test',
})(Harness);

const setup = (initialColor = 'node-color-seq-1') => {
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <ReduxHarness initialValues={{ color: initialColor }} />
    </Provider>,
  );

  return {
    getColor: () =>
      store.getState().form['color-picker-test']?.values?.color as string,
    isTouched: () =>
      Boolean(
        store.getState().form['color-picker-test']?.fields?.color?.touched,
      ),
  };
};

describe('ColorPicker', () => {
  it('uses radio-group semantics and updates Redux Form', () => {
    const { getColor, isTouched } = setup();

    expect(
      screen.getByRole('radiogroup', { name: 'Node color' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Node color' }),
    ).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('radio', { name: 'Red' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));

    expect(getColor()).toBe('node-color-seq-2');
    expect(screen.getByRole('radio', { name: 'Blue' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.blur(screen.getByRole('radiogroup', { name: 'Node color' }));
    expect(isTouched()).toBe(true);
  });

  it('renders every generated palette color, including the final index', () => {
    const store = configureStore({ reducer: { form: formReducer } });
    const PaletteHarness = reduxForm<FormValues>({ form: 'palette-test' })(
      () => (
        <Field
          name="color"
          component={ColorPicker}
          label="Palette"
          palette="node-color-seq"
          paletteRange={3}
        />
      ),
    );

    render(
      <Provider store={store}>
        <PaletteHarness />
      </Provider>,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(
      screen.getByRole('radio', { name: 'node-color-seq-3' }),
    ).toBeInTheDocument();
  });
});
