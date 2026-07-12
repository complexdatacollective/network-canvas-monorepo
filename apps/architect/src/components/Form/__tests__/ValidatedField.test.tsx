import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type WrappedFieldProps,
} from 'redux-form';
import { describe, expect, it } from 'vitest';

import ValidatedField from '../ValidatedField';

const SimpleInput = ({ input }: WrappedFieldProps) => (
  <input {...input} aria-label="my field" />
);

const Fields = () => (
  <ValidatedField
    name="myField"
    component={SimpleInput}
    validation={{ required: true }}
  />
);

const FormHarness = reduxForm({ form: 'validated-field-test' })(Fields);

describe('ValidatedField', () => {
  it('renders the issue anchor before the field so trailing field margins are preserved', () => {
    const store = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    const { container } = render(
      <Provider store={store}>
        <FormHarness />
      </Provider>,
    );

    const anchor = container.querySelector('#field_myField__error');
    const input = screen.getByRole('textbox', { name: 'my field' });

    expect(anchor).not.toBeNull();
    if (!anchor) {
      throw new Error('issue anchor was not rendered');
    }
    expect(
      anchor.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
