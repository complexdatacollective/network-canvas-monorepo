import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { Provider } from 'react-redux';
import { Field, reducer as formReducer, reduxForm } from 'redux-form';
import { describe, expect, it } from 'vitest';

import RichTextField from './Field';

const ReduxRichTextField = RichTextField as ComponentType<
  Record<string, unknown>
>;

const Harness = reduxForm<{ prompt?: string }>({
  form: 'rich-text-field-test',
})(() => (
  <Field
    name="prompt"
    label="Prompt text"
    component={ReduxRichTextField}
    required
  />
));

describe('RichTextField', () => {
  it('forwards required semantics through the Redux field adapter', async () => {
    const store = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    render(
      <Provider store={store}>
        <Harness />
      </Provider>,
    );

    expect(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
    ).toHaveAttribute('aria-required', 'true');
  });
});
