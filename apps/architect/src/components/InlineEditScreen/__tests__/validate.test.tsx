import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { reducer as formReducer } from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

import validateEntityType from '~/components/TypeEditor/validateEntityType';

import InlineEditScreen from '../InlineEditScreen';

const renderScreen = (
  validate: (values: Record<string, unknown>) => Record<string, unknown>,
  initialValues: Record<string, unknown>,
) => {
  const onSubmit = vi.fn();
  const store = configureStore({
    reducer: { form: formReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });

  render(
    <Provider store={store}>
      <InlineEditScreen
        show
        form="TEST_FORM"
        onSubmit={onSubmit}
        onCancel={() => undefined}
        initialValues={initialValues}
        validate={validate}
      >
        <div>body</div>
      </InlineEditScreen>
    </Provider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Save and Close' }));

  return onSubmit;
};

// redux-form's isValid only inspects errors on registered fields, and the shape
// mapping is built from unconnected controls — so a per-field error alone lets
// the save through. These guard the form-level _error that actually blocks it.
describe('InlineEditScreen validation', () => {
  it('blocks the save when a breakpoint mapping has no thresholds', () => {
    const onSubmit = renderScreen(validateEntityType, {
      shape: {
        default: 'circle',
        dynamic: { variable: 'v1', type: 'breakpoints', thresholds: [] },
      },
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks the save when a shape mapping has no variable', () => {
    const onSubmit = renderScreen(validateEntityType, {
      shape: { default: 'circle', dynamic: {} },
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('saves when the shape mapping is complete', () => {
    const onSubmit = renderScreen(validateEntityType, {
      shape: {
        default: 'circle',
        dynamic: {
          variable: 'v1',
          type: 'breakpoints',
          thresholds: [{ value: 1, shape: 'square' }],
        },
      },
    });

    expect(onSubmit).toHaveBeenCalled();
  });
});
