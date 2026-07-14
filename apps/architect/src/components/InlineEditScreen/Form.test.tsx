import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { reducer as formReducer } from 'redux-form';
import { describe, expect, it } from 'vitest';

import Form from './Form';

describe('InlineEditScreen Form', () => {
  it('disables native validation so the redux-form/fresco pipeline runs on submit', () => {
    const store = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    const { container } = render(
      <Provider store={store}>
        <Form form="edit-item" id="edit-form">
          <input aria-label="field" required />
        </Form>
      </Provider>,
    );

    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute('novalidate');
  });
});
