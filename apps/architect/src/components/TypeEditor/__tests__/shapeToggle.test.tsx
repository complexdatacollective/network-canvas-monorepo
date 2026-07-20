import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import {
  formValueSelector,
  initialize,
  reducer as formReducer,
} from 'redux-form';
import { describe, expect, it } from 'vitest';

import ShapeVariableMapping from '../ShapeVariableMapping';

const FORM = 'TEST_FORM';

const MAPPING = {
  variable: 'v1',
  type: 'breakpoints',
  thresholds: [{ value: 1, shape: 'square' }],
};

const renderWithShape = (shape: Record<string, unknown>) => {
  const store = configureStore({
    reducer: {
      form: formReducer,
      activeProtocol: () => ({
        present: { codebook: { node: {}, edge: {} }, stages: [] },
      }),
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });

  store.dispatch(
    initialize(FORM, {
      variables: { v1: { name: 'age', type: 'number' } },
      shape,
    }),
  );

  render(
    <Provider store={store}>
      <ShapeVariableMapping form={FORM} />
    </Provider>,
  );

  return store;
};

describe('ShapeVariableMapping toggle', () => {
  it('turns shape mapping on', () => {
    const store = renderWithShape({ default: 'circle' });

    fireEvent.click(screen.getByLabelText('Map variable to shape'));

    expect(formValueSelector(FORM)(store.getState(), 'shape.dynamic')).toEqual(
      {},
    );
  });

  // redux-form only deletes a value whose `initial` counterpart is undefined,
  // so a mapping that came from the saved protocol could not be turned off.
  it('turns off a mapping that was loaded from the protocol', () => {
    const store = renderWithShape({ default: 'diamond', dynamic: MAPPING });

    fireEvent.click(screen.getByLabelText('Map variable to shape'));

    expect(
      formValueSelector(FORM)(store.getState(), 'shape.dynamic'),
    ).toBeUndefined();
  });

  it('keeps the default shape when turning a mapping off', () => {
    const store = renderWithShape({ default: 'diamond', dynamic: MAPPING });

    fireEvent.click(screen.getByLabelText('Map variable to shape'));

    expect(formValueSelector(FORM)(store.getState(), 'shape.default')).toBe(
      'diamond',
    );
  });
});
