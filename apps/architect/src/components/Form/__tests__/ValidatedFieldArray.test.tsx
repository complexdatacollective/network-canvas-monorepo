import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type WrappedFieldArrayProps,
} from 'redux-form';
import { describe, expect, it } from 'vitest';

import ValidatedFieldArray from '../ValidatedFieldArray';

const ArrayComponent = (_props: WrappedFieldArrayProps) => (
  <button type="button" aria-label="array control" />
);

const Fields = () => (
  <ValidatedFieldArray
    name="items"
    component={ArrayComponent}
    validation={{ minSelected: 1 }}
  />
);

const FormHarness = reduxForm({ form: 'validated-field-array-test' })(Fields);

describe('ValidatedFieldArray', () => {
  it('renders the issue anchor before the field array so trailing margins are preserved', () => {
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

    const anchor = container.querySelector('#field_items__error');
    const control = screen.getByRole('button', { name: 'array control' });

    expect(anchor).not.toBeNull();
    if (!anchor) {
      throw new Error('issue anchor was not rendered');
    }
    expect(
      anchor.compareDocumentPosition(control) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
