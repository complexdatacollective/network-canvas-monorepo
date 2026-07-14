import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { Field, reducer as formReducer, reduxForm } from 'redux-form';
import { describe, expect, it } from 'vitest';

import IconPicker from './IconPicker';

const Harness = reduxForm<{ icon?: string }>({ form: 'icon-picker-test' })(
  () => <Field name="icon" component={IconPicker} label="Node icon" />,
);

describe('IconPicker', () => {
  it('uses shared field semantics and persists a searchable selection', async () => {
    const store = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    render(
      <Provider store={store}>
        <Harness initialValues={{ icon: 'Circle' }} />
      </Provider>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Node icon' });
    expect(trigger).toHaveTextContent('Circle');

    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'Circle' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.change(screen.getByPlaceholderText('Search icons…'), {
      target: { value: 'add-a-person' },
    });
    fireEvent.click(screen.getByRole('option', { name: /add-a-person/ }));

    await waitFor(() => {
      expect(store.getState().form['icon-picker-test']?.values?.icon).toBe(
        'add-a-person',
      );
    });
  });
});
